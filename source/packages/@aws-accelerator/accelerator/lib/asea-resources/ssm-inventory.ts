import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { AseaResourceType, CfnResourceType } from '@aws-accelerator/config';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';

const enum RESOURCE_TYPE {
  RESOURCE_DATA_SYNC = 'AWS::SSM::ResourceDataSync',
  SSM_ASSOCIATION = 'AWS::SSM::Association',
}

const ASEA_PHASE_NUMBER = '2';

export class SsmInventory extends AseaResource {
  readonly props: AseaResourceProps;
  constructor(scope: ImportAseaResourcesStack, ssmInventoryProps: AseaResourceProps) {
    super(scope, ssmInventoryProps);
    this.props = ssmInventoryProps;
    if (ssmInventoryProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      // Skip Non-Phase 2 resource stacks
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.RESOURCE_DATA_SYNC}s or ${RESOURCE_TYPE.SSM_ASSOCIATION}s to handle in stack ${ssmInventoryProps.stackInfo.stackName}`,
      );
      return;
    }

    const existingResourceDataSyncs = this.scope.importStackResources.getResourcesByType(
      RESOURCE_TYPE.RESOURCE_DATA_SYNC,
    );
    const existingSSMAssociations = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE.SSM_ASSOCIATION);

    if (existingResourceDataSyncs.length === 0 && existingSSMAssociations.length === 0) {
      //Return if no existing Resource Data Syncs or existing SSM Associations found in Resource Mapping
      return;
    }

    this.processExistingResourceDataSync(existingResourceDataSyncs);
    this.processExistingSSMAssociation(existingSSMAssociations);
  }

  private processExistingResourceDataSync(existingResourceDataSyncs: CfnResourceType[]) {
    for (const existingResourceDataSync of existingResourceDataSyncs) {
      if (!existingResourceDataSync.physicalResourceId) {
        continue;
      }
      const resourceDataSync = this.scope.getResource(
        existingResourceDataSync.logicalResourceId,
      ) as ssm.CfnResourceDataSync;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(resourceDataSync.syncName)}ResourceDataSync`),
        parameterName: this.scope.getSsmPath(SsmResourceType.RESOURCE_DATA_SYNC, [resourceDataSync.syncName]),
        stringValue: existingResourceDataSync.physicalResourceId,
      });
      this.scope.addAseaResource(AseaResourceType.SSM_RESOURCE_DATA_SYNC, `${resourceDataSync.syncName}`);
    }
  }

  private processExistingSSMAssociation(existingSSMAssociations: CfnResourceType[]) {
    for (const existingSSMAssociation of existingSSMAssociations) {
      if (!existingSSMAssociation.physicalResourceId) {
        continue;
      }
      const association = this.scope.getResource(existingSSMAssociation.logicalResourceId) as ssm.CfnAssociation;
      this.scope.addAseaResource(AseaResourceType.SSM_ASSOCIATION, `${association.associationName}`);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(association.associationName!)}`),
        parameterName: this.scope.getSsmPath(SsmResourceType.ASSOCIATION, [association.associationName!]),
        stringValue: existingSSMAssociation.physicalResourceId,
      });
    }
  }
}
