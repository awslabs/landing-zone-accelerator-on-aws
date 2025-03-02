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
import { StreamMode } from '@aws-sdk/client-kinesis';
/**
 * {@link IGlobalConfig} / {@link IControlTowerConfig} / {@link IControlTowerLandingZoneConfig} / {@link IControlTowerLandingZoneLoggingConfig}
 *
 * AWS Control Tower Landing Zone logging configuration
 *
 * @remarks
 * This allows you to manage logging options for the landing zone.
 * In the log configuration section, you can configure the retention time of the Amazon S3 log archive bucket, and the retention time of the logs for access to the bucket.
 *
 * @example
 * ```
 *   logging:
 *     loggingBucketRetentionDays: 365
 *     accessLoggingBucketRetentionDays: 3650
 *     organizationTrail: true
 * ```
 */
export interface IControlTowerLandingZoneLoggingConfig {
  /**
   * Retention time of the Amazon S3 log archive bucket
   *
   * @default
   * 365
   */
  readonly loggingBucketRetentionDays: number;
  /**
   * Retention time of the logs for access to the bucket.
   *
   * @default
   * 3650
   */
  readonly accessLoggingBucketRetentionDays: number;
  /**
   * Flag indicates Organizational-level AWS CloudTrail configuration is configured or not.
   *
   * @remarks
   * It is important to note that the CloudTrail configured by AWS Control Tower Landing Zone at the organization level is different from the CloudTrail deployed by the solution. In the event that AWS Control Tower Landing Zone and Solution defined CloudTrail are enabled, two cloud trails will be created.
   * @default
   * true
   */
  readonly organizationTrail: boolean;
}

/**
 * {@link IGlobalConfig} / {@link IControlTowerConfig} / {@link IControlTowerLandingZoneConfig} / {@link IControlTowerLandingZoneSecurityConfig}
 * AWS Control Tower Landing Zone security configuration
 *
 * @remarks
 * This allows you to manage security options for the landing zone.
 *
 * @example
 * ```
 *   security:
 *     enableIdentityCenterAccess: true
 * ```
 */
export interface IControlTowerLandingZoneSecurityConfig {
  /**
   * Flag indicates AWS account access option.
   *
   * @remarks
   * When this property is to true, AWS Control Tower sets up AWS account access with IAM Identity Center. Otherwise, please use self-managed AWS account access with IAM Identity Center or another method.
   *
   * @default
   * true
   */
  readonly enableIdentityCenterAccess: boolean;
}

/**
 * {@link IGlobalConfig} / {@link IControlTowerConfig} / {@link IControlTowerLandingZoneConfig}
 *
 * @description
 * AWS Control Tower Landing Zone configuration
 *
 * @remarks
 * This allows you to manage AWS Control Tower Landing Zone configuration.
 *
 *
 * @example
 *
 * ```
 * landingZone:
 *   version: '3.3'
 *   logging:
 *     loggingBucketRetentionDays: 365
 *     accessLoggingBucketRetentionDays: 3650
 *     organizationTrail: true
 *   security:
 *     enableIdentityCenterAccess: true
 * ```
 */
export interface IControlTowerLandingZoneConfig {
  /**
   * The landing zone version, for example, 3.3.
   *
   * @remarks
   * Most AWS Control Tower Landing Zone operation needs the version to latest available version.
   * The AWS Control Tower Landing Zone will be updated or reset when it drifts or when any configuration changes have been made in global-config.
   * When the value of this property is set to the latest available version, AWS Control Tower Landing Zone can be updated or reset.
   * The solution will fail if this property version is not set to the latest available version.
   * If you wish to update or reset the AWS Control Tower Landing Zone, you will need to update this property to match the latest available version.
   *
   */
  readonly version: string;
  /**
   * AWS Control Tower Landing Zone logging configuration
   *
   * @see {@link IControlTowerLandingZoneLoggingConfig} for more information.
   */
  readonly logging: IControlTowerLandingZoneLoggingConfig;
  /**
   * AWS Control Tower Landing Zone security configuration
   *
   * @see {@link IControlTowerLandingZoneSecurityConfig} for more information.
   */
  readonly security: IControlTowerLandingZoneSecurityConfig;
}

/**
 * {@link IGlobalConfig} / {@link IControlTowerConfig} / {@link IControlTowerControlConfig}
 *
 * @description
 * Control Tower controls
 *
 * @see ControlTowerControlConfig
 *
 * This allows you to enable Strongly Recommended or Elective Controls
 * https://docs.aws.amazon.com/controltower/latest/userguide/optional-controls.html
 *
 * @remarks AWS Control Tower is limited to 10 concurrent operations, where enabling a control for one Organizational Unit constitutes a single operation.
 * To avoid throttling, please enable controls in batches of 10 or fewer each pipeline run. Keep in mind other Control Tower operations may use up some of the available quota.
 *
 * @example
 * controlTowerControls:
 *   - identifier: AWS-GR_RESTRICT_ROOT_USER_ACCESS_KEYS
 *     enable: true
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 */
export interface IControlTowerControlConfig {
  /**
   * Control Tower control identifier, for Strongly Recommended or Elective controls this should start with AWS-GR
   */
  readonly identifier: t.NonEmptyString;
  /**
   * Control enabled
   */
  readonly enable: boolean;
  /**
   * Control Tower control deployment targets, controls can only be deployed to Organizational Units
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * (Optional) Region(s) where this service quota increase will be requested. Service Quota increases will be requested in the home region only if this property is not defined.  If this property is defined, the regions must also be listed in the enabledRegions section or the change will not be applied.
   */
  readonly regions?: t.Region[];
}

/**
 * *{@link IGlobalConfig} / {@link IControlTowerConfig}
 *
 * @description
 * AWS Control Tower Landing Zone configuration
 *
 * @example
 * ```
 * controlTower:
 *   enable: true
 *   landingZone:
 *     version: '3.3'
 *     logging:
 *       loggingBucketRetentionDays: 365
 *       accessLoggingBucketRetentionDays: 3650
 *       organizationTrail: true
 *     security:
 *       enableIdentityCenterAccess: true
 * ```
 */
export interface IControlTowerConfig {
  /**
   * Indicates whether AWS Control Tower Landing Zone enabled.
   *
   * When control tower is enabled, accelerator makes sure account configuration file have three mandatory AWS CT accounts.
   * In AWS Control Tower, three shared accounts in your landing zone are provisioned automatically during setup: the management account,
   * the log archive account, and the audit account.
   */
  readonly enable: boolean;
  /**
   * A list of Control Tower controls to enable.
   *
   * Only Strongly recommended and Elective controls are permitted, with the exception of the Region deny guardrail. Please see this page for more information: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-controltower-enabledcontrol.html
   *
   * @see {@link IControlTowerControlConfig}
   *
   * @remarks
   * Only Strongly recommended and Elective controls are permitted, with the exception of the Region deny guardrail. Please see this page for more information: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-controltower-enabledcontrol.html
   */
  readonly controls?: IControlTowerControlConfig[];

  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @see {@link IControlTowerLandingZoneConfig} for more information.
   */
  readonly landingZone?: IControlTowerLandingZoneConfig;
}

/**
 * *{@link GlobalConfig} / {@link S3GlobalConfig} / {@link S3EncryptionConfig}*
 *
 * @description
 * AWS S3 encryption configuration settings
 *
 * @example
 * ```
 *  encryption:
 *    createCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export interface IS3EncryptionConfig {
  /**
   * Flag indicates whether solution will create CMK for S3 bucket encryption.
   * Note: This configuration is not applicable to the assets S3 bucket. This bucket will always have a key generated and applied.
   *
   * @remarks
   * When set to `true`, the solution will create AWS KMS CMK which will be used by the S3 for server-side encryption.
   *
   * @default true
   */
  readonly createCMK: boolean;
  /**
   * To control target environments (AWS Account and Region) for the given `createCMK` setting, you may optionally specify deployment targets.
   * Leaving `deploymentTargets` undefined will apply `createCMK` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
}

/**
 * *{@link GlobalConfig} / {@link S3GlobalConfig}*
 *
 * @description
 * AWS S3 global encryption configuration settings
 *
 * @example
 * ```
 *  encryption:
 *    createCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export interface IS3GlobalConfig {
  /**
   * S3 encryption configuration.
   *
   * @remarks
   * Please use the following configuration to disable AWS KMS CMK for AWS S3 bucket encryption.
   * In the absence of this property, the solution will deploy the AWS KMS CMK in every environment (AWS Account and Region).
   * The solution will disregard this property and create CMKs to encrypt the installer bucket, pipeline bucket, and solution deployed CentralLogs bucket,
   * because AWS KMS CMK is always used to encrypt installer buckets, pipeline buckets, and solution deployed CentralLogs buckets.
   *
   * @example
   * ```
   * s3:
   *   encryption:
   *     createCMK: false
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Root
   * ```
   * @default undefined
   */
  readonly encryption?: IS3EncryptionConfig;
}

/**
 * *{@link GlobalConfig} / {@link centralizeCdkBucketsConfig}*
 *
 * @description
 * AWS CDK Centralization configuration
 * ***Deprecated***
 * Replaced by cdkOptions in global config
 *
 * @example
 * ```
 * centralizeCdkBuckets:
 *   enable: true
 * ```
 */
export interface ICentralizeCdkBucketsConfig {
  /**
   * ***Deprecated***
   * Replaced by cdkOptions in global config.
   *
   * Indicates whether CDK stacks in workload accounts will utilize S3 buckets in the management account rather than within the account.
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly enable: boolean;
}

/**
 * *{@link GlobalConfig} / {@link cdkOptionsConfig} / {@link stackRefactor}*
 *
 * @experimental
 * This configuration is intended for internal development purposes only.
 * It will not trigger an actual stack refactor when used.
 *
 * @description
 * LZA Stack refactor configuration. This interface allows you to specify which stacks should undergo refactoring.
 * Refactoring helps optimize resource distribution and avoid exceeding the 500-resource limit for CloudFormation stacks.
 *
 * @remarks
 * Stack refactoring is a one-time action. Please change this configuration back to false when stack refactoring is finished.
 *
 * @example
 * ```
 * stackRefactor:
 *   networkVpcStack: true
 * ```
 */
export interface IStackRefactor {
  /**
   * Enables refactoring for the network stacks.
   */
  networkVpcStack?: boolean;
}

/**
 * *{@link GlobalConfig} / {@link cdkOptionsConfig}*
 *
 * @description
 * AWS CDK options configuration. This lets you customize the operation of the CDK within LZA, specifically:
 *
 * centralizeBuckets: Enabling this option modifies the CDK bootstrap process to utilize a single S3 bucket per region located in the management account for CDK assets generated by LZA. Otherwise, CDK will create a new S3 bucket in every account and every region supported by LZA.
 * useManagementAccessRole: Enabling this option modifies CDK operations to use the IAM role specified in the `managementAccountAccessRole` option in `global-config.yaml` rather than the default roles created by CDK. Default CDK roles will still be created, but will remain unused. Any stacks previously deployed by LZA will retain their [associated execution role](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html). For more information on these roles, please see [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-contract).
 *
 * @example
 * ```
 * cdkOptions:
 *   centralizeBuckets: true
 *   useManagementAccessRole: true
 *   stackRefactor:
 *    networkVpcStack: true
 * ```
 */
export interface ICdkOptionsConfig {
  /**
   * Indicates whether CDK stacks in workload accounts will utilize S3 buckets in the management account rather than within the account.
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly centralizeBuckets: boolean;
  /**
   * Indicates whether CDK operations use the IAM role specified in the `managementAccountAccessRole` option in `global-config.yaml` rather than the default roles created by CDK.
   *
   * The roles created and leveraged by CDK by default can be found [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-contract).
   */
  readonly useManagementAccessRole: boolean;
  /**
   * Creates a deployment role in all accounts in the home region with the name specified in the parameter. This role is used by the LZA for all CDK deployment tasks.
   */
  readonly customDeploymentRole?: string;
  /**
   * Forces the Accelerator to deploy the bootstrapping stack and circumvent the ssm parameter check. This option is needed when adding or removing a custom deployment role
   */
  readonly forceBootstrap?: boolean;
  /**
   * Enables stack refactoring for specific stacks. When enabled, the Accelerator will reorganize the resources defined in the stack to avoid exceeding the
   * 500-resource limit for CloudFormation stacks.
   *
   * @experimental
   * This configuration is intended for internal development purposes only.
   * It will not trigger an actual stack refactor when used.
   */
  readonly stackRefactor?: IStackRefactor;
}

/**
 * *{@link GlobalConfig} / {@link externalLandingZoneResourcesConfig}*
 *
 * @description
 * External Landing Zone Resources Config
 *
 * @example
 * ```
 * externalLandingZoneResourcesConfig:
 *   importExternalLandingZoneResources: true
 * ```
 */
export interface IExternalLandingZoneResourcesConfig {
  /**
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly importExternalLandingZoneResources: boolean;
  readonly mappingFileBucket?: string;
  readonly acceleratorPrefix: t.NonEmptyString;
  readonly acceleratorName: t.NonEmptyString;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudTrailConfig} / ({@link AccountCloudTrailConfig}) / {@link CloudTrailSettingsConfig}*
 *
 * @description
 * AWS CloudTrail Settings configuration
 *
 * @example
 * ```
 * multiRegionTrail: true
 * globalServiceEvents: true
 * managementEvents: true
 * s3DataEvents: true
 * lambdaDataEvents: true
 * sendToCloudWatchLogs: true
 * apiErrorRateInsight: false
 * apiCallRateInsight: false
 * ```
 */
export interface ICloudTrailSettingsConfig {
  /**
   * Whether or not this trail delivers log files from all regions in the account.
   */
  multiRegionTrail: boolean;
  /**
   * For global services such as AWS Identity and Access Management (IAM), AWS STS, Amazon CloudFront,
   * and Route 53, events are delivered to any trail that includes global services,
   *  and are logged as occurring in US East Region.
   */
  globalServiceEvents: boolean;
  /**
   * Management events provide insight into management operations that are
   * on resources in your AWS account. These are also known as control plane operations.
   * Management events can also include non-API events that occur in your account.
   * For example, when a user logs in to your account, CloudTrail logs the ConsoleLogin event.
   * Enabling will set ReadWriteType.ALL
   */
  managementEvents: boolean;
  /**
   * Adds an S3 Data Event Selector for filtering events that match S3 operations.
   * These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   */
  s3DataEvents: boolean;
  /**
   * Adds an Lambda Data Event Selector for filtering events that match Lambda operations.
   * These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   */
  lambdaDataEvents: boolean;
  /**
   * If CloudTrail pushes logs to CloudWatch Logs in addition to S3.  CloudWatch Logs
   * will also be replicated to S3.
   */
  sendToCloudWatchLogs: boolean;
  /**
   * Will enable CloudTrail Insights and enable the API Error Rate Insight
   */
  readonly apiErrorRateInsight: boolean;
  /**
   * Will enable CloudTrail Insights and enable the API Call Rate Insight
   */
  readonly apiCallRateInsight: boolean;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudTrailConfig} / {@link AccountCloudTrailConfig}*
 *
 * @description
 * Account CloudTrail config
 *
 * @example
 * ```
 * - name: AWSAccelerator-Account-CloudTrail
 *   regions:
 *     - us-east-1
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   settings:
 *     multiRegionTrail: true
 *     globalServiceEvents: true
 *     managementEvents: true
 *     s3DataEvents: true
 *     lambdaDataEvents: true
 *     sendToCloudWatchLogs: true
 *     apiErrorRateInsight: false
 *     apiCallRateInsight: false
 * ```
 */
export interface IAccountCloudTrailConfig {
  /**
   * Name that will be used to create the CloudTrail.
   */
  readonly name: string;
  /**
   * Region(s) that this account trail will be deployed in.
   */
  readonly regions: t.NonEmptyString[];
  /**
   * Which OU's or Accounts the trail will be deployed to
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * Settings for the CloudTrail log
   */
  readonly settings: ICloudTrailSettingsConfig;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudTrailConfig} / {@link AccountCloudTrailConfig}*
 *
 * @description
 * AWS Cloudtrail configuration
 *
 * @example
 * ```
 * cloudtrail:
 *   enable: true
 *   organizationTrail: true
 *   organizationTrailSettings:
 *     multiRegionTrail: true
 *     globalServiceEvents: true
 *     managementEvents: true
 *     s3DataEvents: true
 *     lambdaDataEvents: true
 *     sendToCloudWatchLogs: true
 *     apiErrorRateInsight: false
 *     apiCallRateInsight: false
 *   accountTrails: []
 *   lifecycleRules: []
 * ```
 */
export interface ICloudTrailConfig {
  /**
   * Indicates whether AWS Cloudtrail enabled.
   *
   * Cloudtrail a service that helps you enable governance, compliance, and operational and risk auditing of your AWS account.
   * This setting does not create any trails.  You will also need to either and organization trail
   * or setup account level trails.
   */
  readonly enable: boolean;
  /**
   * Indicates whether AWS OrganizationTrail enabled.
   *
   * When OrganizationTrail and cloudtrail is enabled accelerator will enable trusted access designates CloudTrail as a trusted service in your organization.
   * A trusted service can query the organization's structure and create service-linked roles in the organization's accounts.
   */
  readonly organizationTrail: boolean;
  /**
   * Optional configuration of the organization trail.  OrganizationTrail must be enabled
   * in order to use these settings
   */
  readonly organizationTrailSettings?: ICloudTrailSettingsConfig;
  /**
   * Optional configuration of account level CloudTrails. Can be used with or without
   * an Organization Trail
   */
  readonly accountTrails?: IAccountCloudTrailConfig[];
  /**
   * Optional S3 Log Bucket Lifecycle rules
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link SessionManagerConfig}*
 *
 * @description
 * AWS Service Quotas configuration
 */
export interface IServiceQuotaLimitsConfig {
  /**
   * Indicates which service Service Quota is changing the limit for.
   */
  readonly serviceCode: string;
  /**
   * Indicates the code for the service as these are tied to the account.
   *
   */
  readonly quotaCode: string;
  /**
   * Value associated with the limit change.
   */
  readonly desiredValue: number;
  /**
   * List of AWS Account names to be included in the Service Quota changes
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * (Optional) Region(s) where this service quota increase will be requested. Service Quota increases will be requested in the home region only if this property is not defined.
   */
  readonly regions?: t.Region[];
}

/**
 * @description
 * AWS SessionManager configuration
 *
 * @example
 * ```
 * sessionManager:
 *   sendToCloudWatchLogs: true
 *   sendToS3: true
 *   excludeRegions: []
 *   excludeAccounts: []
 *   lifecycleRules: []
 *   attachPolicyToIamRoles:
 *     - EC2-Default-SSM-AD-Role
 * ```
 */
export interface ISessionManagerConfig {
  /**
   * Indicates whether sending SessionManager logs to CloudWatchLogs enabled.
   */
  readonly sendToCloudWatchLogs: boolean;
  /**
   * Indicates whether sending SessionManager logs to S3 enabled.
   *
   * When this flag is on, accelerator will send session manager logs to Central log bucket in LogArchive account.
   */
  readonly sendToS3: boolean;
  /**
   * List of AWS Region names to be excluded from configuring SessionManager configuration
   */
  readonly excludeRegions?: t.Region[];
  /**
   * List of AWS Account names to be excluded from configuring SessionManager configuration
   */
  readonly excludeAccounts?: string[];
  /**
   * S3 Lifecycle rule for log storage
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * List of IAM EC2 roles that the Session Manager
   * access policy should be attached to
   */
  readonly attachPolicyToIamRoles?: string[];
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link AssetBucketConfig}*
 *
 * @description
 * Accelerator global S3 asset bucket configuration
 *
 * @example
 * ```
 * assetBucket:
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   importedBucket:
 *     name: aws-accelerator-assets
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 */
export interface IAssetBucketConfig {
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket encryption key policy.
   * This property can not be used when customPolicyOverrides.kmsPolicy property has value.
   * When imported CentralLogs bucket used with createAcceleratorManagedKey set to false, this property can not have any value.
   *
   * Note: The Assets Bucket will allow customers to have SSE-S3 (Amazon S3 managed keys) or SSE-KMS keys. Only SSE-KMS keys can adopt the KMS resource policy files.
   */
  readonly kmsResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing Assets bucket.
   *
   * Use the following configuration to imported Assets bucket, manage bucket resource policy and apply bucket encryption through the solution.
   * ```
   * importedBucket:
   *    name: aws-assets
   *    applyAcceleratorManagedBucketPolicy: true
   *    createAcceleratorManagedKey: true
   * ```
   * Note: When importing your own Assets S3 Bucket, be sure to create it in the `Management` account in the `home` region.
   *
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedCustomerManagedEncryptionKeyBucketConfig;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy.
   * Bucket resource policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   *
   * Use the following configuration to apply custom bucket resource policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   *   kmsPolicy: kms/full-central-logs-bucket-key-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.CustomS3ResourceAndKmsPolicyOverridesConfig;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link AccessLogBucketConfig}*
 *
 * @description
 * Accelerator global S3 access logging configuration
 *
 * @example
 * ```
 * accessLogBucket:
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   lifecycleRules:
 *     - enabled: true
 *       id: AccessLifecycle-01
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
 *       id: AccessLifecycle-02
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
 *   importedBucket:
 *     name: existing-access-log-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 */
export interface IAccessLogBucketConfig {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * Flag indicating S3 access logging bucket is enable by solution.
   *
   * @remarks
   * When this property is undefined solution will create S3 access log bucket. You can use `deploymentTargets` to control target accounts and regions for the given `accessLogBucket` configuration.
   * In the solution, this property will be ignored and S3 Access log buckets will be created for the installer bucket,
   * pipeline bucket, solution deployed CentralLogs bucket, and solution deployed Assets bucket, since these buckets always have server access logging enabled.
   */
  readonly enable?: boolean;
  /**
   * To control target environments (AWS Account and Region) for the given `accessLogBucket` setting, you may optionally specify deployment targets.
   * Leaving `deploymentTargets` undefined will apply `useCMK` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing AccessLogs bucket.
   *
   * Use the following configuration to imported AccessLogs bucket, manage bucket resource policy through solution.
   * ```
   * importedBucket:
   *    name: existing-access-log-bucket
   *    applyAcceleratorManagedBucketPolicy: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedS3ManagedEncryptionKeyBucketConfig;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy.
   * Bucket resource policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   *
   * Use the following configuration to apply custom bucket resource policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.ICustomS3ResourcePolicyOverridesConfig;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CentralLogBucketConfig}*
 *
 * @description
 * Accelerator global S3 central logging configuration
 *
 * @example
 * ```
 * centralLogBucket:
 *   applyAcceleratorManagedPolicy: true
 *   lifecycleRules:
 *     - enabled: true
 *       id: CentralLifecycleRule-01
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
 *       id: CentralLifecycleRule-02
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
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   kmsResourcePolicyAttachments:
 *     - policy: kms-policies/policy1.json
 *   importedBucket:
 *     name: central-log-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 *     createAcceleratorManagedKey: false
 * ```
 */
export interface ICentralLogBucketConfig {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   * Configure additional resource policy attachments
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket encryption key policy.
   * This property can not be used when customPolicyOverrides.kmsPolicy property has value.
   * When imported CentralLogs bucket used with createAcceleratorManagedKey set to false, this property can not have any value.
   *
   * Note: The Central Logs Bucket will allow customers to have SSE-S3 (Amazon S3 managed keys) or SSE-KMS keys. Only SSE-KMS keys can adopt the KMS resource policy files.
   */
  readonly kmsResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing CentralLogs bucket.
   *
   * Use the following configuration to imported CentralLogs bucket, manage bucket resource policy and kms policy through solution.
   * ```
   * importedBucket:
   *    name: existing-central-log-bucket
   *    applyAcceleratorManagedBucketPolicy: true
   *    createAcceleratorManagedKey: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedS3ManagedEncryptionKeyBucketConfig;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy and KMS key policy.
   * Bucket resource policy and kms key policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   * When customPolicyOverrides.kmsPolicy defined kmsResourcePolicyAttachments property can not be defined.
   *
   *
   * Use the following configuration to apply custom bucket resource policy and KMS policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   *   kmsPolicy: kms/full-central-logs-bucket-key-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.ICustomS3ResourceAndKmsPolicyOverridesConfig;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link ElbLogBucketConfig}*
 *
 * @description
 * Accelerator global S3 elb logging configuration
 *
 * @example
 * ```
 * elbLogBucket:
 *   applyAcceleratorManagedPolicy: true
 *   lifecycleRules:
 *     - enabled: true
 *       id: ElbLifecycleRule-01
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
 *       id: ElbLifecycleRule-02
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
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   importedBucket:
 *     name: elb-logs-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 */
export interface IElbLogBucketConfig {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   * Configure additional resource policy attachments
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments?: t.IResourcePolicyStatement[];
  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing ElbLogs bucket.
   *
   * Use the following configuration to imported ElbLogs bucket, manage bucket resource policy through solution.
   * ```
   * importedBucket:
   *    name: existing-elb-log-bucket
   *    applyAcceleratorManagedBucketPolicy: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket?: t.IImportedS3ManagedEncryptionKeyBucketConfig;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy.
   * Bucket resource policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   *
   * Use the following configuration to apply custom bucket resource policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   * ```
   * Note: If importing your own ELB Log buckets, be sure to create the buckets in the `LogArchive` account and a bucket within each operating region that LZA is configured in.
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides?: t.ICustomS3ResourcePolicyOverridesConfig;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudWatchLogsConfig}/ {@link CloudWatchLogsExclusionConfig}*
 *
 * @description
 * Accelerator global CloudWatch Logs exclusion configuration
 *
 * @example
 * ```
 * organizationalUnits:
 *  - Sandbox
 * regions:
 *  - us-west-1
 *  - us-west-2
 * accounts:
 *  - WorkloadAccount1
 * excludeAll: true
 * logGroupNames:
 *  - 'test/*'
 *  - '/appA/*'
 *
 * ```
 */
export interface ICloudWatchLogsExclusionConfig {
  /**
   * List of OUs that the exclusion will apply to
   */
  readonly organizationalUnits?: t.NonEmptyString[];
  /**
   * List of regions where the exclusion will be applied to. If no value is supplied, exclusion is applied to all enabled regions.
   */
  readonly regions?: t.Region[];
  /**
   * List of accounts where the exclusion will be applied to
   */
  readonly accounts?: t.NonEmptyString[];
  /**
   * Exclude replication on all logs. By default this is set to false.
   *
   * @remarks
   * If undefined, this is set to false. When set to true, it disables replication on entire OU or account for that region.
   * Setting OU as `Root` with no region specified and making this true will fail validation since that usage is redundant.
   * Instead use the {@link CloudWatchLogsConfig | enable} parameter in cloudwatch log config which will disable replication across all accounts in all regions.
   */
  readonly excludeAll?: boolean;
  /**
   * List of log groups names where the exclusion will be applied to
   *
   * @remarks
   * Wild cards are supported. These log group names are added in the eventbridge payload which triggers lambda. If `excludeAll` is used then all logGroups are excluded and this parameter is not used.
   */
  readonly logGroupNames?: t.NonEmptyString[];
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudWatchLogsConfig}/ {@link CloudWatchFirehoseConfig}*
 *
 * @description
 * Accelerator global CloudWatch Logs firehose configuration
 *
 * @example
 * ```
 * logging:
 *  cloudwatchLogs:
 *    firehose:
 *      fileExtension: json.gz
 *      lambdaProcessor:
 *        retries: 3
 *        bufferSize: 0.2
 *        bufferInterval: 60
 * ```
 */
export interface ICloudWatchFirehoseConfig {
  /**
   * Configuration that will be applicable for firehose delivery of logs in LogArchive
   *
   * @remarks
   * If this property is undefined, firehose delivery will be store logs in MimeType as application/octet-stream
   *
   * @example
   * ```
   * - fileExtension: 'json.gz'
   * ```
   *
   */
  readonly fileExtension?: t.NonEmptyString;
  /**
   * Describes hints for the firehose lambda processor when Amazon Data Firehose recieves data. Amazon Data Firehose can invokes Lambda function to take source data and deliver the data to destination specified in dynamic partition.
   */
  readonly lambdaProcessor?: ICloudWatchFirehoseLambdaProcessorConfig;
}

/**
 * @remarks
 * Lambda processor parameters for Amazon Kinesis DataFirehose
 * Ref:  Ref: https://docs.aws.amazon.com/firehose/latest/dev/data-transformation.html
 *
 * @example
 * ```
 * lambdaProcessor:
 *   retries: 3
 *   bufferSize: 0.2
 *   bufferInterval: 60
 * ```
 */
export interface ICloudWatchFirehoseLambdaProcessorConfig {
  /**
   * @remarks
   * By default, Kinesis Data Firehose retries a Lambda invocation 3 times if the invocation fails.
   * @default 3
   */
  readonly retries?: number;
  /**
   * The AWS Lambda function has a 6 MB invocation payload quota. Your data can expand in size after it's processed by the AWS Lambda function. A smaller buffer size allows for more room should the data expand after processing. Range is 0.2 to 3 MB.
   * @default 0.2
   */
  readonly bufferSize?: number;
  /**
   * The period of time in seconds during which Amazon Data Firehose buffers incoming data before invoking the AWS Lambda function. The AWS Lambda function is invoked once the value of the buffer size or the buffer interval is reached. Range 60 to 900s.
   * @default 60
   */
  readonly bufferInterval?: number;
}

/**
 * *{@link IGlobalConfig} / {@link ILoggingConfig} / {@link ICloudWatchLogsConfig}/ {@link ICloudWatchSubscriptionConfig}*
 *
 * @description
 * Accelerator global CloudWatch Logs subscription configuration
 *
 * @example
 * ```
 *  logging:
 *    cloudwatchLogs:
 *      subscription:
 *        type: ACCOUNT
 *        selectionCriteria: 'LogGroupName NOT IN [ /aws/lambda/AWSAccelerator-FirehoseRecordsProcessor development AppA]'
 *        overrideExisting: true
 * ```
 */
export interface ICloudWatchSubscriptionConfig {
  /**
   * @remarks
   * If this property is undefined, Cloudwatch logs subscription filter will be applied for each log group by a Lambda function rather than through a CloudWatch account-level subscription filter.
   *
   * @example
   * ```
   * type: ACCOUNT
   * ```
   * When set to 'ACCOUNT' account wide subscription is applied as per https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/SubscriptionFilters-AccountLevel.html.
   * When set to 'LOG_GROUP' it will run a function to apply to each log group using a lambda function.
   * Defaults to 'LOG_GROUP'.
   */
  readonly type: 'ACCOUNT' | 'LOG_GROUP';
  /**
   *
   * Only applicable, when type is set to 'ACCOUNT'. The selection criteria is set to take input as string based on service api listed here: https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutAccountPolicy.html
   * @example
   * ```
   * selectionCriteria: 'LogGroupName NOT IN ["/aws/lambda/AWSAccelerator-FirehoseRecordsProcessor", "development", "AppA"]'
   * ```
   * This means log group name /aws/lambda/AWSAccelerator-FirehoseRecordsProcessor, development, AppA will not have a subscription filter. Please use this to prevent log recursion (https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Subscriptions-recursion-prevention.html).
   *
   */
  readonly selectionCriteria?: t.NonEmptyString;
  /**
   * (OPTIONAL) Indicates whether existing CloudWatch Log subscription configuration can be overwritten. Any existing policy will be updated and renamed to 'ACCELERATOR_ACCOUNT_SUBSCRIPTION_POLICY'. Upon deleting the solution or disabling logging for cloudwatch in global config, this policy will be removed. If type is set to 'LOG_GROUP' this parameter will not be used.
   *
   * @default false
   */
  readonly overrideExisting?: boolean;
  /**
   * (OPTIONAL) Indicates whether to apply specific filter pattern to the subscription as per https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CreateSubscriptionFilter-Account.html
   * If no value is provided all logs events will match filter criteria
   *
   * (This property is only applicable when type is set to 'LOG_GROUP'.
   */
  readonly filterPattern?: t.NonEmptyString;
}

/**
 * *{@link IGlobalConfig} / {@link ILoggingConfig} / {@link ICloudWatchLogsConfig}/ {@link ICloudWatchKinesisConfig}*
 *
 * @description
 * Accelerator global CloudWatch Logs Kinesis stream configuration
 *
 * @example
 * ```
 *  logging:
 *    cloudwatchLogs:
 *      kinesis:
 *        streamingMode: PROVISIONED
 *        shardCount: 5
 *        retention: 240
 * ```
 */
export interface ICloudWatchKinesisConfig {
  /**
   * @remarks
   * Specifies the capacity mode to which you want to set your data stream. Currently, in Kinesis Data Streams, you can choose between an on-demand capacity mode and a provisioned capacity mode for your data streams.
   * Please note service might limit how many times you can toggle between stream modes as mentioned on [this page](https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html)
   * Defaults to PROVISIONED.
   * Choose any value based on this page: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-kinesis/Variable/StreamMode/
   * @default PROVISIONED
   */
  readonly streamingMode: StreamMode;
  /**
   * @remarks
   * The number of shards that the stream uses. For greater provisioned throughput, increase the number of shards. This is only applicable if streamingMode is 'PROVISIONED'.
   * The value is ignored if streaming mode is 'ON_DEMAND'
   * Shards cannot be increased more than double. For example, if shard count changes from 1 to 4 then Kinesis service will throw error
   * `UpdateShardCount cannot scale up over double your current open shard count. Current open shard count: 1 Target shard count: 4 `
   * Refer to the API for more details and limitations: https://docs.aws.amazon.com/kinesis/latest/APIReference/API_UpdateShardCount.html
   * Defaults to 1 if unspecified. Should be greater than 0.
   * @default 1
   *
   */
  readonly shardCount?: number;
  /**
   * @remarks
   * The number of hours for the data records that are stored in shards to remain accessible. The default value is 24. For more information about the stream retention period, see Changing the Data Retention Period in the Amazon Kinesis Developer Guide.
   * @link https://docs.aws.amazon.com/streams/latest/dev/kinesis-extended-retention.html
   *
   * The value should be between 24 and 8760
   * @default 24
   */
  readonly retention?: number;
}

/**
 * *{@link IGlobalConfig} / {@link ILoggingConfig} / {@link ICloudWatchLogsConfig}*
 *
 * @description
 * Accelerator global CloudWatch Logs logging configuration
 *
 * @remarks
 * You can decide to use AWS KMS CMK or server-side encryption for the log data at rest. When this `encryption` property is undefined, the solution will deploy AWS KMS CMK to encrypt AWS CloudWatch log data at rest.
 * You can use `deploymentTargets` to control target accounts and regions for the given `useCMK` configuration.
 * please see [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/data-protection.html) or [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html) for more information.
 *
 * Please review [CloudWatch Logs managed data identifiers for sensitive data types](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL-managed-data-identifiers.html) for more information.
 *
 * @example
 * ```
 * cloudwatchLogs:
 *   dynamicPartitioning: path/to/filter.json
 *   # default is true, if undefined this is set to true
 *   # if set to false, no replication is performed which is useful in test or temporary environments
 *   enable: true
 *   encryption:
 *     useCMK: true
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *   replaceLogDestinationArn: arn:aws:logs:us-east-1:111111111111:destination:ReplaceDestination
 *   exclusions:
 *    # in these OUs do not do log replication
 *    - organizationalUnits:
 *        - Research
 *        - ProofOfConcept
 *      excludeAll: true
 *    # in these accounts exclude pattern testApp
 *    - accounts:
 *        - WorkloadAccount1
 *        - WorkloadAccount1
 *      logGroupNames:
 *        - testApp*
 *    # in these accounts exclude logs in specific regions
 *    - accounts:
 *        - WorkloadAccount1
 *        - WorkloadAccount1
 *      regions:
 *        - us-west-2
 *        - eu-west-1
 *      logGroupNames:
 *        - pattern1*
 *   dataProtection:
 *     managedDataIdentifiers:
 *       categories:
 *         - Credentials
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Root
 * ```
 *
 */
export interface ICloudWatchLogsConfig {
  /**
   * Declaration of Dynamic Partition for Kinesis Firehose.
   *
   * @remarks
   * Kinesis firehose Dynamic Partition allows streaming Cloudwatch logs data to be assigned to a specific prefix. The input provided here is the path to log filter JSON file array. More details in the link: https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/centralized-logging.html
   * Each item in the array is of the format
   * ```
   * { "logGroupPattern": "LogGroupName", "s3Prefix": "s3-prefix" }
   * ```
   * The logs end up in central logs bucket under prefix CloudWatchLogs.
   * In the above example, the log group with `LogGroupName` will stream to `s3://<central-logs-bucket>/CloudWatchLogs/s3-prefix/`
   *
   * It is possible to use `*` for grouping log groups into same prefix. So, in the example below:
   * ```
   * [{ "logGroupPattern": "Application*", "s3Prefix": "app" }]
   * ```
   * The above will take log groups with name `ApplicationA`, `ApplicationB`, `ApplicationC` into s3 prefix `app`.
   * Please make sure that `logGroupPattern` do not conflict each other as the logs are streamed to one destination and not replicated.
   * For example, extending the above example to below
   * ```
   * [{ "logGroupPattern": "Application*", "s3Prefix": "app" }, { "logGroupPattern": "App*", "s3Prefix": "apple" }]
   * ```
   * In the above case, logs from `ApplicationA` can either end up in `app` or `apple`. They will not be replicated to both prefixes.
   *
   *  For more information on Kinesis Firehose dynamic partitioning limits please refer to::
   * https://docs.aws.amazon.com/firehose/latest/dev/limits.html
   *
   *
   */
  readonly dynamicPartitioning?: t.NonEmptyString;
  /**
   * Declaration of Dynamic Partitioning for Kinesis Firehose by Account ID.
   *
   * @remarks
   * Kinesis firehose Dynamic Partition by Account ID will add the Account ID that produced the CloudWatch Logs to the partitioning strategy of logs. For example: `s3://<central-logs-bucket>/CloudWatchLogs/<account id>/`
   *
   * If dynamicPartitioning is also being used the Account ID partition will come before the supplied s3 prefix. For example a dynamicPartitioning file with the format
   *  ```
   * { "logGroupPattern": "LogGroupName", "s3Prefix": "s3-prefix" }
   * ```
   * The resulting partitioning strategy would be `s3://<central-logs-bucket>/CloudWatchLogs/<account id>/s3-prefix/`
   *
   *  For more information on Kinesis Firehose dynamic partitioning limits please refer to::
   * https://docs.aws.amazon.com/firehose/latest/dev/limits.html
   *
   *
   */
  readonly dynamicPartitioningByAccountId?: boolean;
  /**
   * Enable or disable CloudWatch replication
   */
  readonly enable?: boolean;
  /**
   * Encryption setting for AWS CloudWatch log group data.
   *
   * @remarks
   *  For more information please refer {@link ServiceEncryptionConfig}
   */
  readonly encryption?: IServiceEncryptionConfig;
  /**
   * Exclude Log Groups during replication
   */
  readonly exclusions?: ICloudWatchLogsExclusionConfig[];
  /**
   * Customer defined log subscription filter destination arn, that is associated with with the existing log group.
   * Accelerator solution needs to disassociate this destination before configuring solution defined subscription filter destination.
   *
   * @default
   * undefined
   *
   * @remarks
   * When no value provided, accelerator solution will not attempt to remove existing customer defined log subscription filter destination.
   * When existing log group(s) have two subscription filter destinations defined, and none of that is solution configured subscription filter destination,
   * then solution will fail to configure log replication for such log groups and as a result pipeline will fail.
   */
  readonly replaceLogDestinationArn?: t.NonEmptyString;
  /**
   * CloudWatch Log data protection configuration
   */
  readonly dataProtection?: ICloudWatchDataProtectionConfig;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig}*
 *
 * @description
 * Global logging configuration
 *
 * @example
 * ```
 * logging:
 *   account: LogArchive
 *   centralizedLoggingRegion: us-east-1
 *   cloudtrail:
 *     enable: false
 *     organizationTrail: false
 *   sessionManager:
 *     sendToCloudWatchLogs: false
 *     sendToS3: true
 * ```
 */
export interface ILoggingConfig {
  /**
   * Accelerator logging account name.
   * Accelerator use LogArchive account for global logging.
   * This account maintains consolidated logs.
   */
  readonly account: t.NonEmptyString;
  /**
   * Accelerator central logs bucket region name.
   * Accelerator use CentralLogs bucket to store various log files, Accelerator created buckets and CWL replicates to CentralLogs bucket.
   * CentralLogs bucket region is optional, when not provided this bucket will be created in Accelerator home region.
   */
  readonly centralizedLoggingRegion?: t.NonEmptyString;
  /**
   * CloudTrail logging configuration
   */
  readonly cloudtrail: ICloudTrailConfig;
  /**
   * SessionManager logging configuration
   */
  readonly sessionManager: ISessionManagerConfig;
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly accessLogBucket?: IAccessLogBucketConfig;
  /**
   * Declaration of a (S3 Bucket) configuration.
   */
  readonly assetBucket?: IAssetBucketConfig;
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly centralLogBucket?: ICentralLogBucketConfig;
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly elbLogBucket?: IElbLogBucketConfig;
  /**
   * CloudWatch Logging configuration.
   */
  readonly cloudwatchLogs?: ICloudWatchLogsConfig;
}

/**
 * *{@link GlobalConfig} / {@link ReportConfig} / {@link CostAndUsageReportConfig}*
 *
 * @description
 * CostAndUsageReport configuration
 *
 * @example
 * ```
 * costAndUsageReport:
 *     compression: Parquet
 *     format: Parquet
 *     reportName: accelerator-cur
 *     s3Prefix: cur
 *     timeUnit: DAILY
 *     refreshClosedReports: true
 *     reportVersioning: CREATE_NEW_REPORT
 *     lifecycleRules:
 *     - enabled: true
 *       id: CostAndUsageBucketLifecycleRule-01
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
 *       id: CostAndUsageBucketLifecycleRule-02
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
export interface ICostAndUsageReportConfig {
  /**
   * A list of strings that indicate additional content that Amazon Web Services includes in the report, such as individual resource IDs.
   */
  readonly additionalSchemaElements?: t.NonEmptyString[];
  /**
   * The compression format that Amazon Web Services uses for the report.
   */
  readonly compression: string;
  /**
   * The format that Amazon Web Services saves the report in.
   */
  readonly format: string;
  /**
   * The name of the report that you want to create. The name must be unique, is case sensitive, and can't include spaces.
   */
  readonly reportName: t.NonEmptyString;
  /**
   * The prefix that Amazon Web Services adds to the report name when Amazon Web Services delivers the report. Your prefix can't include spaces.
   */
  readonly s3Prefix: t.NonEmptyString;
  /**
   * The granularity of the line items in the report.
   */
  readonly timeUnit: 'HOURLY' | 'DAILY' | 'MONTHLY' | string;
  /**
   * A list of manifests that you want Amazon Web Services to create for this report.
   */
  readonly additionalArtifacts?: ('REDSHIFT' | 'QUICKSIGHT' | 'ATHENA' | string)[];
  /**
   * Whether you want Amazon Web Services to update your reports after they have been finalized if Amazon Web Services detects charges related to previous months. These charges can include refunds, credits, or support fees.
   */
  readonly refreshClosedReports: boolean;
  /**
   * Whether you want Amazon Web Services to overwrite the previous version of each report or to deliver the report in addition to the previous versions.
   */
  readonly reportVersioning: 'CREATE_NEW_REPORT' | 'OVERWRITE_REPORT' | string;
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 * *{@link GlobalConfig} / {@link ReportConfig} / {@link BudgetReportConfig} / {@link NotificationConfig}*
 *
 * @description
 * Notification configuration
 *
 * @example
 * ```
 * notifications:
 *  - type: ACTUAL
 *    thresholdType: PERCENTAGE
 *    threshold: 90
 *    comparisonOperator: GREATER_THAN
 *    subscriptionType: EMAIL
 *    recipients:
 *     - myemail+pa1-budg@example.com
 *     - myemail+pa2-budg@example.com
 * ```
 */
export interface INotificationConfig {
  /**
   * The comparison that's used for the notification that's associated with a budget.
   */
  readonly type: t.NotificationType | string;
  /**
   * The type of threshold for a notification.For ABSOLUTE_VALUE thresholds,
   * AWS notifies you when you go over or are forecasted to go over your total cost threshold.
   * For PERCENTAGE thresholds, AWS notifies you when you go over or are forecasted to go over a certain percentage of your forecasted spend.
   * For example,if you have a budget for 200 dollars and you have a PERCENTAGE threshold of 80%, AWS notifies you when you go over 160 dollars.
   */
  readonly thresholdType: t.ThresholdType | string;
  /**
   * The comparison that's used for this notification.
   */
  readonly comparisonOperator: t.ComparisonOperator | string;
  /**
   * The type of threshold associate with a notification.
   */
  readonly threshold?: number;
  /**
   * The address that AWS sends budget notifications to, either an SNS topic or an email.
   *
   * @deprecated
   * This is a temporary property and it has been deprecated.
   * Please use recipients property to specify address for budget notifications.
   */
  readonly address?: t.NonEmptyString;
  /**
   * The recipients list that AWS sends budget notifications to, either an SNS topic or an email.
   */
  readonly recipients?: t.NonEmptyString[];
  /**
   * The type of notification that AWS sends to a subscriber.
   */
  readonly subscriptionType: t.SubscriptionType | string;
}

/**
 * *{@link GlobalConfig} / {@link ReportConfig} / {@link BudgetReportConfig}*
 *
 * @description
 * BudgetReport configuration
 *
 * @example
 * ```
 * budgets:
 *     - name: accel-budget
 *       timeUnit: MONTHLY
 *       type: COST
 *       amount: 2000
 *       includeUpfront: true
 *       includeTax: true
 *       includeSupport: true
 *       includeSubscription: true
 *       includeRecurring: true
 *       includeOtherSubscription: true
 *       includeDiscount: true
 *       includeCredit: false
 *       includeRefund: false
 *       useBlended: false
 *       useAmortized: false
 *       unit: USD
 *       notifications:
 *       - type: ACTUAL
 *         thresholdType: PERCENTAGE
 *         threshold: 90
 *         comparisonOperator: GREATER_THAN
 *         subscriptionType: EMAIL
 *         recipients:
 *          - myemail+pa1-budg@example.com
 *          - myemail+pa2-budg@example.com
 * ```
 */
export interface IBudgetReportConfig {
  /**
   * The cost or usage amount that's associated with a budget forecast, actual spend, or budget threshold.
   *
   * @default 2000
   */
  readonly amount: number;
  /**
   * The name of a budget. The value must be unique within an account. BudgetName can't include : and \ characters. If you don't include value for BudgetName in the template, Billing and Cost Management assigns your budget a randomly generated name.
   */
  readonly name: t.NonEmptyString;
  /**
   * The length of time until a budget resets the actual and forecasted spend. DAILY is available only for RI_UTILIZATION and RI_COVERAGE budgets.
   */
  readonly timeUnit: 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | string;
  /**
   * Specifies whether this budget tracks costs, usage, RI utilization, RI coverage, Savings Plans utilization, or Savings Plans coverage.
   */
  readonly type:
    | 'USAGE'
    | 'COST'
    | 'RI_UTILIZATION'
    | 'RI_COVERAGE'
    | 'SAVINGS_PLANS_UTILIZATION'
    | 'SAVINGS_PLANS_COVERAGE'
    | string;
  /**
   * Specifies whether a budget includes upfront RI costs.
   *
   * @default true
   */
  readonly includeUpfront?: boolean;
  /**
   * Specifies whether a budget includes taxes.
   *
   * @default true
   */
  readonly includeTax?: boolean;
  /**
   * Specifies whether a budget includes support subscription fees.
   *
   * @default true
   */
  readonly includeSupport?: boolean;
  /**
   * Specifies whether a budget includes non-RI subscription costs.
   *
   * @default true
   */
  readonly includeOtherSubscription?: boolean;
  /**
   * Specifies whether a budget includes subscriptions.
   *
   * @default true
   */
  readonly includeSubscription?: boolean;
  /**
   * Specifies whether a budget includes recurring fees such as monthly RI fees.
   *
   * @default true
   */
  readonly includeRecurring?: boolean;
  /**
   * Specifies whether a budget includes discounts.
   *
   * @default true
   */
  readonly includeDiscount?: boolean;
  /**
   * Specifies whether a budget includes refunds.
   *
   * @default true
   */
  readonly includeRefund?: boolean;
  /**
   * Specifies whether a budget includes credits.
   *
   * @default true
   */
  readonly includeCredit?: boolean;
  /**
   * Specifies whether a budget uses the amortized rate.
   *
   * @default false
   */
  readonly useAmortized?: boolean;
  /**
   * Specifies whether a budget uses a blended rate.
   *
   * @default false
   */
  readonly useBlended?: boolean;
  /**
   * The type of notification that AWS sends to a subscriber.
   *
   * An enum value that specifies the target subscription type either EMAIL or SNS
   */
  readonly subscriptionType?: t.SubscriptionType | string;
  /**
   * The unit of measurement that's used for the budget forecast, actual spend, or budget threshold, such as USD or GBP.
   */
  readonly unit?: t.NonEmptyString;
  /**
   * The type of threshold for a notification. For ABSOLUTE_VALUE thresholds,
   * AWS notifies you when you go over or are forecasted to go over your total cost threshold.
   * For PERCENTAGE thresholds, AWS notifies you when you go over or are forecasted to go over a certain percentage of your forecasted spend. For example,
   * if you have a budget for 200 dollars and you have a PERCENTAGE threshold of 80%, AWS notifies you when you go over 160 dollars.
   */
  /**
   * The comparison that's used for the notification that's associated with a budget.
   */
  readonly notifications?: INotificationConfig[];
  /**
   * List of OU's and accounts to be configured for Budgets configuration
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
}

/**
 * {@link GlobalConfig} / {@link ReportConfig}
 *
 * @description
 * Accelerator report configuration
 */
export interface IReportConfig {
  /**
   * Cost and usage report configuration
   *
   * If you want to create cost and usage report with daily granularity of the line items in the report, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * costAndUsageReport:
   *     compression: Parquet
   *     format: Parquet
   *     reportName: accelerator-cur
   *     s3Prefix: cur
   *     timeUnit: DAILY
   *     refreshClosedReports: true
   *     reportVersioning: CREATE_NEW_REPORT
   *     lifecycleRules:
   *       storageClass: DEEP_ARCHIVE
   *       enabled: true
   *       multiPart: 1
   *       expiration: 1825
   *       deleteMarker: false
   *       nonCurrentExpiration: 366
   *       transitionAfter: 365
   * ```
   */
  readonly costAndUsageReport?: ICostAndUsageReportConfig;
  /**
   * Budget report configuration
   *
   * If you want to create budget report with monthly granularity of the line items in the report and other default parameters , you need to provide below value for this parameter.
   *
   * @example
   * ```
   * budgets:
   *     - name: accel-budget
   *       timeUnit: MONTHLY
   *       type: COST
   *       amount: 2000
   *       includeUpfront: true
   *       includeTax: true
   *       includeSupport: true
   *       includeSubscription: true
   *       includeRecurring: true
   *       includeOtherSubscription: true
   *       includeDiscount: true
   *       includeCredit: false
   *       includeRefund: false
   *       useBlended: false
   *       useAmortized: false
   *       unit: USD
   *       notifications:
   *       - type: ACTUAL
   *         thresholdType: PERCENTAGE
   *         threshold: 90
   *         comparisonOperator: GREATER_THAN
   *         subscriptionType: EMAIL
   *         address: myemail+pa-budg@example.com
   * ```
   */
  readonly budgets?: IBudgetReportConfig[];
}

/**
 * *{@link GlobalConfig} / {@link BackupConfig} / {@link VaultConfig}*
 *
 * @description
 * AWS Backup vault configuration
 *
 * @example
 * ```
 * - name: BackupVault
 *   deploymentTargets:
 *     organizationalUnits:
 *      - Root
 *   policy: policies/backup-vault-policy.json
 * ```
 */
export interface IVaultConfig {
  /**
   * Name that will be used to create the vault.
   */
  readonly name: t.NonEmptyString;

  /**
   * Which OU's or Accounts the vault will be deployed to
   */
  readonly deploymentTargets: t.IDeploymentTargets;

  /**
   * The path to a JSON file defining Backup Vault access policy
   */
  readonly policy?: t.NonEmptyString;
}

/**
 * *{@link GlobalConfig} / {@link BackupConfig}*
 *
 * @description
 * AWS Backup configuration
 *
 * @example
 * ```
 * backup:
 *   vaults:
 *     - name: BackupVault
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export interface IBackupConfig {
  /**
   * List of AWS Backup Vaults
   */
  readonly vaults: IVaultConfig[];
}

/**
 *
 * *{@link GlobalConfig} / {@link SnsConfig} / {@link SnsTopicConfig}*
 *
 * @description
 * SNS Topics Configuration
 *
 * To send CloudWatch Alarms and SecurityHub notifications
 * you will need to configure at least one SNS Topic
 * For SecurityHub notification you will need
 * to set the deployment target to Root in order
 * to receive notifications from all accounts
 *
 * @example
 * ```
 * snsTopics:
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   topics:
 *     - name: Security
 *       emailAddresses:
 *         - SecurityNotifications@example.com
 * ```
 */
export interface ISnsTopicConfig {
  /**
   * *{@link GlobalConfig} / {@link SnsTopicConfig} / {@link TopicConfig}*
   *
   * SNS Topic Config
   *
   * @example
   * ```
   * - name: Security
   *   emailAddresses:
   *     - SecurityNotifications@example.com
   * ```
   */
  /**
   * List of SNS Topics definition
   */

  /**
   * SNS Topic Name
   */
  readonly name: t.NonEmptyString;

  /**
   * List of email address for notification
   */
  readonly emailAddresses: t.EmailAddress[];
}

/**
 * *{@link GlobalConfig} / {@link SnsConfig}*
 *
 * @description
 * SNS Configuration
 */
export interface ISnsConfig {
  /**
   * Deployment targets for SNS topics
   * SNS Topics will always be deployed to the Log Archive account
   * email subscriptions will be in the Log Archive account
   * All other accounts and regions will forward to the Logging account
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * List of SNS Topics
   */
  readonly topics?: ISnsTopicConfig[];
}

/**
 * *{@link GlobalConfig} / {@link AcceleratorMetadataConfig}*
 *
 * @description
 * Accelerator Metadata
 *
 * Creates a new bucket in the log archive account to retrieve metadata for the accelerator environment
 *
 * @example
 * ```
 * acceleratorMetadataConfig:
 *   enable: true
 *   account: Logging
 *   readOnlyAccessRoleArns:
 *     - arn:aws:iam::111111111111:role/test-access-role
 * ```
 */
export interface IAcceleratorMetadataConfig {
  /**
   * Enable Accelerator Metadata
   */
  readonly enable: boolean;
  readonly account: string;
  readonly readOnlyAccessRoleArns: string[];
}

/**
 * *{@link GlobalConfig} / {@link AcceleratorSettingsConfig}*
 *
 * @description
 * Accelerator Settings Configuration
 * Allows setting additional properties for accelerator
 *
 * @example
 * ```
 * acceleratorSettings:
 *  maxConcurrentStacks: 250
 * ```
 *
 */
export interface IAcceleratorSettingsConfig {
  /**
   * Accelerator Settings
   */

  /**
   * Set maximum number of concurrent stacks that can be processed at a time while transpiling the application.
   * If no value is specified it defaults to 250
   */
  readonly maxConcurrentStacks?: number;
}

/**
 * *{@link GlobalConfig} / {@link ServiceEncryptionConfig}*
 *
 * @description
 * AWS service encryption configuration settings
 *
 * @example
 * ```
 *  encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export interface IServiceEncryptionConfig {
  /**
   * Flag indicates whether Accelerator deployed AWS Service will use AWS KMS CMK for encryption or Service managed KMS.
   *
   * @remarks
   * When set to `true`, the solution will create AWS KMS CMK which will be used by the service for encryption. Example, when flag set to `true` for AWS Lambda service, the solution will create AWS KMS CMK to encrypt lambda function environment variables, otherwise AWS managed key will be used for environment variables encryption.
   *
   * @default false
   */
  readonly useCMK: boolean;
  /**
   * To control target environments (AWS Account and Region) for the given `useCMK` setting, you may optionally specify deployment targets.
   * Leaving `deploymentTargets` undefined will apply `useCMK` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
}

/**
 * *{@link IGlobalConfig} / {@link ILoggingConfig} / {@link ICloudWatchLogsConfig}/ {@link ICloudWatchDataProtectionConfig} / {@link ICloudWatchManagedDataProtectionIdentifierConfig}*
 *
 * @description
 * AWS CloudWatch log data protection configuration
 *
 * @remarks
 * Currently, only the [`Credentials`](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types-credentials.html) category is supported.
 * @example
 * ```
 *   categories:
 *     - Credentials
 * ```
 */
export interface ICloudWatchManagedDataProtectionIdentifierConfig {
  /**
   * CloudWatch Logs managed data identifiers configuration.
   *
   * @remarks
   * The solution supports only identifiers associated with the `Credentials` category, you can find more information about `Credentials` category [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types-credentials.html)
   *
   * @default Credentials
   */
  readonly categories: `${t.CloudWatchLogDataProtectionCategories}`[];
}

/**
 * *{@link IGlobalConfig} / {@link ILoggingConfig} / {@link ICloudWatchLogsConfig}/ {@link ICloudWatchDataProtectionConfig}*
 *
 * @description
 * AWS CloudWatch Log data protection configuration, you can find more information [here](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/faq/Logging/cwl/)
 *
 * @example
 * ```
 *  dataProtection:
 *    managedDataIdentifiers:
 *      categories:
 *        - Credentials
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export interface ICloudWatchDataProtectionConfig {
  /**
   * CloudWatch Logs managed data identifiers configuration.
   *
   * @remarks
   * Please review [CloudWatch Logs managed data identifiers for sensitive data types](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL-managed-data-identifiers.html) for more information.
   *
   * @default Credentials
   */
  readonly managedDataIdentifiers: ICloudWatchManagedDataProtectionIdentifierConfig;
  /**
   * To control target environments (AWS Account and Region) for the given `categories` setting, you may optionally specify deployment targets.
   * Leaving `deploymentTargets` undefined will apply `categories` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * (OPTIONAL) Indicates whether existing CloudWatch Log data protection configuration can be overwritten.
   *
   * @default false
   */
  readonly overrideExisting?: boolean;
}

/**
 * *{@link GlobalConfig} / {@link lambdaConfig}*
 *
 * @description
 * Lambda Function configuration settings
 *
 * @example
 * ```
 *   encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export interface ILambdaConfig {
  /**
   * Encryption setting for AWS Lambda environment variables.
   *
   * @remarks
   *  For more information please refer {@link ServiceEncryptionConfig}
   */
  readonly encryption?: IServiceEncryptionConfig;
}

/**
 * *{@link GlobalConfig} / {@link sqsConfig}*
 *
 * @description
 * SQS Queue configuration settings
 *
 * @example
 * ```
 *   encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export interface ISqsConfig {
  /**
   * Encryption setting for AWS Lambda environment variables.
   *
   * @remarks
   *  For more information please refer {@link ServiceEncryptionConfig}
   */
  readonly encryption?: IServiceEncryptionConfig;
}

/**
 * *{@link GlobalConfig} / {@link SsmInventoryConfig}*
 *
 * @description
 * SSM Inventory Configuration
 *
 * @example
 * ```
 * ssmInventoryConfig:
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Infrastructure
 * ```
 *
 */
export interface ISsmInventoryConfig {
  /**
   * Enable SSM Inventory
   */
  readonly enable: boolean;
  /**
   * Configure the Deployment Targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link GlobalConfig} / {@link ssmParametersConfig}*
 *
 * @description
 * SSM Parameters Configuration
 *
 * @example
 * ```
 * ssmParameters:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *     parameters:
 *       - name: MyWorkloadParameter
 *         path: /my/custom/path/variable
 *         value: 'MySSMParameterValue'
 * ```
 *
 */
export interface ISsmParametersConfig {
  /**
   * A list of SSM parameters to create
   */
  readonly parameters: ISsmParameterConfig[];
  /**
   * Configure the Deployment Targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link GlobalConfig} / {@link ssmParametersConfig} / {@link ssmParameterConfig}*
 *
 * @description
 * SSM Parameter Configuration
 *
 * @example
 * ```
 * ssmParameters:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *     parameters:
 *       - name: WorkloadsSsmParameter
 *         path: /my/custom/path/variable
 *         value: 'MySSMParameterValue'
 * ```
 *
 */
export interface ISsmParameterConfig {
  /**
   * The friendly name of the SSM Parameter, this is used to generate the CloudFormation Logical Id.
   */
  readonly name: t.NonEmptyString;
  /**
   * The path or name used when creating SSM Parameter.
   */
  readonly path: t.NonEmptyString;
  /**
   * The value of the SSM Parameter
   */
  readonly value: t.NonEmptyString;
}

/**
 * *{@link GlobalConfig} / {@link defaultEventBusConfig}*
 *
 * @description
 * Default Event Bus Configuration
 *
 * @example
 * ```
 * defaultEventBus:
 *   policy: path-to-my-policy
 * ```
 *
 */
export interface IDefaultEventBusConfig {
  /**
   * Resource-based policy definition json file. This file must be present in config repository
   */
  readonly policy: t.NonEmptyString;

  /**
   * Default Event Bus Policy deployment targets.
   *
   * @remarks
   * With this configuration, LZA will deploy the LZA Managed or cust policy provided via the `customPolicyOverride` property to the
   * default event bus resource-based policy for the respective account(s).
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * Accelerator global configuration
 */
export interface IGlobalConfig {
  /**
   * Accelerator home region name. The region where accelerator pipeline deployed.
   *
   * To use us-east-1 as home region for the accelerator, you need to provide below value for this parameter.
   * Note: Variable HOME_REGION created for future usage of home region in the file
   *
   * @example
   * ```
   * homeRegion: &HOME_REGION us-east-1
   * ```
   */
  readonly homeRegion: t.NonEmptyString;
  /**
   * List of AWS Region names where accelerator will be deployed. Home region must be part of this list.
   *
   * To add us-west-2 along with home region for accelerator deployment, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * enabledRegions:
   *   - *HOME_REGION
   *   - us-west-2
   * ```
   */
  readonly enabledRegions: t.Region[];
  /**
   * This role trusts the management account, allowing users in the management
   * account to assume the role, as permitted by the management account
   * administrator. The role has administrator permissions in the new member
   * account.
   *
   * Examples:
   * - AWSControlTowerExecution
   * - OrganizationAccountAccessRole
   */
  readonly managementAccountAccessRole: t.NonEmptyString;
  /**
   * Global {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html | CloudWatch Logs retention in days} configuration.
   *
   * @remarks
   * This retention setting will be applied to all CloudWatch log groups created by the accelerator.
   * Additionally, this retention setting will be applied to any CloudWatch log groups that already exist
   * in the target environment if the log group's retention setting is LOWER than this configured value.
   *
   */
  readonly cloudwatchLogRetentionInDays: number;
  /**
   * ***Deprecated***
   *
   * NOTICE: The configuration of CDK buckets is being moved
   * to cdkOptions in the Global Config. This block is deprecated and
   * will be removed in a future release
   * @see {@link cdkOptionsConfig}
   *
   * To indicate workload accounts should utilize the cdk-assets S3 buckets in the management account, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * centralizeCdkBuckets:
   *   enable: true
   * ```
   */
  readonly centralizeCdkBuckets?: ICentralizeCdkBucketsConfig;
  /**
   * AWS CDK options configuration. This lets you customize the operation of the CDK within LZA, specifically:
   *
   * centralizeBuckets: Enabling this option modifies the CDK bootstrap process to utilize a single S3 bucket per region located in the management account for CDK assets generated by LZA. Otherwise, CDK will create a new S3 bucket in every account and every region supported by LZA.
   * useManagementAccessRole: Enabling this option modifies CDK operations to use the IAM role specified in the `managementAccountAccessRole` option in `global-config.yaml` rather than the default roles created by CDK. Default CDK roles will still be created, but will remain unused. Any stacks previously deployed by LZA will retain their [associated execution role](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html). For more information on these roles, please see [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-contract).
   *
   * @example
   * ```
   * cdkOptions:
   *   centralizeBuckets: true
   *   useManagementAccessRole: true
   * ```
   */
  readonly cdkOptions?: ICdkOptionsConfig;
  /**
   * Whether to enable termination protection for this stack.
   */
  readonly terminationProtection?: boolean;
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * To indicate environment has control tower enabled, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * controlTower:
   *   enable: true
   * ```
   */
  readonly controlTower: IControlTowerConfig;
  /**
   * ExternalLandingZoneResourcesConfig.
   *
   * centralizeBuckets: Enabling this option modifies the CDK bootstrap process to utilize a single S3 bucket per region located in the management account for CDK assets generated by LZA. Otherwise, CDK will create a new S3 bucket in every account and every region supported by LZA.
   *
   * @example
   * ```
   * externalLandingZoneResources:
   *   importExternalLandingZoneResources: false
   * ```
   */
  readonly externalLandingZoneResources?: IExternalLandingZoneResourcesConfig;
  /**
   * Accelerator logging configuration
   *
   * To enable organization trail and session manager logs sending to S3, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * logging:
   *   account: LogArchive
   *   cloudtrail:
   *     enable: false
   *     organizationTrail: false
   *     cloudtrailInsights:
   *       apiErrorRateInsight: true
   *       apiCallRateInsight: true
   *   sessionManager:
   *     sendToCloudWatchLogs: false
   *     sendToS3: true
   *   cloudwatchLogs:
   *     dynamicPartitioning: logging/dynamic-partition.json
   * ```
   */
  readonly logging: ILoggingConfig;
  /**
   * Report configuration
   *
   * To enable budget report along with cost and usage report, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * reports:
   *   costAndUsageReport:
   *     compression: Parquet
   *     format: Parquet
   *     reportName: accelerator-cur
   *     s3Prefix: cur
   *     timeUnit: DAILY
   *     refreshClosedReports: true
   *     reportVersioning: CREATE_NEW_REPORT
   *   budgets:
   *     - name: accel-budget
   *       timeUnit: MONTHLY
   *       type: COST
   *       amount: 2000
   *       includeUpfront: true
   *       includeTax: true
   *       includeSupport: true
   *       includeSubscription: true
   *       includeRecurring: true
   *       includeOtherSubscription: true
   *       includeDiscount: true
   *       includeCredit: false
   *       includeRefund: false
   *       useBlended: false
   *       useAmortized: false
   *       unit: USD
   *       notifications:
   *       - type: ACTUAL
   *         thresholdType: PERCENTAGE
   *         threshold: 90
   *         comparisonOperator: GREATER_THAN
   *         subscriptionType: EMAIL
   *         address: myemail+pa-budg@example.com
   * ```
   */
  readonly reports?: IReportConfig;
  /**
   * AWS Service Quota - Limit configuration
   *
   * To enable limits within service quota, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * limits:
   *   - serviceCode: lambda
   *     quotaCode: L-2ACBD22F
   *     desiredValue: 2000
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Infrastructure
   * ```
   */
  readonly limits?: IServiceQuotaLimitsConfig[];
  /**
   * Backup Vaults Configuration
   *
   * To generate vaults, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * backup:
   *   vaults:
   *     - name: MyBackUpVault
   *       deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   */
  readonly backup?: IBackupConfig;
  /**
   * SNS Topics Configuration
   *
   * To send CloudWatch Alarms and SecurityHub notifications
   * you will need to configure at least one SNS Topic
   * For SecurityHub notification you will need
   * to set the deployment target to Root in order
   * to receive notifications from all accounts
   *
   * @example
   * ```
   * snsTopics:
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Root
   *   topics:
   *     - name: Security
   *       emailAddresses:
   *         - SecurityNotifications@example.com
   * ```
   */
  readonly snsTopics?: ISnsConfig;
  /**
   * SSM Inventory Configuration
   *
   * [EC2 prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-inventory-walk.html)
   * [Connectivity prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-prereqs.html)
   *
   * @example
   * ```
   * ssmInventory:
   *   enable: true
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Infrastructure
   * ```
   *
   */
  readonly ssmInventory?: ISsmInventoryConfig;
  /**
   * Custom Tags for all resources created by Landing Zone Accelerator that can be tagged.
   *
   * @example
   * ```
   * tags:
   *   - key: Environment
   *     value: Dev
   *   - key: ResourceOwner
   *     value: AcmeApp
   *   - key: CostCenter
   *     value: '123'
   * ```
   **/
  readonly tags?: t.ITag[];
  /**
   * SSM parameter configurations
   *
   * Create SSM parameters through the LZA. Parameters can be deployed to Organizational Units or Accounts using deploymentTargets
   *
   * @example
   * ```
   * ssmParameters:
   *   - deploymentTargets:
   *       organizationalUnits:
   *         - Workloads
   *     parameters:
   *       - name: WorkloadParameter
   *         path: /my/custom/path/variable
   *         value: 'MySSMParameterValue'
   * ```
   */
  readonly ssmParameters?: ISsmParametersConfig[];
  /**
   * Accelerator Metadata Configuration
   * Creates a bucket in the logging account to enable accelerator metadata collection
   *
   * @example
   * ```
   * acceleratorMetadata:
   *   enable: true
   *   account: Logging
   * ```
   *
   */
  readonly acceleratorMetadata?: IAcceleratorMetadataConfig;
  /**
   * Accelerator Settings Configuration
   * Allows setting additional properties for accelerator
   *
   * @example
   * ```
   * acceleratorSettings:
   *  maxConcurrentStacks: 250
   * ```
   *
   */
  readonly acceleratorSettings?: IAcceleratorSettingsConfig;

  /**
   * AWS Lambda Function environment variables encryption configuration options.
   *
   * @remarks
   * You can decide to use AWS KMS CMK or AWS managed key for Lambda function environment variables encryption. When this property is undefined, the solution will deploy AWS KMS CMK to encrypt function environment variables.
   * You can use `deploymentTargets` to control target accounts and regions for the given `useCMK` configuration.
   *
   *  For more information please see [here](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-encryption)
   *
   * @example
   * ```
   * lambda:
   *   encryption:
   *    useCMK: true
   *    deploymentTargets:
   *      organizationalUnits:
   *        - Root
   * ```
   */
  readonly lambda?: ILambdaConfig;
  /**
   * AWS S3 global configuration options.
   *
   * @remarks
   * You can decide to create AWS KMS CMK for AWS S3 server side encryption.  When this property is undefined, the solution will deploy AWS KMS CMK to encrypt AWS S3 bucket.
   * You can use `deploymentTargets` to control target accounts and regions for the given `createCMK` configuration.
   * This configuration is not applicable to LogArchive's central logging region, because the solution deployed CentralLogs bucket always encrypted with AWS KMS CMK.
   * This configuration is not applicable to the Management account Asset bucket in the home region. This bucket will always have a key generated and applied to the bucket if it is created.
   * This configuration is not applicable to the assets S3 bucket if the bucket is created. This bucket will always have a key generated and applied.
   *
   *  For more information please see [here](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html)
   *
   * @example
   * ```
   * s3:
   *   createCMK: true
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Root
   * ```
   */
  readonly s3?: IS3GlobalConfig;
  /**
   * Whether to automatically enable opt-in regions configured for all LZA managed accounts.
   */
  readonly enableOptInRegions?: boolean;
  /**
   * Configuration for the Default Event Bus
   *
   * End-users provide a custom policy, via the `policy` property, LZA will apply the
   * custom policy to the default event bus policy.
   *
   * @example
   * ```
   * defaultEventBus:
   *   policy: path-to-my-policy.json
   *   deploymentTargets:
   *     accounts:
   *       - Management
   * }
   * ```
   */
  readonly defaultEventBus?: IDefaultEventBusConfig;
}
