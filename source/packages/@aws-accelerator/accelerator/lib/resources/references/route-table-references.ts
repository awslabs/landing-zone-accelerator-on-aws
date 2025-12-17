import { VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { SsmParameterPath, SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Class that manages route table references through SSM parameters
 * Provides utility methods to store and retrieve route table information
 */
export class RouteTableReferences {
  /**
   * Map to store route table references with key as `vpcName_routeTableName` and value as SSM parameter path
   */
  private routeTableMap: Map<string, string>;

  /**
   * The CDK construct scope used for creating resources
   */
  private scope: Construct;

  /**
   * SSM parameter prefix used for all route table references
   */
  private ssmPrefix: string;

  /**
   * Creates a new instance of RouteTableReferences
   * @param scope - The CDK construct scope
   * @param acceleratorSSMPrefix - The SSM parameter prefix to use
   * @param vpcResources - List of VPC configurations to extract route table information from
   */
  constructor(scope: Construct, acceleratorSSMPrefix: string, vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    this.routeTableMap = new Map<string, string>();
    this.ssmPrefix = acceleratorSSMPrefix;
    this.scope = scope;
    this.setRouteTableReferences(vpcResources);
  }

  /**
   * Populates the route table map with references from the provided VPC resources
   * @param vpcResources - List of VPC configurations containing route table definitions
   */
  public setRouteTableReferences(vpcResources: (VpcConfig | VpcTemplatesConfig)[]) {
    for (const vpcItem of vpcResources) {
      for (const routeTableItem of vpcItem.routeTables ?? []) {
        this.setRouteTableReference(vpcItem.name, routeTableItem.name);
      }
    }
  }

  /**
   * Adds a single route table reference to the map
   * @param vpcName - The name of the VPC
   * @param routeTableName - The name of the route table
   */
  public setRouteTableReference(vpcName: string, routeTableName: string) {
    const routeTablePath = new SsmParameterPath(this.ssmPrefix, SsmResourceType.ROUTE_TABLE, [vpcName, routeTableName])
      .parameterPath;
    this.routeTableMap.set(`${vpcName}_${routeTableName}`, routeTablePath);
  }

  /**
   * Retrieves a route table ID from SSM parameter store
   * @param vpcName - The name of the VPC
   * @param routeTableName - The name of the route table
   * @returns The route table ID from the SSM parameter or undefined if not found
   */
  public getCfnSSMParameter(vpcName: string, routeTableName: string) {
    const routeTablePath = this.getSSMPath(vpcName, routeTableName);
    if (!routeTablePath) {
      return undefined;
    }
    return cdk.aws_ssm.StringParameter.valueForStringParameter(this.scope, routeTablePath);
  }

  /**
   * Gets the SSM parameter path for a specific route table
   * @param vpcName - The name of the VPC
   * @param routeTableName - The name of the route table
   * @returns The SSM parameter path or undefined if not found
   */
  public getSSMPath(vpcName: string, routeTableName: string) {
    return this.routeTableMap.get(`${vpcName}_${routeTableName}`);
  }
}
