# S3 Config Initializer Feature

## Overview

The S3 Config Initializer is a feature that enables automatic generation and upload of default LZA (Landing Zone Accelerator) configuration files to S3 during container-based deployments. This eliminates the need for manual configuration file creation when bootstrapping a new LZA deployment.

## Problem Statement

Previously, when deploying LZA via the container installer, users had to:
1. Manually create all 6 LZA configuration files (global-config.yaml, accounts-config.yaml, etc.)
2. Upload them to the S3 config bucket before running the pipeline
3. Ensure the configuration was valid and complete

This created friction for new deployments and increased the chance of configuration errors.

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Container Installer Stack                         │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │  CloudFormation  │───▶│  ECS Task Def    │                       │
│  │   Parameters     │    │  (Environment    │                       │
│  │                  │    │   Variables)     │                       │
│  │ - Account Emails │    │                  │                       │
│  │ - Control Tower  │    │ - CONFIG_S3_PATH │                       │
│  │ - Config Bucket  │    │ - Account Emails │                       │
│  └──────────────────┘    │ - CT Enabled     │                       │
│                          └────────┬─────────┘                       │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ECS Fargate Task                             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      run-lza.sh                               │   │
│  │                                                               │   │
│  │  1. Check CONFIG_S3_PATH environment variable                 │   │
│  │  2. Run init-config CLI                                       │   │
│  │     ├─ Check if config exists at S3 path                      │   │
│  │     ├─ If exists: Skip (idempotent)                           │   │
│  │     └─ If not exists:                                         │   │
│  │        ├─ Generate default configs                            │   │
│  │        ├─ Create zip archive                                  │   │
│  │        └─ Upload to S3                                        │   │
│  │  3. Download config from S3                                   │   │
│  │  4. Execute run-pipeline.sh                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           S3 Bucket                                  │
│                                                                      │
│  s3://{config-bucket}/lza/aws-accelerator-config.zip                │
│  └── Contains:                                                       │
│      ├── global-config.yaml                                         │
│      ├── accounts-config.yaml                                       │
│      ├── iam-config.yaml                                            │
│      ├── network-config.yaml                                        │
│      ├── organization-config.yaml                                   │
│      └── security-config.yaml                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. init-config CLI (`bin/init-config.ts`)

A TypeScript CLI that handles configuration initialization:

```typescript
// Location: source/packages/@aws-accelerator/accelerator/bin/init-config.ts
```

**Responsibilities:**
- Read environment variables for configuration
- Check if config already exists at S3 path (idempotent)
- Generate default LZA configuration files
- Create zip archive of config files
- Upload to S3

### 2. run-lza.sh Script

Entry point script for container deployments:

```bash
# Location: deployment/container/scripts/run-lza.sh
```

**Responsibilities:**
- Orchestrate config initialization before pipeline execution
- Handle environment variable setup
- Invoke init-config CLI
- Download config from S3
- Execute run-pipeline.sh

### 3. Shared Config Generation Functions

Reusable functions extracted from ConfigRepository:

```typescript
// Location: source/packages/@aws-accelerator/accelerator/lib/config-repository.ts

// Generate config files without CDK context
export function generateConfigFiles(props: GenerateConfigFilesProps): GenerateConfigFilesResult;

// Create zip archive from config files
export function createConfigZipArchive(tempDirPath: string): string;
```

### 4. S3ConfigManager Class

Handles S3 operations for config management:

```typescript
// Location: source/packages/@aws-accelerator/accelerator/lib/s3-config-manager.ts

export class S3ConfigManager {
  configExists(): Promise<boolean>;
  upload(zipFilePath: string): Promise<void>;
  getPathComponents(): { bucket: string; key: string };
}
```

## Environment Variables

The following environment variables are used by the S3 Config Initializer:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CONFIG_S3_PATH` | Yes | Full S3 path for config zip | `s3://my-bucket/lza/aws-accelerator-config.zip` |
| `MANAGEMENT_ACCOUNT_EMAIL` | Yes | Email for management account | `management@example.com` |
| `LOG_ARCHIVE_ACCOUNT_EMAIL` | Yes | Email for log archive account | `logarchive@example.com` |
| `AUDIT_ACCOUNT_EMAIL` | Yes | Email for audit account | `audit@example.com` |
| `AWS_REGION` | Yes | AWS region for deployment | `us-east-1` |
| `CONTROL_TOWER_ENABLED` | No | Enable Control Tower (default: Yes) | `Yes` or `No` |
| `SINGLE_ACCOUNT_MODE` | No | Enable single account mode (default: false) | `true` or `false` |

## Configuration Files Generated

The initializer generates 6 default LZA configuration files:

| File | Description |
|------|-------------|
| `global-config.yaml` | Home region, Control Tower settings, management role |
| `accounts-config.yaml` | Management, LogArchive, Audit account emails |
| `iam-config.yaml` | Default empty IAM configuration |
| `network-config.yaml` | Default empty network configuration |
| `organization-config.yaml` | OU structure (varies by single-account mode) |
| `security-config.yaml` | Default empty security configuration |

### Control Tower Configuration

When `CONTROL_TOWER_ENABLED=Yes`:
```yaml
# global-config.yaml
controlTower:
  enable: true
managementAccountAccessRole: AWSControlTowerExecution
```

When `CONTROL_TOWER_ENABLED=No`:
```yaml
# global-config.yaml
controlTower:
  enable: false
managementAccountAccessRole: OrganizationAccountAccessRole
```

### Single Account Mode

When `SINGLE_ACCOUNT_MODE=true`:
```yaml
# organization-config.yaml
enable: false
organizationalUnits:
  - name: Security
  - name: LogArchive
```

## Integration with Container Installer

The container installer stack (`installer-container-stack.ts`) automatically configures the ECS task with the required environment variables:

```typescript
// Task Definition environment variables
environment: [
  { name: 'CONFIG_S3_PATH', value: `s3://${configBucket}/lza/aws-accelerator-config.zip` },
  { name: 'MANAGEMENT_ACCOUNT_EMAIL', value: managementAccountEmail },
  { name: 'LOG_ARCHIVE_ACCOUNT_EMAIL', value: logArchiveAccountEmail },
  { name: 'AUDIT_ACCOUNT_EMAIL', value: auditAccountEmail },
  { name: 'CONTROL_TOWER_ENABLED', value: controlTowerEnabled },
  // ... other variables
]
```

The `CONFIG_S3_PATH` is automatically constructed based on:
- If `UseExistingConfig=Yes`: Uses `ExistingConfigBucketName` parameter
- If `UseExistingConfig=No`: Uses the solution-created config bucket

## Idempotent Behavior

The S3 Config Initializer is designed to be idempotent:

1. **First Run**: If no config exists at `CONFIG_S3_PATH`, generates and uploads default configs
2. **Subsequent Runs**: If config already exists, skips generation and uses existing config

This ensures:
- Safe re-runs of the deployment
- No accidental overwriting of customized configurations
- Consistent behavior across deployments

## Troubleshooting

### Common Issues

#### 1. Missing Environment Variables

**Symptom:** Error message listing missing required variables

**Solution:** Ensure all required environment variables are set in the ECS task definition

#### 2. S3 Permission Denied

**Symptom:** Error uploading config to S3

**Solution:** Verify the ECS task role has `s3:PutObject` permission on the config bucket

#### 3. Config Already Exists

**Symptom:** Log message "Configuration already exists at S3 path, skipping generation"

**This is expected behavior.** The initializer is idempotent and won't overwrite existing configs.

#### 4. Invalid S3 Path Format

**Symptom:** Error parsing S3 path

**Solution:** Ensure `CONFIG_S3_PATH` follows format: `s3://bucket-name/path/to/config.zip`

### Debugging

Enable verbose logging by checking ECS task logs in CloudWatch:

```
/ecs/{prefix}-lza-deployment
```

Look for:
- "Phase 1: Configuration Initialization" - init-config execution
- "Configuration already exists" - idempotent skip
- "Configuration initialization completed" - successful generation

## Testing

The feature includes comprehensive property-based tests:

```bash
# Run tests
cd source/packages/@aws-accelerator/accelerator
npx vitest run test/config-repository.test.ts test/s3-config-manager.test.ts test/init-config.test.ts
```

### Property Tests

| Property | Description |
|----------|-------------|
| Property 1 | Idempotent Config Creation |
| Property 2 | Config Generation Completeness |
| Property 3 | Control Tower Enabled Configuration |
| Property 4 | Control Tower Disabled Configuration |
| Property 5 | Single Account Mode Organization Config |
| Property 6 | Multi-Account Mode Organization Config |
| Property 7 | YAML Round-Trip Consistency |
| Property 8 | Zip Archive Completeness |

## Design Principles

### Single Source of Truth

The config generation logic exists in one place (`generateConfigFiles()`) and is used by:
- CDK `ConfigRepository` construct
- CLI `init-config` utility

This ensures consistency and prevents drift between different usage paths.

### Backward Compatibility

- `run-pipeline.sh` remains unchanged for legacy deployments
- `run-lza.sh` is the new entry point for container deployments
- Existing `ConfigRepository` API is preserved

## Related Files

```
source/packages/@aws-accelerator/accelerator/
├── bin/
│   └── init-config.ts              # CLI entry point
├── lib/
│   ├── config-repository.ts        # Shared config generation functions
│   └── s3-config-manager.ts        # S3 operations
└── test/
    ├── config-repository.test.ts   # Property tests for config generation
    ├── s3-config-manager.test.ts   # S3 manager tests
    └── init-config.test.ts         # CLI tests

deployment/container/scripts/
├── run-lza.sh                      # New entry point with init-config
└── run-pipeline.sh                 # Original pipeline script

source/packages/@aws-accelerator/installer-container/
├── lib/
│   └── installer-container-stack.ts # ECS task definition with env vars
└── docs/
    └── s3-config-initializer.md    # This documentation
```

## Future Enhancements

Potential future improvements:
- Support for custom config templates
- Config validation before upload
- Config diff/merge capabilities
- Support for config versioning
