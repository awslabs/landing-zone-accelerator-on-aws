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

import { createLogger } from '@aws-accelerator/utils';

import * as t from './common-types';

const logger = createLogger(['security-config']);

/**
 * AWS Accelerator SecurityConfig Types
 */
export class SecurityConfigTypes {
  /**
   * SNS notification subscription configuration.
   * ***Deprecated***
   * Replaced by snsTopics in global config
   */
  static readonly snsSubscriptionConfig = t.interface({
    level: t.nonEmptyString,
    email: t.nonEmptyString,
  });

  /**
   * Amazon Web Services S3 configuration
   */
  static readonly s3PublicAccessBlockConfig = t.interface({
    /**
     *  S3 PublicAccessBlock enable flag
     */
    enable: t.boolean,
    /**
     * List of AWS Account names to be excluded from configuring S3 PublicAccessBlock
     */
    excludeAccounts: t.optional(t.array(t.string)),
  });

  /**
   * Revert Manual Service Control Policy (SCP) Changes configuration
   */
  static readonly scpRevertChangesConfig = t.interface({
    /**
     * Determines if manual changes to service control policies are automatically reverted
     */
    enable: t.boolean,
    /**
     * The name of the SNS Topic to send alerts to when scps are changed manually
     */
    snsTopicName: t.optional(t.nonEmptyString),
  });

  /**
   * AWS KMS Key configuration
   */
  static readonly keyConfig = t.interface({
    /**
     * Unique Key name for logical reference
     */
    name: t.nonEmptyString,
    /**
     * Initial alias to add to the key
     */
    alias: t.optional(t.nonEmptyString),
    /**
     * Key policy definition file
     */
    policy: t.optional(t.nonEmptyString),
    /**
     * A description of the key.
     */
    description: t.optional(t.nonEmptyString),
    /**
     * Indicates whether AWS KMS rotates the key.
     */
    enableKeyRotation: t.optional(t.boolean),
    /**
     * Indicates whether the key is available for use.
     */
    enabled: t.optional(t.boolean),
    /**
     * Whether the encryption key should be retained when it is removed from the Stack.
     */
    removalPolicy: t.optional(t.enums('KeyRemovalPolicy', ['destroy', 'retain', 'snapshot'])),
    /**
     * Key deployment targets
     */
    deploymentTargets: t.deploymentTargets,
  });

  /**
   * AWS Macie configuration
   */
  static readonly macieConfig = t.interface({
    /**
     * Indicates whether AWS Macie enabled.
     */
    enable: t.boolean,
    /**
     * List of AWS Region names to be excluded from configuring Amazon Macie
     */
    excludeRegions: t.optional(t.array(t.region)),
    /**
     * Specifies how often to publish updates to policy findings for the account. This includes publishing updates to Security Hub and Amazon EventBridge (formerly called Amazon CloudWatch Events).
     * An enum value that specifies how frequently findings are published
     * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
     */
    policyFindingsPublishingFrequency: t.enums('FrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
    /**
     * Specifies whether to publish sensitive data findings to Security Hub. If you set this value to true, Amazon Macie automatically publishes all sensitive data findings that weren't suppressed by a findings filter. The default value is false.
     */
    publishSensitiveDataFindings: t.boolean,
    /**
     * Declaration of a (S3 Bucket) Lifecycle rule.
     */
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
  });

  /**
   * AWS GuardDuty S3 Protection configuration.
   */
  static readonly guardDutyS3ProtectionConfig = t.interface({
    /**
     * Indicates whether AWS GuardDuty S3 Protection enabled.
     */
    enable: t.boolean,
    /**
     * List of AWS Region names to be excluded from configuring Amazon GuardDuty S3 Protection
     */
    excludeRegions: t.optional(t.array(t.region)),
  });

  /**
   * AWS GuardDuty S3 Protection configuration.
   */
  static readonly guardDutyEksProtectionConfig = t.interface({
    /**
     * Indicates whether AWS GuardDuty EKS Protection enabled.
     */
    enable: t.boolean,
    /**
     * List of AWS Region names to be excluded from configuring Amazon GuardDuty EKS Protection
     */
    excludeRegions: t.optional(t.array(t.region)),
  });

  /**
   * AWS GuardDuty Export Findings configuration.
   */
  static readonly guardDutyExportFindingsConfig = t.interface({
    /**
     * Indicates whether AWS GuardDuty Export Findings enabled.
     */
    enable: t.boolean,
    /**
     * Indicates whether AWS GuardDuty Export Findings destination can be overwritten.
     */
    overrideExisting: t.optional(t.boolean),
    /**
     * The type of resource for the publishing destination. Currently only Amazon S3 buckets are supported.
     */
    destinationType: t.enums('DestinationType', ['S3']),
    /**
     * An enum value that specifies how frequently findings are exported, such as to CloudWatch Events.
     * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
     */
    exportFrequency: t.enums('ExportFrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
  });

  /**
   * AWS GuardDuty configuration
   */
  static readonly guardDutyConfig = t.interface({
    /**
     * Indicates whether AWS GuardDuty enabled.
     */
    enable: t.boolean,
    /**
     * List of AWS Region names to be excluded from configuring Amazon GuardDuty S3 Protection
     */
    excludeRegions: t.optional(t.array(t.region)),
    /**
     * AWS GuardDuty S3 Protection
     */
    s3Protection: this.guardDutyS3ProtectionConfig,
    /**
     * AWS EKS Protection
     */
    eksProtection: t.optional(this.guardDutyEksProtectionConfig),
    /**
     * AWS GuardDuty Export Findings configuration.
     */
    exportConfiguration: this.guardDutyExportFindingsConfig,
    /**
     * Declaration of a S3 Lifecycle rule.
     */
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
  });

  /**
   * AWS Audit Manager Default Report configuration.
   */
  static readonly auditManagerDefaultReportsDestinationConfig = t.interface({
    /**
     * Indicates whether AWS GuardDuty Export Findings enabled.
     */
    enable: t.boolean,
    /**
     * The type of resource for the publishing destination. Currently only Amazon S3 buckets are supported.
     */
    destinationType: t.enums('DestinationType', ['S3']),
  });

  /**
   * AWS Audit Manager configuration
   */
  static readonly auditManagerConfig = t.interface({
    /**
     * Indicates whether AWS Audit Manager enabled.
     */
    enable: t.boolean,
    /**
     * List of AWS Region names to be excluded from configuring Amazon GuardDuty S3 Protection
     */
    excludeRegions: t.optional(t.array(t.region)),
    /**
     * AWS GuardDuty Export Findings configuration.
     */
    defaultReportsConfiguration: this.auditManagerDefaultReportsDestinationConfig,
    /**
     * Declaration of a S3 Lifecycle rule for default audit report destination.
     */
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
  });

  /**
   * AWS Detective configuration
   */
  static readonly detectiveConfig = t.interface({
    /**
     * Indicates whether Amazon Detective is enabled.
     */
    enable: t.boolean,
    /**
     * List of AWS Region names to be excluded from configuring Amazon Detective
     */
    excludeRegions: t.optional(t.array(t.region)),
  });

  /**
   * AWS Security Hub standards configuration
   */
  static readonly securityHubStandardConfig = t.interface({
    /**
     * An enum value that specifies one of three security standards supported by Security Hub
     * Possible values are 'AWS Foundational Security Best Practices v1.0.0',
     * 'CIS AWS Foundations Benchmark v1.2.0',
     * 'CIS AWS Foundations Benchmark v1.4.0',
     * 'NIST Special Publication 800-53 Revision 5',
     * and 'PCI DSS v3.2.1'
     */
    name: t.enums('ExportFrequencyType', [
      'AWS Foundational Security Best Practices v1.0.0',
      'CIS AWS Foundations Benchmark v1.2.0',
      'CIS AWS Foundations Benchmark v1.4.0',
      'NIST Special Publication 800-53 Revision 5',
      'PCI DSS v3.2.1',
    ]),
    /**
     * When defined, security standards will be enabled in the specified deployment targets.
     * If omitted, security standards will be deployed in all govern accounts.
     */
    deploymentTargets: t.optional(t.deploymentTargets),
    /**
     * Indicates whether given AWS Security Hub standard enabled.
     */
    enable: t.boolean,
    /**
     * An array of control names to be enabled for the given security standards
     */
    controlsToDisable: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly securityHubConfig = t.interface({
    enable: t.boolean,
    regionAggregation: t.optional(t.boolean),
    snsTopicName: t.optional(t.string),
    notificationLevel: t.optional(t.string),
    excludeRegions: t.optional(t.array(t.region)),
    standards: t.array(this.securityHubStandardConfig),
  });

  static readonly ebsDefaultVolumeEncryptionConfig = t.interface({
    enable: t.boolean,
    kmsKey: t.optional(t.nonEmptyString),
    excludeRegions: t.optional(t.array(t.region)),
  });
  static readonly documentConfig = t.interface({
    name: t.nonEmptyString,
    template: t.nonEmptyString,
  });

  static readonly documentSetConfig = t.interface({
    shareTargets: t.shareTargets,
    documents: t.array(this.documentConfig),
  });

  static readonly ssmAutomationConfig = t.interface({
    excludeRegions: t.optional(t.array(t.region)),
    documentSets: t.array(this.documentSetConfig),
  });

  /**
   * Central security services configuration
   */
  static readonly centralSecurityServicesConfig = t.interface({
    delegatedAdminAccount: t.nonEmptyString,
    ebsDefaultVolumeEncryption: SecurityConfigTypes.ebsDefaultVolumeEncryptionConfig,
    s3PublicAccessBlock: SecurityConfigTypes.s3PublicAccessBlockConfig,
    scpRevertChangesConfig: t.optional(SecurityConfigTypes.scpRevertChangesConfig),
    macie: SecurityConfigTypes.macieConfig,
    guardduty: SecurityConfigTypes.guardDutyConfig,
    auditManager: t.optional(SecurityConfigTypes.auditManagerConfig),
    detective: t.optional(SecurityConfigTypes.detectiveConfig),
    securityHub: SecurityConfigTypes.securityHubConfig,
    ssmAutomation: this.ssmAutomationConfig,
  });

  /**
   * KMS key management configuration
   */
  static readonly keyManagementServiceConfig = t.interface({
    keySets: t.array(SecurityConfigTypes.keyConfig),
  });

  static readonly accessAnalyzerConfig = t.interface({
    enable: t.boolean,
  });

  static readonly iamPasswordPolicyConfig = t.interface({
    allowUsersToChangePassword: t.boolean,
    hardExpiry: t.boolean,
    requireUppercaseCharacters: t.boolean,
    requireLowercaseCharacters: t.boolean,
    requireSymbols: t.boolean,
    requireNumbers: t.boolean,
    minimumPasswordLength: t.number,
    passwordReusePrevention: t.number,
    maxPasswordAge: t.number,
  });

  static readonly customRuleLambdaType = t.interface({
    sourceFilePath: t.nonEmptyString,
    handler: t.nonEmptyString,
    runtime: t.nonEmptyString,
    rolePolicyFile: t.nonEmptyString,
    timeout: t.optional(t.number),
  });

  static readonly triggeringResourceType = t.interface({
    lookupType: t.enums('ResourceLookupType', ['ResourceId', 'Tag', 'ResourceTypes']),
    lookupKey: t.nonEmptyString,
    lookupValue: t.array(t.nonEmptyString),
  });

  static readonly customRuleConfigType = t.interface({
    lambda: this.customRuleLambdaType,
    periodic: t.optional(t.boolean),
    maximumExecutionFrequency: t.enums('ExecutionFrequency', [
      'One_Hour',
      'Three_Hours',
      'Six_Hours',
      'Twelve_Hours',
      'TwentyFour_Hours',
    ]),
    configurationChanges: t.optional(t.boolean),
    triggeringResources: this.triggeringResourceType,
  });

  /**
   * Config rule remediation input parameter configuration type
   */
  static readonly remediationParametersConfigType = t.interface({
    /**
     * Name of the parameter
     */
    name: t.nonEmptyString,
    /**
     * Parameter value
     */
    value: t.nonEmptyString,
    /**
     * Data type of the parameter, allowed value (StringList or String)
     */
    type: t.enums('ParameterDataType', ['String', 'StringList']),
  });

  static readonly configRuleRemediationType = t.interface({
    /**
     * SSM document execution role policy definition file
     */
    rolePolicyFile: t.nonEmptyString,
    /**
     * The remediation is triggered automatically.
     */
    automatic: t.boolean,
    /**
     * Target ID is the name of the public or shared SSM document.
     */
    targetId: t.nonEmptyString,
    /**
     * Owner account name for the target SSM document, if not provided audit account ID will be used
     */
    targetAccountName: t.optional(t.nonEmptyString),
    /**
     * Version of the target. For example, version of the SSM document.
     */
    targetVersion: t.optional(t.nonEmptyString),
    /**
     * Optional target SSM document lambda function details. This is required when remediation SSM document uses action as aws:invokeLambdaFunction for remediation
     */
    targetDocumentLambda: t.optional(SecurityConfigTypes.customRuleLambdaType),
    /**
     * Maximum time in seconds that AWS Config runs auto-remediation. If you do not select a number, the default is 60 seconds.
     */
    retryAttemptSeconds: t.optional(t.number),
    /**
     * The maximum number of failed attempts for auto-remediation. If you do not select a number, the default is 5.
     */
    maximumAutomaticAttempts: t.optional(t.number),
    /**
     * An object of the RemediationParameterValue.
     */
    // parameters: t.optional(t.dictionary(t.nonEmptyString, t.nonEmptyString)),
    parameters: t.optional(t.array(SecurityConfigTypes.remediationParametersConfigType)),
  });

  static readonly configRule = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    identifier: t.optional(t.nonEmptyString),
    inputParameters: t.optional(t.dictionary(t.nonEmptyString, t.nonEmptyString)),
    complianceResourceTypes: t.optional(t.array(t.nonEmptyString)),
    type: t.optional(t.nonEmptyString),
    customRule: t.optional(this.customRuleConfigType),
    remediation: t.optional(this.configRuleRemediationType),
    tags: t.optional(t.array(t.tag)),
  });

  static readonly awsConfigRuleSet = t.interface({
    deploymentTargets: t.deploymentTargets,
    rules: t.array(this.configRule),
  });

  static readonly awsConfigAggregation = t.interface({
    enable: t.boolean,
    delegatedAdminAccount: t.optional(t.nonEmptyString),
  });

  static readonly awsConfig = t.interface({
    enableConfigurationRecorder: t.boolean,
    // enableDeliveryChannel deprecated
    enableDeliveryChannel: t.optional(t.boolean),
    overrideExisting: t.optional(t.boolean),
    aggregation: t.optional(this.awsConfigAggregation),
    ruleSets: t.array(this.awsConfigRuleSet),
  });

  static readonly metricConfig = t.interface({
    filterName: t.nonEmptyString,
    logGroupName: t.nonEmptyString,
    filterPattern: t.nonEmptyString,
    metricNamespace: t.nonEmptyString,
    metricName: t.nonEmptyString,
    metricValue: t.nonEmptyString,
  });

  static readonly metricSetConfig = t.interface({
    regions: t.optional(t.array(t.nonEmptyString)),
    deploymentTargets: t.deploymentTargets,
    metrics: t.array(this.metricConfig),
  });

  static readonly alarmConfig = t.interface({
    alarmName: t.nonEmptyString,
    alarmDescription: t.nonEmptyString,
    snsAlertLevel: t.optional(t.nonEmptyString), // Deprecated
    snsTopicName: t.optional(t.nonEmptyString),
    metricName: t.nonEmptyString,
    namespace: t.nonEmptyString,
    comparisonOperator: t.nonEmptyString,
    evaluationPeriods: t.number,
    period: t.number,
    statistic: t.nonEmptyString,
    threshold: t.number,
    treatMissingData: t.nonEmptyString,
  });

  static readonly alarmSetConfig = t.interface({
    regions: t.optional(t.array(t.nonEmptyString)),
    deploymentTargets: t.deploymentTargets,
    alarms: t.array(this.alarmConfig),
  });

  static readonly encryptionConfig = t.interface({
    kmsKeyName: t.optional(t.nonEmptyString),
    kmsKeyArn: t.optional(t.nonEmptyString),
    useLzaManagedKey: t.optional(t.boolean),
  });

  static readonly logGroupsConfig = t.interface({
    logGroupName: t.nonEmptyString,
    logRetentionInDays: t.number,
    terminationProtected: t.optional(t.boolean),
    encryption: t.optional(this.encryptionConfig),
    deploymentTargets: t.deploymentTargets,
  });

  static readonly cloudWatchConfig = t.interface({
    metricSets: t.array(this.metricSetConfig),
    alarmSets: t.array(this.alarmSetConfig),
    logGroups: t.optional(t.array(this.logGroupsConfig)),
  });

  static readonly securityConfig = t.interface({
    centralSecurityServices: this.centralSecurityServicesConfig,
    accessAnalyzer: this.accessAnalyzerConfig,
    iamPasswordPolicy: this.iamPasswordPolicyConfig,
    awsConfig: this.awsConfig,
    cloudWatch: this.cloudWatchConfig,
    keyManagementService: t.optional(this.keyManagementServiceConfig),
  });
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link S3PublicAccessBlockConfig}*
 *
 * {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html} | AWS S3 block public access configuration.
 * This will create the Public Access Block configuration for the AWS account.
 *
 * @remarks:
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
export class S3PublicAccessBlockConfig implements t.TypeOf<typeof SecurityConfigTypes.s3PublicAccessBlockConfig> {
  /**
   * Indicates whether AWS S3 block public access is enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring S3 Block Public Access
   */
  readonly excludeAccounts: string[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link ScpRevertChangesConfig}*
 *
 * AWS Service Control Policies Revert Manual Changes configuration
 *
 * @example
 * ```
 * scpRevertChangesConfig:
 *     enable: true
 *     snsTopicName: Security
 * ```
 */
export class ScpRevertChangesConfig implements t.TypeOf<typeof SecurityConfigTypes.scpRevertChangesConfig> {
  /**
   * Indicates whether manual changes to Service Control Policies are automatically reverted.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) The name of the SNS Topic to send alerts to when SCPs are changed manually
   */
  readonly snsTopicName = undefined;
}

/**
 * *{@link SecurityConfig} / {@link KeyManagementServiceConfig} / {@link KeyConfig}*
 *
 * {@link https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#key-mgmt} | AWS KMS Key configuration.
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
export class KeyConfig implements t.TypeOf<typeof SecurityConfigTypes.keyConfig> {
  /**
   * Unique Key name for logical reference
   */
  readonly name = '';
  /**
   * (OPTIONAL) Initial alias to add to the key
   *
   * @remarks
   *
   * Note: If changing this value, a new CMK with the new alias will be created.
   */
  readonly alias = '';
  /**
   * (OPTIONAL)Key policy file path. This file must be available in accelerator config repository.
   */
  readonly policy = '';
  /**
   * (OPTIONAL) A description of the key.
   */
  readonly description = '';
  /**
   * (OPTIONAL) Indicates whether AWS KMS rotates the key.
   * @default true
   */
  readonly enableKeyRotation = true;
  /**
   * (OPTIONAL) Indicates whether the key is available for use.
   * @default - Key is enabled.
   */
  readonly enabled = true;
  /**
   * (OPTIONAL) Whether the encryption key should be retained when it is removed from the Stack.
   * @default retain
   */
  readonly removalPolicy = 'retain';
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
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
 * *{@link SecurityConfig} / {@link KeyManagementServiceConfig}*
 *
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
export class KeyManagementServiceConfig implements t.TypeOf<typeof SecurityConfigTypes.keyManagementServiceConfig> {
  readonly keySets: KeyConfig[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link MacieConfig}*
 *
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
export class MacieConfig implements t.TypeOf<typeof SecurityConfigTypes.macieConfig> {
  /**
   * Indicates whether AWS Macie enabled.
   */
  readonly enable = false;
  /**
   * List of AWS Region names to be excluded from configuring Amazon Macie
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * (OPTIONAL) Specifies how often to publish updates to policy findings for the account. This includes publishing updates to Security Hub and Amazon EventBridge (formerly called Amazon CloudWatch Events).
   * An enum value that specifies how frequently findings are published
   * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
   */
  readonly policyFindingsPublishingFrequency = 'FIFTEEN_MINUTES';
  /**
   * Specifies whether to publish sensitive data findings to Security Hub. If you set this value to true, Amazon Macie automatically publishes all sensitive data findings that weren't suppressed by a findings filter. The default value is false.
   */
  readonly publishSensitiveDataFindings = true;
  /**
   * (OPTIONAL) Declaration of a S3 Lifecycle rule.
   */
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyS3ProtectionConfig}*
 *
 * {@link https://docs.aws.amazon.com/guardduty/latest/ug/s3-protection.html} | AWS GuardDuty S3 Protection configuration.
 * Use this configuration to enable S3 Protection with Amazon GuardDuty to monitor object-level API operations for potential
 * security risks for data within Amazon S3 buckets.
 *
 * @example
 * ```
 * enable: true
 * excludeRegions: []
 * ```
 */
export class GuardDutyS3ProtectionConfig implements t.TypeOf<typeof SecurityConfigTypes.guardDutyS3ProtectionConfig> {
  /**
   * Indicates whether AWS GuardDuty S3 Protection enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty S3 Protection
   */
  readonly excludeRegions: t.Region[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyEksProtectionConfig}*
 *
 * {@link https://docs.aws.amazon.com/guardduty/latest/ug/kubernetes-protection.html} | AWS GuardDuty EKS Protection configuration.
 * Use this configuration to enable EKS Protection with Amazon GuardDuty to provide threat detection coverage to help protect Amazon
 * EKS clusters within an AWS environment. This includes EKS Audit Log Monitoring and EKS Runtime Monitoring.
 *
 * @example
 * ```
 * enable: true
 * excludeRegions: []
 * ```
 */
export class GuardDutyEksProtectionConfig implements t.TypeOf<typeof SecurityConfigTypes.guardDutyEksProtectionConfig> {
  /**
   * Indicates whether AWS GuardDuty EKS Protection enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty EKS Protection
   */
  readonly excludeRegions: t.Region[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig} / {@link GuardDutyExportFindingsConfig}*
 *
 * {@link https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_exportfindings.html} | AWS GuardDuty Export Findings configuration.
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
export class GuardDutyExportFindingsConfig
  implements t.TypeOf<typeof SecurityConfigTypes.guardDutyExportFindingsConfig>
{
  /**
   * Indicates whether AWS GuardDuty Export Findings enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) Indicates whether AWS GuardDuty Export Findings can be overwritten.
   */
  readonly overrideExisting = false;
  /**
   * The type of resource for the publishing destination. Currently only Amazon S3 buckets are supported.
   */
  readonly destinationType = 'S3';
  /**
   * An enum value that specifies how frequently findings are exported, such as to CloudWatch Events.
   * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
   */
  readonly exportFrequency = 'FIFTEEN_MINUTES';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link GuardDutyConfig}*
 *
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
 *   exportConfiguration:
 *     enable: true
 *     overrideExisting: true
 *     destinationType: S3
 *     exportFrequency: FIFTEEN_MINUTES
 *   lifecycleRules: []
 * ```
 */
export class GuardDutyConfig implements t.TypeOf<typeof SecurityConfigTypes.guardDutyConfig> {
  /**
   * Indicates whether AWS GuardDuty enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon GuardDuty
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * AWS GuardDuty S3 Protection configuration.
   * @type object
   */
  readonly s3Protection: GuardDutyS3ProtectionConfig = new GuardDutyS3ProtectionConfig();
  /**
   * (OPTIONAL) AWS GuardDuty EKS Protection configuration.
   * @type object
   */
  readonly eksProtection: GuardDutyEksProtectionConfig | undefined = undefined;
  /**
   * AWS GuardDuty Export Findings configuration.
   * @type object
   */
  readonly exportConfiguration: GuardDutyExportFindingsConfig = new GuardDutyExportFindingsConfig();
  /**
   * (OPTIONAL) Declaration of a S3 Lifecycle rule.
   */
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link AuditManagerConfig} / {@link AuditManagerDefaultReportsDestinationConfig}*
 *
 * AWS Audit Manager Default Reports Destination configuration.
 * Use this configuration to enable a destination for reports generated by AWS Audit Manager.
 *
 * @example
 * ```
 * enable: true
 * destinationType: S3
 * ```
 */
export class AuditManagerDefaultReportsDestinationConfig
  implements t.TypeOf<typeof SecurityConfigTypes.auditManagerDefaultReportsDestinationConfig>
{
  /**
   * Indicates whether AWS Audit Manager Default Reports enabled.
   */
  readonly enable = false;
  /**
   * The type of resource for the publishing destination. Currently only Amazon S3 buckets are supported.
   */
  readonly destinationType = 'S3';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link AuditManagerConfig}*
 *
 * {@link https://docs.aws.amazon.com/audit-manager/latest/userguide/what-is.html } | AWS Audit Manager configuration
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
export class AuditManagerConfig implements t.TypeOf<typeof SecurityConfigTypes.auditManagerConfig> {
  /**
   * Indicates whether AWS Audit Manager enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring AWS Audit Manager.
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * AWS Audit Manager Default Reports configuration.
   * @type object
   */
  readonly defaultReportsConfiguration: AuditManagerDefaultReportsDestinationConfig =
    new AuditManagerDefaultReportsDestinationConfig();
  /**
   * (OPTIONAL) Declaration of a S3 Lifecycle rule.
   */
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link DetectiveConfig}*
 *
 * {@link https://docs.aws.amazon.com/detective/latest/adminguide/what-is-detective.html} | Amazon Detective configuration
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
export class DetectiveConfig implements t.TypeOf<typeof SecurityConfigTypes.detectiveConfig> {
  /**
   * Indicates whether Amazon Detective is enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Amazon Detective
   */
  readonly excludeRegions: t.Region[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig} / {@link SecurityHubStandardConfig}*
 *
 * {@link https://docs.aws.amazon.com/securityhub/latest/userguide/standards-reference.html} | AWS Security Hub standards configuration.
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
 *   controlsToDisable: []
 * ```
 */
export class SecurityHubStandardConfig implements t.TypeOf<typeof SecurityConfigTypes.securityHubStandardConfig> {
  /**
   * An enum value that specifies one of three security standards supported by Security Hub
   * Possible values are 'AWS Foundational Security Best Practices v1.0.0',
   * 'CIS AWS Foundations Benchmark v1.2.0',
   * 'CIS AWS Foundations Benchmark v1.4.0',
   * 'NIST Special Publication 800-53 Revision 5,
   * and 'PCI DSS v3.2.1'
   */
  readonly name = '';
  /**
   * (OPTIONAL) Deployment targets for AWS Security Hub standard.
   */
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  /**
   * Indicates whether given AWS Security Hub standard enabled.
   */
  readonly enable = true;
  /**
   * (OPTIONAL) An array of control names to be enabled for the given security standards
   */
  readonly controlsToDisable: string[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SecurityHubConfig}*
 *
 * {@link https://docs.aws.amazon.com/securityhub/latest/userguide/what-is-securityhub.html} | AWS Security Hub configuration
 * Use this configuration to enable Amazon Security Hub for an AWS Organization along with it's auditing configuration.
 *
 * @example
 * ```
 * securityHub:
 *     enable: true
 *     regionAggregation: true
 *     excludeRegions: []
 *     standards:
 *       - name: AWS Foundational Security Best Practices v1.0.0
 *         deploymentTargets:
 *          organizationalUnits:
 *            -  Root
 *         enable: true
 *         controlsToDisable:
 *           - IAM.1
 *           - EC2.10
 * ```
 */
export class SecurityHubConfig implements t.TypeOf<typeof SecurityConfigTypes.securityHubConfig> {
  /**
   * Indicates whether AWS Security Hub enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) Indicates whether Security Hub results are aggregated in the Home Region.
   */
  readonly regionAggregation = false;
  /**
   * (OPTIONAL) SNS Topic for Security Hub notifications.
   *
   * @remarks
   * Note: Topic must exist in the global config
   */
  readonly snsTopicName = undefined;
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
  readonly notificationLevel = undefined;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring Security Hub
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * Security Hub standards configuration
   */
  readonly standards: SecurityHubStandardConfig[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SnsSubscriptionConfig}*
 *
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
export class SnsSubscriptionConfig implements t.TypeOf<typeof SecurityConfigTypes.snsSubscriptionConfig> {
  /**
   * Notification level high, medium or low
   */
  readonly level: string = '';
  /**
   * Subscribing email address
   */
  readonly email: string = '';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link EbsDefaultVolumeEncryptionConfig}*
 *
 * {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSEncryption.html#encryption-by-default} | AWS EBS default encryption configuration
 * Use this configuration to enable enforced encryption of new EBS volumes and snapshots created in an AWS environment.
 *
 * @example
 * ```
 * ebsDefaultVolumeEncryption:
 *     enable: true
 *     kmsKey: ExampleKey
 *     excludeRegions: []
 * ```
 */
export class EbsDefaultVolumeEncryptionConfig
  implements t.TypeOf<typeof SecurityConfigTypes.ebsDefaultVolumeEncryptionConfig>
{
  /**
   * Indicates whether AWS EBS volume have default encryption enabled.
   */
  readonly enable = false;
  /**
   * (OPTIONAL) KMS key to encrypt EBS volume.
   *
   * @remarks
   * Note: When no value is provided Landing Zone Accelerator will create the KMS key.
   */
  readonly kmsKey: undefined | string = undefined;
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring AWS EBS volume default encryption
   */
  readonly excludeRegions: t.Region[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig} / {@link DocumentSetConfig} / {@link DocumentConfig}*
 *
 * {@link https://docs.aws.amazon.com/systems-manager/latest/userguide/documents.html} | AWS Systems Manager document configuration
 * Use this configuration to define AWS System Manager documents (SSM documents) that can be used on managed instances in an
 * environment.
 *
 * @example
 * ```
 * - name: SSM-ELB-Enable-Logging
 *   template: path/to/document.yaml
 * ```
 */
export class DocumentConfig implements t.TypeOf<typeof SecurityConfigTypes.documentConfig> {
  /**
   * Name of document to be created
   */
  readonly name: string = '';
  /**
   * Document template file path. This file must be available in accelerator config repository.
   */
  readonly template: string = '';
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig} / {@link DocumentSetConfig}*
 *
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
export class DocumentSetConfig implements t.TypeOf<typeof SecurityConfigTypes.documentSetConfig> {
  /**
   * Document share target, valid value should be any organizational unit.
   * Document will be shared with every account within the given OU
   */
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  /**
   * List of the documents to be shared
   */
  readonly documents: DocumentConfig[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig} / {@link SsmAutomationConfig}*
 *
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
export class SsmAutomationConfig implements t.TypeOf<typeof SecurityConfigTypes.ssmAutomationConfig> {
  /**
   * (OPTIONAL) List of AWS Region names to be excluded from configuring block S3 public access
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * List of documents for automation
   */
  readonly documentSets: DocumentSetConfig[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CentralSecurityServicesConfig}*
 *
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
 *         deploymentTargets:
 *          organizationalUnits:
 *            -  Root
 *         enable: true
 *         controlsToDisable: []
 *   ssmAutomation:
 *     documentSets: []
 *```
 */
export class CentralSecurityServicesConfig
  implements t.TypeOf<typeof SecurityConfigTypes.centralSecurityServicesConfig>
{
  /**
   * Designated administrator account name for accelerator security services.
   * AWS organizations designate a member account as a delegated administrator for the
   * organization users and roles from that account can perform administrative actions for security services like
   * Macie, GuardDuty, Detective and Security Hub. Without designated administrator account administrative tasks for
   * security services are performed only by users or roles in the organization's management account.
   * This helps you to separate management of the organization from management of these security services.
   * Accelerator use Audit account as designated administrator account.
   * @type string
   * @default Audit
   *
   * To make Audit account as designated administrator account for every security services configured by accelerator, you need to provide below value for this parameter
   * @example
   * ```
   * delegatedAdminAccount: Audit
   * ```
   */
  readonly delegatedAdminAccount = 'Audit';
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
  readonly ebsDefaultVolumeEncryption: EbsDefaultVolumeEncryptionConfig = new EbsDefaultVolumeEncryptionConfig();
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
  readonly s3PublicAccessBlock: S3PublicAccessBlockConfig = new S3PublicAccessBlockConfig();
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
  readonly scpRevertChangesConfig: ScpRevertChangesConfig = new ScpRevertChangesConfig();
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
  readonly snsSubscriptions: SnsSubscriptionConfig[] = [];
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
  readonly macie: MacieConfig = new MacieConfig();
  /**
   * Amazon GuardDuty Configuration
   */
  readonly guardduty: GuardDutyConfig = new GuardDutyConfig();
  /**
   * (OPTIONAL) Amazon Audit Manager Configuration
   */
  readonly auditManager: AuditManagerConfig | undefined = undefined;
  /**
   * (OPTIONAL) Amazon Detective Configuration
   */
  readonly detective: DetectiveConfig | undefined = undefined;
  /**
   * AWS Security Hub configuration
   *
   * Accelerator use this parameter to define AWS Security Hub configuration.
   *
   * To enable AWS Security Hub for all regions and
   * enable "AWS Foundational Security Best Practices v1.0.0" security standard for IAM.1 & EC2.10 controls
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
   *           - IAM.1
   *           - EC2.10
   * ```
   */
  readonly securityHub: SecurityHubConfig = new SecurityHubConfig();
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
  readonly ssmAutomation: SsmAutomationConfig = new SsmAutomationConfig();
}

/**
 * *{@link SecurityConfig} / {@link AccessAnalyzerConfig}*
 *
 * AWS AccessAnalyzer configuration
 *
 * @example
 * ```
 * accessAnalyzer:
 *   enable: true
 * ```
 */
export class AccessAnalyzerConfig implements t.TypeOf<typeof SecurityConfigTypes.accessAnalyzerConfig> {
  /**
   * Indicates whether AWS AccessAnalyzer enabled in your organization.
   *
   * @remarks
   * Note: Once enabled, IAM Access Analyzer examines policies and reports a list of findings for resources that grant public or cross-account access from outside your AWS Organizations in the IAM console and through APIs.
   */
  readonly enable = false;
}

/**
 * *{@link SecurityConfig} / {@link IamPasswordPolicyConfig}*
 *
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
export class IamPasswordPolicyConfig implements t.TypeOf<typeof SecurityConfigTypes.iamPasswordPolicyConfig> {
  /**
   * Allows all IAM users in your account to use the AWS Management Console to change their own passwords.
   *
   * @default true
   */
  readonly allowUsersToChangePassword = true;
  /**
   * Prevents IAM users who are accessing the account via the AWS Management Console from setting a new console password after their password has expired.
   * The IAM user cannot access the console until an administrator resets the password.
   *
   * @default true
   */
  readonly hardExpiry = false;
  /**
   * Specifies whether IAM user passwords must contain at least one uppercase character from the ISO basic Latin alphabet (A to Z).
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one uppercase character.
   *
   * @default true
   */
  readonly requireUppercaseCharacters = true;
  /**
   * Specifies whether IAM user passwords must contain at least one lowercase character from the ISO basic Latin alphabet (a to z).
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one lowercase character.
   *
   * @default true
   */
  readonly requireLowercaseCharacters = true;
  /**
   * Specifies whether IAM user passwords must contain at least one of the following non-alphanumeric characters:
   *
   * ! @ # $ % ^ & * ( ) _ + - = [ ] { } | '
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one symbol character.
   *
   * @default true
   */
  readonly requireSymbols = true;
  /**
   * Specifies whether IAM user passwords must contain at least one numeric character (0 to 9).
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one numeric character.
   *
   * @default true
   */
  readonly requireNumbers = true;
  /**
   * The minimum number of characters allowed in an IAM user password.
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of 6.
   *
   * @default 14
   */
  readonly minimumPasswordLength = 14;
  /**
   * Specifies the number of previous passwords that IAM users are prevented from reusing.
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of 0.
   * The result is that IAM users are not prevented from reusing previous passwords.
   *
   * @default 24
   */
  readonly passwordReusePrevention = 24;
  /**
   * The number of days that an IAM user password is valid.
   *
   * Note: If you do not specify a value for this parameter, then the operation uses the default value of 0. The result is that IAM user passwords never expire.
   *
   * @default 90
   */
  readonly maxPasswordAge = 90;
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigAggregation}*
 *
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
export class AwsConfigAggregation implements t.TypeOf<typeof SecurityConfigTypes.awsConfigAggregation> {
  readonly enable = true;
  readonly delegatedAdminAccount: string | undefined = undefined;
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet} / {@link ConfigRule}*
 *
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
 *         runtime: nodejs14.x
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
export class ConfigRule implements t.TypeOf<typeof SecurityConfigTypes.configRule> {
  /**
   * A name for the AWS Config rule.
   *
   * @remarks
   * Note: Changing this value of an AWS Config Rule will trigger a new resource creation.
   */
  readonly name = '';
  /**
   * (OPTIONAL) A description about this AWS Config rule.
   *
   */
  readonly description = '';
  /**
   * (OPTIONAL) The identifier of the AWS managed rule.
   */
  readonly identifier = '';
  /**
   * (OPTIONAL) Input parameter values that are passed to the AWS Config rule.
   */
  readonly inputParameters = {};
  /**
   * (OPTIONAL) Defines which resources trigger an evaluation for an AWS Config rule.
   */
  readonly complianceResourceTypes: string[] = [];
  /**
   * (OPTIONAL) Config rule type Managed or Custom. For custom config rule, this parameter value is Custom, when creating managed config rule this parameter value can be undefined or empty string
   */
  readonly type = '';
  /**
   * (OPTIONAL) Tags for the config rule
   */
  readonly tags = [];
  /**
   * (OPTIONAL) A custom config rule is backed by AWS Lambda function. This is required when creating custom config rule.
   */
  readonly customRule = {
    /**
     * The Lambda function to run.
     */
    lambda: {
      /**
       * The source code file path of your Lambda function. This is a zip file containing lambda function, this file must be available in config repository.
       */
      sourceFilePath: '',
      /**
       * The name of the method within your code that Lambda calls to execute your function. The format includes the file name. It can also include namespaces and other qualifiers, depending on the runtime.
       * For more information, see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-features.html#gettingstarted-features-programmingmodel.
       */
      handler: '',
      /**
       * The runtime environment for the Lambda function that you are uploading. For valid values, see the Runtime property in the AWS Lambda Developer Guide.
       */
      runtime: '',
      /**
       * Lambda execution role policy definition file
       */
      rolePolicyFile: '',
      /**
       * Lambda timeout duration in seconds
       */
      timeout: 3,
    },
    /**
     * Whether to run the rule on a fixed frequency.
     *
     * @default true
     */
    periodic: true,
    /**
     * The maximum frequency at which the AWS Config rule runs evaluations.
     *
     * Default:
     * MaximumExecutionFrequency.TWENTY_FOUR_HOURS
     */
    maximumExecutionFrequency: 'TwentyFour_Hours',
    /**
     * Whether to run the rule on configuration changes.
     *
     * Default:
     * false
     */
    configurationChanges: true,
    /**
     * Defines which resources trigger an evaluation for an AWS Config rule.
     */
    triggeringResources: {
      /**
       * An enum to identify triggering resource types.
       * Possible values ResourceId, Tag, or ResourceTypes
       *
       * Triggering resource can be lookup by resource id, tags or resource types.
       */
      lookupType: '',
      /**
       * Resource lookup type, resource can be lookup by tag or types. When resource needs to lookup by tag, this field will have tag name.
       */
      lookupKey: '',
      /**
       * Resource lookup value, when resource lookup using tag, this field will have tag value to search resource.
       */
      lookupValue: [],
    },
  };
  /**
   * A remediation for the config rule, auto remediation to automatically remediate noncompliant resources.
   */
  readonly remediation = {
    /**
     * Remediation assume role policy definition json file. This file must be present in config repository.
     *
     * Create your own custom remediation actions using AWS Systems Manager Automation documents.
     * When a role needed to be created to perform custom remediation actions, role permission needs to be defined in this file.
     */
    rolePolicyFile: '',
    /**
     * The remediation is triggered automatically.
     */
    automatic: true,
    /**
     * Target ID is the name of the public document.
     *
     * The name of the AWS SSM document to perform custom remediation actions.
     */
    targetId: '',
    /**
     * Name of the account owning the public document to perform custom remediation actions.
     * Accelerator creates these documents in Audit account and shared with other accounts.
     */
    targetAccountName: '',
    /**
     * Version of the target. For example, version of the SSM document.
     *
     * If you make backward incompatible changes to the SSM document, you must call PutRemediationConfiguration API again to ensure the remediations can run.
     */
    targetVersion: '',
    /**
     * Target SSM document remediation lambda function
     */
    targetDocumentLambda: {
      /**
       * The source code file path of your Lambda function. This is a zip file containing lambda function, this file must be available in config repository.
       */
      sourceFilePath: '',
      /**
       * The name of the method within your code that Lambda calls to execute your function. The format includes the file name. It can also include namespaces and other qualifiers, depending on the runtime.
       * For more information, see https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-features.html#gettingstarted-features-programmingmodel.
       */
      handler: '',
      /**
       * The runtime environment for the Lambda function that you are uploading. For valid values, see the Runtime property in the AWS Lambda Developer Guide.
       */
      runtime: '',
      /**
       * Lambda execution role policy definition file
       */
      rolePolicyFile: '',
      /**
       * Lambda function execution timeout in seconds
       */
      timeout: 3,
    },
    /**
     * Maximum time in seconds that AWS Config runs auto-remediation. If you do not select a number, the default is 60 seconds.
     *
     * For example, if you specify RetryAttemptSeconds as 50 seconds and MaximumAutomaticAttempts as 5, AWS Config will run auto-remediations 5 times within 50 seconds before throwing an exception.
     */
    retryAttemptSeconds: 0,
    /**
     * The maximum number of failed attempts for auto-remediation. If you do not select a number, the default is 5.
     *
     * For example, if you specify MaximumAutomaticAttempts as 5 with RetryAttemptSeconds as 50 seconds, AWS Config will put a RemediationException on your behalf for the failing resource after the 5th failed attempt within 50 seconds.
     */
    maximumAutomaticAttempts: 0,
    /**
     * List of remediation parameters
     *
     */
    parameters: [],
  };
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig} / {@link AwsConfigRuleSet}*
 *
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
export class AwsConfigRuleSet implements t.TypeOf<typeof SecurityConfigTypes.awsConfigRuleSet> {
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
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
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
   *               runtime: nodejs14.x
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
  readonly rules: ConfigRule[] = [];
}

/**
 * *{@link SecurityConfig} / {@link AwsConfig}*
 *
 * AWS Config Recorder and Rules
 *
 * @example
 * ```
 * awsConfig:
 *   enableConfigurationRecorder: false
 *   ** enableDeliveryChannel DEPRECATED
 *   enableDeliveryChannel: true
 *   overrideExisting: false
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
export class AwsConfig implements t.TypeOf<typeof SecurityConfigTypes.awsConfig> {
  /**
   * Indicates whether AWS Config recorder enabled.
   *
   * To enable AWS Config, you must create a configuration recorder
   *
   * ConfigurationRecorder resource describes the AWS resource types for which AWS Config records configuration changes. The configuration recorder stores the configurations of the supported resources in your account as configuration items.
   */
  readonly enableConfigurationRecorder = false;
  /**
   * Indicates whether delivery channel enabled.
   *
   * AWS Config uses the delivery channel to deliver the configuration changes to your Amazon S3 bucket.
   * DEPRECATED
   */
  readonly enableDeliveryChannel: boolean | undefined;
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
  readonly overrideExisting: boolean | undefined;
  /**
   * Config Recorder Aggregation configuration
   */
  readonly aggregation: AwsConfigAggregation | undefined;
  /**
   * AWS Config rule sets
   */
  readonly ruleSets: AwsConfigRuleSet[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link MetricSetConfig} / {@link MetricConfig}*
 *
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
export class MetricConfig implements t.TypeOf<typeof SecurityConfigTypes.metricConfig> {
  /**
   * Metric filter name
   */
  readonly filterName: string = '';
  /**
   * The log group to create the filter on.
   */
  readonly logGroupName: string = '';
  /**
   * Pattern to search for log events.
   */
  readonly filterPattern: string = '';
  /**
   * The namespace of the metric to emit.
   */
  readonly metricNamespace: string = '';
  /**
   * The name of the metric to emit.
   */
  readonly metricName: string = '';
  /**
   * The value to emit for the metric.
   *
   * Can either be a literal number (typically “1”), or the name of a field in the structure to take the value from the matched event. If you are using a field value, the field value must have been matched using the pattern.
   *
   * @remarks
   * Note: If you want to specify a field from a matched JSON structure, use '$.fieldName', and make sure the field is in the pattern (if only as '$.fieldName = *').
   * If you want to specify a field from a matched space-delimited structure, use '$fieldName'.
   */
  readonly metricValue: string = '';
  /**
   * Sets how this alarm is to handle missing data points.
   */
  readonly treatMissingData: string | undefined = undefined;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link MetricSetConfig}*
 *
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
export class MetricSetConfig implements t.TypeOf<typeof SecurityConfigTypes.metricSetConfig> {
  /**
   * (OPTIONAL) AWS region names to configure CloudWatch Metrics
   */
  readonly regions: string[] | undefined = undefined;
  /**
   * Deployment targets for CloudWatch Metrics configuration
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
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
  readonly metrics: MetricConfig[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link AlarmSetConfig} / {@link AlarmConfig}*
 *
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
export class AlarmConfig implements t.TypeOf<typeof SecurityConfigTypes.alarmConfig> {
  /**
   * Name of the alarm
   */
  readonly alarmName: string = '';
  /**
   * Description for the alarm
   */
  readonly alarmDescription: string = '';
  /**
   * Alert SNS notification level
   * Deprecated
   */
  readonly snsAlertLevel: string = '';
  /**
   * (OPTIONAL) SNS Topic Name
   * SNS Topic Name from global config
   */
  readonly snsTopicName: string = '';
  /**
   * Name of the metric.
   */
  readonly metricName: string = '';
  /**
   * Namespace of the metric.
   */
  readonly namespace: string = '';
  /**
   * Comparison to use to check if metric is breaching
   */
  readonly comparisonOperator: string = '';
  /**
   * The number of periods over which data is compared to the specified threshold.
   */
  readonly evaluationPeriods: number = 1;
  /**
   * The period over which the specified statistic is applied.
   */
  readonly period: number = 300;
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
  readonly statistic: string = '';
  /**
   * The value against which the specified statistic is compared.
   */
  readonly threshold: number = 1;
  /**
   * Sets how this alarm is to handle missing data points.
   */
  readonly treatMissingData: string = '';
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link AlarmSetConfig}}*
 *
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
export class AlarmSetConfig implements t.TypeOf<typeof SecurityConfigTypes.alarmSetConfig> {
  /**
   * AWS region names to configure CloudWatch Alarms
   */
  readonly regions: string[] | undefined = undefined;
  /**
   * Deployment targets for CloudWatch Alarms configuration
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
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
  readonly alarms: AlarmConfig[] = [];
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link LogGroupsConfig} / {@link EncryptionConfig}*
 *
 * {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html | CloudWatch log group encryption} configuration.
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
export class EncryptionConfig implements t.TypeOf<typeof SecurityConfigTypes.encryptionConfig> {
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
  readonly kmsKeyName: string | undefined = undefined;

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
  readonly kmsKeyArn: string | undefined = undefined;

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
  readonly useLzaManagedKey: boolean | undefined = undefined;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig} / {@link LogGroupsConfig}*
 *
 * {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html | CloudWatch log group} configuration.
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
export class LogGroupsConfig implements t.TypeOf<typeof SecurityConfigTypes.logGroupsConfig> {
  /**
   * Deployment targets for CloudWatch Logs
   *
   * @see {@link DeploymentTargets}
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();

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
  readonly encryption: EncryptionConfig | undefined = undefined;
  /**
   * Name of the CloudWatch log group
   *
   * @remarks
   * If importing an existing log group, this must be the name of the
   * group as it exists in your account.
   */
  readonly logGroupName: string = '';

  /**
   * (OPTIONAL) How long, in days, the log contents will be retained.
   *
   * To retain all logs, set this value to undefined.
   *
   * @default undefined
   */
  readonly logRetentionInDays = 3653;

  /**
   * (OPTIONAL) Set this property to `false` if you would like the log group
   * to be deleted if it is removed from the solution configuration file.
   *
   * @default true
   */
  readonly terminationProtected: boolean | undefined = undefined;
}

/**
 * *{@link SecurityConfig} / {@link CloudWatchConfig}*
 *
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
export class CloudWatchConfig implements t.TypeOf<typeof SecurityConfigTypes.cloudWatchConfig> {
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
  readonly metricSets: MetricSetConfig[] = [];
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
  readonly alarmSets: AlarmSetConfig[] = [];

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
  readonly logGroups: LogGroupsConfig[] | undefined = undefined;
}

/**
 * Accelerator security configuration
 */
export class SecurityConfig implements t.TypeOf<typeof SecurityConfigTypes.securityConfig> {
  /**
   * Security configuration file name, this file must be present in accelerator config repository
   */
  static readonly FILENAME = 'security-config.yaml';

  /**
   * Central security configuration
   */
  readonly centralSecurityServices: CentralSecurityServicesConfig = new CentralSecurityServicesConfig();
  readonly accessAnalyzer: AccessAnalyzerConfig = new AccessAnalyzerConfig();
  readonly iamPasswordPolicy: IamPasswordPolicyConfig = new IamPasswordPolicyConfig();
  readonly awsConfig: AwsConfig = new AwsConfig();
  readonly cloudWatch: CloudWatchConfig = new CloudWatchConfig();
  readonly keyManagementService: KeyManagementServiceConfig = new KeyManagementServiceConfig();

  /**
   *
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(values?: t.TypeOf<typeof SecurityConfigTypes.securityConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Return delegated-admin-account name
   */
  public getDelegatedAccountName(): string {
    return this.centralSecurityServices.delegatedAdminAccount;
  }

  /**
   *
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string): SecurityConfig {
    const buffer = fs.readFileSync(path.join(dir, SecurityConfig.FILENAME), 'utf8');
    const values = t.parse(SecurityConfigTypes.securityConfig, yaml.load(buffer));
    return new SecurityConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): SecurityConfig | undefined {
    try {
      const values = t.parse(SecurityConfigTypes.securityConfig, yaml.load(content));
      return new SecurityConfig(values);
    } catch (e) {
      logger.error('Error parsing input, global config undefined');
      logger.error(`${e}`);
      throw new Error('could not load configuration');
    }
  }
}
