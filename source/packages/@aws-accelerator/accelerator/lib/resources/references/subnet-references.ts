import { VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { SsmParameterPath, SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Class that manages subnet references through SSM parameters
 * Provides utility methods to store and retrieve subnet information
 */
export class SubnetReferences {
  /**
   * Map to store subnet references with key as `vpcName_subnetName` and value as SSM parameter path
   */
  private subnetMap: Map<string, string>;

  /**
   * The CDK construct scope used for creating resources
   */
  private scope: Construct;

  /**
   * SSM parameter prefix used for all subnet references
   */
  private ssmPrefix: string;

  /**
   * Creates a new instance of SubnetReferences
   * @param scope - The CDK construct scope
   * @param acceleratorSSMPrefix - The SSM parameter prefix to use
   * @param vpcResources - List of VPC configurations to extract subnet information from
   */
  constructor(scope: Construct, acceleratorSSMPrefix: string, vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    this.subnetMap = new Map<string, string>();
    this.ssmPrefix = acceleratorSSMPrefix;
    this.scope = scope;
    this.setSubnetReferences(vpcResources);
  }

  /**
   * Populates the subnet map with references from the provided VPC resources
   * @param vpcResources - List of VPC configurations containing subnet definitions
   */
  public setSubnetReferences(vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    for (const vpcItem of vpcResources) {
      for (const subnetItem of vpcItem.subnets ?? []) {
        this.setSubnetReference(vpcItem.name, subnetItem.name);
      }
    }
  }

  /**
   * Adds a single subnet reference to the map
   * @param vpcName - The name of the VPC
   * @param subnetName - The name of the subnet
   */
  public setSubnetReference(vpcName: string, subnetName: string) {
    const subnetPath = new SsmParameterPath(this.ssmPrefix, SsmResourceType.SUBNET, [vpcName, subnetName])
      .parameterPath;
    this.subnetMap.set(`${vpcName}_${subnetName}`, subnetPath);
  }

  /**
   * Retrieves a subnet value from SSM parameter store
   * @param vpcName - The name of the VPC
   * @param subnetName - The name of the subnet
   * @returns The subnet ID from the SSM parameter or undefined if not found
   */
  public getCfnSSMParameter(vpcName: string, subnetName: string) {
    const subnetPath = this.getSSMPath(vpcName, subnetName);
    if (!subnetPath) {
      return undefined;
    }
    return cdk.aws_ssm.StringParameter.valueForStringParameter(this.scope, subnetPath);
  }

  /**
   * Gets the SSM parameter path for a specific subnet
   * @param vpcName - The name of the VPC
   * @param subnetName - The name of the subnet
   * @returns The SSM parameter path or undefined if not found
   */
  public getSSMPath(vpcName: string, subnetName: string) {
    return this.subnetMap.get(`${vpcName}_${subnetName}`);
  }
}
