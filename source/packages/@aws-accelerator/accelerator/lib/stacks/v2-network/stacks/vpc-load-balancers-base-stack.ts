/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { pascalCase } from 'pascal-case';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { AcceleratorKeyType, AcceleratorStack } from '../../accelerator-stack';
import { V2NetworkStacksBaseProps } from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import { ApplicationLoadBalancerConfig, NetworkLoadBalancerConfig, GwlbConfig } from '@aws-accelerator/config';
import { MetadataKeys, SsmResourceType } from '@aws-accelerator/utils';
import {
  NetworkLoadBalancer,
  ApplicationLoadBalancer,
  PutSsmParameter,
  SsmParameterProps,
  GatewayLoadBalancer,
} from '@aws-accelerator/constructs';
import { isV2Resource } from '../utils/functions';
import { NetworkStackGeneration, V2StackComponentsList } from '../utils/enums';
export class VpcLoadBalancersBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;

  private cloudwatchKey: cdk.aws_kms.IKey | undefined;

  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id, props);

    //
    // Add Stack metadata
    //
    this.addMetadata(MetadataKeys.LZA_LOOKUP, {
      accountName: this.props.accountsConfig.getAccountNameById(this.account),
      region: cdk.Stack.of(this).region,
      stackGeneration: NetworkStackGeneration.V2,
    });

    this.v2StackProps = props;
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', this.v2StackProps);

    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);

    //
    // Create LoadBalancers
    // * Application Load Balancers and Network Load Balancers
    //
    this.createLoadBalancers();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
  }

  /**
   * Function to create Load Balancers
   */
  private createLoadBalancers(): void {
    // Create Gateway Load Balancers resources
    this.createGatewayLoadBalancers();

    const accessLogsBucketName = this.getElbAccessLogBucketName();

    // Create Application Load Balancers
    this.createApplicationLoadBalancers(accessLogsBucketName);

    // Create Network Load Balancers
    this.createNetworkLoadBalancers(accessLogsBucketName);
  }

  /**
   * Function to create Gateway Load balancers
   */
  private createGatewayLoadBalancers(): void {
    for (const gatewayLoadBalancerItem of this.props.networkConfig.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      if (
        this.vpcDetails.name === gatewayLoadBalancerItem.vpc &&
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.GATEWAY_LOAD_BALANCER,
          gatewayLoadBalancerItem.name,
        )
      ) {
        const allowedPrincipals = this.setGatewayLoadBalancerAllowedPrincipals(gatewayLoadBalancerItem);
        const gatewayLoadBalancer = this.createGatewayLoadBalancer(gatewayLoadBalancerItem, allowedPrincipals);
        this.setGatewayLoadBalancerEndpointParameters(gatewayLoadBalancer, gatewayLoadBalancerItem, allowedPrincipals);
      }
    }
  }

  /**
   * Function to get Gateway Load Balancer
   * @param loadBalancerItem {@link GwlbConfig}
   * @param allowedPrincipals string[]
   * @returns
   */
  private createGatewayLoadBalancer(loadBalancerItem: GwlbConfig, allowedPrincipals: string[]): GatewayLoadBalancer {
    // Set subnets
    const subnetIds: string[] = [];
    for (const subnetName of loadBalancerItem.subnets) {
      const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnetName]),
      );
      if (!subnetIds.includes(subnetId)) {
        subnetIds.push(subnetId);
      }
    }

    this.logger.info(`Add Gateway Load Balancer ${loadBalancerItem.name} to VPC ${loadBalancerItem.vpc}`);
    const loadBalancer = new GatewayLoadBalancer(this, `${pascalCase(loadBalancerItem.name)}GatewayLoadBalancer`, {
      name: loadBalancerItem.name,
      allowedPrincipals,
      subnets: subnetIds,
      crossZoneLoadBalancing: loadBalancerItem.crossZoneLoadBalancing,
      deletionProtection: loadBalancerItem.deletionProtection,
      tags: loadBalancerItem.tags,
    });

    // Add SSM parameters
    this.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(loadBalancerItem.name)}GwlbServiceId`),
      parameterName: this.getSsmPath(SsmResourceType.GWLB_SERVICE, [loadBalancerItem.name]),
      stringValue: loadBalancer.endpointServiceId,
    });
    this.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(loadBalancerItem.name)}GwlbArn`),
      parameterName: this.getSsmPath(SsmResourceType.GWLB_ARN, [loadBalancerItem.name]),
      stringValue: loadBalancer.loadBalancerArn,
    });

    // AwsSolutions-ELB2: The ELB does not have access logs enabled.
    NagSuppressions.addResourceSuppressions(loadBalancer, [
      { id: 'AwsSolutions-ELB2', reason: 'Gateway Load Balancers do not support access logging.' },
    ]);

    const cfnResource = loadBalancer.node.defaultChild as cdk.CfnResource;

    cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.GATEWAY_LOAD_BALANCER,
      vpcName: this.vpcDetails.name,
      loadBalancerName: loadBalancerItem.name,
    });

    return loadBalancer;
  }

  /**
   * Function to set Gateway Load Balancer allowed principals
   * @param loadBalancerItem {@link GwlbConfig}
   * @returns
   */
  private setGatewayLoadBalancerAllowedPrincipals(loadBalancerItem: GwlbConfig): string[] {
    const allowedPrincipals: string[] = [];

    // Set account principals
    for (const endpointItem of loadBalancerItem.endpoints) {
      const accountId = this.props.accountsConfig.getAccountId(endpointItem.account);
      if (!allowedPrincipals.includes(accountId)) {
        allowedPrincipals.push(accountId);
      }
    }
    return allowedPrincipals;
  }

  /**
   * Function to set Cross Account SSM Parameters for Gateway Load Balancer
   * @param gwlb {@link GatewayLoadBalancer}
   * @param loadBalancerItem {@link GwlbConfig}
   * @returns
   */
  private setCrossAccountGatewayLoadBalancerSsmParameters(gwlb: GatewayLoadBalancer, loadBalancerItem: GwlbConfig) {
    const ssmParameters: SsmParameterProps[] = [];

    ssmParameters.push({
      name: this.getSsmPath(SsmResourceType.GWLB_SERVICE, [loadBalancerItem.name]),
      value: gwlb.endpointServiceId,
    });
    return [...new Set(ssmParameters)];
  }

  /**
   * Function to set Cross Account SSM Parameters for Gateway Load Balancer
   * @param gwlb {@link GatewayLoadBalancer}
   * @param loadBalancerItem {@link GwlbConfig}
   * @param allowedPrincipals string[]
   */
  private setGatewayLoadBalancerEndpointParameters(
    gwlb: GatewayLoadBalancer,
    loadBalancerItem: GwlbConfig,
    allowedPrincipals: string[],
  ): void {
    const accountIds: string[] = [];

    allowedPrincipals.forEach(account => {
      if (account !== cdk.Stack.of(this).account) {
        accountIds.push(account);
      }
    });

    const parameters = this.setCrossAccountGatewayLoadBalancerSsmParameters(gwlb, loadBalancerItem);

    if (accountIds.length > 0 && parameters.length > 0) {
      new PutSsmParameter(this, pascalCase(`${loadBalancerItem.name}-${this.vpcDetails.name}-SharedSsmParameters`), {
        accountIds,
        region: cdk.Stack.of(this).region,
        roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        parameters,
        invokingAccountId: this.account,
        acceleratorPrefix: this.props.prefixes.accelerator,
      });
    }
  }

  /**
   * Function to get Load Balancer Subnet Ids
   * @param subnetNames string[]
   * @returns
   */
  private getLoadBalancerSubnetIds(subnetNames: string[]): string[] {
    const subnetIds: string[] = [];
    for (const subnetName of subnetNames) {
      const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnetName]),
      );
      if (!subnetIds.includes(subnetId)) {
        subnetIds.push(subnetId);
      }
    }
    return subnetIds;
  }

  /**
   * Function to get Load Balancer Security Group Ids
   * @param securityGroupNames string[]
   * @returns
   */
  private getLoadBalancerSecurityGroupIds(securityGroupNames: string[]): string[] {
    const securityGroupIds: string[] = [];
    for (const securityGroupName of securityGroupNames) {
      const securityGroupId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.SECURITY_GROUP, [this.vpcDetails.name, securityGroupName]),
      );
      if (!securityGroupIds.includes(securityGroupId)) {
        securityGroupIds.push(securityGroupId);
      }
    }
    return securityGroupIds;
  }

  /**
   * Function to create application load balancers
   * @param accessLogsBucketName string
   */
  private createApplicationLoadBalancers(accessLogsBucketName: string): void {
    for (const applicationLoadBalancerItem of this.vpcDetails.applicationLoadBalancers) {
      // Logic to only create Application Load Balancers that don't include the shareTargets property
      if (
        !applicationLoadBalancerItem.shareTargets &&
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.APPLICATION_LOAD_BALANCER,
          applicationLoadBalancerItem.name,
        )
      ) {
        const subnetIds = this.getLoadBalancerSubnetIds(applicationLoadBalancerItem.subnets);
        const securityGroupIds = this.getLoadBalancerSecurityGroupIds(applicationLoadBalancerItem.securityGroups);

        // Create application load balancer
        this.createApplicationLoadBalancer(
          applicationLoadBalancerItem,
          subnetIds,
          accessLogsBucketName,
          securityGroupIds,
        );
      }
    }
  }

  /**
   * Function to create application load balancer
   * @param albItem {@link ApplicationLoadBalancerConfig}
   * @param subnetIds string[]
   * @param accessLogsBucketName string
   * @param securityGroupIds string[]
   */
  private createApplicationLoadBalancer(
    albItem: ApplicationLoadBalancerConfig,
    subnetIds: string[],
    accessLogsBucketName: string,
    securityGroupIds?: string[],
  ): void {
    this.logger.info(`Add Application Load Balancer ${albItem.name} to VPC ${this.vpcDetails.name}`);
    const alb = new ApplicationLoadBalancer(this, `${albItem.name}-${this.vpcDetails.name}`, {
      name: albItem.name,
      ssmPrefix: this.props.prefixes.ssmParamName,
      subnets: subnetIds,
      securityGroups: securityGroupIds,
      scheme: albItem.scheme ?? 'internal',
      accessLogsBucket: accessLogsBucketName,
      attributes: albItem.attributes ?? undefined,
    });

    this.addSsmParameter({
      logicalId: `${albItem.name}-${this.vpcDetails.name}-ssm`,
      parameterName: this.getSsmPath(SsmResourceType.ALB, [this.vpcDetails.name, albItem.name]),
      stringValue: alb.applicationLoadBalancerArn,
    });

    const cfnResource = alb.node.defaultChild as cdk.CfnResource;

    cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.APPLICATION_LOAD_BALANCER,
      vpcName: this.vpcDetails.name,
      loadBalancerName: albItem.name,
    });
  }

  /**
   * Function to set Network load balancer principal Ids
   * @returns
   */
  private setNetworkLoadBalancerPrincipalIds(): cdk.aws_iam.AccountPrincipal[] | void {
    if (this.vpcDetails.networkLoadBalancers.length === 0) {
      return;
    }

    const vpcItemsWithTargetGroups = this.props.networkConfig.vpcs.filter(
      vpcItem => vpcItem.targetGroups && vpcItem.targetGroups.length > 0,
    );

    const vpcTemplatesWithTargetGroups =
      this.props.networkConfig.vpcTemplates?.filter(
        vpcItem => vpcItem.targetGroups && vpcItem.targetGroups.length > 0,
      ) ?? [];

    const accountIdTargetsForVpcs = vpcItemsWithTargetGroups.map(vpcItem =>
      this.props.accountsConfig.getAccountId(vpcItem.account),
    );

    const accountIdTargetsForVpcTemplates =
      vpcTemplatesWithTargetGroups?.map(vpcTemplate =>
        this.getAccountIdsFromDeploymentTargets(vpcTemplate.deploymentTargets),
      ) ?? [];

    const principalAccountIds = [...accountIdTargetsForVpcs, ...accountIdTargetsForVpcTemplates];
    principalAccountIds.push(cdk.Stack.of(this).account);
    const principalIds = [...new Set(principalAccountIds)];
    return principalIds.map(accountId => new cdk.aws_iam.AccountPrincipal(accountId)) ?? undefined;
  }

  /**
   * Function to create Network load balancers
   * @param accessLogsBucketName string
   */
  private createNetworkLoadBalancers(accessLogsBucketName: string): void {
    for (const networkLoadBalancerItem of this.vpcDetails.networkLoadBalancers) {
      if (
        !isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.NETWORK_LOAD_BALANCER,
          networkLoadBalancerItem.name,
        )
      ) {
        this.logger.info(
          `Skipping creation of Network Load Balancer ${networkLoadBalancerItem.name} for VPC ${this.vpcDetails.name}`,
        );
        continue;
      }

      const subnetIds = this.getLoadBalancerSubnetIds(networkLoadBalancerItem.subnets);
      if (subnetIds.length === 0) {
        this.logger.error(`Could not find subnets for NLB Item ${networkLoadBalancerItem.name}.`);
        throw new Error(
          `Configuration validation failed at runtime. Could not find subnets for NLB Item ${networkLoadBalancerItem.name}`,
        );
      }

      this.createNetworkLoadBalancer(networkLoadBalancerItem, subnetIds, accessLogsBucketName);
    }

    const roleName = `${this.props.prefixes.accelerator}-GetNLBIPAddressLookup`;
    if (
      cdk.Stack.of(this).region === this.props.globalConfig.homeRegion &&
      this.vpcDetails.networkLoadBalancers.length > 0 &&
      !isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.NETWORK_LOAD_BALANCER_ROLE,
        `${roleName}|${cdk.Stack.of(this).account}`,
      )
    ) {
      const principals = this.setNetworkLoadBalancerPrincipalIds();
      const role = new cdk.aws_iam.Role(this, `GetNLBIPAddressLookup`, {
        roleName,
        assumedBy: new cdk.aws_iam.CompositePrincipal(...principals!),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ec2:DescribeNetworkInterfaces'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });

      NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/GetNLBIPAddressLookup`, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific role arns.',
        },
      ]);

      (role.node.defaultChild as cdk.aws_iam.CfnRole).addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.NETWORK_LOAD_BALANCER_ROLE,
        roleDescription: 'GetNLBIPAddressLookup',
        roleName,
      });
    }
  }

  /**
   * Function to create Network load balancer
   * @param nlbItem {@link NetworkLoadBalancerConfig}
   * @param subnetIds string[]
   * @param accessLogsBucketName string
   */
  private createNetworkLoadBalancer(
    nlbItem: NetworkLoadBalancerConfig,
    subnetIds: string[],
    accessLogsBucketName: string,
  ): void {
    this.logger.info(`Adding Network Load Balancer ${nlbItem.name} to VPC ${this.vpcDetails.name}`);
    const nlb = new NetworkLoadBalancer(this, `${nlbItem.name}-${this.vpcDetails.name}`, {
      name: nlbItem.name,
      ssmPrefix: this.props.prefixes.ssmParamName,
      appName: `${nlbItem.name}-${this.vpcDetails.name}-app`,
      subnets: subnetIds,
      vpcName: this.vpcDetails.name,
      scheme: nlbItem.scheme,
      deletionProtection: nlbItem.deletionProtection,
      crossZoneLoadBalancing: nlbItem.crossZoneLoadBalancing,
      accessLogsBucket: accessLogsBucketName,
    });

    this.addSsmParameter({
      logicalId: `${nlbItem.name}-${this.vpcDetails.name}-ssm`,
      parameterName: this.getSsmPath(SsmResourceType.NLB, [this.vpcDetails.name, nlbItem.name]),
      stringValue: nlb.networkLoadBalancerArn,
    });

    const cfnResource = nlb.node.defaultChild as cdk.CfnResource;
    cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.NETWORK_LOAD_BALANCER,
      vpcName: this.vpcDetails.name,
      loadBalancerName: nlbItem.name,
      loadBalancerType: 'network',
    });
  }
}
