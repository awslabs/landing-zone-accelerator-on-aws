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

import * as t from '../common/types';

export type TargetGroupProtocolType = 'TCP' | 'TLS' | 'UDP' | 'TCP_UDP' | 'HTTP' | 'HTTPS' | 'GENEVE';

export type TargetGroupProtocolVersionType = 'GRPC' | 'HTTP1' | 'HTTP2';

export type TargetGroupType = 'instance' | 'ip' | 'alb' | 'lambda';

export type TargetGroupAttributeStickinessType =
  | 'lb_cookie'
  | 'app_cookie'
  | 'source_ip'
  | 'source_ip_dest_ip'
  | 'source_ip_dest_ip_proto';

export type TargetGroupAttributeAlgorithm = 'round_robin' | 'least_outstanding_requests';

export type TargetGroupHealthCheckProtocolType = 'HTTP' | 'HTTPS' | 'TCP';

export type TargetGroupTargetFailoverType = 'no_rebalance' | 'rebalance';

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupHealthCheckConfig}*
 *
 * @description
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
export interface ITargetGroupHealthCheckType {
  /**
   * The approximate amount of time, in seconds, between health checks of an individual target. The range is 5-300.
   * If the target group protocol is TCP, TLS, UDP, TCP_UDP, HTTP or HTTPS, the default is 30 seconds.
   * If the target group protocol is GENEVE, the default is 10 seconds.
   */
  readonly interval?: number;
  /**
   * [HTTP/HTTPS health checks] The destination for health checks on the targets.
   * [HTTP1 or HTTP2 protocol version] The ping path. The default is /.
   * [GRPC protocol version] The path of a custom health check method with the format /package.service/method. The default is /AWS.ALB/healthcheck.
   */
  readonly path?: t.NonEmptyString;
  /**
   * The port the load balancer uses when performing health checks on targets.
   * If the protocol is HTTP, HTTPS, TCP, TLS, UDP, or TCP_UDP, the default is `traffic-port`, which is the port on which each target receives traffic from the load balancer.
   * If the protocol is GENEVE, the default is port 80.
   */
  readonly port?: number;
  /**
   * The protocol the load balancer uses when performing health checks on targets.
   * For Application Load Balancers, the default is HTTP.
   * For Network Load Balancers and Gateway Load Balancers, the default is TCP.
   * The TCP protocol is not supported for health checks if the protocol of the target group is HTTP or HTTPS.
   * GENEVE, TLS, UDP, and TCP_UDP protocols are not supported for health checks.
   */
  readonly protocol?: TargetGroupHealthCheckProtocolType;
  /**
   * The amount of time, in seconds, during which no response from a target means a failed health check.
   * The range is 2–120 seconds.
   * For target groups with a protocol of HTTP, the default is 6 seconds.
   * For target groups with a protocol of TCP, TLS or HTTPS, the default is 10 seconds.
   * For target groups with a protocol of GENEVE, the default is 5 seconds.
   */
  readonly timeout?: number;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupThresholdConfig}*
 *
 * @description
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
export interface ITargetGroupThresholdType {
  /**
   * The number of consecutive health check successes required before considering a target healthy. The range is 2-10.
   * If the target group protocol is TCP, TCP_UDP, UDP, TLS, HTTP or HTTPS, the default is 5.
   * For target groups with a protocol of GENEVE, the default is 3.
   */
  readonly healthy?: number;
  /**
   * The number of consecutive health check failures required before considering a target unhealthy. The range is 2-10.
   * If the target group protocol is TCP, TCP_UDP, UDP, TLS, HTTP or HTTPS, the default is 2.
   * For target groups with a protocol of GENEVE, the default is 3.
   */
  readonly unhealthy?: number;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link NlbTargetTypeConfig}*
 *
 * @description
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
export interface ITargetGroupMatcherType {
  /**
   * You can specify values between 0 and 99. You can specify multiple values (for example, "0,1") or a range of values (for example, "0-5"). The default value is 12.
   */
  readonly grpcCode?: t.NonEmptyString;
  /**
   * For Application Load Balancers, you can specify values between 200 and 499, with the default value being 200. You can specify multiple values (for example, "200,202") or a range of values (for example, "200-299").
   * For Network Load Balancers, you can specify values between 200 and 599, with the default value being 200-399. You can specify multiple values (for example, "200,202") or a range of values (for example, "200-299").
   * Note that when using shorthand syntax, some values such as commas need to be escaped.
   */
  readonly httpCode?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupAttributeConfig}*
 *
 * @description
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

export interface ITargetGroupAttributeTypes {
  /**
   * The amount of time, in seconds, for Elastic Load Balancing to wait before changing the state of a deregistering target from draining to unused. The range is 0-3600 seconds. The default value is 300 seconds.
   */
  readonly deregistrationDelay?: number;
  /**
   * Indicates whether target stickiness is enabled. The value is true or false. The default is false.
   */
  readonly stickiness?: boolean;
  /**
   * Indicates the type of stickiness. The possible values are:
   *  - lb_cookie and app_cookie for Application Load Balancers.
   *  - source_ip for Network Load Balancers.
   *  - source_ip_dest_ip and source_ip_dest_ip_proto for Gateway Load Balancers
   */
  readonly stickinessType?: TargetGroupAttributeStickinessType;
  /**
   * The load balancing algorithm determines how the load balancer selects targets when routing requests. The value is round_robin or least_outstanding_requests. The default is round_robin.
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly algorithm?: TargetGroupAttributeAlgorithm;
  /**
   * The time period, in seconds, during which a newly registered target receives an increasing share of the traffic to the target group. After this time period ends, the target receives its full share of traffic. The range is 30-900 seconds (15 minutes). The default is 0 seconds (disabled).
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly slowStart?: number;
  /**
   * Indicates the name of the application-based cookie. Names that start with the following prefixes are not allowed: AWSALB, AWSALBAPP, and AWSALBTG; they're reserved for use by the load balancer.
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly appCookieName?: t.NonEmptyString;
  /**
   * The time period, in seconds, during which requests from a client should be routed to the same target. After this time period expires, the application-based cookie is considered stale. The range is 1 second to 1 week (604800 seconds). The default value is 1 day (86400 seconds).
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly appCookieDuration?: number;
  /**
   *  The time period, in seconds, during which requests from a client should be routed to the same target. After this time period expires, the load balancer-generated cookie is considered stale. The range is 1 second to 1 week (604800 seconds). The default value is 1 day (86400 seconds).
   * The following attribute is supported only if the load balancer is an Application Load Balancer and the target is an instance or an IP address.
   */
  readonly lbCookieDuration?: number;
  /**
   * Indicates whether the load balancer terminates connections at the end of the deregistration timeout. The value is true or false. The default is false.
   * The following attribute is supported only by Network Load Balancers.
   */
  readonly connectionTermination?: boolean;
  /**
   * Indicates whether client IP preservation is enabled. The value is true or false. The default is disabled if the target group type is IP address and the target group protocol is TCP or TLS. Otherwise, the default is enabled. Client IP preservation cannot be disabled for UDP and TCP_UDP target groups.
   * The following attribute is supported only by Network Load Balancers.
   */
  readonly preserveClientIp?: boolean;
  /**
   * Indicates whether Proxy Protocol version 2 is enabled. The value is true or false. The default is false.
   * The following attribute is supported only by Network Load Balancers.
   */
  readonly proxyProtocolV2?: boolean;
  /**
   * Indicates how the Gateway Load Balancer handles existing flows when a target is deregistered or becomes unhealthy.
   * The possible values are rebalance and no_rebalance. The default is no_rebalance
   */
  readonly targetFailover?: TargetGroupTargetFailoverType;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig} / {@link TargetGroupMatcherConfig}*
 *
 * @description
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
export interface INlbTargetType {
  /**
   * Friendly Account Name where the NLB is deployed
   */
  readonly account: t.NonEmptyString;
  /**
   * Region where the NLB is deployed
   */
  readonly region: t.NonEmptyString;
  /**
   * Friendly name of the NLB
   */
  readonly nlbName: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link TargetGroupItemConfig}*
 *
 * @description
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
export interface ITargetGroupItem {
  /**
   * The name of the target group. This value is used in {@link ApplicationLoadBalancerListenerConfig| Application Load Balancer listeners}, {@link NetworkLoadBalancerListenerConfig| Network Load Balancer listeners}, and {@link AutoScalingConfig| Autoscaling config}.
   */
  readonly name: t.NonEmptyString;
  /**
   * The port on which the targets receive traffic.
   */
  readonly port: number;
  /**
   * Target group protocol version. Should be one of HTTP, HTTPS, GENEVE, TCP, UDP, TCP_UDP or TLS
   * The protocol to use for routing traffic to the targets.
   * For Application Load Balancers, the supported protocols are HTTP and HTTPS.
   * For Network Load Balancers, the supported protocols are TCP, TLS, UDP, or TCP_UDP. A TCP_UDP listener must be associated with a TCP_UDP target group.
   * For Gateway Load Balancers, the supported protocol is GENEVE.
   * @see {@link CustomizationsConfigTypes.targetGroupProtocolType}
   */
  readonly protocol: TargetGroupProtocolType;
  /**
   * The protocol version. Should be one of 'GRPC', 'HTTP1', 'HTTP2'. Specify GRPC to send requests to targets using gRPC. Specify HTTP2 to send requests to targets using HTTP/2. The default is HTTP1, which sends requests to targets using HTTP/1.1.
   * @see {@link CustomizationsConfigTypes.targetGroupProtocolVersionType}
   */
  readonly protocolVersion?: TargetGroupProtocolVersionType;
  /**
   * The type of target that you must specify when registering targets with this target group. You can't specify targets for a target group using more than one target type.
   * - `instance` - Register targets by instance ID. This is the default value.
   * - `ip` - Register targets by IP address. You can specify IP addresses from the subnets of the virtual private cloud (VPC) for the target group, the RFC 1918 range (10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16), and the RFC 6598 range (100.64.0.0/10). You can't specify publicly routable IP addresses.
   * `alb` - Register a single Application Load Balancer as a target.
   *
   * @see {@link CustomizationsConfigTypes.targetGroupType}
   */
  readonly type: TargetGroupType;
  /**
   * Target Group Attributes.
   * @see {@link CustomizationsConfigTypes.targetGroupAttributes}
   */
  readonly attributes?: ITargetGroupAttributeTypes;
  /**
   * Target Group HealthCheck.
   * @see {@link CustomizationsConfigTypes.targetGroupHealthCheckType}
   */
  readonly healthCheck?: ITargetGroupHealthCheckType;
  /**
   * Target group targets. These targets should be the friendly names assigned to firewall instances.
   *
   * @remarks
   * This property should only be defined if also defining EC2-based firewall instances.
   * It should be left undefined for application configurations.
   */
  readonly targets?: (t.NonEmptyString | INlbTargetType)[];
  /**
   * Target Group Threshold.
   * @see {@link CustomizationsConfigTypes.targetGroupThresholdType}
   */
  readonly threshold?: ITargetGroupThresholdType;
  /**
   *  The HTTP or gRPC codes to use when checking for a successful response from a target. For target groups with a protocol of TCP, TCP_UDP, UDP or TLS the range is 200-599. For target groups with a protocol of HTTP or HTTPS, the range is 200-499.
   * @see {@link CustomizationsConfigTypes.targetGroupMatcherType}
   */
  readonly matcher?: ITargetGroupMatcherType;
  /**
   * The accounts/OUs location where the Target Group will be deployed to.
   */
  readonly shareTargets?: t.IShareTargets;
}

export type NlbProtocolEnum = 'TCP' | 'UDP' | 'TLS' | 'TCP_UDP';
export type AlpnPolicyEnum = 'HTTP1Only' | 'HTTP2Only' | 'HTTP2Optional' | 'HTTP2Preferred' | 'None';
export type SslPolicyNlbEnum =
  | 'ELBSecurityPolicy-TLS13-1-2-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Res-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext1-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext2-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-1-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-0-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-3-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Res-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext0-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext1-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext2-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-1-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-0-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-3-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS-1-0-2015-04'
  | 'ELBSecurityPolicy-TLS-1-1-2017-01'
  | 'ELBSecurityPolicy-TLS-1-2-2017-01'
  | 'ELBSecurityPolicy-TLS-1-2-Ext-2018-06'
  | 'ELBSecurityPolicy-FS-2018-06'
  | 'ELBSecurityPolicy-FS-1-1-2019-08'
  | 'ELBSecurityPolicy-FS-1-2-2019-08'
  | 'ELBSecurityPolicy-FS-1-2-Res-2019-08'
  | 'ELBSecurityPolicy-2015-05'
  | 'ELBSecurityPolicy-FS-1-2-Res-2020-10'
  | 'ELBSecurityPolicy-TLS13-1-2-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Res-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext1-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext2-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-1-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-0-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-3-2021-06'
  | 'ELBSecurityPolicy-2016-08';

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link NetworkLoadBalancerConfig} / {@link NetworkLoadBalancerListenerConfig}*
 *
 * @description
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
export interface INlbListenerConfig {
  /**
   * Name for Listener.
   */
  readonly name: t.NonEmptyString;
  /**
   * ACM ARN of the certificate to be associated with the listener.
   */
  readonly certificate?: t.NonEmptyString;
  /**
   * Port where the traffic is directed to.
   */
  readonly port?: number;
  /**
   * Protocol used for the traffic. The supported protocols are TCP, TLS, UDP, or TCP_UDP.
   * @see {@link CustomizationsConfigTypes.nlbProtocolEnum}
   */
  readonly protocol?: NlbProtocolEnum;
  /**
   * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/network/create-tls-listener.html#alpn-policies | Application-Layer Protocol Negotiation (ALPN) policy} for TLS encrypted traffic
   *
   * @description
   * Application-Layer Protocol Negotiation (ALPN) policy} for TLS encrypted traffic
   *
   * @see {@link CustomizationsConfigTypes.alpnPolicyEnum}
   */
  readonly alpnPolicy?: AlpnPolicyEnum;
  /**
   * {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/network/create-tls-listener.html#describe-ssl-policies|SSL policy} for TLS encrypted traffic
   *
   * @description
   * SSL policy for TLS encrypted traffic
   *
   * @see {@link CustomizationsConfigTypes.sslPolicyNlbEnum}
   */
  readonly sslPolicy?: SslPolicyNlbEnum;
  /**
   * Target Group to direct the traffic to.
   */
  readonly targetGroup: t.NonEmptyString;
}

export type LoadBalancerSchemeEnum = 'internet-facing' | 'internal';

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link NetworkLoadBalancerConfig}*
 *
 * @description
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
export interface INetworkLoadBalancerConfig {
  /**
   * Load Balancer scheme. If undefined, the default of {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateLoadBalancer.html | ELBv2 CreateLoadBalancer API} is used.
   * @see {@link CustomizationsConfigTypes.loadBalancerSchemeEnum}
   */
  readonly scheme?: LoadBalancerSchemeEnum;
  /**
   * Deletion protection for Network Load Balancer.
   */
  readonly deletionProtection?: boolean;
  /**
   * Subnets to launch the Network Load Balancer in.
   */
  readonly subnets: t.NonEmptyString[];
  /**
   * Name for Network Load Balancer.
   */
  readonly name: t.NonEmptyString;
  /**
   * Cross Zone load balancing for Network Load Balancer.
   */
  readonly crossZoneLoadBalancing?: boolean;
  /**
   * Listeners for Network Load Balancer.
   * @see {@link NetworkLoadBalancerListenerConfig}
   */
  readonly listeners?: INlbListenerConfig[];
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link NetworkInterfaceItemConfig}/ {@link PrivateIpAddressConfig}*
 *
 * @description
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
export interface IPrivateIpAddressItem {
  /**
   * Indicates whether the private IPv4 address is the primary private IPv4 address. Only one IPv4 address can be designated as primary.
   */
  readonly primary?: boolean;
  /**
   * The private IPv4 address.
   */
  readonly privateIpAddress?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link BlockDeviceMappingItem}/ {@link EbsItemConfig}*
 *
 * @description
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
export interface IEbsItem {
  /**
   * Indicates whether the EBS volume is deleted on instance termination.
   */
  readonly deleteOnTermination?: boolean;
  /**
   * Indicates whether the EBS volume is encrypted. Encrypted volumes can only be attached to instances that support Amazon EBS encryption. If you are creating a volume from a snapshot, you can't specify an encryption value.
   * If encrypted is `true` and kmsKeyId is not provided, then accelerator checks for {@link EbsDefaultVolumeEncryptionConfig | default ebs encryption} in the config.
   */
  readonly encrypted?: boolean;
  /**
   * The number of I/O operations per second (IOPS). For gp3, io1, and io2 volumes, this represents the number of IOPS that are provisioned for the volume. For gp2 volumes, this represents the baseline performance of the volume and the rate at which the volume accumulates I/O credits for bursting.
   * This parameter is supported for io1, io2, and gp3 volumes only. This parameter is not supported for gp2, st1, sc1, or standard volumes.
   */
  readonly iops?: number;
  /**
   * The ARN of the symmetric AWS Key Management Service (AWS KMS) CMK used for encryption.
   */
  readonly kmsKeyId?: t.NonEmptyString;
  /**
   * The ID of the snapshot.
   */
  readonly snapshotId?: t.NonEmptyString;
  /**
   * The throughput to provision for a gp3 volume, with a maximum of 1,000 MiB/s.
   * Valid Range: Minimum value of 125. Maximum value of 1000.
   */
  readonly throughput?: number;
  /**
   * The size of the volume, in GiBs. You must specify either a snapshot ID or a volume size. The following are the supported volumes sizes for each volume type:
   * - gp2 and gp3: 1-16,384
   * - io1 and io2: 4-16,384
   * - st1 and sc1: 125-16,384
   * - standard: 1-1,024
   */
  readonly volumeSize?: number;
  /**
   * The volume type.
   * Valid Values: `standard | io1 | io2 | gp2 | sc1 | st1 | gp3`
   */
  readonly volumeType?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem}  | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link BlockDeviceMappingItem}*
 *
 * @description
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
export interface IBlockDeviceMappingItem {
  /**
   * The device name (for example, /dev/sdh or xvdh).
   */
  readonly deviceName: t.NonEmptyString;
  /**
   * Parameters used to automatically set up EBS volumes when the instance is launched.
   */
  readonly ebs?: IEbsItem;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link NetworkInterfaceItemConfig}*
 *
 * @description
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
export interface INetworkInterfaceItem {
  /**
   * Associates a Carrier IP address with eth0 for a new network interface.
   * Use this option when you launch an instance in a Wavelength Zone and want to associate a Carrier IP address with the network interface.
   */
  readonly associateCarrierIpAddress?: boolean;
  /**
   * Associate an elastic IP with the interface
   *
   * @remarks
   * This property only applies to EC2-based firewall instances.
   */
  readonly associateElasticIp?: boolean;
  /**
   * Associates a public IPv4 address with eth0 for a new network interface.
   */
  readonly associatePublicIpAddress?: boolean;
  /**
   * Indicates whether the network interface is deleted when the instance is terminated.
   */
  readonly deleteOnTermination?: boolean;
  /**
   * A description for the network interface.
   */
  readonly description?: t.NonEmptyString;
  /**
   * The device index for the network interface attachment.
   */
  readonly deviceIndex?: number;
  /**
   * Security group names to associate with this network interface.
   * @see {@link SecurityGroupConfig}
   */
  readonly groups?: t.NonEmptyString[];
  /**
   * The type of network interface. To create an Elastic Fabric Adapter (EFA), specify efa. If you are not creating an EFA, specify interface or omit this parameter.
   * Valid values: `interface | efa`
   */
  readonly interfaceType?: t.NonEmptyString;
  /**
   * The index of the network card. Some instance types support multiple network cards. The primary network interface must be assigned to network card index 0. The default is network card index 0.
   */
  readonly networkCardIndex?: number;
  /**
   * The ID of the network interface.
   */
  readonly networkInterfaceId?: t.NonEmptyString;
  /**
   * The primary private IPv4 address of the network interface.
   */
  readonly privateIpAddress?: t.NonEmptyString;
  /**
   * One or more private IPv4 addresses.
   */
  readonly privateIpAddresses?: IPrivateIpAddressItem[];
  /**
   * The number of secondary private IPv4 addresses to assign to a network interface.
   */
  readonly secondaryPrivateIpAddressCount?: number;
  /**
   * If the value is true , source/destination checks are enabled; otherwise, they are disabled. The default value is true.
   * You must disable source/destination checks if the instance runs services such as network address translation, routing, or firewalls.
   *
   * @remarks
   * This property only applies to EC2-based firewall instances.
   */
  readonly sourceDestCheck?: boolean;
  /**
   * Valid subnet name from network-config.yaml under the same vpc
   */
  readonly subnetId?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} | {@link Ec2FirewallConfig} / {@link LaunchTemplateConfig} / {@link NetworkInterfaceItemConfig}*
 *
 * @description
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
export interface ILaunchTemplateConfig {
  /*
   * Name of Launch Template
   */
  readonly name: t.NonEmptyString;
  /*
   * The block device mapping.
   */
  readonly blockDeviceMappings?: IBlockDeviceMappingItem[];
  /**
   * One or more security group names. These should be created under the VPC in network-config.yaml
   */
  readonly securityGroups?: t.NonEmptyString[];
  /**
   * The name of the key pair. LZA does not create keypair. This should exist in the account/region or else deployment will fail.
   */
  readonly keyPair?: t.NonEmptyString;
  /**
   * Name of the instance profile created by accelerator in iam-config.yaml under roleSets
   */
  readonly iamInstanceProfile?: t.NonEmptyString;
  /**
   * Valid AMI ID or a reference to ssm parameter store to get AMI ID.
   * If ssm parameter is referenced it should follow the pattern
   * ${ACCEL_LOOKUP::ImageId:/path/to/ssm/parameter/for/ami}
   *
   * For example to get the latest x86_64 amazon linux 2 ami, the value would be `${ACCEL_LOOKUP::ImageId:/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2}`
   */
  readonly imageId: t.NonEmptyString;
  /**
   * Valid instance type which can be launched in the target account and region.
   */
  readonly instanceType: t.NonEmptyString;
  /**
   * By default, {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html | IMDSv2}  is enabled. Disable it by setting this to false.
   */
  readonly enforceImdsv2?: boolean;
  /**
   * One or more network interfaces. If you specify a network interface, you must specify any security groups and subnets as part of the network interface.
   */
  readonly networkInterfaces?: INetworkInterfaceItem[];
  /**
   * Path to user data.
   * The path is relative to the config repository and the content should be in regular text.
   * It is encoded in base64 before passing in to Launch Template
   *
   * @remarks
   * If defining user data for an EC2 firewall instance or AutoScaling group, you may use the variable
   * `${ACCEL_LOOKUP::S3:BUCKET:firewall-config}` in order to dynamically resolve the name of the S3 bucket
   * where S3 firewall configurations are stored by the accelerator. This bucket is used when the `configFile`, `configDir` or
   * `licenseFile` properties are defined for a firewall.
   *
   * @see {@link Ec2FirewallAutoScalingGroupConfig} | {@link Ec2FirewallInstanceConfig}
   */
  readonly userData?: t.NonEmptyString;
}

export type AutoScalingHealthCheckTypeEnum = 'EC2' | 'ELB';

/**
 *
 * *{@link CustomizationsConfig} / {@link AppConfigItem}  | {@link Ec2FirewallAutoScalingGroupConfig} / {@link AutoScalingConfig}*
 *
 * @description
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
 *  maxInstanceLifetime: 86400
 * ```
 */
export interface IAutoScalingConfig {
  /**
   * The name of the Auto Scaling group. This name must be unique per Region per account.
   * The name can contain any ASCII character 33 to 126 including most punctuation characters, digits, and upper and lowercased letters.
   * *Note* You cannot use a colon (:) in the name.
   */
  readonly name: t.NonEmptyString;
  /**
   * The minimum size of the group.
   */
  readonly minSize: number;
  /**
   * The maximum size of the group.
   */
  readonly maxSize: number;
  /**
   * The desired capacity is the initial capacity of the Auto Scaling group at the time of its creation and the capacity it attempts to maintain. It can scale beyond this capacity if you configure auto scaling. This number must be greater than or equal to the minimum size of the group and less than or equal to the maximum size of the group.
   */
  readonly desiredSize: number;
  /**
   * Information used to specify the launch template and version to use to launch instances.
   */
  readonly launchTemplate: t.NonEmptyString;
  /**
   * The amount of time, in seconds, that Amazon EC2 Auto Scaling waits before checking the health status of an EC2 instance that has come into service and marking it unhealthy due to a failed Elastic Load Balancing or custom health check. This is useful if your instances do not immediately pass these health checks after they enter the `InService` state.
   * Defaults to 0 if unspecified.
   */
  readonly healthCheckGracePeriod?: number;
  /**
   * The service to use for the health checks. The valid values are EC2 (default) and ELB. If you configure an Auto Scaling group to use load balancer (ELB) health checks, it considers the instance unhealthy if it fails either the EC2 status checks or the load balancer health checks.
   */
  readonly healthCheckType?: AutoScalingHealthCheckTypeEnum;
  /**
   * Target group name array to associate with the Auto Scaling group. These names are from the {@link TargetGroupItemConfig|target group} set in the application.
   * Instances are registered as targets with the target groups. The target groups receive incoming traffic and route requests to one or more registered targets.
   */
  readonly targetGroups?: t.NonEmptyString[];
  /**
   * List of subnet names for a virtual private cloud (VPC) where instances in the Auto Scaling group can be created.
   * These subnets should  be created under the VPC in network-config.yaml.
   */
  readonly subnets: t.NonEmptyString[];
  /**
   * The maximum instance lifetime specifies the maximum amount of time (in seconds) that an instance can be in service before it is terminated and replaced. A common use case might be a requirement to replace your instances on a schedule because of internal security policies or external compliance controls.
   * You must specify a value of at least 86,400 seconds (one day). To clear a previously set value, specify a new value of 0. This setting applies to all current and future instances in your Auto Scaling group
   */
  readonly maxInstanceLifetime?: number;
}

export type AlbRoutingHttpConfigMitigationModeEnum = 'monitor' | 'defensive' | 'strictest';

export interface IAlbRoutingHttpConfig {
  readonly desyncMitigationMode?: AlbRoutingHttpConfigMitigationModeEnum;
  readonly dropInvalidHeader?: boolean;
  readonly xAmznTlsCipherEnable?: boolean;
  readonly xffClientPort?: boolean;
}

export type AlbListenerProtocolEnum = 'HTTP' | 'HTTPS';
export type AlbListenerTypeEnum = 'fixed-response' | 'forward' | 'redirect';
export type SslPolicyAlbEnum =
  | 'ELBSecurityPolicy-TLS13-1-2-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Res-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext1-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext2-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-1-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-0-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-3-2021-06'
  | 'ELBSecurityPolicy-TLS13-1-2-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Res-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext0-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext1-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-2-Ext2-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-1-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-0-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS13-1-3-FIPS-2023-04'
  | 'ELBSecurityPolicy-TLS-1-0-2015-04'
  | 'ELBSecurityPolicy-TLS-1-1-2017-01'
  | 'ELBSecurityPolicy-TLS-1-2-2017-01'
  | 'ELBSecurityPolicy-TLS-1-2-Ext-2018-06'
  | 'ELBSecurityPolicy-FS-2018-06'
  | 'ELBSecurityPolicy-FS-1-1-2019-08'
  | 'ELBSecurityPolicy-FS-1-2-2019-08'
  | 'ELBSecurityPolicy-FS-1-2-Res-2019-08'
  | 'ELBSecurityPolicy-2015-05'
  | 'ELBSecurityPolicy-FS-1-2-Res-2020-10'
  | 'ELBSecurityPolicy-2016-08';

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerFixedResponseConfig}*
 *
 * @description
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
export interface IAlbListenerFixedResponseConfig {
  /**
   * The content type.
   * Valid Values: text/plain | text/css | text/html | application/javascript | application/json
   */
  readonly statusCode: t.NonEmptyString;
  /**
   * The message to send back.
   */
  readonly contentType?: t.NonEmptyString;
  /**
   * The HTTP response code (2XX, 4XX, or 5XX).
   */
  readonly messageBody?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerForwardConfig}/ {@link AlbListenerForwardConfigTargetGroupStickinessConfig}*
 *
 * @description
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
export interface IAlbListenerTargetGroupStickinessConfig {
  /**
   * The time period, in seconds, during which requests from a client should be routed to the same target group. The range is 1-604800 seconds (7 days).
   */
  readonly durationSeconds?: number;
  /**
   * Indicates whether target group stickiness is enabled.
   */
  readonly enabled?: boolean;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerForwardConfig}
 *
 * @description
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
export interface IAlbListenerForwardConfig {
  readonly targetGroupStickinessConfig?: IAlbListenerTargetGroupStickinessConfig;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig} / {@link AlbListenerRedirectConfig}*
 *
 * @description
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
export interface IAlbListenerRedirectConfig {
  readonly statusCode?: t.NonEmptyString;
  readonly host?: t.NonEmptyString;
  readonly path?: t.NonEmptyString;
  readonly port?: number;
  readonly protocol?: t.NonEmptyString;
  readonly query?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerListenerConfig}*
 *
 * @description
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
export interface IAlbListenerConfig {
  /**
   * The name of the application load balancer listener
   */
  readonly name: t.NonEmptyString;
  /**
   * Port of the application load balancer listener
   */
  readonly port: number;
  /**
   * Protocol of the application load balancer listener. The supported protocols are HTTP and HTTPS
   */
  readonly protocol: AlbListenerProtocolEnum;
  /**
   * Type of the application load balancer listener
   */
  readonly type: AlbListenerTypeEnum;
  /**
   * Applies to HTTPS listeners. The default certificate for the listener. You must provide exactly one certificate arn or a certificate name which was created by LZA
   */
  readonly certificate?: t.NonEmptyString;
  /**
   * The security policy that defines which protocols and ciphers are supported.
   * @see {@link https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html#describe-ssl-policies | Application Load Balancer Listener SSL Policies}
   */
  readonly sslPolicy?: SslPolicyAlbEnum;
  /**
   * Target Group name to which traffic will be forwarded to. This name should be same as {@link ApplicationLoadBalancerTargetGroupConfig | targetGroup} name.
   */
  readonly targetGroup: t.NonEmptyString;
  /**
   *  Information for creating an action that returns a custom HTTP response. Specify only when type is `fixed-response`.
   */
  readonly fixedResponseConfig?: IAlbListenerFixedResponseConfig;
  /**
   * Information for creating an action that distributes requests to targetGroup. Stickiness for targetGroup can be set here.
   */
  readonly forwardConfig?: IAlbListenerForwardConfig;
  /**
   * The order for the action. This value is required for rules with multiple actions. The action with the lowest value for order is performed first
   */
  readonly order?: number;
  /**
   * Information for creating a redirect action. Specify only when type is `redirect`.
   */
  readonly redirectConfig?: IAlbListenerRedirectConfig;
}

export type RoutingHttpXffHeaderProcessingModeEnum = 'append' | 'preserve' | 'remove';

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig} / {@link ApplicationLoadBalancerAttributesConfig}*
 *
 * @description
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
export interface IAlbAttributesConfig {
  /**
   * Enable or disable deletion protection.
   */
  readonly deletionProtection?: boolean;
  /**
   * The idle timeout value, in seconds. The valid range is 1-4000 seconds. The default is 60 seconds.
   */
  readonly idleTimeout?: number;
  /**
   * Determines how the load balancer handles requests that might pose a security risk to your application. The possible values are `monitor` , `defensive` , and `strictest` . The default is `defensive`.
   */
  readonly routingHttpDesyncMitigationMode?: AlbRoutingHttpConfigMitigationModeEnum;
  /**
   * Indicates whether HTTP headers with invalid header fields are removed by the load balancer ( true ) or routed to targets ( false ). The default is false.
   */
  readonly routingHttpDropInvalidHeader?: boolean;
  /**
   * Indicates whether the two headers ( x-amzn-tls-version and x-amzn-tls-cipher-suite ), which contain information about the negotiated TLS version and cipher suite, are added to the client request before sending it to the target. The x-amzn-tls-version header has information about the TLS protocol version negotiated with the client, and the x-amzn-tls-cipher-suite header has information about the cipher suite negotiated with the client. Both headers are in OpenSSL format. The possible values for the attribute are true and false . The default is false.
   */
  readonly routingHttpXAmznTlsCipherEnable?: boolean;
  /**
   * Indicates whether the X-Forwarded-For header should preserve the source port that the client used to connect to the load balancer. The possible values are true and false . The default is false.
   */
  readonly routingHttpXffClientPort?: boolean;
  /**
   * Enables you to modify, preserve, or remove the X-Forwarded-For header in the HTTP request before the Application Load Balancer sends the request to the target. The possible values are append, preserve, and remove. The default is append.
   */
  readonly routingHttpXffHeaderProcessingMode?: RoutingHttpXffHeaderProcessingModeEnum;
  /**
   * Indicates whether HTTP/2 is enabled. The possible values are true and false. The default is true. Elastic Load Balancing requires that message header names contain only alphanumeric characters and hyphens.
   */
  readonly http2Enabled?: boolean;
  /**
   * Indicates whether to allow a WAF-enabled load balancer to route requests to targets if it is unable to forward the request to AWS WAF. The possible values are true and false. The default is false.
   */
  readonly wafFailOpen?: boolean;
}

export type AlbSchemeEnum = 'internet-facing' | 'internal';

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem} / {@link ApplicationLoadBalancerConfig}*
 *
 * @description
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
export interface IApplicationLoadBalancerConfig {
  /**
   * The name of the application load balancer
   */
  readonly name: t.NonEmptyString;
  /**
   * Subnets to launch the Application Load Balancer in.
   */
  readonly subnets: t.NonEmptyString[];
  /**
   * Security Groups to attach to the Application Load Balancer.
   */
  readonly securityGroups: t.NonEmptyString[];
  /**
   * Internal or internet facing scheme for Application Load Balancer.
   */
  readonly scheme?: AlbSchemeEnum;
  /**
   * Attributes for Application Load Balancer.
   */
  readonly attributes?: IAlbAttributesConfig;
  /**
   * Listeners for Application Load Balancer.
   */
  readonly listeners?: IAlbListenerConfig[];
  /**
   * The location where the Application Load Balancer(s) will be deployed to.
   * * @remarks
   * The accounts/OUs provided should contain the subnets specified that are distributed by Resource Access Manager by the `shareTargets` property
   * for the respective subnets.
   */
  readonly shareTargets?: t.IShareTargets;
}

/**
 * *{@link CustomizationsConfig} / {@link AppConfigItem}*
 *
 * @description
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
 *       maxInstanceLifetime: 86400
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
export interface IAppConfigItem {
  /**
   * The name of the application. This should be unique per application.
   */
  readonly name: t.NonEmptyString;
  /**
   * VPC where the application will be deployed. The value should be a reference to the vpc in the network config under `vpcs:`.
   */
  readonly vpc: t.NonEmptyString;
  /**
   * The location where the application will be deployed.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   *
   * Target groups for the application
   *
   * @see {@link TargetGroupItemConfig}
   */
  readonly targetGroups?: ITargetGroupItem[];
  /**
   * Network Load Balancer for the application
   *
   * @see {@link NetworkLoadBalancerConfig}
   */
  readonly networkLoadBalancer?: INetworkLoadBalancerConfig;
  /**
   *
   * Launch Template for the application
   *
   * @see  {@link LaunchTemplateConfig}
   */
  readonly launchTemplate?: ILaunchTemplateConfig;
  /**
   *
   * AutoScalingGroup for the application
   *
   * @see {@link AutoScalingConfig}
   *
   */
  readonly autoscaling?: IAutoScalingConfig;
  /**
   *
   * Application Load Balancer for the application
   *
   * @see {@link ApplicationLoadBalancerConfig}
   *
   */
  readonly applicationLoadBalancer?: IApplicationLoadBalancerConfig;
}

type CapabilityTypeEnum = 'CAPABILITY_IAM' | 'CAPABILITY_NAMED_IAM' | 'CAPABILITY_AUTO_EXPAND';

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link CloudFormationStackConfig}*
 *
 * @description
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
export interface ICloudFormationStack {
  /**
   * CloudFormation Stack deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * The description is to used to provide more information about the stack.
   */
  readonly description?: t.NonEmptyString;
  /**
   * The friendly name that will be used as a base for the created CloudFormation Stack Name.
   * The name should not contain any spaces as this isn't supported by the Accelerator.
   */
  readonly name: t.NonEmptyString;
  /**
   * A list of AWS regions to deploy the stack to.
   */
  readonly regions: t.Region[];
  /**
   * The order to deploy the stack relative to the other stacks. Must be a positive integer.
   * To deploy stacks in parallel, set runOrder of each stack to 1.
   */
  readonly runOrder: number;
  /**
   * The file path to the template file defining the stack.
   */
  readonly template: t.NonEmptyString;
  /**
   * The parameters to pass to the stack.
   */
  readonly parameters?: t.ICfnParameter[];
  /**
   * This determines whether to enable termination protection for the stack.
   */
  readonly terminationProtection: boolean;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link CloudFormationStackSetConfig}*
 *
 * @description
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
export interface ICloudFormationStackSet {
  /**
   * The CloudFormation capabilities enabled to deploy the stackset.
   * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html}
   */
  readonly capabilities?: CapabilityTypeEnum[];
  /**
   * CloudFormation StackSet deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * The description is to used to provide more information about the stackset.
   */
  readonly description?: t.NonEmptyString;
  /**
   * The friendly name that will be used as a base for the created CloudFormation StackSet Name.
   * The name should not contain any spaces as this isn't supported by the Accelerator.
   */
  readonly name: t.NonEmptyString;
  /**
   * A list of regions to deploy the stackset.
   */
  readonly regions: t.Region[];
  /**
   * The file path to the template file used for deployment.
   */
  readonly template: t.NonEmptyString;
  /**
   * The parameters to be passed to the stackset.
   */
  readonly parameters?: t.ICfnParameter[];
  /**
   * The operational preferences of current stackset
   */
  readonly operationPreferences?: t.IOperationPreferences;
  /**
   * The other StackSets this StackSet depends on.
   * For stackset names you define here, a CloudFormation DependsOn attribute will be added between the resources.
   * Please note this does not guarantee the deployment order of the stack instances within the StackSet.
   */
  readonly dependsOn?: string[];
  /**
   * The Amazon Resource Name (ARN) of the IAM role to use when creating this stack set. This field is
   * optional. If specified, it allows you to set a custom IAM role for stack set operations. If left
   * blank, the default permissions associated with your account will be used.
   */
  readonly administrationRoleArn?: string;
  /**
   * The name of the IAM execution role to use when creating the stack set. This field is optional.
   * If provided, it allows you to specify a custom execution role for stack set operations. If
   * omitted, the default execution role associated with your account will be used.
   */
  readonly executionRoleName?: string;
}

export type PortfolioAssociationType = 'User' | 'Group' | 'Role' | 'PermissionSet';

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link PortfolioAssociationConfig}*
 *
 * @description
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
export interface IPortfolioAssociatoinConfig {
  /**
   * Indicates the type of portfolio association, valid values are: Group, User, and Role.
   */
  readonly type: PortfolioAssociationType;
  /**
   * Indicates the name of the principal to associate the portfolio with.
   */
  readonly name: t.NonEmptyString;
  /**
   * Indicates whether the principal association should be created in accounts the portfolio is shared with. Verify the IAM principal exists in all accounts the portfolio is shared with before enabling.
   *
   * @remarks
   * When you propagate a principal association, a potential privilege escalation path may occur. For a user in a recipient account who is not a Service Catalog Admin, but still has the ability to create Principals (Users/Roles), that user could create an IAM Principal that matches a principal name association for the portfolio. Although this user may not know which principal names are associated through Service Catalog, they may be able to guess the user. If this potential escalation path is a concern, then LZA recommends disabling propagation.
   */
  readonly propagateAssociation?: boolean;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link ProductConfig} / {@link ProductVersionConfig}*
 *
 * @description
 * Product Versions configuration
 *
 * @example
 * ```
 * - name: v1
 *   description: Product version 1
 *   template: path/to/template.json
 * ```
 */
export interface IProductVersionConfig {
  /**
   * Name of the version of the product
   */
  readonly name: t.NonEmptyString;
  /**
   * The product template.
   */
  readonly template: t.NonEmptyString;
  /**
   * The version description
   */
  readonly description?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link ProductConfig} / {@link ProductSupportConfig}*
 *
 * @description
 * Product Support configuration
 *
 * @example
 * ```
 * description: Product support details
 * email: support@example.com
 * url: support.example.com
 * ```
 */
export interface IProductSupportConfig {
  /**
   * The email address to report issues with the product
   */
  readonly email?: t.NonEmptyString;
  /**
   * The url to the site where users can find support information or file tickets.
   */
  readonly url?: t.NonEmptyString;
  /**
   * Support description of how users should use email contact and support link.
   */
  readonly description?: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} | {@link ProductConfig} / {@link TagOptionsConfig}*
 *
 * @description
 * Service Catalog TagOptions configuration.
 *
 * @example
 * ```
 * - key: Environment
 *   values: [Dev, Test, Prod]
 * ```
 */
export interface ITagOptionsConfig {
  /**
   * The tag key
   */
  readonly key: t.NonEmptyString;
  /**
   * An array of values that can be used for the tag key
   */
  readonly values: t.NonEmptyString[];
}

export type ProductLaunchConstraintType = 'Role' | 'LocalRole';

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} | {@link ProductConfig} / {@link ProductConstraintConfig} / {@link ProductLaunchConstraintConfig}*
 *
 * @description
 * Service Catalog Product Constraint configuration. For more information see https://docs.aws.amazon.com/servicecatalog/latest/adminguide/constraints.html
 *
 * @example
 * ```
 * constraints:
 *   launch:
 *    type: localRole | Role
 *    role: string
 *   tagUpdate: true | false
 *   notifications:
 *     - topicName
 * ```
 */
export interface IProductLaunchConstraintConfig {
  /**
   * The type of launch constraint, either Role or LocalRole. For more information, see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-servicecatalog-launchroleconstraint.html
   */
  readonly type: ProductLaunchConstraintType;
  /**
   * The name of the IAM Role.
   */
  readonly role: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} | {@link ProductConfig} / {@link ProductConstraintConfig}*
 *
 * @description
 * Service Catalog Product Constraint configuration. For more information see https://docs.aws.amazon.com/servicecatalog/latest/adminguide/constraints.html
 *
 * @example
 * ```
 * constraints:
 *   launch:
 *    type: localRole | Role
 *    role: string
 *   tagUpdate: true | false
 *   notifications:
 *     - topicName
 * ```
 */
export interface IProductConstraintConfig {
  /**
   * Launch constraint role name and type, supports LocalRole or Role.
   */
  readonly launch?: IProductLaunchConstraintConfig;
  /**
   * Determines if Service Catalog Tag Update constraint is enabled
   */
  readonly tagUpdate?: boolean;
  /**
   * A list of SNS topic names to stream product notifications to
   *
   * @remarks
   * The SNS Topic must exist in the same account and region. SNS Topic names are not validated, please ensure the SNS Topic exists in the account.
   */
  readonly notifications?: t.NonEmptyString[];
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig} / {@link ProductConfig}*
 *
 * @description
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
 *   constraints:
 *     launch:
 *       type: localRole | Role
 *       role: string
 *     tagUpdate: true | false
 *     notifications:
 *       - topicName
 * ```
 */
export interface IProductConfig {
  /**
   * The name of the product
   */
  readonly name: t.NonEmptyString;
  /**
   * The owner of the product
   */
  readonly owner: t.NonEmptyString;
  /**
   * Product version configuration
   */
  readonly versions: IProductVersionConfig[];
  /**
   * Product description
   */
  readonly description?: t.NonEmptyString;
  /**
   * The name of the product's publisher.
   */
  readonly distributor?: t.NonEmptyString;
  /**
   * Product support details.
   */
  readonly support?: IProductSupportConfig;
  /**
   * Product TagOptions configuration
   */
  readonly tagOptions?: ITagOptionsConfig[];
  /**
   * Product Constraint configuration
   */
  readonly constraints?: IProductConstraintConfig;
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig} / {@link PortfolioConfig}*
 *
 * @description
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
 *       constraints:
 *         launch:
 *          type: localRole | Role
 *          role: roleName
 *         tagUpdate: true | false
 *         notifications:
 *           - topicName
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
export interface IPortfolioConfig {
  /**
   * The name of the portfolio
   */
  readonly name: t.NonEmptyString;
  /**
   * The name of the account to deploy the portfolio.
   */
  readonly account: t.NonEmptyString;
  /**
   * The region names to deploy the portfolio.
   */
  readonly regions: t.Region[];
  /**
   * The provider of the portfolio
   */
  readonly provider: t.NonEmptyString;
  /**
   * Configuration of portfolio associations to give access to IAM principals.
   */
  readonly portfolioAssociations?: IPortfolioAssociatoinConfig[];
  /**
   * Product Configuration
   */
  readonly products?: IProductConfig[];
  /**
   * Portfolio share target. Sharing portfolios to Organizational Units is only supported for portfolios in the Management account.
   *
   * @remarks
   * Valid values are the friendly names of organizational unit(s) and/or account(s).
   *
   */
  readonly shareTargets?: t.IShareTargets;
  /**
   * Whether or not to share TagOptions with other account(s)/OU(s)
   *
   * @remarks
   * This property is only applicable if the `shareTargets` property is defined
   */
  readonly shareTagOptions?: boolean;
  /**
   * Portfolio TagOptions configuration
   */
  readonly tagOptions?: ITagOptionsConfig[];
}

export interface IServiceCatalogConfig {
  readonly portfolios: IPortfolioConfig[];
}

/**
 * *{@link CustomizationsConfig} / {@link CustomizationConfig}*
 *
 * @description
 * Defines CloudFormation Stacks and StackSets to be deployed to the environment.
 * This feature supports the deployment of customer-provided CloudFormation templates to AWS
 * accounts and/or organizational units. These deployments can leverage independent CloudFormation stacks
 * or CloudFormation StackSets depending on the customer's deployment preference.
 *
 */
export interface ICustomizationConfig {
  readonly createCfnStackSetExecutionRole?: boolean;
  readonly cloudFormationStacks?: ICloudFormationStack[];
  readonly cloudFormationStackSets?: ICloudFormationStackSet[];
  readonly serviceCatalogPortfolios?: IPortfolioConfig[];
}

/**
 * *{@link CustomizationsConfig} / {@link Ec2FirewallConfig} / {@link Ec2FirewallInstanceConfig} | {@link Ec2FirewallAutoScalingGroupConfig} / {@link FirewallStaticReplacementsConfig}*
 *
 * @description
 * Firewall Static Replacements Config
 *
 * @example
 * ```
 * - key: CORP_CIDR_RANGE
 *   value: 10.0.0.0/16
 * ```
 */
export interface IFirewallStaticReplacementsConfig {
  /**
   * The key name for the static replacement
   */
  readonly key: t.NonEmptyString;
  /**
   * The value of the static replacement
   */
  readonly value: t.NonEmptyString;
}

/**
 * *{@link CustomizationsConfig} / {@link Ec2FirewallConfig} / {@link Ec2FirewallInstanceConfig}*
 *
 * @description
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
export interface IEc2FirewallInstanceConfig {
  /**
   * The friendly name of the firewall instance
   *
   * @remarks
   * **CAUTION**: Changing values under this property after initial deployment will cause an instance replacement.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * The launch template for the firewall instance
   *
   * @remarks
   * **CAUTION**: Changing values under this property after initial deployment will cause an instance replacement.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly launchTemplate: ILaunchTemplateConfig;
  /**
   * The friendly name of the VPC to deploy the firewall instance to
   *
   * @remarks
   * This VPC must contain the subnet(s) defined for the network interfaces under the `launchTemplate` property
   */
  readonly vpc: t.NonEmptyString;
  /**
   * (OPTIONAL) The logical name of the account to deploy the firewall instance to
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify a relative S3 object path to pull a firewall configuration file from.
   *
   * For example, if your S3 object path is `s3://path/to/config.txt`, specify `path/to/config.txt` for this property.
   *
   * **NOTE:** The custom resource backing this feature does not force update on every core pipeline run. To update the resource,
   * update the name of the configuration file.
   *
   * @remarks
   * Setting this property allows you to make use of firewall configuration replacements. This allows you to
   * configure your firewall instance dynamically using values determined at CDK runtime.
   *
   * **NOTE**: The configuration file must be uploaded to the accelerator-created assets bucket in the home region of
   * your Management account. This is the `${AcceleratorPrefix}-assets` bucket, not the `cdk-accel-assets` bucket.
   *
   * The transformed configuration file will be uploaded to `${AcceleratorPrefix}-firewall-config` bucket in the account and region your firewall instance
   * is deployed to. This config file can be consumed by third-party firewall vendors that support pulling a configuration file from S3.
   *
   * Supported replacements:
   * * Hostname replacement - look up the name of the firewall instance
   *   * Format: `${ACCEL_LOOKUP::EC2:INSTANCE:HOSTNAME}` -- translates to the logical name of the instance as configured in customizations-config.yaml.
   * * VPC replacements - look up metadata about the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:VPC:<METADATA_TYPE>_<INDEX>}`, where `<METADATA_TYPE>` is a type listed below,
   * and `<INDEX>` is the index of the VPC CIDR range.
   *   * Metadata types:
   *     * CIDR - the VPC CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the VPC CIDR (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the VPC CIDR (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the VPC CIDR (i.e. 10.0.0.1)
   *   * Index numbering is zero-based, so the primary VPC CIDR is index `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:VPC:CIDR_0}` - translates to the primary CIDR range of the VPC
   * * Subnet replacements - look up metadata about subnets in the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:SUBNET:<METADATA_TYPE>:<SUBNET_NAME>}`, where `<METADATA_TYPE>` is a type listed
   * below, and `<SUBNET_NAME>` is the logical name of the subnet as defined in `network-config.yaml`.
   *   * Metadata types:
   *     * CIDR - the subnet CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the subnet (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the subnet (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the subnet (i.e. 10.0.0.1)
   *   * Example usage: `${ACCEL_LOOKUP::EC2:SUBNET:CIDR:firewall-data-subnet-a}` - translates to the CIDR range of a subnet named `firewall-data-subnet-a`
   * * Network interface IP replacements - look up public and private IP addresses assigned to firewall network interfaces:
   *   * Format: `${ACCEL_LOOKUP::EC2:ENI_<ENI_INDEX>:<IP_TYPE>_<IP_INDEX>}`, where `<ENI_INDEX>` is the device index
   * of the network interface as defined in the firewall launch template, `<IP_TYPE>` is either a public or private IP of the interface,
   * and `<IP_INDEX>` is the index of the interface IP address.
   *   * IP types:
   *     * PRIVATEIP - a private IP associated with the interface
   *     * PUBLICIP - a public IP associated with the interface
   *   * Index numbering is zero-based, so the primary interface of the instance is `0` and its primary IP address is also `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:ENI_0:PRIVATEIP_0}` - translates to the primary private IP address of the primary network interface
   * * Network interface subnet replacements - look up metadata about the subnet a network interface is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:ENI_<ENI_INDEX>:SUBNET_<METADATA_TYPE>}`, where `<ENI_INDEX>` is the device index
   * of the network interface as defined in the firewall launch template and `<METADATA_TYPE>` is a type listed below.
   *   * Metadata types:
   *     * CIDR - the subnet CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the subnet (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the subnet (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the subnet (i.e. 10.0.0.1)
   *   * Index numbering is zero-based, so the primary interface of the instance is `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_CIDR}` - translates to the subnet CIDR range of the primary network interface
   * * VPN replacements - look up metadata about VPNs that are directly connected to the EC2 firewall instance. NOTE: these replacements are
   * only supported for EC2 firewalls that are referenced in a {@link CustomerGatewayConfig} in network-config.yaml.
   *   * Format: `${ACCEL_LOOKUP::EC2:VPN:<METADATA_TYPE>:<VPN_NAME>}`, where `<METADATA_TYPE>` is a type listed
   * below, and `<VPN_NAME>` is the logical name of the VPN connection as defined in `network-config.yaml`.
   *   * Metadata types:
   *     * AWS_BGPASN - the BGP autonomous system number (ASN) of the AWS gateway device
   *     * CGW_BGPASN - the BGP autonomous system number (ASN) of the customer gateway device
   *     * CGW_OUTSIDEIP - the outside (public) IP address of the customer gateway device
   *     * AWS_INSIDEIP_<TUNNEL_INDEX> - the inside (link-local) IP address of the AWS gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * CGW_INSIDEIP_<TUNNEL_INDEX> - the inside (link-local) IP address of the customer gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * AWS_OUTSIDEIP_<TUNNEL_INDEX> - the outside (public) IP address of the AWS gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * INSIDE_CIDR_<TUNNEL_INDEX> - the inside (link-local) CIDR range of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * INSIDE_NETMASK_<TUNNEL_INDEX> - the inside (link-local) subnet mask of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * PSK_<TUNNEL_INDEX> - the pre-shared key of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *   * Index numbering is zero-based, so the primary VPN tunnel is `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:VPN:AWS_OUTSIDEIP_0:accelerator-vpn}` - translates to the AWS-side public IP of the primary VPN tunnel for a VPN named `accelerator-vpn`
   *
   * * For replacements that are supported in firewall userdata, see {@link LaunchTemplateConfig.userData}.
   */
  readonly configFile?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify a relative S3 directory path to pull a firewall configuration directory.
   *
   * Either configFile or configDir can be set but not both.
   *
   * For example, if your S3 folder path is `s3://path/to/config`, specify `path/to/config` for this property.
   *
   * **NOTE:** The custom resource backing this feature does not force update on every core pipeline run. To update the resource,
   * update the name of the configuration directory.
   *
   * @remarks
   * Setting this property allows you to make use of firewall configuration replacements. This allows you to
   * configure your firewall instance dynamically using values determined at CDK runtime.
   *
   * **NOTE**: The configuration directory must be uploaded to the accelerator-created assets bucket in the home region of
   * your Management account. This is the `${AcceleratorPrefix}-assets` bucket, not the `cdk-accel-assets` bucket.
   *
   * The transformed configuration directory will be uploaded to `${AcceleratorPrefix}-firewall-config` bucket in the account and region your firewall instance
   * is deployed to. This config directory can be consumed by third-party firewall vendors that support pulling a configuration directory from S3.
   *
   * Supported replacements:
   * * Hostname replacement - look up the name of the firewall instance
   *   * Format: `${ACCEL_LOOKUP::EC2:INSTANCE:HOSTNAME}` -- translates to the logical name of the instance as configured in customizations-config.yaml.
   * * VPC replacements - look up metadata about the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:VPC:<METADATA_TYPE>_<INDEX>}`, where `<METADATA_TYPE>` is a type listed below,
   * and `<INDEX>` is the index of the VPC CIDR range.
   *   * Metadata types:
   *     * CIDR - the VPC CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the VPC CIDR (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the VPC CIDR (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the VPC CIDR (i.e. 10.0.0.1)
   *   * Index numbering is zero-based, so the primary VPC CIDR is index `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:VPC:CIDR_0}` - translates to the primary CIDR range of the VPC
   * * Subnet replacements - look up metadata about subnets in the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:SUBNET:<METADATA_TYPE>:<SUBNET_NAME>}`, where `<METADATA_TYPE>` is a type listed
   * below, and `<SUBNET_NAME>` is the logical name of the subnet as defined in `network-config.yaml`.
   *   * Metadata types:
   *     * CIDR - the subnet CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the subnet (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the subnet (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the subnet (i.e. 10.0.0.1)
   *   * Example usage: `${ACCEL_LOOKUP::EC2:SUBNET:CIDR:firewall-data-subnet-a}` - translates to the CIDR range of a subnet named `firewall-data-subnet-a`
   * * Network interface IP replacements - look up public and private IP addresses assigned to firewall network interfaces:
   *   * Format: `${ACCEL_LOOKUP::EC2:ENI_<ENI_INDEX>:<IP_TYPE>_<IP_INDEX>}`, where `<ENI_INDEX>` is the device index
   * of the network interface as defined in the firewall launch template, `<IP_TYPE>` is either a public or private IP of the interface,
   * and `<IP_INDEX>` is the index of the interface IP address.
   *   * IP types:
   *     * PRIVATEIP - a private IP associated with the interface
   *     * PUBLICIP - a public IP associated with the interface
   *   * Index numbering is zero-based, so the primary interface of the instance is `0` and its primary IP address is also `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:ENI_0:PRIVATEIP_0}` - translates to the primary private IP address of the primary network interface
   * * Network interface subnet replacements - look up metadata about the subnet a network interface is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:ENI_<ENI_INDEX>:SUBNET_<METADATA_TYPE>}`, where `<ENI_INDEX>` is the device index
   * of the network interface as defined in the firewall launch template and `<METADATA_TYPE>` is a type listed below.
   *   * Metadata types:
   *     * CIDR - the subnet CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the subnet (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the subnet (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the subnet (i.e. 10.0.0.1)
   *   * Index numbering is zero-based, so the primary interface of the instance is `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_CIDR}` - translates to the subnet CIDR range of the primary network interface
   * * VPN replacements - look up metadata about VPNs that are directly connected to the EC2 firewall instance. NOTE: these replacements are
   * only supported for EC2 firewalls that are referenced in a {@link CustomerGatewayConfig} in network-config.yaml.
   *   * Format: `${ACCEL_LOOKUP::EC2:VPN:<METADATA_TYPE>:<VPN_NAME>}`, where `<METADATA_TYPE>` is a type listed
   * below, and `<VPN_NAME>` is the logical name of the VPN connection as defined in `network-config.yaml`.
   *   * Metadata types:
   *     * AWS_BGPASN - the BGP autonomous system number (ASN) of the AWS gateway device
   *     * CGW_BGPASN - the BGP autonomous system number (ASN) of the customer gateway device
   *     * CGW_OUTSIDEIP - the outside (public) IP address of the customer gateway device
   *     * AWS_INSIDEIP_<TUNNEL_INDEX> - the inside (link-local) IP address of the AWS gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * CGW_INSIDEIP_<TUNNEL_INDEX> - the inside (link-local) IP address of the customer gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * AWS_OUTSIDEIP_<TUNNEL_INDEX> - the outside (public) IP address of the AWS gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * INSIDE_CIDR_<TUNNEL_INDEX> - the inside (link-local) CIDR range of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * INSIDE_NETMASK_<TUNNEL_INDEX> - the inside (link-local) subnet mask of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * PSK_<TUNNEL_INDEX> - the pre-shared key of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *   * Index numbering is zero-based, so the primary VPN tunnel is `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:VPN:AWS_OUTSIDEIP_0:accelerator-vpn}` - translates to the AWS-side public IP of the primary VPN tunnel for a VPN named `accelerator-vpn`
   * * AWS Secrets Manager Secret replacements - look up the secret from AWS Secrets Manager secret in management account. The secret must be stored in the same region the firewall is deployed to.
   *   * Format: `${ACCEL_LOOKUP::SECRETS_MANAGER:<SECRET_NAME>}` -- translates to the secure string from AWS Secrets Manager secret.
   *
   * * For replacements that are supported in firewall userdata, see {@link LaunchTemplateConfig.userData}.
   */
  readonly configDir?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify true to enable detailed monitoring. Otherwise, basic monitoring is enabled.
   */
  readonly detailedMonitoring?: boolean;
  /**
   * (OPTIONAL) Specify a relative S3 object path to pull a firewall license file from.
   *
   * For example, if your S3 object path is `s3://path/to/license.lic`, specify `path/to/license.lic` for this property.
   *
   * **NOTE:** The custom resource backing this feature does not force update on every core pipeline run. To update the resource,
   * update the name of the license file.
   *
   * @remarks
   * The license file must be uploaded to the accelerator-created assets bucket in the home region of
   * your Management account. This is the `${AcceleratorPrefix}-assets` bucket, not the `cdk-accel-assets` bucket.
   *
   * The license file will be uploaded to `${AcceleratorPrefix}-firewall-config` bucket in the account and region your firewall instance
   * is deployed to. This license file can be consumed by third-party firewall vendors that support pulling a license file from S3.
   *
   * * For replacements that are supported in firewall userdata, see {@link LaunchTemplateConfig.userData}.
   */
  readonly licenseFile?: t.NonEmptyString;
  /**
   * (OPTIONAL) Static firewall configuration replacements definition.
   *
   * @remarks
   * Use this property to define static key/value pairs that can be referenced as variables in firewall configuration files.
   *
   * If setting this property, the `configFile` or `configDir` property MUST also be set.
   *
   * Replacement syntax:
   * * Format: `${ACCEL_LOOKUP::CUSTOM:<KEY>}`, where `<KEY>` is the key name for the replacement as defined in `customizations-config.yaml`.
   * * Example usage: `${ACCEL_LOOKUP::CUSTOM:CORP_CIDR_RANGE}` - translates to the static value entered for CORP_CIDR_RANGE.
   *
   * @see {@link Ec2FirewallInstanceConfig.configFile}
   * @see {@link Ec2FirewallInstanceConfig.configDir}
   */
  readonly staticReplacements?: IFirewallStaticReplacementsConfig[];
  /**
   * (OPTIONAL) If you set this parameter to true , you can't terminate the instance using the Amazon EC2 console, CLI, or API.
   *
   * More information: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/terminating-instances.html#Using_ChangingDisableAPITermination
   *
   * @remarks
   * When finished configuring your firewall instance, it is highly recommended to enable this property in order to prevent
   * accidental instance replacement or termination.
   */
  readonly terminationProtection?: boolean;
  /**
   * (OPTIONAL) An array of tags
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link CustomizationsConfig} / {@link Ec2FirewallConfig} / {@link Ec2FirewallAutoScalingGroupConfig}*
 *
 * @description
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
 *     maxInstanceLifetime: 86400
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
export interface IEc2FirewallAutoScalingGroupConfig {
  /**
   * The friendly name of the firewall instance
   *
   * @remarks
   * **CAUTION**: Changing values under this property after initial deployment will cause an autoscaling group replacement.
   * Please be aware that any downstream dependencies may cause this property update to fail.
   */
  readonly name: t.NonEmptyString;
  /**
   * An AutoScaling Group configuration
   */
  readonly autoscaling: IAutoScalingConfig;
  /**
   * The launch template for the firewall instance
   *
   * @remarks
   * **CAUTION**: Changing values under this property after initial deployment will cause instance replacements
   * in your autoscaling group. This will not impact downstream dependencies, but may impact your network connectivity
   * and/or throughput.
   */
  readonly launchTemplate: ILaunchTemplateConfig;
  /**
   * The friendly name of the VPC to deploy the firewall instance to
   *
   * @remarks
   * This VPC must contain the subnet(s) defined for the network interfaces under the `launchTemplate` property
   */
  readonly vpc: t.NonEmptyString;
  /**
   * (OPTIONAL) The logical name of the account to deploy the firewall autoscaling group to
   *
   * @remarks
   * This is the logical `name` property of the account as defined in accounts-config.yaml.
   */
  readonly account?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify a relative S3 object path to pull a firewall configuration file from.
   *
   * For example, if your S3 object path is `s3://path/to/config.txt`, specify `path/to/config.txt` for this property.
   *
   * **NOTE:** The custom resource backing this feature does not force update on every core pipeline run. To update the resource,
   * update the name of the configuration file.
   *
   * @remarks
   * Setting this property allows you to make use of firewall configuration replacements. This allows you to
   * configure your firewall instance dynamically using values determined at CDK runtime.
   *
   * **NOTE**: The configuration file must be uploaded to the accelerator-created assets bucket in the home region of
   * your Management account. This is the `${AcceleratorPrefix}-assets` bucket, not the `cdk-accel-assets` bucket.
   *
   * The transformed configuration file will be uploaded to `${AcceleratorPrefix}-firewall-config` bucket in the account and region your firewall instance
   * is deployed to. This config file can be consumed by third-party firewall vendors that support pulling a configuration file from S3.
   *
   * Supported replacements:
   * * VPC replacements - look up metadata about the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:VPC:<METADATA_TYPE>_<INDEX>}`, where `<METADATA_TYPE>` is a type listed below,
   * and `<INDEX>` is the index of the VPC CIDR range.
   *   * Metadata types:
   *     * CIDR - the VPC CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the VPC CIDR (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the VPC CIDR (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the VPC CIDR (i.e. 10.0.0.1)
   *   * Index numbering is zero-based, so the primary VPC CIDR is index `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:VPC:CIDR_0}` - translates to the primary CIDR range of the VPC
   * * Subnet replacements - look up metadata about subnets in the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:SUBNET:<METADATA_TYPE>:<SUBNET_NAME>}`, where `<METADATA_TYPE>` is a type listed
   * below, and `<SUBNET_NAME>` is the logical name of the subnet as defined in `network-config.yaml`.
   *   * Metadata types:
   *     * CIDR - the subnet CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the subnet (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the subnet (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the subnet (i.e. 10.0.0.1)
   *   * Example usage: `${ACCEL_LOOKUP::EC2:SUBNET:CIDR:firewall-data-subnet-a}` - translates to the CIDR range of a subnet named `firewall-data-subnet-a`
   * * Hostname, network interface, and VPN replacements are NOT supported for firewall AutoScaling groups.
   *
   * For replacements that are supported in firewall userdata, see {@link LaunchTemplateConfig.userData}.
   */
  readonly configFile?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify a relative S3 directory path to pull a firewall configuration directory.
   *
   * Either configFile or configDir can be set but not both.
   *
   * For example, if your S3 folder path is `s3://path/to/config`, specify `path/to/config` for this property.
   *
   * **NOTE:** The custom resource backing this feature does not force update on every core pipeline run. To update the resource,
   * update the name of the configuration directory.
   *
   * @remarks
   * Setting this property allows you to make use of firewall configuration replacements. This allows you to
   * configure your firewall instance dynamically using values determined at CDK runtime.
   *
   * **NOTE**: The configuration directory must be uploaded to the accelerator-created assets bucket in the home region of
   * your Management account. This is the `${AcceleratorPrefix}-assets` bucket, not the `cdk-accel-assets` bucket.
   *
   * The transformed configuration directory will be uploaded to `${AcceleratorPrefix}-firewall-config` bucket in the account and region your firewall instance
   * is deployed to. This config directory can be consumed by third-party firewall vendors that support pulling a configuration directory from S3.
   *
   * Supported replacements:
   * * Hostname replacement - look up the name of the firewall instance
   *   * Format: `${ACCEL_LOOKUP::EC2:INSTANCE:HOSTNAME}` -- translates to the logical name of the instance as configured in customizations-config.yaml.
   * * VPC replacements - look up metadata about the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:VPC:<METADATA_TYPE>_<INDEX>}`, where `<METADATA_TYPE>` is a type listed below,
   * and `<INDEX>` is the index of the VPC CIDR range.
   *   * Metadata types:
   *     * CIDR - the VPC CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the VPC CIDR (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the VPC CIDR (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the VPC CIDR (i.e. 10.0.0.1)
   *   * Index numbering is zero-based, so the primary VPC CIDR is index `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:VPC:CIDR_0}` - translates to the primary CIDR range of the VPC
   * * Subnet replacements - look up metadata about subnets in the VPC the firewall is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:SUBNET:<METADATA_TYPE>:<SUBNET_NAME>}`, where `<METADATA_TYPE>` is a type listed
   * below, and `<SUBNET_NAME>` is the logical name of the subnet as defined in `network-config.yaml`.
   *   * Metadata types:
   *     * CIDR - the subnet CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the subnet (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the subnet (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the subnet (i.e. 10.0.0.1)
   *   * Example usage: `${ACCEL_LOOKUP::EC2:SUBNET:CIDR:firewall-data-subnet-a}` - translates to the CIDR range of a subnet named `firewall-data-subnet-a`
   * * Network interface IP replacements - look up public and private IP addresses assigned to firewall network interfaces:
   *   * Format: `${ACCEL_LOOKUP::EC2:ENI_<ENI_INDEX>:<IP_TYPE>_<IP_INDEX>}`, where `<ENI_INDEX>` is the device index
   * of the network interface as defined in the firewall launch template, `<IP_TYPE>` is either a public or private IP of the interface,
   * and `<IP_INDEX>` is the index of the interface IP address.
   *   * IP types:
   *     * PRIVATEIP - a private IP associated with the interface
   *     * PUBLICIP - a public IP associated with the interface
   *   * Index numbering is zero-based, so the primary interface of the instance is `0` and its primary IP address is also `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:ENI_0:PRIVATEIP_0}` - translates to the primary private IP address of the primary network interface
   * * Network interface subnet replacements - look up metadata about the subnet a network interface is deployed to:
   *   * Format: `${ACCEL_LOOKUP::EC2:ENI_<ENI_INDEX>:SUBNET_<METADATA_TYPE>}`, where `<ENI_INDEX>` is the device index
   * of the network interface as defined in the firewall launch template and `<METADATA_TYPE>` is a type listed below.
   *   * Metadata types:
   *     * CIDR - the subnet CIDR range in CIDR notation (i.e. 10.0.0.0/16)
   *     * NETMASK - the network mask of the subnet (i.e. 255.255.0.0)
   *     * NETWORKIP - the network address of the subnet (i.e. 10.0.0.0)
   *     * ROUTERIP - the VPC router address of the subnet (i.e. 10.0.0.1)
   *   * Index numbering is zero-based, so the primary interface of the instance is `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_CIDR}` - translates to the subnet CIDR range of the primary network interface
   * * VPN replacements - look up metadata about VPNs that are directly connected to the EC2 firewall instance. NOTE: these replacements are
   * only supported for EC2 firewalls that are referenced in a {@link CustomerGatewayConfig} in network-config.yaml.
   *   * Format: `${ACCEL_LOOKUP::EC2:VPN:<METADATA_TYPE>:<VPN_NAME>}`, where `<METADATA_TYPE>` is a type listed
   * below, and `<VPN_NAME>` is the logical name of the VPN connection as defined in `network-config.yaml`.
   *   * Metadata types:
   *     * AWS_BGPASN - the BGP autonomous system number (ASN) of the AWS gateway device
   *     * CGW_BGPASN - the BGP autonomous system number (ASN) of the customer gateway device
   *     * CGW_OUTSIDEIP - the outside (public) IP address of the customer gateway device
   *     * AWS_INSIDEIP_<TUNNEL_INDEX> - the inside (link-local) IP address of the AWS gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * CGW_INSIDEIP_<TUNNEL_INDEX> - the inside (link-local) IP address of the customer gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * AWS_OUTSIDEIP_<TUNNEL_INDEX> - the outside (public) IP address of the AWS gateway device, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * INSIDE_CIDR_<TUNNEL_INDEX> - the inside (link-local) CIDR range of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * INSIDE_NETMASK_<TUNNEL_INDEX> - the inside (link-local) subnet mask of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *     * PSK_<TUNNEL_INDEX> - the pre-shared key of the tunnel, where <TUNNEL_INDEX> is the index number of the VPN tunnel
   *   * Index numbering is zero-based, so the primary VPN tunnel is `0`.
   *   * Example usage: `${ACCEL_LOOKUP::EC2:VPN:AWS_OUTSIDEIP_0:accelerator-vpn}` - translates to the AWS-side public IP of the primary VPN tunnel for a VPN named `accelerator-vpn`
   * * AWS Secrets Manager Secret replacements - look up the secret from AWS Secrets Manager secret in management account. The secret must be stored in the same region the firewall is deployed to.
   *   * Format: `${ACCEL_LOOKUP::SECRETS_MANAGER:<SECRET_NAME>}` -- translates to the secure string from AWS Secrets Manager secret.
   *
   * * For replacements that are supported in firewall userdata, see {@link LaunchTemplateConfig.userData}.
   */
  readonly configDir?: t.NonEmptyString;
  /**
   * (OPTIONAL) Specify a relative S3 object path to pull a firewall license file from.
   *
   * For example, if your S3 object path is `s3://path/to/license.lic`, specify `path/to/license.lic` for this property.
   *
   * **NOTE:** The custom resource backing this feature does not force update on every core pipeline run. To update the resource,
   * update the name of the license file.
   *
   * @remarks
   * The license file must be uploaded to the accelerator-created assets bucket in the home region of
   * your Management account. This is the `${AcceleratorPrefix}-assets` bucket, not the `cdk-accel-assets` bucket.
   *
   * The license file will be uploaded to `${AcceleratorPrefix}-firewall-config` bucket in the account and region your firewall instance
   * is deployed to. This license file can be consumed by third-party firewall vendors that support pulling a license file from S3.
   *
   * * For replacements that are supported in firewall userdata, see {@link LaunchTemplateConfig.userData}.
   */
  readonly licenseFile?: t.NonEmptyString;
  /**
   * (OPTIONAL) Static firewall configuration replacements definition.
   *
   * @remarks
   * Use this property to define static key/value pairs that can be referenced as replacement variables in firewall configuration files.
   *
   * If setting this property, the `configFile` or `configDir` property MUST also be set.
   *
   * Replacement syntax:
   * * Format: `${ACCEL_LOOKUP::CUSTOM:<KEY>}`, where `<KEY>` is the key name for the replacement as defined in `customizations-config.yaml`.
   * * Example usage: `${ACCEL_LOOKUP::CUSTOM:CORP_CIDR_RANGE}` - translates to the static value entered for CORP_CIDR_RANGE.
   *
   * @see {@link Ec2FirewallAutoScalingGroupConfig.configFile}
   * @see {@link Ec2FirewallAutoScalingGroupConfig.configDir}
   */
  readonly staticReplacements?: IFirewallStaticReplacementsConfig[];
  /**
   * (OPTIONAL) An array of tags
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link CustomizationsConfig} / {@link Ec2FirewallConfig}*
 *
 * @description
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
 *       maxInstanceLifetime: 86400
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
export interface IEc2FirewallConfig {
  /**
   * Define EC2-based firewall instances in autoscaling groups
   */
  readonly autoscalingGroups?: IEc2FirewallAutoScalingGroupConfig[];
  /**
   * Define EC2-based firewall standalone instances
   */
  readonly instances?: IEc2FirewallInstanceConfig[];
  /**
   * Define EC2-based firewall management instances
   */
  readonly managerInstances?: IEc2FirewallInstanceConfig[];
  /**
   * Define target groups for EC2-based firewalls
   */
  readonly targetGroups?: ITargetGroupItem[];
}

/**
 * *{@link CustomizationsConfig}*
 *
 * @description
 * Defines custom CloudFormation and external web and application tier resources. We recommend creating resources
 * with native LZA features where possible.
 *
 */
export interface ICustomizationsConfig {
  /**
   * Defines whether or not the StackSetExecution role is created in all workload accounts
   * and if the StackSetAdmin role is created in the management account.
   * If you are using stacksets and set the value to false, you will need
   * to ensure that the roles are created.
   *
   * Default value is true.
   */
  readonly createCfnStackSetExecutionRole?: boolean;
  readonly customizations?: ICustomizationConfig;
  readonly applications?: IAppConfigItem[];
  readonly firewalls?: IEc2FirewallConfig;
}
