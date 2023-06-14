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

import {
  AutoScalingConfig,
  Ec2FirewallAutoScalingGroupConfig,
  Ec2FirewallInstanceConfig,
  GwlbConfig,
  GwlbEndpointConfig,
  LaunchTemplateConfig,
  NetworkInterfaceItemConfig,
  RouteTableEntryConfig,
  TargetGroupItemConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  FirewallAutoScalingGroup,
  FirewallInstance,
  SsmParameterLookup,
  TargetGroup,
  VpcEndpoint,
  VpcEndpointType,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';

import { AcceleratorStackProps } from '../../accelerator-stack';
import { NetworkStack } from '../network-stack';

export class NetworkAssociationsGwlbStack extends NetworkStack {
  private gwlbMap: Map<string, string>;
  private routeTableMap: Map<string, string>;
  private securityGroupMap: Map<string, string>;
  private subnetMap: Map<string, string>;
  private targetGroupMap: Map<string, TargetGroup>;
  private vpcMap: Map<string, string>;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set initial private properties
    this.vpcMap = this.setVpcMap(this.vpcsInScope);
    this.subnetMap = this.setSubnetMap(this.vpcsInScope);
    this.routeTableMap = this.setRouteTableMap(this.vpcsInScope);
    this.securityGroupMap = this.setSecurityGroupMap(this.vpcsInScope);
    this.gwlbMap = this.setInitialMaps(this.vpcsInScope);

    //
    // Create firewall instances and target groups
    //
    this.targetGroupMap = this.createInitialFirewallResources();

    //
    // Create firewall autoscaling groups
    //
    this.createFirewallAutoScalingGroups();

    //
    // Create Gateway Load Balancer resources
    //
    this.createGwlbResources();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Set route table, subnet, and VPC maps for this stack's account and region
   * @returns
   */
  private setInitialMaps(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): Map<string, string> {
    const gwlbMap = new Map<string, string>();

    for (const vpcItem of vpcResources) {
      // Retrieve Gateway Load balancers
      const gwlbItemMap = this.setGwlbMap(vpcItem);
      gwlbItemMap.forEach((value, key) => gwlbMap.set(key, value));
    }
    return gwlbMap;
  }

  /**
   * Returns a map of Gateway Load Balancer items for a given VPC configuration
   * @param vpcItem
   * @returns
   */
  private setGwlbMap(vpcItem: VpcConfig | VpcTemplatesConfig): Map<string, string> {
    const gwlbMap = new Map<string, string>();
    for (const gwlbItem of this.props.networkConfig.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      if (gwlbItem.vpc === vpcItem.name) {
        const gwlbArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.getSsmPath(SsmResourceType.GWLB_ARN, [gwlbItem.name]),
        );
        gwlbMap.set(gwlbItem.name, gwlbArn);
      }
    }
    return gwlbMap;
  }

  /**
   * Create EC2-based firewall instances and target groups
   * @returns
   */
  private createInitialFirewallResources() {
    // Create firewall instances
    const instanceMap = this.createFirewallInstances();
    // Create target groups
    const targetGroupMap = this.createFirewallTargetGroups(instanceMap);

    return targetGroupMap;
  }

  /**
   * Create EC2-based firewall and firewall management instances
   * @returns
   */
  private createFirewallInstances(): Map<string, FirewallInstance> {
    const instanceMap = new Map<string, FirewallInstance>();
    const firewallInstances = [
      ...(this.props.customizationsConfig.firewalls?.instances ?? []),
      ...(this.props.customizationsConfig.firewalls?.managerInstances ?? []),
    ];
    for (const firewallInstance of firewallInstances) {
      if (this.vpcMap.has(firewallInstance.vpc)) {
        instanceMap.set(firewallInstance.name, this.createFirewallInstance(firewallInstance));
      }
    }
    return instanceMap;
  }

  /**
   * Create a firewall instance
   * @param firewallInstance
   * @returns
   */
  private createFirewallInstance(firewallInstance: Ec2FirewallInstanceConfig): FirewallInstance {
    const launchTemplate: LaunchTemplateConfig = this.processLaunchTemplateReplacements(
      firewallInstance.launchTemplate,
      firewallInstance.vpc,
      firewallInstance.name,
    );

    this.logger.info(`Creating standalone firewall instance ${firewallInstance.name} in VPC ${firewallInstance.vpc}`);
    const instance = new FirewallInstance(this, pascalCase(`${firewallInstance.vpc}${firewallInstance.name}Firewall`), {
      name: firewallInstance.name,
      configDir: this.props.configDirPath,
      launchTemplate,
      vpc: firewallInstance.vpc,
      detailedMonitoring: firewallInstance.detailedMonitoring,
      terminationProtection: firewallInstance.terminationProtection,
      tags: firewallInstance.tags,
    });

    if (!firewallInstance.detailedMonitoring) {
      NagSuppressions.addResourceSuppressions(instance, [
        { id: 'AwsSolutions-EC28', reason: 'Detailed monitoring not enabled by configuration.' },
      ]);
    }
    if (!firewallInstance.terminationProtection) {
      NagSuppressions.addResourceSuppressions(instance, [
        { id: 'AwsSolutions-EC29', reason: 'Termination protection not enabled by configuration.' },
      ]);
    }
    return instance;
  }

  /**
   * Create EC2-based firewall target groups
   * @param instanceMap
   * @returns
   */
  private createFirewallTargetGroups(instanceMap: Map<string, FirewallInstance>): Map<string, TargetGroup> {
    const targetGroupMap = new Map<string, TargetGroup>();
    for (const group of this.props.customizationsConfig.firewalls?.targetGroups ?? []) {
      // Check for instance targets in group
      if (group.targets && this.includesTargets(group, instanceMap)) {
        const vpcName = this.getVpcNameFromTargets(group);
        const targets = this.processFirewallInstanceReplacements(group.targets as string[], instanceMap);
        targetGroupMap.set(group.name, this.createTargetGroup(group, vpcName, targets));
      }
      // Check if any autoscaling groups reference the target group
      for (const asg of this.props.customizationsConfig.firewalls?.autoscalingGroups ?? []) {
        const asgTargetGroups = asg.autoscaling.targetGroups;
        if (asgTargetGroups && asgTargetGroups[0] === group.name && this.vpcMap.has(asg.vpc)) {
          targetGroupMap.set(group.name, this.createTargetGroup(group, asg.vpc));
        }
      }
    }
    return targetGroupMap;
  }

  /**
   * Create a target group
   * @param group
   * @param vpcName
   * @param targets
   * @returns
   */
  private createTargetGroup(group: TargetGroupItemConfig, vpcName: string, targets?: string[]): TargetGroup {
    const vpcId = this.vpcMap.get(vpcName);
    if (!vpcId) {
      this.logger.error(`unable to retrieve VPC ${vpcName} for firewall target group ${group.name}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    this.logger.info(`Creating firewall target group ${group.name} in VPC ${vpcName}`);
    return new TargetGroup(this, `${vpcName}${group.name}FirewallTargetGroup`, {
      name: group.name,
      port: group.port,
      protocol: group.protocol,
      protocolVersion: group.protocolVersion,
      type: group.type,
      vpc: vpcId,
      attributes: group.attributes,
      healthCheck: group.healthCheck,
      targets: targets,
      threshold: group.threshold,
      matcher: group.matcher,
    });
  }

  /**
   * Returns true if this stack has matching firewall instances to target
   * @param group
   * @param instanceMap
   * @returns
   */
  private includesTargets(group: TargetGroupItemConfig, instanceMap: Map<string, FirewallInstance>): boolean {
    for (const target of (group.targets as string[]) ?? []) {
      if (!instanceMap.has(target)) {
        return false;
      }
    }
    return true;
  }

  /**
   * From a given target group, retrieve the VPC name for the instance targets
   * @param group
   * @returns
   */
  private getVpcNameFromTargets(group: TargetGroupItemConfig): string {
    // Retrieve instance configs
    const config = this.props.customizationsConfig.firewalls!.instances!;
    const instances: Ec2FirewallInstanceConfig[] = [];
    group.targets!.forEach(target => instances.push(config.find(item => item.name === target)!));

    // Map VPCs
    const vpcs = instances.map(item => {
      return item.vpc;
    });

    if (vpcs.some(vpc => vpc !== vpcs[0])) {
      this.logger.error(`firewall target group ${group.name} targeted instances are in separate VPCs`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    return vpcs[0];
  }

  /**
   * Process and return instance ID replacements
   * @param targets
   * @param instanceMap
   * @returns
   */
  private processFirewallInstanceReplacements(targets: string[], instanceMap: Map<string, FirewallInstance>): string[] {
    const instances: string[] = [];
    if (targets.length > 0) {
      targets.forEach(target => {
        const instance = instanceMap.get(target);
        if (!instance) {
          this.logger.error(`Unable to retrieve instance ${target} for target group`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        instances.push(instance.instanceId);
      });
    }
    return instances;
  }

  /**
   * Create EC2-based firewall autoscaling groups
   */
  private createFirewallAutoScalingGroups() {
    for (const group of this.props.customizationsConfig.firewalls?.autoscalingGroups ?? []) {
      if (this.vpcMap.has(group.vpc)) {
        this.createFirewallAutoScalingGroup(group);
      }
    }
  }

  /**
   * Create an EC2-based firewall autoscaling group
   * @param group
   */
  private createFirewallAutoScalingGroup(group: Ec2FirewallAutoScalingGroupConfig) {
    const launchTemplate: LaunchTemplateConfig = this.processLaunchTemplateReplacements(
      group.launchTemplate,
      group.vpc,
      group.name,
    );
    const autoscaling: AutoScalingConfig = this.processAutoScalingReplacements(group.autoscaling, group.vpc);
    const resourceName = pascalCase(`${group.vpc}${group.name}FirewallAsg`);
    this.logger.info(`Creating firewall autoscaling group ${group.name} in VPC ${group.vpc}`);
    new FirewallAutoScalingGroup(this, resourceName, {
      name: group.name,
      autoscaling,
      configDir: this.props.configDirPath,
      launchTemplate,
      vpc: group.vpc,
      tags: group.tags,
      lambdaKey: this.lambdaKey,
      cloudWatchLogKmsKey: this.cloudwatchKey,
      cloudWatchLogRetentionInDays: this.logRetention,
    });

    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${resourceName}/Resource/Resource`, [
      { id: 'AwsSolutions-AS3', reason: 'Scaling policies are not offered as a part of this solution.' },
    ]);

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/${resourceName}/Resource/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/Resource`,
      [{ id: 'AwsSolutions-IAM4', reason: 'Custom resource Lambda role policy.' }],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/${resourceName}/Resource/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleFunction/ServiceRole/DefaultPolicy/Resource`,
      [{ id: 'AwsSolutions-IAM5', reason: 'Custom resource Lambda role policy.' }],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/${resourceName}/Resource/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/Resource`,
      [{ id: 'AwsSolutions-IAM4', reason: 'Custom resource Lambda role policy.' }],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/${resourceName}/Resource/AutoScalingServiceLinkedRole/CreateServiceLinkedRoleProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [{ id: 'AwsSolutions-IAM5', reason: 'Custom resource Lambda role policy.' }],
    );
  }

  /**
   * Process and return launch template replacements
   * @param launchTemplate
   * @param vpc
   * @param firewallName
   * @returns
   */
  private processLaunchTemplateReplacements(
    launchTemplate: LaunchTemplateConfig,
    vpc: string,
    firewallName: string,
  ): LaunchTemplateConfig {
    return {
      name: launchTemplate.name,
      blockDeviceMappings: launchTemplate.blockDeviceMappings
        ? this.processBlockDeviceReplacements(launchTemplate.blockDeviceMappings, firewallName)
        : undefined,
      securityGroups: this.processSecurityGroups(launchTemplate.securityGroups, vpc),
      keyPair: launchTemplate.keyPair,
      iamInstanceProfile: launchTemplate.iamInstanceProfile,
      imageId: this.replaceImageId(launchTemplate.imageId),
      instanceType: launchTemplate.instanceType,
      enforceImdsv2: launchTemplate.enforceImdsv2,
      networkInterfaces: launchTemplate.networkInterfaces
        ? this.processNetworkInterfaces(launchTemplate.networkInterfaces, vpc)
        : undefined,
      userData: launchTemplate.userData,
    };
  }

  /**
   * Process and return network interface replacements
   * @param networkInterfaces
   * @param vpc
   * @returns
   */
  private processNetworkInterfaces(
    networkInterfaces: NetworkInterfaceItemConfig[],
    vpc: string,
  ): NetworkInterfaceItemConfig[] {
    const interfaceConfig: NetworkInterfaceItemConfig[] = [];
    networkInterfaces.forEach(networkInterface =>
      interfaceConfig.push({
        associateCarrierIpAddress: networkInterface.associateCarrierIpAddress,
        associateElasticIp: networkInterface.associateElasticIp,
        associatePublicIpAddress: networkInterface.associatePublicIpAddress,
        deleteOnTermination: networkInterface.deleteOnTermination,
        description: networkInterface.description,
        deviceIndex: networkInterface.deviceIndex,
        groups: networkInterface.groups ? this.processSecurityGroups(networkInterface.groups, vpc) : undefined,
        interfaceType: networkInterface.interfaceType,
        networkCardIndex: networkInterface.networkCardIndex,
        networkInterfaceId: networkInterface.networkInterfaceId,
        privateIpAddress: networkInterface.privateIpAddress,
        privateIpAddresses: networkInterface.privateIpAddresses,
        secondaryPrivateIpAddressCount: networkInterface.secondaryPrivateIpAddressCount,
        sourceDestCheck: networkInterface.sourceDestCheck,
        subnetId: networkInterface.subnetId ? this.subnetMap.get(`${vpc}_${networkInterface.subnetId}`) : undefined,
      }),
    );
    return interfaceConfig;
  }

  /**
   * Process and return and array of security group IDs
   * @param groups
   * @param vpc
   * @returns
   */
  private processSecurityGroups(groups: string[], vpc: string): string[] {
    const securityGroups: string[] = [];
    if (groups.length > 0) {
      groups.forEach(group => {
        const securityGroupItem = this.securityGroupMap.get(`${vpc}_${group}`);
        if (!securityGroupItem) {
          this.logger.error(`Unable to retrieve security group ${group} from VPC ${vpc}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        securityGroups.push(securityGroupItem);
      });
    }

    return securityGroups;
  }

  /**
   * Process and return replacements for an autoscaling config
   * @param group
   * @param vpc
   * @returns
   */
  private processAutoScalingReplacements(group: AutoScalingConfig, vpc: string): AutoScalingConfig {
    return {
      name: group.name,
      minSize: group.minSize,
      maxSize: group.maxSize,
      desiredSize: group.desiredSize,
      launchTemplate: group.launchTemplate,
      healthCheckGracePeriod: group.healthCheckGracePeriod,
      healthCheckType: group.healthCheckType,
      targetGroups: group.targetGroups ? this.processTargetGroups(group.targetGroups) : undefined,
      subnets: this.processSubnets(group.subnets, vpc),
    };
  }

  /**
   * Process and return subnet ID replacements
   * @param subnets
   * @param vpc
   * @returns
   */
  private processSubnets(subnets: string[], vpc: string): string[] {
    const processedSubnets: string[] = [];
    if (subnets.length > 0) {
      subnets.forEach(subnet => {
        const subnetItem = this.subnetMap.get(`${vpc}_${subnet}`);
        if (!subnetItem) {
          this.logger.error(`Unable to retrieve subnet ${subnet} from VPC ${vpc}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        processedSubnets.push(subnetItem);
      });
    }

    return processedSubnets;
  }

  /**
   * Process and return target group ARN replacements
   * @param groups
   * @returns
   */
  private processTargetGroups(groups: string[]): string[] {
    const targetGroups: string[] = [];
    if (groups.length > 0) {
      groups.forEach(group => {
        const groupItem = this.targetGroupMap.get(group);
        if (!groupItem) {
          this.logger.error(`Unable to retrieve target group ${group}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        targetGroups.push(groupItem.targetGroupArn);
      });
    }

    return targetGroups;
  }

  /**
   * Create Gateway Load Balancer resources.
   */
  private createGwlbResources(): void {
    // Create GWLB listeners
    this.createGwlbListeners();
    // Create GWLB endpoints
    this.createGwlbEndpointResources();
  }

  /**
   * Create Gateway Load Balancer listeners
   */
  private createGwlbListeners() {
    for (const gwlbItem of this.props.networkConfig.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      if (gwlbItem.targetGroup && this.targetGroupMap.has(gwlbItem.targetGroup)) {
        this.createGwlbListener(gwlbItem);
      }
    }
  }

  /**
   * Create a Gateway Load Balancer listener
   * @param gwlbItem
   */
  private createGwlbListener(gwlbItem: GwlbConfig) {
    const loadBalancerArn = this.gwlbMap.get(gwlbItem.name);
    const targetGroupArn = this.targetGroupMap.get(gwlbItem.targetGroup!)?.targetGroupArn;
    if (!loadBalancerArn) {
      this.logger.error(`Unable to retrieve Gateway Load Balancer ARN for ${gwlbItem.name}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    if (!targetGroupArn) {
      this.logger.error(`Unable to retrieve target group ARN for ${gwlbItem.targetGroup}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    this.logger.info(
      `Creating listener on Gateway Load Balancer ${gwlbItem.name}: forwarding to target group ${gwlbItem.targetGroup}`,
    );
    new cdk.aws_elasticloadbalancingv2.CfnListener(this, pascalCase(`${gwlbItem.vpc}${gwlbItem.name}Listener`), {
      defaultActions: [
        {
          type: 'forward',
          targetGroupArn,
        },
      ],
      loadBalancerArn,
    });
  }

  /**
   * Create Gateway Load Balancer endpoint resources
   */
  private createGwlbEndpointResources() {
    for (const vpcItem of this.vpcResources) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        const vpcId = this.vpcMap.get(vpcItem.name);
        if (!vpcId) {
          this.logger.error(`Unable to locate VPC ${vpcItem.name}`);
          throw new Error(`Configuration validation failed at runtime.`);
        }
        // Create GWLB endpoints and set map
        const gwlbEndpointMap = this.createGwlbEndpoints(vpcItem, vpcId);

        // Create GWLB route table entries
        this.createGwlbRouteTableEntries(vpcItem, gwlbEndpointMap);
      }
    }
  }

  /**
   * Create GWLB endpoints for this stack's account ID and region
   * @param vpcItem
   * @param vpcId
   * @returns
   */
  private createGwlbEndpoints(vpcItem: VpcConfig | VpcTemplatesConfig, vpcId: string): Map<string, VpcEndpoint> {
    const gwlbEndpointMap = new Map<string, VpcEndpoint>();
    if (this.props.networkConfig.centralNetworkServices?.gatewayLoadBalancers) {
      const loadBalancers = this.props.networkConfig.centralNetworkServices.gatewayLoadBalancers;
      const delegatedAdminAccountId = this.props.accountsConfig.getAccountId(
        this.props.networkConfig.centralNetworkServices.delegatedAdminAccount,
      );

      // Create GWLB endpoints and add them to a map
      for (const loadBalancerItem of loadBalancers) {
        const lbItemEndpointMap = this.createGwlbEndpointMap(
          vpcId,
          vpcItem,
          loadBalancerItem,
          delegatedAdminAccountId,
          this.props.partition,
        );
        lbItemEndpointMap.forEach((endpoint, name) => gwlbEndpointMap.set(name, endpoint));
      }
    }
    return gwlbEndpointMap;
  }

  /**
   * Create Gateway Load Balancer endpoint map.
   * @param vpcId
   * @param vpcItem
   * @param loadBalancerItem
   * @param delegatedAdminAccountId
   * @returns
   */
  private createGwlbEndpointMap(
    vpcId: string,
    vpcItem: VpcConfig | VpcTemplatesConfig,
    loadBalancerItem: GwlbConfig,
    delegatedAdminAccountId: string,
    partition: string,
  ): Map<string, VpcEndpoint> {
    const endpointMap = new Map<string, VpcEndpoint>();
    let endpointServiceId: string | undefined = undefined;
    for (const endpointItem of loadBalancerItem.endpoints) {
      if (endpointItem.vpc === vpcItem.name) {
        // Get endpoint service ID
        if (!endpointServiceId) {
          if (delegatedAdminAccountId !== cdk.Stack.of(this).account) {
            endpointServiceId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${loadBalancerItem.name}`), {
              name: this.getSsmPath(SsmResourceType.GWLB_SERVICE, [loadBalancerItem.name]),
              accountId: delegatedAdminAccountId,
              parameterRegion: cdk.Stack.of(this).region,
              roleName: `${this.props.prefixes.accelerator}-Get${pascalCase(loadBalancerItem.name)}SsmParamRole-${
                cdk.Stack.of(this).region
              }`,
              kmsKey: this.cloudwatchKey,
              logRetentionInDays: this.logRetention,
              acceleratorPrefix: this.props.prefixes.accelerator,
            }).value;
          } else {
            endpointServiceId = cdk.aws_ssm.StringParameter.valueForStringParameter(
              this,
              this.getSsmPath(SsmResourceType.GWLB_SERVICE, [loadBalancerItem.name]),
            );
          }
        }

        // Create endpoint and add to map
        const endpoint = this.createGwlbEndpointItem(endpointItem, vpcId, endpointServiceId, partition);
        endpointMap.set(endpointItem.name, endpoint);
      }
    }
    return endpointMap;
  }

  /**
   * Create Gateway Load Balancer endpoint item.
   *
   * @param endpointItem
   * @param vpcId
   * @param endpointServiceId
   */
  private createGwlbEndpointItem(
    endpointItem: GwlbEndpointConfig,
    vpcId: string,
    endpointServiceId: string,
    partition: string,
  ): VpcEndpoint {
    const subnetKey = `${endpointItem.vpc}_${endpointItem.subnet}`;
    const subnet = this.subnetMap.get(subnetKey);

    if (!subnet) {
      this.logger.error(
        `Create Gateway Load Balancer endpoint: subnet ${endpointItem.subnet} not found in VPC ${endpointItem.vpc}`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }

    // Create endpoint
    this.logger.info(
      `Add Gateway Load Balancer endpoint ${endpointItem.name} to VPC ${endpointItem.vpc} subnet ${endpointItem.subnet}`,
    );
    return new VpcEndpoint(this, `${pascalCase(endpointItem.vpc)}Vpc${pascalCase(endpointItem.name)}GwlbEp`, {
      service: endpointServiceId,
      vpcEndpointType: VpcEndpointType.GWLB,
      vpcId,
      subnets: [subnet],
      partition: partition,
    });
  }

  /**
   * Create GWLB endpoint route table entries.
   * @param vpcItem
   * @param gwlbEndpointMap
   */
  private createGwlbRouteTableEntries(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    gwlbEndpointMap: Map<string, VpcEndpoint>,
  ): void {
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      for (const routeTableEntryItem of routeTableItem.routes ?? []) {
        this.createGwlbRouteTableEntryItem(vpcItem.name, routeTableItem.name, routeTableEntryItem, gwlbEndpointMap);
      }
    }
  }

  /**
   * Create GWLB route table entry item.
   * @param vpcName
   * @param routeTableName
   * @param routeTableEntryItem
   * @param gwlbEndpointMap
   */
  private createGwlbRouteTableEntryItem(
    vpcName: string,
    routeTableName: string,
    routeTableEntryItem: RouteTableEntryConfig,
    gwlbEndpointMap: Map<string, VpcEndpoint>,
  ): void {
    const endpointRouteId =
      pascalCase(`${vpcName}Vpc`) + pascalCase(`${routeTableName}RouteTable`) + pascalCase(routeTableEntryItem.name);

    if (routeTableEntryItem.type && routeTableEntryItem.type === 'gatewayLoadBalancerEndpoint') {
      // Get endpoint and route table items
      const gwlbEndpoint = gwlbEndpointMap.get(routeTableEntryItem.target!);
      const routeTableId = this.routeTableMap.get(`${vpcName}_${routeTableName}`);

      // Check if route table exists im map
      if (!routeTableId) {
        this.logger.error(`Unable to locate route table ${routeTableName}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      if (!gwlbEndpoint) {
        this.logger.error(`Unable to locate endpoint ${routeTableEntryItem.target}`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      // Add route
      this.logger.info(`Adding Gateway Load Balancer endpoint Route Table Entry ${routeTableEntryItem.name}`);
      gwlbEndpoint.createEndpointRoute(endpointRouteId, routeTableEntryItem.destination!, routeTableId);
    }
  }
}
