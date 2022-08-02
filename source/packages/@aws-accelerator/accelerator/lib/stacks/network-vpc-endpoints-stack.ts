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

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

import {
  AccountsConfig,
  GatewayEndpointServiceConfig,
  GlobalConfig,
  InterfaceEndpointServiceConfig,
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
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
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
    const firewallLogBucket = cdk.aws_s3.Bucket.fromBucketName(
      this,
      'FirewallLogsBucket',
      `aws-accelerator-central-logs-${this.accountsConfig.getLogArchiveAccountId()}-${this.globalConfig.homeRegion}`,
    );
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
                const nfw = this.createNetworkFirewall(
                  firewallItem,
                  vpcId,
                  firewallSubnets,
                  firewallLogBucket,
                  owningAccountId,
                );
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
            const endPointId =
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

              if (!routeTableEntryItem.target) {
                throw new Error(
                  `[network-vpc-endpoints-stack] Network Firewall route ${routeTableEntryItem.name} for route table ${routeTableItem.name} must include a target`,
                );
              }

              // Check for AZ input
              if (!routeTableEntryItem.targetAvailabilityZone) {
                throw new Error(
                  `[network-vpc-endpoints-stack] Network Firewall route table entry ${routeTableEntryItem.name} must specify a target availability zone`,
                );
              }

              // Check if using a CIDR or prefix list as the destination
              if (routeTableEntryItem.destinationPrefixList) {
                throw new Error(
                  `[network-vpc-endpoints-stack] ${routeTableEntryItem.name} using destinationPrefixList. Prefix list destinations cannot be used for networkFirewall targets.`,
                );
              }
              if (!routeTableEntryItem.destination) {
                throw new Error(
                  `[network-vpc-endpoints-stack] ${routeTableEntryItem.name} does not have a destination defined`,
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
              firewall.addNetworkFirewallRoute(
                endPointId,
                routeTableEntryItem.destination,
                endpointAz,
                this.acceleratorKey,
                this.logRetention,
                routeTableId,
              );
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
    firewallLogBucket: cdk.aws_s3.IBucket,
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
    for (const gatewayEndpointItem of vpcItem.gatewayEndpoints?.endpoints ?? []) {
      Logger.info(`[network-vpc-endpoints-stack] Adding Gateway Endpoint for ${gatewayEndpointItem.service}`);

      if (gatewayEndpointItem.service === 's3') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem.service), {
          vpcId,
          vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem.service,
          routeTables: s3EndpointRouteTables,
          policyDocument: this.createVpcEndpointPolicy(vpcItem, gatewayEndpointItem, true),
        });
      }
      if (gatewayEndpointItem.service === 'dynamodb') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem.service), {
          vpcId,
          vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem.service,
          routeTables: dynamodbEndpointRouteTables,
          policyDocument: this.createVpcEndpointPolicy(vpcItem, gatewayEndpointItem, true),
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
    const privateDnsValue = !vpcItem.interfaceEndpoints?.central ?? true;

    for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
      Logger.info(`[network-vpc-endpoints-stack] Adding Interface Endpoint for ${endpointItem.service}`);

      if (endpointItem.service !== 'cassandra') {
        endpointSg = securityGroupMap.get('https');
        port = 443;
        trafficType = 'https';
      } else {
        endpointSg = securityGroupMap.get('cassandra');
        port = 9142;
        trafficType = 'cassandra';
      }

      // Create Security Group if it doesn't exist
      if (!endpointSg) {
        const ingressRules: SecurityGroupIngressRuleProps[] = [];
        const egressRules: SecurityGroupEgressRuleProps[] = [];
        let includeNagSuppression = false;

        // Add ingress and egress CIDRs
        for (const ingressCidr of vpcItem.interfaceEndpoints?.allowedCidrs || ['0.0.0.0/0']) {
          Logger.info(
            `[network-vpc-endpoints-stack] Interface endpoints: adding ingress cidr ${ingressCidr} TCP:${port}`,
          );
          ingressRules.push({
            ipProtocol: cdk.aws_ec2.Protocol.TCP,
            fromPort: port,
            toPort: port,
            cidrIp: ingressCidr,
          });

          // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
          // rule suppression with evidence for this permission.
          if (ingressCidr === '0.0.0.0/0') {
            includeNagSuppression = true;
          }
        }

        // Adding Egress '127.0.0.1/32' to avoid default Egress rule
        egressRules.push({
          ipProtocol: cdk.aws_ec2.Protocol.ALL,
          cidrIp: '127.0.0.1/32',
        });

        // Create Security Group
        Logger.info(
          `[network-vpc-endpoints-stack] Adding Security Group to VPC ${vpcItem.name} for interface endpoints -- ${trafficType} traffic`,
        );
        const securityGroup = new SecurityGroup(this, pascalCase(`${vpcItem.name}Vpc${trafficType}EpSecurityGroup`), {
          securityGroupName: `interface_ep_${trafficType}_sg`,
          securityGroupEgress: egressRules,
          securityGroupIngress: ingressRules,
          description: `Security group for interface endpoints -- ${trafficType} traffic`,
          vpcId,
        });
        endpointSg = securityGroup;
        securityGroupMap.set(trafficType, securityGroup);

        // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
        // rule suppression with evidence for this permission.
        if (includeNagSuppression) {
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(vpcItem.name)}Vpc${trafficType}EpSecurityGroup`,
            [
              {
                id: 'AwsSolutions-EC23',
                reason: 'Allowed access for interface endpoints',
              },
            ],
          );
        }
      }

      // Create the interface endpoint
      const endpoint = new VpcEndpoint(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}Ep`, {
        vpcId,
        vpcEndpointType: cdk.aws_ec2.VpcEndpointType.INTERFACE,
        service: endpointItem.service,
        subnets,
        securityGroups: [endpointSg],
        privateDnsEnabled: privateDnsValue,
        policyDocument: this.createVpcEndpointPolicy(vpcItem, endpointItem),
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Dns`), {
        parameterName: `/accelerator/network/vpc/${vpcItem.name}/endpoints/${endpointItem.service}/dns`,
        stringValue: endpoint.dnsName!,
      });
      new cdk.aws_ssm.StringParameter(this, pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Phz`), {
        parameterName: `/accelerator/network/vpc/${vpcItem.name}/endpoints/${endpointItem.service}/hostedZoneId`,
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

    // Begin creation of Route 53 resolver endpoint
    Logger.info(
      `[network-vpc-endpoints-stack] Add Route 53 Resolver ${endpointItem.type} endpoint ${endpointItem.name}`,
    );
    const ingressRules: SecurityGroupIngressRuleProps[] = [];
    const egressRules: SecurityGroupEgressRuleProps[] = [];
    let includeNagSuppression = false;

    if (endpointItem.type === 'INBOUND') {
      for (const ingressCidr of endpointItem.allowedCidrs || ['0.0.0.0/0']) {
        const port = 53;

        Logger.info(`[network-vpc-endpoints-stack] Route 53 resolver: adding ingress cidr ${ingressCidr} TCP:${port}`);
        ingressRules.push({
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: port,
          toPort: port,
          cidrIp: ingressCidr,
        });

        Logger.info(`[network-vpc-endpoints-stack] Route 53 resolver: adding ingress cidr ${ingressCidr} UDP:${port}`);
        ingressRules.push({
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: port,
          toPort: port,
          cidrIp: ingressCidr,
        });

        if (ingressCidr === '0.0.0.0/0') {
          // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
          // rule suppression with evidence for this permission.
          includeNagSuppression = true;
        }
      }

      // Adding Egress '127.0.0.1/32' to avoid default Egress rule
      egressRules.push({
        ipProtocol: cdk.aws_ec2.Protocol.ALL,
        cidrIp: '127.0.0.1/32',
      });
    } else {
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

        Logger.info(`[network-vpc-endpoints-stack] Route 53 resolver: adding egress cidr ${egressCidr} TCP:${port}`);
        egressRules.push({
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: port,
          toPort: port,
          cidrIp: egressCidr,
        });

        Logger.info(`[network-vpc-endpoints-stack] Route 53 resolver: adding egress cidr ${egressCidr} UDP:${port}`);
        egressRules.push({
          ipProtocol: cdk.aws_ec2.Protocol.UDP,
          fromPort: port,
          toPort: port,
          cidrIp: egressCidr,
        });
      }
    }

    // Create security group
    Logger.info(
      `[network-vpc-endpoints-stack] Adding Security Group for Route 53 Resolver endpoint ${endpointItem.name}`,
    );
    const securityGroup = new SecurityGroup(this, pascalCase(`${endpointItem.name}EpSecurityGroup`), {
      securityGroupName: `ep_${endpointItem.name}_sg`,
      securityGroupEgress: egressRules,
      securityGroupIngress: ingressRules,
      description: `AWS Route 53 Resolver endpoint - ${endpointItem.name}`,
      vpcId,
    });

    // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
    // rule suppression with evidence for this permission.
    if (includeNagSuppression) {
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/${pascalCase(endpointItem.name)}EpSecurityGroup`,
        [
          {
            id: 'AwsSolutions-EC23',
            reason: 'Allowed access for interface endpoints',
          },
        ],
      );
    }

    // Create resolver endpoint
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
   * Creates a cdk.aws_iam.PolicyDocument for the given endpoint.
   * @param vpcItem
   * @param endpointItem
   * @param isGatewayEndpoint
   * @returns
   */
  private createVpcEndpointPolicy(
    vpcItem: VpcConfig,
    endpointItem: GatewayEndpointServiceConfig | InterfaceEndpointServiceConfig,
    isGatewayEndpoint?: boolean,
  ): cdk.aws_iam.PolicyDocument | undefined {
    // See https://docs.aws.amazon.com/vpc/latest/privatelink/integrated-services-vpce-list.html
    // for the services that integrates with AWS PrivateLink, but does not support VPC endpoint policies
    const policiesUnsupported = [
      'appmesh-envoy-management',
      'appstream.api',
      'appstream.streaming',
      'cloudtrail',
      'codeguru-profiler',
      'codeguru-reviewer',
      'codepipeline',
      'datasync',
      'ebs',
      'elastic-inference.runtime',
      'iot.data',
      'iotwireless.api',
      'lorawan.cups',
      'lorawan.lns',
      'iotsitewise.api',
      'iotsitewise.data',
      'macie2',
      'aps',
      'aps-workspaces',
      'awsconnector',
      'sms',
      'sms-fips',
      'email-smtp',
      'storagegateway',
      'transfer',
      'transfer.server',
    ];

    if (policiesUnsupported.includes(endpointItem.service)) {
      return undefined;
    }

    // Identify if custom policy is specified, create custom or default policy
    let policyName: string | undefined;
    let policyDocument: cdk.aws_iam.PolicyDocument | undefined = undefined;
    if (endpointItem.policy) {
      Logger.info(`[network-vpc-endpoints-stack] Add custom endpoint policy for ${endpointItem.service}`);
      policyName = endpointItem.policy;
    } else if (!endpointItem.policy && isGatewayEndpoint) {
      Logger.info(
        `[network-vpc-endpoints-stack] Add default endpoint policy for gateway endpoint ${endpointItem.service}`,
      );
      policyName = vpcItem.gatewayEndpoints?.defaultPolicy;
    } else {
      Logger.info(
        `[network-vpc-endpoints-stack] Add default endpoint policy for interface endpoint ${endpointItem.service}`,
      );
      policyName = vpcItem.interfaceEndpoints?.defaultPolicy;
    }

    // Find matching endpoint policy item
    if (!policyName) {
      throw new Error(`[network-vpc-endpoints-stack] Create endpoint policy: unable to set a policy name.`);
    }
    const policyItem = this.props.networkConfig.endpointPolicies.filter(item => item.name === policyName);

    // Verify there is only one endpoint policy with the same name
    if (policyItem.length > 1) {
      throw new Error(
        `[network-vpc-endpoints-stack] Create endpoint policy: more than one policy with the name ${policyName} is configured.`,
      );
    } else if (policyItem.length === 0) {
      throw new Error(
        `[network-vpc-endpoints-stack] Create endpoint policy: unable to locate policy with the name ${policyName}.`,
      );
    }

    // Set location and fetch document
    const location = path.join(this.props.configDirPath, policyItem[0].document);
    const document = fs.readFileSync(location, 'utf-8');

    // Set and return policy document
    policyDocument = cdk.aws_iam.PolicyDocument.fromJson(JSON.parse(document));
    return policyDocument;
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
    return ResourceShareItem.fromLookup(this, pascalCase(`${logicalId}`), {
      resourceShare,
      resourceShareItemType: itemType,
      kmsKey: this.acceleratorKey,
      logRetentionInDays: this.logRetention,
    });
  }
}
