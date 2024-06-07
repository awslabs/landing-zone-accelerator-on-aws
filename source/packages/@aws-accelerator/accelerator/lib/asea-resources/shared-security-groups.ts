import { AseaResourceType, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { AseaResource, AseaResourceProps } from './resource';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';

const enum RESOURCE_TYPE {
  SECURITY_GROUP = 'AWS::EC2::SecurityGroup',
}

const ASEA_PHASE_NUMBER = '2';

export class SharedSecurityGroups extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.SECURITY_GROUP}s to handle in stack ${props.stackInfo.stackName}`,
      );
      return;
    }
    const vpcsInScope = this.scope.sharedVpcs;
    this.updateSecurityGroups(vpcsInScope);
  }
  private updateSecurityGroups(vpcItems: (VpcConfig | VpcTemplatesConfig)[]) {
    if (vpcItems.length === 0) {
      return;
    }
    for (const vpcItem of vpcItems) {
      const vpcStackInfo = this.getSecurityGroupResourceByVpc(vpcItem.name);
      if (!vpcStackInfo) {
        continue;
      }
      for (const securityGroupItem of vpcItem.securityGroups ?? []) {
        const securityGroupResource = vpcStackInfo.nestedStackResources.getResourceByTag(securityGroupItem.name);
        if (!securityGroupResource) {
          continue;
        }
        const securityGroup = vpcStackInfo.nestedStack.includedTemplate.getResource(
          securityGroupResource.logicalResourceId,
        );
        this.scope.addSsmParameter({
          logicalId: pascalCase(
            `SsmParam${pascalCase(vpcItem.name) + pascalCase(securityGroupItem.name)}SecurityGroup`,
          ),
          parameterName: this.scope.getSsmPath(SsmResourceType.SECURITY_GROUP, [vpcItem.name, securityGroupItem.name]),
          stringValue: securityGroup.ref,
          scope: vpcStackInfo.stackKey,
        });
        this.scope.addAseaResource(AseaResourceType.EC2_SECURITY_GROUP, `${vpcItem.name}/${securityGroupItem.name}`);
      }
    }
  }
  private getSecurityGroupResourceByVpc(vpcName: string) {
    for (const [, nestedStackResources] of Object.entries(this.scope.nestedStackResources ?? {})) {
      const stackKey = nestedStackResources.getStackKey();
      const nestedStack = this.scope.nestedStacks[stackKey];
      const securityGroups = nestedStackResources.getResourcesByType(RESOURCE_TYPE.SECURITY_GROUP);
      if (!securityGroups) continue;
      if (vpcName.endsWith('_vpc')) vpcName = vpcName.split('_vpc')[0];
      if (nestedStack.stack['_stackName'].includes(`SecurityGroups${vpcName}Shared`)) {
        return { nestedStack, nestedStackResources, stackKey };
      }
    }
    return;
  }
}
