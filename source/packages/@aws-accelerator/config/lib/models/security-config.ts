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

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SnsSubscriptionConfig}*
 *
 * @description
 * AWS SNS Notification subscription configuration
 * ***Deprecated***
 * Replaced by snsTopics in global config
 *
 * @example
 * ```
 * snsSubscriptions:
 *     - level: High
 *       email: <notify-high>@example.com
 *     - level: Medium
 *       email: <notify-medium>@example.com
 *     - level: Low
 *       email: <notify-low>@example.com
 * ```
 */
export interface ISnsSubscriptionConfig {
  /**
   * Notification level high, medium or low
   */
  readonly level: t.NonEmptyString;
  /**
   * Subscribing email address
   */
  readonly email: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link S3PublicAccessBlockConfig}*
 *
 * {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html} | AWS S3 block public access configuration.
 *
 * @description
 * This will create the Public Access Block configuration for the AWS account.
 *
 * @remarks
 * If the `PublicAccessBlock` configurations are different between the bucket and the account, Amazon S3 will align with
 * the most restrictive combination between the bucket-level and account-level settings.
 *
 * @example
 * ```
 * s3PublicAccessBlock:
 *     enable: true
 *     excludeAccounts: []
 * ```
 */
export interface IS3PublicAccessBlockConfig {
  /**
   * Indicates whether AWS S3 block public access is enabled.
   */
  readonly enable: boolean;
  /**
   * List of AWS Account names to be excluded from configuring S3 PublicAccessBlock
   */
  readonly excludeAccounts?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link ScpRevertChangesConfig}*
 *
 * @description
 * AWS Service Control Policies Revert Manual Changes configuration
 *
 * @example
 * ```
 * scpRevertChangesConfig:
 *     enable: true
 *     snsTopicName: Security
 * ```
 */
export interface IScpRevertChangesConfig {
  /**
   * Indicates whether manual changes to Service Control Policies are automatically reverted.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) The name of the SNS Topic to send alerts to when SCPs are changed manually
   */
  readonly snsTopicName?: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link KeyManagementServiceConfig} / {@link KeyConfig}*
 *
 * {@link https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#key-mgmt} | AWS KMS Key configuration.
 *
 * @description
 * Use this configuration to define your customer managed key (CMK) and where it's deployed to along with
 * it's management properties.
 *
 * @example
 * ```
 * - name: ExampleKey
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   alias: alias/example/key
 *   policy: path/to/policy.json
 *   description: Example KMS key
 *   enabled: true
 *   enableKeyRotation: true
 *   removalPolicy: retain
 * ```
 */
export interface IKeyConfig {
  /**
   * Unique Key name for logical reference
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) Initial alias to add to the key
   *
   * @remarks
   *
   * Note: If changing this value, a new CMK with the new alias will be created.
   */
  readonly alias?: t.NonEmptyString;
  /**
   * (OPTIONAL)Key policy file path. This file must be available in accelerator config repository.
   */
  readonly policy?: t.NonEmptyString;
  /**
   * (OPTIONAL) A description of the key.
   */
  readonly description?: t.NonEmptyString;
  /**
   * (OPTIONAL) Indicates whether AWS KMS rotates the key.
   * @default true
   */
  readonly enableKeyRotation?: boolean;
  /**
   * (OPTIONAL) Indicates whether the key is available for use.
   * @default - Key is enabled.
   */
  readonly enabled?: boolean;
  /**
   * (OPTIONAL) Whether the encryption key should be retained when it is removed from the Stack.
   * @default retain
   */
  readonly removalPolicy?: 'destroy' | 'retain' | 'snapshot';
  /**
   * This configuration determines which accounts and/or OUs the CMK is deployed to.
   *
   * To deploy KMS key into Root and Infrastructure organizational units, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * - deploymentTargets:
   *         organizationalUnits:
   *           - Root
   *           - Infrastructure
   * ```
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link MacieConfig}*
 *
 * @description
 * Amazon Macie Configuration
 * Use this configuration to enable Amazon Macie within your AWS Organization along with it's reporting configuration.
 *
 * @example
 * ```
 * macie:
 *     enable: true
 *     excludeRegions: []
 *     policyFindingsPublishingFrequency: FIFTEEN_MINUTES
 *     publishSensitiveDataFindings: true
 * ```
 */
export interface IMacieConfig {
  /**
   * Indicates whether AWS Macie enabled.
   */
  readonly enable: boolean;
  /**
   * List of AWS Region names to be excluded from configuring Amazon Macie
   */
  readonly excludeRegions?: t.Region[];
  /**
   * (OPTIONAL) Specifies how often to publish updates to policy findings for the account. This includes publishing updates to Security Hub and Amazon EventBridge (formerly called Amazon CloudWatch Events).
   * An enum value that specifies how frequently findings are published
   * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
   */
  readonly policyFindingsPublishingFrequency?: 'FIFTEEN_MINUTES' | 'ONE_HOUR' | 'SIX_HOURS';
  /**
   * Specifies whether to publish sensitive data findings to Security Hub. If you set this value to true, Amazon Macie automatically publishes all sensitive data findings that weren't suppressed by a findings filter. The default value is false.
   */
  readonly publishSensitiveDataFindings: boolean;
  /**
   * Specifies whether to publish findings at all
   */
  readonly publishPolicyFindings?: boolean;
  /**
   * (OPTIONAL) Declaration of a S3 Lifecycle rule.
   */
  readonly lifecycleRules?: t.ILifecycleRule[] | undefined;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyS3ProtectionConfig}*
 *
 * {@link https://docs.aws.amazon.com/guardduty/latest/ug/s3-protection.html} | AWS GuardDuty S3 Protection configuration.
 *
 * @description
 * Use this configuration to enable S3 Protection with Amazon GuardDuty to monitor object-level API operations for potential
 * security risks for data within Amazon S3 buckets.
 *
 * @example
 * ```
 * enable: true
 * excludeRegions: []
 * ```
 */
export interface IGuardDutyS3ProtectionConfig {
  /**
   * Indicates whether AWS GuardDuty S3 Protection enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty S3 Protection
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * AWS GuardDuty EKS Protection configuration.
 */
export interface IGuardDutyEksProtectionConfig {
  /**
   * Indicates whether AWS GuardDuty EKS Protection enabled.
   */
  readonly enable: boolean;
  /**
   * Indicates whether AWS GuardDuty EKS Agent is managed.
   */
  readonly manageAgent?: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty EKS Protection
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * AWS GuardDuty EC2 Malware Protection configuration.
 */
export interface IGuardDutyEc2ProtectionConfig {
  /**
   * Indicates whether AWS GuardDuty EC2 Malware Protection is enabled.
   */
  readonly enable: boolean;
  /**
   * Indicates whether AWS GuardDuty EC2 Malware Protection should retain snapshots on findings.
   */
  readonly keepSnapshots: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty EC2 Malware Protection
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * AWS GuardDuty RDS Malware Protection configuration.
 */
export interface IGuardDutyRdsProtectionConfig {
  /**
   * Indicates whether AWS GuardDuty RDS Malware Protection is enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty RDS Malware Protection
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * AWS GuardDuty Lambda Malware Protection configuration.
 */
export interface IGuardDutyLambdaProtectionConfig {
  /**
   * Indicates whether AWS GuardDuty Lambda Malware Protection is enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty Lambda Malware Protection
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyExportFindingsConfig}*
 *
 * {@link https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_exportfindings.html} | AWS GuardDuty Export Findings configuration.
 *
 * @description
 * Use this configuration to export Amazon GuardDuty findings to Amazon CloudWatch Events, and, optionally, to an Amazon S3 bucket.
 *
 * @example
 * ```
 * enable: true
 * overrideExisting: true
 * destinationType: S3
 * exportFrequency: FIFTEEN_MINUTES
 * ```
 */
export interface IGuardDutyExportFindingsConfig {
  /**
   * Indicates whether AWS GuardDuty Export Findings enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) Indicates whether AWS GuardDuty Export Findings can be overwritten.
   */
  readonly overrideExisting?: boolean;
  /**
   * The type of resource for the publishing destination. Currently only Amazon S3 buckets are supported.
   */
  readonly destinationType: 'S3';
  /**
   * An enum value that specifies how frequently findings are exported, such as to CloudWatch Events.
   * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
   */
  readonly exportFrequency: 'FIFTEEN_MINUTES' | 'ONE_HOUR' | 'SIX_HOURS';
  /**
   * (OPTIONAL) AWS GuardDuty Prefix for centralized logging path.
   */
  readonly overrideGuardDutyPrefix?: t.IPrefixConfig;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig}*
 *
 * @description
 * AWS GuardDuty configuration
 * Use this configuration to enable Amazon GuardDuty for an AWS Organization, as well as other modular
 * feature protections.
 *
 *
 * @example
 * ```
 * guardduty:
 *   enable: true
 *   excludeRegions: []
 *   s3Protection:
 *     enable: true
 *     excludeRegions: []
 *   eksProtection:
 *     enable: true
 *     excludedRegions: []
 *   ec2Protection:
 *     enable: true
 *     keepSnapshot: true
 *     excludedRegions: []
 *   rdsProtection:
 *     enable: true
 *     excludedRegions: []
 *   lambdaProtection:
 *     enable: true
 *     excludedRegions: []
 *   exportConfiguration:
 *     enable: true
 *     overrideExisting: true
 *     destinationType: S3
 *     exportFrequency: FIFTEEN_MINUTES
 *   lifecycleRules: []
 * ```
 */
export interface IGuardDutyConfig {
  /**
   * Indicates whether AWS GuardDuty enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty
   *
   * Please only specify one of the `excludeRegions` or `deploymentTargets` properties.
   *
   */
  readonly excludeRegions?: t.Region[];
  /**
   * (OPTIONAL) Deployment targets for GuardDuty
   *
   * We highly recommend enabling GuardDuty across all accounts and enabled regions within your organization.
   * `deploymentTargets` should only be used when more granular control is required, not as a default configuration
   * Please only specify one of the `deploymentTargets` or `excludeRegions` properties.
   *
   * Note: The delegated admin account defined in centralSecurityServices will always have GuardDuty enabled
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * (OPTIONAL) Enables/disables the auto enabling of GuardDuty for any account including the new accounts joining the organization
   *
   * It is recommended to set the value to `false` when using the `deploymentTargets` property to enable GuardDuty only on targeted accounts mentioned in the deploymentTargets. If you do not define or do not set it to `false` any new accounts joining the organization will automatically be enabled with GuardDuty.
   *
   * @default true
   */
  readonly autoEnableOrgMembers?: boolean;
  /**
   * AWS GuardDuty S3 Protection configuration.
   * @type object
   */
  readonly s3Protection: IGuardDutyS3ProtectionConfig;
  /**
   * (OPTIONAL) AWS GuardDuty EKS Protection configuration.
   * @type object
   */
  readonly eksProtection?: IGuardDutyEksProtectionConfig;
  /**
   * (OPTIONAL) AWS GuardDuty EC2 Protection configuration.
   * @type object
   */
  readonly ec2Protection?: IGuardDutyEc2ProtectionConfig;
  /**
   * (OPTIONAL) AWS GuardDuty RDS Protection configuration.
   * @type object
   */
  readonly rdsProtection?: IGuardDutyRdsProtectionConfig;
  /**
   * (OPTIONAL) AWS GuardDuty Lambda Protection configuration.
   * @type object
   */
  readonly lambdaProtection?: IGuardDutyLambdaProtectionConfig;

  /**
   * AWS GuardDuty Export Findings configuration.
   * @type object
   */
  readonly exportConfiguration: IGuardDutyExportFindingsConfig;
  /**
   * (OPTIONAL) Declaration of a S3 Lifecycle rule.
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link AuditManagerConfig} / {@link AuditManagerDefaultReportsDestinationConfig}*
 *
 * @description
 * AWS Audit Manager Default Reports Destination configuration.
 * Use this configuration to enable a destination for reports generated by AWS Audit Manager.
 *
 * @example
 * ```
 * enable: true
 * destinationType: S3
 * ```
 */
export interface IAuditManagerDefaultReportsDestinationConfig {
  /**
   * Indicates whether AWS Audit Manager Default Reports enabled.
   */
  readonly enable: boolean;
  /**
   * The type of resource for the publishing destination. Currently only Amazon S3 buckets are supported.
   */
  readonly destinationType: 'S3';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link AuditManagerConfig}*
 *
 * {@link https://docs.aws.amazon.com/audit-manager/latest/userguide/what-is.html } | AWS Audit Manager configuration
 *
 * @description
 * Use this configuration to enable AWS Audit Manager for an AWS Organization.
 *
 * @example
 * ```
 * auditManager:
 *   enable: true
 *   excludeRegions: []
 *   defaultReportsConfiguration:
 *     enable: true
 *     destinationType: S3
 *   lifecycleRules: []
 * ```
 */
export interface IAuditManagerConfig {
  /**
   * Indicates whether AWS Audit Manager enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring AWS Audit Manager. Please ensure any regions enabled in the global configuration that do not support Audit Manager are added to the excluded regions list. {@link https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/ | Supported services by region}.
   */
  readonly excludeRegions?: t.Region[];
  /**
   * AWS Audit Manager Default Reports configuration.
   * @type object
   */
  readonly defaultReportsConfiguration: IAuditManagerDefaultReportsDestinationConfig;
  /**
   * (OPTIONAL) Declaration of a S3 Lifecycle rule.
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link DetectiveConfig}*
 *
 * {@link https://docs.aws.amazon.com/detective/latest/adminguide/what-is-detective.html} | Amazon Detective configuration
 *
 * @description
 * Use this configuration to enable Amazon Detective for an AWS Organization that allows users to analyze, investigate, and
 * quickly identify the root cause of security findings or suspicious activities.
 *
 * @example
 * ```
 * detective:
 *   enable: true
 *   excludeRegions: []
 * ```
 */
export interface IDetectiveConfig {
  /**
   * Indicates whether Amazon Detective is enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon Detective. Please ensure any regions enabled in the global configuration that do not support Amazon Detective are added to the excluded regions list. {@link https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/ | Supported services by region}.
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubStandardConfig}*
 *
 * {@link https://docs.aws.amazon.com/securityhub/latest/userguide/standards-reference.html} | AWS Security Hub standards configuration.
 *
 * @description
 * Use this configuration to define the security standard(s) that are enabled through Amazon Security Hub and which accounts and/or
 * organization units that the controls are deployed to.
 *
 * @example
 * ```
 * - name: PCI DSS v3.2.1
 *   deploymentTargets:
 *    organizationalUnits:
 *     -  Root
 *   enable: true
 *   controlsToDisable:
 *     # Refer to the document for the controls
 *     # https://docs.aws.amazon.com/securityhub/latest/userguide/pci-standard.html
 *     - Control1
 *     - Control2
 * ```
 */
export interface ISecurityHubStandardConfig {
  /**
   * An enum value that specifies one of three security standards supported by Security Hub
   * Possible values are 'AWS Foundational Security Best Practices v1.0.0',
   * 'CIS AWS Foundations Benchmark v1.2.0',
   * 'CIS AWS Foundations Benchmark v1.4.0',
   * 'CIS AWS Foundations Benchmark v3.0.0',
   * 'NIST Special Publication 800-53 Revision 5,
   * and 'PCI DSS v3.2.1'
   */
  readonly name:
    | 'AWS Foundational Security Best Practices v1.0.0'
    | 'CIS AWS Foundations Benchmark v1.2.0'
    | 'CIS AWS Foundations Benchmark v1.4.0'
    | 'CIS AWS Foundations Benchmark v3.0.0'
    | 'NIST Special Publication 800-53 Revision 5'
    | 'PCI DSS v3.2.1'
    | '';
  /**
   * (OPTIONAL) Deployment targets for AWS Security Hub standard.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * Indicates whether given AWS Security Hub standard enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) An array of control names to be disabled for the given security standards
   */
  readonly controlsToDisable?: t.NonEmptyString[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubLoggingConfig} / {@link SecurityHubLoggingCloudwatchConfig}*
 *
 * @description
 * Security Hub Logging CloudWatch Config
 *
 * @example
 * ```
 * enable: true
 * logLevel: MEDIUM
 * ```
 */
export interface ISecurityHubLoggingCloudwatchConfig {
  /**
   * Security hub to cloudwatch logging is enabled by default.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) CloudWatch Log Group Name
   * @remarks
   * Note: Log Group name must be unique in the account and region.
   *
   * The name of the log group SecurityHub Events are forwarded to. LZA will create a
   * log group with this name if the property is provided, unless the log group already exists.
   */
  readonly logGroupName?: string;
  /**
   * (OPTIONAL) Security Hub logging level
   *
   * @remarks
   * Note: Values accepted are CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL
   *
   * Security Hub findings for events at the Level provided and above will be logged to CloudWatch Logs
   * For example, if you specify the HIGH level findings will be sent to CloudWatch Logs for HIGH and CRITICAL
   */
  readonly logLevel?: t.SecurityHubSeverityLevel;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubLoggingConfig}*
 *
 * @description
 * Security Hub Logging Config
 *
 * @example
 * ```
 * logging:
 *   cloudWatch:
 *     enable: true
 *     logLevel: MEDIUM
 *     logGroupName: /Custom/SecurityHubLogGroup
 * ```
 */
export interface ISecurityHubLoggingConfig {
  /**
   * Data store to ship the Security Hub logs to.
   */
  readonly cloudWatch?: ISecurityHubLoggingCloudwatchConfig;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig}*
 *
 * {@link https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html} | AWS Security Hub configuration
 *
 * @description
 * Use this configuration to enable Amazon Security Hub for an AWS Organization along with it's auditing configuration.
 *
 * @example
 * ```
 * securityHub:
 *   enable: true
 *   regionAggregation: true
 *   excludeRegions: []
 *   standards:
 *     - name: AWS Foundational Security Best Practices v1.0.0
 *       deploymentTargets:
 *       organizationalUnits:
 *         -  Root
 *       enable: true
 *       controlsToDisable:
 *         # Refer to the document for the controls
 *         # https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html
 *         - Control1
 *         - Control2
 *   logging:
 *     cloudWatch:
 *       enable: true
 *       logLevel: MEDIUM
 * ```
 */
export interface ISecurityHubConfig {
  /**
   * Indicates whether AWS Security Hub is enabled (AWSConfig is required for enabling SecurityHub)
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) Indicates whether Security Hub results are aggregated in the Home Region.
   */
  readonly regionAggregation?: boolean;
  /**
   * (OPTIONAL) SNS Topic for Security Hub notifications.
   *
   * @remarks
   * Note: Topic must exist in the global config
   */
  readonly snsTopicName?: string;
  /**
   * (OPTIONAL) Security Hub notification level
   *
   * @remarks
   * Note: Values accepted are CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL
   *
   * Notifications will be sent for events at the Level provided and above
   * Example, if you specify the HIGH level notifications will
   * be sent for HIGH and CRITICAL
   */
  readonly notificationLevel?: string;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Security Hub
   */
  readonly excludeRegions?: t.Region[];
  /**
   * (OPTIONAL) Deployment targets for SecurityHub
   *
   * We highly recommend enabling SecurityHub across all accounts and enabled regions within your organization.
   * `deploymentTargets` should only be used when more granular control is required, not as a default configuration
   * Please only specify one of the `deploymentTargets` or `excludeRegions` properties.
   *
   * Note: The delegated admin account defined in centralSecurityServices will always have SecurityHub enabled.
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * (OPTIONAL) Enables/disables the auto enabling of SecurityHub for any account including the new accounts joining the organization
   *
   * It is recommended to set the value to `false` when using the `deploymentTargets` property to enable SecurityHub only on targeted accounts mentioned in the deploymentTargets. If you do not define or do not set it to `false` any new accounts joining the organization will automatically be enabled with SecurityHub.
   *
   * @default true
   */
  readonly autoEnableOrgMembers?: boolean;
  /**
   * Security Hub standards configuration
   */
  readonly standards: ISecurityHubStandardConfig[];
  /**
   * (OPTIONAL) Security Hub logs are sent to CloudWatch logs by default. This option can enable or disable the logging.
   *
   * @remarks
   * By default, if nothing is given `true` is taken. In order to stop logging, set this parameter to `false`.
   * Please note, this option can be toggled but log group with `/${acceleratorPrefix}-SecurityHub` will remain in the account for every enabled region and will need to be manually deleted. This is designed to ensure no accidental loss of data occurs.
   */
  readonly logging?: ISecurityHubLoggingConfig;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link EbsDefaultVolumeEncryptionConfig}*
 *
 * {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html#encryption-by-default | AWS EBS default encryption} configuration.
 *
 * @description
 * Use this configuration to enable enforced encryption of new EBS volumes and snapshots created in an AWS environment.
 *
 * @example
 * Deployment targets:
 * ```
 * ebsDefaultVolumeEncryption:
 *     enable: true
 *     kmsKey: ExampleKey
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 * ```
 *
 * Excluded regions:
 * ```
 * ebsDefaultVolumeEncryption:
 *     enable: true
 *     kmsKey: ExampleKey
 *     excludeRegions: []
 * ```
 */
export interface IEbsDefaultVolumeEncryptionConfig {
  /**
   * Indicates whether AWS EBS volume have default encryption enabled.
   */
  readonly enable: boolean;
  /**
   * (OPTIONAL) KMS key to encrypt EBS volume.
   *
   * @remarks
   * Note: When no value is provided Landing Zone Accelerator will create the KMS key.
   */
  readonly kmsKey?: t.NonEmptyString;
  /**
   * (OPTIONAL) Deployment targets for EBS default volume encryption
   *
   * @remarks
   * You can limit the OUs, accounts, and regions that EBS default volume encryption is deployed to. Please
   * only specify one of the `deploymentTargets` or `excludeRegions` properties. `deploymentTargets` allows you
   * to be more granular about where default EBS volume encryption is enabled across your environment.
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring AWS EBS volume default encryption
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig} / {@link DocumentSetConfig} / {@link DocumentConfig}*
 *
 * {@link https://docs.aws.amazon.com/systems-manager/latest/userguide/documents.html} | AWS Systems Manager document configuration
 *
 * @description
 * Use this configuration to define AWS System Manager documents (SSM documents) that can be used on managed instances in an
 * environment.
 *
 * @example
 * ```
 * - name: SSM-ELB-Enable-Logging
 *   template: path/to/document.yaml
 * ```
 */
export interface IDocumentConfig {
  /**
   * Name of document to be created
   */
  readonly name: t.NonEmptyString;
  /**
   * Document template file path. This file must be available in accelerator config repository.
   */
  readonly template: t.NonEmptyString;
  /**
   * Specify a target type to define the kinds of resources the document can run on. For example, to run a document on EC2 instances, specify the following value: /AWS::EC2::Instance. If you specify a value of '/' the document can run on all types of resources. If you don't specify a value, the document can't run on any resources. For a list of valid resource types, see AWS resource and property types reference in the AWS CloudFormation User Guide.
   * Ref: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html
   * Length Constraints: Maximum length of 200.
   * Pattern: ^\/[\w\.\-\:\/]*$
   */
  readonly targetType?: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig} / {@link DocumentSetConfig}*
 *
 * @description
 * AWS Systems Manager document sharing configuration
 *
 * @example
 * ```
 * - shareTargets:
 *     organizationalUnits:
 *       - Root
 *   documents:
 *     - name: SSM-ELB-Enable-Logging
 *       template: path/to/document.yaml
 * ```
 */
export interface IDocumentSetConfig {
  /**
   * Document share target, valid value should be any organizational unit.
   * Document will be shared with every account within the given OU
   */
  readonly shareTargets: t.IShareTargets;
  /**
   * List of the documents to be shared
   */
  readonly documents: IDocumentConfig[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig}*
 *
 * @description
 * AWS Systems Manager automation configuration
 *
 * @example
 * ```
 * ssmAutomation:
 *     excludeRegions: []
 *     documentSets:
 *       - shareTargets:
 *           organizationalUnits:
 *             - Root
 *         documents:
 *           - name: SSM-ELB-Enable-Logging
 *             template: path/to/document.yaml
 * ```
 */
export interface ISsmAutomationConfig {
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring block S3 public access
   */
  readonly excludeRegions?: t.Region[];
  /**
   * List of documents for automation
   */
  readonly documentSets: IDocumentSetConfig[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig}*
 *
 * @description
 * AWS Accelerator central security services configuration
 *
 * @example
 * ```
 * centralSecurityServices:
 *   delegatedAdminAccount: Audit
 *   ebsDefaultVolumeEncryption:
 *     enable: true
 *     excludeRegions: []
 *   s3PublicAccessBlock:
 *     enable: true
 *     excludeAccounts: []
 *   scpRevertChangesConfig:
 *     enable: true
 *     snsTopicName: Security
 *   guardduty:
 *     enable: true
 *     excludeRegions: []
 *     s3Protection:
 *       enable: true
 *       excludeRegions: []
 *     eksProtection:
 *       enable: true
 *       excludeRegions: []
 *     exportConfiguration:
 *       enable: true
 *       overrideExisting: true
 *       destinationType: S3
 *       exportFrequency: FIFTEEN_MINUTES
 *   macie:
 *     enable: true
 *     excludeRegions: []
 *     policyFindingsPublishingFrequency: FIFTEEN_MINUTES
 *     publishSensitiveDataFindings: true
 *   snsSubscriptions: []
 *   securityHub:
 *     enable: true
 *     regionAggregation: true
 *     snsTopicName: Security
 *     notificationLevel: HIGH
 *     excludeRegions: []
 *     standards:
 *       - name: AWS Foundational Security Best Practices v1.0.0
 *         enable: true
 *       - name: PCI DSS v3.2.1
 *         enable: true
 *         controlsToDisable:
 *           # Refer to the document for the controls
 *           # https://docs.aws.amazon.com/securityhub/latest/userguide/pci-standard.html
 *           - Control1
 *           - Control2
 *       - name: CIS AWS Foundations Benchmark v1.2.0
 *         enable: true
 *       - name: CIS AWS Foundations Benchmark v1.4.0
 *         enable: true
 *         controlsToDisable:
 *           # Refer to the document for the controls
 *           # https://docs.aws.amazon.com/securityhub/latest/userguide/cis-aws-foundations-benchmark.html#cis1v4-standard
 *           - Control1
 *           - Control2
 *       - name: CIS AWS Foundations Benchmark v3.0.0
 *         enable: true
 *       - name: NIST Special Publication 800-53 Revision 5
 *         enable: true
 *         controlsToDisable:
 *           # Refer to the document for the controls
 *           # https://docs.aws.amazon.com/securityhub/latest/userguide/nist-standard.html
 *           - Control1
 *           - Control2
 *   ssmAutomation:
 *     documentSets: []
 *```
 */
export interface ICentralSecurityServicesConfig {
  /**
   * Designated administrator account name for accelerator security services.
   * AWS organizations designate a member account as a delegated administrator for the
   * organization users and roles from that account can perform administrative actions for security services like
   * Macie, GuardDuty, Detective and Security Hub. Without designated administrator account administrative tasks for
   * security services are performed only by users or roles in the organization's management account.
   * This helps you to separate management of the organization from management of these security services.
   * Accelerator currently supports using the Audit account **only** as the delegated administrator account.
   * @type string
   * @default Audit
   *
   * @important
   * **The delegated administrator account name must exactly match the Audit account name in the accounts-config.yaml file (including letter case). Any mismatch will result in a validation error.**
   *
   * To make Audit account as designated administrator account for every security services configured by accelerator, you need to provide below value for this parameter
   * @example
   * ```
   * delegatedAdminAccount: Audit
   * ```
   */
  readonly delegatedAdminAccount: t.NonEmptyString;
  /**
   * AWS Elastic Block Store default encryption configuration
   *
   * Accelerator use this parameter to configure EBS default encryption.
   * Accelerator will create KMS key for every AWS environment (account and region), which will be used as default EBS encryption key.
   *
   * To enable EBS default encryption in every region accelerator implemented, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * ebsDefaultVolumeEncryption:
   *     enable: true
   *     excludeRegions: []
   * ```
   */
  readonly ebsDefaultVolumeEncryption: IEbsDefaultVolumeEncryptionConfig;
  /**
   * AWS S3 public access block configuration
   *
   * Accelerator use this parameter to block AWS S3 public access
   *
   * To enable S3 public access blocking in every region accelerator implemented, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * s3PublicAccessBlock:
   *     enable: true
   *     excludeAccounts: []
   * ```
   */
  readonly s3PublicAccessBlock: IS3PublicAccessBlockConfig;
  /**
   * (OPTIONAL) AWS Service Control Policies Revert Manual Changes configuration
   *
   * @example
   * ```
   * scpRevertChangesConfig:
   *     enable: true
   *     snsTopicName: Security
   * ```
   */
  readonly scpRevertChangesConfig?: IScpRevertChangesConfig;
  /**
   * AWS SNS subscription configuration
   * Deprecated
   *
   * NOTICE: The configuration of SNS topics is being moved
   * to the Global Config. This block is deprecated and
   * will be removed in a future release
   *
   * Accelerator use this parameter to define AWS SNS notification configuration.
   *
   * To enable high, medium and low SNS notifications, you need to provide below value for this parameter.
   * @example
   * ```
   * snsSubscriptions:
   *     - level: High
   *       email: <notify-high>@example.com
   *     - level: Medium
   *       email: <notify-medium>@example.com
   *     - level: Low
   *       email: <notify-low>@example.com
   * ```
   */
  readonly snsSubscriptions?: ISnsSubscriptionConfig[];
  /**
   * Amazon Macie Configuration
   *
   * Accelerator use this parameter to define AWS Macie configuration.
   *
   * To enable Macie in every region accelerator implemented and
   * set fifteen minutes of frequency to publish updates to policy findings for the account with
   * publishing sensitive data findings to Security Hub.
   * you need to provide below value for this parameter.
   * @example
   * ```
   * macie:
   *     enable: true
   *     excludeRegions: []
   *     policyFindingsPublishingFrequency: FIFTEEN_MINUTES
   *     publishSensitiveDataFindings: true
   * ```
   */
  readonly macie: IMacieConfig;
  /**
   * Amazon GuardDuty Configuration
   */
  readonly guardduty: IGuardDutyConfig;
  /**
   * (OPTIONAL) Amazon Audit Manager Configuration
   */
  readonly auditManager?: IAuditManagerConfig;
  /**
   * (OPTIONAL) Amazon Detective Configuration
   */
  readonly detective?: IDetectiveConfig;
  /**
   * AWS Security Hub configuration
   *
   * Accelerator use this parameter to define AWS Security Hub configuration.
   *
   * To enable AWS Security Hub for all regions and
   * enable "AWS Foundational Security Best Practices v1.0.0" security standard, deployment targets and disable controls
   * you need provide below value for this parameter.
   *
   * @example
   * ```
   * securityHub:
   *     enable: true
   *     regionAggregation: true
   *     snsTopicName: Security
   *     notificationLevel: HIGH
   *     excludeRegions: []
   *     standards:
   *       - name: AWS Foundational Security Best Practices v1.0.0
   *         deploymentTargets:
   *          organizationalUnits:
   *            - Root
   *         enable: true
   *         controlsToDisable:
   *           # Refer to the document for the control ID
   *           # https://docs.aws.amazon.com/securityhub/latest/userguide/fsbp-standard.html
   *           - Control1
   *           - Control2
   *     logging:
   *       cloudwatch:
   *         enabled: true
   *         logLevel: MEDIUM
   * ```
   */
  readonly securityHub: ISecurityHubConfig;
  /**
   * AWS Systems Manager Document configuration
   *
   * Accelerator use this parameter to define AWS Systems Manager documents configuration.
   * SSM documents are created in designated administrator account for security services, i.e. Audit account.
   *
   * To create a SSM document named as "SSM-ELB-Enable-Logging" in every region accelerator implemented and share this
   * document with Root organizational unit(OU), you need to provide below value for this parameter.
   * To share document to specific account uncomment accounts list. A valid SSM document template file ssm-documents/ssm-elb-enable-logging.yaml
   * must be present in Accelerator config repository. Accelerator will use this template file to create the document.
   *
   * @example
   * ```
   * ssmAutomation:
   *     excludeRegions: []
   *     documentSets:
   *       - shareTargets:
   *           organizationalUnits:
   *             - Root
   *           # accounts:
   *           #   - Network
   *         documents:
   *           - name: SSM-ELB-Enable-Logging
   *             template: ssm-documents/ssm-elb-enable-logging.yaml
   * ```
   */
  readonly ssmAutomation: ISsmAutomationConfig;
}

/**
 * *{@link SecurityConfig} / {@link KeyManagementServiceConfig}*
 *
 * @description
 *  KMS key management service configuration
 *
 * @example
 * ```
 * keySets:
 *   - name: ExampleKey
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *     alias: alias/example/key
 *     policy: path/to/policy.json
 *     description: Example KMS key
 *     enabled: true
 *     enableKeyRotation: true
 *     removalPolicy: retain
 * ```
 */
export interface IKeyManagementServiceConfig {
  readonly keySets: IKeyConfig[];
}

export enum ResourceTypeEnum {
  S3_BUCKET = 'S3_BUCKET',
  KMS_KEY = 'KMS_KEY',
  IAM_ROLE = 'IAM_ROLE',
  SECRETS_MANAGER_SECRET = 'SECRETS_MANAGER_SECRET',
  ECR_REPOSITORY = 'ECR_REPOSITORY',
  OPENSEARCH_DOMAIN = 'OPENSEARCH_DOMAIN',
  SNS_TOPIC = 'SNS_TOPIC',
  SQS_QUEUE = 'SQS_QUEUE',
  APIGATEWAY_REST_API = 'APIGATEWAY_REST_API',
  LEX_BOT = 'LEX_BOT',
  EFS_FILE_SYSTEM = 'EFS_FILE_SYSTEM',
  EVENTBRIDGE_EVENTBUS = 'EVENTBRIDGE_EVENTBUS',
  BACKUP_VAULT = 'BACKUP_VAULT',
  CODEARTIFACT_REPOSITORY = 'CODEARTIFACT_REPOSITORY',
  CERTIFICATE_AUTHORITY = 'CERTIFICATE_AUTHORITY',
  LAMBDA_FUNCTION = 'LAMBDA_FUNCTION',
}

export interface IResourcePolicyConfig {
  readonly resourceType: keyof typeof ResourceTypeEnum;
  readonly document: t.NonEmptyString;
}

export interface IResourcePolicyRemediation {
  /**
   * The remediation is triggered automatically.
   */
  readonly automatic: boolean;
  /**
   * Maximum time in seconds that AWS Config runs auto-remediation. If you do not select a number, the default is 60 seconds.
   */
  readonly retryAttemptSeconds?: number;
  /**
   * The maximum number of failed attempts for auto-remediation. If you do not select a number, the default is 5.
   */
  readonly maximumAutomaticAttempts?: number;
}

export interface IResourcePolicySetConfig {
  /**
   * The deployment targets - accounts/OUs where the config rule and remediation action will be deployed to
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * A list of resource policy templates for different types of resources
   */
  readonly resourcePolicies: IResourcePolicyConfig[];
  /**
   * The input parameters which will be set as environment variable in Custom Config Rule Lambda and Remediation lambda
   *
   * Meanwhile, 'SourceAccount' is a reserved parameters for allow-only resource policy -- Lambda_Function and CERTIFICATE_AUTHORITY.
   * For example, 'SourceAccount: 123456789012,987654321098' means requests from these two accounts can be allowed.
   * Apart from these two, No other external accounts can access a lambda function or Certificate Authority.
   *
   */
  readonly inputParameters?: { [key: string]: string };
}

/**
 * *{@link SecurityConfig} / {@link ResourcePolicyEnforcementConfig}/{@link NetworkPerimeterConfig}*
 *
 * @description
 * Network Perimeter Config.
 *
 * If managedVpcOnly is true, all the VPCs in accounts will be included while parameter `ACCEL_LOOKUP:VPC|VPC_ID:XX` is used.
 * If managedVpcOnly is false, only the VPC  created by LZA will be included while parameter `ACCEL_LOOKUP:VPC|VPC_ID:XX` is used.
 */
export interface INetworkPerimeterConfig {
  readonly managedVpcOnly?: boolean;
}

/**
 * *{@link SecurityConfig} / {@link ResourcePolicyEnforcementConfig}*
 *
 * @description
 * Resource Policy Enforcement Config. The configuration allows you to deploy AWS Config rules to
 * automatically apply resource-based policies to AWS resources including S3 buckets, IAM roles, and KMS keys etc.
 * AWS Organization is required to support it.
 *
 * Here are a list of supported service {@link SecurityConfigTypes.resourceTypeEnum }
 *
 * @example
 * ```
 *
 * resourcePolicyEnforcement:
 *   enable: true
 *   remediation:
 *       automatic: false
 *       retryAttemptSeconds: 60
 *       maximumAutomaticAttempts: 5
 *   policySets:
 *     - resourcePolicies:
 *         - resourceType: KMS
 *           document: resource-policies/kms-workload.json
 *       inputParameters:
 *         SourceAccount: 123456789012,987654321098
 *         allowedAccountList: {{ ALLOWED_EXTERNAL_ACCOUNTS }}   # The parameter `ALLOWED_EXTERNAL_ACCOUNTS` is defined in replacement config.
 *       deploymentTargets:
 *         accounts:
 *           - Root
 */
export interface IResourcePolicyEnforcementConfig {
  readonly enable: boolean;
  readonly remediation: IResourcePolicyRemediation;
  readonly policySets: IResourcePolicySetConfig[];
  readonly networkPerimeter?: INetworkPerimeterConfig;
}

/**
 * *{@link SecurityConfig} / {@link AccessAnalyzerConfig}*
 *
 * @description
 * AWS AccessAnalyzer configuration
 *
 * @example
 * ```
 * accessAnalyzer:
 *   enable: true
 * ```
 */
export interface IAccessAnalyzerConfig {
  /**
   * Indicates whether AWS AccessAnalyzer enabled in your organization.
   *
   * @remarks
   * Note: Once enabled, IAM Access Analyzer examines policies and reports a list of findings for resources that grant public or cross-account access from outside your AWS Organizations in the IAM console and through APIs.
   */
  readonly enable: boolean;
}

/**
 * *{@link SecurityConfig} / {@link IamPasswordPolicyConfig}*
 *
 * @description
 * IAM password policy configuration
 *
 * @example
 * ```
 * iamPasswordPolicy:
 *   allowUsersToChangePassword: true
 *   hardExpiry: false
 *   requireUppercaseCharacters: true
 *   requireLowercaseCharacters: true
 *   requireSymbols: true
 *   requireNumbers: true
 *   minimumPasswordLength: 14
 *   passwordReusePrevention: 24
 *   maxPasswordAge: 90
 * ```
 */
export interface IIamPasswordPolicyConfig {
  /**
   * Allows all IAM users in your account to use the AWS Management Console to change their own passwords.
   *
   * @default true
   */
  readonly allowUsersToChangePassword: boolean;
  /**
   * Prevents IAM users who are accessing the account via the AWS Management Console from setting a new console password after their password has expired.
   * The IAM user cannot access the console until an administrator resets the password.
   *
   * @default true
   */
  readonly hardExpiry: boolean;
  /**
   * Specifies whether IAM user passwords must contain at least one uppercase character from the ISO basic Latin alphabet (A to Z).
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one uppercase character.
   *
   * @default true
   */
  readonly requireUppercaseCharacters: boolean;
  /**
   * Specifies whether IAM user passwords must contain at least one lowercase character from the ISO basic Latin alphabet (a to z).
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one lowercase character.
   *
   * @default true
   */
  readonly requireLowercaseCharacters: boolean;
  /**
   * Specifies whether IAM user passwords must contain at least one of the following non-alphanumeric characters:
   *
   * ! @ # $ % ^ & * ( ) _ + - = [ ] { } | '
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one symbol character.
   *
   * @default true
   */
  readonly requireSymbols: boolean;
  /**
   * Specifies whether IAM user passwords must contain at least one numeric character (0 to 9).
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one numeric character.
   *
   * @default true
   */
  readonly requireNumbers: boolean;
  /**
   * The minimum number of characters allowed in an IAM user password.
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of 6.
   *
   * @default 14
   */
  readonly minimumPasswordLength: number;
  /**
   * Specifies the number of previous passwords that IAM users are prevented from reusing.
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of 0.
   * The result is that IAM users are not prevented from reusing previous passwords.
   *
   * @default 24
   */
  readonly passwordReusePrevention: number;
  /**
   * The number of days that an IAM user password is valid.
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of 0. The result is that IAM user passwords never expire.
   *
   * @default 90
   */
  readonly maxPasswordAge: number;
}

export interface ICustomRuleLambdaType {
  /**
   * The source code file path of your Lambda function. This is a zip file containing lambda function, this file must be available in config repository.
   */
  readonly sourceFilePath: t.NonEmptyString;
  /**
   * The name of the method within your code that Lambda calls to execute your function. The format includes the file name. It can also include namespaces and other qualifiers, depending on the runtime.
   * For more information, see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-features.html#gettingstarted-features-programmingmodel.
   */
  readonly handler: t.NonEmptyString;
  /**
   * The runtime environment for the Lambda function that you are uploading. For valid values, see the Runtime property in the AWS Lambda Developer Guide.
   */
  readonly runtime: t.NonEmptyString;
  /**
   * Lambda execution role policy definition file
   */
  readonly rolePolicyFile: t.NonEmptyString;
  /**
   * Lambda function execution timeout in seconds
   */
  readonly timeout?: number;
}

export interface ITriggeringResourceType {
  /**
   * An enum to identify triggering resource types.
   * Possible values ResourceId, Tag, or ResourceTypes
   *
   * Triggering resource can be lookup by resource id, tags or resource types.
   */
  readonly lookupType: 'ResourceId' | 'Tag' | 'ResourceTypes' | string;
  /**
   * Resource lookup type, resource can be lookup by tag or types. When resource needs to lookup by tag, this field will have tag name.
   */
  readonly lookupKey: t.NonEmptyString;
  /**
   * Resource lookup value, when resource lookup using tag, this field will have tag value to search resource.
   */
  readonly lookupValue: t.NonEmptyString[];
}

export interface ICustomRuleConfigType {
  /**
   * The Lambda function to run.
   */
  readonly lambda: ICustomRuleLambdaType;
  /**
   * Whether to run the rule on a fixed frequency.
   *
   * @default true
   */
  readonly periodic?: boolean;
  /**
   * The maximum frequency at which the AWS Config rule runs evaluations.
   *
   * Default:
   * MaximumExecutionFrequency.TWENTY_FOUR_HOURS
   */
  readonly maximumExecutionFrequency:
    | 'One_Hour'
    | 'Three_Hours'
    | 'Six_Hours'
    | 'Twelve_Hours'
    | 'TwentyFour_Hours'
    | string;
  /**
   * Whether to run the rule on configuration changes.
   *
   * Default:
   * false
   */
  readonly configurationChanges?: boolean;
  /**
   * Defines which resources trigger an evaluation for an AWS Config rule.
   */
  readonly triggeringResources: ITriggeringResourceType;
}

/**
 * Config rule remediation input parameter configuration type
 */
export interface IRemediationParametersConfigType {
  /**
   * Name of the parameter
   */
  readonly name: t.NonEmptyString;
  /**
   * Parameter value
   */
  readonly value: t.NonEmptyString;
  /**
   * Data type of the parameter, allowed value (StringList or String)
   */
  readonly type: 'String' | 'StringList';
}

// export interface IConfigRuleRemediationType {
//   readonly name: t.NonEmptyString;
//   readonly value: t.NonEmptyString;
//   readonly type: 'String' | 'StringList';
// }

export interface IConfigRuleRemediationType {
  /**
   * Remediation assume role policy definition json file. This file must be present in config repository.
   *
   * Create your own custom remediation actions using AWS Systems Manager Automation documents.
   * When a role needed to be created to perform custom remediation actions, role permission needs to be defined in this file.
   */
  readonly rolePolicyFile: t.NonEmptyString;
  /**
   * The remediation is triggered automatically.
   */
  readonly automatic: boolean;
  /**
   * Target ID is the name of the public document.
   *
   * The name of the AWS SSM document to perform custom remediation actions.
   */
  readonly targetId: t.NonEmptyString;
  /**
   * Name of the account owning the public document to perform custom remediation actions.
   * Accelerator creates these documents in Audit account and shared with other accounts.
   */
  readonly targetAccountName?: t.NonEmptyString;
  /**
   * Version of the target. For example, version of the SSM document.
   *
   * If you make backward incompatible changes to the SSM document, you must call PutRemediationConfiguration API again to ensure the remediations can run.
   */
  readonly targetVersion?: t.NonEmptyString;
  /**
   * Target SSM document remediation lambda function
   */
  readonly targetDocumentLambda?: ICustomRuleLambdaType;
  /**
   * Maximum time in seconds that AWS Config runs auto-remediation. If you do not select a number, the default is 60 seconds.
   *
   * For example, if you specify RetryAttemptSeconds as 50 seconds and MaximumAutomaticAttempts as 5, AWS Config will run auto-remediations 5 times within 50 seconds before throwing an exception.
   */
  readonly retryAttemptSeconds?: number;
  /**
   * The maximum number of failed attempts for auto-remediation. If you do not select a number, the default is 5.
   *
   * For example, if you specify MaximumAutomaticAttempts as 5 with RetryAttemptSeconds as 50 seconds, AWS Config will put a RemediationException on your behalf for the failing resource after the 5th failed attempt within 50 seconds.
   */
  readonly maximumAutomaticAttempts?: number;
  /**
   * List of remediation parameters
   *
   */
  readonly parameters?: IRemediationParametersConfigType[];
  /**
   * List of AWS Region names to be excluded from applying remediation
   */
  readonly excludeRegions?: t.Region[];
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule}*
 *
 * @description
 * AWS ConfigRule configuration
 *
 * @example
 * Managed Config rule:
 * ```
 * - name: accelerator-iam-user-group-membership-check
 *   complianceResourceTypes:
 *     - AWS::IAM::User
 *   identifier: IAM_USER_GROUP_MEMBERSHIP_CHECK
 * ```
 * Custom Config rule:
 * ```
 * - name: accelerator-attach-ec2-instance-profile
 *   type: Custom
 *   description: Custom rule for checking EC2 instance IAM profile attachment
 *   inputParameters:
 *     customRule:
 *       lambda:
 *         sourceFilePath: path/to/function.zip
 *         handler: index.handler
 *         runtime: nodejsXX.x
 *         rolePolicyFile: path/to/policy.json
 *       periodic: true
 *       maximumExecutionFrequency: Six_Hours
 *       configurationChanges: true
 *       triggeringResources:
 *         lookupType: ResourceTypes
 *         lookupKey: ResourceTypes
 *         lookupValue:
 *           - AWS::EC2::Instance
 * ```
 * Managed Config rule with remediation:
 * ```
 * - name: accelerator-s3-bucket-server-side-encryption-enabled
 *   identifier: S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED
 *   complianceResourceTypes:
 *     - AWS::S3::Bucket
 *   remediation:
 *     rolePolicyFile: path/to/policy.json
 *     automatic: true
 *     targetId: Put-S3-Encryption
 *     retryAttemptSeconds: 60
 *     maximumAutomaticAttempts: 5
 *     parameters:
 *       - name: BucketName
 *         value: RESOURCE_ID
 *         type: String
 *       - name: KMSMasterKey
 *         value: ${ACCEL_LOOKUP::KMS}
 *         type: StringList
 * ```
 */
export interface IConfigRule {
  /**
   * A name for the AWS Config rule.
   *
   * @remarks
   * Note: Changing this value of an AWS Config Rule will trigger a new resource creation.
   */
  readonly name: t.NonEmptyString;
  /**
   * (OPTIONAL) A description about this AWS Config rule.
   *
   */
  readonly description?: t.NonEmptyString;
  /**
   * (OPTIONAL) The identifier of the AWS managed rule.
   */
  readonly identifier?: t.NonEmptyString;
  /**
   * (OPTIONAL) Input parameter values that are passed to the AWS Config rule.
   */
  readonly inputParameters?: { [key: t.NonEmptyString]: t.NonEmptyString } | null; // TODO: Did this work?
  /**
   * (OPTIONAL) Defines which resources trigger an evaluation for an AWS Config rule.
   */
  readonly complianceResourceTypes?: t.NonEmptyString[];
  /**
   * (OPTIONAL) Config rule type Managed or Custom. For custom config rule, this parameter value is Custom, when creating managed config rule this parameter value can be undefined or empty string
   */
  readonly type?: t.NonEmptyString;
  /**
   * (OPTIONAL) A custom config rule is backed by AWS Lambda function. This is required when creating custom config rule.
   */
  readonly customRule?: ICustomRuleConfigType;
  /**
   * A remediation for the config rule, auto remediation to automatically remediate noncompliant resources.
   */
  readonly remediation?: IConfigRuleRemediationType;
  /**
   * (OPTIONAL) Tags for the config rule
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet}*
 *
 * @description
 * List of AWS Config rules
 *
 * @example
 * ```
 * - deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   rules:
 *     - name: accelerator-iam-user-group-membership-check
 *       complianceResourceTypes:
 *         - AWS::IAM::User
 *       identifier: IAM_USER_GROUP_MEMBERSHIP_CHECK
 * ```
 */
export interface IAwsConfigRuleSet {
  /**
   * Config ruleset deployment target.
   *
   * To configure AWS Config rules into Root and Infrastructure organizational units, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * - deploymentTargets:
   *         organizationalUnits:
   *           - Root
   *           - Infrastructure
   * ```
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * AWS Config rule set
   *
   * Following example will create a custom rule named accelerator-attach-ec2-instance-profile with remediation
   * and a managed rule named accelerator-iam-user-group-membership-check without remediation
   *
   * @example
   * ```
   * rules:
   *         - name: accelerator-attach-ec2-instance-profile
   *           type: Custom
   *           description: Custom role to remediate ec2 instance profile to EC2 instances
   *           inputParameters:
   *           customRule:
   *             lambda:
   *               sourceFilePath: custom-config-rules/attach-ec2-instance-profile.zip
   *               handler: index.handler
   *               runtime: nodejsXX.x
   *               timeout: 3
   *             periodic: true
   *             maximumExecutionFrequency: Six_Hours
   *             configurationChanges: true
   *             triggeringResources:
   *               lookupType: ResourceTypes
   *               lookupKey: ResourceTypes
   *               lookupValue:
   *                 - AWS::EC2::Instance
   *          - name: accelerator-iam-user-group-membership-check
   *           complianceResourceTypes:
   *             - AWS::IAM::User
   *           identifier: IAM_USER_GROUP_MEMBERSHIP_CHECK
   * ```
   */
  readonly rules: IConfigRule[];
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigAggregation}*
 *
 * @description
 * AWS Config Aggregation Configuration
 * Not used in Control Tower environment
 * Aggregation will be configured in all enabled regions
 * unless specifically excluded
 * If the delegatedAdmin account is not provided
 * config will be aggregated to the management account
 *
 * @example
 * AWS Config Aggregation with a delegated admin account:
 * ```
 * aggregation:
 *   enable: true
 *   delegatedAdminAccount: LogArchive
 * ```
 * AWS Config Aggregation in the management account:
 * ```
 * configAggregation:
 *   enable: true
 * ```
 */
export interface IAwsConfigAggregation {
  readonly enable: boolean;
  readonly delegatedAdminAccount?: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig}*
 *
 * @description
 * AWS Config Recorder and Rules
 *
 * @example
 * ```
 * awsConfig:
 *   enableConfigurationRecorder: false
 *   ** enableDeliveryChannel DEPRECATED
 *   enableDeliveryChannel: true
 *   overrideExisting: false
 *   deploymentTargets:
 *     organizationalUnits:
 *         - Infrastructure
 *   useServiceLinkedRole: true
 *   aggregation:
 *     enable: true
 *     delegatedAdminAccount: LogArchive
 *   ruleSets:
 *     - deploymentTargets:
 *         organizationalUnits:
 *           - Root
 *       rules:
 *         - name: accelerator-iam-user-group-membership-check
 *           complianceResourceTypes:
 *             - AWS::IAM::User
 *           identifier: IAM_USER_GROUP_MEMBERSHIP_CHECK
 * ```
 */
export interface IAwsConfig {
  /**
   * Indicates whether AWS Config recorder enabled.
   *
   * To enable AWS Config, you must create a configuration recorder
   *
   * ConfigurationRecorder resource describes the AWS resource types for which AWS Config records configuration changes. The configuration recorder stores the configurations of the supported resources in your account as configuration items.
   */
  readonly enableConfigurationRecorder: boolean;
  /**
   * (OPTIONAL) AWS Config deployment target.
   *
   * Leaving `deploymentTargets` undefined will enable AWS Config across all accounts and enabled regions.
   *
   * We highly recommend enabling AWS Config across all accounts and enabled regions within your organization.
   * `deploymentTargets` should only be used when more granular control is required, not as a default configuration.
   *
   * To enable AWS Config into Infrastructure organizational unit, you need to provide below value for this parameter.
   *
   * Note: The delegated admin account defined in centralSecurityServices will always have AwsConfig enabled
   *
   * @example
   * ```
   * - deploymentTargets:
   *         organizationalUnits:
   *           - Infrastructure
   * ```
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * Indicates whether delivery channel enabled.
   *
   * AWS Config uses the delivery channel to deliver the configuration changes to your Amazon S3 bucket.
   * DEPRECATED
   */
  readonly enableDeliveryChannel?: boolean;
  /**
   * Indicates whether or not to override existing config recorder settings
   * Must be enabled if any account and region combination has an
   * existing config recorder, even if config recording is turned off
   * The Landing Zone Accelerator will override the settings in all configured
   * accounts and regions
   * ** Do not enable this setting if you have deployed LZA
   * ** successfully with enableConfigurationRecorder set to true
   * ** and overrideExisting either unset or set to false
   * ** Doing so will cause a resource conflict
   * When the overrideExisting property is enabled
   * ensure that any scp's are not blocking the passRole
   * iam permission for the iam role name {acceleratorPrefix}Config
   */
  readonly overrideExisting?: boolean;
  /**
   * Config Recorder Aggregation configuration
   */
  readonly aggregation?: IAwsConfigAggregation;
  /**
   * AWS Config rule sets
   */
  readonly ruleSets?: IAwsConfigRuleSet[];
  /**
   * Indicates whether to create the Configuration Recorder with a service linked role. If not specified, AWS Config will use a custom IAM role created by LZA.
   * For new deployments, it is recommended to set this setting to true.
   * For more information, see https://docs.aws.amazon.com/config/latest/developerguide/using-service-linked-roles.html
   */
  readonly useServiceLinkedRole?: boolean;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link MetricSetConfig} / {@link MetricConfig}*
 *
 * @description
 * AWS CloudWatch Metric configuration
 *
 * @example
 * ```
 * - filterName: MetricFilter
 *   logGroupName: aws-controltower/CloudTrailLogs
 *   filterPattern: '{$.userIdentity.type="Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType !="AwsServiceEvent"}'
 *   metricNamespace: LogMetrics
 *   metricName: RootAccountUsage
 *   metricValue: "1"
 *   treatMissingData: notBreaching
 * ```
 */
export interface IMetricConfig {
  /**
   * Metric filter name
   */
  readonly filterName: t.NonEmptyString;
  /**
   * The log group to create the filter on.
   */
  readonly logGroupName: t.NonEmptyString;
  /**
   * Pattern to search for log events.
   */
  readonly filterPattern: t.NonEmptyString;
  /**
   * The namespace of the metric to emit.
   */
  readonly metricNamespace: t.NonEmptyString;
  /**
   * The name of the metric to emit.
   */
  readonly metricName: t.NonEmptyString;
  /**
   * The value to emit for the metric.
   *
   * Can either be a literal number (typically “1”), or the name of a field in the structure to take the value from the matched event. If you are using a field value, the field value must have been matched using the pattern.
   *
   * @remarks
   * Note: If you want to specify a field from a matched JSON structure, use '$.fieldName', and make sure the field is in the pattern (if only as '$.fieldName = *').
   * If you want to specify a field from a matched space-delimited structure, use '$fieldName'.
   */
  readonly metricValue: t.NonEmptyString;
  /**
   * Sets how this alarm is to handle missing data points.
   */
  readonly treatMissingData?: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link MetricSetConfig}*
 *
 * @description
 * AWS CloudWatch Metric set configuration
 *
 * @example
 * ```
 * - regions:
 *     - us-east-1
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   metrics:
 *     - filterName: MetricFilter
 *       logGroupName: aws-controltower/CloudTrailLogs
 *       filterPattern: '{$.userIdentity.type="Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType !="AwsServiceEvent"}'
 *       metricNamespace: LogMetrics
 *       metricName: RootAccountUsage
 *       metricValue: "1"
 *       treatMissingData: notBreaching
 * ```
 */
export interface IMetricSetConfig {
  /**
   * (OPTIONAL) AWS region names to configure CloudWatch Metrics
   */
  readonly regions?: t.Region[];
  /**
   * Deployment targets for CloudWatch Metrics configuration
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * AWS CloudWatch Metric list
   *
   * Following example will create metric filter RootAccountMetricFilter for aws-controltower/CloudTrailLogs log group
   *
   * @example
   * ```
   * metrics:
   *         # CIS 1.1 – Avoid the use of the "root" account
   *         - filterName: RootAccountMetricFilter
   *           logGroupName: aws-controltower/CloudTrailLogs
   *           filterPattern: '{$.userIdentity.type="Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType !="AwsServiceEvent"}'
   *           metricNamespace: LogMetrics
   *           metricName: RootAccount
   *           metricValue: "1"
   * ```
   */
  readonly metrics: IMetricConfig[];
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link AlarmSetConfig} / {@link AlarmConfig}*
 *
 * @description
 * AWS CloudWatch Alarm configuration
 *
 * @example
 * ```
 * - alarmName: CIS-1.1-RootAccountUsage
 *   alarmDescription: Alarm for usage of "root" account
 *   snsAlertLevel: Low
 *   metricName: RootAccountUsage
 *   namespace: LogMetrics
 *   comparisonOperator: GreaterThanOrEqualToThreshold
 *   evaluationPeriods: 1
 *   period: 300
 *   statistic: Sum
 *   threshold: 1
 *   treatMissingData: notBreaching
 * ```
 */
export interface IAlarmConfig {
  /**
   * Name of the alarm
   */
  readonly alarmName: t.NonEmptyString;
  /**
   * Description for the alarm
   */
  readonly alarmDescription: t.NonEmptyString;
  /**
   * Alert SNS notification level
   * Deprecated
   */
  readonly snsAlertLevel?: t.NonEmptyString;
  /**
   * (OPTIONAL) SNS Topic Name
   * SNS Topic Name from global config
   */
  readonly snsTopicName?: t.NonEmptyString;
  /**
   * Name of the metric.
   */
  readonly metricName: t.NonEmptyString;
  /**
   * Namespace of the metric.
   */
  readonly namespace: t.NonEmptyString;
  /**
   * Comparison to use to check if metric is breaching
   */
  readonly comparisonOperator: t.NonEmptyString;
  /**
   * The number of periods over which data is compared to the specified threshold.
   */
  readonly evaluationPeriods: number;
  /**
   * The period over which the specified statistic is applied.
   */
  readonly period: number;
  /**
   * What functions to use for aggregating.
   *
   * Can be one of the following:
   * -  “Minimum” | “min”
   * -  “Maximum” | “max”
   * -  “Average” | “avg”
   * -  “Sum” | “sum”
   * -  “SampleCount | “n”
   * -  “pNN.NN”
   */
  readonly statistic: t.NonEmptyString;
  /**
   * The value against which the specified statistic is compared.
   */
  readonly threshold: number;
  /**
   * Sets how this alarm is to handle missing data points.
   */
  readonly treatMissingData: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link AlarmSetConfig}}*
 *
 * @description
 * AWS CloudWatch Alarm sets
 *
 * @example
 * ```
 * - regions:
 *     - us-east-1
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   alarms:
 *     - alarmName: CIS-1.1-RootAccountUsage
 *       alarmDescription: Alarm for usage of "root" account
 *       snsAlertLevel: Low
 *       metricName: RootAccountUsage
 *       namespace: LogMetrics
 *       comparisonOperator: GreaterThanOrEqualToThreshold
 *       evaluationPeriods: 1
 *       period: 300
 *       statistic: Sum
 *       threshold: 1
 *       treatMissingData: notBreaching
 * ```
 */
export interface IAlarmSetConfig {
  /**
   * AWS region names to configure CloudWatch Alarms
   */
  readonly regions?: t.Region[];
  /**
   * Deployment targets for CloudWatch Alarms configuration
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * List of AWS CloudWatch Alarms
   *
   * Following example will create CIS-1.1-RootAccountUsage alarm for RootAccountUsage metric with notification level low
   *
   * @example
   * ```
   * alarms:
   *         # CIS 1.1 – Avoid the use of the "root" account
   *         - alarmName: CIS-1.1-RootAccountUsage
   *           alarmDescription: Alarm for usage of "root" account
   *           snsAlertLevel: Low (Deprecated)
   *           snsTopicName: Alarms
   *           metricName: RootAccountUsage
   *           namespace: LogMetrics
   *           comparisonOperator: GreaterThanOrEqualToThreshold
   *           evaluationPeriods: 1
   *           period: 300
   *           statistic: Sum
   *           threshold: 1
   *           treatMissingData: notBreaching
   * ```
   */
  readonly alarms: IAlarmConfig[];
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link LogGroupsConfig} / {@link EncryptionConfig}*
 *
 * {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html | CloudWatch log group encryption} configuration.
 *
 * @description
 * Use this configuration to enable encryption for a log group.
 *
 * @example
 * Key name reference example:
 * ```
 * kmsKeyName: key1
 * ```
 * Solution-managed KMS key example:
 * ```
 * useLzaManagedKey: true
 * ```
 * Existing KMS key reference:
 * ```
 * kmsKeyArn: arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab
 * ```
 *
 */
export interface IEncryptionConfig {
  /**
   * (OPTIONAL) Use this property to reference a
   * KMS Key Name that is created by Landing Zone Accelerator.
   *
   * @remarks
   * CAUTION: When importing an existing AWS CloudWatch Logs Group that has encryption enabled. If specifying the
   * encryption configuration with any KMS parameter under the encryption configuration, Landing Zone Accelerator
   * on AWS will associate a new key with the log group. It is recommend to verify if any processes or applications are using the previous key,
   * and has access to the new key before updating.
   *
   * This is the logical `name` property of the key as defined in security-config.yaml.
   *
   * @see {@link KeyConfig}
   */
  readonly kmsKeyName?: t.NonEmptyString;
  /**
   * (OPTIONAL) Reference the KMS Key Arn that is used to encrypt the AWS CloudWatch Logs Group. This should be a
   * KMS Key that is not managed by Landing Zone Accelerator.
   *
   * @remarks
   * CAUTION: When importing an existing AWS CloudWatch Logs Group that has encryption enabled. If specifying the
   * encryption configuration with any KMS parameter under the encryption configuration, Landing Zone Accelerator
   * on AWS will associate a new key with the log group. It is recommend to verify if any processes or applications are using the previous key,
   * and has access to the new key before updating.
   *
   * Note: If using the `kmsKeyArn` parameter to encrypt your AWS CloudWatch Logs Groups. It's important that the logs
   * service is provided the necessary cryptographic API calls to the CMK. For more information on how to manage the
   * CMK for logs service access, please review the documentation.
   *
   * @see {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html}
   *
   */
  readonly kmsKeyArn?: t.NonEmptyString;
  /**
   * (OPTIONAL) Set this property to `true` if you would like to use the
   * default CloudWatch Logs KMS CMK that is deployed by Landing Zone Accelerator.
   *
   * @remarks
   * CAUTION: When importing an existing AWS CloudWatch Logs Group that has encryption enabled. If specifying the
   * encryption configuration with any KMS parameter under the encryption configuration, Landing Zone Accelerator
   * on AWS will associate a new key with the log group. It is recommend to verify if any processes or applications are using the previous key,
   * and has access to the new key before updating.
   *
   * This key is deployed to all accounts managed by the solution by default.
   *
   */
  readonly useLzaManagedKey?: boolean;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link LogGroupsConfig}*
 *
 * {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html | CloudWatch log group} configuration.
 *
 * @description
 * Use this configuration to deploy CloudWatch log groups to your environment.
 * You can also import existing log groups into your accelerator configuration.
 * Log groups define groups of log streams that share the same retention, monitoring, and access control settings.
 *
 * @example
 * CloudWatch Log Group that is using a CMK that is being managed by Landing Zone Accelerator on AWS.
 * ```
 * - logGroupName: Log1
 *   logRetentionInDays: 365
 *   terminationProtected: true
 *   encryption:
 *     kmsKeyName: key1
 *   deploymentTargets:
 *     accounts:
 *       - Production
 * ```
 * CloudWatch Log Group that uses the Landing Zone Accelerator on AWS CMK for CloudWatch Logs Groups.
 * ```
 * - logGroupName: Log1
 *   logRetentionInDays: 365
 *   terminationProtected: true
 *   encryption:
 *     useLzaManagedKey: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Infrastructure
 * ```
 * CloudWatch Log Group that uses an existing KMS Key that's not managed by Landing Zone Accelerator on AWS.
 * ```
 * - logGroupName: Log1
 *   logRetentionInDays: 365
 *   terminationProtected: true
 *   encryption:
 *     kmsKeyArn: arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab
 *   deploymentTargets:
 *     accounts:
 *       - Production
 * ```
 */
export interface ILogGroupsConfig {
  /**
   * Name of the CloudWatch log group
   *
   * @remarks
   * If importing an existing log group, this must be the name of the
   * group as it exists in your account.
   */
  readonly logGroupName: t.NonEmptyString;
  /**
   * (OPTIONAL) How long, in days, the log contents will be retained.
   *
   * To retain all logs, set this value to undefined.
   *
   * @default undefined
   */
  readonly logRetentionInDays: number;
  /**
   * (OPTIONAL) Set this property to `false` if you would like the log group
   * to be deleted if it is removed from the solution configuration file.
   *
   * @default true
   */
  readonly terminationProtected?: boolean;
  /**
   * (OPTIONAL) The encryption configuration of the AWS CloudWatch Logs Group.
   *
   * @remarks
   * CAUTION: If importing an existing AWS CloudWatch Logs Group that has encryption enabled. If specifying the
   * encryption configuration with any KMS parameter under the encryption configuration, Landing Zone Accelerator
   * on AWS will associate a new key with the log group. The same situation is applied for a log group that is
   * created by Landing Zone Accelerator on AWS where specifying a new KMS parameter will update the KMS key used
   * to encrypt the log group. It is recommend to verify if any processes or applications are using the previous key,
   * and has access to the new key before updating.
   */
  readonly encryption?: IEncryptionConfig;
  /**
   * Deployment targets for CloudWatch Logs
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig}*
 *
 * @description
 * AWS CloudWatch configuration
 *
 * @example
 * ```
 * cloudWatch:
 *   metricSets:
 *     - regions:
 *         - us-east-1
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Root
 *       metrics:
 *         - filterName: MetricFilter
 *           logGroupName: aws-controltower/CloudTrailLogs
 *           filterPattern: '{$.userIdentity.type="Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType !="AwsServiceEvent"}'
 *           metricNamespace: LogMetrics
 *           metricName: RootAccountUsage
 *           metricValue: "1"
 *           treatMissingData: notBreaching
 *   alarmSets:
 *     - regions:
 *         - us-east-1
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Root
 *       alarms:
 *         - alarmName: CIS-1.1-RootAccountUsage
 *           alarmDescription: Alarm for usage of "root" account
 *           snsAlertLevel: Low
 *           metricName: RootAccountUsage
 *           namespace: LogMetrics
 *           comparisonOperator: GreaterThanOrEqualToThreshold
 *           evaluationPeriods: 1
 *           period: 300
 *           statistic: Sum
 *           threshold: 1
 *           treatMissingData: notBreaching
 *   logGroups:
 *     - name: Log1
 *       terminationProtected: true
 *       encryption:
 *          kmsKeyName: key1
 *       deploymentTargets:
 *         accounts:
 *           - Production
 *     - name: Log2
 *       terminationProtected: false
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Infrastructure
 * ```
 */
export interface ICloudWatchConfig {
  /**
   * List AWS CloudWatch Metrics configuration
   *
   * Following example will create metric filter RootAccountMetricFilter for aws-controltower/CloudTrailLogs log group
   *
   * @example
   * ```
   * metrics:
   *         # CIS 1.1 – Avoid the use of the "root" account
   *         - filterName: RootAccountMetricFilter
   *           logGroupName: aws-controltower/CloudTrailLogs
   *           filterPattern: '{$.userIdentity.type="Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType !="AwsServiceEvent"}'
   *           metricNamespace: LogMetrics
   *           metricName: RootAccount
   *           metricValue: "1"
   * ```
   */
  readonly metricSets: IMetricSetConfig[];
  /**
   * List AWS CloudWatch Alarms configuration
   *
   * Following example will create CIS-1.1-RootAccountUsage alarm for RootAccountUsage metric with notification level low
   *
   * @example
   * ```
   * alarms:
   *         # CIS 1.1 – Avoid the use of the "root" account
   *         - alarmName: CIS-1.1-RootAccountUsage
   *           alarmDescription: Alarm for usage of "root" account
   *           snsAlertLevel: Low (Deprecated)
   *           snsTopicName: Alarms
   *           metricName: RootAccountUsage
   *           namespace: LogMetrics
   *           comparisonOperator: GreaterThanOrEqualToThreshold
   *           evaluationPeriods: 1
   *           period: 300
   *           statistic: Sum
   *           threshold: 1
   *           treatMissingData: notBreaching
   * ```
   */
  readonly alarmSets: IAlarmSetConfig[];
  /**
   * (OPTIONAL) List CloudWatch Logs configuration
   *
   * The Following is an example of deploying CloudWatch Logs to multiple regions
   *
   * @example
   * ```
   *   logGroups:
   *     - logGroupName: Log1
   *       terminationProtected: true
   *       encryption:
   *         useLzaManagedKey: true
   *       deploymentTarget:
   *         account: Production
   *     - logGroupName: Log2
   *       terminationProtected: false
   *       deploymentTarget:
   *         organization: Infrastructure
   * ```
   */
  readonly logGroups?: ILogGroupsConfig[];
}

/**
 * Accelerator security configuration
 */
export interface ISecurityConfig {
  /**
   * Accelerator home region name.
   *
   * @example
   * ```
   * homeRegion: &HOME_REGION us-east-1
   * ```
   */
  readonly homeRegion?: t.Region;
  /**
   * Central security configuration
   */
  readonly centralSecurityServices: ICentralSecurityServicesConfig;
  readonly accessAnalyzer: IAccessAnalyzerConfig;
  readonly iamPasswordPolicy: IIamPasswordPolicyConfig;
  readonly awsConfig: IAwsConfig;
  readonly cloudWatch: ICloudWatchConfig;
  readonly keyManagementService?: IKeyManagementServiceConfig;
  readonly resourcePolicyEnforcement?: IResourcePolicyEnforcementConfig;
}
