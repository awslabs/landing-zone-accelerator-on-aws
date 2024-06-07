import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { AseaResourceType } from '@aws-accelerator/config';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';

const enum RESOURCE_TYPE {
  PEERING_CONNECTION = 'AWS::EC2::VPCPeeringConnection',
}
const ASEA_PHASE_NUMBER = '2';

export class VpcPeeringConnection extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.PEERING_CONNECTION}s to handle in stack ${props.stackInfo.stackName}`,
      );
      return;
    }
    if (!props.networkConfig.vpcPeering) {
      return;
    }
    for (const peering of props.networkConfig.vpcPeering) {
      const peeringConnectionResource = this.scope.importStackResources.getResourceByTypeAndTag(
        RESOURCE_TYPE.PEERING_CONNECTION,
        peering.name,
      );
      if (!peeringConnectionResource) continue;
      const peeringConnection = this.stack.getResource(peeringConnectionResource.logicalResourceId);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(peering.name)}VpcPeering`),
        parameterName: this.scope.getSsmPath(SsmResourceType.VPC_PEERING, [peering.name]),
        stringValue: peeringConnection.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_VPC_PEERING, peering.name);
    }
  }
}
