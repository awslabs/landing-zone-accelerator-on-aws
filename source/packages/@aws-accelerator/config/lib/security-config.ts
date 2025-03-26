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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils/lib/logger';

import * as t from './common';
import * as i from './models/security-config';
import { ReplacementsConfig } from './replacements-config';

const logger = createLogger(['security-config']);

export class S3PublicAccessBlockConfig implements i.IS3PublicAccessBlockConfig {
  readonly enable = false;
  readonly excludeAccounts: string[] = [];
}

export class ScpRevertChangesConfig implements i.IScpRevertChangesConfig {
  readonly enable = false;
  readonly snsTopicName = undefined;
}

export class KeyConfig implements i.IKeyConfig {
  readonly name = '';
  readonly alias = '';
  readonly policy = '';
  readonly description = '';
  readonly enableKeyRotation = true;
  readonly enabled = true;
  readonly removalPolicy = 'retain';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class KeyManagementServiceConfig implements i.IKeyManagementServiceConfig {
  readonly keySets: KeyConfig[] = [];
}

export class ResourcePolicyConfig implements i.IResourcePolicyConfig {
  readonly resourceType: keyof typeof i.ResourceTypeEnum = 'S3_BUCKET';
  readonly document: string = '';
}

export class ResourcePolicyRemediation implements i.IResourcePolicyRemediation {
  readonly automatic = true;
  readonly retryAttemptSeconds = 0;
  readonly maximumAutomaticAttempts = 0;
}

export class ResourcePolicySetConfig implements i.IResourcePolicySetConfig {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly resourcePolicies: ResourcePolicyConfig[] = [];
  readonly inputParameters: { [key: string]: string } | undefined = {};
}

export class NetworkPerimeterConfig implements i.INetworkPerimeterConfig {
  readonly managedVpcOnly = true;
}

export class ResourcePolicyEnforcementConfig implements i.IResourcePolicyEnforcementConfig {
  static readonly DEFAULT_RULE_NAME = 'Resource-Policy-Compliance-Check';
  static readonly DEFAULT_SSM_DOCUMENT_NAME = `Attach-Resource-Based-Policy`;

  readonly enable = false;
  readonly remediation: ResourcePolicyRemediation = new ResourcePolicyRemediation();
  readonly policySets: ResourcePolicySetConfig[] = [];
  readonly networkPerimeter: NetworkPerimeterConfig | undefined = undefined;
}

export class MacieConfig implements i.IMacieConfig {
  readonly enable = false;
  readonly excludeRegions: t.Region[] = [];
  readonly policyFindingsPublishingFrequency = 'FIFTEEN_MINUTES';
  readonly publishSensitiveDataFindings = false;
  readonly publishPolicyFindings: boolean | undefined = undefined;
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

export class GuardDutyS3ProtectionConfig implements i.IGuardDutyS3ProtectionConfig {
  readonly enable: boolean = false;
  readonly excludeRegions: t.Region[] = [];
}

export class GuardDutyEksProtectionConfig implements i.IGuardDutyEksProtectionConfig {
  readonly enable: boolean = false;
  readonly manageAgent?: boolean | undefined = false;
  readonly excludeRegions: t.Region[] = [];
}

export class GuardDutyEc2ProtectionConfig implements i.IGuardDutyEc2ProtectionConfig {
  readonly enable: boolean = false;
  readonly keepSnapshots: boolean = false;
  readonly excludeRegions: t.Region[] = [];
}

export class GuardDutyRdsProtectionConfig implements i.IGuardDutyRdsProtectionConfig {
  readonly enable: boolean = false;
  readonly excludeRegions: t.Region[] = [];
}

export class GuardDutyLambdaProtectionConfig implements i.IGuardDutyLambdaProtectionConfig {
  readonly enable: boolean = false;
  readonly excludeRegions: t.Region[] = [];
}

export class GuardDutyExportFindingsConfig implements i.IGuardDutyExportFindingsConfig {
  readonly enable = false;
  readonly overrideExisting = false;
  readonly destinationType = 'S3';
  readonly exportFrequency = 'FIFTEEN_MINUTES';
  readonly overrideGuardDutyPrefix: t.PrefixConfig | undefined = undefined;
}

export class GuardDutyConfig implements i.IGuardDutyConfig {
  readonly enable: boolean = false;
  readonly excludeRegions: t.Region[] = [];
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  readonly autoEnableOrgMembers: boolean | undefined = undefined;
  readonly s3Protection: GuardDutyS3ProtectionConfig = new GuardDutyS3ProtectionConfig();
  readonly eksProtection: GuardDutyEksProtectionConfig | undefined = undefined;
  readonly ec2Protection: GuardDutyEc2ProtectionConfig | undefined = undefined;
  readonly rdsProtection: GuardDutyRdsProtectionConfig | undefined = undefined;
  readonly lambdaProtection: GuardDutyLambdaProtectionConfig | undefined = undefined;
  readonly exportConfiguration: GuardDutyExportFindingsConfig = new GuardDutyExportFindingsConfig();
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

export class AuditManagerDefaultReportsDestinationConfig implements i.IAuditManagerDefaultReportsDestinationConfig {
  readonly enable = false;
  readonly destinationType = 'S3';
}

export class AuditManagerConfig implements i.IAuditManagerConfig {
  readonly enable = false;
  readonly excludeRegions: t.Region[] = [];
  readonly defaultReportsConfiguration: AuditManagerDefaultReportsDestinationConfig =
    new AuditManagerDefaultReportsDestinationConfig();
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

export class DetectiveConfig implements i.IDetectiveConfig {
  readonly enable = false;
  readonly excludeRegions: t.Region[] = [];
}

export class SecurityHubStandardConfig implements i.ISecurityHubStandardConfig {
  readonly name = '';
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  readonly enable = true;
  readonly controlsToDisable: string[] = [];
}

export class SecurityHubLoggingCloudwatchConfig implements i.ISecurityHubLoggingCloudwatchConfig {
  readonly enable = true;
  readonly logGroupName? = undefined;
  readonly logLevel? = undefined;
}

export class SecurityHubLoggingConfig implements i.ISecurityHubLoggingConfig {
  readonly cloudWatch: SecurityHubLoggingCloudwatchConfig | undefined = undefined;
}

export class SecurityHubConfig implements i.ISecurityHubConfig {
  readonly enable = false;
  readonly regionAggregation = false;
  readonly snsTopicName = undefined;
  readonly notificationLevel = undefined;
  readonly excludeRegions: t.Region[] = [];
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  readonly autoEnableOrgMembers: boolean | undefined = undefined;
  readonly standards: SecurityHubStandardConfig[] = [];
  readonly logging: SecurityHubLoggingConfig | undefined = undefined;
}

export class SnsSubscriptionConfig implements i.ISnsSubscriptionConfig {
  readonly level: string = '';
  readonly email: string = '';
}

export class EbsDefaultVolumeEncryptionConfig implements i.IEbsDefaultVolumeEncryptionConfig {
  readonly enable = false;
  readonly kmsKey: undefined | string = undefined;
  readonly deploymentTargets?: t.DeploymentTargets | undefined;
  readonly excludeRegions: t.Region[] = [];
}

export class DocumentConfig implements i.IDocumentConfig {
  readonly name: string = '';
  readonly template: string = '';
  readonly targetType: string | undefined = undefined;
}

export class DocumentSetConfig implements i.IDocumentSetConfig {
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  readonly documents: DocumentConfig[] = [];
}

export class SsmAutomationConfig implements i.ISsmAutomationConfig {
  readonly excludeRegions: t.Region[] = [];
  readonly documentSets: DocumentSetConfig[] = [];
}

export class CentralSecurityServicesConfig implements i.ICentralSecurityServicesConfig {
  readonly delegatedAdminAccount = 'Audit';
  readonly ebsDefaultVolumeEncryption: EbsDefaultVolumeEncryptionConfig = new EbsDefaultVolumeEncryptionConfig();
  readonly s3PublicAccessBlock: S3PublicAccessBlockConfig = new S3PublicAccessBlockConfig();
  readonly scpRevertChangesConfig: ScpRevertChangesConfig = new ScpRevertChangesConfig();
  readonly snsSubscriptions: SnsSubscriptionConfig[] = [];
  readonly macie: MacieConfig = new MacieConfig();
  readonly guardduty: GuardDutyConfig = new GuardDutyConfig();
  readonly auditManager: AuditManagerConfig | undefined = undefined;
  readonly detective: DetectiveConfig | undefined = undefined;
  readonly securityHub: SecurityHubConfig = new SecurityHubConfig();
  readonly ssmAutomation: SsmAutomationConfig = new SsmAutomationConfig();
}

export class AccessAnalyzerConfig implements i.IAccessAnalyzerConfig {
  readonly enable = false;
}

export class IamPasswordPolicyConfig implements i.IIamPasswordPolicyConfig {
  readonly allowUsersToChangePassword = true;
  readonly hardExpiry = false;
  readonly requireUppercaseCharacters = true;
  readonly requireLowercaseCharacters = true;
  readonly requireSymbols = true;
  readonly requireNumbers = true;
  readonly minimumPasswordLength = 14;
  readonly passwordReusePrevention = 24;
  readonly maxPasswordAge = 90;
}

export class AwsConfigAggregation implements i.IAwsConfigAggregation {
  readonly enable = true;
  readonly delegatedAdminAccount: string | undefined = undefined;
}

export class ConfigRuleRemediation implements i.IConfigRuleRemediationType {
  readonly rolePolicyFile = '';
  readonly automatic = true;
  readonly targetId = '';
  readonly targetAccountName = '';
  readonly targetVersion = '';
  readonly targetDocumentLambda = {
    sourceFilePath: '',
    handler: '',
    runtime: '',
    rolePolicyFile: '',
    timeout: 3,
  };
  readonly retryAttemptSeconds = 0;
  readonly maximumAutomaticAttempts = 0;
  readonly parameters = [];
  readonly excludeRegions: t.Region[] = [];
}

export class ConfigRule implements i.IConfigRule {
  readonly name = '';
  readonly description = '';
  readonly identifier = '';
  readonly inputParameters = {};
  readonly complianceResourceTypes: string[] = [];
  readonly type = '';
  readonly tags = [];
  readonly customRule = {
    lambda: {
      sourceFilePath: '',
      handler: '',
      runtime: '',
      rolePolicyFile: '',
      timeout: 3,
    },
    periodic: true,
    maximumExecutionFrequency: 'TwentyFour_Hours',
    configurationChanges: true,
    triggeringResources: {
      lookupType: '',
      lookupKey: '',
      lookupValue: [],
    },
  };
  readonly remediation: ConfigRuleRemediation = new ConfigRuleRemediation();
}

export class AwsConfigRuleSet implements i.IAwsConfigRuleSet {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly rules: ConfigRule[] = [];
}

export class AwsConfig implements i.IAwsConfig {
  readonly enableConfigurationRecorder = false;
  readonly deploymentTargets: t.DeploymentTargets | undefined;
  readonly enableDeliveryChannel: boolean | undefined;
  readonly overrideExisting: boolean | undefined;
  readonly aggregation: AwsConfigAggregation | undefined;
  readonly ruleSets: AwsConfigRuleSet[] = [];
  readonly useServiceLinkedRole: boolean | undefined;
}

export class MetricConfig implements i.IMetricConfig {
  readonly filterName: string = '';
  readonly logGroupName: string = '';
  readonly filterPattern: string = '';
  readonly metricNamespace: string = '';
  readonly metricName: string = '';
  readonly metricValue: string = '';
  readonly treatMissingData: string | undefined = undefined;
}

export class MetricSetConfig implements i.IMetricSetConfig {
  readonly regions: t.Region[] | undefined = undefined;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly metrics: MetricConfig[] = [];
}

export class AlarmConfig implements i.IAlarmConfig {
  readonly alarmName: string = '';
  readonly alarmDescription: string = '';
  readonly snsAlertLevel: string = '';
  readonly snsTopicName: string = '';
  readonly metricName: string = '';
  readonly namespace: string = '';
  readonly comparisonOperator: string = '';
  readonly evaluationPeriods: number = 1;
  readonly period: number = 300;
  readonly statistic: string = '';
  readonly threshold: number = 1;
  readonly treatMissingData: string = '';
}

export class AlarmSetConfig implements i.IAlarmSetConfig {
  readonly regions: t.Region[] | undefined = undefined;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly alarms: AlarmConfig[] = [];
}

export class EncryptionConfig implements i.IEncryptionConfig {
  readonly kmsKeyName: string | undefined = undefined;
  readonly kmsKeyArn: string | undefined = undefined;
  readonly useLzaManagedKey: boolean | undefined = undefined;
}

export class LogGroupsConfig implements i.ILogGroupsConfig {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly encryption: EncryptionConfig | undefined = undefined;
  readonly logGroupName: string = '';
  readonly logRetentionInDays = 3653;
  readonly terminationProtected: boolean | undefined = undefined;
}

export class CloudWatchConfig implements i.ICloudWatchConfig {
  readonly metricSets: MetricSetConfig[] = [];
  readonly alarmSets: AlarmSetConfig[] = [];
  readonly logGroups: LogGroupsConfig[] | undefined = undefined;
}

export class SecurityConfig implements i.ISecurityConfig {
  /**
   * Security configuration file name, this file must be present in accelerator config repository
   */
  static readonly FILENAME = 'security-config.yaml';

  readonly centralSecurityServices: CentralSecurityServicesConfig = new CentralSecurityServicesConfig();
  readonly accessAnalyzer: AccessAnalyzerConfig = new AccessAnalyzerConfig();
  readonly iamPasswordPolicy: IamPasswordPolicyConfig = new IamPasswordPolicyConfig();
  readonly awsConfig: AwsConfig = new AwsConfig();
  readonly cloudWatch: CloudWatchConfig = new CloudWatchConfig();
  readonly keyManagementService: KeyManagementServiceConfig = new KeyManagementServiceConfig();
  readonly resourcePolicyEnforcement: ResourcePolicyEnforcementConfig | undefined;

  /**
   *
   * @param values
   */
  constructor(values?: i.ISecurityConfig) {
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
   * @param replacementsConfig
   * @returns
   */

  static load(dir: string, replacementsConfig?: ReplacementsConfig): SecurityConfig {
    const initialBuffer = fs.readFileSync(path.join(dir, SecurityConfig.FILENAME), 'utf8');
    const buffer = replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
    const values = t.parseSecurityConfig(yaml.load(buffer));
    return new SecurityConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): SecurityConfig | undefined {
    try {
      const values = t.parseSecurityConfig(yaml.load(content));
      return new SecurityConfig(values);
    } catch (e) {
      logger.error('Error parsing input, security config undefined');
      logger.error(`${e}`);
      throw new Error('could not load configuration');
    }
  }
}

/**
 * Function to validate remediation rule name in security-config
 * @param documentName
 * @returns boolean
 */
export function IsPublicSsmDoc(documentName: string) {
  // any document starting with AWS- prefix is amazon owned document
  // Ref: https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_CreateDocument.html#API_CreateDocument_RequestSyntax
  // You can't use the following strings as document name prefixes. These are reserved by AWS for use as document name prefixes:
  // - aws
  // - amazon
  // - amzn
  const reservedPrefix = [/^AWS-/i, /^AMZN-/i, /^AMAZON-/i, /^AWSEC2-/i, /^AWSConfigRemediation-/i, /^AWSSupport-/i];
  return reservedPrefix.some(obj => obj.test(documentName));
}
