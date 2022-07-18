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

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import * as config from 'aws-cdk-lib/aws-config';
import * as iam from 'aws-cdk-lib/aws-iam';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import path from 'path';
import { Tag as ConfigRuleTag } from '@aws-sdk/client-config-service';
import { AwsConfigRuleSet, ConfigRule, Tag } from '@aws-accelerator/config';

import { KeyLookup, Organization, ConfigServiceTags } from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';

enum ACCEL_LOOKUP_TYPE {
  KMS = 'KMS',
  Bucket = 'Bucket',
  CUSTOMER_MANAGED_POLICY = 'CustomerManagedPolicy',
  INSTANCE_PROFILE = 'InstanceProfile',
  ORGANIZATION_ID = 'OrgId',
  ACCOUNT_ID = 'AccountId',
  REMEDIATION_FUNCTION_NAME = 'RemediationFunctionName',
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
export class SecurityResourcesStack extends AcceleratorStack {
  readonly acceleratorKey: cdk.aws_kms.Key;
  readonly auditAccountId: string;
  readonly logArchiveAccountId: string;
  readonly stackProperties: AcceleratorStackProps;

  organizationId: string | undefined;
  configRecorder: config.CfnConfigurationRecorder | undefined;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.stackProperties = props;
    this.auditAccountId = props.accountsConfig.getAuditAccountId();
    this.logArchiveAccountId = props.accountsConfig.getLogArchiveAccountId();

    //
    // Set Organization ID
    this.setOrganizationId();

    this.acceleratorKey = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

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
    this.setupConfigRecorderAndDeliveryChannel();

    //
    // Config Rules
    //
    this.setupAwsConfigRules();

    //
    // CloudWatch Metrics
    //
    for (const metricSetItem of props.securityConfig.cloudWatch.metricSets ?? []) {
      if (!metricSetItem.regions?.includes(cdk.Stack.of(this).region)) {
        Logger.info(`[security-resources-stack] Current region not explicity specified for metric item, skip`);
        continue;
      }

      if (!this.isIncluded(metricSetItem.deploymentTargets)) {
        Logger.info(`[security-resources-stack] Item excluded`);
        continue;
      }

      for (const metricItem of metricSetItem.metrics ?? []) {
        Logger.info(`[security-resources-stack] Creating CloudWatch metric filter ${metricItem.filterName}`);

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
    this.configureCloudwatchAlarm();

    Logger.info('[security-resources-stack] Completed stack synthesis');
  }

  /**
   * Function to configure CW alarms
   */
  private configureCloudwatchAlarm() {
    for (const alarmSetItem of this.props.securityConfig.cloudWatch.alarmSets ?? []) {
      if (!alarmSetItem.regions?.includes(cdk.Stack.of(this).region)) {
        Logger.info(`[security-resources-stack] Current region not explicity specified for alarm item, skip`);
        continue;
      }

      if (!this.isIncluded(alarmSetItem.deploymentTargets)) {
        Logger.info(`[security-resources-stack] Item excluded`);
        continue;
      }

      for (const alarmItem of alarmSetItem.alarms ?? []) {
        Logger.info(`[security-resources-stack] Creating CloudWatch alarm ${alarmItem.alarmName}`);

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
                account: this.props.accountsConfig.getAuditAccountId(),
                resource: `aws-accelerator-${alarmItem.snsAlertLevel}Notifications`,
                arnFormat: cdk.ArnFormat.NO_RESOURCE_NAME,
              }),
            ),
          ),
        );
      }
    }
  }

  private setOrganizationId() {
    if (this.props.organizationConfig.enable) {
      this.organizationId = new Organization(this, 'Organization').id;
    }
  }

  /**
   * Function to setup AWS Config - recorder and delivery channel
   */
  private setupConfigRecorderAndDeliveryChannel() {
    if (
      !this.props.globalConfig.controlTower.enable ||
      this.props.accountsConfig.getManagementAccountId() === cdk.Stack.of(this).account
    ) {
      if (this.props.securityConfig.awsConfig.enableConfigurationRecorder) {
        const configRecorderRole = new iam.Role(this, 'ConfigRecorderRole', {
          assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
          managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole')],
        });

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/ConfigRecorderRole/Resource`, [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'ConfigRecorderRole needs managed policy service-role/AWS_ConfigRole to administer config rules',
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

        this.configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
          roleArn: configRecorderRole.roleArn,
          recordingGroup: {
            allSupported: true,
            includeGlobalResourceTypes: true,
          },
        });
      }

      if (this.props.securityConfig.awsConfig.enableDeliveryChannel) {
        new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
          s3BucketName: `aws-accelerator-central-logs-${this.logArchiveAccountId}-${this.props.globalConfig.homeRegion}`,
          configSnapshotDeliveryProperties: {
            deliveryFrequency: 'One_Hour',
          },
        });
      }
    }
  }

  /**
   * Function to create AWS Managed Config rule
   * @param rule
   * @returns
   */
  private createManagedConfigRule(rule: ConfigRule): config.ManagedRule | config.CustomRule | undefined {
    Logger.info(`[security-resources-stack] Creating managed rule ${rule.name}`);

    const resourceTypes: config.ResourceType[] = [];
    for (const resourceType of rule.complianceResourceTypes ?? []) {
      resourceTypes.push(config.ResourceType.of(resourceType));
    }

    const managedConfigRule = new config.ManagedRule(this, pascalCase(rule.name), {
      configRuleName: rule.name,
      description: rule.description,
      identifier: rule.identifier ?? rule.name,
      inputParameters: this.getRuleParameters(rule.name, rule.inputParameters),
      ruleScope: {
        resourceTypes,
      },
    });

    return managedConfigRule;
  }

  /**
   * Function to create AWS custom config rule
   * @param rule
   * @returns
   */
  private createCustomConfigRule(rule: ConfigRule): config.ManagedRule | config.CustomRule | undefined {
    Logger.info(`[security-resources-stack] Creating custom rule ${rule.name}`);
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
      code: cdk.aws_lambda.Code.fromAsset(path.join(this.props.configDirPath, rule.customRule.lambda.sourceFilePath)),
      description: `AWS Config custom rule function used for "${rule.name}" rule`,
      timeout: cdk.Duration.seconds(rule.customRule.lambda.timeout ?? 3),
    });

    // Configure lambda log file with encryption and log retention
    new cdk.aws_logs.LogGroup(this, pascalCase(rule.name) + '-LogGroup', {
      logGroupName: `/aws/lambda/${lambdaFunction.functionName}`,
      retention: this.props.globalConfig.cloudwatchLogRetentionInDays,
      encryptionKey: this.acceleratorKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Read in the policy document which should be properly formatted json
    const policyDocument = require(path.join(this.props.configDirPath, rule.customRule.lambda.rolePolicyFile));
    // Create a statements list using the PolicyStatement factory
    const policyStatements: cdk.aws_iam.PolicyStatement[] = [];
    for (const statement of policyDocument.Statement) {
      policyStatements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
    }

    // Assign policy to Lambda
    lambdaFunction.role?.attachInlinePolicy(
      new cdk.aws_iam.Policy(this, pascalCase(rule.name) + '-LambdaRolePolicy', {
        statements: [...policyStatements],
      }),
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/${pascalCase(rule.name)}-LambdaRolePolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'AWS Config rule custom lambda role, created by the permission provided in config repository',
        },
      ],
    );

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

    const managedConfigRule = new config.CustomRule(this, pascalCase(rule.name), {
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
    managedConfigRule.node.addDependency(lambdaFunction);

    return managedConfigRule;
  }

  /**
   * Function to setup AWS Config rule remediation
   * @param rule
   * @param configRule
   */
  private setupConfigRuleRemediation(rule: ConfigRule, configRule: config.ManagedRule | config.CustomRule) {
    const remediationRole = this.createRemediationRole(
      rule.name,
      path.join(this.props.configDirPath, rule.remediation.rolePolicyFile),
      `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
        rule.remediation.targetAccountName
          ? this.props.accountsConfig.getAccountId(rule.remediation.targetAccountName)
          : this.props.accountsConfig.getAuditAccountId()
      }:document/${rule.remediation.targetId}`,
      !!rule.remediation.targetDocumentLambda,
    );

    // If remediation document use action as aws:invokeLambdaFunction, create the lambda function
    let remediationLambdaFunction: cdk.aws_lambda.Function | undefined;
    if (rule.remediation.targetDocumentLambda) {
      remediationLambdaFunction = new cdk.aws_lambda.Function(this, pascalCase(rule.name) + '-RemediationFunction', {
        role: remediationRole,
        runtime: new cdk.aws_lambda.Runtime(rule.remediation.targetDocumentLambda.runtime),
        handler: rule.remediation.targetDocumentLambda.handler,
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(this.props.configDirPath, rule.remediation.targetDocumentLambda.sourceFilePath),
        ),
        description: `Function used in ${rule.remediation.targetId} SSM document for "${rule.name}" custom config rule to remediation`,
      });

      // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/${pascalCase(rule.name)}-RemediationFunction/ServiceRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'AWS Config custom rule needs managed readonly access policy',
          },
        ],
      );

      // Configure lambda log file with encryption and log retention
      new cdk.aws_logs.LogGroup(this, pascalCase(rule.name) + '-RemediationLogGroup', {
        logGroupName: `/aws/lambda/${remediationLambdaFunction.functionName}`,
        retention: this.props.globalConfig.cloudwatchLogRetentionInDays,
        encryptionKey: this.acceleratorKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    }

    new config.CfnRemediationConfiguration(this, pascalCase(rule.name) + '-Remediation', {
      configRuleName: rule.name,
      targetId: `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
        rule.remediation.targetAccountName
          ? this.props.accountsConfig.getAccountId(rule.remediation.targetAccountName)
          : this.props.accountsConfig.getAuditAccountId()
      }:document/${rule.remediation.targetId}`,
      targetVersion: rule.remediation.targetVersion,
      targetType: 'SSM_DOCUMENT',

      automatic: rule.remediation.automatic,
      maximumAutomaticAttempts: rule.remediation.maximumAutomaticAttempts,
      retryAttemptSeconds: rule.remediation.retryAttemptSeconds,
      parameters: this.getRemediationParameters(
        rule.name,
        rule.remediation.parameters as string[],
        [remediationRole.roleArn],
        remediationLambdaFunction ? remediationLambdaFunction.functionName : undefined,
      ),
    }).node.addDependency(configRule);
  }

  /**
   * Function to setup tagging for AWS Config services
   * @param rule
   * @param configRule
   */
  private setupConfigServicesTagging(rule: ConfigRule, configRule: config.ManagedRule | config.CustomRule) {
    if (rule.tags) {
      const configRuleTags = this.convertAcceleratorTags(rule.tags);
      new ConfigServiceTags(this, pascalCase(rule.name + 'tags'), {
        resourceArn: configRule.configRuleArn,
        tags: configRuleTags,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        kmsKey: this.acceleratorKey,
        partition: this.props.partition,
        accountId: cdk.Stack.of(this).account,
      });
    }
  }

  /**
   * Function to create AWS Config rules (Managed and Custom)
   * @param ruleSet
   */
  private createAwsConfigRules(ruleSet: AwsConfigRuleSet) {
    for (const rule of ruleSet.rules) {
      let configRule: config.ManagedRule | config.CustomRule | undefined;

      if (rule.type && rule.type === 'Custom') {
        configRule = this.createCustomConfigRule(rule);
      } else {
        configRule = this.createManagedConfigRule(rule);
      }

      if (configRule) {
        // Tag rule
        this.setupConfigServicesTagging(rule, configRule);

        // Create remediation for config rule
        if (rule.remediation) {
          this.setupConfigRuleRemediation(rule, configRule);
        } else {
          Logger.info(`[security-resources-stack] No remediation provided for custom config rule ${rule.name}`);
        }

        if (this.configRecorder) {
          configRule.node.addDependency(this.configRecorder);
        }
      }
    }
  }

  /**
   * Function to setup AWS Config rules
   */
  private setupAwsConfigRules() {
    Logger.info('[security-resources-stack] Evaluating AWS Config rule sets');

    for (const ruleSet of this.props.securityConfig.awsConfig.ruleSets) {
      if (!this.isIncluded(ruleSet.deploymentTargets)) {
        Logger.info('[security-resources-stack] Item excluded');
        continue;
      }

      Logger.info(
        `[security-resources-stack] Account (${
          cdk.Stack.of(this).account
        }) should be included, deploying AWS Config Rules`,
      );
      this.createAwsConfigRules(ruleSet);
    }
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

  private getReplaceValues(value: string, ruleName: string): string[] {
    const replacementValues: string[] = [];
    for (const item of value.split(',')) {
      const parameterReplacementNeeded = item.match('\\${ACCEL_LOOKUP::([a-zA-Z0-9-/:]*)}');
      if (parameterReplacementNeeded) {
        const replacementValue = this.getReplacementValue(ruleName, parameterReplacementNeeded, 'Rule-Parameter');
        replacementValues.push(replacementValue?.split(',')[0] ?? '');
      }
    }
    return replacementValues;
  }

  private getRemediationReplacementValues(value: string, ruleName: string, configFunctionName?: string): string[] {
    const replacementValues: string[] = [];
    for (const item of value.split(',')) {
      const parameterReplacementNeeded = item.match('\\${ACCEL_LOOKUP::([a-zA-Z0-9-/:]*)}');
      if (parameterReplacementNeeded) {
        const replacementValue = this.getReplacementValue(
          ruleName,
          parameterReplacementNeeded,
          'Remediation-Parameter',
          configFunctionName,
        );
        replacementValues.push(replacementValue ?? '');
      }
    }

    return replacementValues;
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
        const replacementValues: string[] = this.getReplaceValues(value, ruleName);
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

  private getParamValue(replacementValues: string[], parameterType: string): string[] {
    if (parameterType === 'StringList') {
      return replacementValues;
    } else {
      return [replacementValues.join(',')];
    }
  }

  /**
   * Function to get remediation parameters
   * @param ruleName
   * @param params
   * @param assumeRoleArn
   * @param configFunctionName
   * @private
   */
  private getRemediationParameters(
    ruleName: string,
    params?: string[],
    assumeRoleArn?: string[],
    configFunctionName?: string,
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

    for (const param of params) {
      let parameterName: string | undefined;
      let parameterValue: string | undefined;
      let parameterType = 'List';
      for (const [key, value] of Object.entries(param)) {
        switch (key) {
          case 'name':
            parameterName = value;
            break;
          case 'value':
            parameterValue = value;
            break;
          case 'type':
            parameterType = value;
            break;
        }
      }

      const replacementValues: string[] = this.getRemediationReplacementValues(
        parameterValue as string,
        ruleName,
        configFunctionName,
      );

      if (replacementValues.length > 0) {
        returnParams[parameterName!] = {
          StaticValue: {
            Values: this.getParamValue(replacementValues, parameterType),
          },
        };
      } else {
        if (parameterValue === 'RESOURCE_ID') {
          returnParams[parameterName!] = {
            ResourceValue: {
              Value: 'RESOURCE_ID',
            },
          };
        } else {
          returnParams[parameterName!] = {
            StaticValue: {
              Values: parameterValue!.split(','),
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
   * @param remediationFunctionName
   * @private
   */
  private getReplacementValue(
    ruleName: string,
    replacement: RegExpMatchArray,
    replacementType: string,
    remediationFunctionName?: string,
  ): string | undefined {
    const replacementArray = replacement[1].split(':');
    const lookupType = replacementArray[0];

    if (lookupType === ACCEL_LOOKUP_TYPE.REMEDIATION_FUNCTION_NAME && replacementArray.length === 1) {
      if (remediationFunctionName) {
        return remediationFunctionName;
      } else {
        throw new Error(
          `Remediation function for ${ruleName} rule is undefined. Invalid lookup value ${replacementArray[1]}`,
        );
      }
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.ORGANIZATION_ID && replacementArray.length === 1) {
      if (this.organizationId) {
        return this.organizationId;
      } else {
        throw new Error(`${ruleName} parameter error !! Organization not enabled can not retrieve organization id`);
      }
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.ACCOUNT_ID) {
      return this.stackProperties.accountsConfig.getAccountId(replacementArray[1]);
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.INSTANCE_PROFILE && replacementArray.length === 2) {
      return replacementArray[1];
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.CUSTOMER_MANAGED_POLICY && replacementArray.length === 2) {
      return cdk.aws_iam.ManagedPolicy.fromManagedPolicyName(
        this,
        `${pascalCase(ruleName)} + ${pascalCase(replacementArray[1])}-${pascalCase(replacementType)}`,
        replacementArray[1],
      ).managedPolicyArn;
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.KMS && replacementArray.length === 1) {
      return this.acceleratorKey.keyArn;
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.Bucket && replacementArray.length === 2) {
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
  /**
   * Function to create remediation role
   * @param ruleName
   * @param policyFilePath
   * @param resources
   * @param isLambdaRole
   * @private
   */
  private createRemediationRole(
    ruleName: string,
    policyFilePath: string,
    resources?: string,
    isLambdaRole = false,
  ): cdk.aws_iam.IRole {
    // Read in the policy document which should be properly formatted json
    const policyDocument = require(policyFilePath);
    // Create a statements list using the PolicyStatement factory
    const policyStatements: cdk.aws_iam.PolicyStatement[] = [];
    for (const statement of policyDocument.Statement) {
      policyStatements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
    }

    const principals: cdk.aws_iam.PrincipalBase[] = [new iam.ServicePrincipal('ssm.amazonaws.com')];
    if (isLambdaRole) {
      principals.push(new iam.ServicePrincipal('lambda.amazonaws.com'));
    }

    const role = new iam.Role(this, pascalCase(ruleName) + '-RemediationRole', {
      assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
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

  private convertAcceleratorTags(acceleratorTags: Tag[]): ConfigRuleTag[] {
    const tags: ConfigRuleTag[] = [];
    for (const tag of acceleratorTags) {
      tags.push({ Key: tag.key, Value: tag.value });
    }
    return tags;
  }
}
