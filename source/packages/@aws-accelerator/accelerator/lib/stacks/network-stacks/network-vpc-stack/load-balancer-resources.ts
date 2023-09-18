/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { ApplicationLoadBalancerConfig, GwlbConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import {
  ApplicationLoadBalancer,
  GatewayLoadBalancer,
  NetworkLoadBalancer,
  PutSsmParameter,
  SecurityGroup,
  SsmParameterProps,
  Subnet,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { getSubnet } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class LoadBalancerResources {
  public readonly albMap: Map<string, ApplicationLoadBalancer>;
  public readonly gwlbMap: Map<string, GatewayLoadBalancer>;
  public readonly nlbMap: Map<string, NetworkLoadBalancer>;
  private stack: NetworkVpcStack;

  constructor(
    networkVpcStack: NetworkVpcStack,
    subnetMap: Map<string, Subnet>,
    securityGroupMap: Map<string, SecurityGroup>,
    props: AcceleratorStackProps,
  ) {
    this.stack = networkVpcStack;

    // Create GWLB resources
    this.gwlbMap = this.createGwlbs(this.stack.vpcsInScope, subnetMap, props);

    // Create ALBs
    this.albMap = this.createApplicationLoadBalancers(this.stack.vpcsInScope, subnetMap, securityGroupMap, props);

    // Create NLBs
    this.nlbMap = this.createNetworkLoadBalancers(this.stack.vpcsInScope, subnetMap, props);
  }

  /**
   * Set allowed account principals for a given GWLB item
   * @param loadBalancerItem
   * @param props
   * @returns
   */
  private setGwlbAllowedPrincipals(loadBalancerItem: GwlbConfig, props: AcceleratorStackProps): string[] {
    const allowedPrincipals: string[] = [];

    // Set account principals
    for (const endpointItem of loadBalancerItem.endpoints) {
      const accountId = props.accountsConfig.getAccountId(endpointItem.account);
      if (!allowedPrincipals.includes(accountId)) {
        allowedPrincipals.push(accountId);
      }
    }
    return allowedPrincipals;
  }

  /**
   * Create gateway load balancers
   * @param vpcResources
   * @param subnetMap
   * @param props
   * @returns
   */
  private createGwlbs(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    subnetMap: Map<string, Subnet>,
    props: AcceleratorStackProps,
  ): Map<string, GatewayLoadBalancer> {
    const gwlbMap = new Map<string, GatewayLoadBalancer>();

    for (const vpcItem of vpcResources) {
      for (const loadBalancerItem of props.networkConfig.centralNetworkServices?.gatewayLoadBalancers ?? []) {
        if (vpcItem.name === loadBalancerItem.vpc) {
          const allowedPrincipals = this.setGwlbAllowedPrincipals(loadBalancerItem, props);
          const gwlb = this.createGwlb(vpcItem, loadBalancerItem, subnetMap, allowedPrincipals);
          gwlbMap.set(loadBalancerItem.name, gwlb);
          this.setGwlbEndpointParameters(gwlb, loadBalancerItem, allowedPrincipals, vpcItem.name);
        }
      }
    }
    return gwlbMap;
  }

  /**
   * Create gateway load balancer item
   * @param vpcItem
   * @param loadBalancerItem
   * @param subnetMap
   * @param allowedPrincipals
   * @returns
   */
  private createGwlb(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    loadBalancerItem: GwlbConfig,
    subnetMap: Map<string, Subnet>,
    allowedPrincipals: string[],
  ): GatewayLoadBalancer {
    // Set subnets
    const subnets: string[] = [];
    for (const subnetItem of loadBalancerItem.subnets) {
      const subnet = getSubnet(subnetMap, vpcItem.name, subnetItem) as Subnet;

      if (!subnets.includes(subnet.subnetId)) {
        subnets.push(subnet.subnetId);
      }
    }

    // Create GWLB
    this.stack.addLogs(
      LogLevel.INFO,
      `Add Gateway Load Balancer ${loadBalancerItem.name} to VPC ${loadBalancerItem.vpc}`,
    );
    const loadBalancer = new GatewayLoadBalancer(
      this.stack,
      `${pascalCase(loadBalancerItem.name)}GatewayLoadBalancer`,
      {
        name: loadBalancerItem.name,
        allowedPrincipals,
        subnets,
        crossZoneLoadBalancing: loadBalancerItem.crossZoneLoadBalancing,
        deletionProtection: loadBalancerItem.deletionProtection,
        tags: loadBalancerItem.tags,
      },
    );

    // Add SSM parameters
    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(loadBalancerItem.name)}GwlbServiceId`),
      parameterName: this.stack.getSsmPath(SsmResourceType.GWLB_SERVICE, [loadBalancerItem.name]),
      stringValue: loadBalancer.endpointServiceId,
    });
    this.stack.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(loadBalancerItem.name)}GwlbArn`),
      parameterName: this.stack.getSsmPath(SsmResourceType.GWLB_ARN, [loadBalancerItem.name]),
      stringValue: loadBalancer.loadBalancerArn,
    });

    // AwsSolutions-ELB2: The ELB does not have access logs enabled.
    NagSuppressions.addResourceSuppressions(loadBalancer, [
      { id: 'AwsSolutions-ELB2', reason: 'Gateway Load Balancers do not support access logging.' },
    ]);

    return loadBalancer;
  }

  /**
   * Create gateway load balancer parameter stores for applicable accounts.
   * @param gwlb Gateway Load Balancer config
   * @param loadBalancerItem Gateway Load Balancer
   * @param allowedPrincipals Allowed Principals
   * @param vpcName Name of the VPC
   */
  private setGwlbEndpointParameters(
    gwlb: GatewayLoadBalancer,
    loadBalancerItem: GwlbConfig,
    allowedPrincipals: string[],
    vpcName: string,
  ) {
    const accountIds: string[] = [];

    allowedPrincipals.forEach(account => {
      if (account !== cdk.Stack.of(this.stack).account) {
        accountIds.push(account);
      }
    });

    const parameters = this.setCrossAccountGwlbSsmParameters(gwlb, loadBalancerItem);
    if (accountIds.length > 0 && parameters.length > 0) {
      new PutSsmParameter(this.stack, pascalCase(`${loadBalancerItem.name}-${vpcName}-SharedSsmParameters`), {
        accountIds,
        region: cdk.Stack.of(this.stack).region,
        roleName: this.stack.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
        parameters,
        invokingAccountId: this.stack.account,
        acceleratorPrefix: this.stack.acceleratorPrefix,
      });
    }
  }

  /**
   * Returns an array of SSM parameters for cross-account Gateway Load Balancer Service Endpoints
   * @param gwlb Gateway Load Balancer config
   * @param loadBalancerItem Gateway Load Balancer
   * @returns SsmParameterProps[]
   */
  private setCrossAccountGwlbSsmParameters(gwlb: GatewayLoadBalancer, loadBalancerItem: GwlbConfig) {
    const ssmParameters: SsmParameterProps[] = [];

    ssmParameters.push({
      name: this.stack.getSsmPath(SsmResourceType.GWLB_SERVICE, [loadBalancerItem.name]),
      value: gwlb.endpointServiceId,
    });
    return [...new Set(ssmParameters)];
  }

  /**
   * Validate subnet presence for given ALB
   * @param subnetIds string[]
   * @param albName string
   */
  private validateAlbSubnetId(subnetIds: string[], albName: string) {
    if (subnetIds.length === 0) {
      this.stack.addLogs(LogLevel.ERROR, `Could not find subnets for ALB Item ${albName}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
  }

  /**
   * Function to create Application Load Balancer
   * @param options
   */
  private createApplicationLoadBalancer(options: {
    vpcName: string;
    albItem: ApplicationLoadBalancerConfig;
    accessLogsBucketName: string;
    subnetIds: string[];
    securityGroupIds: string[];
    albMap: Map<string, ApplicationLoadBalancer>;
    subnetMap: Map<string, Subnet>;
    subnetLookups: (Subnet | undefined)[];
    securityGroupLookups: (SecurityGroup | undefined)[];
    props: AcceleratorStackProps;
  }) {
    const alb = new ApplicationLoadBalancer(this.stack, `${options.albItem.name}-${options.vpcName}`, {
      name: options.albItem.name,
      ssmPrefix: options.props.prefixes.ssmParamName,
      subnets: options.subnetIds,
      securityGroups: options.securityGroupIds ?? undefined,
      scheme: options.albItem.scheme ?? 'internal',
      accessLogsBucket: options.accessLogsBucketName,
      attributes: options.albItem.attributes ?? undefined,
    });
    options.albMap.set(`${options.vpcName}_${options.albItem.name}`, alb);

    for (const subnet of options.albItem.subnets || []) {
      const subnetLookup = options.subnetMap.get(`${options.vpcName}_${subnet}`);
      if (subnetLookup) {
        alb.node.addDependency(subnetLookup);
      }
    }

    for (const subnet of options.subnetLookups || []) {
      if (subnet) {
        alb.node.addDependency(subnet);
      }
    }

    for (const securityGroup of options.securityGroupLookups || []) {
      if (securityGroup) {
        alb.node.addDependency(securityGroup);
      }
    }

    this.stack.addSsmParameter({
      logicalId: `${options.albItem.name}-${options.vpcName}-ssm`,
      parameterName: this.stack.getSsmPath(SsmResourceType.ALB, [options.vpcName, options.albItem.name]),
      stringValue: alb.applicationLoadBalancerArn,
    });
  }

  /**
   * Create application load balancers
   * @param vpcResources
   * @param subnetMap
   * @param securityGroupMap
   * @param props
   * @returns
   */
  private createApplicationLoadBalancers(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    subnetMap: Map<string, Subnet>,
    securityGroupMap: Map<string, SecurityGroup>,
    props: AcceleratorStackProps,
  ): Map<string, ApplicationLoadBalancer> {
    const albMap = new Map<string, ApplicationLoadBalancer>();
    const accessLogsBucketName = `${
      this.stack.acceleratorResourceNames.bucketPrefixes.elbLogs
    }-${props.accountsConfig.getLogArchiveAccountId()}-${cdk.Stack.of(this.stack).region}`;

    for (const vpcItem of vpcResources) {
      for (const albItem of vpcItem.loadBalancers?.applicationLoadBalancers || []) {
        // Logic to only create Application Load Balancers that don't include the shareTargets property
        if (!albItem.shareTargets) {
          const subnetLookups = albItem.subnets.map(subnetName => subnetMap.get(`${vpcItem.name}_${subnetName}`));
          const nonNullsubnets = subnetLookups.filter(subnet => subnet) as Subnet[];
          const subnetIds = nonNullsubnets.map(subnet => subnet.subnetId);
          const securityGroupLookups = albItem.securityGroups.map(securityGroupName =>
            securityGroupMap.get(`${vpcItem.name}_${securityGroupName}`),
          );
          const nonNullSecurityGroups = securityGroupLookups.filter(group => group) as SecurityGroup[];
          const securityGroupIds = nonNullSecurityGroups.map(securityGroup => securityGroup.securityGroupId);

          this.validateAlbSubnetId(subnetIds, albItem.name);

          // Create application load balancer
          this.createApplicationLoadBalancer({
            vpcName: vpcItem.name,
            albItem,
            accessLogsBucketName,
            subnetIds,
            securityGroupIds,
            albMap,
            subnetMap,
            subnetLookups,
            securityGroupLookups,
            props,
          });
        }
      }
    }
    return albMap;
  }

  /**
   * Function to create Network Load Balancer
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param accessLogsBucketName string
   * @param nlbMap Map<string, {@link NetworkLoadBalancer}>
   * @param Map<string, {@link Subnet}>
   * @param props {@link AcceleratorStackProps}
   */
  private createNetworkLoadBalancer(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    accessLogsBucketName: string,
    nlbMap: Map<string, NetworkLoadBalancer>,
    subnetMap: Map<string, Subnet>,
    props: AcceleratorStackProps,
  ) {
    for (const nlbItem of vpcItem.loadBalancers?.networkLoadBalancers || []) {
      const subnetLookups = nlbItem.subnets.map(subnetName => subnetMap.get(`${vpcItem.name}_${subnetName}`));
      const nonNullsubnets = subnetLookups.filter(subnet => subnet) as Subnet[];
      const subnetIds = nonNullsubnets.map(subnet => subnet.subnetId);
      if (subnetIds.length === 0) {
        this.stack.addLogs(LogLevel.ERROR, `Could not find subnets for NLB Item ${nlbItem.name}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      const nlb = new NetworkLoadBalancer(this.stack, `${nlbItem.name}-${vpcItem.name}`, {
        name: nlbItem.name,
        ssmPrefix: props.prefixes.ssmParamName,
        appName: `${nlbItem.name}-${vpcItem.name}-app`,
        subnets: subnetIds,
        vpcName: vpcItem.name,
        scheme: nlbItem.scheme,
        deletionProtection: nlbItem.deletionProtection,
        crossZoneLoadBalancing: nlbItem.crossZoneLoadBalancing,
        accessLogsBucket: accessLogsBucketName,
      });
      nlbMap.set(`${vpcItem.name}_${nlbItem.name}`, nlb);

      for (const subnet of nlbItem.subnets || []) {
        const subnetLookup = subnetMap.get(`${vpcItem.name}_${subnet}`);
        if (subnetLookup) {
          nlb.node.addDependency(subnetLookup);
        }
      }

      this.stack.addSsmParameter({
        logicalId: `${nlbItem.name}-${vpcItem.name}-ssm`,
        parameterName: this.stack.getSsmPath(SsmResourceType.NLB, [vpcItem.name, nlbItem.name]),
        stringValue: nlb.networkLoadBalancerArn,
      });
    }
  }

  /**
   * Create network load balancers
   * @param vpcResources
   * @param subnetMap
   * @param props
   * @returns
   */
  private createNetworkLoadBalancers(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    subnetMap: Map<string, Subnet>,
    props: AcceleratorStackProps,
  ) {
    const nlbMap = new Map<string, NetworkLoadBalancer>();

    const accessLogsBucketName = `${
      this.stack.acceleratorResourceNames.bucketPrefixes.elbLogs
    }-${props.accountsConfig.getLogArchiveAccountId()}-${cdk.Stack.of(this.stack).region}`;

    for (const vpcItem of vpcResources) {
      // Set account IDs
      const principals = this.setNlbPrincipalIds(vpcItem, props);

      this.createNetworkLoadBalancer(vpcItem, accessLogsBucketName, nlbMap, subnetMap, props);

      if (
        cdk.Stack.of(this.stack).region === props.globalConfig.homeRegion &&
        vpcItem.loadBalancers?.networkLoadBalancers &&
        vpcItem.loadBalancers?.networkLoadBalancers.length > 0
      ) {
        new cdk.aws_iam.Role(this.stack, `GetNLBIPAddressLookup`, {
          roleName: `${props.prefixes.accelerator}-GetNLBIPAddressLookup`,
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

        NagSuppressions.addResourceSuppressionsByPath(this.stack, `/${this.stack.stackName}/GetNLBIPAddressLookup`, [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Allows only specific role arns.',
          },
        ]);
      }
    }
    return nlbMap;
  }

  /**
   * Set principal account IDs for a given VPC item
   * @param vpcItem
   * @param props
   * @returns
   */
  private setNlbPrincipalIds(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    props: AcceleratorStackProps,
  ): cdk.aws_iam.AccountPrincipal[] | void {
    if (!vpcItem.loadBalancers?.networkLoadBalancers || vpcItem.loadBalancers.networkLoadBalancers.length === 0) {
      return;
    }
    const vpcItemsWithTargetGroups = props.networkConfig.vpcs.filter(
      vpcItem => vpcItem.targetGroups && vpcItem.targetGroups.length > 0,
    );
    const vpcTemplatesWithTargetGroups =
      props.networkConfig.vpcTemplates?.filter(vpcItem => vpcItem.targetGroups && vpcItem.targetGroups.length > 0) ??
      [];
    const accountIdTargetsForVpcs = vpcItemsWithTargetGroups.map(vpcItem =>
      props.accountsConfig.getAccountId(vpcItem.account),
    );
    const accountIdTargetsForVpcTemplates =
      vpcTemplatesWithTargetGroups?.map(vpcTemplate =>
        this.stack.getAccountIdsFromDeploymentTarget(vpcTemplate.deploymentTargets),
      ) ?? [];
    const principalAccountIds = [...accountIdTargetsForVpcs, ...accountIdTargetsForVpcTemplates];
    principalAccountIds.push(cdk.Stack.of(this.stack).account);
    const principalIds = [...new Set(principalAccountIds)];

    return principalIds.map(accountId => new cdk.aws_iam.AccountPrincipal(accountId)) ?? undefined;
  }
}
