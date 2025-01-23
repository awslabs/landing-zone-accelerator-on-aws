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

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

import {
  AseaResourceType,
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
  CrossAccountRoute,
  CrossAccountRouteFramework,
  FirewallAutoScalingGroup,
  FirewallConfigReplacements,
  FirewallInstance,
  SsmParameterLookup,
  TargetGroup,
  VpcEndpoint,
  VpcEndpointType,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';

import { AcceleratorStackProps } from '../../accelerator-stack';
import { NetworkStack } from '../network-stack';
import {
  getNetworkInterfaceLookupDetails,
  getRouteTable,
  getVpc,
  getVpcConfig,
  getVpcOwnerAccountName,
} from '../utils/getter-utils';
import { setIpamSubnetRouteTableEntryArray } from '../utils/setter-utils';
import { FirewallVpnResources } from './firewall-vpn-resources';

interface FirewallConfigDetails {
  /**
   * The asset bucket name
   */
  assetBucketName: string;
  /**
   * The config bucket name
   */
  configBucketName: string;
  /**
   * The custom resource role
   */
  customResourceRole: cdk.aws_iam.IRole;
}

interface networkInterfaceRouteDetails {
  /**
   * Details of the route entry
   */
  routeEntry: RouteTableEntryConfig;
  /**
   * The name of the VPC route table
   */
  routeTableName: string;
  /**
   * The name of the VPC containing the route
   */
  vpcName: string;
  /**
   * True if the route's VPC is owned by the current account
   */
  vpcOwnedByAccount: boolean;
  /**
   * The index of the firewall ENI, if applicable
   */
  eniIndex?: number;
  /**
   * The name of the firewall target, if applicable
   */
  firewallName?: string;
  /**
   * True if the route's target firewall is owned by the current account
   */
  firewallOwnedByAccount?: boolean;
}

export class NetworkAssociationsGwlbStack extends NetworkStack {
  private firewallConfigDetails: FirewallConfigDetails;
  private gwlbMap: Map<string, string>;
  private instanceMap: Map<string, FirewallInstance>;
  private routeTableMap: Map<string, string>;
  private securityGroupMap: Map<string, string>;
  // Map to store subnet IDs of owned and shared subnets
  private subnetMap: Map<string, string>;
  private ipamSubnetArray: string[];
  private targetGroupMap: Map<string, TargetGroup>;
  // Map to store all vpc mapping of owned and shared VPCs
  private vpcMap: Map<string, string>;
  // Map to store only local vpcs which are created in account
  private vpcsInScopeMap: Map<string, string>;
  private crossAcctRouteProvider?: cdk.custom_resources.Provider;
  private networkInterfaceRouteArray: networkInterfaceRouteDetails[];

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Set initial private properties
    // Since VPC names are unique there is only one VPC in the list which is either shared or native to account with name
    const vpcs = [...this.vpcsInScope, ...this.sharedVpcs];
    this.vpcMap = this.setVpcMap(vpcs);
    this.vpcsInScopeMap = this.setVpcMap(this.vpcsInScope);
    const ownedSubnetsMap = this.setSubnetMap(this.vpcsInScope);
    this.subnetMap = new Map([...ownedSubnetsMap.entries(), ...this.getSharedSubnetsMap().entries()]);
    this.ipamSubnetArray = setIpamSubnetRouteTableEntryArray(vpcs);
    this.routeTableMap = this.setRouteTableMap(this.vpcsInScope);
    this.securityGroupMap = this.setSecurityGroupMap(vpcs);
    this.gwlbMap = this.setInitialMaps(this.vpcsInScope);

    // Set firewall config custom resource details
    this.firewallConfigDetails = {
      assetBucketName: `${
        this.acceleratorResourceNames.bucketPrefixes.assets
      }-${props.accountsConfig.getManagementAccountId()}-${props.globalConfig.homeRegion}`,
      configBucketName: `${this.acceleratorResourceNames.bucketPrefixes.firewallConfig}-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`,
      customResourceRole: cdk.aws_iam.Role.fromRoleName(
        this,
        'FirewallConfigRole',
        this.acceleratorResourceNames.roles.firewallConfigFunctionRoleName,
      ),
    };
    //
    // Create firewall instances and target groups
    //
    this.instanceMap = this.createFirewallInstances();
    this.targetGroupMap = this.createFirewallTargetGroups(this.instanceMap);
    //
    // Set network interface route array
    //
    this.networkInterfaceRouteArray = this.setNetworkInterfaceRouteArray();
    //
    // Create cross-account route provider, if required
    //
    this.crossAcctRouteProvider = this.createCrossAcctRouteProvider();
    //
    // Crete firewall VPN resources
    //
    new FirewallVpnResources(this, props, this.instanceMap);
    //
    // Create firewall autoscaling groups
    //
    this.createFirewallAutoScalingGroups();
    //
    // Create Gateway Load Balancer resources
    //
    this.createGwlbResources();
    //
    // Create ENI Routes
    //
    this.createNetworkInterfaceRouteTableEntries();
    //
    // Add nag suppressions
    //
    this.addResourceSuppressionsByPath();

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
   * Returns a map of VPC routes targeting elastic network interfaces (ENIs)
   * @param vpcItem
   * @returns
   */
  private setNetworkInterfaceRouteArray(): networkInterfaceRouteDetails[] {
    const eniRouteArray: networkInterfaceRouteDetails[] = [];
    for (const vpcItem of this.vpcResources) {
      // only look in VpcConfig, skip VpcTemplateConfig
      if ('account' in vpcItem) {
        for (const routeTableItem of vpcItem.routeTables ?? []) {
          for (const routeTableEntryItem of routeTableItem.routes ?? []) {
            if (routeTableEntryItem.type === 'networkInterface') {
              const routeDetails = this.getNetworkInterfaceRouteDetails(
                routeTableEntryItem,
                routeTableItem.name,
                vpcItem.name,
              );
              eniRouteArray.push(routeDetails);
            }
          }
        }
      }
    }

    return eniRouteArray;
  }

  /**
   * Returns details of an ENI route and the target ENI
   * @param routeEntry
   * @param routeTableName
   * @param vpcItem
   * @returns
   */
  private getNetworkInterfaceRouteDetails(
    routeEntry: RouteTableEntryConfig,
    routeTableName: string,
    vpcName: string,
  ): networkInterfaceRouteDetails {
    let firewallName: string | undefined;
    let eniIndex: number | undefined;
    let firewallOwnedByAccount: boolean | undefined;

    if (this.isNetworkInterfaceTargetLookup(routeEntry.target, routeEntry.name)) {
      firewallName = getNetworkInterfaceLookupDetails('FIREWALL_NAME', routeEntry.name, routeEntry.target);
      eniIndex = parseInt(getNetworkInterfaceLookupDetails('ENI_INDEX', routeEntry.name, routeEntry.target));
      firewallOwnedByAccount = this.instanceMap.has(firewallName);
    }
    return {
      routeEntry,
      routeTableName,
      vpcName,
      vpcOwnedByAccount: this.vpcsInScopeMap.has(vpcName),
      firewallName,
      eniIndex,
      firewallOwnedByAccount,
    };
  }

  /**
   * Returns a map of subnet IDs of shared subnets
   * @returns
   */
  private getSharedSubnetsMap(): Map<string, string> {
    const subnetMap = new Map<string, string>();
    for (const vpcItem of this.sharedVpcs) {
      for (const subnetItem of vpcItem.subnets ?? []) {
        if (
          subnetItem.shareTargets &&
          (this.isOrganizationalUnitIncluded(subnetItem.shareTargets.organizationalUnits) ||
            this.isAccountIncluded(subnetItem.shareTargets.accounts))
        ) {
          const subnetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
          );
          subnetMap.set(`${vpcItem.name}_${subnetItem.name}`, subnetId);
        }
      }
    }
    return subnetMap;
  }

  /**
   * Function to check scope of resource based on vpcName and account.
   * @param vpcName
   * @param account
   * @returns
   */
  private isInScope(vpcName: string, account?: string) {
    return (
      (account &&
        cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account) &&
        this.vpcMap.has(vpcName)) ||
      (!account && this.vpcsInScopeMap.has(vpcName))
    );
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
      if (this.isManagedByAsea(AseaResourceType.FIREWALL_INSTANCE, firewallInstance.name)) {
        this.logger.info(`Firewall Instance ${firewallInstance.name} is managed by ASEA`);
        continue;
      }
      if (this.isInScope(firewallInstance.vpc, firewallInstance.account)) {
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
      configBucketName: this.firewallConfigDetails.configBucketName,
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
    //
    // Generate replacements
    if (firewallInstance.configFile || firewallInstance.configDir || firewallInstance.licenseFile) {
      new FirewallConfigReplacements(
        this,
        pascalCase(`${firewallInstance.vpc}${firewallInstance.name}ConfigReplacements`),
        {
          cloudWatchLogKey: this.cloudwatchKey,
          cloudWatchLogRetentionInDays: this.logRetention,
          environmentEncryptionKey: this.lambdaKey,
          properties: [
            { assetBucketName: this.firewallConfigDetails.assetBucketName },
            { configBucketName: this.firewallConfigDetails.configBucketName },
            { configFile: firewallInstance.configFile },
            { configDir: firewallInstance.configDir },
            { firewallName: instance.name },
            { instanceId: instance.instanceId },
            { licenseFile: firewallInstance.licenseFile },
            { staticReplacements: firewallInstance.staticReplacements },
            { vpcId: getVpc(this.vpcMap, firewallInstance.vpc) as string },
            { roleName: this.acceleratorResourceNames.roles.crossAccountVpnRoleName },
            { vpnConnections: instance.vpnConnections },
            { managementAccountId: this.props.accountsConfig.getManagementAccountId() },
          ],
          role: this.firewallConfigDetails.customResourceRole,
        },
      );
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
        if (asgTargetGroups && asgTargetGroups[0] === group.name && this.isInScope(asg.vpc, asg.account)) {
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
      if (this.isInScope(group.vpc, group.account)) {
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
      configBucketName: this.firewallConfigDetails.configBucketName,
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

    //
    // Generate replacements
    if (group.configFile || group.configDir || group.licenseFile) {
      new FirewallConfigReplacements(this, pascalCase(`${group.vpc}${group.name}ConfigReplacements`), {
        cloudWatchLogKey: this.cloudwatchKey,
        cloudWatchLogRetentionInDays: this.logRetention,
        environmentEncryptionKey: this.lambdaKey,
        properties: [
          { assetBucketName: this.firewallConfigDetails.assetBucketName },
          { configBucketName: this.firewallConfigDetails.configBucketName },
          { configFile: group.configFile },
          { configDir: group.configDir },
          { licenseFile: group.licenseFile },
          { staticReplacements: group.staticReplacements },
          { vpcId: getVpc(this.vpcMap, group.vpc) as string },
          { managementAccountId: this.props.accountsConfig.getManagementAccountId() },
        ],
        role: this.firewallConfigDetails.customResourceRole,
      });
    }
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
      securityGroups: this.processSecurityGroups(launchTemplate.securityGroups ?? [], vpc),
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
      maxInstanceLifetime: group.maxInstanceLifetime,
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
    for (const vpcItem of this.vpcsInScope) {
      // Get account IDs
      const vpcId = getVpc(this.vpcMap, vpcItem.name) as string;
      // Create GWLB endpoints and set map
      const gwlbEndpointMap = this.createGwlbEndpoints(vpcItem, vpcId);

      // Create GWLB route table entries
      this.createGwlbRouteTableEntries(vpcItem, gwlbEndpointMap);
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
      // Create GWLB endpoints and add them to a map
      for (const loadBalancerItem of loadBalancers) {
        const lbItemEndpointMap = this.createGwlbEndpointMap(vpcId, vpcItem, loadBalancerItem, this.props.partition);
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
    partition: string,
  ): Map<string, VpcEndpoint> {
    const endpointMap = new Map<string, VpcEndpoint>();
    let endpointServiceId: string | undefined = undefined;
    for (const endpointItem of loadBalancerItem.endpoints) {
      if (endpointItem.vpc === vpcItem.name) {
        // Get endpoint service ID
        endpointServiceId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.getSsmPath(SsmResourceType.GWLB_SERVICE, [loadBalancerItem.name]),
        );
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
      const [destination, ipv6Destination] = this.setRouteEntryDestination(
        routeTableEntryItem,
        this.ipamSubnetArray,
        vpcName,
      );

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
      gwlbEndpoint.createEndpointRoute(endpointRouteId, routeTableId, destination, ipv6Destination);
    }
  }

  /**
   * Create network interface route table entries.
   */
  private createNetworkInterfaceRouteTableEntries(): void {
    const crossAccountRouteTableMap = this.getCrossAccountRouteTableIds(this.networkInterfaceRouteArray);

    for (const route of this.networkInterfaceRouteArray) {
      if (route.vpcOwnedByAccount) {
        this.createNetworkInterfaceRouteForOwnedVpc(route);
      } else if (route.firewallOwnedByAccount || this.isAseaFirewallOwnedByAccount(route)) {
        this.createNetworkInterfaceRouteForOwnedFirewall(route, crossAccountRouteTableMap);
      }
    }
  }

  private isAseaFirewallOwnedByAccount(route: networkInterfaceRouteDetails) {
    if (!route.firewallName) {
      return false;
    }
    if (!this.isManagedByAsea(AseaResourceType.FIREWALL_INSTANCE, route.firewallName)) {
      return false;
    }
    const firewallInstances = [
      ...(this.props.customizationsConfig.firewalls?.instances ?? []),
      ...(this.props.customizationsConfig.firewalls?.managerInstances ?? []),
    ];

    const firewallInstance = firewallInstances.find(instance => instance.name === route.firewallName);

    if (!firewallInstance) {
      return false;
    }

    return route.vpcName === firewallInstance.vpc;
  }

  /**
   * Retrieves a map of cross-account route table IDs
   * @param routeDetailsArray networkInterfaceRouteDetails[]
   * @returns Map<string, string>
   */
  private getCrossAccountRouteTableIds(routeDetailsArray: networkInterfaceRouteDetails[]): Map<string, string> {
    const crossAccountRouteTableMap = new Map<string, string>();
    for (const route of routeDetailsArray) {
      if (route.firewallOwnedByAccount && !crossAccountRouteTableMap.has(route.routeTableName)) {
        const vpcOwnerAccount = getVpcOwnerAccountName(this.props.networkConfig.vpcs, route.vpcName);
        const vpcOwnerAccountId = this.props.accountsConfig.getAccountId(vpcOwnerAccount);
        // get cross-account route table id
        const routeTableId = new SsmParameterLookup(this, pascalCase(`SsmParamLookup${route.routeTableName}`), {
          name: this.getSsmPath(SsmResourceType.ROUTE_TABLE, [route.vpcName, route.routeTableName]),
          accountId: vpcOwnerAccountId,
          parameterRegion: cdk.Stack.of(this).region,
          roleName: `${this.props.prefixes.accelerator}-VpcPeeringRole-${cdk.Stack.of(this).region}`,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
          acceleratorPrefix: this.props.prefixes.accelerator,
        }).value;
        crossAccountRouteTableMap.set(`${route.routeTableName}`, routeTableId);
      }
    }
    return crossAccountRouteTableMap;
  }

  /**
   * Create network interface route table entries for entries in VPCs shared to this account.
   */
  private createNetworkInterfaceRouteForOwnedFirewall(
    routeDetails: networkInterfaceRouteDetails,
    crossAccountRouteTableMap: Map<string, string>,
  ): void {
    if (routeDetails.firewallName && routeDetails.eniIndex !== undefined) {
      const networkInterfaceId = this.getNetworkInterfaceIdFromFirewall(routeDetails);
      this.logger.info(
        `Creating cross-account route targeting ENI of firewall ${routeDetails.firewallName} owned by this account in VPC ${routeDetails.vpcName}`,
      );

      this.createCrossAccountNetworkInterfaceRoute(
        routeDetails.vpcName,
        routeDetails.routeTableName,
        routeDetails.routeEntry,
        networkInterfaceId,
        crossAccountRouteTableMap,
      );
    }
  }

  /**
   * Create network interface route table entries for entries in VPCs owned by this account.
   */
  private createNetworkInterfaceRouteForOwnedVpc(routeDetails: networkInterfaceRouteDetails): void {
    let networkInterfaceId: string;
    const aseaFirewallOwnedByAccount = this.isAseaFirewallOwnedByAccount(routeDetails);
    if (routeDetails.firewallName && routeDetails.firewallOwnedByAccount) {
      this.logger.info(
        `Creating route targeting ENI of firewall ${routeDetails.firewallName} in VPC ${routeDetails.vpcName}`,
      );
      networkInterfaceId = this.getNetworkInterfaceIdFromFirewall(routeDetails);
    } else if (routeDetails.firewallName && aseaFirewallOwnedByAccount && routeDetails.eniIndex !== undefined) {
      this.logger.info(
        `Creating route targeting ENI of firewall ${routeDetails.firewallName} in VPC ${routeDetails.vpcName}`,
      );
      networkInterfaceId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.FIREWALL_ENI, [routeDetails.firewallName, routeDetails.eniIndex.toString()]),
      );
    } else if (routeDetails.firewallName && !routeDetails.firewallOwnedByAccount && !aseaFirewallOwnedByAccount) {
      this.logger.debug(
        `Skipping route targeting ENI of firewall ${routeDetails.firewallName} owned by different account in VPC ${routeDetails.vpcName}`,
      );
      return;
    } else {
      this.logger.info(
        `Creating route targeting explicit ENI ${routeDetails.routeEntry.target}} in VPC ${routeDetails.vpcName}`,
      );
      networkInterfaceId = routeDetails.routeEntry.target!;
    }
    this.createNetworkInterfaceRoute(
      routeDetails.vpcName,
      routeDetails.routeTableName,
      routeDetails.routeEntry,
      networkInterfaceId,
    );
  }

  /**
   * Create VPC Route Table route targeting Elastic Network Interface (ENI) in another account
   */
  private createCrossAccountNetworkInterfaceRoute(
    vpcName: string,
    routeTableName: string,
    routeTableEntryItem: RouteTableEntryConfig,
    networkInterfaceId: string,
    crossAccountRouteTableMap: Map<string, string>,
  ): void {
    this.logger.info(`Adding cross-account Network Interface Route Table Entry ${routeTableEntryItem.name}`);
    const routeId =
      pascalCase(`${vpcName}Vpc`) + pascalCase(`${routeTableName}RouteTable`) + pascalCase(routeTableEntryItem.name);

    const vpcOwnerAccount = getVpcOwnerAccountName(this.props.networkConfig.vpcs, vpcName);
    const vpcOwnerAccountId = this.props.accountsConfig.getAccountId(vpcOwnerAccount);
    const routeTableId = crossAccountRouteTableMap.get(routeTableName);

    if (!routeTableId) {
      this.logger.error(
        `Attempting to create cross-account route ${routeTableEntryItem.name} but route table does not exist`,
      );
      throw new Error('No cross-account route table target');
    }
    if (!this.crossAcctRouteProvider) {
      this.logger.error(
        `Attempting to create cross-account route ${routeTableEntryItem.name} but cross-account route provider does not exist`,
      );
      throw new Error('No cross route provider');
    }
    new CrossAccountRoute(this, routeId, {
      ownerAccount: vpcOwnerAccountId,
      ownerRegion: cdk.Stack.of(this).region,
      partition: cdk.Stack.of(this).partition,
      provider: this.crossAcctRouteProvider,
      roleName: `${this.props.prefixes.accelerator}-VpcPeeringRole-${cdk.Stack.of(this).region}`,
      routeTableId: routeTableId,
      destination: routeTableEntryItem.destination,
      ipv6Destination: routeTableEntryItem.ipv6Destination,
      networkInterfaceId: networkInterfaceId,
    });
  }

  /**
   * Create VPC Route Table route targeting Elastic Network Interface (ENI)
   */
  private createNetworkInterfaceRoute(
    vpcName: string,
    routeTableName: string,
    routeTableEntryItem: RouteTableEntryConfig,
    networkInterfaceId: string,
  ): void {
    this.logger.info(`Adding Network Interface Route Table Entry ${routeTableEntryItem.name}`);
    const routeTableId = getRouteTable(this.routeTableMap, vpcName, routeTableName) as string;
    const routeId =
      pascalCase(`${vpcName}Vpc`) + pascalCase(`${routeTableName}RouteTable`) + pascalCase(routeTableEntryItem.name);

    new cdk.aws_ec2.CfnRoute(this, routeId, {
      destinationCidrBlock: routeTableEntryItem.destination,
      destinationIpv6CidrBlock: routeTableEntryItem.ipv6Destination,
      networkInterfaceId: networkInterfaceId,
      routeTableId,
    });
  }

  /**
   * Returns true if the target of the networkInterface route is an EC2 firewall instance
   * @param vpcItem
   * @param gwlbEndpointMap
   */
  private isNetworkInterfaceTargetLookup(routeTarget: string | undefined, routeTableEntryName: string): boolean {
    if (routeTarget?.startsWith('eni-')) {
      return false;
    } else if (routeTarget?.match('\\${ACCEL_LOOKUP::EC2:ENI_([a-zA-Z0-9-/:_]*)}')) {
      return true;
    } else {
      this.logger.error(`Unable to retrieve target ${routeTarget} for route table entry ${routeTableEntryName}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
  }

  /**
   * Get Id of the network interface (ENI) associated with a firewall instance.
   * @param firewallName
   * @param deviceIndex
   */
  private getNetworkInterfaceIdFromFirewall(routeDetails: networkInterfaceRouteDetails): string {
    if (!routeDetails.firewallName) {
      this.logger.error(`Firewall name is not defined for route ${routeDetails.routeEntry.name}`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    if (routeDetails.eniIndex === undefined) {
      this.logger.error(`ENI index for firewall ${routeDetails.firewallName} is not defined`);
      throw new Error(`Configuration validation failed at runtime.`);
    }
    let eni;
    const firewall = this.instanceMap.get(routeDetails.firewallName);
    const aseaFirewallOwnedByAccount = this.isAseaFirewallOwnedByAccount(routeDetails);
    if (firewall) {
      eni = firewall.getNetworkInterface(routeDetails.eniIndex).networkInterfaceId;
    }
    if (aseaFirewallOwnedByAccount) {
      eni = this.getSsmPath(SsmResourceType.FIREWALL_ENI, [
        routeDetails.firewallName,
        routeDetails.eniIndex.toString(),
      ]);
    }
    if (!eni) {
      this.logger.error(
        `Could not retrieve network interface id for eni at index ${routeDetails.eniIndex.toString()} from firewall ${
          routeDetails.firewallName
        }`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }
    return eni;
  }

  /**
   * Function to check for cross-account route table entries
   * @returns boolean
   */
  private isCrossAccountRouteFramework(): boolean {
    const crossAccountVpcs: (VpcConfig | VpcTemplatesConfig)[] = this.getCrossAccountVpcsWithFirewalls();
    if (crossAccountVpcs.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Returns a list of VPC configs not owned by this account that host firewalls owned by this account
   * @returns
   */
  private getCrossAccountVpcsWithFirewalls(): (VpcConfig | VpcTemplatesConfig)[] {
    const crossAccountVpcs: (VpcConfig | VpcTemplatesConfig)[] = [];
    if (this.instanceMap.size > 0) {
      const firewallInstances = [
        ...(this.props.customizationsConfig.firewalls?.instances ?? []),
        ...(this.props.customizationsConfig.firewalls?.managerInstances ?? []),
      ];
      for (const firewallInstance of firewallInstances) {
        if (
          firewallInstance.account &&
          this.props.accountsConfig.getAccountId(firewallInstance.account) === cdk.Stack.of(this).account
        ) {
          this.logger.info(
            `Firewall ${firewallInstance.name} owned by this account ${firewallInstance.account} is deployed in VPC ${firewallInstance.vpc} owned by another account`,
          );
          const vpcConfig = getVpcConfig(this.vpcResources, firewallInstance.vpc);
          crossAccountVpcs.push(vpcConfig);
        }
      }
    }
    return crossAccountVpcs;
  }

  /**
   * Create a custom resource provider to handle cross-account VPC peering routes
   * @returns
   */
  private createCrossAcctRouteProvider(): cdk.custom_resources.Provider | undefined {
    if (this.isCrossAccountRouteFramework()) {
      const provider = new CrossAccountRouteFramework(this, 'CrossAccountRouteFramework', {
        acceleratorPrefix: this.props.prefixes.accelerator,
        logGroupKmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      }).provider;

      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/CrossAccountRouteFramework/CrossAccountRouteFunction/ServiceRole/Resource`,
        [{ id: 'AwsSolutions-IAM4', reason: 'Custom resource Lambda role policy.' }],
      );

      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/CrossAccountRouteFramework/CrossAccountRouteFunction/ServiceRole/DefaultPolicy/Resource`,
        [{ id: 'AwsSolutions-IAM5', reason: 'Custom resource Lambda role policy.' }],
      );

      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/CrossAccountRouteFramework/CrossAccountRouteProvider/framework-onEvent/ServiceRole/Resource`,
        [{ id: 'AwsSolutions-IAM4', reason: 'Custom resource Lambda role policy.' }],
      );

      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/CrossAccountRouteFramework/CrossAccountRouteProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
        [{ id: 'AwsSolutions-IAM5', reason: 'Custom resource Lambda role policy.' }],
      );

      return provider;
    }
    return undefined;
  }
}
