import { AseaResourceType, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { AseaResource, AseaResourceProps } from './resource';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AcceleratorStage } from '../accelerator-stage';
import { pascalCase } from 'pascal-case';

const enum RESOURCE_TYPE {
  SECURITY_GROUP = 'AWS::EC2::SecurityGroup',
  SECURITY_GROUP_EGRESS = 'AWS::EC2::SecurityGroupEgress',
  SECURITY_GROUP_INGRESS = 'AWS::EC2::SecurityGroupIngress',
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
    if (this.props.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES) {
      this.deleteSharedSecurityGroups(vpcsInScope);
    }
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
    if (vpcName.includes('_vpc')) {
      vpcName = vpcName.replace('_vpc', '');
    }
    for (const [, nestedStackResources] of Object.entries(this.scope.nestedStackResources ?? {})) {
      const stackKey = nestedStackResources.getStackKey();
      const nestedStack = this.scope.nestedStacks[stackKey];
      const securityGroups = nestedStackResources.getResourcesByType(RESOURCE_TYPE.SECURITY_GROUP);
      if (!securityGroups) continue;
      // Find match by security group description as defined in ASEA
      //       const groupDescription = isUpdateDescription
      //  ? `${sharedAccountKey || accountKey} ${vpcName} Security Group`
      const securityGroupMatch = securityGroups.filter(securityGroup => {
        const description = securityGroup.resourceMetadata['Properties']['GroupDescription'];
        if (!description) {
          return false;
        }
        const descriptionWords = description.split(' ');
        return descriptionWords.includes(vpcName);
      });
      if (securityGroupMatch && securityGroupMatch.length > 0) {
        return { nestedStack, nestedStackResources, stackKey };
      }
    }
    this.scope.addLogs(LogLevel.WARN, `Could not find nested stack for ${vpcName}`);
    return;
  }

  private deleteSharedSecurityGroups(vpcItems: (VpcConfig | VpcTemplatesConfig)[]) {
    if (vpcItems.length === 0) {
      return;
    }
    for (const vpcItem of vpcItems) {
      const vpcStackInfo = this.getSecurityGroupResourceByVpc(vpcItem.name);
      if (!vpcStackInfo) {
        continue;
      }
      const existingSecurityGroups = vpcStackInfo.nestedStackResources.getResourcesByType(RESOURCE_TYPE.SECURITY_GROUP);

      const existingSecurityGroupIngressRules = vpcStackInfo.nestedStackResources.getResourcesByType(
        RESOURCE_TYPE.SECURITY_GROUP_INGRESS,
      );
      const existingSecurityGroupEgressRules = vpcStackInfo.nestedStackResources.getResourcesByType(
        RESOURCE_TYPE.SECURITY_GROUP_EGRESS,
      );

      for (const existingSecurityGroup of existingSecurityGroups) {
        const existingSecurityGroupName = existingSecurityGroup.resourceMetadata['Properties']['GroupName'];
        const securityGroupConfig = vpcItem.securityGroups?.find(
          (securityGroupItem: { name: string }) => securityGroupItem.name === existingSecurityGroupName,
        );
        // if the security group is still configured skip
        if (securityGroupConfig) continue;

        // lookup security group by tag name
        // if unable to locate, warn and then skip
        const securityGroupResource = vpcStackInfo.nestedStackResources.getResourceByTag(existingSecurityGroupName);
        if (!securityGroupResource) {
          this.scope.addLogs(
            LogLevel.WARN,
            `Could not locate shared security group resouce by tag name : ${existingSecurityGroupName}, for vpc ${vpcItem.name}`,
          );
          continue;
        }

        // remove security group from template
        this.scope.addLogs(LogLevel.WARN, `Deleting Shared Security Group: ${existingSecurityGroup.logicalResourceId}`);
        this.scope.addDeleteFlagForNestedResource(
          vpcStackInfo.nestedStackResources.getStackKey(),
          securityGroupResource.logicalResourceId,
        );

        const ssmResource = vpcStackInfo.nestedStackResources.getSSMParameterByName(
          this.scope.getSsmPath(SsmResourceType.SECURITY_GROUP, [
            vpcItem.name,
            existingSecurityGroup.resourceMetadata['Properties'].GroupName,
          ]),
        );
        if (ssmResource) {
          this.scope.addLogs(LogLevel.WARN, `Deleting SSM Parameter: ${ssmResource.logicalResourceId}`);
          this.scope.addDeleteFlagForNestedResource(
            vpcStackInfo.nestedStackResources.getStackKey(),
            ssmResource.logicalResourceId,
          );
        }

        for (const ingressRule of existingSecurityGroupIngressRules) {
          try {
            if (ingressRule.resourceMetadata['Properties'].GroupId['Ref'] === existingSecurityGroup.logicalResourceId) {
              this.scope.addLogs(LogLevel.WARN, `Deleting Ingress Rule: ${ingressRule.logicalResourceId}`);
              this.scope.addDeleteFlagForNestedResource(
                vpcStackInfo.nestedStackResources.getStackKey(),
                ingressRule.logicalResourceId,
              );
            }
          } catch (error) {
            // continue the ref may not exits
          }

          try {
            if (
              ingressRule.resourceMetadata['Properties'].SourceSecurityGroupId['Ref'] ===
              existingSecurityGroup.logicalResourceId
            ) {
              this.scope.addLogs(LogLevel.WARN, `Deleting Ingress Rule: ${ingressRule.logicalResourceId}`);
              this.scope.addDeleteFlagForNestedResource(
                vpcStackInfo.nestedStackResources.getStackKey(),
                ingressRule.logicalResourceId,
              );
            }
          } catch (error) {
            // the ref may not exist
          }

          for (const egressRule of existingSecurityGroupEgressRules) {
            try {
              if (
                egressRule.resourceMetadata['Properties'].GroupId['Ref'] === existingSecurityGroup.logicalResourceId
              ) {
                this.scope.addLogs(LogLevel.WARN, `Deleting Egress Rule: ${egressRule.logicalResourceId}`);
                this.scope.addDeleteFlagForNestedResource(
                  vpcStackInfo.nestedStackResources.getStackKey(),
                  egressRule.logicalResourceId,
                );
              }
            } catch (error) {
              // continue the ref may not exist
            }
            try {
              if (
                egressRule.resourceMetadata['Properties'].DestinationSecurityGroupId['Ref'] ===
                existingSecurityGroup.logicalResourceId
              ) {
                this.scope.addLogs(LogLevel.WARN, `Deleting Egress Rule: ${egressRule.logicalResourceId}`);
                this.scope.addDeleteFlagForNestedResource(
                  vpcStackInfo.nestedStackResources.getStackKey(),
                  egressRule.logicalResourceId,
                );
              }
            } catch (error) {
              // continue the ref may not exist
            }
          }
        }
      }
    }
  }
}
