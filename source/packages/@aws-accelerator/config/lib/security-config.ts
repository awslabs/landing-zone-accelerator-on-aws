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
 * AWS Accelerator SecurityConfig Types
 */
export class SecurityConfigTypes {
  /**
   * SNS notification subscription configuration.
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
    lifecycleRules: t.optional(t.array(t.lifecycleRule)),
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
   * AWS GuardDuty Export Findings configuration.
   */
  static readonly guardDutyExportFindingsConfig = t.interface({
    /**
     * Indicates whether AWS GuardDuty Export Findings enabled.
     */
    enable: t.boolean,
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
     * AWS GuardDuty Export Findings configuration.
     */
    s3Protection: this.guardDutyS3ProtectionConfig,
    /**
     * AWS GuardDuty Export Findings configuration.
     */
    exportConfiguration: this.guardDutyExportFindingsConfig,
    /**
     * Declaration of a (S3 Bucket) Life cycle rule.
     */
    lifecycleRules: t.optional(t.array(t.lifecycleRule)),
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
     * Declaration of a (S3 Bucket) Life cycle rule for default audit report destination.
     */
    lifecycleRules: t.optional(t.array(t.lifecycleRule)),
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
   * AWS SecurityHub standards configuration
   */
  static readonly securityHubStandardConfig = t.interface({
    /**
     * An enum value that specifies one of three security standards supported by SecurityHub
     * Possible values are 'AWS Foundational Security Best Practices v1.0.0', 'CIS AWS Foundations Benchmark v1.2.0' and 'PCI DSS v3.2.1'
     */
    name: t.enums('ExportFrequencyType', [
      'AWS Foundational Security Best Practices v1.0.0',
      'CIS AWS Foundations Benchmark v1.2.0',
      'PCI DSS v3.2.1',
    ]),
    /**
     * Indicates whether given AWS SecurityHub standard enabled.
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
    excludeRegions: t.optional(t.array(t.region)),
    standards: t.array(this.securityHubStandardConfig),
  });

  static readonly ebsDefaultVolumeEncryptionConfig = t.interface({
    enable: t.boolean,
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
    macie: SecurityConfigTypes.macieConfig,
    guardduty: SecurityConfigTypes.guardDutyConfig,
    auditManager: t.optional(SecurityConfigTypes.auditManagerConfig),
    detective: t.optional(SecurityConfigTypes.detectiveConfig),
    securityHub: SecurityConfigTypes.securityHubConfig,
    ssmAutomation: this.ssmAutomationConfig,
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

  static readonly awsConfig = t.interface({
    enableConfigurationRecorder: t.boolean,
    enableDeliveryChannel: t.boolean,
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
    snsAlertLevel: t.nonEmptyString,
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

  static readonly cloudWatchConfig = t.interface({
    metricSets: t.array(this.metricSetConfig),
    alarmSets: t.array(this.alarmSetConfig),
  });

  static readonly securityConfig = t.interface({
    centralSecurityServices: this.centralSecurityServicesConfig,
    accessAnalyzer: this.accessAnalyzerConfig,
    iamPasswordPolicy: this.iamPasswordPolicyConfig,
    awsConfig: this.awsConfig,
    cloudWatch: this.cloudWatchConfig,
  });
}

/**
 * AWS S3 block public access configuration
 */
export class S3PublicAccessBlockConfig implements t.TypeOf<typeof SecurityConfigTypes.s3PublicAccessBlockConfig> {
  /**
   * Indicates whether AWS S3 block public access enabled.
   */
  readonly enable = false;
  /**
   * List of AWS Region names to be excluded from configuring block S3 public access
   */
  readonly excludeAccounts: string[] = [];
}

/**
 * Amazon Macie Configuration
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
   * Specifies how often to publish updates to policy findings for the account. This includes publishing updates to Security Hub and Amazon EventBridge (formerly called Amazon CloudWatch Events).
   * An enum value that specifies how frequently findings are published
   * Possible values FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS
   */
  readonly policyFindingsPublishingFrequency = 'FIFTEEN_MINUTES';
  /**
   * Specifies whether to publish sensitive data findings to Security Hub. If you set this value to true, Amazon Macie automatically publishes all sensitive data findings that weren't suppressed by a findings filter. The default value is false.
   */
  readonly publishSensitiveDataFindings = true;
  /**
   * Declaration of a (S3 Bucket) Life cycle rule.
   */
  readonly lifecycleRules: t.LifecycleRule[] | undefined = undefined;
}

/**
 * AWS GuardDuty S3 Protection configuration.
 */
export class GuardDutyS3ProtectionConfig implements t.TypeOf<typeof SecurityConfigTypes.guardDutyS3ProtectionConfig> {
  /**
   * Indicates whether AWS GuardDuty S3 Protection enabled.
   */
  readonly enable = false;
  /**
   * List of AWS Region names to be excluded from configuring Amazon GuardDuty S3 Protection
   */
  readonly excludeRegions: t.Region[] = [];
}

/**
 * AWS GuardDuty Export Findings configuration.
 */
export class GuardDutyExportFindingsConfig
  implements t.TypeOf<typeof SecurityConfigTypes.guardDutyExportFindingsConfig>
{
  /**
   * Indicates whether AWS GuardDuty Export Findings enabled.
   */
  readonly enable = false;
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
 * AWS GuardDuty configuration
 */
export class GuardDutyConfig implements t.TypeOf<typeof SecurityConfigTypes.guardDutyConfig> {
  /**
   * Indicates whether AWS GuardDuty enabled.
   */
  readonly enable = false;
  /**
   * List of AWS Region names to be excluded from configuring Amazon GuardDuty
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * AWS GuardDuty S3 Protection configuration.
   * @type object
   */
  readonly s3Protection: GuardDutyS3ProtectionConfig = new GuardDutyS3ProtectionConfig();
  /**
   * AWS GuardDuty Export Findings configuration.
   * @type object
   */
  readonly exportConfiguration: GuardDutyExportFindingsConfig = new GuardDutyExportFindingsConfig();
  /**
   * Declaration of a (S3 Bucket) Life cycle rule.
   */
  readonly lifecycleRules: t.LifecycleRule[] | undefined = undefined;
}

/**
 * AWS Audit Manager Default Reports Destination configuration.
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
 * AWS Audit Manager configuration
 */
export class AuditManagerConfig implements t.TypeOf<typeof SecurityConfigTypes.auditManagerConfig> {
  /**
   * Indicates whether AWS Audit Manager enabled.
   */
  readonly enable = false;
  /**
   * List of AWS Region names to be excluded from configuring AWS Audit Manager
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * AWS Audit Manager Default Reports configuration.
   * @type object
   */
  readonly defaultReportsConfiguration: AuditManagerDefaultReportsDestinationConfig =
    new AuditManagerDefaultReportsDestinationConfig();
  /**
   * Declaration of a (S3 Bucket) Life cycle rule.
   */
  readonly lifecycleRules: t.LifecycleRule[] | undefined = undefined;
}

/**
 * Amazon Detective configuration
 */
export class DetectiveConfig implements t.TypeOf<typeof SecurityConfigTypes.detectiveConfig> {
  /**
   * Indicates whether Amazon Detective is enabled.
   */
  readonly enable = false;
  /**
   * List of AWS Region names to be excluded from configuring Amazon Detective
   */
  readonly excludeRegions: t.Region[] = [];
}

/**
 * AWS SecurityHub standards configuration
 */
export class SecurityHubStandardConfig implements t.TypeOf<typeof SecurityConfigTypes.securityHubStandardConfig> {
  /**
   * An enum value that specifies one of three security standards supported by SecurityHub
   * Possible values are 'AWS Foundational Security Best Practices v1.0.0', 'CIS AWS Foundations Benchmark v1.2.0' and 'PCI DSS v3.2.1'
   */
  readonly name = '';
  /**
   * Indicates whether given AWS SecurityHub standard enabled.
   */
  readonly enable = true;
  /**
   * An array of control names to be enabled for the given security standards
   */
  readonly controlsToDisable: string[] = [];
}

/**
 * AWS SecurityHub configuration
 */
export class SecurityHubConfig implements t.TypeOf<typeof SecurityConfigTypes.securityHubConfig> {
  /**
   * Indicates whether AWS SecurityHub enabled.
   */
  readonly enable = false;
  /**
   * Indicates whether SecurityHub results are aggregated in the Home Region
   */
  readonly regionAggregation = false;
  /**
   * List of AWS Region names to be excluded from configuring SecurityHub
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * SecurityHub standards configuration
   */
  readonly standards: SecurityHubStandardConfig[] = [];
}

/**
 * AWS SNS Notification subscription configuration
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
 * AWS EBS default encryption configuration
 */
export class EbsDefaultVolumeEncryptionConfig
  implements t.TypeOf<typeof SecurityConfigTypes.ebsDefaultVolumeEncryptionConfig>
{
  /**
   * Indicates whether AWS EBS volume have default encryption enabled.
   */
  readonly enable = false;
  /**
   * List of AWS Region names to be excluded from configuring AWS EBS volume default encryption
   */
  readonly excludeRegions: t.Region[] = [];
}

/**
 * AWS Systems Manager document configuration
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
 * AWS Systems Manager document sharing configuration
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
 * AWS Systems Manager automation configuration
 */
export class SsmAutomationConfig implements t.TypeOf<typeof SecurityConfigTypes.ssmAutomationConfig> {
  /**
   * List of AWS Region names to be excluded from configuring block S3 public access
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * List of documents for automation
   */
  readonly documentSets: DocumentSetConfig[] = [];
}

/**
 * AWS Accelerator central security services configuration
 */
export class CentralSecurityServicesConfig
  implements t.TypeOf<typeof SecurityConfigTypes.centralSecurityServicesConfig>
{
  /**
   * Designated administrator account name for accelerator security services.
   * AWS organizations designate a member account as a delegated administrator for the
   * organization users and roles from that account can perform administrative actions for security services like
   * Macie, GuardDuty, Detective and SecurityHub. Without designated administrator account administrative tasks for
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
   * AWS SNS subscription configuration
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
   * Amazon Audit Manager Configuration
   */
  readonly auditManager: AuditManagerConfig | undefined = undefined;
  /**
   * Amazon Detective Configuration
   */
  readonly detective: DetectiveConfig | undefined = undefined;
  /**
   * AWS SecurityHub configuration
   *
   * Accelerator use this parameter to define AWS SecurityHub configuration.
   *
   * To enable AWS SecurityHub for all regions and
   * enable "AWS Foundational Security Best Practices v1.0.0" security standard for IAM.1 & EC2.10 controls
   * you need provide below value for this parameter.
   *
   * @example
   * ```
   * securityHub:
   *     enable: true
   *     regionAggregation: true
   *     excludeRegions: []
   *     standards:
   *       - name: AWS Foundational Security Best Practices v1.0.0
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
 * AWS AccessAnalyzer configuration
 */
export class AccessAnalyzerConfig implements t.TypeOf<typeof SecurityConfigTypes.accessAnalyzerConfig> {
  /**
   * Indicates whether AWS AccessAnalyzer enabled in your organization.
   *
   * Once enabled, IAM Access Analyzer analyzes policies and reports a list of findings for resources that grant public or cross-account access from outside your AWS Organizations in the IAM console and through APIs.
   */
  readonly enable = false;
}

/**
 * IAM password policy configuration
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
   * If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one uppercase character.
   *
   * @default true
   */
  readonly requireUppercaseCharacters = true;
  /**
   * Specifies whether IAM user passwords must contain at least one lowercase character from the ISO basic Latin alphabet (a to z).
   *
   * If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one lowercase character.
   *
   * @default true
   */
  readonly requireLowercaseCharacters = true;
  /**
   * Specifies whether IAM user passwords must contain at least one of the following non-alphanumeric characters:
   *
   * ! @ # $ % ^ & * ( ) _ + - = [ ] { } | '
   *
   * If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one symbol character.
   *
   * @default true
   */
  readonly requireSymbols = true;
  /**
   * Specifies whether IAM user passwords must contain at least one numeric character (0 to 9).
   *
   * If you do not specify a value for this parameter, then the operation uses the default value of false. The result is that passwords do not require at least one numeric character.
   *
   * @default true
   */
  readonly requireNumbers = true;
  /**
   * The minimum number of characters allowed in an IAM user password.
   *
   * If you do not specify a value for this parameter, then the operation uses the default value of 6.
   *
   * @default 14
   */
  readonly minimumPasswordLength = 14;
  /**
   * Specifies the number of previous passwords that IAM users are prevented from reusing.
   *
   * If you do not specify a value for this parameter, then the operation uses the default value of 0.
   * The result is that IAM users are not prevented from reusing previous passwords.
   *
   * @default 24
   */
  readonly passwordReusePrevention = 24;
  /**
   * The number of days that an IAM user password is valid.
   *
   * If you do not specify a value for this parameter, then the operation uses the default value of 0. The result is that IAM user passwords never expire.
   *
   * @default 90
   */
  readonly maxPasswordAge = 90;
}

/**
 * AWS ConfigRule configuration
 */
export class ConfigRule implements t.TypeOf<typeof SecurityConfigTypes.configRule> {
  /**
   * A name for the AWS Config rule.
   */
  readonly name = '';
  /**
   * A description about this AWS Config rule.
   */
  readonly description = '';
  /**
   * The identifier of the AWS managed rule.
   */
  readonly identifier = '';
  /**
   * Input parameter values that are passed to the AWS Config rule.
   */
  readonly inputParameters = {};
  /**
   * Defines which resources trigger an evaluation for an AWS Config rule.
   */
  readonly complianceResourceTypes: string[] = [];
  /**
   * Config rule type Managed or Custom. For custom config rule, this parameter value is Custom, when creating managed config rule this parameter value can be undefined or empty string
   */
  readonly type = '';
  /**
   * Tags for the config rule
   */
  readonly tags = [];
  /**
   * A custom config rule is backed by AWS Lambda function. This is required when creating custom config rule.
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
 * List of AWS Config rules
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
   * AWS Config ruleset
   *
   * Following example will create a custom rule named accelerator-attatch-ec2-instance-profile with remediation
   * and a managed rule named accelerator-iam-user-group-membership-check without remediation
   *
   * @example
   * ```
   * rules:
   *         - name: accelerator-attatch-ec2-instance-profile
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
 * AWS Config rule
 */
export class AwsConfig implements t.TypeOf<typeof SecurityConfigTypes.awsConfig> {
  /**
   * Indicates whether AWS Config recorder enabled.
   *
   * To enable AWS Config, you must create a configuration recorder and a delivery channel.
   *
   * ConfigurationRecorder resource describes the AWS resource types for which AWS Config records configuration changes. The configuration recorder stores the configurations of the supported resources in your account as configuration items.
   */
  readonly enableConfigurationRecorder = true;
  /**
   * Indicates whether delivery channel enabled.
   *
   * AWS Config uses the delivery channel to deliver the configuration changes to your Amazon S3 bucket or Amazon SNS topic.
   */
  readonly enableDeliveryChannel = true;
  /**
   * AWS Config rule sets
   */
  readonly ruleSets: AwsConfigRuleSet[] = [];
}

/**
 * AWS CloudWatch Metric configuration
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
   * If you want to specify a field from a matched JSON structure, use '$.fieldName', and make sure the field is in the pattern (if only as '$.fieldName = *').
   *
   * If you want to specify a field from a matched space-delimited structure, use '$fieldName'.
   */
  readonly metricValue: string = '';
  /**
   * Sets how this alarm is to handle missing data points.
   */
  readonly treatMissingData: string | undefined = undefined;
}

/**
 * AWS CloudWatch Metric set configuration
 */
export class MetricSetConfig implements t.TypeOf<typeof SecurityConfigTypes.metricSetConfig> {
  /**
   * AWS region names to configure CloudWatch Metrics
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
 * AWS CloudWatch Alarm configuration
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
   */
  readonly snsAlertLevel: string = '';
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
 * AWS CloudWatch Alarm sets
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
   *           snsAlertLevel: Low
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
 * AWS CloudWatch configuration
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
   *           snsAlertLevel: Low
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

  constructor(values?: t.TypeOf<typeof SecurityConfigTypes.securityConfig>, configDir?: string) {
    //
    // Validation errors
    //
    const errors: string[] = [];

    if (values) {
      //
      // SSM Document validations

      const ssmDocuments: { name: string; template: string }[] = [];
      for (const documentSet of values.centralSecurityServices.ssmAutomation.documentSets) {
        for (const document of documentSet.documents ?? []) {
          ssmDocuments.push(document);
        }
      }

      // Validate presence of SSM document files
      if (configDir) {
        for (const ssmDocument of ssmDocuments) {
          if (!fs.existsSync(path.join(configDir, ssmDocument.template))) {
            errors.push(`SSM document ${ssmDocument.name} template file ${ssmDocument.template} not found !!!`);
          }
        }

        for (const ruleSet of values.awsConfig.ruleSets ?? []) {
          for (const rule of ruleSet.rules) {
            if (rule.type === 'Custom' && rule.customRule) {
              // Validate presence of custom rule lambda function zip file
              if (!fs.existsSync(path.join(configDir, rule.customRule.lambda.sourceFilePath))) {
                errors.push(
                  `Custom rule: ${rule.name} lambda function file ${rule.customRule.lambda.sourceFilePath} not found`,
                );
              }
              // Validate presence of custom rule lambda function role policy file
              if (!fs.existsSync(path.join(configDir, rule.customRule.lambda.rolePolicyFile))) {
                errors.push(
                  `Custom rule: ${rule.name} lambda function role policy file ${rule.customRule.lambda.rolePolicyFile} not found`,
                );
              }
            }
            if (rule.remediation) {
              // Validate presence of rule remediation assume role definition file
              if (!fs.existsSync(path.join(configDir, rule.remediation.rolePolicyFile))) {
                errors.push(
                  `Rule: ${rule.name}, remediation assume role definition file ${rule.remediation.rolePolicyFile} not found`,
                );
              }
              // Validate presence of SSM document before used as remediation target
              if (!ssmDocuments.find(item => item.name === rule.remediation?.targetId)) {
                errors.push(
                  `Rule: ${rule.name}, remediation target SSM document ${rule.remediation?.targetId} not found in ssm automation document lists`,
                );
                // Validate presence of custom rule's remediation SSMS document invoke lambda function zip file
                if (rule.remediation.targetDocumentLambda) {
                  if (!fs.existsSync(path.join(configDir, rule.remediation.targetDocumentLambda.sourceFilePath))) {
                    errors.push(
                      `Rule: ${rule.name}, remediation target SSM document lambda function file ${rule.remediation.targetDocumentLambda.sourceFilePath} not found`,
                    );
                  }
                }
              }
            }
          }
        }
      }

      if (errors.length) {
        throw new Error(`${SecurityConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
      }

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
   * @returns
   */
  static load(dir: string): SecurityConfig {
    const buffer = fs.readFileSync(path.join(dir, SecurityConfig.FILENAME), 'utf8');
    const values = t.parse(SecurityConfigTypes.securityConfig, yaml.load(buffer));
    return new SecurityConfig(values, dir);
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
      console.log('[security-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}
