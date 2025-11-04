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
 * *{@link SecurityConfig}*
 *
 * @description
 * Root configuration for the Landing Zone Accelerator security services and controls.
 * This configuration enables comprehensive security governance across your AWS Organization through
 * centralized security services, compliance monitoring, access controls, encryption management,
 * and automated monitoring and alerting capabilities.
 *
 * @example
 * ```
 * homeRegion: us-east-1
 * centralSecurityServices:
 *   delegatedAdminAccount: SecurityAudit
 *   ebsDefaultVolumeEncryption:
 *     enable: true
 *   s3PublicAccessBlock:
 *     enable: true
 *   scpRevertChangesConfig:
 *     enable: true
 *   macie:
 *     enable: true
 *   guardduty:
 *     enable: true
 *   securityHub:
 *     enable: true
 *   ssmAutomation:
 *     documentSets: []
 * accessAnalyzer:
 *   enable: true
 * iamPasswordPolicy:
 *   allowUsersToChangePassword: true
 *   requireUppercaseCharacters: true
 *   requireLowercaseCharacters: true
 *   requireSymbols: true
 *   requireNumbers: true
 *   minimumPasswordLength: 14
 *   passwordReusePrevention: 24
 *   maxPasswordAge: 90
 * awsConfig:
 *   enableConfigurationRecorder: true
 *   useServiceLinkedRole: true
 * cloudWatch:
 *   metricSets: []
 *   alarmSets: []
 * ```
 *
 * @category Security Configuration
 *
 * @see https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/security-reference.html
 */
export interface ISecurityConfig {
  /**
   * The primary AWS region where the Landing Zone Accelerator is deployed and managed.
   *
   * @example
   * ```
   * homeRegion: &HOME_REGION us-east-1
   * ```
   */
  readonly homeRegion?: string;
  /**
   * Configuration for centralized security services that provide organization-wide security controls.
   */
  readonly centralSecurityServices: ICentralSecurityServicesConfig;
  /**
   * Configuration for AWS IAM Access Analyzer that identifies resources with external access
   * and helps implement least privilege by analyzing resource policies for security risks.
   */
  readonly accessAnalyzer: IAccessAnalyzerConfig;
  /**
   * Configuration for organization-wide IAM password policy that enforces password complexity
   * and security requirements for IAM users across all accounts in your organization.
   */
  readonly iamPasswordPolicy: IIamPasswordPolicyConfig;
  /**
   * Configuration for AWS Config service that enables continuous monitoring and assessment
   * of AWS resource configurations for compliance, security, and governance across your organization.
   */
  readonly awsConfig: IAwsConfig;
  /**
   * Configuration for AWS CloudWatch monitoring and logging services that provide comprehensive
   * observability through metric filters, automated alerting, and centralized log management.
   */
  readonly cloudWatch: ICloudWatchConfig;
  /**
   * Configuration for AWS Key Management Service (KMS) that enables centralized management
   * of encryption keys across your organization for data protection and compliance requirements.
   */
  readonly keyManagementService?: IKeyManagementServiceConfig;
  /**
   * Configuration for automated resource policy enforcement that uses AWS Config rules
   * to automatically apply and maintain consistent resource-based policies across your organization,
   * ensuring continuous compliance with security standards.
   */
  readonly resourcePolicyEnforcement?: IResourcePolicyEnforcementConfig;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SnsSubscriptionConfig}*
 *
 * @description
 * This interface is deprecated and has been replaced by the snsTopics configuration in the global config.
 * Organizations should migrate to the new SNS topic configuration.
 *
 * Configuration for legacy SNS notification subscriptions that send security alerts to email addresses.
 *
 * @deprecated
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
   * Defines the severity level for security notifications that will trigger email alerts.
   * Higher levels indicate more critical security events requiring immediate attention.
   * Notification level can be high, medium or low.
   */
  readonly level: t.NonEmptyString;
  /**
   * Email address that will receive the security notifications for the specified severity level.
   */
  readonly email: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link S3PublicAccessBlockConfig}*
 *
 * @description
 * Configuration for preventing accidental public exposure of S3 buckets and objects across your organization.
 * When enabled, this setting applies organization-wide security guardrails that prevent users from accidentally making S3 buckets or objects publicly accessible.
 *
 * @remarks
 * If the `PublicAccessBlock` configurations are different between the bucket and the account, Amazon S3 will align with
 * the most restrictive combination between the bucket-level and account-level settings.
 *
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
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
   * Indicates whether S3 public access blocking is enforced across all accounts in your organization.
   */
  readonly enable: boolean;
  /**
   * List of AWS account names that should be exempted from S3 public access blocking requirements.
   */
  readonly excludeAccounts?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmSettingsConfig} / {@link BlockPublicDocumentSharingConfig}*
 *
 * @description
 * This interface defines the SSM Block Public Document Sharing configuration for organization accounts.
 * SSM Block Public Document Sharing prevents AWS Systems Manager documents from being shared publicly,
 * providing an additional layer of security for organizations. The feature operates on a per-region basis
 * and is applied across all enabled regions for comprehensive protection.
 *
 * @see https://docs.aws.amazon.com/systems-manager/latest/userguide/documents-ssm-sharing.html#block-public-access
 *
 * @example
 * ```
 * blockPublicDocumentSharing:
 *     enable: true
 *     excludeAccounts: []
 * ```
 */
export interface IBlockPublicDocumentSharingConfig {
  /**
   * Indicates whether SSM Block Public Document Sharing is enabled across the organization.
   * When true, blocks public document sharing on all accounts except those in excludeAccounts.
   * When false, allows public document sharing on all accounts.
   * This setting is applied in all enabled regions for comprehensive security coverage.
   */
  readonly enable: boolean;
  /**
   * List of AWS Account names to be excluded from SSM Block Public Document Sharing configuration.
   * Accounts in this list will have public document sharing allowed regardless of the enable setting.
   * Account names must match those defined in the accounts configuration.
   * Exclusions are applied across all enabled regions.
   */
  readonly excludeAccounts?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmSettingsConfig}*
 *
 * @description
 * Configuration for AWS Systems Manager (SSM) security settings and controls across your organization.
 * This enables centralized management of SSM security features to ensure secure and governed access
 * to your managed resources while preventing unauthorized sharing of sensitive automation documents.
 *
 * @see https://docs.aws.amazon.com/systems-manager/latest/userguide/what-is-systems-manager.html
 *
 * @example
 * ```
 * ssmSettings:
 *   blockPublicDocumentSharing:
 *     enable: true
 *     excludeAccounts: []
 * ```
 */
export interface ISsmSettingsConfig {
  /**
   * Configuration for preventing AWS Systems Manager documents from being shared publicly.
   * This security control helps protect sensitive automation scripts and operational procedures
   * from unauthorized access by blocking public document sharing across your organization.
   *
   * @remarks
   * When not specified, the SSM Block Public Document Sharing feature is disabled by default.
   * This provides flexibility for organizations to opt-in to this security control as needed.
   * The setting is applied across all enabled regions for comprehensive security coverage.
   */
  readonly blockPublicDocumentSharing?: IBlockPublicDocumentSharingConfig;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link ScpRevertChangesConfig}*
 *
 * @description
 * Configuration for automatically detecting and reverting manual changes to Service Control Policies (SCPs).
 * This securty control helps maintain governance by ensuring that security policies cannot be modified
 * outside of your approved change management process. When enabled, any manual changes to SCPs will be
 * automatically reverted and security teams will be notified of the attempted modification.
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
   * Indicates whether manual changes to Service Control Policies are automatically detected and reverted.
   */
  readonly enable: boolean;
  /**
   * Name of the SNS topic that will receive alerts when unauthorized SCP changes are detected and reverted.
   */
  readonly snsTopicName?: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link KeyManagementServiceConfig} / {@link KeyConfig}*
 *
 * @description
 * Configuration for creating and managing customer-managed keys (CMKs.
 * These keys provide enhanced security control compared to AWS-managed keys, allowing you to define custom access policies,
 * enable automatic key rotation, and maintain compliance with data protection regulations. Customer-managed keys are essential
 * for organizations that need granular control over encryption operations and key lifecycle management.
 *
 * @see https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#key-mgmt | AWS KMS Key configuration.
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
   * Unique identifier for the customer-managed key.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable alias that provides an easy way to identify and use the encryption key.
   *
   * @remarks
   * Note: If changing this value, a new CMK with the new alias will be created.
   */
  readonly alias?: t.NonEmptyString;
  /**
   * Path to the file containing the key policy. The policy file must exist in your
   * configuration repository.
   */
  readonly policy?: t.NonEmptyString;
  /**
   * Human-readable description explaining the purpose and intended use of this encryption key.
   */
  readonly description?: t.NonEmptyString;
  /**
   * Controls whether AWS Key Management Service (KMS) automatially rotates the encryption key material.
   * @default true
   */
  readonly enableKeyRotation?: boolean;
  /**
   * Controls whether the encryption key is available to be used.
   * Disabled keys cannot encrypt or decrypt data.
   * @default true (key is enabled)
   */
  readonly enabled?: boolean;
  /**
   * Determines what happens to the encryption key when it's removed from the Stack.
   * 'retain' preserves the key for data recovery, 'destroy' permanently deletes it, 'snapshot' creates a backup.
   *
   * @default retain
   */
  readonly removalPolicy?: 'destroy' | 'retain' | 'snapshot';
  /**
   * Specifies which organizational units and accounts the customer-managed key is deployed to.
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
 * Configuration for Amazon Macie, a data security service that discovers, classifies, and protects sensitive data.
 * Use this configuration to enable Amazon Macie within your AWS Organization along with it's reporting configuration.
 *
 * @see https://docs.aws.amazon.com/macie/latest/user/what-is-macie.html
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
   * Controls whether AWS Macie is enabled across your organization
   */
  readonly enable: boolean;
  /**
   * List of AWS Region names to be excluded from configuring Amazon Macie.
   */
  readonly excludeRegions?: string[];
  /**
   * Specifies how frequently findings are published to Security Hub.
   * Possible values: FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
   */
  readonly policyFindingsPublishingFrequency?: 'FIFTEEN_MINUTES' | 'ONE_HOUR' | 'SIX_HOURS';
  /**
   * Specifies whether to publish sensitive data findings to Security Hub. If you set this value to true, Amazon Macie automatically publishes all sensitive data findings that weren't suppressed by a findings filter.
   * Default value is false.
   */
  readonly publishSensitiveDataFindings: boolean;
  /**
   * Specifies whether to publish findings to Security Hub and EventBridge
   */
  readonly publishPolicyFindings?: boolean;
  /**
   * Declaration of S3 Lifecycle rules that automatically manage the retention and deletion for Macie findings reports stored in S3.
   */
  readonly lifecycleRules?: t.ILifecycleRule[] | undefined;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyS3ProtectionConfig}*
 *
 * @description
 * Configuration for enabling S3 protection with Amazon GuardDuty to detect suspicious and malicious activity in your S3 buckets.
 * Use this configuration to enable S3 Protection with Amazon GuardDuty to monitor object-level API operations for potential
 * security risks for data within Amazon S3 buckets.
 *
 * @see https://docs.aws.amazon.com/guardduty/latest/ug/s3-protection.html
 *
 * @example
 * ```
 * enable: true
 * excludeRegions: []
 * ```
 */
export interface IGuardDutyS3ProtectionConfig {
  /**
   * Controls whether GuardDuty S3 protection is enabled to monitor your S3 buckets for suspicious activity.
   */
  readonly enable: boolean;
  /**
   * List of AWS regions where Amazon GuardDuty S3 protection should not be enabled.
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyEksProtectionConfig}*
 *
 * @description
 * Configuration for GuardDuty EKS (Elastic Kubernetes Service) protection that monitors Amazon Elastic Kubernetes Service clusters for security threats.
 * EKS Protection helps you detect potential security risks in Amazon EKS clusters.
 *
 * @see https://docs.aws.amazon.com/guardduty/latest/ug/kubernetes-protection.html
 */
export interface IGuardDutyEksProtectionConfig {
  /**
   * Controls whether GuardDuty EKS Protection is enabled  to monitor your EKS clusters for security threats.
   */
  readonly enable: boolean;
  /**
   * Controls whether the GuardDuty EKS Agent is managed.
   */
  readonly manageAgent?: boolean;
  /**
   * List of AWS regions where GuardDuty EKS protection should not be enabled.
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyEc2ProtectionConfig}*
 *
 * @description
 * Configuration for GuardDuty for EC2 malware protection that scans EC2 instances and EBS volumes for malicious software.
 * EC2 Malware Protection helps you detect malware and other security threats on your EC2 instances.
 *
 * @see https://docs.aws.amazon.com/guardduty/latest/ug/malware-protection.html
 */
export interface IGuardDutyEc2ProtectionConfig {
  /**
   * Controls whether GuardDuty EC2 Malware Protection is enabled to scan your EC2 instances for malware.
   */
  readonly enable: boolean;
  /**
   * Controls whether EBS snapshots created during malware scanning are retained.
   * When enables, snapshots are preserved.
   */
  readonly keepSnapshots: boolean;
  /**
   * List of AWS regions where GuardDuty EC2 Malware Protection should not be enabled.
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyRdsProtectionConfig}*
 *
 * @description
 * Configuration for GuardDuty RDS (Relational Database Service) protection that monitors Amazon RDS instances for security threats.
 * RDS Protection helps you detect potential security risks in your RDS databases.
 *
 * @see https://docs.aws.amazon.com/guardduty/latest/ug/rds-protection.html
 */
export interface IGuardDutyRdsProtectionConfig {
  /**
   * Controls whether GuardDuty RDS Protection is enabled to monitor your RDS databases for security threats..
   */
  readonly enable: boolean;
  /**
   * List of AWS regions where GuardDuty RDS Protection should not be enabled.
   */
  readonly excludeRegions?: string[];
}

/**
 * AWS GuardDuty Lambda Malware Protection configuration.
 */
export interface IGuardDutyLambdaProtectionConfig {
  /**
   * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyLambdaProtectionConfig}*
   *
   * @description
   * Configuration for GuardDuty Lambda Protection that monitor AWS Lambda functions for security threats.
   * Lambda Protection helps you detect security risks in your serverless functions.
   *
   * @see https://docs.aws.amazon.com/guardduty/latest/ug/lambda-protection.html
   */
  /**
   * Controls whether GuardDuty Lambda Protection is enabled to monitor your Lambda functions for security threats.
   */
  readonly enable: boolean;
  /**
   * List of AWS regions where GuardDuty Lambda Protection should not be enabled.
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyExportFindingsConfig}*
 *
 * @description
 * Configuration for exporting GuardDuty security findings to an Amazon S3 bucket for long-term storage and analysis.
 *
 * @see https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_exportfindings.html
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
   * Controls whether GuardDuty findings are automatically exported to an S3 bucket.
   */
  readonly enable: boolean;
  /**
   * Controls whether existing export configurations can be overwritten with new settings.
   */
  readonly overrideExisting?: boolean;
  /**
   * The type of resource for the publishing destination. Currently only Amazon S3 buckets are supported.
   */
  readonly destinationType: 'S3';
  /**
   * An enum value that specifies how frequently findings are exported to the S3 bucket.
   * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
   */
  readonly exportFrequency: 'FIFTEEN_MINUTES' | 'ONE_HOUR' | 'SIX_HOURS';
  /**
   * Custom prefix configuration for organizing GuardDuty findings in your centralized logging S3 bucket.
   */
  readonly overrideGuardDutyPrefix?: t.IPrefixConfig;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig}*
 *
 * @description
 * Configuration for Amazon GuardDuty, a threat detection service that monitors your AWS environment for malicious activity.
 * Use this configuration to enable Amazon GuardDuty for an AWS Organization and configure which AWS services should be
 * monitored for security threats.
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
 *     excludeRegions: []
 *   ec2Protection:
 *     enable: true
 *     keepSnapshots: true
 *     excludeRegions: []
 *   rdsProtection:
 *     enable: true
 *     excludeRegions: []
 *   lambdaProtection:
 *     enable: true
 *     excludeRegions: []
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
   * Controls whether GuardDuty is enabled across your organization to monitor for security threats.
   *
   * @remarks
   * Accelerator will try to set the organization admin account to the Audit account, but it cannot overwrite the existing
   * organization admin account if one is already set. If your pipeline fails, remove the existing delegated admin and rerun the pipeline.
   */
  readonly enable: boolean;
  /**
   * List of AWS regions where GuardDuty should not be enabled.
   *
   * @remarks
   * Please only specify one of the `excludeRegions` or `deploymentTargets` properties.
   *
   */
  readonly excludeRegions?: string[];
  /**
   * Specifies which organizational units and accounts should have GuardDuty enabled.
   *
   * @remarks
   * We highly recommend enabling GuardDuty across all accounts and enabled regions within your organization.
   * `deploymentTargets` should only be used when more granular control is required, not as a default configuration.
   * Please only specify one of the `deploymentTargets` or `excludeRegions` properties.
   *
   * Note: The delegated admin account defined in centralSecurityServices will always have GuardDuty enabled
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * Controls whether GuardDuty is automatically enabled for new accounts joining the organization.
   *
   * @remarks
   * It is recommended to set the value to `false` when using the `deploymentTargets` property to enable GuardDuty only on targeted accounts mentioned in the deploymentTargets. If you do not define or do not set it to `false` any new accounts joining the organization will automatically be enabled with GuardDuty.
   *
   * @default true
   */
  readonly autoEnableOrgMembers?: boolean;
  /**
   * Configuration for GuardDuty S3 Protection that monitors your S3 buckets for suspicious activity.
   * @type object
   */
  readonly s3Protection: IGuardDutyS3ProtectionConfig;
  /**
   * Configuration for GuardDuty EKS Protection that monitors your Kubernetes clusters for security threats.
   * @type object
   */
  readonly eksProtection?: IGuardDutyEksProtectionConfig;
  /**
   * Configuration for GuardDuty EC2 Malware Protection that scans your EC2 instances for malicious software.
   * @type object
   */
  readonly ec2Protection?: IGuardDutyEc2ProtectionConfig;
  /**
   * Configuration for GuardDuty RDS Protection that monitors your databases for security threats.
   * @type object
   */
  readonly rdsProtection?: IGuardDutyRdsProtectionConfig;
  /**
   * Configuration for GuardDuty Lambda Protection that monitors your serverless functions for security threats.
   * @type object
   */
  readonly lambdaProtection?: IGuardDutyLambdaProtectionConfig;

  /**
   * Configuration for exporting GuardDuty findings to S3 for long-term storage and analysis.
   * @type object
   */
  readonly exportConfiguration: IGuardDutyExportFindingsConfig;
  /**
   * S3 lifecycle rules that automatically manage the retention and deletion of GuardDuty findings stored in S3.
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link AuditManagerConfig} / {@link AuditManagerDefaultReportsDestinationConfig}*
 *
 * @description
 * Configuration for specifying where AWS Audit Manager stores compliance assessment reports
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
   * Controls whether AWS Audit Manager Default Reports destination is enabled.
   * When enabled, compliance reports are automatically saved to the specified destination for audit trail purposes.
   */
  readonly enable: boolean;
  /**
   * The type of resource for storing audit reports. Currently only Amazon S3 buckets are supported.
   */
  readonly destinationType: 'S3';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link AuditManagerConfig}*
 *
 * @description
 * Configuration for AWS Audit Manager, a service that helps you continually audit your AWS usage to simplify how you manage risk and
 * compliance with regulations and industry standards.
 * Use this configuration to enable AWS Audit Manager for an AWS Organization. Audit Manager automates evidence collection
 * so you can more easily assess whether your policies, procedures, and activities are operating effectively.
 *
 * @see https://docs.aws.amazon.com/audit-manager/latest/userguide/what-is.html
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
   * Controls whether AWS Audit Manager is enabled across your organization.
   */
  readonly enable: boolean;
  /**
   * List of AWS regions where Audit Manager should not be enabled.
   *
   * @remarks Please ensure any regions enabled in the global configuration that do not support Audit Manager are added to the excluded regions list.
   * {@link https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/ | Supported services by region}.
   */
  readonly excludeRegions?: string[];
  /**
   * Configuration for where Audit Manager stores compliance assessment reports and audit-ready evidence.
   * @type object
   */
  readonly defaultReportsConfiguration: IAuditManagerDefaultReportsDestinationConfig;
  /**
   * S3 lifecycle rules that automatically manage the retention and deletion of Audit Manager reports and evidence stored in S3.
   */
  readonly lifecycleRules?: t.ILifecycleRule[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link DetectiveConfig}*
 *
 * @description
 * Configuration for Amazon Detective, a security service that helps you analyze, investigate, and quickly identify the
 * root cause of security findings. Use this configuration to enable Amazon Detective for an AWS Organization.
 *
 * @see https://docs.aws.amazon.com/detective/latest/adminguide/what-is-detective.html
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
   * Controls whether Amazon Detective is enabled across your organization.
   */
  readonly enable: boolean;
  /**
   * List of AWS regions where Detective should not be enabled.
   *
   * @remarks Please ensure any regions enabled in the global configuration that do not support Amazon Detective are added to the excluded regions list.
   * {@link https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/ | Supported services by region}.
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubStandardConfig}*
 *
 * @description
 * Configuration for enabling specific compliance and security standards within Amazon Security Hub.
 * Use this configuration to define the security standard(s) that are enabled through Amazon Security Hub and which accounts and/or
 * organization units that the controls are deployed to.
 *
 * @see https://docs.aws.amazon.com/securityhub/latest/userguide/standards-reference.html
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
   * The name of the AWS Security Hub standard to enable or disable.
   * This can be any valid Security Hub standard name supported by AWS.
   *
   * Common examples include:
   * - 'AWS Foundational Security Best Practices v1.0.0'
   * - 'CIS AWS Foundations Benchmark v1.2.0'
   * - 'CIS AWS Foundations Benchmark v1.4.0'
   * - 'CIS AWS Foundations Benchmark v3.0.0'
   * - 'NIST Special Publication 800-53 Revision 5'
   * - 'AWS Resource Tagging Standard v1.0.0'
   * - 'PCI DSS v3.2.1'
   * - 'PCI DSS v4.0.1'
   *
   * Note: AWS may add new standards over time. This field accepts any string
   * to allow for future standards without requiring code changes.
   */
  readonly name: t.NonEmptyString;

  /**
   * Specifies which organizational units and accounts this security standard will be applied to.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * Controls whether this Security Hub standard is enabled to monitor compliance across your specified deployment targets.
   * When enabled, Security Hub continuously evaluates your resources against the standard's security controls.
   */
  readonly enable: boolean;
  /**
   * List of specific control names within the security standard that should be disabled.
   */
  readonly controlsToDisable?: t.NonEmptyString[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubLoggingConfig} / {@link SecurityHubLoggingCloudwatchConfig}*
 *
 * @description
 * Configuration for forwarding Security Hub findings to CloudWatch for centralized monitoring and analysis.
 *
 * @default logLevel HIGH
 *
 * @example
 * ```
 * enable: true
 * logLevel: HIGH
 * ```
 */
export interface ISecurityHubLoggingCloudwatchConfig {
  /**
   * Controls whether Security Hub findings are automatically forwarded to CloudWatch Logs.
   * When enabled, findings are sent to CloudWatch for integration with monitoring dashboards and alerting systems.
   */
  readonly enable: boolean;
  /**
   * Name of the CloudWatch Log Group where Security Hub findings will be stored.
   *
   * @remarks Log Group name must be unique in the account and region. LZA will create a
   * log group with this name if the property is provided, unless the log group already exists.
   */
  readonly logGroupName?: string;
  /**
   * Minimum severity level for findings that will be forwarded to CloudWatch Logs.
   *
   * @remarks
   * Security Hub findings for events at the Level provided and above will be logged to CloudWatch Logs
   * For example, if you specify the HIGH level findings will be sent to CloudWatch Logs for HIGH and CRITICAL
   *
   * Values accepted are CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL.
   */
  readonly logLevel?: t.SecurityHubSeverityLevel;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubLoggingConfig}*
 *
 * @description
 * Configuration for Security Hub logging destinations that determines where security findings are stored for analysis.
 * This configuration allows you to centralize Security Hub findings in CloudWatch Logs for integration with your
 * monitoring and alerting infrastructure.
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
   * Configuration for forwarding Security Hub findings to CloudWatch Logs.
   */
  readonly cloudWatch?: ISecurityHubLoggingCloudwatchConfig;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig}*
 *
 * @description
 * Configuration for Amazon Security Hub, a centralized security findings management service that aggregates security alerts
 * from multiple AWS security services.
 * Use this configuration to enable Amazon Security Hub for an AWS Organization along with it's auditing configuration.
 *
 * @default logLevel HIGH
 *
 * @see https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html
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
 *       logLevel: HIGH
 * ```
 */
export interface ISecurityHubConfig {
  /**
   * Controls whether AWS Security Hub is enabled across your organization
   * @remarks AWS Config is required for enabling Security Hub
   */
  readonly enable: boolean;
  /**
   * Controls whether Security Hub findings from all regions are aggregated in your organization's home region.
   */
  readonly regionAggregation?: boolean;
  /**
   * Name of the SNS topic that will receive Security Hub notifications.
   *
   * @remarks Topic must exist in the global config
   */
  readonly snsTopicName?: string;
  /**
   * Minimum severity level for findings that will trigger SNS notifications.
   *
   * @remarks Notifications will be sent for events at the Level provided and above.
   * Example, if you specify the HIGH level notifications will be sent for HIGH and CRITICAL.
   *
   * Values accepted are CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL
   */
  readonly notificationLevel?: string;
  /**
   * List of AWS regions where Security Hub should not be enabled.
   */
  readonly excludeRegions?: string[];
  /**
   * Specifies which organizational units and accounts should have Security Hub enabled.
   *
   * @remarks We highly recommend enabling SecurityHub across all accounts and enabled regions within your organization.
   * `deploymentTargets` should only be used when more granular control is required, not as a default configuration
   * Please only specify one of the `deploymentTargets` or `excludeRegions` properties.
   *
   * Note: The delegated admin account defined in centralSecurityServices will always have SecurityHub enabled.
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * Controls whether Security Hub is automatically enabled for new accounts joining the organization.
   *
   * @remarks It is recommended to set the value to `false` when using the `deploymentTargets` property to enable SecurityHub only on targeted accounts mentioned in the deploymentTargets. If you do not define or do not set it to `false` any new accounts joining the organization will automatically be enabled with SecurityHub.
   *
   * @default true
   */
  readonly autoEnableOrgMembers?: boolean;
  /**
   * List of security and compliance standards that Security Hub will monitor across your organization.
   */
  readonly standards: ISecurityHubStandardConfig[];
  /**
   * Configuration for forwarding Security Hub findings to CloudWatch Logs for centralized monitoring.
   * When enabled, findings are automatically sent to CloudWatch for integration with your monitoring and alerting systems.
   *
   * @remarks
   * By default, if nothing is given `true` is taken. In order to stop logging, set this parameter to `false`.
   * Please note, this option can be toggled but log group with `/${acceleratorPrefix}-SecurityHub` will remain in the account for every enabled region and will need to be manually deleted. This is designed to ensure no accidental loss of data occurs.
   */
  readonly logging?: ISecurityHubLoggingConfig;
  /**
   * (OPTIONAL) Security Hub automation rules configuration
   */
  readonly automationRules?: ISecurityHubAutomationRuleConfig[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRulesStringFilter}*
 *
 * @description
 * Security Hub automation rule string filter configuration for filtering findings based on string values
 */
export interface ISecurityHubAutomationRulesStringFilter {
  /**
   * The string value to filter on
   */
  readonly value: string;
  /**
   * The comparison operator to use for filtering
   */
  readonly comparison:
    | 'EQUALS'
    | 'PREFIX'
    | 'NOT_EQUALS'
    | 'PREFIX_NOT_EQUALS'
    | 'CONTAINS'
    | 'NOT_CONTAINS'
    | 'CONTAINS_WORD';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRulesNumberFilter}*
 *
 * @description
 * Security Hub automation rule number filter configuration for filtering findings based on numeric values
 */
export interface ISecurityHubAutomationRulesNumberFilter {
  /**
   * Greater than or equal to value
   */
  readonly gte?: number;
  /**
   * Less than or equal to value
   */
  readonly lte?: number;
  /**
   * Greater than value
   */
  readonly gt?: number;
  /**
   * Less than value
   */
  readonly lt?: number;
  /**
   * Equal to value
   */
  readonly eq?: number;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRulesDateFilter}*
 *
 * @description
 * Security Hub automation rule date filter configuration for filtering findings based on date ranges
 */
export interface ISecurityHubAutomationRulesDateFilter {
  /**
   * Start date in ISO 8601 format
   */
  readonly start?: string;
  /**
   * End date in ISO 8601 format
   */
  readonly end?: string;
  /**
   * Date range configuration
   */
  readonly dateRange?: {
    /**
     * Number of days
     */
    value: number;
    /**
     * Time unit (currently only DAYS is supported)
     */
    unit: 'DAYS';
  };
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRulesKeyValueFilter}*
 *
 * @description
 * Security Hub automation rule key-value filter configuration for filtering findings based on key-value pairs
 */
export interface ISecurityHubAutomationRulesKeyValueFilter {
  /**
   * The key to filter on
   */
  readonly key: string;
  /**
   * The value to filter on
   */
  readonly value: string;
  /**
   * The comparison operator to use for filtering
   */
  readonly comparison: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'NOT_CONTAINS';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRuleNote}*
 *
 * @description
 * Security Hub automation rule note configuration for updating finding notes
 */
export interface ISecurityHubAutomationRuleNote {
  /**
   * The note text content
   */
  readonly text: string;
  /**
   * The entity that updated the note
   */
  readonly updatedBy: string;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRuleRelatedFinding}*
 *
 * @description
 * Security Hub automation rule related finding configuration for linking related findings
 */
export interface ISecurityHubAutomationRuleRelatedFinding {
  /**
   * The product ARN of the related finding
   */
  readonly productArn: string;
  /**
   * The ID of the related finding
   */
  readonly id: string;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRuleFindingFieldsUpdate}*
 *
 * @description
 * Security Hub automation rule finding fields update configuration for modifying finding attributes
 *
 * @example
 * ```
 * note:
 *   text: "Automatically suppressed by automation rule"
 *   updatedBy: "AWSAccelerator"
 * severityLabel: "LOW"
 * workflowStatus: "SUPPRESSED"
 * ```
 */
export interface ISecurityHubAutomationRuleFindingFieldsUpdate {
  /**
   * (OPTIONAL) Note to add to the finding
   */
  readonly note?: ISecurityHubAutomationRuleNote;
  /**
   * (OPTIONAL) Severity label to assign to the finding
   */
  readonly severityLabel?: string;
  /**
   * (OPTIONAL) Verification state to assign to the finding
   */
  readonly verificationState?: string;
  /**
   * (OPTIONAL) Confidence score to assign to the finding (0-100)
   */
  readonly confidence?: number;
  /**
   * (OPTIONAL) Criticality score to assign to the finding (0-100)
   */
  readonly criticality?: number;
  /**
   * (OPTIONAL) Types to assign to the finding
   */
  readonly types?: string[];
  /**
   * (OPTIONAL) User-defined fields to assign to the finding
   */
  readonly userDefinedFields?: Record<string, string>;
  /**
   * (OPTIONAL) Workflow status to assign to the finding
   */
  readonly workflowStatus?: string;
  /**
   * (OPTIONAL) Related findings to link to this finding
   */
  readonly relatedFindings?: ISecurityHubAutomationRuleRelatedFinding[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRuleAction}*
 *
 * @description
 * Security Hub automation rule action configuration for defining what actions to take on matching findings
 *
 * @example
 * ```
 * type: "FINDING_FIELDS_UPDATE"
 * findingFieldsUpdate:
 *   workflowStatus: "SUPPRESSED"
 *   note:
 *     text: "Automatically suppressed by automation rule"
 *     updatedBy: "SecurityTeam"
 * ```
 */
export interface ISecurityHubAutomationRuleAction {
  /**
   * The type of action to perform
   */
  readonly type: string;
  /**
   * (OPTIONAL) Finding fields to update when the action is triggered
   */
  readonly findingFieldsUpdate?: ISecurityHubAutomationRuleFindingFieldsUpdate;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig} / {@link SecurityHubAutomationRuleCriteria}*
 *
 * @description
 * Security Hub automation rule criteria configuration with dynamic keys for flexible filtering
 * Supports any valid SecurityHub finding field as a key with appropriate filter arrays as values
 *
 * @example
 * ```
 * - key: "AwsAccountId"
 *   filter:
 *     - value: "123456789012"
 *       comparison: "EQUALS"
 * - key: "SeverityLabel"
 *   filter:
 *     - value: "HIGH"
 *       comparison: "EQUALS"
 * - key: "ResourceType"
 *   filter:
 *     - value: "AwsS3Bucket"
 *       comparison: "EQUALS"
 * ```
 */
export interface ISecurityHubAutomationRuleCriteria {
  /**
   * The criteria key/field name
   */
  readonly key: string;
  /**
   * The filter to apply for this criteria
   */
  readonly filter:
    | ISecurityHubAutomationRulesStringFilter[]
    | ISecurityHubAutomationRulesNumberFilter[]
    | ISecurityHubAutomationRulesDateFilter[]
    | ISecurityHubAutomationRulesKeyValueFilter[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubAutomationRuleConfig}*
 *
 * {@link https://docs.aws.amazon.com/securityhub/latest/userguide/automation-rules.html} | AWS Security Hub automation rule configuration
 *
 * @description
 * Use this configuration to define Security Hub automation rules that automatically update findings based on specified criteria.
 * Automation rules help streamline security operations by automatically suppressing, updating, or enriching findings.
 *
 * @example
 * ```
 * - name: "SuppressLowSeverityS3Findings"
 *   description: "Automatically suppress low severity S3 findings"
 *   enabled: true
 *   actions:
 *     - type: "FINDING_FIELDS_UPDATE"
 *       findingFieldsUpdate:
 *         workflowStatus: "SUPPRESSED"
 *         note:
 *           text: "Low severity S3 finding automatically suppressed"
 *           updatedBy: "SecurityAutomation"
 *   criteria:
 *     - key: "SeverityLabel"
 *       filter:
 *         - value: "LOW"
 *           comparison: "EQUALS"
 *     - key: "ResourceType"
 *       filter:
 *         - value: "AwsS3Bucket"
 *           comparison: "EQUALS"
 * ```
 */
export interface ISecurityHubAutomationRuleConfig {
  /**
   * The name of the automation rule
   */
  readonly name: string;
  /**
   * A description of what the automation rule does
   */
  readonly description: string;
  /**
   * Whether the automation rule is enabled
   */
  readonly enabled: boolean;
  /**
   * The action to take when findings match the criteria
   */
  readonly actions: ISecurityHubAutomationRuleAction[];
  /**
   * The criteria that findings must match to trigger the action
   */
  readonly criteria: ISecurityHubAutomationRuleCriteria[];
  /**
   * (OPTIONAL) An integer from 1 to 1000 that represents the order in which the rule action is applied to findings
   */
  readonly ruleOrder?: number;
  /**
   * (OPTIONAL) Specifies whether a rule is the last to be applied with respect to a finding that matches the rule criteria
   */
  readonly isTerminal?: boolean;
  /**
   * (OPTIONAL) List of regions to be excluded from applying this automation rule
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link EbsDefaultVolumeEncryptionConfig}*
 *
 * @description
 * Configuration for enabling automatic encryption of all new EBS volumes and snapshots in your AWS environment..
 *
 * @see https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html#encryption-by-default
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
   * Controls whether EBS default volume encryption is enabled.
   * When enabled, all new EBS volumes created in the specified accounts and regions will be encrypted by default.
   */
  readonly enable: boolean;
  /**
   * Name of the AWS Key Management Service (KMS) key to use for encrypting EBS volumes
   *
   * @remarks
   * Note: When no value is provided Landing Zone Accelerator will create the KMS key.
   */
  readonly kmsKey?: t.NonEmptyString;
  /**
   * Specifies which organizational units (OUs) and accounts will have EBS default volume encryption enabled.
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
   * List of AWS regions where EBS default volume encryption should not be enabled.
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig} / {@link DocumentSetConfig} / {@link DocumentConfig}*
 *
 * @description
 * Configuration for defining AWS Systems Manager documents (SSM documents) that can be used to automate tasks on managed instances.
 * SSM documents contain the steps and parameters needed to perform specific administrative tasks or configurations.
 *
 * @see https://docs.aws.amazon.com/systems-manager/latest/userguide/documents.html
 *
 * @example
 * ```
 * - name: SSM-ELB-Enable-Logging
 *   template: path/to/document.yaml
 * ```
 */
export interface IDocumentConfig {
  /**
   * The unique identifier for the SSM document to be created.
   */
  readonly name: t.NonEmptyString;
  /**
   * The file path to the document template containing the SSM document definition.
   * This file must be available in the accelerator configuration repository.
   */
  readonly template: t.NonEmptyString;
  /**
   * The target resource type that defines which AWS resources this document can operate on.
   *
   * @example
   * - "/AWS::EC2::Instance" - Document can run on EC2 instances only
   * - "/" - Document can run on all resource types
   * - If not specified, document cannot run on any resources
   *
   * @remarks
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
 * Configuration for sharing AWS Systems Manager documents across organizational units within your AWS Organization.
 *
 * @see https://docs.aws.amazon.com/systems-manager/latest/userguide/documents-ssm-sharing.html
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
   * Specifies the organizational units (OUs) where the SSM documents will be shared.
   */
  readonly shareTargets: t.IShareTargets;
  /**
   * Array of SSM documents to be shared with the specified organizational units.
   */
  readonly documents: IDocumentConfig[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig}*
 *
 * @description
 * Configuration for AWS Systems Manager (SSM) automation that enables centralized management and distribution of SSM documents
 * across your AWS Organization.
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
   * List of AWS regions where SSM automation documents should not be deployed.
   */
  readonly excludeRegions?: string[];
  /**
   * Array of document sets that define which SSM documents to create and share across organizational units.
   */
  readonly documentSets: IDocumentSetConfig[];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig}*
 *
 * @description
 * Configuration for centralized security services that provides organization-wide security controls and monitoring capabilities.
 * This configuration enables and manages core AWS security services including GuardDuty, Security Hub, Macie, Detective, and Audit Manager
 * across your entire AWS Organization. It establishes a centralized security posture with consistent policies, automated threat detection,
 * compliance monitoring, and unified security findings management to help organizations maintain strong security governance at scale.
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
 *       - name: CIS AWS Foundations Benchmark v5.0.0
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
   * Configuration for automatically encrypting all new EBS volumes across your organization.
   * This ensures data-at-rest protection and helps meet compliance requirements by enforcing
   * encryption on all EBS volumes without requiring manual configuration.
   *
   * AWS Elastic Block Store default encryption configuration
   *
   * @remarks
   * Accelerator uses this parameter to configure EBS default encryption.
   * Accelerator will create a KMS key for every AWS environment (account and region), which will be used as default EBS encryption key.
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
   * Configuration for blocking public access to S3 buckets across your organization.
   * This security control prevents accidental data exposure by blocking public access
   * at the account level, providing an additional layer of protection for sensitive data.
   *
   * @remarks
   * Accelerator uses this parameter to block AWS S3 public access.
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
   * Configuration for AWS Systems Manager security settinga across your organization.
   *
   * @remarks
   * Accelerator uses this parameter to configure SSM-related security settings.
   * To enable SSM Block Public Document Sharing in every region accelerator implemented, you need to provide below value for this parameter.
   * If not specified, SSM Block Public Document Sharing will be disabled by default.
   *
   * @example
   * ```
   * ssmSettings:
   *   blockPublicDocumentSharing:
   *     enable: true
   *     excludeAccounts: []
   * ```
   */
  readonly ssmSettings?: ISsmSettingsConfig;
  /**
   * Configuration for monitoring and reverting unauthorized changes to Service Control Policies.
   * This helps maintain security governance by detecting and alerting on manual modifications
   * to SCPs that could weaken your organization's security posture.
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
   * Configuration for SNS notification subscriptions for security alerts (DEPRECATED).
   *
   * @deprecated This parameter is deprecated and will be removed in a future release.
   * SNS topic configuration has been moved to the Global Config.
   *
   * @remarks
   * Accelerator uses this parameter to define AWS SNS notification configuration.
   * To enable high, medium and low SNS notifications, you need to provide below value for this parameter.
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
  readonly snsSubscriptions?: ISnsSubscriptionConfig[];
  /**
   * Configuration for Amazon Macie data security and privacy service across you organization.
   *
   * @remarks
   * Accelerator uses this parameter to configure Amazon Macie across your organization.
   * When enabled, Macie will scan S3 buckets for sensitive data and publish findings to Security Hub.
   * You can configure the frequency of policy findings updates and enable sensitive data findings publishing.
   *
   * To enable Macie in every region where the accelerator is deployed, set the policy findings
   * publishing frequency to fifteen minutes, and enable publishing of sensitive data findings
   * to Security Hub, you need to provide the below configuration for this parameter.
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
  readonly macie: IMacieConfig;
  /**
   * Configuration for Amazon GuardDuty threat detection service across your organization.
   * GuardDuty provides intelligent threat detection using machine learning to identify
   * malicious activity and unauthorized behavior across your AWS environment.
   */
  readonly guardduty: IGuardDutyConfig;
  /**
   * Configuration for AWS Audit Manager compliance automation service across your organization.
   * Audit Manager helps automate evidence collection and assessment preparation for audits
   * by continuously collecting and organizing evidence from your AWS services.
   */
  readonly auditManager?: IAuditManagerConfig;
  /**
   * Configuration for Amazon Detective security investigation service across your organization.
   * Detective helps analyze and investigate potential security issues by providing
   * visualizations and context around security findings from GuardDuty, Security Hub, and VPC Flow Logs.
   */
  readonly detective?: IDetectiveConfig;
  /**
   * Configuration for AWS Security Hub centralized security findings management across your organization.
   * Security Hub aggregates security alerts and findings from multiple AWS security services.
   *
   * @remarks
   * Accelerator uses this parameter to define AWS Security Hub configuration.
   * To enable AWS Security Hub for all regions and
   * enable "AWS Foundational Security Best Practices v1.0.0" security standard, deployment targets, and disable controls
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
   * Configuration for AWS Systems Manager automation documents across your organization.
   * This enables centralized management and distribution of SSM documents for standardizing
   * operational procedures and automating administrative tasks across all accounts.
   *
   * @remarks
   * Accelerator uses this parameter to define AWS Systems Manager documents configuration.
   * SSM documents are created in designated administrator account for security services, i.e. Audit account.
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
 * Configuration for AWS Key Management Service (KMS) that enables centralized management of encryption keys
 * across your organization. This allows you to create, manage, and control customer-managed KMS keys
 * for encrypting data at rest and in transit, helping meet compliance requirements and security best practices.
 *
 * @see https://docs.aws.amazon.com/kms/latest/developerguide/overview.html
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
  /**
   * Array of KMS key configurations to be created and managed across your organization.
   */
  readonly keySets: IKeyConfig[];
}

/**
 * Enumeration of AWS resource types supported by resource policy enforcement.
 * These resource types can have automated resource-based policies applied through AWS Config rules
 * to ensure consistent security controls and access management across your organization.
 */
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

/**
 * *{@link SecurityConfig} / {@link ResourcePolicyEnforcementConfig} / {@link ResourcePolicySetConfig} / {@link ResourcePolicyConfig}*
 *
 * @description
 * Configuration for defining resource-based policies that will be automatically applied to specific AWS resource types.
 * This allows you to enforce consistent access controls and security policies across resources of the same type
 * throughout your organization using AWS Config rules for automated compliance monitoring and remediation.
 *
 * @example
 * ```
 * resourcePolicies:
 *   - resourceType: S3_BUCKET
 *     document: resource-policies/s3-bucket-policy.json
 *   - resourceType: KMS_KEY
 *     document: resource-policies/kms-key-policy.json
 * ```
 */
export interface IResourcePolicyConfig {
  /**
   * The type of AWS resource that this policy will be applied to.
   * This determines which AWS resources will be targeted for policy enforcement,
   * such as S3 buckets, KMS keys, IAM roles, or other supported resource types.
   */
  readonly resourceType: keyof typeof ResourceTypeEnum;
  /**
   * Path to the JSON policy document file that defines the resource-based policy.
   * This file must be available in the accelerator configuration repository.
   */
  readonly document: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link ResourcePolicyEnforcementConfig} / {@link ResourcePolicyRemediation}*
 *
 * @description
 * Configuration for automated remediation actions when AWS Config detects non-compliant resource policies.
 * This enables automatic correction of policy violations to maintain consistent security controls
 * across your organization without manual intervention, helping ensure continuous compliance.
 *
 * @example
 * ```
 * remediation:
 *   automatic: true
 *   retryAttemptSeconds: 120
 *   maximumAutomaticAttempts: 3
 * ```
 */
export interface IResourcePolicyRemediation {
  /**
   * Controls whether remediation actions are triggered automatically when policy violations are detected.
   * When enabled, AWS Config will automatically attempt to correct non-compliant resource policies.
   */
  readonly automatic: boolean;
  /**
   * Maximum time in seconds that AWS Config waits before timing out a remediation attempt.
   * This prevents remediation actions from running indefinitely and ensures timely completion.
   *
   * @default 60 seconds
   */
  readonly retryAttemptSeconds?: number;
  /**
   * Maximum number of times AWS Config will attempt to remediate a non-compliant resource.
   * This prevents infinite retry loops while allowing for temporary failures to be resolved.
   * After reaching this limit, manual intervention may be required.
   *
   * @default 5 attempts
   */
  readonly maximumAutomaticAttempts?: number;
}

/**
 * *{@link SecurityConfig} / {@link ResourcePolicyEnforcementConfig} / {@link ResourcePolicySetConfig}*
 *
 * @description
 * Configuration for a set of resource policies that will be deployed together to specific organizational units or accounts.
 * This allows you to group related resource policies and deploy them as a cohesive security control package
 * across your organization, ensuring consistent policy enforcement for different environments or business units.
 *
 * @example
 * ```
 * policySets:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *     resourcePolicies:
 *       - resourceType: S3_BUCKET
 *         document: resource-policies/s3-workload-policy.json
 *       - resourceType: KMS_KEY
 *         document: resource-policies/kms-workload-policy.json
 *     inputParameters:
 *       SourceAccount: "123456789012,987654321098"
 *       allowedAccountList: "{{ ALLOWED_EXTERNAL_ACCOUNTS }}"
 * ```
 */
export interface IResourcePolicySetConfig {
  /**
   * Specifies the organizational units and accounts where the AWS Config rules and remediation actions will be deployed.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * Array of resource policy configurations that define the specific policies to be enforced.
   */
  readonly resourcePolicies: IResourcePolicyConfig[];
  /**
   * Custom parameters that will be passed as environment variables to the AWS Config rule and remediation Lambda functions.
   *
   * @remarks
   * Special reserved parameters:
   * - `SourceAccount`: For Lambda functions and Certificate Authority resources, specifies which external accounts
   *   are allowed access. Format: "123456789012,987654321098" (comma-separated account IDs).
   *   Only these specified accounts will be granted access; all other external accounts will be denied.
   *
   * @example
   * ```
   * inputParameters:
   *   SourceAccount: "123456789012,987654321098"
   *   allowedAccountList: "{{ ALLOWED_EXTERNAL_ACCOUNTS }}"
   *   environment: "production"
   * ```
   */
  readonly inputParameters?: { [key: string]: string };
}

/**
 * *{@link SecurityConfig} / {@link ResourcePolicyEnforcementConfig}/{@link NetworkPerimeterConfig}*
 *
 * @description
 * Configuration for defining the network perimeter scope when using VPC lookup parameters in resource policies.
 *
 *  @example
 * ```
 * networkPerimeter:
 *   managedVpcOnly: true
 * ```
 */
export interface INetworkPerimeterConfig {
  /**
   * Controls which VPCs are included when using VPC lookup parameters in resource policy templates.
   *
   * @remarks
   * When `true`: All VPCs in the target accounts will be included when the parameter `ACCEL_LOOKUP:VPC|VPC_ID:XX` is used.
   * This provides broader network perimeter coverage including pre-existing VPCs.
   *
   * When `false`: Only VPCs created by the Landing Zone Accelerator will be included when the parameter `ACCEL_LOOKUP:VPC|VPC_ID:XX` is used.
   */
  readonly managedVpcOnly?: boolean;
}

/**
 * *{@link SecurityConfig} / {@link ResourcePolicyEnforcementConfig}*
 *
 * @description
 * Configuration for automated resource policy enforcement across your AWS Organization using AWS Config rules.
 *
 * @remarks
 * This configuration deploys AWS Config rules that continuously monitor resources and automatically
 * apply or remediate resource-based policies to maintain compliance with your organization's security standards.
 * Supported resource types include S3 buckets, IAM roles, KMS keys, and many other AWS services.
 *
 * Here is the list of supported services {@link SecurityConfigTypes.resourceTypeEnum }
 *
 * @example
 * ```
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
  /**
   * Controls whether resource policy enforcement is enabled across your organization.
   * When enabled, AWS Config rules will be deployed to monitor and enforce resource-based policies
   * according to the configured policy sets and remediation settings.
   */
  readonly enable: boolean;
  /**
   * Configuration for automated remediation when policy violations are detected.
   * This defines how AWS Config should respond when resources are found to be non-compliant.
   */
  readonly remediation: IResourcePolicyRemediation;
  /**
   * Array of policy sets that define which resource policies to enforce and where to deploy them.
   */
  readonly policySets: IResourcePolicySetConfig[];
  /**
   * Configuration for network perimeter controls when using VPC lookup parameters in resource policies.
   * This optional setting controls which VPCs are included when resolving network references in policy templates.
   */
  readonly networkPerimeter?: INetworkPerimeterConfig;
}

/**
 * *{@link SecurityConfig} / {@link AccessAnalyzerConfig}*
 *
 * @description
 * Configuration for AWS Identity and Access Management (IAM) Access Analyzer that identifies resources with external access
 * and helps implement least privilege by analyzing resource policies for security risks.
 *
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html
 *
 * @example
 * ```
 * accessAnalyzer:
 *   enable: true
 * ```
 */
export interface IAccessAnalyzerConfig {
  /**
   * Controls whether AWS IAM Access Analyzer is enabled across your organization.
   *
   * @remarks
   * Once enabled, IAM Access Analyzer examines policies and reports a list of findings for resources that grant public or cross-account access from outside your AWS Organizations in the IAM console and through APIs.
   */
  readonly enable: boolean;
}

/**
 * *{@link SecurityConfig} / {@link IamPasswordPolicyConfig}*
 *
 * @description
 * Configuration for AWS Identity and Access Management (IAM) password policy that enforces password complexity and security requirements
 * for IAM users across your organization.
 *
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_account-policy.html
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
   * Controls whether IAM users can change their own passwords through the AWS Management Console.
   * When enabled, users can update their passwords without administrator intervention.
   *
   * @default true
   */
  readonly allowUsersToChangePassword: boolean;
  /**
   * Controls whether IAM users can set a new password after their current password expires.
   * When enabled, users with expired passwords cannot access the console until an administrator resets their password.
   *
   * @default true
   */
  readonly hardExpiry: boolean;
  /**
   * Requires passwords to contain at least one uppercase letter from the ISO basic Latin alphabet (A to Z).
   *
   * @remarks If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one uppercase character.
   *
   * @default true
   */
  readonly requireUppercaseCharacters: boolean;
  /**
   * Requires passwords to contain at least one lowercase letter from the ISO basic Latin alphabet (a to z).
   *
   * @remarks If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one lowercase character.
   *
   * @default true
   */
  readonly requireLowercaseCharacters: boolean;
  /**
   * Requires passwords to contain at least one special character.
   * Allowed symbols: ! @ # $ % ^ & * ( ) _ + - = [ ] { } | '
   *
   * @remarks If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one symbol character.
   *
   * @default true
   */
  readonly requireSymbols: boolean;
  /**
   * Requires passwords to contain at least one numeric character (0-9).
   *
   * @remarks If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one numeric character.
   *
   * @default true
   */
  readonly requireNumbers: boolean;
  /**
   * The minimum number of characters required for IAM user passwords.
   *
   * @remarks If you do not specify a value for this parameter, then the operation uses the default value of 14.
   *
   * @default 14
   */
  readonly minimumPasswordLength: number;
  /**
   * The number of previous passwords that users cannot reuse.
   *
   * @remarks If you do not specify a value for this parameter, then the operation uses the default value of 24.
   * The result is that IAM users are not prevented from reusing previous passwords.
   *
   * @default 24
   */
  readonly passwordReusePrevention: number;
  /**
   * The maximum number of days a password remains valid before requiring a change.
   *
   * @remarks Valid values are between 1 and 1095 days.
   *
   * @default 90
   */
  readonly maxPasswordAge: number;
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule} / {@link CustomRule} / {@link CustomRuleLambda}*
 *
 * @description
 * Configuration for AWS Lambda functions that implement custom AWS Config rules for compliance monitoring.
 *
 * @see https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_develop-rules.html
 *
 * @example
 * lambda:
 * ```
 * lambda:
 *   sourceFilePath: path/to/function.zip
 *   handler: index.handler
 *   runtime: nodejsXX.x
 *   rolePolicyFile: path/to/policy.json
 *   timeout: 3
 * ```
 */
export interface ICustomRuleLambdaType {
  /**
   * Path to the ZIP file containing your Lambda function source code.
   * This file must be available in the accelerator configuration repository.
   */
  readonly sourceFilePath: t.NonEmptyString;
  /**
   * The entry point for your Lambda function that AWS Config will invoke.
   * Specifies the method within your code that Lambda calls to execute the compliance evaluation.
   * Format varies by runtime (e.g., "index.handler" for Node.js, "lambda_function.lambda_handler" for Python).
   *
   * @see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-features.html#gettingstarted-features-programmingmodel
   */
  readonly handler: t.NonEmptyString;
  /**
   * The runtime environment for executing your Lambda function.
   * Must be compatible with your function's source code language and version requirements.
   *
   * @example "nodejs18.x", "python3.9", "java11"
   * @see https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
   */
  readonly runtime: t.NonEmptyString;
  /**
   * Path to the JSON file defining IAM policies for the Lambda execution role.
   * This file must be available in the accelerator configuration repository.
   */
  readonly rolePolicyFile: t.NonEmptyString;
  /**
   * Maximum execution time for the Lambda function in seconds.
   */
  readonly timeout?: number;
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule} / {@link TriggeringResource}*
 *
 * @description
 * Configuration for defining which AWS resources trigger evaluations for custom AWS Config rules.
 *
 * @example
 * Trigger by tag:
 * ```
 * triggeringResources:
 *   lookupType: Tag
 *   lookupKey: Environment
 *   lookupValue:
 *     - Production
 *     - Staging
 * ```
 *
 * Trigger by resource type:
 * ```
 * triggeringResources:
 *   lookupType: ResourceTypes
 *   lookupKey: ""
 *   lookupValue:
 *     - AWS::EC2::Instance
 *     - AWS::S3::Bucket
 * ```
 */
export interface ITriggeringResourceType {
  /**
   * The method used to identify which resources should trigger Config rule evaluations.
   * This determines how the Config rule will find and evaluate AWS resources for compliance.
   *
   * @remarks
   * - **ResourceId**: Target specific resources by their unique identifiers
   * - **Tag**: Target resources that have specific tag key-value pairs
   * - **ResourceTypes**: Target all resources of specific AWS resource types
   */
  readonly lookupType: 'ResourceId' | 'Tag' | 'ResourceTypes' | string;
  /**
   * The lookup key used to identify resources based on the specified lookup type.
   */
  readonly lookupKey: t.NonEmptyString;
  /**
   * Array of values used to match resources based on the lookup type and key.
   */
  readonly lookupValue: t.NonEmptyString[];
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule} / {@link CustomRule}*
 *
 * @description
 * Configuration for custom AWS Config rules that use Lambda functions to evaluate resource compliance.
 *
 * @see https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_develop-rules.html
 *
 * @example
 * Custom rule:
 * ```
 * lambda:
 *   sourceFilePath: path/to/function.zip
 *   handler: index.handler
 *   runtime: nodejsXX.x
 *   rolePolicyFile: path/to/policy.json
 *   timeout: 3
 * periodic: true
 * maximumExecutionFrequency: Six_Hours
 * configurationChanges: true
 * triggeringResources:
 *   lookupType: Tag
 *   lookupKey: EnvironmentA
 *   lookupValue:
 *     - AWS::EC2::Instance
 * ```
 */
export interface ICustomRuleConfigType {
  /**
   * Configuration for the Lambda function that implements the custom compliance evaluation logic.
   */
  readonly lambda: ICustomRuleLambdaType;
  /**
   * Controls whether the rule runs on a scheduled basis at regular intervals.
   * When enabled, the rule will evaluate resources according to the specified frequency.
   *
   * @default true
   */
  readonly periodic?: boolean;
  /**
   * The frequency at which periodic evaluations are performed.
   *
   * @default MaximumExecutionFrequency.TWENTY_FOUR_HOURS
   */
  readonly maximumExecutionFrequency:
    | 'One_Hour'
    | 'Three_Hours'
    | 'Six_Hours'
    | 'Twelve_Hours'
    | 'TwentyFour_Hours'
    | string;
  /**
   * Controls whether the rule runs when AWS resource configurations change.
   * When enabled, the rule will immediately evaluate affected resources whenever
   * their configuration is modified.
   *
   * @default false
   */
  readonly configurationChanges?: boolean;
  /**
   * Specifies which AWS resources will trigger evaluations for this Config rule.
   */
  readonly triggeringResources: ITriggeringResourceType;
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule} / {@link ConfigRuleRemediation} / {@link RemediationParameters}*
 *
 * @description
 * Configuration for input parameters passed to AWS Config rule remediation actions.
 * These parameters provide the necessary data and context for remediation automation documents
 * to execute corrective actions on non-compliant resources, enabling automated compliance restoration.
 *
 * @example
 * ```
 * parameters:
 *   - name: BucketName
 *     value: RESOURCE_ID
 *     type: String
 *   - name: KMSMasterKey
 *     value: ${ACCEL_LOOKUP::KMS}
 *     type: String
 *   - name: AllowedRegions
 *     value: us-east-1,us-west-2
 *     type: StringList
 * ```
 */
export interface IRemediationParametersConfigType {
  /**
   * The name of the parameter as expected by the remediation automation document.
   */
  readonly name: t.NonEmptyString;
  /**
   * The value to pass for this parameter during remediation execution.
   */
  readonly value: t.NonEmptyString;
  /**
   * The data type of the parameter value, determining how the remediation document interprets the input.
   *
   *  @remarks
   * - **String**: Single value parameter
   * - **StringList**: Comma-separated list of values for parameters that accept multiple inputs
   */
  readonly type: 'String' | 'StringList';
}

// export interface IConfigRuleRemediationType {
//   readonly name: t.NonEmptyString;
//   readonly value: t.NonEmptyString;
//   readonly type: 'String' | 'StringList';
// }

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule} / {@link ConfigRuleRemediation}*
 *
 * @description
 * Configuration for automated remediation actions that AWS Config executes when resources are found non-compliant.
 * This enables automatic correction of compliance violations using AWS Systems Manager automation documents,
 * reducing manual intervention and ensuring continuous compliance across your AWS environment.
 *
 * @see https://docs.aws.amazon.com/config/latest/developerguide/remediation.html
 *
 * @example
 * ```
 * remediation:
 *   rolePolicyFile: path/to/remediation-role-policy.json
 *   automatic: true
 *   targetId: AWSConfigRemediation-EnableS3BucketEncryption
 *   targetAccountName: Audit
 *   targetVersion: "1"
 *   retryAttemptSeconds: 60
 *   maximumAutomaticAttempts: 3
 *   parameters:
 *     - name: BucketName
 *       value: RESOURCE_ID
 *       type: String
 *     - name: SSEAlgorithm
 *       value: AES256
 *       type: String
 *   excludeRegions:
 *     - us-gov-east-1
 * ```
 */
export interface IConfigRuleRemediationType {
  /**
   * Path to the JSON file defining IAM policies for the remediation execution role.
   * This file must be available in the configuration repository.
   */
  readonly rolePolicyFile: t.NonEmptyString;
  /**
   * Controls whether remediation actions are triggered automatically when non-compliance is detected.
   * When enabled, AWS Config will immediately attempt to remediate non-compliant resources
   * without manual intervention.
   */
  readonly automatic: boolean;
  /**
   * The name of the AWS Systems Manager automation document that performs the remediation actions.
   */
  readonly targetId: t.NonEmptyString;
  /**
   * The name of the AWS account that owns the remediation automation document.
   *
   * @remarks
   * The Landing Zone Accelerator typically creates these documents in the Audit account
   * and shares them with other accounts for centralized remediation management.
   */
  readonly targetAccountName?: t.NonEmptyString;
  /**
   * The version of the target automation document to use for remediation.
   *
   * @remarks
   * If you make backward incompatible changes to the SSM document, you must call
   * PutRemediationConfiguration API again to ensure the remediations can run.
   */
  readonly targetVersion?: t.NonEmptyString;
  /**
   * Configuration for a Lambda function that supports the remediation automation document.
   * This is used when the remediation requires custom logic that cannot be achieved
   * through standard SSM automation document actions alone.
   */
  readonly targetDocumentLambda?: ICustomRuleLambdaType;
  /**
   * Maximum time in seconds that AWS Config waits for each remediation attempt to complete.
   * This prevents remediation actions from running indefinitely and ensures timely failure detection.
   *
   * @default 60 seconds
   *
   * @example
   * If you specify retryAttemptSeconds as 50 and maximumAutomaticAttempts as 5,
   * AWS Config will run auto-remediations 5 times within 50 seconds before throwing an exception.
   */
  readonly retryAttemptSeconds?: number;
  /**
   * The maximum number of remediation attempts for a single non-compliant resource.
   * This prevents infinite retry loops while allowing for temporary failures to be resolved.
   * After reaching this limit, manual intervention may be required.
   *
   * @default 5 attempts
   *
   * @example
   * If you specify maximumAutomaticAttempts as 5 with retryAttemptSeconds as 50,
   * AWS Config will put a RemediationException after the 5th failed attempt within 50 seconds.
   */
  readonly maximumAutomaticAttempts?: number;
  /**
   * Array of input parameters to pass to the remediation automation document.
   * These parameters provide the necessary context and data for the automation document
   * to perform the appropriate corrective actions on non-compliant resources.
   */
  readonly parameters?: IRemediationParametersConfigType[];
  /**
   * List of AWS regions where this remediation should not be applied.
   */
  readonly excludeRegions?: string[];
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule}*
 *
 * @description
 * Configuration for AWS Config rules that evaluate AWS resource compliance against organizational policies and best practices.
 * Config rules can be either AWS-managed rules (pre-built compliance checks) or custom rules (organization-specific logic)
 * and can include automated remediation to restore compliance when violations are detected.
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
 *         timeout: 3
 *       periodic: true
 *       maximumExecutionFrequency: Six_Hours
 *       configurationChanges: true
 *       triggeringResources:
 *         lookupType: Tag
 *         lookupKey: EnvironmentA
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
   * Unique name for the AWS Config rule within your organization.
   *
   * @remarks Changing this value of an AWS Config Rule will trigger a new resource creation.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable description explaining what this Config rule evaluates.
   */
  readonly description?: t.NonEmptyString;
  /**
   * The identifier of the AWS-managed rule to use for compliance evaluation.
   */
  readonly identifier?: t.NonEmptyString;
  /**
   * Key-value pairs that provide configuration parameters to the Config rule.
   */
  readonly inputParameters?: { [key: t.NonEmptyString]: t.NonEmptyString } | null; // TODO: Did this work?
  /**
   * Array of AWS resource types that this rule will evaluate for compliance.
   */
  readonly complianceResourceTypes?: t.NonEmptyString[];
  /**
   * The type of Config rule being created.
   * @remarks Set to "Custom" for custom rules backed by Lambda functions, or omit for AWS-managed rules.
   */
  readonly type?: t.NonEmptyString;
  /**
   * Configuration for custom config rules backed by AWS Lambda functions.
   * Required when type is set to "Custom" for organization-specific compliance logic.
   */
  readonly customRule?: ICustomRuleConfigType;
  /**
   * Configuration for automated remediation actions when resources are found non-compliant.
   * When configured, AWS Config can automatically fix compliance violations without manual intervention,
   * ensuring continuous compliance across your AWS environment.
   */
  readonly remediation?: IConfigRuleRemediationType;
  /**
   * Key-value pairs to assign as tags to the Config rule.
   */
  readonly tags?: t.ITag[];
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet}*
 *
 * @description
 * Configuration for a set of AWS Config rules that will be deployed together to specific organizational units or accounts.
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
   * Specifies the organizational units and accounts where this set of Config rules will be deployed.
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
   * Array of AWS Config rules to deploy as part of this rule set.
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
   *               lookupType: Tag
   *               lookupKey: EnvironmentA
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
 * Configuration for AWS Config aggregation that centralizes compliance data from multiple accounts and regions
 * into a single location for organization-wide visibility and reporting. This enables centralized compliance
 * monitoring and simplifies governance oversight across your entire AWS Organization.
 *
 * @remarks
 * - Not used in AWS Control Tower environments (Control Tower provides its own aggregation)
 * - Aggregation will be configured in all enabled regions unless specifically excluded
 * - If no delegated admin account is specified, aggregation occurs in the management account
 *
 * @see https://docs.aws.amazon.com/config/latest/developerguide/aggregate-data.html
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
  /**
   * Controls whether AWS Config aggregation is enabled across your organization.
   * When enabled, compliance data from all accounts and regions will be centralized
   * for unified reporting and governance oversight.
   */
  readonly enable: boolean;
  /**
   * The name of the account designated to collect and store aggregated Config data.
   *
   * @remarks
   * If not specified, aggregation will occur in the management account.
   * The delegated admin account must have appropriate permissions to collect Config data from all organization accounts.
   */
  readonly delegatedAdminAccount?: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig}*
 *
 * @description
 * Configuration for AWS Config service that enables continuous monitoring and assessment of AWS resource configurations
 * for compliance, security, and governance. This service records configuration changes, evaluates resources against
 * compliance rules, and provides centralized visibility into your AWS environment's configuration state.
 *
 * @see https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html
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
   * Controls whether the AWS Config configuration recorder is enabled to track resource changes.
   *
   * @remarks
   * To enable AWS Config, you must create a configuration recorder. The ConfigurationRecorder resource
   * describes the AWS resource types for which AWS Config records configuration changes.
   */
  readonly enableConfigurationRecorder: boolean;
  /**
   * Specifies the organizational units and accounts where AWS Config will be deployed.
   *
   * @remarks
   * - Leaving undefined enables AWS Config across all accounts and enabled regions (recommended)
   * - We highly recommend enabling AWS Config organization-wide for comprehensive governance
   * - Use deployment targets only when granular control is specifically required
   * - The delegated admin account from centralSecurityServices will always have AWS Config enabled
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
   * Controls whether the delivery channel is enabled for sending configuration changes to S3.
   *
   * @deprecated This parameter is deprecated.
   *
   * @remarks
   * AWS Config uses the delivery channel to deliver configuration changes to your Amazon S3 bucket.
   */
  readonly enableDeliveryChannel?: boolean;
  /**
   * Controls whether to override existing Config recorder settings in accounts that already have Config enabled.
   *
   * @remarks
   * **IMPORTANT WARNINGS:**
   * - Must be enabled if any account/region has an existing Config recorder, even if recording is disabled
   * - Do NOT enable this if you have successfully deployed LZA with enableConfigurationRecorder=true and overrideExisting=false
   * - Enabling this setting inappropriately will cause resource conflicts
   * - When enabled, ensure SCPs don't block the passRole IAM permission for role {acceleratorPrefix}Config
   */
  readonly overrideExisting?: boolean;
  /**
   * Configuration for AWS Config aggregation that centralizes compliance data from multiple accounts and regions.
   * This enables organization-wide compliance reporting and centralized governance oversight.
   */
  readonly aggregation?: IAwsConfigAggregation;
  /**
   * Array of Config rule sets that define compliance checks to be deployed across your organization.
   */
  readonly ruleSets?: IAwsConfigRuleSet[];
  /**
   * Controls whether to use AWS service-linked roles for Config instead of custom IAM roles created by LZA.
   * @remarks
   * - Recommended for new deployments as it simplifies IAM management
   * - Service-linked roles are automatically managed by AWS with appropriate permissions
   * - If not specified, LZA will create and manage custom IAM roles for Config
   *
   * @see https://docs.aws.amazon.com/config/latest/developerguide/using-service-linked-roles.html
   */
  readonly useServiceLinkedRole?: boolean;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link MetricSetConfig} / {@link MetricConfig}*
 *
 * @description
 * Configuration for CloudWatch metric filters that extract metrics from log data for monitoring and alerting.
 * Metric filters turn log data into numerical CloudWatch metrics that you can graph or set alarms on.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html
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
   * Unique name for the metric filter within the log group.
   */
  readonly filterName: t.NonEmptyString;
  /**
   * The name of the CLoudWatch Logs log group to monitor for matching events.
   * The metric filter will scan all log streams within this log group for events
   * that match the specified filter pattern.
   */
  readonly logGroupName: t.NonEmptyString;
  /**
   * A symbolic description of how CloudWatch Logs should interpret the data in each log event.
   * The pattern specifies what to look for in the log file, such as timestamps, IP addresses, strings, and so on.
   */
  readonly filterPattern: t.NonEmptyString;
  /**
   * The destination namespace of the new CloudWatch metric.
   */
  readonly metricNamespace: t.NonEmptyString;
  /**
   * The name of the CloudWatch metric to which the monitored log information should be published.
   */
  readonly metricName: t.NonEmptyString;
  /**
   * The numerical value to publish to the metric each time a matching log is found.
   * Can either be a literal number (typically “1”), or the name of a field in the structure to take the value from the matched event. If you are using a field value, the field value must have been matched using the pattern.
   *
   * @remarks
   * Note: If you want to specify a field from a matched JSON structure, use '$.fieldName', and make sure the field is in the pattern (if only as '$.fieldName = *').
   * If you want to specify a field from a matched space-delimited structure, use '$fieldName'.
   */
  readonly metricValue: t.NonEmptyString;
  /**
   * Defines how CloudWatch alarms should handle periods when no matching log events occur.
   */
  readonly treatMissingData?: t.NonEmptyString;
  /**
   * Th value reported to the metric filter during a period when logs are ingested but no matching logs are found.
   */
  readonly defaultValue?: number;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link MetricSetConfig}*
 *
 * @description
 * Configuration for a set of CloudWatch metric filters that will be deployed together to specific regions and organizational units.
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
   * AWS regions where the CloudWatch metric filters will be deployed.
   */
  readonly regions?: string[];
  /**
   * Specfies the organizational units and accounts where this set of metric filters will be deployed.
   */
  readonly deploymentTargets?: t.IDeploymentTargets;
  /**
   * Array of CloudWatch metric filter configurations to deploy as part of this metric set.
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
 * Configuration for CloudWatch alarms that monitor metrics and trigger notifications when thresholds are breached.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html
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
   * Unique name for the CloudWatch alarm
   */
  readonly alarmName: t.NonEmptyString;
  /**
   * Human-readable description explaining what this alarm monitors and when it triggers.
   */
  readonly alarmDescription: t.NonEmptyString;
  /**
   * SNS notification level for alarm alerts.
   *
   * @deprecated This parameter is deprecated.
   */
  readonly snsAlertLevel?: t.NonEmptyString;
  /**
   * The name of the SNS topic to send alarm notifications to when the alarm state changes.
   * This topic name must be defined in the global configuration.
   */
  readonly snsTopicName?: t.NonEmptyString;
  /**
   * The name of the CloudWatch metric to monitor for threshold breaches.
   */
  readonly metricName: t.NonEmptyString;
  /**
   * The CloudWatch namespace where the metric is located.
   */
  readonly namespace: t.NonEmptyString;
  /**
   * The comparison operator used to evaluate the metric against the threshold.
   * This determines the condition that must be met for the alarm to trigger.
   */
  readonly comparisonOperator: t.NonEmptyString;
  /**
   * The number of consecutive periods over which the threshold must be breached for the alarm to trigger.
   */
  readonly evaluationPeriods: number;
  /**
   * The length of each evaluation period in seconds.
   */
  readonly period: number;
  /**
   * The statistical function to apply to the metric data points within each period.
   * This determines how multiple data points within a period are aggregated for threshold comparison.
   *
   * @remarks
   * Available statistics:
   * - "Minimum" | "min": Lowest value in the period
   * - "Maximum" | "max": Highest value in the period
   * - "Average" | "avg": Average of all values in the period
   * - "Sum" | "sum": Total of all values in the period (common for counting metrics)
   * - "SampleCount" | "n": Number of data points in the period
   * - "pNN.NN": Percentile statistics (e.g., "p95.00" for 95th percentile)
   */
  readonly statistic: t.NonEmptyString;
  /**
   * The threshold value that the metric statistic is compared against to determine alarm state.
   * When the metric breaches this threshold according to the comparison operator,
   * the alarm will transition to the ALARM state and trigger notifications.
   */
  readonly threshold: number;
  /**
   * Defines how the alarm should behave when metric data is missing or is insufficient.
   *
   * @remarks
   * - "notBreaching": Treat missing data as not breaching the threshold
   * - "breaching": Treat missing data as breaching the threshold
   * - "ignore": Ignore missing data when evaluating alarm state (alarm state is maintained)
   * - "missing": Treat missing data as missing (the alarm transitions to INSUFFICIENT_DATA)
   *
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html#alarms-and-missing-data
   */
  readonly treatMissingData: t.NonEmptyString;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link AlarmSetConfig}}*
 *
 * @description
 * Configuration for a set of CloudWatch alarms that will be deployed together to specific regions and organizational units.
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
   * AWS regions where the CloudWatch alarms will be deployed.
   */
  readonly regions?: string[];
  /**
   * Specifies the organizational units and accounts where this set of alarms will be deployed.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * Array of CloudWatch alarm configurations to deploy as part of this alarm set.
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
 * @description
 * Configuration for encrypting CloudWatch log groups using AWS Key Management Service (KMS).
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
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
   * References a KMS key created and managed by Landing Zone Accelerator for log group encryption.
   *
   * @remarks
   * **CAUTION:** When importing an existing CloudWatch log group that has encryption enabled,
   * specifying any KMS parameter will cause LZA to associate a new key with the log group.
   * Verify that processes and applications using the previous key have access to the new key before updating.
   *
   * This is the logical `name` property of the key as defined in security-config.yaml.
   */
  readonly kmsKeyName?: t.NonEmptyString;
  /**
   * References a KMS key, not managed by LZA, for log group encryption.
   *
   * @remarks
   * **CAUTION:** When importing an existing CloudWatch log group that has encryption enabled,
   * specifying any KMS parameter will cause LZA to associate a new key with the log group.
   * Verify that processes and applications using the previous key have access to the new key before updating.
   *
   * **Important:** The CloudWatch Logs service must have the necessary permissions to use this customer-managed key (CMK).
   * Ensure the key policy allows CloudWatch Logs to perform cryptographic operations.
   *
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
   */
  readonly kmsKeyArn?: t.NonEmptyString;
  /**
   * Uses the default CloudWatch Logs KMS key that is automatically deployed by Landing Zone Accelerator.
   *
   * @remarks
   * Set this property to `true` if you would like to use the
   * default CloudWatch Logs KMS customer-managed key (CMK) that is deployed by Landing Zone Accelerator.
   *
   * **CAUTION:** When importing an existing CloudWatch log group that has encryption enabled,
   * specifying any KMS parameter will cause LZA to associate a new key with the log group.
   * Verify that processes and applications using the previous key have access to the new key before updating.
   *
   * This key is deployed to all accounts managed by the solution by default.
   */
  readonly useLzaManagedKey?: boolean;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link LogGroupsConfig}*
 *
 * @description
 * Configuration for deploying and managing CloudWatch log groups across your organization.
 * You can deploy new log groups or import existing ones into your accelerator configuration for centralized management.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html
 *
 * @example
 * CloudWatch Log Group that is using a customer-managed key (CMK) that is being managed by Landing Zone Accelerator on AWS.
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
   * The name of the CLoudWatch log group to create or manage.
   *
   * @remarks
   * If importing an existing log group, this must be the name of the
   * group as it exists in your account.
   */
  readonly logGroupName: t.NonEmptyString;
  /**
   * The number of days to retain log events in the log group.
   *
   * @remarks To retain all logs, set this value to undefined.
   * @default undefined
   */
  readonly logRetentionInDays: number;
  /**
   * Controls whether the log group should be protected from accidental deletion.
   *
   * @remarks Set this property to `false` if you would like the log group
   * to be deleted if it is removed from the solution configuration file.
   *
   * @default true
   */
  readonly terminationProtected?: boolean;
  /**
   * Configuration for encrypting log data at rest using AWS KMS.
   *
   * @remarks
   * **CAUTION:** When importing an existing encrypted log group, specifying any KMS parameter
   * will cause LZA to associate a new key with the log group. This also applies to existing
   * LZA-managed log groups when changing KMS parameters. Verify that processes and applications
   * using the previous key have access to the new key before updating.
   */
  readonly encryption?: IEncryptionConfig;
  /**
   * Specifies the organizational units and accounts where this log group will be deployed.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig}*
 *
 * @description
 * Configuration for AWS CloudWatch monitoring and logging services across your organization.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html
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
   * Array of metric filter sets that extract metrics from log data for monitoring and alerting.
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
   * Array of alarm sets that monitor metrics and trigger notifications when thresholds are breached.
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
   * Array of CloudWatch log group configurations for centralized log management.
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
 *
 * @category Security Configuration
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
  readonly homeRegion?: string;
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
