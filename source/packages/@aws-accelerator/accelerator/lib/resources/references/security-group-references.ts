import { VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { SsmParameterPath, SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Manages security group references through SSM parameters
 * Provides utility methods to retrieve security group information
 */
export class SecurityGroupReferences {
  /**
   * Map to store security group references with key as `vpcName_securityGroupName`
   * and value as the SSM parameter path
   */
  private securityGroupMap: Map<string, string>;

  /**
   * The CDK construct scope used for retrieving SSM parameters
   */
  private scope: Construct;
  private ssmPrefix: string;

  /**
   * Creates a new instance of SecurityGroupReferences
   * @param scope - The CDK construct scope
   * @param acceleratorSSMPrefix - The SSM parameter prefix to use
   * @param vpcResources - List of VPC configurations to extract security group information from
   */
  constructor(scope: Construct, acceleratorSSMPrefix: string, vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    this.securityGroupMap = new Map<string, string>();
    this.scope = scope;
    this.ssmPrefix = acceleratorSSMPrefix;
    this.setSecurityGroupReferences(vpcResources);
  }

  private setSecurityGroupReferences(vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    for (const vpcItem of vpcResources) {
      for (const securityGroupItem of vpcItem.securityGroups ?? []) {
        this.setSecurityGroupReference(vpcItem.name, securityGroupItem.name);
      }
    }
  }

  public setSecurityGroupReference(vpcName: string, securityGroupName: string) {
    const securityGroupPath = new SsmParameterPath(this.ssmPrefix, SsmResourceType.SECURITY_GROUP, [
      vpcName,
      securityGroupName,
    ]).parameterPath;
    this.securityGroupMap.set(`${vpcName}_${securityGroupName}`, securityGroupPath);
  }
  /**
   * Retrieves a security group ID from SSM parameter store
   * @param vpcName - The name of the VPC
   * @param securityGroupName - The name of the security group
   * @returns The security group ID from the SSM parameter
   */
  public getCfnSSMParameter(vpcName: string, securityGroupName: string) {
    const securityGroupSSMPath = this.getSSMPath(vpcName, securityGroupName);
    return cdk.aws_ssm.StringParameter.valueForStringParameter(this.scope, securityGroupSSMPath);
  }

  /**
   * Gets the SSM parameter path for a specific security group
   * @param vpcName - The name of the VPC
   * @param securityGroupName - The name of the security group
   * @returns The SSM parameter path for the security group
   * @throws Error if the security group cannot be found
   */
  public getSSMPath(vpcName: string, securityGroupName: string) {
    const securityGroupSSMPath = this.securityGroupMap.get(`${vpcName}_${securityGroupName}`);
    if (!securityGroupSSMPath) {
      throw new Error(
        `Could not find security group ${securityGroupName} in vpc ${vpcName} \nConfiguration validation failed at runtime.`,
      );
    }
    return securityGroupSSMPath;
  }
}
