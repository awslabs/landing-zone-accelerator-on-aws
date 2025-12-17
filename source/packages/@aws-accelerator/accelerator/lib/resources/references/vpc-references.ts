import { VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { SsmParameterPath, SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Class that manages VPC references through SSM parameters
 * Provides utility methods to store and retrieve VPC information
 */
export class VpcReferences {
  /**
   * Map to store VPC references with key as VPC name and value as SSM parameter path
   */
  private vpcMap: Map<string, string>;

  /**
   * The CDK construct scope used for creating resources
   */
  private scope: Construct;

  /**
   * SSM parameter prefix used for all VPC references
   */
  private ssmPrefix: string;

  /**
   * Creates a new instance of VpcReferences
   * @param scope - The CDK construct scope
   * @param acceleratorSSMPrefix - The SSM parameter prefix to use
   * @param vpcResources - List of VPC configurations to extract VPC information from
   */
  constructor(scope: Construct, acceleratorSSMPrefix: string, vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    this.vpcMap = new Map<string, string>();
    this.ssmPrefix = acceleratorSSMPrefix;
    this.scope = scope;
    this.setVpcReferences(vpcResources);
  }

  /**
   * Populates the VPC map with references from the provided VPC resources
   * @param vpcResources - List of VPC configurations containing VPC definitions
   */
  public setVpcReferences(vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    for (const vpcItem of vpcResources) {
      this.setVpcReference(vpcItem.name);
    }
  }

  /**
   * Adds a single VPC reference to the map
   * @param vpcName - The name of the VPC
   */
  public setVpcReference(vpcName: string) {
    const vpcPath = new SsmParameterPath(this.ssmPrefix, SsmResourceType.VPC, [vpcName]).parameterPath;
    this.vpcMap.set(`${vpcName}`, vpcPath);
  }

  /**
   * Retrieves a VPC ID from SSM parameter store
   * @param vpcName - The name of the VPC
   * @returns The VPC ID from the SSM parameter or undefined if not found
   */
  public getCfnSSMParameter(vpcName: string) {
    const vpcPath = this.getSSMPath(vpcName);
    if (!vpcPath) {
      return undefined;
    }
    return cdk.aws_ssm.StringParameter.valueForStringParameter(this.scope, vpcPath);
  }

  /**
   * Gets the SSM parameter path for a specific vpc
   * @param vpcName - The name of the VPC
   * @returns The SSM parameter path or undefined if not found
   */
  public getSSMPath(vpcName: string) {
    return this.vpcMap.get(`${vpcName}`);
  }
}
