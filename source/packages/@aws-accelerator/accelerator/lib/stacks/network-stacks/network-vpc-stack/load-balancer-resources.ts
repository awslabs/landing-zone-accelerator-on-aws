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

import { GwlbConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import {
  ApplicationLoadBalancer,
  GatewayLoadBalancer,
  NetworkLoadBalancer,
  SecurityGroup,
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
  public readonly gwlbRoleMap: Map<string, cdk.aws_iam.Role>;
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
    this.gwlbRoleMap = this.createGwlbRoles(this.stack.vpcsInScope, props);
    this.gwlbMap = this.createGwlbs(this.stack.vpcsInScope, subnetMap, props);

    // Create ALBs
    this.albMap = this.createApplicationLoadBalancers(this.stack.vpcsInScope, subnetMap, securityGroupMap, props);

    // Create NLBs
    this.nlbMap = this.createNetworkLoadBalancers(this.stack.vpcsInScope, subnetMap, props);
  }

  /**
   * Create GWLB cross-account access roles as needed
   * @param vpcResources
   * @param props
   * @returns
   */
  private createGwlbRoles(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    props: AcceleratorStackProps,
  ): Map<string, cdk.aws_iam.Role> {
    const gwlbRoleMap = new Map<string, cdk.aws_iam.Role>();

    for (const vpcItem of vpcResources) {
      for (const loadBalancerItem of props.networkConfig.centralNetworkServices?.gatewayLoadBalancers ?? []) {
        if (vpcItem.name === loadBalancerItem.vpc) {
          const role = this.createGwlbRole(loadBalancerItem, props);

          // Add role to map if it exists
          if (role) {
            gwlbRoleMap.set(loadBalancerItem.name, role);
          }
        }
      }
    }
    return gwlbRoleMap;
  }

  /**
   * Create GWLB cross-account role
   * @param loadBalancerItem
   * @param props
   * @returns
   */
  private createGwlbRole(loadBalancerItem: GwlbConfig, props: AcceleratorStackProps): cdk.aws_iam.Role | undefined {
    const allowedPrincipals = this.setGwlbAllowedPrincipals(loadBalancerItem, props);

    // Create cross-account role
    if (allowedPrincipals.length > 0) {
      const principals: cdk.aws_iam.PrincipalBase[] = [];
      allowedPrincipals.forEach(accountId => {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      });
      const role = new cdk.aws_iam.Role(this.stack, `Get${pascalCase(loadBalancerItem.name)}SsmParamRole`, {
        roleName: `${props.prefixes.accelerator}-Get${pascalCase(loadBalancerItem.name)}SsmParamRole-${
          cdk.Stack.of(this.stack).region
        }`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameter'],
                resources: [
                  `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.prefixes.ssmParamName}/network/gwlb/${loadBalancerItem.name}/*`,
                ],
              }),
            ],
          }),
        },
      });
      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressions(role, [
        { id: 'AwsSolutions-IAM5', reason: 'Allow cross-account resources to get SSM parameters under this path.' },
      ]);

      return role;
    }
    return undefined;
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
    const accessLogsBucket = `${
      this.stack.acceleratorResourceNames.bucketPrefixes.elbLogs
    }-${props.accountsConfig.getLogArchiveAccountId()}-${cdk.Stack.of(this.stack).region}`;

    for (const vpcItem of vpcResources) {
      for (const albItem of vpcItem.loadBalancers?.applicationLoadBalancers || []) {
        const subnetLookups = albItem.subnets.map(subnetName => subnetMap.get(`${vpcItem.name}_${subnetName}`));
        const nonNullsubnets = subnetLookups.filter(subnet => subnet) as Subnet[];
        const subnetIds = nonNullsubnets.map(subnet => subnet.subnetId);
        const securityGroupLookups = albItem.securityGroups.map(securityGroupName =>
          securityGroupMap.get(`${vpcItem.name}_${securityGroupName}`),
        );
        const nonNullSecurityGroups = securityGroupLookups.filter(group => group) as SecurityGroup[];
        const securityGroupIds = nonNullSecurityGroups.map(securityGroup => securityGroup.securityGroupId);
        if (subnetIds.length === 0) {
          this.stack.addLogs(LogLevel.ERROR, `Could not find subnets for ALB Item ${albItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        const alb = new ApplicationLoadBalancer(this.stack, `${albItem.name}-${vpcItem.name}`, {
          name: albItem.name,
          subnets: subnetIds,
          securityGroups: securityGroupIds ?? undefined,
          scheme: albItem.scheme ?? 'internal',
          accessLogsBucket,
          attributes: albItem.attributes ?? undefined,
        });
        albMap.set(`${vpcItem.name}_${albItem.name}`, alb);

        for (const subnet of albItem.subnets || []) {
          const subnetLookup = subnetMap.get(`${vpcItem.name}_${subnet}`);
          if (subnetLookup) {
            alb.node.addDependency(subnetLookup);
          }
        }
        for (const subnet of subnetLookups || []) {
          if (subnet) {
            alb.node.addDependency(subnet);
          }
        }

        for (const securityGroup of securityGroupLookups || []) {
          if (securityGroup) {
            alb.node.addDependency(securityGroup);
          }
        }

        this.stack.addSsmParameter({
          logicalId: `${albItem.name}-${vpcItem.name}-ssm`,
          parameterName: this.stack.getSsmPath(SsmResourceType.ALB, [vpcItem.name, albItem.name]),
          stringValue: alb.applicationLoadBalancerArn,
        });
      }
    }
    return albMap;
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

    const accessLogsBucket = `${
      this.stack.acceleratorResourceNames.bucketPrefixes.elbLogs
    }-${props.accountsConfig.getLogArchiveAccountId()}-${cdk.Stack.of(this.stack).region}`;

    for (const vpcItem of vpcResources) {
      // Set account IDs
      const principals = this.setNlbPrincipalIds(vpcItem, props);

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
          appName: `${nlbItem.name}-${vpcItem.name}-app`,
          subnets: subnetIds,
          vpcName: vpcItem.name,
          scheme: nlbItem.scheme,
          deletionProtection: nlbItem.deletionProtection,
          crossZoneLoadBalancing: nlbItem.crossZoneLoadBalancing,
          accessLogsBucket,
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
