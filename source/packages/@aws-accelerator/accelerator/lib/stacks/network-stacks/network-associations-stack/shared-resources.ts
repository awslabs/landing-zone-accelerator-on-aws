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

import {
  ApplicationLoadBalancer,
  IIpamSubnet,
  IpamSubnet,
  SecurityGroup,
  TargetGroup,
} from '@aws-accelerator/constructs';
import { ApplicationLoadBalancerConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { setIpamSubnetSourceArray } from '../utils/security-group-utils';
import { NetworkAssociationsStack } from './network-associations-stack';

export class SharedResources {
  public readonly sharedSecurityGroupMap: Map<string, SecurityGroup>;

  private stack: NetworkAssociationsStack;

  constructor(
    networkAssociationsStack: NetworkAssociationsStack,
    vpcMap: Map<string, string>,
    prefixListMap: Map<string, string>,
    targetGroupMap: Map<string, TargetGroup>,
    props: AcceleratorStackProps,
  ) {
    this.stack = networkAssociationsStack;

    // Retrieve and look up IPAM subnets
    const ipamSubnets = setIpamSubnetSourceArray(this.stack.vpcResources, this.stack.sharedVpcs);
    const ipamSubnetMap = this.lookupIpamSubnets(ipamSubnets, props);

    this.sharedSecurityGroupMap = this.stack.createSecurityGroups(
      this.stack.sharedVpcs,
      vpcMap,
      ipamSubnetMap,
      prefixListMap,
    );
    const albMap = this.createApplicationLoadBalancers(props);
    this.createSharedAlbListeners(albMap, targetGroupMap);
  }

  /**
   * Lookup IPAM subnets for a given array of subnet keys
   * @param ipamSubnets
   * @param props
   * @returns
   */
  private lookupIpamSubnets(ipamSubnets: string[], props: AcceleratorStackProps): Map<string, IIpamSubnet> {
    const ipamSubnetMap = new Map<string, IIpamSubnet>();

    for (const subnetKey of ipamSubnets) {
      const stringSplit = subnetKey.split('_');
      const vpcName = stringSplit[0];
      const accountName = stringSplit[1];
      const subnetName = stringSplit[2];
      const mapKey = `${vpcName}_${subnetName}`;

      // Lookup IPAM subnet
      this.stack.addLogs(
        LogLevel.INFO,
        `Retrieve IPAM Subnet CIDR for account:[${accountName}] vpc:[${vpcName}] subnet:[${subnetName}] in region:[${
          cdk.Stack.of(this.stack).region
        }]`,
      );
      const accountId = props.accountsConfig.getAccountId(accountName);
      const subnet = IpamSubnet.fromLookup(this.stack, pascalCase(`${vpcName}${subnetName}IpamSubnetLookup`), {
        owningAccountId: accountId,
        ssmSubnetIdPath: this.stack.getSsmPath(SsmResourceType.SUBNET, [vpcName, subnetName]),
        region: cdk.Stack.of(this.stack).region,
        roleName: this.stack.acceleratorResourceNames.roles.ipamSubnetLookup,
        kmsKey: this.stack.cloudwatchKey,
        logRetentionInDays: this.stack.logRetention,
      });
      ipamSubnetMap.set(mapKey, subnet);
    }
    return ipamSubnetMap;
  }

  /**
   * Create application load balancers
   * @param props
   * @returns
   */
  private createApplicationLoadBalancers(props: AcceleratorStackProps): Map<string, ApplicationLoadBalancer> {
    const albMap = new Map<string, ApplicationLoadBalancer>();
    const sharedSubnets: string[] = [];
    const sharedSubnetMap = new Map<string, string>();
    const accessLogsBucketName = `${
      this.stack.acceleratorResourceNames.bucketPrefixes.elbLogs
    }-${props.accountsConfig.getLogArchiveAccountId()}-${cdk.Stack.of(this.stack).region}`;
    for (const vpcItem of this.stack.vpcResources) {
      const subnets = vpcItem.subnets?.filter(subnetItem => subnetItem.shareTargets) ?? [];
      for (const subnetItem of subnets) {
        sharedSubnets.push(subnetItem.name);
      }
      for (const albItem of vpcItem.loadBalancers?.applicationLoadBalancers || []) {
        if (albItem.shareTargets) {
          const sharedAlb = this.stack.checkResourceShare(albItem.shareTargets);
          if (sharedAlb && vpcItem.region === cdk.Stack.of(this.stack).region) {
            for (const subnetItem of albItem.subnets ?? []) {
              const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this.stack,
                `${this.stack.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem])}`,
              ).toString();
              sharedSubnetMap.set(`${vpcItem.name}_${subnetItem}`, subnetId);
            }
            const securityGroupLookups = albItem.securityGroups.map(securityGroupName =>
              this.sharedSecurityGroupMap.get(`${vpcItem.name}_${securityGroupName}`),
            );
            const nonNullSecurityGroups = securityGroupLookups.filter(group => group) as SecurityGroup[];
            const securityGroupIds = nonNullSecurityGroups.map(securityGroup => securityGroup.securityGroupId);
            const subnetIds = albItem.subnets.map(subnetName =>
              sharedSubnetMap.get(`${vpcItem.name}_${subnetName}`),
            ) as string[];
            this.createApplicationLoadBalancer({
              vpcName: vpcItem.name,
              albItem,
              accessLogsBucketName,
              subnetIds,
              securityGroupIds,
              albMap,
              securityGroupLookups,
              props,
            });
          }
        }
      }
    }
    return albMap;
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
   * Function to create Application LoadBalancer listeners
   * @param vpcItem {@link VpcConfig } | {@link VpcTemplatesConfig}
   * @param albItem {@link ApplicationLoadBalancerConfig}
   * @param albArn string
   * @param targetGroupMap Map<string, TargetGroup>
   * @param listenerMap Map<string, {@link cdk.aws_elasticloadbalancingv2.CfnListener}>
   */
  private createSharedApplicationLoadBalancerListeners(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    albItem: ApplicationLoadBalancerConfig,
    albMap: Map<string, ApplicationLoadBalancer>,
    targetGroupMap: Map<string, TargetGroup>,
    listenerMap: Map<string, cdk.aws_elasticloadbalancingv2.CfnListener>,
  ): void {
    for (const listener of albItem.listeners ?? []) {
      if (albItem.shareTargets) {
        const sharedAlb = this.stack.checkResourceShare(albItem.shareTargets);
        if (sharedAlb && vpcItem.region === cdk.Stack.of(this.stack).region) {
          const targetGroup = targetGroupMap.get(`${vpcItem.name}-${listener.targetGroup}`);
          if (!targetGroup) {
            this.stack.addLogs(
              LogLevel.ERROR,
              `The Listener ${listener.name} contains an invalid target group name ${listener.targetGroup} please ensure that the the target group name references a valid target group`,
            );
            throw new Error(`Configuration validation failed at runtime.`);
          }
          const listenerAction: cdk.aws_elasticloadbalancingv2.CfnListener.ActionProperty =
            this.stack.getListenerAction(listener, targetGroup.targetGroupArn);

          const albValue = albMap.get(`${vpcItem.name}_${albItem.name}`);

          const listenerResource = new cdk.aws_elasticloadbalancingv2.CfnListener(
            this.stack,
            pascalCase(`Listener${vpcItem.name}${albItem.name}${listener.name}`),
            {
              defaultActions: [listenerAction],
              loadBalancerArn: albValue?.applicationLoadBalancerArn as string,
              certificates: [{ certificateArn: this.stack.getCertificate(listener.certificate) }],
              port: listener.port,
              protocol: listener.protocol,
              sslPolicy: listener.sslPolicy!,
            },
          );
          listenerMap.set(`${vpcItem.name}-${albItem.name}-${listener.name}`, listenerResource);
        }
      }
    }
  }

  private createSharedAlbListeners(
    albMap: Map<string, ApplicationLoadBalancer>,
    targetGroupMap: Map<string, TargetGroup>,
  ) {
    try {
      const listenerMap = new Map<string, cdk.aws_elasticloadbalancingv2.CfnListener>();
      for (const vpcItem of this.stack.vpcResources) {
        for (const albItem of vpcItem.loadBalancers?.applicationLoadBalancers ?? []) {
          if (this.stack.region === vpcItem.region) {
            this.createSharedApplicationLoadBalancerListeners(vpcItem, albItem, albMap, targetGroupMap, listenerMap);
          }
        }
      }
      return listenerMap;
    } catch (err) {
      this.stack.addLogs(LogLevel.ERROR, `${err}`);
      throw err;
    }
  }
}
