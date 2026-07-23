# Problema de Loop de Retroalimentación en CloudTrail con S3 Data Events

## Descripción del Problema

Cuando Landing Zone Accelerator (LZA) despliega un Organization Trail con `s3DataEvents: true`, se configura un Event Selector que captura **todos** los eventos de datos S3 en **todos** los buckets:

```yaml
# global-config.yaml
logging:
  cloudtrail:
    enable: true
    organizationTrail: true
    organizationTrailSettings:
      s3DataEvents: true  # ← Causa del problema
```

Esto genera un **loop de retroalimentación infinito**:

1. CloudTrail escribe un archivo de log en el bucket central de logs (`aws-accelerator-central-logs-<account>-<region>`)
2. Esa escritura (PutObject) genera un evento de datos S3
3. CloudTrail captura ese evento y escribe otro archivo de log en el mismo bucket
4. El ciclo se repite indefinidamente

### Impacto

- Crecimiento exponencial de objetos en el bucket de logs
- Aumento continuo de costos de CloudTrail y S3
- Degradación de la relación señal/ruido en los logs de auditoría

### Causa Raíz en el Código

El código de LZA en `organizations-stack.ts` configura el Event Selector para **todos** los buckets S3 sin exclusión:

```typescript
// source/packages/@aws-accelerator/accelerator/lib/stacks/organizations-stack.ts (línea ~914)
if (this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.s3DataEvents ?? true) {
  organizationsTrail.addEventSelector(
    cdk.aws_cloudtrail.DataResourceType.S3_OBJECT,
    [`arn:${cdk.Stack.of(this).partition}:s3:::`],  // TODOS los buckets, sin exclusión
    {
      includeManagementEvents: false,
    },
  );
}
```

El recurso resultante en CloudFormation usa `EventSelectors` (selectores básicos), que **no soportan exclusiones de buckets**. Para excluir un bucket se requieren `AdvancedEventSelectors`.

---

## Solución Implementada

La solución consiste en tres pasos:

### Paso 1: Deshabilitar los Data Events en la configuración de LZA

Editar `global-config.yaml` en el repositorio `aws-accelerator-config`:

```yaml
logging:
  cloudtrail:
    enable: true
    organizationTrail: true
    organizationTrailSettings:
      multiRegionTrail: true
      globalServiceEvents: true
      managementEvents: true
      s3DataEvents: false      # ← Deshabilitado - se gestiona manualmente con exclusiones
      lambdaDataEvents: false  # ← Deshabilitado - se gestiona manualmente via Advanced Event Selectors
      sendToCloudWatchLogs: true
      apiErrorRateInsight: false
      apiCallRateInsight: false
```

Ejecutar el pipeline de LZA para que CloudFormation elimine los Event Selectors de datos del template.

### Paso 2: Aplicar Stack Policy para proteger el recurso del Trail

Esto evita que futuras ejecuciones del pipeline de LZA sobrescriban la configuración manual del trail:

```bash
aws cloudformation set-stack-policy \
  --stack-name AWSAccelerator-OrganizationsStack-<ACCOUNT_ID>-<REGION> \
  --stack-policy-body '{
    "Statement": [
      {
        "Effect": "Deny",
        "Action": "Update:*",
        "Principal": "*",
        "Resource": "LogicalResourceId/OrganizationsCloudTrailBED259DC"
      },
      {
        "Effect": "Allow",
        "Action": "Update:*",
        "Principal": "*",
        "Resource": "*"
      }
    ]
  }' \
  --region <REGION>
```

> **Nota:** Si en el futuro necesitas actualizar otras propiedades del trail via LZA, deberás usar `--stack-policy-during-update-body` para permitir temporalmente la actualización.

### Paso 3: Aplicar Advanced Event Selectors con la exclusión del bucket

Los Advanced Event Selectors soportan la condición `NotStartsWith`, que permite excluir el bucket destino del trail:

```bash
aws cloudtrail put-event-selectors \
  --trail-name AWSAccelerator-Organizations-CloudTrail \
  --advanced-event-selectors '[
    {
      "Name": "Management events",
      "FieldSelectors": [
        {"Field": "eventCategory", "Equals": ["Management"]}
      ]
    },
    {
      "Name": "S3 data events excluding central logs bucket",
      "FieldSelectors": [
        {"Field": "eventCategory", "Equals": ["Data"]},
        {"Field": "resources.type", "Equals": ["AWS::S3::Object"]},
        {"Field": "resources.ARN", "NotStartsWith": ["arn:aws:s3:::aws-accelerator-central-logs-<ACCOUNT_ID>-<REGION>/"]}
      ]
    },
    {
      "Name": "Lambda data events",
      "FieldSelectors": [
        {"Field": "eventCategory", "Equals": ["Data"]},
        {"Field": "resources.type", "Equals": ["AWS::Lambda::Function"]}
      ]
    }
  ]' \
  --region <REGION>
```

Reemplazar `<ACCOUNT_ID>` con el ID de la cuenta del Log Archive y `<REGION>` con la región correspondiente.

---

## Verificación

### Confirmar que los Advanced Event Selectors están activos

```bash
aws cloudtrail get-event-selectors \
  --trail-name AWSAccelerator-Organizations-CloudTrail \
  --region <REGION>
```

La respuesta debe mostrar `AdvancedEventSelectors` (no `EventSelectors`) con la exclusión del bucket.

### Confirmar que la Stack Policy protege el trail

```bash
aws cloudformation get-stack-policy \
  --stack-name AWSAccelerator-OrganizationsStack-<ACCOUNT_ID>-<REGION> \
  --region <REGION>
```

### Confirmar que el pipeline no revierte los cambios

Ejecutar el pipeline manualmente y verificar que los Advanced Event Selectors persisten:

```bash
# Ejecutar pipeline
aws codepipeline start-pipeline-execution \
  --name AWSAccelerator-Pipeline \
  --region <REGION>

# Después de que complete, verificar
aws cloudtrail get-event-selectors \
  --trail-name AWSAccelerator-Organizations-CloudTrail \
  --region <REGION>
```

---

## Consideraciones

1. **Stack Policy:** La política de stack impide **cualquier** actualización al recurso del trail desde CloudFormation. Si necesitas modificar el trail (por ejemplo, habilitar Insights), debes temporalmente sobrescribir la política durante el update.

2. **Actualizaciones de LZA:** Al actualizar la versión de LZA, verificar si la nueva versión soporta Advanced Event Selectors o exclusiones de buckets de forma nativa. De ser así, se puede remover la stack policy y migrar a la configuración declarativa.

3. **Múltiples regiones:** Si el trail es multi-región, la configuración de event selectors se aplica globalmente desde la región home (us-east-1 en este caso).

4. **Solución definitiva:** Lo ideal es contribuir un fix al código de LZA que use Advanced Event Selectors con exclusión automática del bucket destino cuando `s3DataEvents: true`.
