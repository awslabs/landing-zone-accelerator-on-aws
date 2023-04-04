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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as t from './common-types';

/**
 * Customization configuration items.
 */
export class CustomizationsConfigTypes {
  static readonly targetGroupProtocolType = t.enums('TargetGroupProtocolTypes', [
    'TCP',
    'TLS',
    'UDP',
    'TCP_UDP',
    'HTTP',
    'HTTPS',
    'GENEVE',
  ]);
  static readonly targetGroupProtocolVersionType = t.enums('TargetGroupProtocolTypes', ['GRPC', 'HTTP1', 'HTTP2']);
  static readonly targetGroupType = t.enums('TargetGroupProtocolTypes', ['instance', 'ip', 'alb']);
  static readonly targetGroupAttributeStickinessType = t.enums('TargetGroupAttributeStickinessTypes', [
    'lb_cookie',
    'app_cookie',
    'source_ip',
    'source_ip_dest_ip',
    'source_ip_dest_ip_proto',
  ]);
  static readonly targetGroupAttributeAlgorithm = t.enums('TargetGroupAttributeAlgorithms', [
    'round_robin',
    'least_outstanding_requests',
  ]);
  static readonly targetGroupHealthCheckProtocolType = t.enums('TargetGroupHealthCheckProtocolTypes', [
    'HTTP',
    'HTTPS',
    'TCP',
  ]);
  static readonly targetGroupTargetFailoverType = t.enums('TargetGroupTargetFailoverType', [
    'no_rebalance',
    'rebalance',
  ]);
  static readonly targetGroupHealthCheckType = t.interface({
    interval: t.optional(t.number),
    path: t.optional(t.nonEmptyString),
    port: t.optional(t.number),
    protocol: t.optional(this.targetGroupHealthCheckProtocolType),
    timeout: t.optional(t.number),
  });

  static readonly targetGroupThresholdType = t.interface({
    healthy: t.optional(t.number),
    unhealthy: t.optional(t.number),
  });

  static readonly targetGroupMatcherType = t.interface({
    grpcCode: t.optional(t.nonEmptyString),
    httpCode: t.optional(t.nonEmptyString),
  });

  static readonly targetGroupAttributeTypes = t.interface({
    deregistrationDelay: t.optional(t.number),
    stickiness: t.optional(t.boolean),
    stickinessType: t.optional(this.targetGroupAttributeStickinessType),
    algorithm: t.optional(this.targetGroupAttributeAlgorithm),
    slowStart: t.optional(t.number),
    appCookieName: t.optional(t.nonEmptyString),
    appCookieDuration: t.optional(t.number),
    lbCookieDuration: t.optional(t.number),
    connectionTermination: t.optional(t.boolean),
    preserveClientIp: t.optional(t.boolean),
    proxyProtocolV2: t.optional(t.boolean),
    targetFailover: t.optional(this.targetGroupTargetFailoverType),
  });

  static readonly nlbTargetType = t.interface({
    account: t.nonEmptyString,
    region: t.nonEmptyString,
    nlbName: t.nonEmptyString,
  });

  static readonly targetGroupItem = t.interface({
    name: t.nonEmptyString,
    port: t.number,
    protocol: this.targetGroupProtocolType,
    protocolVersion: t.optional(this.targetGroupProtocolVersionType),
    type: this.targetGroupType,
    attributes: t.optional(this.targetGroupAttributeTypes),
    healthCheck: t.optional(this.targetGroupHealthCheckType),
    targets: t.optional(t.array(t.union([t.nonEmptyString, this.nlbTargetType]))),
    threshold: t.optional(this.targetGroupThresholdType),
    matcher: t.optional(this.targetGroupMatcherType),
  });

  static readonly nlbProtocolEnum = t.enums('NlbProtocolEnum', ['TCP', 'UDP', 'TLS', 'TCP_UDP']);
  static readonly alpnPolicyEnum = t.enums('AlpnPolicyEnum', [
    'HTTP1Only',
    'HTTP2Only',
    'HTTP2Optional',
    'HTTP2Preferred',
    'None',
  ]);

  static sslPolicyNlbEnum = t.enums('SslPolicyEnum', [
    'ELBSecurityPolicy-TLS-1-0-2015-04',
    'ELBSecurityPolicy-TLS-1-1-2017-01',
    'ELBSecurityPolicy-TLS-1-2-2017-01',
    'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
    'ELBSecurityPolicy-FS-2018-06',
    'ELBSecurityPolicy-FS-1-1-2019-08',
    'ELBSecurityPolicy-FS-1-2-2019-08',
    'ELBSecurityPolicy-FS-1-2-Res-2019-08',
    'ELBSecurityPolicy-2015-05',
    'ELBSecurityPolicy-FS-1-2-Res-2020-10',
    'ELBSecurityPolicy-TLS13-1-2-2021-06',
    'ELBSecurityPolicy-TLS13-1-2-Res-2021-06',
    'ELBSecurityPolicy-TLS13-1-2-Ext1-2021-06',
    'ELBSecurityPolicy-TLS13-1-2-Ext2-2021-06',
    'ELBSecurityPolicy-TLS13-1-1-2021-06',
    'ELBSecurityPolicy-TLS13-1-0-2021-06',
    'ELBSecurityPolicy-TLS13-1-3-2021-06',
    'ELBSecurityPolicy-2016-08',
  ]);
  static readonly nlbListenerConfig = t.interface({
    name: t.nonEmptyString,
    certificate: t.optional(t.nonEmptyString),
    port: t.optional(t.number),
    protocol: t.optional(this.nlbProtocolEnum),
    alpnPolicy: t.optional(this.alpnPolicyEnum),
    sslPolicy: t.optional(this.sslPolicyNlbEnum),
    // NLBs can only do forwarding to a target group
    targetGroup: t.nonEmptyString,
  });

  static readonly loadBalancerSchemeEnum = t.enums('LoadBalancerSchemeEnum', ['internet-facing', 'internal']);
  static readonly networkLoadBalancerConfig = t.interface({
    scheme: t.optional(this.loadBalancerSchemeEnum),
    deletionProtection: t.optional(t.boolean),
    subnets: t.array(t.nonEmptyString),
    name: t.nonEmptyString,
    crossZoneLoadBalancing: t.optional(t.boolean),
    listeners: t.optional(t.array(this.nlbListenerConfig)),
  });

  static readonly privateIpAddressItem = t.interface({
    primary: t.optional(t.boolean),
    privateIpAddress: t.optional(t.nonEmptyString),
  });

  static readonly ebsItem = t.interface({
    deleteOnTermination: t.optional(t.boolean),
    encrypted: t.optional(t.boolean),
    iops: t.optional(t.number),
    kmsKeyId: t.optional(t.nonEmptyString),
    snapshotId: t.optional(t.nonEmptyString),
    throughput: t.optional(t.number),
    volumeSize: t.optional(t.number),
    volumeType: t.optional(t.nonEmptyString),
  });

  static readonly blockDeviceMappingItem = t.interface({
    deviceName: t.nonEmptyString,
    ebs: t.optional(this.ebsItem),
  });

  static readonly networkInterfaceItem = t.interface({
    associateCarrierIpAddress: t.optional(t.boolean),
    associateElasticIp: t.optional(t.boolean),
    associatePublicIpAddress: t.optional(t.boolean),
    deleteOnTermination: t.optional(t.boolean),
    description: t.optional(t.nonEmptyString),
    deviceIndex: t.optional(t.number),
    groups: t.optional(t.array(t.nonEmptyString)),
    interfaceType: t.optional(t.nonEmptyString),
    networkCardIndex: t.optional(t.number),
    networkInterfaceId: t.optional(t.nonEmptyString),
    privateIpAddress: t.optional(t.nonEmptyString),
    privateIpAddresses: t.optional(t.array(this.privateIpAddressItem)),
    secondaryPrivateIpAddressCount: t.optional(t.number),
    sourceDestCheck: t.optional(t.boolean),
    subnetId: t.optional(t.nonEmptyString),
  });

  static readonly launchTemplateConfig = t.interface({
    name: t.nonEmptyString,
    blockDeviceMappings: t.optional(t.array(this.blockDeviceMappingItem)),
    securityGroups: t.array(t.nonEmptyString),
    keyPair: t.optional(t.nonEmptyString),
    iamInstanceProfile: t.optional(t.nonEmptyString),
    imageId: t.nonEmptyString,
    instanceType: t.nonEmptyString,
    enforceImdsv2: t.optional(t.boolean),
    networkInterfaces: t.optional(t.array(this.networkInterfaceItem)),
    userData: t.optional(t.nonEmptyString),
  });

  static readonly autoScalingHealthCheckTypeEnum = t.enums('AutoScalingHealthCheckTypeEnum', ['EC2', 'ELB']);

  static readonly autoscalingConfig = t.interface({
    name: t.nonEmptyString,
    minSize: t.number,
    maxSize: t.number,
    desiredSize: t.number,
    launchTemplate: t.nonEmptyString,
    healthCheckGracePeriod: t.optional(t.number),
    healthCheckType: t.optional(this.autoScalingHealthCheckTypeEnum),
    targetGroups: t.optional(t.array(t.nonEmptyString)),
    subnets: t.array(t.nonEmptyString),
  });
  static readonly albRoutingHttpConfigMitigationModeEnum = t.enums('AlbRoutingHttpConfigMitigationModeEnum', [
    'monitor',
    'defensive',
    'strictest',
  ]);

  static readonly albRoutingHttpConfig = t.interface({
    desyncMitigationMode: t.optional(this.albRoutingHttpConfigMitigationModeEnum),
    dropInvalidHeader: t.optional(t.boolean),
    xAmznTlsCipherEnable: t.optional(t.boolean),
    xffClientPort: t.optional(t.boolean),
  });

  static readonly albListenerProtocolEnum = t.enums('AlbListenerProtocolEnum', ['HTTP', 'HTTPS']);

  static readonly albListenerTypeEnum = t.enums('AlbListenerTypeEnum', ['fixed-response', 'forward', 'redirect']);
  static readonly sslPolicyAlbEnum = t.enums('SslPolicyAlbEnum', [
    'ELBSecurityPolicy-TLS-1-0-2015-04',
    'ELBSecurityPolicy-TLS-1-1-2017-01',
    'ELBSecurityPolicy-TLS-1-2-2017-01',
    'ELBSecurityPolicy-TLS-1-2-Ext-2018-06',
    'ELBSecurityPolicy-FS-2018-06',
    'ELBSecurityPolicy-FS-1-1-2019-08',
    'ELBSecurityPolicy-FS-1-2-2019-08',
    'ELBSecurityPolicy-FS-1-2-Res-2019-08',
    'ELBSecurityPolicy-2015-05',
    'ELBSecurityPolicy-FS-1-2-Res-2020-10',
    'ELBSecurityPolicy-2016-08',
  ]);

  static readonly albListenerFixedResponseConfig = t.interface({
    statusCode: t.nonEmptyString,
    contentType: t.optional(t.nonEmptyString),
    messageBody: t.optional(t.nonEmptyString),
  });

  static readonly albListenerTargetGroupStickinessConfig = t.interface({
    durationSeconds: t.optional(t.number),
    enabled: t.optional(t.boolean),
  });

  static readonly albListenerForwardConfig = t.interface({
    targetGroupStickinessConfig: t.optional(this.albListenerTargetGroupStickinessConfig),
  });

  static readonly albListenerRedirectConfig = t.interface({
    statusCode: t.optional(t.nonEmptyString),
    host: t.optional(t.nonEmptyString),
    path: t.optional(t.nonEmptyString),
    port: t.optional(t.number),
    protocol: t.optional(t.nonEmptyString),
    query: t.optional(t.nonEmptyString),
  });
  static readonly albListenerConfig = t.interface({
    name: t.nonEmptyString,
    port: t.number,
    protocol: this.albListenerProtocolEnum,
    type: this.albListenerTypeEnum,
    certificate: t.optional(t.nonEmptyString),
    sslPolicy: t.optional(this.sslPolicyAlbEnum),
    targetGroup: t.nonEmptyString,
    fixedResponseConfig: t.optional(this.albListenerFixedResponseConfig),
    forwardConfig: t.optional(this.albListenerForwardConfig),
    order: t.optional(t.number),
    redirectConfig: t.optional(this.albListenerRedirectConfig),
  });

  static readonly routingHttpXffHeaderProcessingModeEnum = t.enums('RoutingHttpXffHeaderProcessingModeEnum', [
    'append',
    'preserve',
    'remove',
  ]);

  static readonly albAttributesConfig = t.interface({
    deletionProtection: t.optional(t.boolean),
    idleTimeout: t.optional(t.number),
    routingHttpDesyncMitigationMode: t.optional(this.albRoutingHttpConfigMitigationModeEnum),
    routingHttpDropInvalidHeader: t.optional(t.boolean),
    routingHttpXAmznTlsCipherEnable: t.optional(t.boolean),
    routingHttpXffClientPort: t.optional(t.boolean),
    routingHttpXffHeaderProcessingMode: t.optional(this.routingHttpXffHeaderProcessingModeEnum),
    http2Enabled: t.optional(t.boolean),
    wafFailOpen: t.optional(t.boolean),
  });
  static readonly albSchemeEnum = t.enums('ApplicationLoadBalancerSchemeEnum', ['internet-facing', 'internal']);

  static readonly applicationLoadBalancerConfig = t.interface({
    name: t.nonEmptyString,
    subnets: t.array(t.nonEmptyString),
    securityGroups: t.array(t.nonEmptyString),
    scheme: t.optional(this.albSchemeEnum),
    attributes: t.optional(this.albAttributesConfig),
    listeners: t.optional(t.array(this.albListenerConfig)),
  });

  static readonly appConfigItem = t.interface({
    name: t.nonEmptyString,
    vpc: t.nonEmptyString,
    deploymentTargets: t.deploymentTargets,
    targetGroups: t.optional(t.array(this.targetGroupItem)),
    networkLoadBalancer: t.optional(this.networkLoadBalancerConfig),
    launchTemplate: t.optional(this.launchTemplateConfig),
    autoscaling: t.optional(this.autoscalingConfig),
    applicationLoadBalancer: t.optional(this.applicationLoadBalancerConfig),
  });

  static readonly capabilityTypeEnum = t.enums('capabilities', [
    'CAPABILITY_IAM',
    'CAPABILITY_NAMED_IAM',
    'CAPABILITY_AUTO_EXPAND',
  ]);

  static readonly cloudFormationStack = t.interface({
    deploymentTargets: t.deploymentTargets,
    description: t.optional(t.nonEmptyString),
    name: t.nonEmptyString,
    regions: t.array(t.region),
    runOrder: t.number,
    template: t.nonEmptyString,
    parameters: t.optional(t.array(t.cfnParameter)),
    terminationProtection: t.boolean,
  });

  static readonly cloudFormationStackSet = t.interface({
    capabilities: t.optional(t.array(this.capabilityTypeEnum)),
    deploymentTargets: t.deploymentTargets,
    description: t.optional(t.nonEmptyString),
    name: t.nonEmptyString,
    regions: t.array(t.region),
    template: t.nonEmptyString,
    parameters: t.optional(t.array(t.cfnParameter)),
  });

  /**
   * Portfolio association type
   */
  static readonly portfolioAssociationType = t.enums('PortfolioAssociationType', [
    'User',
    'Group',
    'Role',
    'PermissionSet',
  ]);

  /**
   * Portfolio Association configuration
   */
  static readonly portfolioAssociationConfig = t.interface({
    type: this.portfolioAssociationType,
    name: t.nonEmptyString,
    propagateAssociation: t.optional(t.boolean),
  });

  /**
   * Product Version Configuration
   */
  static readonly productVersionConfig = t.interface({
    name: t.nonEmptyString,
    template: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
  });

  /**
   * Product Support configuration
   */
  static readonly productSupportConfig = t.interface({
    email: t.optional(t.nonEmptyString),
    url: t.optional(t.nonEmptyString),
    description: t.optional(t.nonEmptyString),
  });

  /**
   * Service Catalog TagOptions configuration
   */
  static readonly tagOptionsConfig = t.interface({
    key: t.nonEmptyString,
    values: t.array(t.nonEmptyString),
  });

  /**
   * Service Catalog Products configuration
   */
  static readonly productConfig = t.interface({
    name: t.nonEmptyString,
    owner: t.nonEmptyString,
    versions: t.array(this.productVersionConfig),
    description: t.optional(t.nonEmptyString),
    distributor: t.optional(t.nonEmptyString),
    support: t.optional(this.productSupportConfig),
    tagOptions: t.optional(t.array(this.tagOptionsConfig)),
  });

  /**
   * Service Catalog Portfolios configuration
   */
  static readonly portfolioConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    regions: t.array(t.region),
    provider: t.nonEmptyString,
    portfolioAssociations: t.optional(t.array(this.portfolioAssociationConfig)),
    products: t.optional(t.array(this.productConfig)),
    shareTargets: t.optional(t.shareTargets),
    shareTagOptions: t.optional(t.boolean),
    tagOptions: t.optional(t.array(this.tagOptionsConfig)),
  });

  static readonly serviceCatalogConfig = t.interface({
    portfolios: t.array(this.portfolioConfig),
  });

  static readonly customizationConfig = t.interface({
    cloudFormationStacks: t.optional(t.array(this.cloudFormationStack)),
    cloudFormationStackSets: t.optional(t.array(this.cloudFormationStackSet)),
    serviceCatalogPortfolios: t.optional(t.array(this.portfolioConfig)),
  });

  static readonly ec2FirewallInstanceConfig = t.interface({
    name: t.nonEmptyString,
    launchTemplate: this.launchTemplateConfig,
    vpc: t.nonEmptyString,
    detailedMonitoring: t.optional(t.boolean),
    terminationProtection: t.optional(t.boolean),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ec2FirewallAutoScalingGroupConfig = t.interface({
    name: t.nonEmptyString,
    autoscaling: this.autoscalingConfig,
    launchTemplate: this.launchTemplateConfig,
    vpc: t.nonEmptyString,
    tags: t.optional(t.array(t.tag)),
  });

  static readonly ec2FirewallConfig = t.interface({
    autoscalingGroups: t.optional(t.array(this.ec2FirewallAutoScalingGroupConfig)),
    instances: t.optional(t.array(this.ec2FirewallInstanceConfig)),
    managerInstances: t.optional(t.array(this.ec2FirewallInstanceConfig)),
    targetGroups: t.optional(t.array(this.targetGroupItem)),
  });

  static readonly customizationsConfig = t.interface({
    customizations: t.optional(this.customizationConfig),
    applications: t.optional(t.array(this.appConfigItem)),
    firewalls: t.optional(this.ec2FirewallConfig),
  });
}

/**
 * *{@link CustomizationsConfig} / {@link Ec2FirewallConfig} / {@link Ec2FirewallInstanceConfig}*
 *
 * EC2 firewall instance configuration.
 * Use to define an array of standalone firewall instances
 *
 * @example
 * ```
 * - name: accelerator-firewall
 *   launchTemplate:
 *     name: firewall-lt
 *     blockDeviceMappings:
 *       - deviceName: /dev/xvda
 *         ebs:
 *           deleteOnTermination: true
 *           encrypted: true
 *           volumeSize: 20
 *     enforceImdsv2: true
 *     iamInstanceProfile: firewall-profile
 *     imageId: ami-123xyz
 *     instanceType: c6i.xlarge
 *     networkInterfaces:
 *       - deleteOnTermination: true
 *         description: Primary interface
 *         deviceIndex: 0
 *         groups:
 *           - firewall-data-sg
 *         subnetId: firewall-data-subnet-a
 *       - deleteOnTermination: true
 *         description: Management interface
 *         deviceIndex: 1
 *         groups:
 *           - firewall-mgmt-sg
 *         subnetId: firewall-mgmt-subnet-a
 *     userData: path/to/userdata.txt
 *   vpc: Network-Inspection
 *   tags: []
 * ```
 *
 */
export class Ec2FirewallInstanceConfig implements t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig> {
  /**
   * The friendly name of the firewall instance
   */
  readonly name: string = '';
  /**
   * The launch template for the firewall instance
   */
  readonly launchTemplate: LaunchTemplateConfig = new LaunchTemplateConfig();
  /**
   * The friendly name of the VPC to deploy the firewall instance to
   *
   * @remarks
   * This VPC must contain the subnet(s) defined for the network interfaces under the `launchTemplate` property
   */
  readonly vpc: string = '';
  /**
   * Specify true to enable detailed monitoring. Otherwise, basic monitoring is enabled.
   */
  readonly detailedMonitoring: boolean | undefined = undefined;
  /**
   * If you set this parameter to true , you can't terminate the instance using the Amazon EC2 console, CLI, or API.
   * To change this attribute after launch, use ModifyInstanceAttribute . Alternatively, if you set
   * InstanceInitiatedShutdownBehavior to terminate , you can terminate the instance by running the shutdown command from the instance.
   */
  readonly terminationProtection: boolean | undefined = undefined;
  /**
   * An optional array of tags
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link Ec2FirewallConfig} / {@link Ec2FirewallAutoScalingGroupConfig}*
 *
 * EC2 firewall autoscaling group configuration.
 * Used to define EC2-based firewall instances to be deployed in an autoscaling group.
 *
 * ```
 * - name: accelerator-firewall-asg
 *   autoscaling:
 *     name: firewall-asg
 *     maxSize: 4
 *     minSize: 1
 *     desiredSize: 2
 *     launchTemplate: firewall-lt
 *     healthCheckGracePeriod: 300
 *     healthCheckType: ELB
 *     targetGroups:
 *       - firewall-gwlb-tg
 *     subnets:
 *       - firewall-subnet-a
 *       - firewall-subnet-b
 *   launchTemplate:
 *     name: firewall-lt
 *     blockDeviceMappings:
 *       - deviceName: /dev/xvda
 *         ebs:
 *           deleteOnTermination: true
 *           encrypted: true
 *           volumeSize: 20
 *     enforceImdsv2: true
 *     iamInstanceProfile: firewall-profile
 *     imageId: ami-123xyz
 *     instanceType: c6i.xlarge
 *     networkInterfaces:
 *       - deleteOnTermination: true
 *         description: Primary interface
 *         deviceIndex: 0
 *         groups:
 *           - firewall-data-sg
 *       - deleteOnTermination: true
 *         description: Management interface
 *         deviceIndex: 1
 *         groups:
 *           - firewall-mgmt-sg
 *     userData: path/to/userdata.txt
 *   vpc: Network-Inspection
 *   tags: []
 * ```
 */
export class Ec2FirewallAutoScalingGroupConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig>
{
  /**
   * The friendly name of the firewall instance
   */
  readonly name: string = '';
  /**
   * An AutoScaling Group configuration
   */
  readonly autoscaling = new AutoScalingConfig();
  /**
   * The launch template for the firewall instance
   */
  readonly launchTemplate = new LaunchTemplateConfig();
  /**
   * The friendly name of the VPC to deploy the firewall instance to
   *
   * @remarks
   * This VPC must contain the subnet(s) defined for the network interfaces under the `launchTemplate` property
   */
  readonly vpc: string = '';
  /**
   * An optional array of tags
   */
  readonly tags: t.Tag[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link Ec2FirewallConfig}*
 *
 * EC2 firewall configuration.
 * Used to define EC2-based firewall and management appliances
 *
 * @example
 * Standalone instances:
 * ```
 * instances:
 *   - name: accelerator-firewall
 *     launchTemplate:
 *       name: firewall-lt
 *       blockDeviceMappings:
 *         - deviceName: /dev/xvda
 *           ebs:
 *             deleteOnTermination: true
 *             encrypted: true
 *             volumeSize: 20
 *       enforceImdsv2: true
 *       iamInstanceProfile: firewall-profile
 *       imageId: ami-123xyz
 *       instanceType: c6i.xlarge
 *       networkInterfaces:
 *         - deleteOnTermination: true
 *           description: Primary interface
 *           deviceIndex: 0
 *           groups:
 *             - firewall-data-sg
 *           subnetId: firewall-data-subnet-a
 *         - deleteOnTermination: true
 *           description: Management interface
 *           deviceIndex: 1
 *           groups:
 *             - firewall-mgmt-sg
 *           subnetId: firewall-mgmt-subnet-a
 *       userData: path/to/userdata.txt
 *     vpc: Network-Inspection
 * targetGroups:
 *   - name: firewall-gwlb-tg
 *     port: 6081
 *     protocol: GENEVE
 *     type: instance
 *     healthCheck:
 *       enabled: true
 *       port: 80
 *       protocol: TCP
 *     targets:
 *       - accelerator-firewall
 * ```
 *
 * Autoscaling group:
 * ```
 * autoscalingGroups:
 *   - name: accelerator-firewall-asg
 *     autoscaling:
 *       name: firewall-asg
 *       maxSize: 4
 *       minSize: 1
 *       desiredSize: 2
 *       launchTemplate: firewall-lt
 *       healthCheckGracePeriod: 300
 *       healthCheckType: ELB
 *       targetGroups:
 *        - firewall-gwlb-tg
 *       subnets:
 *         - firewall-subnet-a
 *         - firewall-subnet-b
 *     launchTemplate:
 *       name: firewall-lt
 *       blockDeviceMappings:
 *         - deviceName: /dev/xvda
 *           ebs:
 *             deleteOnTermination: true
 *             encrypted: true
 *             volumeSize: 20
 *       enforceImdsv2: true
 *       iamInstanceProfile: firewall-profile
 *       imageId: ami-123xyz
 *       instanceType: c6i.xlarge
 *       networkInterfaces:
 *         - deleteOnTermination: true
 *           description: Primary interface
 *           deviceIndex: 0
 *           groups:
 *             - firewall-data-sg
 *         - deleteOnTermination: true
 *           description: Management interface
 *           deviceIndex: 1
 *           groups:
 *             - firewall-mgmt-sg
 *       userData: path/to/userdata.txt
 *     vpc: Network-Inspection
 *   targetGroups:
 *   - name: firewall-gwlb-tg
 *     port: 6081
 *     protocol: GENEVE
 *     type: instance
 *     healthCheck:
 *       enabled: true
 *       port: 80
 *       protocol: TCP
 * ```
 *
 */
export class Ec2FirewallConfig implements t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallConfig> {
  /**
   * Define EC2-based firewall instances in autoscaling groups
   */
  readonly autoscalingGroups: Ec2FirewallAutoScalingGroupConfig[] | undefined = undefined;
  /**
   * Define EC2-based firewall standalone instances
   */
  readonly instances: Ec2FirewallInstanceConfig[] | undefined = undefined;
  /**
   * Define EC2-based firewall management instances
   */
  readonly managerInstances: Ec2FirewallInstanceConfig[] | undefined = undefined;
  /**
   * Define target groups for EC2-based firewalls
   */
  readonly targetGroups: TargetGroupItemConfig[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link CloudFormationStackConfig}*
 *
 * Defines a custom CloudFormation Stack to be deployed to the environment.
 *
 * @remarks
 *
 * Please note that deployed custom CloudFormation Stacks are not deleted if they are removed from customizations-config.yaml.
 * All custom stacks deployed by LZA must be deleted manually if they are no longer needed.
 *
 * @see [Related CDK Issue ](https://github.com/aws/aws-cdk/issues/13676)
 *
 * @example
 * ```
 * customizations:
 *   cloudFormationStacks:
 *     - deploymentTargets:
 *         organizationalUnits:
 *           - Infrastructure
 *       description: CloudFormation Stack deployed to accounts in the Infrastructure OU.
 *       name: InfrastructureStack
 *       regions:
 *       - us-east-1
 *       runOrder: 2
 *       template: cloudformation/InfraStack.yaml
 *       parameters:
 *        - name: Parameter1
 *          value: Value1
 *       - name: Parameter2
 *         value: Value2
 *       terminationProtection: true
 *     - deploymentTargets:
 *         accounts:
 *           - SharedServices
 *       description: Stack containing shared services resources.
 *       name: SharedServicesResources
 *       regions:
 *       - us-east-1
 *       - us-east-2
 *       runOrder: 1
 *       template: cloudformation/SharedServicesStack.yaml
 *       terminationProtection: true
 *
 * ```
 */
export class CloudFormationStackConfig implements t.TypeOf<typeof CustomizationsConfigTypes.cloudFormationStack> {
  /**
   * CloudFormation Stack deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * The description is to used to provide more information about the stack.
   */
  readonly description: string = '';
  /**
   * The friendly name that will be used as a base for the created CloudFormation Stack Name.
   * The name should not contain any spaces as this isn't supported by the Accelerator.
   */
  readonly name: string = '';
  /**
   * A list of AWS regions to deploy the stack to.
   */
  readonly regions: t.Region[] = ['us-east-1'];
  /**
   * The order to deploy the stack relative to the other stacks. Must be a positive integer.
   * To deploy stacks in parallel, set runOrder of each stack to 1.
   */
  readonly runOrder: number = 1;
  /**
   * The file path to the template file defining the stack.
   */
  readonly template: string = '';
  /**
   * This determines whether to enable termination protection for the stack.
   */
  readonly terminationProtection: boolean = false;
  /**
   * The parameters to pass to the stack.
   */
  readonly parameters: t.CfnParameter[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link CloudFormationStackSetConfig}*
 *
 * Defines a custom CloudFormation StackSet to be deployed to the environment.
 *
 * @example
 * ```
 * customizations:
 *   cloudFormationStackSets:
 *     - capabilities: [CAPABILITY_IAM, CAPABILITY_NAMED_IAM, CAPABILITY_AUTO_EXPAND]
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Infrastructure
 *       description: sample desc4
 *       name: OrganizationalUnitStackSet
 *       regions:
 *       - us-east-1
 *       template: cloudformation/OUStackSet.yaml
 *     - capabilities: [CAPABILITY_IAM]
 *       deploymentTargets:
 *         accounts:
 *           - SharedServices
 *           - Management
 *       description:
 *       name: AccountStackSet
 *       regions:
 *       - us-east-1
 *       template: cloudformation/AccountStackSet.yaml
 *
 * ```
 */
export class CloudFormationStackSetConfig implements t.TypeOf<typeof CustomizationsConfigTypes.cloudFormationStackSet> {
  /**
   * The CloudFormation capabilities enabled to deploy the stackset.
   * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html}
   */
  readonly capabilities = undefined;
  /**
   * CloudFormation StackSet deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * The description is to used to provide more information about the stackset.
   */
  readonly description: string = '';
  /**
   * The friendly name that will be used as a base for the created CloudFormation StackSet Name.
   * The name should not contain any spaces as this isn't supported by the Accelerator.
   */
  readonly name: string = '';
  /**
   * A list of regions to deploy the stackset.
   */
  readonly regions: t.Region[] = ['us-east-1'];
  /**
   * The file path to the template file used for deployment.
   */
  readonly template: string = '';
  /**
   * The parameters to be passed to the stackset.
   */
  readonly parameters: t.CfnParameter[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerFixedResponseConfig}*
 *
 * Application load balancer listener fixed response config
 * It returns a custom HTTP response.
 * Applicable only when `type` under {@link ApplicationLoadBalancerListenerConfig | listener} is `fixed-response`.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_FixedResponseActionConfig.html}
 *
 * @example
 * ```
 * fixedResponseConfig:
 *  statusCode: '200'
 *  contentType: text/plain
 *  messageBody: 'Hello World'
 * ```
 */

export class AlbListenerFixedResponseConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.albListenerFixedResponseConfig>
{
  /**
   * The content type.
   * Valid Values: text/plain | text/css | text/html | application/javascript | application/json
   */
  readonly statusCode: string = '';
  /**
   * The message to send back.
   */
  readonly contentType: string | undefined = undefined;
  /**
   * The HTTP response code (2XX, 4XX, or 5XX).
   */
  readonly messageBody: string | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerForwardConfig}/ {@link AlbListenerForwardConfigTargetGroupStickinessConfig}*
 *
 * Application Load balancer listener forward config target group stickiness config
 * Applicable only when `type` under {@link ApplicationLoadBalancerListenerConfig | listener} is `forward`.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_TargetGroupStickinessConfig.html}
 *
 * @example
 * ```
 * durationSeconds: 123
 * enabled: true
 * ```
 */
export class AlbListenerForwardConfigTargetGroupStickinessConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.albListenerTargetGroupStickinessConfig>
{
  /**
   * The time period, in seconds, during which requests from a client should be routed to the same target group. The range is 1-604800 seconds (7 days).
   */
  readonly durationSeconds: number | undefined = undefined;
  /**
   * Indicates whether target group stickiness is enabled.
   */
  readonly enabled: boolean | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerForwardConfig}
 *
 * Application Load balancer listener forward config. Used to define forward action.
 * Applicable only when `type` under {@link ApplicationLoadBalancerListenerConfig | listener} is `forward`.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_ForwardActionConfig.html}
 *
 * @example
 * ```
 * forwardConfig:
 *  targetGroupStickinessConfig:
 *    durationSeconds: 123
 *    enabled: true
 *```
 */
export class AlbListenerForwardConfig implements t.TypeOf<typeof CustomizationsConfigTypes.albListenerForwardConfig> {
  readonly targetGroupStickinessConfig: AlbListenerForwardConfigTargetGroupStickinessConfig | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerRedirectConfig}*
 *
 * Application Load balancer listener redirect config. Used to define redirect action.
 * Applicable only when `type` under {@link ApplicationLoadBalancerListenerConfig | listener} is `redirect`.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_RedirectActionConfig.html}
 *
 * @example
 * ```
 * redirectConfig:
 *  statusCode: HTTP_301
 *  host: '#{host}'
 *  path: '/#{path}'
 *  port: 443
 *  protocol: HTTPS
 *  query: '#{query}'
 *```
 */
export class AlbListenerRedirectConfig implements t.TypeOf<typeof CustomizationsConfigTypes.albListenerRedirectConfig> {
  readonly statusCode: string | undefined = undefined;
  readonly host: string | undefined = undefined;
  readonly path: string | undefined = undefined;
  readonly port: number | undefined = undefined;
  readonly protocol: string | undefined = undefined;
  readonly query: string | undefined = undefined;
}
/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig}*
 *
 * Application Load Balancer listener config. Currently only action type of `forward`,  `redirect` and `fixed-response` is allowed.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateListener.html}
 *
 * @example
 * ```
 *  - name: appA-listener-0
 *    port: 80
 *    protocol: HTTP
 *    targetGroup: appA-alb-tg-0
 *    order: 1
 *    type: forward
 *    forwardConfig:
 *      targetGroupStickinessConfig:
 *        durationSeconds: 1000
 *        enabled: true
 *  - name: appA-listener-1
 *    port: 80
 *    protocol: HTTP
 *    targetGroup: appA-alb-tg-1
 *    order: 4
 *    type: fixed-response
 *    fixedResponseConfig:
 *      statusCode: '200'
 *      contentType: text/plain
 *      messageBody: 'Hello World'
 * - name: appA-listener-2
 *    port: 80
 *    protocol: HTTP
 *    targetGroup: appA-alb-tg-2
 *    order: 2
 *    type: redirect
 *    redirectConfig:
 *      statusCode: HTTP_301
 *      host: '#{host}'
 *      path: '/#{path}'
 *      port: 443
 *      protocol: HTTPS
 *      query: '#{query}'
 * - name: appA-listener-3
 *    port: 443
 *    protocol: HTTPS
 *    targetGroup: appA-alb-tg-3
 *    order: 3
 *    type: forward
 *    certificate: 'arn:aws:acm:some-valid-region:111111111111:certificate/valid-certificate-hash'
 *    sslPolicy: ELBSecurityPolicy-2016-08
 * ```
 */
export class ApplicationLoadBalancerListenerConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.albListenerConfig>
{
  /**
   * The name of the application load balancer listener
   */
  readonly name: string = '';
  /**
   * Port of the application load balancer listener
   */
  readonly port: number = 80;
  /**
   * Protocol of the application load balancer listener. The supported protocols are HTTP and HTTPS
   */
  readonly protocol: t.TypeOf<typeof CustomizationsConfigTypes.albListenerProtocolEnum> = 'HTTP';
  /**
   * Type of the application load balancer listener
   */
  readonly type: t.TypeOf<typeof CustomizationsConfigTypes.albListenerTypeEnum> = 'forward';
  /**
   * Applies to HTTPS listeners. The default certificate for the listener. You must provide exactly one certificate arn or a certificate name which was created by LZA
   */
  readonly certificate: string | undefined = undefined;
  /**
   * The security policy that defines which protocols and ciphers are supported.
   * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html#describe-ssl-policies | Application Load Balancer Listener SSL Policies}
   */
  readonly sslPolicy: t.TypeOf<typeof CustomizationsConfigTypes.sslPolicyAlbEnum> | undefined = undefined;
  /**
   * Target Group name to which traffic will be forwarded to. This name should be same as {@link ApplicationLoadBalancerTargetGroupConfig | targetGroup} name.
   */
  readonly targetGroup: string = '';
  /**
   *  Information for creating an action that returns a custom HTTP response. Specify only when type is `fixed-response`.
   */
  readonly fixedResponseConfig: AlbListenerFixedResponseConfig | undefined = undefined;
  /**
   * Information for creating an action that distributes requests to targetGroup. Stickiness for targetGroup can be set here.
   */
  readonly forwardConfig: AlbListenerForwardConfig | undefined = undefined;
  /**
   * The order for the action. This value is required for rules with multiple actions. The action with the lowest value for order is performed first
   */
  readonly order: number | undefined = undefined;
  /**
   * Information for creating a redirect action. Specify only when type is `redirect`.
   */
  readonly redirectConfig: AlbListenerRedirectConfig | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerAttributesConfig}*
 *
 * Application Load Balancer attributes config.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_LoadBalancerAttribute.html}
 *
 * @example
 * ```
 * attributes:
 *  deletionProtection: true
 *  idleTimeout: 60
 *  routingHttpDropInvalidHeader: true
 *  routingHttpXAmznTlsCipherEnable: true
 *  routingHttpXffClientPort: true
 *  routingHttpXffHeaderProcessingMode: 'append'
 *  http2Enabled: true
 *  wafFailOpen: true
 * ```
 */
export class ApplicationLoadBalancerAttributesConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.albAttributesConfig>
{
  /**
   * Enable or disable deletion protection.
   */
  readonly deletionProtection: boolean | undefined = undefined;
  /**
   * The idle timeout value, in seconds. The valid range is 1-4000 seconds. The default is 60 seconds.
   */
  readonly idleTimeout: number | undefined = undefined;

  /**
   * Determines how the load balancer handles requests that might pose a security risk to your application. The possible values are `monitor` , `defensive` , and `strictest` . The default is `defensive`.
   */
  readonly routingHttpDesyncMitigationMode:
    | t.TypeOf<typeof CustomizationsConfigTypes.albRoutingHttpConfigMitigationModeEnum>
    | undefined = undefined;
  /**
   * Indicates whether HTTP headers with invalid header fields are removed by the load balancer ( true ) or routed to targets ( false ). The default is false.
   */
  readonly routingHttpDropInvalidHeader: boolean | undefined = undefined;
  /**
   * Indicates whether the two headers ( x-amzn-tls-version and x-amzn-tls-cipher-suite ), which contain information about the negotiated TLS version and cipher suite, are added to the client request before sending it to the target. The x-amzn-tls-version header has information about the TLS protocol version negotiated with the client, and the x-amzn-tls-cipher-suite header has information about the cipher suite negotiated with the client. Both headers are in OpenSSL format. The possible values for the attribute are true and false . The default is false.
   */
  readonly routingHttpXAmznTlsCipherEnable: boolean | undefined = undefined;
  /**
   * Indicates whether the X-Forwarded-For header should preserve the source port that the client used to connect to the load balancer. The possible values are true and false . The default is false.
   */
  readonly routingHttpXffClientPort: boolean | undefined = undefined;
  /**
   * Enables you to modify, preserve, or remove the X-Forwarded-For header in the HTTP request before the Application Load Balancer sends the request to the target. The possible values are append, preserve, and remove. The default is append.
   */
  readonly routingHttpXffHeaderProcessingMode:
    | t.TypeOf<typeof CustomizationsConfigTypes.routingHttpXffHeaderProcessingModeEnum>
    | undefined = undefined;
  /**
   * Indicates whether HTTP/2 is enabled. The possible values are true and false. The default is true. Elastic Load Balancing requires that message header names contain only alphanumeric characters and hyphens.
   */
  readonly http2Enabled: boolean | undefined = undefined;
  /**
   * Indicates whether to allow a WAF-enabled load balancer to route requests to targets if it is unable to forward the request to AWS WAF. The possible values are true and false. The default is false.
   */
  readonly wafFailOpen: boolean | undefined = undefined;
}
/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig}*
 *
 * Used to define Application Load Balancer configurations for the accelerator.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateLoadBalancer.html}
 *
 * @example
 * ```
 * applicationLoadBalancer:
 *  name: appA-alb-01
 *  scheme: internet-facing
 *  subnets:
 *    - Public-Subnet-A
 *    - Public-Subnet-B
 *  securityGroups:
 *    - demo-app-sg
 *  listeners:
 *    - name: appA-listener-2
 *      port: 80
 *      protocol: HTTP
 *      targetGroup: appA-alb-tg-1
 *      type: forward
 * ```
 */
export class ApplicationLoadBalancerConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.applicationLoadBalancerConfig>
{
  /**
   * The name of the application load balancer
   */
  readonly name: string = '';
  /**
   * Subnets to launch the Application Load Balancer in.
   */
  readonly subnets: string[] = [];
  /**
   * Security Groups to attach to the Application Load Balancer.
   */
  readonly securityGroups: string[] = [];
  /**
   * Internal or internet facing scheme for Application Load Balancer.
   */
  readonly scheme: t.TypeOf<typeof CustomizationsConfigTypes.albSchemeEnum> | undefined = undefined;
  /**
   * Attributes for Application Load Balancer.
   */
  readonly attributes: ApplicationLoadBalancerAttributesConfig | undefined = undefined;
  /**
   * Listeners for Application Load Balancer.
   */
  readonly listeners: ApplicationLoadBalancerListenerConfig[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupAttributeConfig}*
 *
 * Set attributes for target group.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_TargetGroupAttribute.html}
 *
 * @example
 * ```
 * attributes:
 *  deregistrationDelay: 1200
 *  stickiness: true
 *  # applies to application load balancer
 *  stickinessType: app_cookie
 *  algorithm: round_robin
 *  slowStart: 120
 *  appCookieName: chocolate-chip
 *  appCookieDuration: 4800
 *  lbCookieDuration: 4800
 *  # applies to network load balancer
 *  connectionTermination: true
 *  preserveClientIp: true
 *  proxyProtocolV2: true
 * # applies to Gateway Load Balancer
 * targetFailover: rebalance
 * ```
 */
export class TargetGroupAttributeConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.targetGroupAttributeTypes>
{
  /**
   * The amount of time, in seconds, for Elastic Load Balancing to wait before changing the state of a deregistering target from draining to unused. The range is 0-3600 seconds. The default value is 300 seconds.
   */
  readonly deregistrationDelay: number | undefined = undefined;
  /**
   * Indicates whether target stickiness is enabled. The value is true or false. The default is false.
   */
  readonly stickiness: boolean | undefined = undefined;
  /**
   * Indicates the type of stickiness. The possible values are:
   *  - lb_cookie and app_cookie for Application Load Balancers.
   *  - source_ip for Network Load Balancers.
   *  - source_ip_dest_ip and source_ip_dest_ip_proto for Gateway Load Balancers
   */
  readonly stickinessType: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupAttributeStickinessType> | undefined =
    undefined;
  /**
   * The load balancing algorithm determines how the load balancer selects targets when routing requests. The value is round_robin or least_outstanding_requests. The default is round_robin.
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly algorithm: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupAttributeAlgorithm> | undefined = undefined;
  /**
   * The time period, in seconds, during which a newly registered target receives an increasing share of the traffic to the target group. After this time period ends, the target receives its full share of traffic. The range is 30-900 seconds (15 minutes). The default is 0 seconds (disabled).
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly slowStart: number | undefined = undefined;
  /**
   * Indicates the name of the application-based cookie. Names that start with the following prefixes are not allowed: AWSALB, AWSALBAPP, and AWSALBTG; they're reserved for use by the load balancer.
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly appCookieName: string | undefined = undefined;
  /**
   * The time period, in seconds, during which requests from a client should be routed to the same target. After this time period expires, the application-based cookie is considered stale. The range is 1 second to 1 week (604800 seconds). The default value is 1 day (86400 seconds).
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly appCookieDuration: number | undefined = undefined;
  /**
   *  The time period, in seconds, during which requests from a client should be routed to the same target. After this time period expires, the load balancer-generated cookie is considered stale. The range is 1 second to 1 week (604800 seconds). The default value is 1 day (86400 seconds).
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly lbCookieDuration: number | undefined = undefined;
  /**
   * Indicates whether the load balancer terminates connections at the end of the deregistration timeout. The value is true or false. The default is false.
   * The following attribute is supported only by Network Load Balancers.
   */
  readonly connectionTermination: boolean | undefined = undefined;
  /**
   * Indicates whether client IP preservation is enabled. The value is true or false. The default is disabled if the target group type is IP address and the target group protocol is TCP or TLS. Otherwise, the default is enabled. Client IP preservation cannot be disabled for UDP and TCP_UDP target groups.
   * The following attribute is supported only by Network Load Balancers.
   */
  readonly preserveClientIp: boolean | undefined = undefined;
  /**
   * Indicates whether Proxy Protocol version 2 is enabled. The value is true or false. The default is false.
   * The following attribute is supported only by Network Load Balancers.
   */
  readonly proxyProtocolV2: boolean | undefined = undefined;
  /**
   * Indicates how the Gateway Load Balancer handles existing flows when a target is deregistered or becomes unhealthy.
   * The possible values are rebalance and no_rebalance. The default is no_rebalance
   */
  readonly targetFailover: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupTargetFailoverType> | undefined =
    undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupHealthCheckConfig}*
 *
 * Configure health check for target group.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateTargetGroup.html}
 *
 * @example
 * ```
 * healthCheck:
 *  interval: 5
 *  path: '/'
 *  port: 80
 *  protocol: TCP
 *  timeout: 30
 * ```
 */
export class TargetGroupHealthCheckConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.targetGroupHealthCheckType>
{
  /**
   * The approximate amount of time, in seconds, between health checks of an individual target. The range is 5-300.
   * If the target group protocol is TCP, TLS, UDP, TCP_UDP, HTTP or HTTPS, the default is 30 seconds.
   * If the target group protocol is GENEVE, the default is 10 seconds.
   */
  readonly interval: number | undefined = undefined;
  /**
   * [HTTP/HTTPS health checks] The destination for health checks on the targets.
   * [HTTP1 or HTTP2 protocol version] The ping path. The default is /.
   * [GRPC protocol version] The path of a custom health check method with the format /package.service/method. The default is /AWS.ALB/healthcheck.
   */
  readonly path: string | undefined = undefined;
  /**
   * The protocol the load balancer uses when performing health checks on targets.
   * For Application Load Balancers, the default is HTTP.
   * For Network Load Balancers and Gateway Load Balancers, the default is TCP.
   * The TCP protocol is not supported for health checks if the protocol of the target group is HTTP or HTTPS.
   * GENEVE, TLS, UDP, and TCP_UDP protocols are not supported for health checks.
   */
  readonly protocol: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupHealthCheckProtocolType> | undefined =
    undefined;
  /**
   * The port the load balancer uses when performing health checks on targets.
   * If the protocol is HTTP, HTTPS, TCP, TLS, UDP, or TCP_UDP, the default is `traffic-port`, which is the port on which each target receives traffic from the load balancer.
   * If the protocol is GENEVE, the default is port 80.
   */
  readonly port: number | undefined = undefined;
  /**
   * The amount of time, in seconds, during which no response from a target means a failed health check.
   * The range is 2–120 seconds.
   * For target groups with a protocol of HTTP, the default is 6 seconds.
   * For target groups with a protocol of TCP, TLS or HTTPS, the default is 10 seconds.
   * For target groups with a protocol of GENEVE, the default is 5 seconds.
   */
  readonly timeout: number | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupThresholdConfig}*
 * Configure health check threshold for target group.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateTargetGroup.html}
 *
 * @example
 * ```
 * threshold:
 *  healthy: 5
 *  unhealthy: 5
 * ```
 */
export class TargetGroupThresholdConfig implements t.TypeOf<typeof CustomizationsConfigTypes.targetGroupThresholdType> {
  /**
   * The number of consecutive health check successes required before considering a target healthy. The range is 2-10.
   * If the target group protocol is TCP, TCP_UDP, UDP, TLS, HTTP or HTTPS, the default is 5.
   * For target groups with a protocol of GENEVE, the default is 3.
   */
  readonly healthy: number | undefined = undefined;
  /**
   * The number of consecutive health check failures required before considering a target unhealthy. The range is 2-10.
   * If the target group protocol is TCP, TCP_UDP, UDP, TLS, HTTP or HTTPS, the default is 2.
   * For target groups with a protocol of GENEVE, the default is 3.
   */
  readonly unhealthy: number | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link NlbTargetTypeConfig}*
 * Add the ability to target an NLB created by the Landing Zone Accelerator
 *
 *
 * @example
 * ```
 * matcher:
 *  grpcCode: 5
 *  httpCode: 5
 * ```
 */
export class TargetGroupMatcherConfig implements t.TypeOf<typeof CustomizationsConfigTypes.targetGroupMatcherType> {
  /**
   * You can specify values between 0 and 99. You can specify multiple values (for example, "0,1") or a range of values (for example, "0-5"). The default value is 12.
   */
  readonly grpcCode: string | undefined = undefined;
  /**
   * For Application Load Balancers, you can specify values between 200 and 499, with the default value being 200. You can specify multiple values (for example, "200,202") or a range of values (for example, "200-299").
   * For Network Load Balancers, you can specify values between 200 and 599, with the default value being 200-399. You can specify multiple values (for example, "200,202") or a range of values (for example, "200-299").
   * Note that when using shorthand syntax, some values such as commas need to be escaped.
   */
  readonly httpCode: string | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupMatcherConfig}*
 * The codes to use when checking for a successful response from a target. If the protocol version is gRPC, these are gRPC codes. Otherwise, these are HTTP codes.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_Matcher.html}
 *
 * @example
 * ```
 * targets:
 *  - account: MyAccount
 *    region: us-east-1
 *    nlbName: myNlb
 * ```
 */
export class NlbTargetTypeConfig implements t.TypeOf<typeof CustomizationsConfigTypes.nlbTargetType> {
  /**
   * Friendly Account Name where the NLB is deployed
   */
  readonly account: string = '';

  /**
   * Region where the NLB is deployed
   */

  readonly region: string = '';

  /**
   * Friendly name of the NLB
   */

  readonly nlbName: string = '';
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig}*
 *
 * Target Group Configuration
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateTargetGroup.html}
 *
 * @example
 * ```
 * targetGroups:
 * - name: appA-nlb-tg-1
 *   port: 80
 *   protocol: TCP
 *   type: instance
 *   healthCheck:
 *    enabled: true
 *    port: 80
 *    protocol: TCP
 * - name: appA-alb-tg-1
 *   port: 80
 *   protocol: HTTP
 *   type: instance
 *   healthCheck:
 *    enabled: true
 *    port: 80
 *    protocol: HTTP
 * ```
 */
export class TargetGroupItemConfig implements t.TypeOf<typeof CustomizationsConfigTypes.targetGroupItem> {
  /**
   * The name of the target group. This value is used in {@link ApplicationLoadBalancerListenerConfig| Application Load Balancer listeners}, {@link NetworkLoadBalancerListenerConfig| Network Load Balancer listeners}, and {@link AutoScalingConfig| Autoscaling config}.
   */
  readonly name: string = '';
  /**
   * The port on which the targets receive traffic.
   */
  readonly port: number = 80;
  /**
   * Target group protocol version. Should be one of HTTP, HTTPS, GENEVE, TCP, UDP, TCP_UDP or TLS
   * The protocol to use for routing traffic to the targets.
   * For Application Load Balancers, the supported protocols are HTTP and HTTPS.
   * For Network Load Balancers, the supported protocols are TCP, TLS, UDP, or TCP_UDP. A TCP_UDP listener must be associated with a TCP_UDP target group.
   * For Gateway Load Balancers, the supported protocol is GENEVE.
   * @see {@link CustomizationsConfigTypes.targetGroupProtocolType}
   */
  readonly protocol: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupProtocolType> = 'TCP';
  /**
   * The protocol version. Should be one of 'GRPC', 'HTTP1', 'HTTP2'. Specify GRPC to send requests to targets using gRPC. Specify HTTP2 to send requests to targets using HTTP/2. The default is HTTP1, which sends requests to targets using HTTP/1.1.
   * @see {@link CustomizationsConfigTypes.targetGroupProtocolVersionType}
   */
  readonly protocolVersion: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupProtocolVersionType> | undefined =
    undefined;
  /**
   * The type of target that you must specify when registering targets with this target group. You can't specify targets for a target group using more than one target type.
   * - `instance` - Register targets by instance ID. This is the default value.
   * - `ip` - Register targets by IP address. You can specify IP addresses from the subnets of the virtual private cloud (VPC) for the target group, the RFC 1918 range (10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16), and the RFC 6598 range (100.64.0.0/10). You can't specify publicly routable IP addresses.
   * `alb` - Register a single Application Load Balancer as a target.
   *
   * @see {@link CustomizationsConfigTypes.targetGroupType}
   */

  readonly type: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupType> = 'instance';
  /**
   * Target Group Attributes.
   * @see {@link CustomizationsConfigTypes.targetGroupAttributes}
   */
  readonly attributes: TargetGroupAttributeConfig | undefined = undefined;
  /**
   * Target Group HealthCheck.
   * @see {@link CustomizationsConfigTypes.targetGroupHealthCheckType}
   */
  readonly healthCheck: TargetGroupHealthCheckConfig | undefined = undefined;
  /**
   * Target group targets. These targets should be the friendly names assigned to firewall instances.
   *
   * @remarks
   * This property should only be defined if also defining EC2-based firewall instances.
   * It should be left undefined for application configurations.
   */
  readonly targets: (string | NlbTargetTypeConfig)[] | undefined = undefined;
  /**
   * Target Group Threshold.
   * @see {@link CustomizationsConfigTypes.targetGroupThresholdType}
   */
  readonly threshold: TargetGroupThresholdConfig | undefined = undefined;
  /**
   *  The HTTP or gRPC codes to use when checking for a successful response from a target. For target groups with a protocol of TCP, TCP_UDP, UDP or TLS the range is 200-599. For target groups with a protocol of HTTP or HTTPS, the range is 200-499.
   * @see {@link CustomizationsConfigTypes.targetGroupMatcherType}
   */
  readonly matcher: TargetGroupMatcherConfig | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link NetworkLoadBalancerConfig} / {@link NetworkLoadBalancerListenerConfig}*
 *
 * Application Load Balancer listener config. Currently only action type of `forward`,  `redirect` and `fixed-response` is allowed.
 *
 * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateListener.html}
 *
 * @example
 * ```
 * - name: appA-listener-1
 *   port: 80
 *   protocol: TCP
 *   targetGroup: appA-nlb-tg-1
 * ```
 */
export class NetworkLoadBalancerListenerConfig implements t.TypeOf<typeof CustomizationsConfigTypes.nlbListenerConfig> {
  /**
   * Name for Listener.
   */
  readonly name: string = '';
  /**
   * ACM ARN of the certificate to be associated with the listener.
   */
  readonly certificate: string | undefined = undefined;
  /**
   * Port where the traffic is directed to.
   */
  readonly port: number | undefined = undefined;
  /**
   * Protocol used for the traffic. The supported protocols are TCP, TLS, UDP, or TCP_UDP.
   * @see {@link CustomizationsConfigTypes.nlbProtocolEnum}
   */
  readonly protocol: t.TypeOf<typeof CustomizationsConfigTypes.nlbProtocolEnum> | undefined = undefined;
  /**
   * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/network/create-tls-listener.html#alpn-policies | Application-Layer Protocol Negotiation (ALPN) policy} for TLS encrypted traffic
   * @see {@link CustomizationsConfigTypes.alpnPolicyEnum}
   */
  readonly alpnPolicy: t.TypeOf<typeof CustomizationsConfigTypes.alpnPolicyEnum> | undefined = undefined;
  /**
   * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/network/create-tls-listener.html#describe-ssl-policies|SSL policy} for TLS encrypted traffic
   * @see {@link CustomizationsConfigTypes.sslPolicyNlbEnum}
   */
  readonly sslPolicy: t.TypeOf<typeof CustomizationsConfigTypes.sslPolicyNlbEnum> | undefined = undefined;
  /**
   * Target Group to direct the traffic to.
   */
  readonly targetGroup: string = '';
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link NetworkLoadBalancerConfig}*
 *
 * Network Load Balancer configuration.
 *
 * @example
 * ```
 * networkLoadBalancer:
 *  name: appA-nlb-01
 *  scheme: internet-facing
 *  deletionProtection: false
 *  subnets:
 *  - Public-Subnet-A
 *  - Public-Subnet-B
 *  listeners:
 *  - name: appA-listener-1
 *    port: 80
 *    protocol: TCP
 *    targetGroup: appA-nlb-tg-1
 * ```
 */
export class NetworkLoadBalancerConfig implements t.TypeOf<typeof CustomizationsConfigTypes.networkLoadBalancerConfig> {
  /**
   * Name for Network Load Balancer.
   */
  readonly name: string = '';
  /**
   * Subnets to launch the Network Load Balancer in.
   */
  readonly subnets: string[] = [];
  /**
   * Load Balancer scheme. If undefined, the default of {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateLoadBalancer.html | ELBv2 CreateLoadBalancer API} is used.
   * @see {@link CustomizationsConfigTypes.loadBalancerSchemeEnum}
   */
  readonly scheme: t.TypeOf<typeof CustomizationsConfigTypes.loadBalancerSchemeEnum> | undefined = undefined;
  /**
   * Deletion protection for Network Load Balancer.
   */
  readonly deletionProtection: boolean | undefined = undefined;
  /**
   * Cross Zone load balancing for Network Load Balancer.
   */
  readonly crossZoneLoadBalancing: boolean | undefined = undefined;
  /**
   * Listeners for Network Load Balancer.
   * @see {@link NetworkLoadBalancerListenerConfig}
   */
  readonly listeners: NetworkLoadBalancerListenerConfig[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link BlockDeviceMappingItem}/ {@link EbsItemConfig}*
 *
 * The parameters for a block device for an EBS volume.
 *
 * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_LaunchTemplateEbsBlockDeviceRequest.html}
 *
 * @example
 * ```
 * - deviceName: /dev/xvda
 *   ebs:
 *    deleteOnTermination: true
 *    encrypted: true
 *    kmsKeyId: key1
 * ```
 */
export class EbsItemConfig implements t.TypeOf<typeof CustomizationsConfigTypes.ebsItem> {
  /**
   * Indicates whether the EBS volume is deleted on instance termination.
   */
  readonly deleteOnTermination: boolean | undefined = undefined;
  /**
   * Indicates whether the EBS volume is encrypted. Encrypted volumes can only be attached to instances that support Amazon EBS encryption. If you are creating a volume from a snapshot, you can't specify an encryption value.
   * If encrypted is `true` and kmsKeyId is not provided, then accelerator checks for {@link EbsDefaultVolumeEncryptionConfig | default ebs encryption} in the config.
   */
  readonly encrypted: boolean | undefined = undefined;
  /**
   * The number of I/O operations per second (IOPS). For gp3, io1, and io2 volumes, this represents the number of IOPS that are provisioned for the volume. For gp2 volumes, this represents the baseline performance of the volume and the rate at which the volume accumulates I/O credits for bursting.
   * This parameter is supported for io1, io2, and gp3 volumes only. This parameter is not supported for gp2, st1, sc1, or standard volumes.
   */
  readonly iops: number | undefined = undefined;
  /**
   * The ARN of the symmetric AWS Key Management Service (AWS KMS) CMK used for encryption.
   */
  readonly kmsKeyId: string | undefined = undefined;
  /**
   * The ID of the snapshot.
   */
  readonly snapshotId: string | undefined = undefined;
  /**
   * The throughput to provision for a gp3 volume, with a maximum of 1,000 MiB/s.
   * Valid Range: Minimum value of 125. Maximum value of 1000.
   */
  readonly throughput: number | undefined = undefined;
  /**
   * The size of the volume, in GiBs. You must specify either a snapshot ID or a volume size. The following are the supported volumes sizes for each volume type:
   * - gp2 and gp3: 1-16,384
   * - io1 and io2: 4-16,384
   * - st1 and sc1: 125-16,384
   * - standard: 1-1,024
   */
  readonly volumeSize: number | undefined = undefined;
  /**
   * The volume type.
   * Valid Values: `standard | io1 | io2 | gp2 | sc1 | st1 | gp3`
   */
  readonly volumeType: string | undefined = undefined;
}
/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem}  | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link BlockDeviceMappingItem}*
 *
 * The parameters for a block device mapping in launch template.
 *
 * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_LaunchTemplateBlockDeviceMappingRequest.html}
 *
 * @example
 * ```
 * blockDeviceMappings:
 *  - deviceName: /dev/xvda
 *    ebs:
 *      deleteOnTermination: true
 *      encrypted: true
 *      kmsKeyId: key1
 *  - deviceName: /dev/xvdb
 *    ebs:
 *      deleteOnTermination: true
 *      encrypted: true
 *  - deviceName: /dev/xvdc
 *    ebs:
 *      deleteOnTermination: true
 * ```
 */
export class BlockDeviceMappingItem implements t.TypeOf<typeof CustomizationsConfigTypes.blockDeviceMappingItem> {
  /**
   * The device name (for example, /dev/sdh or xvdh).
   */
  readonly deviceName: string = '';
  /**
   * Parameters used to automatically set up EBS volumes when the instance is launched.
   */
  readonly ebs: EbsItemConfig | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link NetworkInterfaceItemConfig}/ {@link PrivateIpAddressConfig}*
 *
 * Configure a secondary private IPv4 address for a network interface.
 * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_PrivateIpAddressSpecification.html}
 *
 * @example
 * ```
 * - primary: true
 *   privateIpAddress: 10.10.10.10
 * - primary: false
 *   privateIpAddress: 10.10.10.11
 * ```
 */
export class PrivateIpAddressConfig implements t.TypeOf<typeof CustomizationsConfigTypes.privateIpAddressItem> {
  /**
   * Indicates whether the private IPv4 address is the primary private IPv4 address. Only one IPv4 address can be designated as primary.
   */
  readonly primary: boolean | undefined = undefined;
  /**
   * The private IPv4 address.
   */
  readonly privateIpAddress: string | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link NetworkInterfaceItemConfig}*
 *
 * The parameters for a network interface.
 *
 * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_LaunchTemplateInstanceNetworkInterfaceSpecificationRequest.html}
 *
 * @example
 * ```
 * networkInterfaces:
 *  - deleteOnTermination: true
 *    description: secondary network interface
 *    deviceIndex: 1
 *    groups:
 *      # security group is from network-config.yaml under the same vpc
 *      - SharedServices-Main-sg
 *    # subnet is from network-config.yaml under the same vpc
 *    subnetId: SharedServices-App-A
 * ```
 */
export class NetworkInterfaceItemConfig implements t.TypeOf<typeof CustomizationsConfigTypes.networkInterfaceItem> {
  /**
   * Associates a Carrier IP address with eth0 for a new network interface.
   * Use this option when you launch an instance in a Wavelength Zone and want to associate a Carrier IP address with the network interface.
   */
  readonly associateCarrierIpAddress: boolean | undefined = undefined;
  /**
   * Associate an elastic IP with the interface
   *
   * @remarks
   * This property only applies to EC2-based firewall instances.
   */
  readonly associateElasticIp: boolean | undefined = undefined;
  /**
   * Associates a public IPv4 address with eth0 for a new network interface.
   */
  readonly associatePublicIpAddress: boolean | undefined = undefined;
  /**
   * Indicates whether the network interface is deleted when the instance is terminated.
   */
  readonly deleteOnTermination: boolean | undefined = undefined;
  /**
   * A description for the network interface.
   */
  readonly description: string | undefined = undefined;
  /**
   * The device index for the network interface attachment.
   */
  readonly deviceIndex: number | undefined = undefined;
  /**
   * Security group names to associate with this network interface.
   * @see {@link SecurityGroupConfig}
   */
  readonly groups: string[] | undefined = undefined;
  /**
   * The type of network interface. To create an Elastic Fabric Adapter (EFA), specify efa. If you are not creating an EFA, specify interface or omit this parameter.
   * Valid values: `interface | efa`
   */
  readonly interfaceType: string | undefined = undefined;
  /**
   * The index of the network card. Some instance types support multiple network cards. The primary network interface must be assigned to network card index 0. The default is network card index 0.
   */
  readonly networkCardIndex: number | undefined = undefined;
  /**
   * The ID of the network interface.
   */
  readonly networkInterfaceId: string | undefined = undefined;
  /**
   * The primary private IPv4 address of the network interface.
   */
  readonly privateIpAddress: string | undefined = undefined;
  /**
   * The number of secondary private IPv4 addresses to assign to a network interface.
   */
  readonly secondaryPrivateIpAddressCount: number | undefined = undefined;
  /**
   * If the value is true , source/destination checks are enabled; otherwise, they are disabled. The default value is true.
   * You must disable source/destination checks if the instance runs services such as network address translation, routing, or firewalls.
   *
   * @remarks
   * This property only applies to EC2-based firewall instances.
   */
  readonly sourceDestCheck: boolean | undefined = undefined;
  /**
   * Valid subnet name from network-config.yaml under the same vpc
   */
  readonly subnetId: string | undefined = undefined;
  /**
   * One or more private IPv4 addresses.
   */
  readonly privateIpAddresses: PrivateIpAddressConfig[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link NetworkInterfaceItemConfig}*
 *
 * Configure a launch template for the application.
 *
 * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_RequestLaunchTemplateData.html}
 *
 * @example
 * ```
 * launchTemplate:
 *   name: appA-lt
 *   blockDeviceMappings:
 *     - deviceName: /dev/xvda
 *       ebs:
 *         deleteOnTermination: true
 *         encrypted: true
 *         # this kms key is in security-config.yaml under keyManagementService
 *         kmsKeyId: key1
 *   securityGroups:
 *     # security group is from network-config.yaml under the same vpc
 *     - SharedServices-Main-Rsyslog-sg
 *   # Key pair should exist in that account and region
 *   keyName: keyName
 *   # this instance profile is in iam-config.yaml under roleSets
 *   iamInstanceProfile: EC2-Default-SSM-AD-Role
 *   # Local or public SSM parameter store lookup for Image ID
 *   imageId: ${ACCEL_LOOKUP::ImageId:/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2}
 *   instanceType: t3.xlarge
 *   # IMDSv2 is enabled by default. Disable it by setting this to false.
 *   enforceImdsv2: true
 *   networkInterfaces:
 *     - deleteOnTermination: true
 *       description: secondary network interface
 *       deviceIndex: 1
 *       groups:
 *         # security group is from network-config.yaml under the same vpc
 *         - SharedServices-Main-Rsyslog-sg
 *       networkCardIndex: 1
 *       # subnet is from network-config.yaml under the same vpc
 *       subnetId: SharedServices-App-A
 *   # this path is relative to the config repository and the content should be in regular text.
 *   # Its encoded in base64 before passing in to launch Template
 *   userData: appConfigs/appA/launchTemplate/userData.sh
 * ```
 */
export class LaunchTemplateConfig implements t.TypeOf<typeof CustomizationsConfigTypes.launchTemplateConfig> {
  /*
   * Name of Launch Template
   */
  readonly name: string = '';
  /*
   * The block device mapping.
   */
  readonly blockDeviceMappings: BlockDeviceMappingItem[] | undefined = undefined;
  /**
   * One or more security group names. These should be created under the VPC in network-config.yaml
   */
  readonly securityGroups: string[] = [];
  /**
   * The name of the key pair. LZA does not create keypair. This should exist in the account/region or else deployment will fail.
   */
  readonly keyPair: string | undefined = undefined;
  /**
   * Name of the instance profile created by accelerator in iam-config.yaml under roleSets
   */
  readonly iamInstanceProfile: string | undefined = undefined;
  /**
   * Valid AMI ID or a reference to ssm parameter store to get AMI ID.
   * If ssm parameter is referenced it should follow the pattern
   * ${ACCEL_LOOKUP::ImageId:/path/to/ssm/parameter/for/ami}
   *
   * For example to get the latest x86_64 amazon linux 2 ami, the value would be `${ACCEL_LOOKUP::ImageId:/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2}`
   */
  readonly imageId: string = '';
  /**
   * Valid instance type which can be launched in the target account and region.
   */
  readonly instanceType: string = '';
  /**
   * By default, {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html | IMDSv2}  is enabled. Disable it by setting this to false.
   */
  readonly enforceImdsv2: boolean | undefined = undefined;
  /**
   * One or more network interfaces. If you specify a network interface, you must specify any security groups and subnets as part of the network interface.
   */
  readonly networkInterfaces: NetworkInterfaceItemConfig[] | undefined = undefined;
  /**
   * Path to user data.
   * The path is relative to the config repository and the content should be in regular text.
   * It is encoded in base64 before passing in to Launch Template
   */
  readonly userData: string | undefined = undefined;
}

/**
 *
 * *{@link CustomizationsConfig} / {@link AppConfigItem}  | {@link Ec2FirewallAutoScalingGroupConfig} / {@link AutoScalingConfig}*
 *
 * Autoscaling group configuration for the application.
 *
 * @see {@link https://docs.aws.amazon.com/autoscaling/ec2/APIReference/API_CreateAutoScalingGroup.html}
 *
 * @example
 * ```
 * autoscaling:
 *  name: appA-asg-1
 *  maxSize: 4
 *  minSize: 1
 *  desiredSize: 2
 *  launchTemplate: appA-lt
 *  healthCheckGracePeriod: 300
 *  healthCheckType: ELB
 *  targetGroups:
 *   - appA-nlb-tg-1
 *   - appA-alb-tg-1
 * ```
 */

export class AutoScalingConfig implements t.TypeOf<typeof CustomizationsConfigTypes.autoscalingConfig> {
  /**
   * The name of the Auto Scaling group. This name must be unique per Region per account.
   * The name can contain any ASCII character 33 to 126 including most punctuation characters, digits, and upper and lowercased letters.
   * *Note* You cannot use a colon (:) in the name.
   */
  readonly name: string = '';
  /**
   * The minimum size of the group.
   */
  readonly minSize: number = 0;
  /**
   * The maximum size of the group.
   */
  readonly maxSize: number = 4;
  /**
   * The desired capacity is the initial capacity of the Auto Scaling group at the time of its creation and the capacity it attempts to maintain. It can scale beyond this capacity if you configure auto scaling. This number must be greater than or equal to the minimum size of the group and less than or equal to the maximum size of the group.
   */
  readonly desiredSize: number = 2;
  /**
   * Information used to specify the launch template and version to use to launch instances.
   */
  readonly launchTemplate: string = '';
  /**
   * The amount of time, in seconds, that Amazon EC2 Auto Scaling waits before checking the health status of an EC2 instance that has come into service and marking it unhealthy due to a failed Elastic Load Balancing or custom health check. This is useful if your instances do not immediately pass these health checks after they enter the `InService` state.
   * Defaults to 0 if unspecified.
   */
  readonly healthCheckGracePeriod: number | undefined = undefined;
  /**
   * The service to use for the health checks. The valid values are EC2 (default) and ELB. If you configure an Auto Scaling group to use load balancer (ELB) health checks, it considers the instance unhealthy if it fails either the EC2 status checks or the load balancer health checks.
   */
  readonly healthCheckType: t.TypeOf<typeof CustomizationsConfigTypes.autoScalingHealthCheckTypeEnum> | undefined =
    undefined;
  /**
   * Target group name array to associate with the Auto Scaling group. These names are from the {@link TargetGroupItemConfig|target group} set in the application.
   * Instances are registered as targets with the target groups. The target groups receive incoming traffic and route requests to one or more registered targets.
   */
  targetGroups: string[] | undefined = undefined;
  /**
   * List of subnet names for a virtual private cloud (VPC) where instances in the Auto Scaling group can be created.
   * These subnets should  be created under the VPC in network-config.yaml.
   */
  subnets: string[] = [];
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem}*
 *
 * Application configuration.
 * Used to define two tier application configurations for the accelerator.
 *
 * @example
 * ```
 * applications:
 *   - name: appA
 *     vpc:  test1
 *     deploymentTargets:
 *       accounts:
 *        - Management
 *       excludedRegions:
 *          - us-east-1
 *          - us-west-2
 *     autoscaling:
 *       name: appA-asg-1
 *       maxSize: 4
 *       minSize: 1
 *       desiredSize: 2
 *       launchTemplate: appA-lt
 *       healthCheckGracePeriod: 300
 *       healthCheckType: ELB
 *       targetGroups:
 *         - appA-nlb-tg-1
 *         - appA-alb-tg-1
 *       subnets:
 *         - Private-Subnet-A
 *         - Private-Subnet-B
 *     targetGroups:
 *       - name: appA-nlb-tg-1
 *         port: 80
 *         protocol: TCP
 *         type: instance
 *         connectionTermination: true
 *         preserveClientIp: true
 *         proxyProtocolV2: true
 *         healthCheck:
 *           enabled: true
 *           port: 80
 *           protocol: TCP
 *       - name: appA-alb-tg-1
 *         port: 80
 *         protocol: HTTP
 *         type: instance
 *         connectionTermination: true
 *         preserveClientIp: true
 *         proxyProtocolV2: true
 *         healthCheck:
 *           enabled: true
 *           port: 80
 *           protocol: HTTP
 *     networkLoadBalancer:
 *       name: appA-nlb-01
 *       scheme: internet-facing
 *       deletionProtection: false
 *       subnets:
 *         - Public-Subnet-A
 *         - Public-Subnet-B
 *       listeners:
 *         - name: appA-listener-1
 *           port: 80
 *           protocol: TCP
 *           targetGroup: appA-nlb-tg-1
 *     applicationLoadBalancer:
 *       name: appA-alb-01
 *       scheme: internet-facing
 *       subnets:
 *         - Public-Subnet-A
 *         - Public-Subnet-B
 *       securityGroups:
 *         - demo-app-sg
 *       listeners:
 *         - name: appA-listener-2
 *           port: 80
 *           protocol: HTTP
 *           targetGroup: appA-alb-tg-1
 *           type: forward
 *     launchTemplate:
 *       name: appA-lt
 *       blockDeviceMappings:
 *       - deviceName: /dev/xvda
 *         ebs:
 *           deleteOnTermination: true
 *           encrypted: true
 *           kmsKeyId: key1
 *       - deviceName: /dev/xvdb
 *         ebs:
 *           deleteOnTermination: true
 *           encrypted: true
 *       - deviceName: /dev/xvdc
 *         ebs:
 *           deleteOnTermination: true
 *       securityGroups:
 *         - demo-app-sg
 *       iamInstanceProfile: EC2-Default-SSM-AD-Role
 *       imageId: ${ACCEL_LOOKUP::ImageId:/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2}
 *       instanceType: t3.large
 *       userData: appConfigs/appA/launchTemplate/userData.sh
 * ```
 */
export class AppConfigItem implements t.TypeOf<typeof CustomizationsConfigTypes.appConfigItem> {
  /**
   * The name of the application. This should be unique per application.
   */
  readonly name: string = '';
  /**
   * VPC where the application will be deployed. The value should be a reference to the vpc in the network config under `vpcs:`.
   */
  readonly vpc: string = '';
  /**
   * The location where the application will be deployed.
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   *
   * Target groups for the application
   *
   * @see {@link TargetGroupItemConfig}
   */
  readonly targetGroups: TargetGroupItemConfig[] | undefined = undefined;

  /**
   * Network Load Balancer for the application
   *
   * @see {@link NetworkLoadBalancerConfig}
   */
  readonly networkLoadBalancer: NetworkLoadBalancerConfig | undefined = undefined;
  /**
   *
   * Launch Template for the application
   *
   * @see  {@link LaunchTemplateConfig}
   */
  readonly launchTemplate: LaunchTemplateConfig | undefined = undefined;
  /**
   *
   * AutoScalingGroup for the application
   *
   * @see {@link AutoScalingConfig}
   *
   */
  readonly autoscaling: AutoScalingConfig | undefined = undefined;
  /**
   *
   * Application Load Balancer for the application
   *
   * @see {@link ApplicationLoadBalancerConfig}
   *
   */

  readonly applicationLoadBalancer: ApplicationLoadBalancerConfig | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link PortfolioAssociationConfig}*
 *
 * Portfolio Associations configuration
 *
 * @example
 * ```
 * - type: Group
 *   name: Administrators
 * - type: Role
 *   name: EC2-Default-SSM-AD-Role
 *   propagateAssociation: true
 * - type: User
 *   name: breakGlassUser01
 * - type: PermissionSet
 *   name: AWSPowerUserAccess
 * ```
 */
export class PortfolioAssociationConfig
  implements t.TypeOf<typeof CustomizationsConfigTypes.portfolioAssociationConfig>
{
  /**
   * Indicates the type of portfolio association, valid values are: Group, User, and Role.
   */
  readonly type: t.TypeOf<typeof CustomizationsConfigTypes.portfolioAssociationType> = 'Role';
  /**
   * Indicates the name of the principal to associate the portfolio with.
   */
  readonly name: string = '';
  /**
   * Indicates whether the principal association should be created in accounts the portfolio is shared with. Verify the IAM principal exists in all accounts the portfolio is shared with before enabling.
   *
   * @remarks
   * When you propagate a principal association, a potential privilege escalation path may occur. For a user in a recipient account who is not a Service Catalog Admin, but still has the ability to create Principals (Users/Roles), that user could create an IAM Principal that matches a principal name association for the portfolio. Although this user may not know which principal names are associated through Service Catalog, they may be able to guess the user. If this potential escalation path is a concern, then LZA recommends disabling propagation.
   */
  readonly propagateAssociation: boolean = false;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link ProductConfig} / {@link ProductVersionConfig}*
 *
 * Product Versions configuration
 *
 * @example
 * ```
 * - name: v1
 *   description: Product version 1
 *   template: path/to/template.json
 * ```
 */
export class ProductVersionConfig implements t.TypeOf<typeof CustomizationsConfigTypes.productVersionConfig> {
  /**
   * Name of the version of the product
   */
  readonly name: string = '';
  /**
   * The version description
   */
  readonly description: string = '';
  /**
   * The product template.
   */
  readonly template: string = '';
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link ProductConfig} / {@link ProductSupportConfig}*
 *
 * Product Support configuration
 *
 * @example
 * ```
 * description: Product support details
 * email: support@example.com
 * url: support.example.com
 * ```
 */
export class ProductSupportConfig implements t.TypeOf<typeof CustomizationsConfigTypes.productSupportConfig> {
  /**
   * The email address to report issues with the product
   */
  readonly email: string | undefined = undefined;
  /**
   * The url to the site where users can find support information or file tickets.
   */
  readonly url: string | undefined = undefined;
  /**
   * Support description of how users should use email contact and support link.
   */
  readonly description: string | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} | {@link ProductConfig} / {@link TagOptionsConfig}*
 *
 * Service Catalog TagOptions configuration.
 *
 * @example
 * ```
 * - key: Environment
 *   values: [Dev, Test, Prod]
 * ```
 */
export class TagOptionsConfig implements t.TypeOf<typeof CustomizationsConfigTypes.tagOptionsConfig> {
  /**
   * The tag key
   */
  readonly key: string = '';
  /**
   * An array of values that can be used for the tag key
   */
  readonly values: string[] = [];
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link ProductConfig}*
 *
 * Service Catalog Products configuration
 *
 * @example
 * ```
 * - name: Product01
 *   description: Example product
 *   owner: Product-Owner
 *   versions:
 *     - name: v1
 *       description: Product version 1
 *       template: path/to/template.json
 * ```
 */
export class ProductConfig implements t.TypeOf<typeof CustomizationsConfigTypes.productConfig> {
  /**
   * The name of the product
   */
  readonly name: string = '';
  /**
   * The owner of the product
   */
  readonly owner: string = '';
  /**
   * Product version configuration
   */
  readonly versions: ProductVersionConfig[] = [];
  /**
   * Product description
   */
  readonly description: string | undefined = undefined;
  /**
   * The name of the product's publisher.
   */
  readonly distributor: string | undefined = undefined;
  /**
   * Product support details.
   */
  readonly support: ProductSupportConfig | undefined = undefined;
  /**
   * Product TagOptions configuration
   */
  readonly tagOptions: TagOptionsConfig[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig}*
 *
 * Service Catalog Portfolios configuration
 *
 * @example
 * ```
 * - name: accelerator-portfolio
 *   provider: landing-zone-accelerator
 *   account: Management
 *   regions:
 *     - us-east-1
 *   shareTargets:
 *     organizationalUnits:
 *       - Root
 *   shareTagOptions: true
 *   portfolioAssociations:
 *     - type: Group
 *       name: Administrators
 *   products:
 *     - name: Product01
 *       description: Example product
 *       owner: Product-Owner
 *       versions:
 *         - name: v1
 *           description: Product version 1
 *           template: path/to/template.json
 *   tagOptions:
 *     - key: Environment
 *       values: [Dev, Test, Prod]
 * ```
 *
 */
export class PortfolioConfig implements t.TypeOf<typeof CustomizationsConfigTypes.portfolioConfig> {
  /**
   * The name of the portfolio
   */
  readonly name: string = '';
  /**
   * The provider of the portfolio
   */
  readonly provider: string = '';
  /**
   * The name of the account to deploy the portfolio.
   */
  readonly account: string = '';
  /**
   * The region names to deploy the portfolio.
   */
  readonly regions: t.Region[] = [];
  /**
   * Configuration of portfolio associations to give access to IAM principals.
   */
  readonly portfolioAssociations: PortfolioAssociationConfig[] = [];
  /**
   * Product Configuration
   */
  readonly products: ProductConfig[] = [];
  /**
   * Portfolio share target. Sharing portfolios to Organizational Units is only supported for portfolios in the Management account.
   *
   * @remarks
   * Valid values are the friendly names of organizational unit(s) and/or account(s).
   *
   */
  readonly shareTargets: t.ShareTargets | undefined = undefined;
  /**
   * Whether or not to share TagOptions with other account(s)/OU(s)
   *
   * @remarks
   * This property is only applicable if the `shareTargets` property is defined
   */
  readonly shareTagOptions: boolean | undefined = undefined;
  /**
   * Portfolio TagOptions configuration
   */
  readonly tagOptions: TagOptionsConfig[] | undefined = undefined;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig}*
 *
 * Defines CloudFormation Stacks and StackSets to be deployed to the environment.
 * This feature supports the deployment of customer-provided CloudFormation templates to AWS
 * accounts and/or organizational units. These deployments can leverage independent CloudFormation stacks
 * or CloudFormation StackSets depending on the customer's deployment preference.
 *
 */
export class CustomizationConfig implements t.TypeOf<typeof CustomizationsConfigTypes.customizationConfig> {
  readonly cloudFormationStacks: CloudFormationStackConfig[] = [];
  readonly cloudFormationStackSets: CloudFormationStackSetConfig[] = [];
  readonly serviceCatalogPortfolios: PortfolioConfig[] = [];
}

/**
 * *{@link CustomizationsConfig}*
 *
 * Defines custom CloudFormation and external web and application tier resources. We recommend creating resources
 * with native LZA features where possible.
 */
export class CustomizationsConfig implements t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig> {
  static readonly FILENAME = 'customizations-config.yaml';

  readonly customizations: CustomizationConfig = new CustomizationConfig();
  readonly applications: AppConfigItem[] = [];
  readonly firewalls: Ec2FirewallConfig | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>) {
    Object.assign(this, values);
  }

  public getCustomStacks(): CloudFormationStackConfig[] {
    return this.customizations?.cloudFormationStacks ?? [];
  }
  public getAppStacks(): AppConfigItem[] {
    return this.applications ?? [];
  }

  /**
   * Load from config file content
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string): CustomizationsConfig {
    const buffer = fs.readFileSync(path.join(dir, CustomizationsConfig.FILENAME), 'utf8');
    const values = t.parse(CustomizationsConfigTypes.customizationsConfig, yaml.load(buffer));
    return new CustomizationsConfig(values);
  }
}
