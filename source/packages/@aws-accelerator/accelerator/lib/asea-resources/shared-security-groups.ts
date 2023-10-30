import * as cdk from 'aws-cdk-lib';
import { AseaResourceType, AseaStackInfo } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { AseaResource, AseaResourceProps } from './resource';
import { VpcResourcesProps } from './vpc-resources';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';

const enum RESOURCE_TYPE {
  SECURITY_GROUP = 'AWS::EC2::SecurityGroup',
}

const ASEA_PHASE_NUMBER = 2;

type NestedAseaStackInfo = AseaStackInfo & { logicalResourceId: string };

export interface SharedSecurityGroupResourcesProps extends AseaResourceProps {
  /**
   * Nested Stacks of current phase stack
   */
  nestedStacksInfo: NestedAseaStackInfo[];
}

export class SharedSecurityGroups extends AseaResource {
  private readonly nestedStacksInfo: NestedAseaStackInfo[] = [];
  private ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];
  constructor(scope: ImportAseaResourcesStack, props: VpcResourcesProps) {
    super(scope, props);
    this.ssmParameters = [];
    this.nestedStacksInfo = props.nestedStacksInfo;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.SECURITY_GROUP}s to handle in stack ${props.stackInfo.stackName}`,
      );
      return;
    }
    this.nestedStacksInfo = props.nestedStacksInfo;
    for (const vpcItem of this.scope.sharedVpcs) {
      const vpcStackInfo = this.securityGroupResourceByVpc(vpcItem.name);
      if (!vpcStackInfo) continue;
      const vpcStack = this.stack.getNestedStack(vpcStackInfo.logicalResourceId);
      const securityGroupResources = this.filterResourcesByType(vpcStackInfo.resources, RESOURCE_TYPE.SECURITY_GROUP);
      for (const securityGroupItem of vpcItem.securityGroups ?? []) {
        const securityGroupResource = this.findResourceByTag(securityGroupResources, securityGroupItem.name);
        if (!securityGroupResource) continue;
        const securityGroup = vpcStack.includedTemplate.getResource(securityGroupResource.logicalResourceId);
        this.addSsmParameter({
          logicalId: pascalCase(
            `SsmParam${pascalCase(vpcItem.name) + pascalCase(securityGroupItem.name)}SecurityGroup`,
          ),
          parameterName: this.scope.getSsmPath(SsmResourceType.SECURITY_GROUP, [vpcItem.name, securityGroupItem.name]),
          stringValue: securityGroup.ref,
        });
        this.scope.addAseaResource(AseaResourceType.EC2_SECURITY_GROUP, `${vpcItem.name}/${securityGroupItem.name}`);
      }
      this.createSsmParameters(vpcStack.includedTemplate);
    }
  }

  /**
   * This method creates SSM parameters stored in the `NestedStack.ssmParameters` array.
   * If more than five parameters are defined, the method adds a `dependsOn` statement
   * to remaining parameters in order to avoid API throttling issues.
   */
  private createSsmParameters(scope: cdk.cloudformation_include.CfnInclude): void {
    let index = 1;
    const parameterMap = new Map<number, cdk.aws_ssm.StringParameter>();

    for (const parameterItem of this.ssmParameters) {
      // Create parameter
      const parameter = new cdk.aws_ssm.StringParameter(scope, parameterItem.logicalId, {
        parameterName: parameterItem.parameterName,
        stringValue: parameterItem.stringValue,
      });
      parameterMap.set(index, parameter);

      // Add a dependency for every 5 parameters
      if (index > 5) {
        const dependsOnParam = parameterMap.get(index - (index % 5));
        if (!dependsOnParam) {
          this.scope.addLogs(
            LogLevel.ERROR,
            `Error creating SSM parameter ${parameterItem.parameterName}: previous SSM parameter undefined`,
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

  private securityGroupResourceByVpc(vpcName: string) {
    for (const nestedStackInfo of this.nestedStacksInfo) {
      const securityGroups = this.filterResourcesByType(nestedStackInfo.resources, RESOURCE_TYPE.SECURITY_GROUP);
      if (!securityGroups) continue;
      if (vpcName.endsWith('_vpc')) vpcName = vpcName.split('_vpc')[0];
      if (nestedStackInfo.logicalResourceId.startsWith(`SecurityGroups${vpcName}Shared`)) return nestedStackInfo;
    }
    return;
  }
}
