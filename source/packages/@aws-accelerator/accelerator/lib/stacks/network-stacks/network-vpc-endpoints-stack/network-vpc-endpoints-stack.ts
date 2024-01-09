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
import * as path from 'path';

import {
  AseaResourceType,
  GatewayEndpointServiceConfig,
  InterfaceEndpointServiceConfig,
  NfwFirewallConfig,
  ResolverEndpointConfig,
  RouteTableConfig,
  RouteTableEntryConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  INetworkFirewall,
  NetworkFirewall,
  ResolverEndpoint,
  SecurityGroup,
  SecurityGroupEgressRuleProps,
  SecurityGroupIngressRuleProps,
  VpcEndpoint,
  VpcEndpointType,
} from '@aws-accelerator/constructs';
import { getAvailabilityZoneMap, SsmResourceType } from '@aws-accelerator/utils';

import { AcceleratorStackProps } from '../../accelerator-stack';
import { NetworkStack } from '../network-stack';
import { setIpamSubnetRouteTableEntryArray } from '../utils/setter-utils';

export class NetworkVpcEndpointsStack extends NetworkStack {
  private nfwPolicyMap: Map<string, string>;

  private vpcMap: Map<string, string>;
  private subnetMap: Map<string, string>;
  private routeTableMap: Map<string, string>;
  private firewallMap: Map<string, INetworkFirewall>;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    //
    // Store VPC, subnet, and route table IDs
    //
    this.vpcMap = this.setVpcMap(this.vpcsInScope);
    this.subnetMap = this.setSubnetMap(this.vpcsInScope);
    this.routeTableMap = this.setRouteTableMap(this.vpcsInScope);

    this.firewallMap = new Map<string, NetworkFirewall>();

    //
    // Set Network Firewall policy map
    //
    this.nfwPolicyMap = this.setNfwPolicyMap(props);

    const firewallLogBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'FirewallLogsBucket', this.centralLogsBucketName);

    //
    // Iterate through VPCs in this account and region
    //
    for (const vpcItem of this.vpcsInScope) {
      // Get Vpc Id
      const vpcId = this.getVpcId(vpcItem.name);

      //
      // Create VPC endpoints
      //
      this.createVpcEndpoints(vpcItem, vpcId);

      //
      // Create Network Firewalls
      //
      this.createNetworkFirewalls(vpcItem, vpcId, firewallLogBucket, props);

      //
      // Create endpoint routes
      //
      this.createEndpointRoutes(vpcItem, props);

      //
      // Create Route 53 Resolver Endpoints
      //
      this.createRoute53ResolverEndpoints(vpcItem, vpcId, props);
    }

    //
    // Create SSM parameters
    //
    this.createSsmParameters();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Function to get Vpc id for given vpc
   * @param vpcName string
   * @returns
   */
  private getVpcId(vpcName: string): string {
    const vpcId = this.vpcMap.get(vpcName);
    if (!vpcId) {
      this.logger.error(`Unable to locate VPC ${vpcName}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    return vpcId;
  }

  /**
   * Function to Create VPC endpoints
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param vpcId string
   *
   * @remarks
   * Function creates Gateway and Interface endpoints for the given VPC.
   */
  private createVpcEndpoints(vpcItem: VpcConfig | VpcTemplatesConfig, vpcId: string) {
    // Create VPC endpoints
    //
    if (vpcItem.gatewayEndpoints) {
      this.createGatewayEndpoints(vpcItem, vpcId);
    }

    if (vpcItem.interfaceEndpoints) {
      this.createInterfaceEndpoints(vpcItem, vpcId);
    }
  }

  /**
   * Function to get firewall subnet ids
   * @param firewallItem {@link NfwFirewallConfig}
   * @returns subnetIds string[]
   */
  private getFirewallSubnetIds(firewallItem: NfwFirewallConfig): string[] {
    const firewallSubnets: string[] = [];

    // Check if VPC has matching subnets
    for (const subnetItem of firewallItem.subnets) {
      const subnetKey = `${firewallItem.vpc}_${subnetItem}`;
      const subnetId = this.subnetMap.get(subnetKey);
      if (subnetId) {
        firewallSubnets.push(subnetId);
      } else {
        this.logger.error(`Create Network Firewall: subnet ${subnetItem} not found in VPC ${firewallItem.vpc}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
    }

    return firewallSubnets;
  }

  /**
   * Function to create Network firewalls
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param vpcId string
   * @param firewallLogBucket {@link cdk.aws_s3.IBucket}
   * @param props {@link AcceleratorStackProps}
   */
  private createNetworkFirewalls(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcId: string,
    firewallLogBucket: cdk.aws_s3.IBucket,
    props: AcceleratorStackProps,
  ) {
    if (props.networkConfig.centralNetworkServices?.networkFirewall?.firewalls) {
      const firewalls = props.networkConfig.centralNetworkServices.networkFirewall.firewalls;

      for (const firewallItem of firewalls) {
        if (firewallItem.vpc === vpcItem.name) {
          //Get firewall subnets
          const firewallSubnetIds = this.getFirewallSubnetIds(firewallItem);

          // Create firewall
          if (firewallSubnetIds.length > 0) {
            const nfw = this.createNetworkFirewall(firewallItem, vpcId, firewallSubnetIds, firewallLogBucket);
            this.firewallMap.set(firewallItem.name, nfw);
          }
        }
      }
    }
  }

  private createEndpointRoute(
    vpcName: string,
    routeTableItem: RouteTableConfig,
    routeTableEntryItem: RouteTableEntryConfig,
  ) {
    const endpointRouteId =
      pascalCase(`${vpcName}Vpc`) +
      pascalCase(`${routeTableItem.name}RouteTable`) +
      pascalCase(routeTableEntryItem.name);

    if (routeTableEntryItem.type && routeTableEntryItem.type === 'networkFirewall') {
      const routeTableId = this.routeTableMap.get(`${vpcName}_${routeTableItem.name}`);
      const destination = this.setRouteEntryDestination(
        routeTableEntryItem,
        setIpamSubnetRouteTableEntryArray(this.vpcsInScope),
        vpcName,
      );

      // Check if route table exists im map
      if (!routeTableId) {
        this.logger.error(`Unable to locate route table ${routeTableItem.name}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      // Get Network Firewall
      const firewall = this.firewallMap.get(routeTableEntryItem.target!);
      const endpointAz =
        typeof routeTableEntryItem.targetAvailabilityZone === 'number'
          ? `${getAvailabilityZoneMap(cdk.Stack.of(this).region)}${routeTableEntryItem.targetAvailabilityZone}`
          : `${cdk.Stack.of(this).region}${routeTableEntryItem.targetAvailabilityZone}`;

      if (!firewall) {
        this.logger.error(`Unable to locate Network Firewall ${routeTableEntryItem.target}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      // Add route
      this.logger.info(`Adding Network Firewall Route Table Entry ${routeTableEntryItem.name}`);
      firewall.addNetworkFirewallRoute(
        endpointRouteId,
        destination,
        endpointAz,
        this.logRetention,
        routeTableId,
        this.cloudwatchKey,
      );
    }
  }

  /**
   * Function to create Endpoint routes
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param props {@link AcceleratorStackProps}
   */
  private createEndpointRoutes(vpcItem: VpcConfig | VpcTemplatesConfig, props: AcceleratorStackProps) {
    if (props.networkConfig.centralNetworkServices?.networkFirewall?.firewalls) {
      for (const routeTableItem of vpcItem.routeTables ?? []) {
        // Check if endpoint routes exist
        for (const routeTableEntryItem of routeTableItem.routes ?? []) {
          //Create endpoint route
          this.createEndpointRoute(vpcItem.name, routeTableItem, routeTableEntryItem);
        }
      }
    }
  }

  /**
   * Function to validate route 53 resolver vpc account
   * @param delegatedAdminAccountId
   *
   * @remarks
   * Check route 53 resolver vpc account is the delegated admin account.
   */
  private validateRoute53ResolverVpcAccount(delegatedAdminAccountId: string) {
    if (cdk.Stack.of(this).account !== delegatedAdminAccountId) {
      this.logger.error(
        'VPC for Route 53 Resolver endpoints must be located in the delegated network administrator account',
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }
  }

  /**
   * Function to get Route53 resolver endpoint subnet ids
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param endpointItem  {@link ResolverEndpointConfig}
   * @param endpointSubnets string[]
   */
  private getRoute53ResolverEndpointSubnetIds(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    endpointItem: ResolverEndpointConfig,
    endpointSubnets: string[],
  ) {
    for (const subnetItem of endpointItem.subnets) {
      const subnetKey = `${vpcItem.name}_${subnetItem}`;
      const subnetId = this.subnetMap.get(subnetKey);
      if (subnetId) {
        endpointSubnets.push(subnetId);
      } else {
        this.logger.error(`Create Route 53 Resolver endpoint: subnet not found in VPC ${vpcItem.name}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
    }
  }

  /**
   * Function to create Route 53 Resolver Endpoints
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param vpcId string
   * @param props {@link AcceleratorStackProps}
   */
  private createRoute53ResolverEndpoints(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcId: string,
    props: AcceleratorStackProps,
  ) {
    if (props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints) {
      const endpoints = props.networkConfig.centralNetworkServices?.route53Resolver?.endpoints;

      // Check if the VPC has matching subnets
      for (const endpointItem of endpoints) {
        if (vpcItem.name === endpointItem.vpc) {
          const endpointSubnets: string[] = [];

          // Check if this is the delegated admin account
          this.validateRoute53ResolverVpcAccount(
            this.props.accountsConfig.getAccountId(props.networkConfig.centralNetworkServices.delegatedAdminAccount),
          );

          // Get route 53 resolver endpoint subnet ids
          this.getRoute53ResolverEndpointSubnetIds(vpcItem, endpointItem, endpointSubnets);

          // Create endpoint
          if (endpointSubnets.length > 0) {
            this.createResolverEndpoint(endpointItem, vpcId, endpointSubnets);
          }
        }
      }
    }
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
  ): INetworkFirewall {
    this.logger.info(`Add Network Firewall ${firewallItem.name} to VPC ${firewallItem.vpc}`);

    let nfw;
    if (this.isManagedByAsea(AseaResourceType.NFW, firewallItem.name)) {
      const nfwArn = this.getExternalResourceParameter(
        this.getSsmPath(SsmResourceType.NFW, [firewallItem.vpc, firewallItem.name]),
      );
      nfw = NetworkFirewall.fromAttributes(this, pascalCase(`${firewallItem.vpc}${firewallItem.name}NetworkFirewall`), {
        firewallArn: nfwArn,
        firewallName: firewallItem.name,
      });
    } else {
      // Fetch policy ARN
      const policyArn = this.nfwPolicyMap.get(firewallItem.firewallPolicy);
      if (!policyArn) {
        this.logger.error(`Unable to locate Network Firewall policy ${firewallItem.firewallPolicy}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      // Create firewall
      nfw = new NetworkFirewall(this, pascalCase(`${firewallItem.vpc}${firewallItem.name}NetworkFirewall`), {
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
      this.ssmParameters.push({
        logicalId: pascalCase(`SsmParam${pascalCase(firewallItem.vpc) + pascalCase(firewallItem.name)}FirewallArn`),
        parameterName: this.getSsmPath(SsmResourceType.NFW, [firewallItem.vpc, firewallItem.name]),
        stringValue: nfw.firewallArn,
      });
    }

    // Add logging configurations
    const destinationConfigs: cdk.aws_networkfirewall.CfnLoggingConfiguration.LogDestinationConfigProperty[] = [];
    for (const logItem of firewallItem.loggingConfiguration ?? []) {
      if (logItem.destination === 'cloud-watch-logs') {
        // Create log group and log configuration
        this.logger.info(`Add CloudWatch ${logItem.type} logs for Network Firewall ${firewallItem.name}`);
        const logGroup = new cdk.aws_logs.LogGroup(this, pascalCase(`${firewallItem.name}${logItem.type}LogGroup`), {
          encryptionKey: this.cloudwatchKey,
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
        this.logger.info(`Add S3 ${logItem.type} logs for Network Firewall ${firewallItem.name}`);

        destinationConfigs.push({
          logDestination: {
            bucketName: firewallLogBucket.bucketName,
            prefix: 'firewall',
          },
          logDestinationType: 'S3',
          logType: logItem.type,
        });
      }
    }

    if (!this.isManagedByAsea(AseaResourceType.NFW, firewallItem.name)) {
      // Add logging configuration
      const config = {
        logDestinationConfigs: destinationConfigs,
      };
      nfw.addLogging(config);
    }

    return nfw;
  }

  /**
   * Function to get route table id
   * @param vpcName string
   * @param routeTableName string
   * @returns
   */
  private getRouteTableId(vpcName: string, routeTableName: string): string {
    const routeTableKey = `${vpcName}_${routeTableName}`;
    const routeTableId = this.routeTableMap.get(routeTableKey);

    if (!routeTableId) {
      this.logger.error(`Route Table ${routeTableName} not found`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    return routeTableId;
  }

  /**
   * Function to get S3 and DynamoDB route table ids
   * @param routeTableItem {@link RouteTableConfig}
   * @param routeTableId string
   */
  private getS3DynamoDbRouteTableIds(
    routeTableItem: RouteTableConfig,
    routeTableId: string,
    s3EndpointRouteTables: string[],
    dynamodbEndpointRouteTables: string[],
  ) {
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

  /**
   * Create gateway endpoints for the specified VPC.
   *
   * @param vpcItem
   * @param vpc
   */
  private createGatewayEndpoints(vpcItem: VpcConfig | VpcTemplatesConfig, vpcId: string): void {
    // Create a list of related route tables that will need to be updated with the gateway routes
    const s3EndpointRouteTables: string[] = [];
    const dynamodbEndpointRouteTables: string[] = [];
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTableId = this.getRouteTableId(vpcItem.name, routeTableItem.name);

      this.getS3DynamoDbRouteTableIds(routeTableItem, routeTableId, s3EndpointRouteTables, dynamodbEndpointRouteTables);
    }

    //
    // Add Gateway Endpoints (AWS Services)
    //
    for (const gatewayEndpointItem of vpcItem.gatewayEndpoints?.endpoints ?? []) {
      this.logger.info(`Adding Gateway Endpoint for ${gatewayEndpointItem.service}`);
      if (this.isManagedByAsea(AseaResourceType.VPC_ENDPOINT, `${vpcItem.name}/${gatewayEndpointItem.service}`)) {
        this.logger.info(`Endpoint "${gatewayEndpointItem.service}" for VPC "${vpcItem.name}" is managed externally`);
        continue;
      }
      if (gatewayEndpointItem.service === 's3') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem.service), {
          vpcId,
          vpcEndpointType: VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem.service,
          routeTables: s3EndpointRouteTables,
          policyDocument: this.createVpcEndpointPolicy(vpcItem, gatewayEndpointItem, true),
          serviceName: gatewayEndpointItem.serviceName ?? undefined,
        });
      }
      if (gatewayEndpointItem.service === 'dynamodb') {
        new VpcEndpoint(this, pascalCase(`${vpcItem.name}Vpc`) + pascalCase(gatewayEndpointItem.service), {
          vpcId,
          vpcEndpointType: VpcEndpointType.GATEWAY,
          service: gatewayEndpointItem.service,
          routeTables: dynamodbEndpointRouteTables,
          policyDocument: this.createVpcEndpointPolicy(vpcItem, gatewayEndpointItem, true),
          serviceName: gatewayEndpointItem.serviceName ?? undefined,
        });
      }
    }
  }

  /**
   * Function to get Subnet ids for each interface endpoints
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @returns string[]
   */
  private getInterfaceEndpointsSubnetIds(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
    // Create list of subnet IDs for each interface endpoint
    const subnets: string[] = [];
    for (const subnetItem of vpcItem.interfaceEndpoints?.subnets ?? []) {
      const subnetKey = `${vpcItem.name}_${subnetItem}`;
      const subnet = this.subnetMap.get(subnetKey);
      if (subnet) {
        subnets.push(subnet);
      } else {
        this.logger.error(`Attempting to add interface endpoints to subnet that does not exist (${subnetItem})`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
    }

    return subnets;
  }

  /**
   * Function to get interface endpoint security group properties
   * @param endpointItem {@link InterfaceEndpointServiceConfig}
   * @param securityGroupMap Map<string, SecurityGroup>
   * @returns
   */
  private getInterfaceEndpointSecurityGroupItem(
    endpointItem: InterfaceEndpointServiceConfig,
    securityGroupMap: Map<string, SecurityGroup>,
  ): { endpointSg?: SecurityGroup; port: number; trafficType: string } {
    let endpointSg: SecurityGroup | undefined;
    let port: number;
    let trafficType: string;
    if (endpointItem.service !== 'cassandra') {
      endpointSg = securityGroupMap.get('https');
      port = 443;
      trafficType = 'https';
    } else {
      endpointSg = securityGroupMap.get('cassandra');
      port = 9142;
      trafficType = 'cassandra';
    }

    return { endpointSg: endpointSg, port: port, trafficType: trafficType };
  }

  /**
   * Function to create or get interface endpoint security group
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param endpointItem {@link InterfaceEndpointServiceConfig}
   * @param securityGroupMap Map<string, SecurityGroup>
   * @param vpcId string
   * @returns SecurityGroup {@link SecurityGroup}
   */
  private createOrGetInterfaceEndpointSecurityGroup(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    endpointItem: InterfaceEndpointServiceConfig,
    securityGroupMap: Map<string, SecurityGroup>,
    vpcId: string,
  ): SecurityGroup {
    if (endpointItem.securityGroup) {
      const endpointSecurityGroupId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.SECURITY_GROUP, [vpcItem.name, endpointItem.securityGroup]),
      );
      return SecurityGroup.fromSecurityGroupId(this, endpointSecurityGroupId);
    }
    const interfaceEndpointSecurityGroupItem = this.getInterfaceEndpointSecurityGroupItem(
      endpointItem,
      securityGroupMap,
    );
    if (!interfaceEndpointSecurityGroupItem.endpointSg) {
      const ingressRules: SecurityGroupIngressRuleProps[] = [];
      const egressRules: SecurityGroupEgressRuleProps[] = [];
      let includeNagSuppression = false;

      // Add ingress and egress CIDRs
      for (const ingressCidr of vpcItem.interfaceEndpoints?.allowedCidrs || ['0.0.0.0/0']) {
        this.logger.info(
          `Interface endpoints: adding ingress cidr ${ingressCidr} TCP:${interfaceEndpointSecurityGroupItem.port}`,
        );
        ingressRules.push({
          ipProtocol: cdk.aws_ec2.Protocol.TCP,
          fromPort: interfaceEndpointSecurityGroupItem.port,
          toPort: interfaceEndpointSecurityGroupItem.port,
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
      this.logger.info(
        `Adding Security Group to VPC ${vpcItem.name} for interface endpoints -- ${interfaceEndpointSecurityGroupItem.trafficType} traffic`,
      );
      const securityGroup = new SecurityGroup(
        this,
        pascalCase(`${vpcItem.name}Vpc${interfaceEndpointSecurityGroupItem.trafficType}EpSecurityGroup`),
        {
          securityGroupName: `interface_ep_${interfaceEndpointSecurityGroupItem.trafficType}_sg`,
          securityGroupEgress: egressRules,
          securityGroupIngress: ingressRules,
          description: `Security group for interface endpoints -- ${interfaceEndpointSecurityGroupItem.trafficType} traffic`,
          vpcId,
        },
      );
      interfaceEndpointSecurityGroupItem.endpointSg = securityGroup;
      securityGroupMap.set(interfaceEndpointSecurityGroupItem.trafficType, securityGroup);

      // AwsSolutions-EC23: The Security Group allows for 0.0.0.0/0 or ::/0 inbound access.
      // rule suppression with evidence for this permission.
      if (includeNagSuppression) {
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/${pascalCase(vpcItem.name)}Vpc${
            interfaceEndpointSecurityGroupItem.trafficType
          }EpSecurityGroup`,
          [
            {
              id: 'AwsSolutions-EC23',
              reason: 'Allowed access for interface endpoints',
            },
          ],
        );
      }
    }

    return interfaceEndpointSecurityGroupItem.endpointSg;
  }

  /**
   * Create interface endpoints for the specified VPC.
   *
   * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
   * @param vpcId string
   */
  private createInterfaceEndpoints(vpcItem: VpcConfig | VpcTemplatesConfig, vpcId: string): void {
    //
    // Add Interface Endpoints (AWS Services)
    //
    // Create list of subnet IDs for each interface endpoint
    const subnets = this.getInterfaceEndpointsSubnetIds(vpcItem);

    // Create the interface endpoint
    const securityGroupMap = new Map<string, SecurityGroup>();
    const privateDnsValue = !vpcItem.interfaceEndpoints?.central ?? true;

    for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
      if (this.isManagedByAsea(AseaResourceType.VPC_ENDPOINT, `${vpcItem.name}/${endpointItem.service}`)) {
        this.logger.info(
          `Interface Endpoint "${endpointItem.service}" for VPC "${vpcItem.name}" is managed externally`,
        );
        continue;
      }
      this.logger.info(`Adding Interface Endpoint for ${endpointItem.service}`);

      // Create or get interface endpoint security group
      const endpointSg = this.createOrGetInterfaceEndpointSecurityGroup(vpcItem, endpointItem, securityGroupMap, vpcId);

      // Create the interface endpoint
      const endpoint = new VpcEndpoint(this, `${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}Ep`, {
        vpcId,
        vpcEndpointType: VpcEndpointType.INTERFACE,
        service: endpointItem.service,
        serviceName: endpointItem.serviceName,
        subnets,
        securityGroups: [endpointSg],
        privateDnsEnabled: privateDnsValue,
        policyDocument: this.createVpcEndpointPolicy(vpcItem, endpointItem),
      });
      this.ssmParameters.push({
        logicalId: pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Dns`),
        parameterName: this.getSsmPath(SsmResourceType.ENDPOINT_DNS, [vpcItem.name, endpointItem.service]),
        stringValue: endpoint.dnsName!,
      });
      this.ssmParameters.push({
        logicalId: pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Phz`),
        parameterName: this.getSsmPath(SsmResourceType.ENDPOINT_ZONE_ID, [vpcItem.name, endpointItem.service]),
        stringValue: endpoint.hostedZoneId!,
      });
    }
  }

  /**
   * Function of validate inbound endpoint
   * @param endpointItem {@link ResolverEndpointConfig}
   *
   * @remarks
   * Validate there are no rules associated with an inbound endpoint
   */
  private validateInboundEndpoint(endpointItem: ResolverEndpointConfig) {
    if (endpointItem.type === 'INBOUND' && endpointItem.rules) {
      this.logger.error('Route 53 Resolver inbound endpoints cannot have rules.');
      throw new Error(`Configuration validation failed at runtime.`);
    }
  }

  /**
   * Function to prepare route 53 resolver endpoint security group ingress rules
   * @param endpointItem {@link ResolverEndpointConfig}
   * @param ingressRules {@link SecurityGroupIngressRuleProps}[]
   * @returns
   */
  private prepareRoute53ResolverEndpointSecurityGroupIngressRules(
    endpointItem: ResolverEndpointConfig,
    ingressRules: SecurityGroupIngressRuleProps[],
  ): boolean {
    let includeNagSuppression = false;
    for (const ingressCidr of endpointItem.allowedCidrs || ['0.0.0.0/0']) {
      const port = 53;

      this.logger.info(`Route 53 resolver: adding ingress cidr ${ingressCidr} TCP:${port}`);
      ingressRules.push({
        ipProtocol: cdk.aws_ec2.Protocol.TCP,
        fromPort: port,
        toPort: port,
        cidrIp: ingressCidr,
      });

      this.logger.info(`Route 53 resolver: adding ingress cidr ${ingressCidr} UDP:${port}`);
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

    return includeNagSuppression;
  }

  /**
   * Prepare non standard port map of ip and port
   * @param endpointItem {@link ResolverEndpointConfig}
   * @param portMap Map<string, string>
   */
  private prepareNonStandardPortMap(endpointItem: ResolverEndpointConfig, portMap: Map<string, string>) {
    // Check if non-standard ports exist in rules
    for (const ruleItem of endpointItem.rules ?? []) {
      for (const targetItem of ruleItem.targetIps ?? []) {
        if (targetItem.port) {
          portMap.set(targetItem.ip, targetItem.port);
        }
      }
    }
  }

  /**
   * Function to prepare route 53 resolver endpoint security group egress rules
   * @param endpointItem {@link ResolverEndpointConfig}
   * @param egressRules {@link SecurityGroupEgressRuleProps}[]
   * @param portMap Map<string, string>,
   */
  private prepareRoute53ResolverEndpointSecurityGroupEgressRules(
    endpointItem: ResolverEndpointConfig,
    egressRules: SecurityGroupEgressRuleProps[],
    portMap: Map<string, string>,
  ) {
    for (const egressCidr of endpointItem.allowedCidrs || ['0.0.0.0/0']) {
      let port = 53;
      const nonStandardPort = portMap.get(egressCidr.split('/')[0]); //Split at the prefix to match target IP

      // Check if mapping includes non-standard port
      if (nonStandardPort) {
        port = +nonStandardPort;
      }

      this.logger.info(`Route 53 resolver: adding egress cidr ${egressCidr} TCP:${port}`);
      egressRules.push({
        ipProtocol: cdk.aws_ec2.Protocol.TCP,
        fromPort: port,
        toPort: port,
        cidrIp: egressCidr,
      });

      this.logger.info(`Route 53 resolver: adding egress cidr ${egressCidr} UDP:${port}`);
      egressRules.push({
        ipProtocol: cdk.aws_ec2.Protocol.UDP,
        fromPort: port,
        toPort: port,
        cidrIp: egressCidr,
      });
    }
  }

  //
  // Create Route 53 Resolver endpoints
  //
  private createResolverEndpoint(endpointItem: ResolverEndpointConfig, vpcId: string, subnets: string[]): void {
    // Validate there are no rules associated with an inbound endpoint
    this.validateInboundEndpoint(endpointItem);

    // Begin creation of Route 53 resolver endpoint
    this.logger.info(`Add Route 53 Resolver ${endpointItem.type} endpoint ${endpointItem.name}`);
    const ingressRules: SecurityGroupIngressRuleProps[] = [];
    const egressRules: SecurityGroupEgressRuleProps[] = [];
    let includeNagSuppression = false;

    if (endpointItem.type === 'INBOUND') {
      // Prepare route 53 resolver endpoint security group ingress rules
      includeNagSuppression = this.prepareRoute53ResolverEndpointSecurityGroupIngressRules(endpointItem, ingressRules);

      // Adding Egress '127.0.0.1/32' to avoid default Egress rule
      egressRules.push({
        ipProtocol: cdk.aws_ec2.Protocol.ALL,
        cidrIp: '127.0.0.1/32',
      });
    } else {
      // Check if non-standard ports exist in rules
      const portMap = new Map<string, string>();
      this.prepareNonStandardPortMap(endpointItem, portMap);

      // Prepare egress rules
      this.prepareRoute53ResolverEndpointSecurityGroupEgressRules(endpointItem, egressRules, portMap);
    }

    // Create security group
    this.logger.info(`Adding Security Group for Route 53 Resolver endpoint ${endpointItem.name}`);
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
    this.ssmParameters.push({
      logicalId: pascalCase(`SsmParam${endpointItem.name}ResolverEndpoint`),
      parameterName: this.getSsmPath(SsmResourceType.RESOLVER_ENDPOINT, [endpointItem.name]),
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
    vpcItem: VpcConfig | VpcTemplatesConfig,
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
      'deviceadvisor.iot',
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

    // by default, if nothing is specified policy is applied
    if (endpointItem.applyPolicy ?? true) {
      // Identify if custom policy is specified, create custom or default policy
      let policyName: string | undefined;
      let policyDocument: cdk.aws_iam.PolicyDocument | undefined = undefined;
      if (endpointItem.policy) {
        this.logger.info(`Add custom endpoint policy for ${endpointItem.service}`);
        policyName = endpointItem.policy;
      } else if (!endpointItem.policy && isGatewayEndpoint) {
        this.logger.info(`Add default endpoint policy for gateway endpoint ${endpointItem.service}`);
        policyName = vpcItem.gatewayEndpoints?.defaultPolicy;
      } else {
        this.logger.info(`Add default endpoint policy for interface endpoint ${endpointItem.service}`);
        policyName = vpcItem.interfaceEndpoints?.defaultPolicy;
      }

      // Find matching endpoint policy item
      if (!policyName) {
        this.logger.error(`Create endpoint policy: unable to set a policy name.`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      const policyItem = this.props.networkConfig.endpointPolicies.filter(item => item.name === policyName);

      // Set location and fetch document
      const document = JSON.parse(
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, policyItem[0].document),
          false,
          this.organizationId,
        ),
      );

      policyDocument = cdk.aws_iam.PolicyDocument.fromJson(document);
      return policyDocument;
    } else {
      return undefined;
    }
  }
}
