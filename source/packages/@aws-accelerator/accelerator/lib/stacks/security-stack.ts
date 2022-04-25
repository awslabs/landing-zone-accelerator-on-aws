/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as config from 'aws-cdk-lib/aws-config';
import * as iam from 'aws-cdk-lib/aws-iam';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import path from 'path';

import { Region } from '@aws-accelerator/config';
import {
  EbsDefaultEncryption,
  GuardDutyPublishingDestination,
  KeyLookup,
  MacieExportConfigClassification,
  PasswordPolicy,
  SecurityHubStandards,
  // SsmParameterLookup,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';

enum ACCEL_LOOKUP_TYPE {
  KMS = 'KMS',
  Bucket = 'Bucket',
  EC2_DEFAULT_PROFILE = 'Ec2DefaultProfile',
  CUSTOMER_MANAGED_POLICY = 'CustomerManagedPolicy',
}

interface RemediationParameters {
  [key: string]: {
    StaticValue?: {
      Values: string[];
    };
    ResourceValue?: {
      Value: 'RESOURCE_ID';
    };
  };
}

/**
 * Security Stack, configures local account security services
 */
export class SecurityStack extends AcceleratorStack {
  readonly acceleratorKey: cdk.aws_kms.Key;
  readonly auditAccountId: string;
  readonly logArchiveAccountId: string;
  readonly ec2InstanceDefaultProfileName: string | undefined;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const auditAccountName = props.securityConfig.getDelegatedAccountName();
    this.auditAccountId = props.accountsConfig.getAuditAccountId();
    this.logArchiveAccountId = props.accountsConfig.getLogArchiveAccountId();
    this.ec2InstanceDefaultProfileName = props.iamConfig.ec2InstanceDefaultProfile
      ? props.iamConfig.ec2InstanceDefaultProfile.name
      : undefined;

    this.acceleratorKey = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    //
    // MacieSession configuration
    //
    if (
      props.securityConfig.centralSecurityServices.macie.enable &&
      props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        const bucketName = `aws-accelerator-org-macie-disc-repo-${this.auditAccountId}-${cdk.Aws.REGION}`;

        new MacieExportConfigClassification(this, 'AwsMacieUpdateExportConfigClassification', {
          bucketName: bucketName,
          kmsKey: this.acceleratorKey,
          keyPrefix: `${cdk.Stack.of(this).account}-aws-macie-export-config`,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`Macie audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //
    // GuardDuty configuration
    //
    if (
      props.securityConfig.centralSecurityServices.guardduty.enable &&
      props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        const bucketArn = `arn:${cdk.Stack.of(this).partition}:s3:::aws-accelerator-org-gduty-pub-dest-${
          this.auditAccountId
        }-${cdk.Stack.of(this).region}`;

        new GuardDutyPublishingDestination(this, 'GuardDutyPublishingDestination', {
          exportDestinationType:
            props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.destinationType,
          bucketArn: bucketArn,
          kmsKey: this.acceleratorKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`Guardduty audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //
    // SecurityHub configuration
    //
    if (
      props.securityConfig.centralSecurityServices.securityHub.enable &&
      props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      if (props.accountsConfig.containsAccount(auditAccountName)) {
        new SecurityHubStandards(this, 'SecurityHubStandards', {
          standards: props.securityConfig.centralSecurityServices.securityHub.standards,
          kmsKey: this.acceleratorKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      } else {
        throw new Error(`SecurityHub audit delegated admin account name "${auditAccountName}" not found.`);
      }
    }

    //
    // Ebs Default Volume Encryption configuration
    //
    if (
      props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable &&
      props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      const ebsEncryptionKey = new cdk.aws_kms.Key(this, 'EbsEncryptionKey', {
        enableKeyRotation: true,
        description: 'EBS Volume Encryption',
      });
      ebsEncryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Allow service-linked role use',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
          principals: [
            new cdk.aws_iam.ArnPrincipal(
              `arn:${cdk.Stack.of(this).partition}:iam::${
                cdk.Stack.of(this).account
              }:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
            ),
          ],
          resources: ['*'],
        }),
      );
      ebsEncryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Allow Autoscaling to create grant',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['kms:CreateGrant'],
          principals: [
            new cdk.aws_iam.ArnPrincipal(
              `arn:${cdk.Stack.of(this).partition}:iam::${
                cdk.Stack.of(this).account
              }:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
            ),
          ],
          resources: ['*'],
          conditions: { Bool: { 'kms:GrantIsForAWSResource': 'true' } },
        }),
      );
      new EbsDefaultEncryption(this, 'EbsDefaultVolumeEncryption', {
        ebsEncryptionKmsKey: ebsEncryptionKey,
        logGroupKmsKey: this.acceleratorKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });

      new cdk.aws_ssm.StringParameter(this, 'EbsDefaultVolumeEncryptionParameter', {
        parameterName: `/accelerator/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
        stringValue: ebsEncryptionKey.keyArn,
      });
    }

    // AWS Config - Set up recorder and delivery channel, only if Control Tower
    // is not being used. Else the Control Tower SCP will block these calls from
    // member accounts
    //
    // If Control Tower is enabled, make sure to set up AWS Config in the
    // management account since this is not enabled by default by Control Tower.
    //
    // An AWS Control Tower preventive guardrail is enforced with AWS
    // Organizations using Service Control Policies (SCPs) that disallows
    // configuration changes to AWS Config.
    //
    let configRecorder: config.CfnConfigurationRecorder | undefined = undefined;
    if (
      !props.globalConfig.controlTower.enable ||
      props.accountsConfig.getManagementAccountId() === cdk.Stack.of(this).account
    ) {
      if (props.securityConfig.awsConfig.enableConfigurationRecorder) {
        const configRecorderRole = new iam.Role(this, 'ConfigRecorderRole', {
          assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
          managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRole')],
        });

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/ConfigRecorderRole/Resource`, [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'ConfigRecorderRole needs managed policy service-role/AWSConfigRole to administer config rules',
          },
        ]);

        /**
         * As per the documentation, the config role should have
         * the s3:PutObject permission to avoid access denied issues
         * while AWS config tries to check the s3 bucket (in another account) write permissions
         * https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-policy.html
         *
         */
        configRecorderRole.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: ['*'],
          }),
        );

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/ConfigRecorderRole/DefaultPolicy/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason: 'ConfigRecorderRole DefaultPolicy is built by cdk.',
            },
          ],
        );

        configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
          roleArn: configRecorderRole.roleArn,
          recordingGroup: {
            allSupported: true,
            includeGlobalResourceTypes: true,
          },
        });
      }

      if (props.securityConfig.awsConfig.enableDeliveryChannel) {
        new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
          s3BucketName: `aws-accelerator-central-logs-${this.logArchiveAccountId}-${props.globalConfig.homeRegion}`,
          configSnapshotDeliveryProperties: {
            deliveryFrequency: 'One_Hour',
          },
        });
      }
    }

    //
    // Config Rules
    //
    Logger.info('[security-stack] Evaluating AWS Config rule sets');

    for (const ruleSet of props.securityConfig.awsConfig.ruleSets) {
      if (!this.isIncluded(ruleSet.deploymentTargets)) {
        Logger.info('[security-stack] Item excluded');
        continue;
      }

      Logger.info(
        `[security-stack] Account (${cdk.Stack.of(this).account}) should be included, deploying AWS Config Rules`,
      );

      for (const rule of ruleSet.rules) {
        let configRule: config.ManagedRule | config.CustomRule | undefined;

        if (rule.type && rule.type === 'Custom') {
          Logger.info(`[security-stack] Creating custom rule ${rule.name}`);
          let ruleScope: config.RuleScope | undefined;

          if (rule.customRule.triggeringResources.lookupType == 'ResourceTypes') {
            for (const item of rule.customRule.triggeringResources.lookupValue) {
              ruleScope = config.RuleScope.fromResources([config.ResourceType.of(item)]);
            }
          }

          if (rule.customRule.triggeringResources.lookupType == 'ResourceId') {
            ruleScope = config.RuleScope.fromResource(
              config.ResourceType.of(rule.customRule.triggeringResources.lookupKey),
              rule.customRule.triggeringResources.lookupValue[0],
            );
          }

          if (rule.customRule.triggeringResources.lookupType == 'Tag') {
            ruleScope = config.RuleScope.fromTag(
              rule.customRule.triggeringResources.lookupKey,
              rule.customRule.triggeringResources.lookupValue[0],
            );
          }

          /**
           * Lambda function for config custom role
           * Single lambda function can not be used for multiple config custom role, there is a pending issue with CDK team on this
           * https://github.com/aws/aws-cdk/issues/17582
           */
          const lambdaFunction = new cdk.aws_lambda.Function(this, pascalCase(rule.name) + '-Function', {
            runtime: new cdk.aws_lambda.Runtime(rule.customRule.lambda.runtime),
            handler: rule.customRule.lambda.handler,
            code: cdk.aws_lambda.Code.fromAsset(path.join(props.configDirPath, rule.customRule.lambda.sourceFilePath)),
            description: `AWS Config custom rule function used for "${rule.name}" rule`,
          });

          // Configure lambda log file with encryption and log retention
          new cdk.aws_logs.LogGroup(this, pascalCase(rule.name) + '-LogGroup', {
            logGroupName: `/aws/lambda/${lambdaFunction.functionName}`,
            retention: props.globalConfig.cloudwatchLogRetentionInDays,
            encryptionKey: this.acceleratorKey,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });

          // Grant read only access to lambda rule to evaluate config rule
          lambdaFunction.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'));

          // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
          // rule suppression with evidence for this permission.
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/${pascalCase(rule.name)}-Function/ServiceRole/Resource`,
            [
              {
                id: 'AwsSolutions-IAM4',
                reason: 'AWS Config custom rule needs managed readonly access policy',
              },
            ],
          );

          configRule = new config.CustomRule(this, pascalCase(rule.name), {
            configRuleName: rule.name,
            lambdaFunction: lambdaFunction,
            periodic: rule.customRule.periodic,
            inputParameters: this.getRuleParameters(rule.name, rule.inputParameters),
            description: rule.description,
            maximumExecutionFrequency:
              rule.customRule.maximumExecutionFrequency === undefined
                ? undefined
                : (rule.customRule.maximumExecutionFrequency as cdk.aws_config.MaximumExecutionFrequency),
            ruleScope: ruleScope,
            configurationChanges: rule.customRule.configurationChanges,
          });
          configRule.node.addDependency(lambdaFunction);
        } else {
          Logger.info(`[security-stack] Creating managed rule ${rule.name}`);

          const resourceTypes: config.ResourceType[] = [];
          for (const resourceType of rule.complianceResourceTypes ?? []) {
            resourceTypes.push(config.ResourceType.of(resourceType));
          }

          configRule = new config.ManagedRule(this, pascalCase(rule.name), {
            configRuleName: rule.name,
            description: rule.description,
            identifier: rule.identifier ?? rule.name,
            inputParameters: this.getRuleParameters(rule.name, rule.inputParameters),
            ruleScope: {
              resourceTypes,
            },
          });
        }

        if (configRule) {
          // Create remediation for config rule
          if (rule.remediation) {
            const role = this.createRemediationRole(
              rule.name,
              path.join(props.configDirPath, rule.remediation.rolePolicyFile),
              `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
                rule.remediation.targetAccountName
                  ? props.accountsConfig.getAccountId(rule.remediation.targetAccountName)
                  : props.accountsConfig.getAuditAccountId()
              }:document/${rule.remediation.targetId}`,
            );

            new config.CfnRemediationConfiguration(this, pascalCase(rule.name) + '-Remediation', {
              configRuleName: rule.name,
              targetId: `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
                rule.remediation.targetAccountName
                  ? props.accountsConfig.getAccountId(rule.remediation.targetAccountName)
                  : props.accountsConfig.getAuditAccountId()
              }:document/${rule.remediation.targetId}`,
              targetVersion: rule.remediation.targetVersion,
              targetType: 'SSM_DOCUMENT',

              automatic: rule.remediation.automatic,
              maximumAutomaticAttempts: rule.remediation.maximumAutomaticAttempts,
              retryAttemptSeconds: rule.remediation.retryAttemptSeconds,
              parameters: this.getRemediationParameters(rule.name, rule.remediation.parameters, [role.roleArn]),
            }).node.addDependency(configRule);
          } else {
            Logger.info(`[security-stack] No remediation provided for custom config rule ${rule.name}`);
          }

          if (configRecorder) {
            configRule.node.addDependency(configRecorder);
          }
        }
      }
    }

    //
    // Update IAM Password Policy
    //
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      Logger.info(`[security-stack] Setting the IAM Password policy`);
      new PasswordPolicy(this, 'IamPasswordPolicy', {
        ...props.securityConfig.iamPasswordPolicy,
        kmsKey: this.acceleratorKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }

    //
    // CloudWatch Metrics
    //
    for (const metricSetItem of props.securityConfig.cloudWatch.metricSets ?? []) {
      if (!metricSetItem.regions?.includes(cdk.Stack.of(this).region)) {
        Logger.info(`[security-stack] Current region not explicity specified for metric item, skip`);
        continue;
      }

      if (!this.isIncluded(metricSetItem.deploymentTargets)) {
        Logger.info(`[security-stack] Item excluded`);
        continue;
      }

      for (const metricItem of metricSetItem.metrics ?? []) {
        Logger.info(`[security-stack] Creating CloudWatch metric filter ${metricItem.filterName}`);

        new cdk.aws_logs.MetricFilter(this, pascalCase(metricItem.filterName), {
          logGroup: cdk.aws_logs.LogGroup.fromLogGroupName(
            this,
            `${pascalCase(metricItem.filterName)}_${pascalCase(metricItem.logGroupName)}`,
            metricItem.logGroupName,
          ),
          metricNamespace: metricItem.metricNamespace,
          metricName: metricItem.metricName,
          filterPattern: cdk.aws_logs.FilterPattern.literal(metricItem.filterPattern),
          metricValue: metricItem.metricValue,
        });
      }
    }

    //
    // CloudWatch Alarms
    //
    for (const alarmSetItem of props.securityConfig.cloudWatch.alarmSets ?? []) {
      if (!alarmSetItem.regions?.includes(cdk.Stack.of(this).region)) {
        Logger.info(`[security-stack] Current region not explicity specified for alarm item, skip`);
        continue;
      }

      if (!this.isIncluded(alarmSetItem.deploymentTargets)) {
        Logger.info(`[security-stack] Item excluded`);
        continue;
      }

      for (const alarmItem of alarmSetItem.alarms ?? []) {
        Logger.info(`[security-stack] Creating CloudWatch alarm ${alarmItem.alarmName}`);

        const alarm = new cdk.aws_cloudwatch.Alarm(this, pascalCase(alarmItem.alarmName), {
          alarmName: alarmItem.alarmName,
          alarmDescription: alarmItem.alarmDescription,
          metric: new cdk.aws_cloudwatch.Metric({
            metricName: alarmItem.metricName,
            namespace: alarmItem.namespace,
            period: cdk.Duration.seconds(alarmItem.period),
            statistic: alarmItem.statistic,
          }),
          comparisonOperator: this.getComparisonOperator(alarmItem.comparisonOperator),
          evaluationPeriods: alarmItem.evaluationPeriods,
          threshold: alarmItem.threshold,
          treatMissingData: this.getTreatMissingData(alarmItem.treatMissingData),
        });

        alarm.addAlarmAction(
          new cdk.aws_cloudwatch_actions.SnsAction(
            cdk.aws_sns.Topic.fromTopicArn(
              this,
              `${pascalCase(alarmItem.alarmName)}Topic`,
              cdk.Stack.of(this).formatArn({
                service: 'sns',
                region: cdk.Stack.of(this).region,
                account: props.accountsConfig.getAuditAccountId(),
                resource: `aws-accelerator-${alarmItem.snsAlertLevel}Notifications`,
                arnFormat: cdk.ArnFormat.NO_RESOURCE_NAME,
              }),
            ),
          ),
        );
      }
    }
    Logger.info('[security-stack] Completed stack synthesis');
  }

  private getComparisonOperator(comparisonOperator: string): cdk.aws_cloudwatch.ComparisonOperator {
    if (comparisonOperator === 'GreaterThanOrEqualToThreshold') {
      return cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;
    }
    if (comparisonOperator === 'GreaterThanThreshold') {
      return cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD;
    }
    if (comparisonOperator === 'LessThanThreshold') {
      return cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD;
    }
    if (comparisonOperator === 'LessThanOrEqualToThreshold') {
      return cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD;
    }
    if (comparisonOperator === 'LessThanLowerOrGreaterThanUpperThreshold') {
      return cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_LOWER_OR_GREATER_THAN_UPPER_THRESHOLD;
    }
    if (comparisonOperator === 'GreaterThanUpperThreshold') {
      return cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_UPPER_THRESHOLD;
    }
    if (comparisonOperator === 'LessThanLowerThreshold') {
      return cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_LOWER_THRESHOLD;
    }
    return cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;
  }

  private getTreatMissingData(treatMissingData: string): cdk.aws_cloudwatch.TreatMissingData {
    if (treatMissingData === 'breaching') {
      return cdk.aws_cloudwatch.TreatMissingData.BREACHING;
    }
    if (treatMissingData === 'notBreaching') {
      return cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING;
    }
    if (treatMissingData === 'ignore') {
      return cdk.aws_cloudwatch.TreatMissingData.IGNORE;
    }
    if (treatMissingData === 'missing') {
      return cdk.aws_cloudwatch.TreatMissingData.MISSING;
    }
    return cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING;
  }

  /**
   * Function to prepare config rule parameters
   * @param ruleName
   * @param params
   * @private
   */
  private getRuleParameters(ruleName: string, params?: { [key: string]: string }): { [key: string]: string } {
    if (params) {
      const returnParams: { [key: string]: string } = {};
      for (const [key, value] of Object.entries(params)) {
        const replacementValues: string[] = [];
        for (const item of value.split(',')) {
          const parameterReplacementNeeded = (item as string).match('\\${ACCEL_LOOKUP::([a-zA-Z0-9-/:]*)}');
          if (parameterReplacementNeeded) {
            const replacementValue = this.getReplacementValue(ruleName, parameterReplacementNeeded, 'Rule-Parameter');
            replacementValues.push(replacementValue?.split(',')[0] ?? '');
          }
        }

        if (replacementValues.length > 0) {
          returnParams[key] = replacementValues.join(',');
        } else {
          returnParams[key] = value;
        }
      }
      return returnParams;
    } else {
      return {};
    }
  }

  /**
   * Function to get remediation parameters
   * @param ruleName
   * @param params
   * @param assumeRoleArn
   * @private
   */
  private getRemediationParameters(
    ruleName: string,
    params?: { [key: string]: string | string[] },
    assumeRoleArn?: string[],
  ): RemediationParameters | undefined {
    if (!params) {
      return undefined;
    }
    const returnParams: RemediationParameters = {};
    if (assumeRoleArn) {
      returnParams['AutomationAssumeRole'] = {
        StaticValue: {
          Values: assumeRoleArn,
        },
      };
    }

    for (const [key, value] of Object.entries(params)) {
      const replacementValues: string[] = [];
      for (const item of (value as string).split(',')) {
        const parameterReplacementNeeded = (item as string).match('\\${ACCEL_LOOKUP::([a-zA-Z0-9-/:]*)}');
        if (parameterReplacementNeeded) {
          const replacementValue = this.getReplacementValue(
            ruleName,
            parameterReplacementNeeded,
            'Remediation-Parameter',
          );
          replacementValues.push(replacementValue ?? '');
        }
      }
      if (replacementValues.length > 0) {
        returnParams[key] = {
          StaticValue: {
            Values: replacementValues,
          },
        };
      } else {
        if (value === 'RESOURCE_ID') {
          returnParams[key] = {
            ResourceValue: {
              Value: 'RESOURCE_ID',
            },
          };
        } else {
          returnParams[key] = {
            StaticValue: {
              // Values: [value as string],
              Values: (value as string).split(','),
            },
          };
        }
      }
    }
    return returnParams;
  }

  /**
   * Function to get Config rule remediation parameter replacement value
   * @param ruleName
   * @param replacement
   * @param replacementType
   * @private
   */
  private getReplacementValue(
    ruleName: string,
    replacement: RegExpMatchArray,
    replacementType: string,
  ): string | undefined {
    const replacementArray = replacement[1].split(':');
    const lookupType = replacementArray[0];

    if (lookupType === ACCEL_LOOKUP_TYPE.EC2_DEFAULT_PROFILE) {
      if (this.ec2InstanceDefaultProfileName) {
        return this.ec2InstanceDefaultProfileName;
      } else {
        throw new Error(`EC2 instance default profile not found, can not configure remediation for ${ruleName} rule`);
      }
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.CUSTOMER_MANAGED_POLICY) {
      if (replacementArray.length === 2) {
        return cdk.aws_iam.ManagedPolicy.fromManagedPolicyName(
          this,
          `${pascalCase(ruleName)} + ${pascalCase(replacementArray[1])}-${pascalCase(replacementType)}`,
          replacementArray[1],
        ).managedPolicyArn;
      }

      return this.acceleratorKey.keyArn;
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.KMS) {
      return this.acceleratorKey.keyArn;
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.Bucket) {
      if (replacementArray.length === 2) {
        if (replacementArray[1].toLowerCase() === 'elbLogs'.toLowerCase()) {
          return `aws-accelerator-elb-access-logs-${this.logArchiveAccountId}-${cdk.Stack.of(this).region}`;
        } else {
          return cdk.aws_s3.Bucket.fromBucketName(
            this,
            `${pascalCase(ruleName)}-${pascalCase(replacementType)}-InputBucket`,
            replacementArray[1].toLowerCase(),
          ).bucketName;
        }
      }

      throw new Error(`Config rule replacement key ${replacement.input} not found`);
    }
    return undefined;
  }

  /**
   * Function to create remediation role
   * @param ruleName
   * @param policyFilePath
   * @param resources
   * @private
   */
  private createRemediationRole(ruleName: string, policyFilePath: string, resources?: string): iam.Role {
    // Read in the policy document which should be properly formatted json
    const policyDocument = require(policyFilePath);
    // Create a statements list using the PolicyStatement factory
    const policyStatements: cdk.aws_iam.PolicyStatement[] = [];
    for (const statement of policyDocument.Statement) {
      policyStatements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
    }
    const role = new iam.Role(this, pascalCase(ruleName) + '-RemediationRole', {
      assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
    });

    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'ssm:GetAutomationExecution',
          'ssm:StartAutomationExecution',
          'ssm:GetParameters',
          'ssm:GetParameter',
          'ssm:PutParameter',
        ],
        resources: [resources ?? '*'],
      }),
    );

    policyStatements.forEach(policyStatement => {
      role.addToPolicy(policyStatement);
    });

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    // rule suppression with evidence for this permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/${pascalCase(ruleName)}-RemediationRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'AWS Config rule remediation role, created by the permission provided in config repository',
        },
      ],
    );
    return role;
  }
}
