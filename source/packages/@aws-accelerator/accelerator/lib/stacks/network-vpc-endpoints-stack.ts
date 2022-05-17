/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import {
  AccountsConfig,
  GlobalConfig,
  NfwFirewallConfig,
  ResolverEndpointConfig,
  VpcConfig,
} from '@aws-accelerator/config';
import {
  IResourceShareItem,
  KeyLookup,
  NetworkFirewall,
  ResolverEndpoint,
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
  SecurityGroup,
  VpcEndpoint,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';

export class NetworkVpcEndpointsStack extends AcceleratorStack {
  private acceleratorKey: cdk.aws_kms.Key;
  private accountsConfig: AccountsConfig;
  private globalConfig: GlobalConfig;
  private logRetention: number;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set private properties
    this.accountsConfig = props.accountsConfig;
    this.globalConfig = props.globalConfig;
    this.logRetention = props.globalConfig.cloudwatchLogRetentionInDays;

    this.acceleratorKey = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    //
    // Store VPC, subnet, and route table IDs
    //
    const vpcMap = new Map<string, string>();
    const subnetMap = new Map<string, string>();
    const routeTableMap = new Map<string, string>();
    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = this.accountsConfig.getAccountId(vpcItem.account);
      if (accountId === cdk.Stack.of(this).account && vpcItem.region === cdk.Stack.of(this).region) {
        // Set VPC ID
        const vpcId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${vpcItem.name}/id`,
        );
        vpcMap.set(vpcItem.name, vpcId);

        // Set subnet IDs
        for (const subnetItem of vpcItem.subnets ?? []) {
          const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/subnet/${subnetItem.name}/id`,
          );
          subnetMap.set(`${vpcItem.name}_${subnetItem.name}`, subnetId);
        }

        // Set route table IDs
        for (const routeTableItem of vpcItem.routeTables ?? []) {
          const routeTableId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/vpc/${vpcItem.name}/routeTable/${routeTableItem.name}/id`,
          );
          routeTableMap.set(`${vpcItem.name}_${routeTableItem.name}`, routeTableId);
        }
      }
    }

    //
    // Iterate through VPCs in this account and region
    //
    const firewallMap = new Map<string, NetworkFirewall>();
    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      const accountId = this.accountsConfig.getAccountId(vpcItem.account);
      if (accountId === cdk.Stack.of(this).account && vpcItem.region === cdk.Stack.of(this).region) {
        const vpcId = vpcMap.get(vpcItem.name);
        if (!vpcId) {
          throw new Error(`[network-vpc-endpoints-stack] Unable to locate VPC ${vpcItem.name}`);
        }
        //
        // Create VPC endpoints
        //
        if (vpcItem.gatewayEndpoints) {
          this.createGatewayEndpoints(vpcItem, vpcId, routeTableMap);
        }

        if (vpcItem.interfaceEndpoints) {
          this.createInterfaceEndpoints(vpcItem, vpcId, subnetMap);
        }

        //
        // Create Network Firewalls
        //
        if (props.networkConfig.centralNetworkServices?.networkFirewall?.firewalls) {
          const firewalls = props.networkConfig.centralNetworkServices.networkFirewall.firewalls;

          for (const firewallItem of firewalls) {
            if (firewallItem.vpc === vpcItem.name) {
              const firewallSubnets: string[] = [];
              const delegatedAdminAccountId = this.accountsConfig.getAccountId(
                props.networkConfig.centralNetworkServices.delegatedAdminAccount,
              );
              let owningAccountId: string | undefined = undefined;

              // Check if this is not the delegated network admin account
              if (delegatedAdminAccountId !== cdk.Stack.of(this).account) {
                owningAccountId = delegatedAdminAccountId;
              }

              // Check if VPC has matching subnets
              for (const subnetItem of firewallItem.subnets) {
                const subnetKey = `${firewallItem.vpc}_${subnetItem}`;
                const subnetId = subnetMap.get(subnetKey);
                if (subnetId) {
                  firewallSubnets.push(subnetId);
                } else {
                  throw new Error(
                    `[network-vpc-endpoints-stack] Create Network Firewall: subnet ${subnetItem} not found in VPC ${firewallItem.vpc}`,
                  );
                }
              }

              // Create firewall
              if (firewallSubnets.length > 0) {
                const nfw = this.createNetworkFirewall(firewallItem, vpcId, firewallSubnets, owningAccountId);
                firewallMap.set(firewallItem.name, nfw);
              }
            }
          }
        }

        //
        // Create endpoint routes
        //
        for (const routeTableItem of vpcItem.routeTables ?? []) {
          // Check if endpoint routes exist
          for (const routeTableEntryItem of routeTableItem.routes ?? []) {
            const id =
              pascalCase(`${vpcItem.name}Vpc`) +
              pascalCase(`${routeTableItem.name}RouteTable`) +
              pascalCase(routeTableEntryItem.name);
            //
            // Network Firewall routes
            //
            if (routeTableEntryItem.type === 'networkFirewall') {
              const routeTableId = routeTableMap.get(`${vpcItem.name}_${routeTableItem.name}`);

              // Check if route table exists im map
              if (!routeTableId) {
                throw new Error(
                  `[network-vpc-endpoints-stack] Add Network Firewall route: unable to locate route table ${routeTableItem.name}`,
                );
              }

              // Check for AZ input
              if (!routeTableEntryItem.targetAvailabilityZone) {
                throw new Error(
                  `[network-vpc-endpoints-stack] Network Firewall route table entry ${routeTableEntryItem.name} must specify a target availability zone`,
                );
              }

              // Get Network Firewall and SSM parameter storing endpoint values
              const firewall = firewallMap.get(routeTableEntryItem.target);
              const endpointAz = `${cdk.Stack.of(this).region}${routeTableEntryItem.targetAvailabilityZone}`;

              if (!firewall) {
                throw new Error(
                  `[network-vpc-endpoints-stack] Unable to locate Network Firewall ${routeTableEntryItem.target}`,
                );
              }
              // Add route
              Logger.info(
                `[network-vpc-endpoints-stack] Adding Network Firewall Route Table Entry ${routeTableEntryItem.name}`,
              );
              const routeOptions = {
                id: id,
                destination: routeTableEntryItem.destination,
                endpointAz: endpointAz,
                firewallArn: firewall.firewallArn,
                kmsKey: this.acceleratorKey,
                logRetention: this.logRetention,
                routeTableId: routeTableId,
              };
              firewall.addNetworkFirewallRoute(routeOptions);
            }
          }
        }

        //
        // Create Route 53 Resolver Endpoints
        //
        if (props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints) {
          const delegatedAdminAccountId = this.accountsConfig.getAccountId(
            props.networkConfig.centralNetworkServices.delegatedAdminAccount,
          );
          const endpoints = props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints;

          // Check if the VPC has matching subnets
          for (const endpointItem of endpoints) {
            if (vpcItem.name === endpointItem.vpc) {
              const endpointSubnets: string[] = [];

              // Check if this is the delegated admin account
              if (accountId !== delegatedAdminAccountId) {
                throw new Error(
                  '[network-vpc-endpoints-stack] VPC for Route 53 Resolver endpoints must be located in the delegated network administrator account',
                );
              }

              for (const subnetItem of endpointItem.subnets) {
                const subnetKey = `${vpcItem.name}_${subnetItem}`;
                const subnetId = subnetMap.get(subnetKey);
                if (subnetId) {
                  endpointSubnets.push(subnetId);
                } else {
                  throw new Error(
                    `[network-vpc-endpoints-stack] Create Route 53 Resolver endpoint: subnet not found in VPC ${vpcItem.name}`,
                  );
                }
              }
              // Create endpoint
              if (endpointSubnets.length > 0) {
                this.createResolverEndpoint(endpointItem, vpcId, endpointSubnets);
              }
            }
          }
        }
      }
    }

    Logger.info('[network-vpc-endpoints-stack] Completed stack synthesis');
  }

  /**
   * Create a Network Firewall in the specified VPC and subnets.
   *
   * @param firewallItem
   * @param vpcId
   * @param subnets
   * @param owningAccountId
   * @returns
   */
  private createNetworkFirewall(
    firewallItem: NfwFirewallConfig,
    vpcId: string,
    subnets: string[],
    owningAccountId?: string,
  ): NetworkFirewall {
    // Get firewall policy ARN
    let policyArn: string;

    if (!owningAccountId) {
      policyArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/network/networkFirewall/policies/${firewallItem.firewallPolicy}/arn`,
      );
    } else {
      policyArn = this.getResourceShare(
        `${firewallItem.firewallPolicy}_NetworkFirewallPolicyShare`,
        'network-firewall:FirewallPolicy',
        owningAccountId,
      ).resourceShareItemArn;
    }

    Logger.info(`[network-vpc-endpoints-stack] Add Network Firewall ${firewallItem.name} to VPC ${firewallItem.vpc}`);
    const nfw = new NetworkFirewall(this, pascalCase(`${firewallItem.vpc}${firewallItem.name}NetworkFirewall`), {
      firewallPolicyArn: policyArn,
      name: firewallItem.name,
      description: firewallItem.description,
      subnets: subnets,
      vpcId: vpcId,
      deleteProtection: firewallItem.deleteProtection,
      firewallPolicyChangeProtection: firewallItem.firewallPolicyChangeProtection,
      subnetChangeProtection: firewallItem.subnetChangeProtection,
      tags: firewallItem.tags ?? [],
    });
    // Create SSM parameters
    new cdk.aws_ssm.StringParameter(
      this,
      pascalCase(`SsmParam${pascalCase(firewallItem.vpc) + pascalCase(firewallItem.name)}FirewallArn`),
      {
        parameterName: `/accelerator/network/vpc/${firewallItem.vpc}/networkFirewall/${firewallItem.name}/arn`,
        stringValue: nfw.firewallArn,
      },
    );

    // Add logging configurations
    let firewallLogBucket: cdk.aws_s3.IBucket | undefined;
    const destinationConfigs: cdk.aws_networkfirewall.CfnLoggingConfiguration.LogDestinationConfigProperty[] = [];
    for (const logItem of firewallItem.loggingConfiguration ?? []) {
      if (logItem.destination === 'cloud-watch-logs') {
        // Create log group and log configuration
        Logger.info(
          `[network-vpc-endpoints-stack] Add CloudWatch ${logItem.type} logs for Network Firewall ${firewallItem.name}`,
        );
        const logGroup = new cdk.aws_logs.LogGroup(this, pascalCase(`${firewallItem.name}${logItem.type}LogGroup`), {
          encryptionKey: this.acceleratorKey,
          retention: this.logRetention,
        });
        destinationConfigs.push({
          logDestination: {
            logGroup: logGroup.logGroupName,
          },
          logDestinationType: 'CloudWatchLogs',
          logType: logItem.type,
        });
      }

      if (logItem.destination === 's3') {
        Logger.info(
          `[network-vpc-endpoints-stack] Add S3 ${logItem.type} logs for Network Firewall ${firewallItem.name}`,
        );

        if (!firewallLogBucket) {
          firewallLogBucket = cdk.aws_s3.Bucket.fromBucketName(
            this,
            'FirewallLogsBucket',
            `aws-accelerator-central-logs-${this.accountsConfig.getLogArchiveAccountId()}-${
              this.globalConfig.homeRegion
            }`,
          );
        }

        destinationConfigs.push({
          logDestination: {
            bucketName: firewallLogBucket.bucketName,
          },
          logDestinationType: 'S3',
          logType: logItem.type,
        });
      }
    }

    // Add logging configuration
    const config = {
      logDestinationConfigs: destinationConfigs,
    };
    nfw.addLogging(config);

    return nfw;
  }

  /**
   * Create gateway endpoints for the specified VPC.
   *
   * @param vpcItem
   * @param vpc
   * @param routeTableMap
   * @param organizationId
   */
  private createGatewayEndpoints(
    vpcItem: VpcConfig,
    vpcId: string,
    routeTableMap: Map<string, string>,
    //organizationId?: string,
  ): void {
    // Create a list of related route tables that will need to be updated with the gateway routes
    const s3EndpointRouteTables: string[] = [];
    const dynamodbEndpointRouteTables: string[] = [];
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTableKey = `${vpcItem.name}_${routeTableItem.name}`;
      const routeTableId = routeTableMap.get(routeTableKey);

      if (!routeTableId) {
        throw new Error(`[network-vpc-endpoints-stack] Route Table ${routeTableItem.name} not found`);
      }

      for (const routeTableEntryItem of routeTableItem.routes ?? []) {
        // Route: S3 Gateway Endpoint
        if (routeTableEntryItem.target === 's3') {
          if (!s3EndpointRouteTables.find(item => item === routeTableId)) {
            s3EndpointRouteTables.push(routeTableId);
          }
        }

        // Route: DynamoDb Gateway Endpoint
        if (routeTableEntryItem.target === 'dynamodb') {
          if (!dynamodbEndpointRouteTables.find(item => item === routeTableId)) {
            dynamodbEndpointRouteTables.push(routeTableId);
          }
        }
      }
    }

    //
    // Add Gateway Endpoints (AWS Services)
    //
    for (const gatewayEndpointItem of vpcItem.gatewayEndpoints ?? []) {
      Logger.info(`[network-vpc-endpoints-stack] Adding Gateway Endpoint for ${gatewayEndpointItem}`);

      if (gatewayEndpointItem === 's3') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem), {
          vpcId,
          vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem,
          routeTables: s3EndpointRouteTables,
          //policyDocument: this.createVpcEndpointPolicy(gatewayEndpointItem, organizationId),
        });
      }
      if (gatewayEndpointItem === 'dynamodb') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem), {
          vpcId,
          vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem,
          routeTables: dynamodbEndpointRouteTables,
          //policyDocument: this.createVpcEndpointPolicy(gatewayEndpointItem, organizationId),
        });
      }
    }
  }

  /**
   * Create interface endpoints for the specified VPC.
   *
   * @param vpcItem
   * @param vpc
   * @param subnetMap
   */
  private createInterfaceEndpoints(
    vpcItem: VpcConfig,
    vpcId: string,
    subnetMap: Map<string, string>,
    //organizationId?: string,
  ): void {
    //
    // Add Interface Endpoints (AWS Services)
    //
    // Create list of subnet IDs for each interface endpoint
    const subnets: string[] = [];
    for (const subnetItem of vpcItem.interfaceEndpoints?.subnets ?? []) {
      const subnetKey = `${vpcItem.name}_${subnetItem}`;
      const subnet = subnetMap.get(subnetKey);
      if (subnet) {
        subnets.push(subnet);
      } else {
        throw new Error(
          `[network-vpc-endpoints-stack] Attempting to add interface endpoints to subnet that does not exist (${subnetItem})`,
        );
      }
    }

    // Create the interface endpoint
    const securityGroupMap = new Map<string, SecurityGroup>();
    let endpointSg: SecurityGroup | undefined;
    let port: number;
    let trafficType: string;
    for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
      Logger.info(`[network-vpc-endpoints-stack] Adding Interface Endpoint for ${endpointItem}`);

      if (endpointItem !== 'cassandra') {
        endpointSg = securityGroupMap.get('https');
        port = 443;
        trafficType = 'https';
      } else {
        endpointSg = securityGroupMap.get('cassandra');
        port = 9142;
        trafficType = 'cassandra';
      }

      if (!endpointSg) {
        // Create Security Group if it doesn't exist
        Logger.info(
          `[network-vpc-endpoints-stack] Adding Security Group to VPC ${vpcItem.name} for interface endpoints -- ${trafficType} traffic`,
        );
        const securityGroup = new SecurityGroup(this, pascalCase(`${vpcItem.name}Vpc${trafficType}EpSecurityGroup`), {
          securityGroupName: `interface_ep_${trafficType}_sg`,
          description: `Security group for interface endpoints -- ${trafficType} traffic`,
          vpcId,
        });
        endpointSg = securityGroup;
        securityGroupMap.set(trafficType, securityGroup);

        // Add ingress and egress CIDRs
        let ingressRuleIndex = 0; // Used increment ingressRule id
        for (const ingressCidr of vpcItem.interfaceEndpoints?.allowedCidrs || ['0.0.0.0/0']) {
          const ingressRuleId = `interface_ep_${trafficType}_sg-Ingress-${ingressRuleIndex++}`;
          Logger.info(
            `[network-vpc-endpoints-stack] Adding ingress cidr ${ingressCidr} TCP:${port} to ${ingressRuleId}`,
          );
          endpointSg.addIngressRule(ingressRuleId, {
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: port,
            toPort: port,
            cidrIp: ingressCidr,
          });

          // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
          // rule suppression with evidence for this permission.
          if (ingressCidr === '0.0.0.0/0') {
            NagSuppressions.addResourceSuppressionsByPath(
              this,
              `${this.stackName}/${pascalCase(vpcItem.name)}Vpc${trafficType}EpSecurityGroup/${ingressRuleId}`,
              [
                {
                  id: 'AwsSolutions-EC23',
                  reason: 'Allowed access for interface endpoints',
                },
              ],
            );
          }
        }

        // Adding Egress '127.0.0.1/32' to avoid default Egress rule
        securityGroup.addEgressRule(`interface_ep_${trafficType}_sg-Egress`, {
          ipProtocol: cdk.aws_ec2.Protocol.ALL,
          cidrIp: '127.0.0.1/32',
        });
      }

      // Create the interface endpoint
      const endpoint = new VpcEndpoint(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem)}Ep`, {
        vpcId,
        vpcEndpointType: cdk.aws_ec2.VpcEndpointType.INTERFACE,
        service: endpointItem,
        subnets,
        securityGroups: [endpointSg],
        privateDnsEnabled: false,
        //policyDocument: this.createVpcEndpointPolicy(endpointItem, organizationId),
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${vpcItem.name}${endpointItem}Dns`), {
        parameterName: `/accelerator/network/vpc/${vpcItem.name}/endpoints/${endpointItem}/dns`,
        stringValue: endpoint.dnsName!,
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${vpcItem.name}${endpointItem}Phz`), {
        parameterName: `/accelerator/network/vpc/${vpcItem.name}/endpoints/${endpointItem}/hostedZoneId`,
        stringValue: endpoint.hostedZoneId!,
      });
    }
  }

  //
  // Create Route 53 Resolver endpoints
  //
  private createResolverEndpoint(endpointItem: ResolverEndpointConfig, vpcId: string, subnets: string[]): void {
    // Validate there are no rules associated with an inbound endpoint
    if (endpointItem.type === 'INBOUND' && endpointItem.rules) {
      throw new Error('[network-vpc-endpoints-stack] Route 53 Resolver inbound endpoints cannot have rules.');
    }

    // Create security group
    Logger.info(
      `[network-vpc-endpoints-stack] Adding Security Group for Route 53 Resolver endpoint ${endpointItem.name}`,
    );
    const securityGroup = new SecurityGroup(this, pascalCase(`${endpointItem.name}EpSecurityGroup`), {
      securityGroupName: `ep_${endpointItem.name}_sg`,
      description: `AWS Route 53 Resolver endpoint - ${endpointItem.name}`,
      vpcId,
    });

    if (endpointItem.type === 'INBOUND') {
      let ingressRuleIndex = 0; // Used increment ingressRule id

      for (const ingressCidr of endpointItem.allowedCidrs || ['0.0.0.0/0']) {
        const port = 53;

        let ingressRuleId = `ep_${endpointItem.name}_sg-Ingress-${ingressRuleIndex++}`;
        Logger.info(`[network-vpc-endpoints-stack] Adding ingress cidr ${ingressCidr} TCP:${port} to ${ingressRuleId}`);
        securityGroup.addIngressRule(ingressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: port,
          toPort: port,
          cidrIp: ingressCidr,
        });

        if (ingressCidr === '0.0.0.0/0') {
          // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(`${endpointItem.name}EpSecurityGroup`)}/${ingressRuleId}`,
            [
              {
                id: 'AwsSolutions-EC23',
                reason: 'Allowed access for TCP and UDP',
              },
            ],
          );
        }

        ingressRuleId = `ep_${endpointItem.name}_sg-Ingress-${ingressRuleIndex++}`;
        Logger.info(`[network-vpc-endpoints-stack] Adding ingress cidr ${ingressCidr} UDP:${port} to ${ingressRuleId}`);
        securityGroup.addIngressRule(ingressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: port,
          toPort: port,
          cidrIp: ingressCidr,
        });

        if (ingressCidr === '0.0.0.0/0') {
          // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(`${endpointItem.name}EpSecurityGroup`)}/${ingressRuleId}`,
            [
              {
                id: 'AwsSolutions-EC23',
                reason: 'Allowed access for TCP and UDP',
              },
            ],
          );
        }
      }

      // Adding Egress '127.0.0.1/32' to avoid default Egress rule
      securityGroup.addEgressRule(`ep_${endpointItem.name}_sg-Egress`, {
        ipProtocol: cdk.aws_ec2.Protocol.ALL,
        cidrIp: '127.0.0.1/32',
      });
    } else {
      let egressRuleIndex = 0;

      // Check if non-standard ports exist in rules
      const portMap = new Map<string, string>();
      for (const ruleItem of endpointItem.rules ?? []) {
        for (const targetItem of ruleItem.targetIps ?? []) {
          if (targetItem.port) {
            portMap.set(targetItem.ip, targetItem.port);
          }
        }
      }

      for (const egressCidr of endpointItem.allowedCidrs || ['0.0.0.0/0']) {
        let port = 53;
        const nonStandardPort = portMap.get(egressCidr.split('/')[0]); //Split at the prefix to match target IP

        // Check if mapping includes non-standard port
        if (nonStandardPort) {
          port = +nonStandardPort;
        }

        let egressRuleId = `ep_${endpointItem.name}_sg-Egress-${egressRuleIndex++}`;
        Logger.info(`[network-vpc-endpoints-stack] Adding egress cidr ${egressCidr} TCP:${port} to ${egressRuleId}`);
        securityGroup.addEgressRule(egressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: port,
          toPort: port,
          cidrIp: egressCidr,
        });

        egressRuleId = `ep_${endpointItem.name}_sg-Egress-${egressRuleIndex++}`;
        Logger.info(`[network-vpc-endpoints-stack] Adding egress cidr ${egressCidr} UDP:${port} to ${egressRuleId}`);
        securityGroup.addEgressRule(egressRuleId, {
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: port,
          toPort: port,
          cidrIp: egressCidr,
        });
      }
    }

    Logger.info(
      `[network-vpc-endpoints-stack] Add Route 53 Resolver ${endpointItem.type} endpoint ${endpointItem.name}`,
    );
    const endpoint = new ResolverEndpoint(this, `${pascalCase(endpointItem.name)}ResolverEndpoint`, {
      direction: endpointItem.type,
      ipAddresses: subnets,
      name: endpointItem.name,
      securityGroupIds: [securityGroup.securityGroupId],
      tags: endpointItem.tags ?? [],
    });
    new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${endpointItem.name}ResolverEndpoint`), {
      parameterName: `/accelerator/network/route53Resolver/endpoints/${endpointItem.name}/id`,
      stringValue: endpoint.endpointId,
    });
  }

  /**
   * Get the resource ID from a RAM share.
   *
   * @param resourceShareName
   * @param itemType
   * @param owningAccountId
   */
  private getResourceShare(resourceShareName: string, itemType: string, owningAccountId: string): IResourceShareItem {
    // Generate a logical ID
    const resourceName = resourceShareName.split('_')[0];
    const logicalId = `${resourceName}${itemType.split(':')[1]}`;

    // Lookup resource share
    const resourceShare = ResourceShare.fromLookup(this, pascalCase(`${logicalId}Share`), {
      resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
      resourceShareName: resourceShareName,
      owningAccountId,
    });

    // Represents the item shared by RAM
    const item = ResourceShareItem.fromLookup(this, pascalCase(`${logicalId}`), {
      resourceShare,
      resourceShareItemType: itemType,
      kmsKey: this.acceleratorKey,
      logRetentionInDays: this.logRetention,
    });
    return item;
  }
}
