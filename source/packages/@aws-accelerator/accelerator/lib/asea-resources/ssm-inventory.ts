import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { AseaResourceType } from '@aws-accelerator/config';
import { CfnResourceType } from '@aws-accelerator/config';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';

const enum RESOURCE_TYPE {
  RESOURCE_DATA_SYNC = 'AWS::SSM::ResourceDataSync',
  SSM_ASSOCIATION = 'AWS::SSM::Association',
}

const ASEA_PHASE_NUMBER = 2;

export class SsmInventory extends AseaResource {
  private readonly props: AseaResourceProps;
  private ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];
  constructor(scope: ImportAseaResourcesStack, ssmInventoryProps: AseaResourceProps) {
    super(scope, ssmInventoryProps);
    this.props = ssmInventoryProps;
    this.ssmParameters = [];
    if (ssmInventoryProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      // Skip Non-Phase 2 resource stacks
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.RESOURCE_DATA_SYNC}s or ${RESOURCE_TYPE.SSM_ASSOCIATION}s to handle in stack ${ssmInventoryProps.stackInfo.stackName}`,
      );
      return;
    }

    const existingResourceDataSyncs = this.getExistingResourceDataSync(ssmInventoryProps);
    const existingSSMAssociations = this.getExistingSSMAssociation(ssmInventoryProps);

    if (existingResourceDataSyncs.length === 0 && existingSSMAssociations.length === 0) {
      //Return if no existing Resource Data Syncs or existing SSM Associations found in Resource Mapping
      return;
    }

    this.processExistingResourceDataSync(existingResourceDataSyncs);
    this.processExistingSSMAssociation(existingSSMAssociations);
    this.createSsmParameters();
  }

  private getExistingSSMAssociation(ssmInventoryProps: AseaResourceProps) {
    const existingSSMAssociation = this.filterResourcesByType(
      ssmInventoryProps.stackInfo.resources,
      RESOURCE_TYPE.SSM_ASSOCIATION,
    );

    return existingSSMAssociation;
  }

  private getExistingResourceDataSync(ssmInventoryProps: AseaResourceProps) {
    const existingResourceDataSync = this.filterResourcesByType(
      ssmInventoryProps.stackInfo.resources,
      RESOURCE_TYPE.RESOURCE_DATA_SYNC,
    );
    return existingResourceDataSync;
  }

  private processExistingResourceDataSync(existingResourceDataSyncs: CfnResourceType[]) {
    for (const existingResourceDataSync of existingResourceDataSyncs) {
      const resourceDataSync = this.stack.getResource(
        existingResourceDataSync.logicalResourceId,
      ) as ssm.CfnResourceDataSync;

      this.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(resourceDataSync.syncName)}ResourceDataSync`),
        parameterName: this.scope.getSsmPath(SsmResourceType.RESOURCE_DATA_SYNC, [resourceDataSync.syncName]),
        stringValue: existingResourceDataSync.physicalResourceId,
      });
      this.scope.addAseaResource(AseaResourceType.SSM_RESOURCE_DATA_SYNC, `${resourceDataSync.syncName}`);
    }
  }

  private processExistingSSMAssociation(existingSSMAssocations: CfnResourceType[]) {
    for (const existingSSMAssociation of existingSSMAssocations) {
      const association = this.stack.getResource(existingSSMAssociation.logicalResourceId) as ssm.CfnAssociation;
      this.scope.addAseaResource(AseaResourceType.SSM_ASSOCIATION, `${association.associationName}`);
      this.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(association.associationName!)}`),
        parameterName: this.scope.getSsmPath(SsmResourceType.ASSOCIATION, [association.associationName!]),
        stringValue: existingSSMAssociation.physicalResourceId,
      });
    }
  }

  private createSsmParameters(): void {
    let index = 1;
    const parameterMap = new Map<number, cdk.aws_ssm.StringParameter>();

    for (const parameterItem of this.ssmParameters) {
      // Create parameter
      const parameter = new cdk.aws_ssm.StringParameter(this.scope, parameterItem.logicalId, {
        parameterName: parameterItem.parameterName,
        stringValue: parameterItem.stringValue,
      });
      parameterMap.set(index, parameter);

      // Add a dependency for every 5 parameters
      if (index > 5) {
        const dependsOnParam = parameterMap.get(index - (index % 5));
        if (!dependsOnParam) {
          this.scope.addLogs(
            LogLevel.INFO,
            `No ${RESOURCE_TYPE.SSM_ASSOCIATION}s to handle in stack ${this.props.stackInfo.stackName}`,
          );
          throw new Error(`Configuration validation failed at runtime.`);
        }
        parameter.node.addDependency(dependsOnParam);
      }
      // Increment index
      index += 1;
    }
  }

  private addSsmParameter(props: { logicalId: string; parameterName: string; stringValue: string }) {
    this.ssmParameters.push({
      logicalId: props.logicalId,
      parameterName: props.parameterName,
      stringValue: props.stringValue,
    });
  }
}
