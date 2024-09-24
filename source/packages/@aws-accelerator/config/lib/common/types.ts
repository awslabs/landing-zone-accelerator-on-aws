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

import { RegionName } from '@aws-accelerator/utils/lib/regions';

/**
 * AWS Region
 */
export type Region = keyof typeof RegionName;

export interface IDeploymentTargets {
  organizationalUnits?: string[];
  accounts?: string[];
  excludedRegions?: string[];
  excludedAccounts?: string[];
}

/**
 * Imported Bucket configuration with S3 managed key encryption.
 *
 * @remarks Use this configuration to use existing bucket, a bucket not created by accelerator solution.
 */
export interface IImportedS3ManagedEncryptionKeyBucketConfig {
  /**
   * Imported bucket name
   */
  name: NonEmptyString;
  /**
   * Flag indicating Accelerator to apply solution generated policy to imported bucket.
   *
   * @remarks
   * Accelerator solution creates bucket resource policy based on various security services enabled by the solution.
   * Example when macie is enabled, macie service will need access to the bucket,
   * accelerator solution dynamically generate policy statements based on various services require access to the bucket.
   *
   * Default value is false, accelerator managed policy will NOT be applied to bucket resource policy.
   * When external policy files are provided through s3ResourcePolicyAttachments policy files,
   * solution will add policies from the files to the imported bucket resource policy.
   * If no external policy files are provided and value for this parameter is left to false, solution will not make changes to bucket resource policy.
   * When value is set to true, accelerator solution will replace bucket resource policy with accelerator managed policies along with policies from external policy files if provided.
   *
   */
  applyAcceleratorManagedBucketPolicy?: boolean;
}

export class ImportedS3ManagedEncryptionKeyBucketConfig implements IImportedS3ManagedEncryptionKeyBucketConfig {
  readonly name: string = '';
  readonly applyAcceleratorManagedBucketPolicy: boolean | undefined = undefined;
}

/**
 * Custom policy overrides configuration for S3 resource policy
 *
 * @remarks Use this configuration to use provide files with JSON string to override bucket resource policy.
 */
export interface ICustomS3ResourcePolicyOverridesConfig {
  /**
   * S3 resource policy file
   *
   * @remarks
   * S3 resource policy file containing JSON string with policy statements. Solution will overwrite bucket resource policy with the context of the file.
   */
  policy?: NonEmptyString;
}

export class CustomS3ResourcePolicyOverridesConfig implements ICustomS3ResourcePolicyOverridesConfig {
  readonly policy: string | undefined = undefined;
}

/**
 * Imported Bucket configuration with CMK enabled.
 */
export interface IImportedCustomerManagedEncryptionKeyBucketConfig {
  /**
   * Imported bucket name
   */
  name: NonEmptyString;
  /**
   * Flag indicating Accelerator to apply solution generated policy to imported bucket.
   *
   * @remarks
   * Accelerator solution creates bucket resource policy based on various security services enabled by the solution.
   * Example when macie is enabled, macie service will need access to the bucket,
   * accelerator solution dynamically generate policy statements based on various services require access to the bucket.
   *
   * Default value is false, accelerator managed policy will NOT be applied to bucket resource policy.
   * When external policy files are provided through s3ResourcePolicyAttachments policy files,
   * solution will add policies from the files to the imported bucket resource policy.
   * If no external policy files are provided and value for this parameter is left to false, solution will not make changes to bucket resource policy.
   * When value is set to true, accelerator solution will replace bucket resource policy with accelerator managed policies along with policies from external policy files if provided.
   *
   */
  applyAcceleratorManagedBucketPolicy?: boolean;
  /**
   * Flag indicating solution should create CMK and apply to imported bucket.
   *
   * @remarks
   * When the value is false, solution will not create KSM key, instead existing bucket encryption will be used and modified based on other parameters.
   * When the value is true, solution will create KMS key and apply solution managed policy to the key.
   * Once Accelerator pipeline executed with the value set to true, changing the value back to false, will case stack failure.
   * Set this value to true when this will no longer be changed to false.
   *
   * @default
   * false
   */
  createAcceleratorManagedKey?: boolean;
}

export class ImportedCustomerManagedEncryptionKeyBucketConfig
  implements IImportedCustomerManagedEncryptionKeyBucketConfig
{
  readonly name: string = '';
  readonly applyAcceleratorManagedBucketPolicy: boolean | undefined = undefined;
  readonly createAcceleratorManagedKey: boolean | undefined = undefined;
}

/**
 * Custom policy overrides configuration for S3 resource and KMS
 */
export interface ICustomS3ResourceAndKmsPolicyOverridesConfig {
  /**
   * S3 resource policy file
   *
   * @remarks
   * S3 resource policy file containing JSON string with policy statements. Solution will overwrite bucket resource policy with the context of the file.
   */
  s3Policy?: NonEmptyString;
  /**
   * KMS policy file
   *
   * @remarks
   * S3 bucket encryption policy file containing JSON string with policy statements. Solution will overwrite bucket encryption key policy with the context of the file.
   */
  kmsPolicy?: NonEmptyString;
}

/**
 * Custom policy overrides configuration  for S3 resource and KMS
 *
 * @remarks Use this configuration to use provide files with JSON string to override bucket and KSM key policy.
 */
export class CustomS3ResourceAndKmsPolicyOverridesConfig implements ICustomS3ResourceAndKmsPolicyOverridesConfig {
  readonly s3Policy: string | undefined = undefined;
  readonly kmsPolicy: string | undefined = undefined;
}

/**
 * Deployment targets configuration.
 * Deployment targets is an accelerator-specific
 * configuration object that can be used for
 * resources provisioned by the accelerator.
 * Deployment targets allow you to specify
 * multiple accounts and/or organizational units (OUs)
 * as targets for resource deployment.
 *
 * The following example would deploy a resource
 * to all accounts in the organization except the
 * Management account:
 * @example
 * ```
 * deploymentTargets:
 *   organizationalUnits:
 *     - Root
 *   excludedAccounts:
 *     - Management
 * ```
 */
export class DeploymentTargets implements IDeploymentTargets {
  /**
   * Use this property to define one or more organizational units (OUs)
   * as a deployment target. Resources are provisioned in each account
   * contained within the OU.
   *
   * @remarks
   * Any nested OUs that you would like to deploy resources to must be explicitly
   * defined in this property. Deployment targets will not automatically deploy to
   * nested OUs.
   */
  readonly organizationalUnits: string[] = [];
  /**
   * Use this property to define one or more accounts as a deployment target.
   */
  readonly accounts: string[] = [];
  /**
   * Use this property to explicitly define one or more regions to exclude from deployment.
   *
   * @remarks
   * By default, all regions defined in the `enabledRegions` property of {@link GlobalConfig} are
   * included in `deploymentTargets`.
   */
  readonly excludedRegions: Region[] = [];
  /**
   * Use this property to explicitly define one or more accounts to exclude from deployment.
   */
  readonly excludedAccounts: string[] = [];
}

export type StorageClass =
  | 'DEEP_ARCHIVE'
  | 'GLACIER'
  | 'GLACIER_IR'
  | 'STANDARD_IA'
  | 'INTELLIGENT_TIERING'
  | 'ONEZONE_IA';

/**
 * An email address
 *
 * @minLength 6
 * @maxLength 64
 * @pattern  ['^\S+@\S+\.\S+$', '^\w+$']
 */
export type EmailAddress = string;

/**
 * A string that has at least 1 character
 *
 * @minLength 1
 */
export type NonEmptyString = string;

/**
 * A string that contains no spaces
 *
 * @pattern ^[^\s]*$
 * @minLength 1
 */
export type NonEmptyNoSpaceString = string;

export interface ITransition {
  storageClass: StorageClass;
  transitionAfter: number;
}

export interface IResourcePolicyStatement {
  policy: string;
}

/**
 * S3 bucket life cycle rules object.
 *
 * @example
 * ```
 *   lifecycleRules:
 *     - enabled: true
 *       id: ElbLifecycle-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *     - enabled: true
 *       id: ElbLifecycle-02
 *       abortIncompleteMultipartUpload: 14
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 * ```
 */
export interface ILifecycleRule {
  /**
   * Specifies a lifecycle rule that aborts incomplete multipart uploads to an Amazon S3 bucket.
   */
  readonly abortIncompleteMultipartUpload?: number;
  /**
   * Whether this rule is enabled.
   */
  readonly enabled?: boolean;
  /**
   * Indicates the number of days after creation when objects are deleted from Amazon S3 and Amazon Glacier.
   */
  readonly expiration?: number;
  /**
   * Indicates whether Amazon S3 will remove a delete marker with no noncurrent versions.
   * If set to true, the delete marker will be expired.
   */
  readonly expiredObjectDeleteMarker?: boolean;
  /**
   * Friendly name for the rule. Rule name must be unique.
   */
  readonly id?: string;
  /**
   * Time between when a new version of the object is uploaded to the bucket and when old versions of the object expire.
   */
  readonly noncurrentVersionExpiration?: number;
  /**
   * One or more transition rules that specify when non-current objects transition to a specified storage class.
   */
  readonly noncurrentVersionTransitions?: ITransition[];
  /**
   * One or more transition rules that specify when an object transitions to a specified storage class.
   */
  readonly transitions?: ITransition[];
  /**
   * Object key prefix that identifies one or more objects to which this rule applies.
   * @default - Rule applies to all objects
   */
  readonly prefix?: NonEmptyString;
}

export class LifeCycleRule implements ILifecycleRule {
  readonly abortIncompleteMultipartUpload: number = 1;
  readonly enabled: boolean = true;
  readonly expiration: number = 1825;
  readonly expiredObjectDeleteMarker: boolean = false;
  readonly id: string = '';
  readonly noncurrentVersionExpiration: number = 366;
  readonly noncurrentVersionTransitions: ITransition[] = [];
  readonly transitions: ITransition[] = [];
  readonly prefix: string | undefined = undefined;
}

export interface IShareTargets {
  organizationalUnits?: string[];
  accounts?: string[];
}

/**
 * {@link https://docs.aws.amazon.com/ram/latest/userguide/what-is.html | Resource Access Manager (RAM)} share targets configuration.
 * Share targets is an accelerator-specific
 * configuration object that can be used for
 * resources provisioned by the accelerator.
 * Share targets allow you to specify
 * multiple accounts and/or organizational units (OUs)
 * as targets for RAM shares. RAM allows you to securely share
 * resources between accounts and OUs within your organization.
 *
 * The following example would share a resource
 * to all accounts in the organization:
 * @example
 * ```
 * shareTargets:
 *   organizationalUnits:
 *     - Root
 * ```
 */
export class ShareTargets implements IShareTargets {
  /**
   * Use this property to define one or more organizational units (OUs)
   * as a share target. Resources can be consumed each account
   * contained within the OU.
   *
   * @remarks
   * Any nested OUs that you would like to share resources to must be explicitly
   * defined in this property. Share targets will not automatically share to
   * nested OUs.
   */
  readonly organizationalUnits: string[] = [];
  /**
   * Use this property to define one or more accounts as a share target.
   */
  readonly accounts: string[] = [];
}

export type AllowDeny = 'allow' | 'deny';
export type EnableDisable = 'enable' | 'disable';
export type AvailabilityZone = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';
export type ThresholdType = 'PERCENTAGE' | 'ABSOLUTE_VALUE';
export type ComparisonOperator = 'GREATER_THAN' | 'LESS_THAN' | 'EQUAL_TO';
export type SubscriptionType = 'EMAIL' | 'SNS';
export type NotificationType = 'ACTUAL' | 'FORECASTED';
export type SecurityHubSeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export interface ITag {
  key: string;
  value: string;
}

export class Tag implements ITag {
  readonly key: string = '';
  readonly value: string = '';
}

export interface IOperationPreferences {
  failureToleranceCount?: number;
  failureTolerancePercentage?: number;
  maxConcurrentCount?: number;
  maxConcurrentPercentage?: number;
  regionConcurrencyType?: string;
  regionOrder?: string[];
}
export class OperationPreferences implements IOperationPreferences {
  readonly failureToleranceCount: number | undefined = undefined;
  readonly failureTolerancePercentage: number = 25;
  readonly maxConcurrentCount: number | undefined = undefined;
  readonly maxConcurrentPercentage: number = 35;
  readonly regionConcurrencyType: string = 'PARALLEL';
  readonly regionOrder: string[] | undefined = undefined;
}

export interface ICfnParameter {
  name: string;
  value: string;
}

export class CfnParameter implements ICfnParameter {
  readonly name: string = '';
  readonly value: string = '';
}

export type TrafficType = 'ALL' | 'ACCEPT' | 'REJECT';
export type LogDestinationType = 's3' | 'cloud-watch-logs';

/**
 * Solution supported CloudWatch Log data protection categories
 *
 * @remarks
 * Refer [Types of data that you can protect](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types.html) for more information.
 */
export enum CloudWatchLogDataProtectionCategories {
  Credentials = 'Credentials',
}

export interface IVpcFlowLogsS3BucketConfig {
  lifecycleRules?: ILifecycleRule[];
  overrideS3LogPath?: NonEmptyString;
}

export interface IVpcFlowLogsCloudWatchLogsConfig {
  retentionInDays?: number;
  kms?: NonEmptyString;
}

export interface IVpcFlowLogsDestinationConfig {
  s3?: IVpcFlowLogsS3BucketConfig;
  cloudWatchLogs?: IVpcFlowLogsCloudWatchLogsConfig;
}

export interface IVpcFlowLogsConfig {
  trafficType: TrafficType;
  maxAggregationInterval: number;
  destinations: LogDestinationType[];
  destinationsConfig?: IVpcFlowLogsDestinationConfig;
  defaultFormat: boolean;
  customFields: NonEmptyString[];
}

export interface IPrefixConfig {
  /**
   * Indicates whether or not to add a custom prefix to LZA Default Centralized Logging location.
   * If useCustomPrefix is set to true, logs will be stored in the Centralized Logging Bucket prefix.
   */
  useCustomPrefix: boolean;
  /**
   * (Optional) Prefix to be used for Centralized Logging Path
   */
  customOverride?: NonEmptyString;
}

export class PrefixConfig implements IPrefixConfig {
  /**
   *  Indicates whether or not to add a custom prefix to LZA Default Centralized Logging location.
   *  If useCustomPrefix is set to false, logs will be stored in the default LZA Centralized Logging Bucket prefix.
   */
  readonly useCustomPrefix: boolean = false;

  /**
   * @optional
   * (Optional) Prefix to be used for Centralized Logging Path
   */
  readonly customOverride = undefined;
}

/**
 * VPC flow logs S3 destination bucket configuration.
 *
 */
class VpcFlowLogsS3BucketConfig implements IVpcFlowLogsS3BucketConfig {
  /**
   * @optional
   * Flow log destination S3 bucket life cycle rules
   */
  readonly lifecycleRules: LifeCycleRule[] = [];

  readonly overrideS3LogPath: string = '';
}

/**
 * VPC flow logs CloudWatch logs destination configuration.
 */
class VpcFlowLogsCloudWatchLogsConfig implements IVpcFlowLogsCloudWatchLogsConfig {
  /**
   * @optional
   * CloudWatchLogs retention days
   */
  readonly retentionInDays = 3653;
  /**
   * @optional
   * CloudWatchLogs encryption key name
   */
  readonly kms = undefined;
}

/**
 * VPC flow logs destination configuration.
 */
class VpcFlowLogsDestinationConfig implements IVpcFlowLogsDestinationConfig {
  /**
   * S3 Flow log destination configuration
   * Use following configuration to enable S3 flow log destination
   * @example
   * ```
   * destinations:
   *     s3:
   *       enable: true
   *       lifecycleRules: []
   * ```
   */
  readonly s3: VpcFlowLogsS3BucketConfig = new VpcFlowLogsS3BucketConfig();
  /**
   * CloudWatchLogs Flow log destination configuration
   * Use following configuration to enable CloudWatchLogs flow log destination
   * @example
   * ```
   * destinations:
   *     cloudWatchLogs:
   *       enable: true
   *       retentionInDays: 3653
   * ```
   */
  readonly cloudWatchLogs: VpcFlowLogsCloudWatchLogsConfig = new VpcFlowLogsCloudWatchLogsConfig();
}

/**
 * {@link https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html | Virtual Private Cloud (VPC) flow logs} configuration.
 *
 * @description
 * Use this configuration to customize VPC flow log output.
 * VPC Flow Logs is a feature that enables you to capture information
 * about the IP traffic going to and from network interfaces in your VPC.
 * Flow log data can be published to the following locations: Amazon CloudWatch Logs, Amazon S3.
 *
 * @example
 * ```
 * vpcFlowLogs:
 *   trafficType: ALL
 *   maxAggregationInterval: 600
 *   destinations:
 *     - s3
 *     - cloud-watch-logs
 *   defaultFormat: false
 *   customFields:
 *     - version
 *     - account-id
 *     - interface-id
 *     - srcaddr
 *     - dstaddr
 *     - srcport
 *     - dstport
 *     - protocol
 *     - packets
 *     - bytes
 *     - start
 *     - end
 *     - action
 *     - log-status
 *     - vpc-id
 *     - subnet-id
 *     - instance-id
 *     - tcp-flags
 *     - type
 *     - pkt-srcaddr
 *     - pkt-dstaddr
 *     - region
 *     - az-id
 *     - pkt-src-aws-service
 *     - pkt-dst-aws-service
 *     - flow-direction
 *     - traffic-path
 * ```
 */
export class VpcFlowLogsConfig implements IVpcFlowLogsConfig {
  /**
   * The type of traffic to log.
   *
   * @see {@link trafficTypeEnum}
   */
  readonly trafficType = 'ALL';
  /**
   * The maximum log aggregation interval in days.
   */
  readonly maxAggregationInterval: number = 600;
  /**
   * An array of destination serviced for storing logs.
   *
   * @see {@link NetworkConfigTypes.logDestinationTypeEnum}
   */
  readonly destinations: LogDestinationType[] = ['s3', 'cloud-watch-logs'];
  /**
   * @optional
   * VPC Flow log detonations properties. Use this property to specify S3 and CloudWatchLogs properties
   * @see {@link VpcFlowLogsDestinationConfig}
   */
  readonly destinationsConfig: VpcFlowLogsDestinationConfig = new VpcFlowLogsDestinationConfig();
  /**
   * Enable to use the default log format for flow logs.
   */
  readonly defaultFormat = false;
  /**
   * Custom fields to include in flow log outputs.
   */
  readonly customFields = [
    'version',
    'account-id',
    'interface-id',
    'srcaddr',
    'dstaddr',
    'srcport',
    'dstport',
    'protocol',
    'packets',
    'bytes',
    'start',
    'end',
    'action',
    'log-status',
    'vpc-id',
    'subnet-id',
    'instance-id',
    'tcp-flags',
    'type',
    'pkt-srcaddr',
    'pkt-dstaddr',
    'region',
    'az-id',
    'pkt-src-aws-service',
    'pkt-dst-aws-service',
    'flow-direction',
    'traffic-path',
  ];
}

export type CfnResourceType = {
  /**
   * LogicalId of a resource in Amazon CloudFormation Stack
   * Unique within the template
   */
  logicalResourceId: string;
  /**
   * PhysicalId of a resource in Amazon CloudFormation Stack
   * Use the physical IDs to identify resources outside of AWS CloudFormation templates
   */
  physicalResourceId?: string;
  /**
   * The resource type identifies the type of resource that you are declaring
   */
  resourceType: string;
  /**
   * The LZA resource identifier if available.
   */
  resourceIdentifier?: string;
  /**
   * The resourceMetadata holds all resources and properties
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceMetadata: { [key: string]: any };
  /**
   * Deletion marker for imported resources
   */
  isDeleted?: boolean;
};

export type AseaStackInfo = {
  accountId: string;
  accountKey: string;
  region: string;
  phase: string;
  stackName: string;
  templatePath: string;
  resourcePath: CfnResourceType[];
  nestedStack?: boolean;
};

/**
 * ASEA ResourceTypes used in Resource Mapping
 */
export enum AseaResourceType {
  IAM_POLICY = 'IAM_POLICY',
  IAM_ROLE = 'IAM_ROLE',
  IAM_GROUP = 'IAM_GROUP',
  IAM_USER = 'IAM_USER',
  EC2_VPC = 'EC2_VPC',
  EC2_VPC_CIDR = 'EC2_VPC_CIDR',
  EC2_SUBNET = 'EC2_SUBNET',
  EC2_IGW = 'EC2_VPC_IGW',
  EC2_VPN_GW = 'EC2_VPC_VPN_GW',
  EC2_SECURITY_GROUP = 'EC2_SECURITY_GROUP',
  EC2_SECURITY_GROUP_INGRESS = 'EC2_SECURITY_GROUP_INGRESS',
  EC2_SECURITY_GROUP_EGRESS = 'EC2_SECURITY_GROUP_EGRESS',
  EC2_VPC_PEERING = 'EC2_VPC_PEERING_CONNECTION',
  EC2_TARGET_GROUP = 'EC2_TARGET_GROUP',
  EC2_NACL_SUBNET_ASSOCIATION = 'EC2_NACL_SUBNET_ASSOCIATION',
  ROUTE_TABLE = 'ROUTE_TABLE',
  TRANSIT_GATEWAY = 'TRANSIT_GATEWAY',
  TRANSIT_GATEWAY_ROUTE_TABLE = 'TRANSIT_GATEWAY_ROUTE_TABLE',
  TRANSIT_GATEWAY_ROUTE = 'TRANSIT_GATEWAY_ROUTE',
  TRANSIT_GATEWAY_ATTACHMENT = 'TRANSIT_GATEWAY_ATTACHMENT',
  TRANSIT_GATEWAY_PROPAGATION = 'TRANSIT_GATEWAY_PROPAGATION',
  TRANSIT_GATEWAY_ASSOCIATION = 'TRANSIT_GATEWAY_ASSOCIATION',
  NAT_GATEWAY = 'NAT_GATEWAY',
  NFW = 'NETWORK_FIREWALL',
  NFW_POLICY = 'NETWORK_FIREWALL_POLICY',
  NFW_RULE_GROUP = 'NETWORK_FIREWALL_RULE_GROUP',
  VPC_ENDPOINT = 'VPC_ENDPOINT',
  ROUTE_53_PHZ_ID = 'ROUTE_53_PHZ',
  ROUTE_53_QUERY_LOGGING = 'ROUTE_53_QUERY_LOGGING',
  ROUTE_53_QUERY_LOGGING_ASSOCIATION = 'ROUTE_53_QUERY_LOGGING_ASSOCIATION',
  ROUTE_53_RECORD_SET = 'ROUTE_53_RECORD_SET',
  ROUTE_53_RESOLVER_ENDPOINT = 'ROUTE_53_RESOLVER_ENDPOINT',
  SSM_RESOURCE_DATA_SYNC = 'SSM_RESOURCE_DATA_SYNC',
  SSM_ASSOCIATION = 'SSM_ASSOCIATION',
  FIREWALL_INSTANCE = 'EC2_INSTANCE',
  MANAGED_AD = 'MANAGED_AD',
  APPLICATION_LOAD_BALANCER = 'APPLICATION_LOAD_BALANCER',
}

/**
 * Consolidated type for ASEA Resource mapping
 */
export type AseaResourceMapping = {
  accountId: string;
  region: string;
  resourceType: string;
  resourceIdentifier: string;
  isDeleted?: boolean;
};

export type ASEAMappings = {
  [key: string]: ASEAMapping;
};

export type StackResources = {
  [key: string]: {
    Type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Properties: { [key: string]: any };
  };
};

export type ASEAMapping = {
  stackName: string;
  accountId: string;
  accountKey: string;
  region: string;
  phase: string | undefined;
  countVerified: boolean;
  numberOfResources: number;
  numberOfResourcesInTemplate: number;
  templatePath: string;
  resourcePath: string;
  nestedStacks?: { [key: string]: NestedStack };
  parentStack?: string;
  cfnResources: CfnResourceType[];
  logicalResourceId?: string;
};

export type NestedStack = {
  stackName: string;
  accountId: string;
  accountKey: string;
  region: string;
  phase: string | undefined;
  countVerified: boolean;
  numberOfResources: number;
  numberOfResourcesInTemplate: number;
  templatePath: string;
  resourcePath: string;
  logicalResourceId: string;
  stackKey: string;
  cfnResources: CfnResourceType[];
};

export enum AseaResourceTypePaths {
  IAM = '/iam/',
  VPC = '/network/vpc/',
  VPC_PEERING = '/network/vpcPeering/',
  TRANSIT_GATEWAY = '/network/transitGateways/',
  NETWORK_FIREWALL = '/network/networkFirewall/',
}

export type AssumedByType = 'service' | 'account' | 'principalArn' | 'provider';
export type PrincipalType = 'USER' | 'GROUP';
export type ParameterReplacementType = 'SSM' | 'String' | 'StringList';

/**
 * AWS VPC ID
 *
 * @pattern ^vpc-.*|^$
 */
export type AwsVpcId = string;

/**
 * AWS Account ID
 *
 * @minLength 12
 * @maxLength 12
 */
export type AwsAccountId = string;
