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
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import path from 'path';
import { Tag as ConfigRuleTag } from '@aws-sdk/client-config-service';
import { AwsConfigRuleSet, ConfigRule, Tag } from '@aws-accelerator/config';

import {
  ConfigServiceRecorder,
  CloudWatchLogGroups,
  ConfigServiceTags,
  KeyLookup,
  SsmSessionManagerSettings,
  SecurityHubEventsLog,
} from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

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

type CustomConfigRuleType = cdk.aws_config.ManagedRule | cdk.aws_config.CustomRule | undefined;

/**
 * Security Stack, configures local account security services
 */
export class SecurityResourcesStack extends AcceleratorStack {
  readonly centralLogS3Key: cdk.aws_kms.IKey;
  readonly cloudwatchKey: cdk.aws_kms.IKey;
  readonly snsKey: cdk.aws_kms.IKey | undefined;
  readonly lambdaKey: cdk.aws_kms.IKey;
  readonly auditAccountId: string;
  readonly logArchiveAccountId: string;
  readonly stackProperties: AcceleratorStackProps;

  configRecorder: cdk.aws_config.CfnConfigurationRecorder | undefined;
  deliveryChannel: cdk.aws_config.CfnDeliveryChannel | undefined;
  accountTrailCloudWatchLogGroups: Map<string, cdk.aws_logs.LogGroup>;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.logger.info('Begin stack synthesis');
    this.accountTrailCloudWatchLogGroups = new Map<string, cdk.aws_logs.LogGroup>();
    this.stackProperties = props;
    this.auditAccountId = props.accountsConfig.getAuditAccountId();
    this.logArchiveAccountId = props.accountsConfig.getLogArchiveAccountId();

    this.centralLogS3Key = new KeyLookup(this, 'AcceleratorCentralLogS3Key', {
      accountId: this.props.accountsConfig.getLogArchiveAccountId(),
      keyRegion: this.props.centralizedLoggingRegion,
      roleName: this.acceleratorResourceNames.roles.crossAccountCentralLogBucketCmkArnSsmParameterAccess,
      keyArnParameterName: this.acceleratorResourceNames.parameters.centralLogBucketCmkArn,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      acceleratorPrefix: this.props.prefixes.accelerator,
    }).getKey();

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
      ),
    );

    this.lambdaKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetLambdaKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(this, this.acceleratorResourceNames.parameters.lambdaCmkArn),
    );

    // if sns topics defined and this is the log archive account or
    // sns topics defined and this is a deployment target for sns topics
    // get sns key
    if (
      (props.globalConfig.snsTopics && cdk.Stack.of(this).account === props.accountsConfig.getLogArchiveAccountId()) ||
      (props.globalConfig.snsTopics && this.isIncluded(props.globalConfig.snsTopics.deploymentTargets))
    ) {
      this.snsKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        'AcceleratorGetSnsKey',
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.acceleratorResourceNames.parameters.snsTopicCmkArn,
        ),
      );
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
    this.setupConfigRecorderAndDeliveryChannel();

    //
    // Config Rules
    //
    this.setupAwsConfigRules();

    //
    // Configure Account CloudTrail Logs
    //
    this.configureAccountCloudTrails();

    //
    // CloudWatch Metrics
    //
    for (const metricSetItem of props.securityConfig.cloudWatch.metricSets ?? []) {
      if (!metricSetItem.regions?.includes(cdk.Stack.of(this).region)) {
        continue;
      }

      if (!this.isIncluded(metricSetItem.deploymentTargets)) {
        continue;
      }

      for (const metricItem of metricSetItem.metrics ?? []) {
        const metricFilter = new cdk.aws_logs.MetricFilter(this, pascalCase(metricItem.filterName), {
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

        if (this.accountTrailCloudWatchLogGroups.get(metricItem.logGroupName)) {
          metricFilter.node.addDependency(this.accountTrailCloudWatchLogGroups.get(metricItem.logGroupName)!);
        }
      }
    }

    //
    // CloudWatch Alarms
    //
    this.configureCloudwatchAlarm();

    //
    // CloudWatch Log Groups
    //
    this.configureCloudwatchLogGroups();

    //
    // SessionManager Configuration
    //
    if (
      !this.isAccountExcluded(props.globalConfig.logging.sessionManager.excludeAccounts) &&
      !this.isRegionExcluded(props.globalConfig.logging.sessionManager.excludeRegions)
    ) {
      this.setupSessionManager();
    }

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${this.stackName}/SsmSessionManagerSettings/SessionPolicy${cdk.Stack.of(this).region}/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific log group',
        },
      ],
    );

    // SecurityHub Log event to CloudWatch
    this.securityHubEventForwardToLogs();

    //
    // Create Managed Active Directory secrets
    //
    this.createManagedActiveDirectorySecrets();

    this.logger.info('End stack synthesis');
  }

  /**
   * Function to create Managed active directory secrets for admin user and ad users
   */
  private createManagedActiveDirectorySecrets() {
    for (const managedActiveDirectory of this.props.iamConfig.managedActiveDirectories ?? []) {
      const madAccountId = this.props.accountsConfig.getAccountId(managedActiveDirectory.account);
      const madRegion = managedActiveDirectory.region;

      const secretName = `${this.props.prefixes.secretName}/ad-user/${
        managedActiveDirectory.name
      }/${this.props.iamConfig.getManageActiveDirectoryAdminSecretName(managedActiveDirectory.name)}`;
      const madAdminSecretAccountId = this.props.accountsConfig.getAccountId(
        this.props.iamConfig.getManageActiveDirectorySecretAccountName(managedActiveDirectory.name),
      );
      const madAdminSecretRegion = this.props.iamConfig.getManageActiveDirectorySecretRegion(
        managedActiveDirectory.name,
      );

      if (cdk.Stack.of(this).account == madAdminSecretAccountId && cdk.Stack.of(this).region == madAdminSecretRegion) {
        const key = cdk.aws_kms.Key.fromKeyArn(
          this,
          pascalCase(`${managedActiveDirectory.name}AdminSecretKeyLookup`),
          cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.acceleratorResourceNames.parameters.secretsManagerCmkArn,
          ),
        );
        const adminSecret = new cdk.aws_secretsmanager.Secret(
          this,
          pascalCase(`${managedActiveDirectory.name}AdminSecret`),
          {
            generateSecretString: {
              passwordLength: 16,
              requireEachIncludedType: true,
            },
            secretName,
            encryptionKey: key,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
          },
        );

        // AwsSolutions-SMG4: The secret does not have automatic rotation scheduled
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/${pascalCase(managedActiveDirectory.name)}AdminSecret/Resource`,
          [
            {
              id: 'AwsSolutions-SMG4',
              reason: 'Managed AD secret.',
            },
          ],
        );

        new cdk.aws_ssm.StringParameter(this, pascalCase(`${managedActiveDirectory.name}AdminSecretArnParameter`), {
          parameterName: `${this.props.prefixes.ssmParamName}/secrets-manager/${managedActiveDirectory.name}/admin-secret/secret-arn`,
          stringValue: adminSecret.secretArn,
        });

        let madAccessRoleArn: string;
        if (this.props.globalConfig.cdkOptions.useManagementAccessRole) {
          madAccessRoleArn = `arn:${cdk.Stack.of(this).partition}:iam::${madAccountId}:role/${
            this.props.globalConfig.managementAccountAccessRole
          }`;
        } else {
          madAccessRoleArn = `arn:${
            cdk.Stack.of(this).partition
          }:iam::${madAccountId}:role/cdk-accel-cfn-exec-role-${madAccountId}-${madRegion}`;
        }

        // Attach MAD creation stack role to have access to the secret
        adminSecret.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            principals: [new cdk.aws_iam.ArnPrincipal(madAccessRoleArn)],
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['*'],
          }),
        );

        if (managedActiveDirectory.activeDirectoryConfigurationInstance) {
          const activeDirectoryInstance = managedActiveDirectory.activeDirectoryConfigurationInstance;

          const instanceRole = cdk.aws_iam.Role.fromRoleArn(
            this,
            pascalCase(managedActiveDirectory.name) + pascalCase(activeDirectoryInstance.instanceRole),
            `arn:${cdk.Stack.of(this).partition}:iam::${madAccountId}:role/${activeDirectoryInstance.instanceRole}`,
          );

          // Attach MAD instance role access to secrets resource policy
          adminSecret.addToResourcePolicy(
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              principals: [new cdk.aws_iam.ArnPrincipal(instanceRole.roleArn)],
              actions: ['secretsmanager:GetSecretValue'],
              resources: ['*'],
            }),
          );

          // Create ad user secrets for instance user data script
          for (const adUser of activeDirectoryInstance.adUsers ?? []) {
            const secret = new cdk.aws_secretsmanager.Secret(this, pascalCase(`${adUser.name}Secret`), {
              description: `Password for Managed Active Directory user ${adUser.name}`,
              generateSecretString: {
                passwordLength: 16,
                requireEachIncludedType: true,
              },
              secretName: `${this.props.prefixes.secretName}/ad-user/${managedActiveDirectory.name}/${adUser.name}`,
              encryptionKey: key,
              removalPolicy: cdk.RemovalPolicy.RETAIN,
            });

            // AwsSolutions-SMG4: The secret does not have automatic rotation scheduled
            NagSuppressions.addResourceSuppressionsByPath(
              this,
              `${this.stackName}/${pascalCase(adUser.name)}Secret/Resource`,
              [
                {
                  id: 'AwsSolutions-SMG4',
                  reason: 'Managed AD secret.',
                },
              ],
            );

            new cdk.aws_ssm.StringParameter(
              this,
              pascalCase(`${managedActiveDirectory.name}${pascalCase(adUser.name)}SecretArnParameter`),
              {
                parameterName: `${this.props.prefixes.ssmParamName}/secrets-manager/${
                  managedActiveDirectory.name
                }/${pascalCase(adUser.name)}-secret/secret-arn`,
                stringValue: adminSecret.secretArn,
              },
            );

            // Attach MAD instance role access to secret resource policy
            secret.addToResourcePolicy(
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                principals: [new cdk.aws_iam.ArnPrincipal(instanceRole.roleArn)],
                actions: ['secretsmanager:GetSecretValue'],
                resources: ['*'],
              }),
            );
          }
        }
      }
    }
  }

  /**
   * Function to configure CW alarms
   */
  private configureCloudwatchAlarm() {
    for (const alarmSetItem of this.props.securityConfig.cloudWatch.alarmSets ?? []) {
      if (!alarmSetItem.regions?.includes(cdk.Stack.of(this).region)) {
        continue;
      }

      if (!this.isIncluded(alarmSetItem.deploymentTargets)) {
        continue;
      }

      for (const alarmItem of alarmSetItem.alarms ?? []) {
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

        if (this.props.globalConfig.snsTopics) {
          alarm.addAlarmAction(
            new cdk.aws_cloudwatch_actions.SnsAction(
              cdk.aws_sns.Topic.fromTopicArn(
                this,
                `${pascalCase(alarmItem.alarmName)}Topic`,
                cdk.Stack.of(this).formatArn({
                  service: 'sns',
                  region: cdk.Stack.of(this).region,
                  account: cdk.Stack.of(this).account,
                  resource: `${this.props.prefixes.snsTopicName}-${alarmItem.snsTopicName}`,
                  arnFormat: cdk.ArnFormat.NO_RESOURCE_NAME,
                }),
              ),
            ),
          );
        } else {
          alarm.addAlarmAction(
            new cdk.aws_cloudwatch_actions.SnsAction(
              cdk.aws_sns.Topic.fromTopicArn(
                this,
                `${pascalCase(alarmItem.alarmName)}Topic`,
                cdk.Stack.of(this).formatArn({
                  service: 'sns',
                  region: cdk.Stack.of(this).region,
                  account: this.props.accountsConfig.getAuditAccountId(),
                  resource: `${this.props.prefixes.snsTopicName}-${alarmItem.snsAlertLevel}Notifications`,
                  arnFormat: cdk.ArnFormat.NO_RESOURCE_NAME,
                }),
              ),
            ),
          );
        }
      }
    }
  }

  private configureCloudwatchLogGroups() {
    for (const logGroupItem of this.props.securityConfig.cloudWatch.logGroups ?? []) {
      if (
        this.isAccountIncluded(logGroupItem.deploymentTargets.accounts) &&
        !this.isRegionExcluded(logGroupItem.deploymentTargets.excludedRegions)
      ) {
        let keyArn: string | undefined = undefined;
        if (logGroupItem.encryption?.kmsKeyName) {
          keyArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            `${this.props.prefixes.ssmParamName}/kms/${logGroupItem.encryption?.kmsKeyName}/key-arn`,
          ).toString();
        } else if (logGroupItem.encryption?.useLzaManagedKey) {
          keyArn = this.cloudwatchKey.keyArn;
        } else if (logGroupItem.encryption?.kmsKeyArn) {
          keyArn = logGroupItem.encryption?.kmsKeyArn;
        }
        new CloudWatchLogGroups(this, pascalCase(logGroupItem.logGroupName) + '-LogGroup', {
          logGroupName: logGroupItem.logGroupName,
          logRetentionInDays: logGroupItem.logRetentionInDays,
          keyArn,
          terminationProtected: logGroupItem.terminationProtected ?? false,
          customLambdaLogKmsKey: this.cloudwatchKey,
          customLambdaLogRetention: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
  }

  /**
   * Function to setup AWS Config - recorder and delivery channel
   */
  private setupConfigRecorderAndDeliveryChannel() {
    if (
      (!this.props.globalConfig.controlTower.enable ||
        this.props.accountsConfig.getManagementAccountId() === cdk.Stack.of(this).account) &&
      this.props.securityConfig.awsConfig.enableConfigurationRecorder
    ) {
      const configRecorderRole = new cdk.aws_iam.Role(this, 'ConfigRecorderRole', {
        assumedBy: new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
        managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole')],
      });

      // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressions(
        configRecorderRole,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'ConfigRecorderRole needs managed policy service-role/AWS_ConfigRole to administer config rules',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'ConfigRecorderRole DefaultPolicy is built by cdk.',
          },
        ],
        true,
      );

      /**
       * As per the documentation, the config role should have
       * the s3:PutObject permission to avoid access denied issues
       * while AWS config tries to check the s3 bucket (in another account) write permissions
       * https://docs.aws.amazon.com/config/latest/developerguide/s3-bucket-policy.html
       *
       */
      configRecorderRole.addToPrincipalPolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'S3WriteAccess',
          actions: ['s3:PutObject', 's3:PutObjectAcl'],
          resources: [
            `arn:${this.props.partition}:s3:::${this.acceleratorResourceNames.bucketPrefixes.centralLogs}-${this.logArchiveAccountId}-${this.props.centralizedLoggingRegion}/*`,
          ],
          conditions: {
            StringLike: {
              's3:x-amz-acl': 'bucket-owner-full-control',
            },
          },
        }),
      );
      configRecorderRole.addToPrincipalPolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'S3GetAclAccess',
          actions: ['s3:GetBucketAcl'],
          resources: [
            `arn:${this.props.partition}:s3:::${this.acceleratorResourceNames.bucketPrefixes.centralLogs}-${this.logArchiveAccountId}-${this.props.centralizedLoggingRegion}`,
          ],
        }),
      );

      // AwsSolutions-IAM5
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/ConfigRecorderRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Single bucket',
          },
        ],
      );

      /**
       * These resources are deprecated
       * They eventually will be removed and only
       * the custom resource will remain
       * 3/30/2023
       */
      if (!this.props.securityConfig.awsConfig.overrideExisting) {
        this.configRecorder = new cdk.aws_config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
          roleArn: configRecorderRole.roleArn,
          recordingGroup: {
            allSupported: true,
            includeGlobalResourceTypes: true,
          },
        });

        this.deliveryChannel = new cdk.aws_config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
          s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.centralLogs}-${this.logArchiveAccountId}-${this.props.centralizedLoggingRegion}`,
          configSnapshotDeliveryProperties: {
            deliveryFrequency: 'One_Hour',
          },
        });
      }

      if (this.props.securityConfig.awsConfig.overrideExisting) {
        const configServiceUpdater = new ConfigServiceRecorder(this, 'ConfigRecorderDeliveryChannel', {
          s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.centralLogs}-${this.logArchiveAccountId}-${this.props.centralizedLoggingRegion}`,
          s3BucketKmsKey: this.centralLogS3Key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          configRecorderRoleArn: configRecorderRole.roleArn,
          cloudwatchKmsKey: this.cloudwatchKey,
          lambdaKmsKey: this.lambdaKey,
          partition: this.partition,
          acceleratorPrefix: this.props.prefixes.accelerator,
        });

        if (this.configRecorder && this.deliveryChannel) {
          configServiceUpdater.node.addDependency(this.configRecorder);
          configServiceUpdater.node.addDependency(this.deliveryChannel);
        }
      }
      // AwsSolutions-IAM4
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/ConfigRecorderDeliveryChannel/ConfigServiceRecorderFunction/ServiceRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Lambda managed policy',
          },
        ],
      );
      // AwsSolutions-IAM5
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/ConfigRecorderDeliveryChannel/ConfigRecorderRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Lambda managed policy',
          },
        ],
      );
      // AwsSolutions-IAM4
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/ConfigRecorderDeliveryChannel/ConfigServiceRecorderProvider/framework-onEvent/ServiceRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Lambda managed policy',
          },
        ],
      );
      // AwsSolutions-IAM5
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/ConfigRecorderDeliveryChannel/ConfigServiceRecorderProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Lambda managed policy',
          },
        ],
      );
      // AwsSolutions-IAM5
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/ConfigRecorderDeliveryChannel/ConfigServiceRecorderFunction/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Lambda managed policy',
          },
        ],
      );
    }
  }

  /**
   * Function to create AWS Managed Config rule
   * @param rule
   * @returns
   */
  private createManagedConfigRule(rule: ConfigRule): CustomConfigRuleType {
    const resourceTypes: cdk.aws_config.ResourceType[] = [];
    for (const resourceType of rule.complianceResourceTypes ?? []) {
      resourceTypes.push(cdk.aws_config.ResourceType.of(resourceType));
    }

    const managedConfigRule = new cdk.aws_config.ManagedRule(this, pascalCase(rule.name), {
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
  private createCustomConfigRule(rule: ConfigRule): CustomConfigRuleType {
    let ruleScope: cdk.aws_config.RuleScope | undefined;

    if (rule.customRule.triggeringResources.lookupType == 'ResourceTypes') {
      for (const item of rule.customRule.triggeringResources.lookupValue) {
        ruleScope = cdk.aws_config.RuleScope.fromResources([cdk.aws_config.ResourceType.of(item)]);
      }
    }

    if (rule.customRule.triggeringResources.lookupType == 'ResourceId') {
      ruleScope = cdk.aws_config.RuleScope.fromResource(
        cdk.aws_config.ResourceType.of(rule.customRule.triggeringResources.lookupKey),
        rule.customRule.triggeringResources.lookupValue[0],
      );
    }

    if (rule.customRule.triggeringResources.lookupType == 'Tag') {
      ruleScope = cdk.aws_config.RuleScope.fromTag(
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
      encryptionKey: this.cloudwatchKey,
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

    const managedConfigRule = new cdk.aws_config.CustomRule(this, pascalCase(rule.name), {
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
  private setupConfigRuleRemediation(
    rule: ConfigRule,
    configRule: cdk.aws_config.ManagedRule | cdk.aws_config.CustomRule,
  ) {
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
        encryptionKey: this.cloudwatchKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    }

    new cdk.aws_config.CfnRemediationConfiguration(this, pascalCase(rule.name) + '-Remediation', {
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
  private setupConfigServicesTagging(
    rule: ConfigRule,
    configRule: cdk.aws_config.ManagedRule | cdk.aws_config.CustomRule,
  ) {
    if (rule.tags) {
      const configRuleTags = this.convertAcceleratorTags(rule.tags);
      new ConfigServiceTags(this, pascalCase(rule.name + 'tags'), {
        resourceArn: configRule.configRuleArn,
        tags: configRuleTags,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        kmsKey: this.cloudwatchKey,
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
      let configRule: CustomConfigRuleType;

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
    for (const ruleSet of this.props.securityConfig.awsConfig.ruleSets) {
      if (!this.isIncluded(ruleSet.deploymentTargets)) {
        continue;
      }

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
        this.logger.error(
          `Remediation function for ${ruleName} rule is undefined. Invalid lookup value ${replacementArray[1]}`,
        );
        throw new Error(`Configuration validation failed at runtime.`);
      }
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.ORGANIZATION_ID && replacementArray.length === 1) {
      if (this.organizationId) {
        return this.organizationId;
      } else {
        this.logger.error(`${ruleName} parameter error !! Organization not enabled can not retrieve organization id`);
        throw new Error(`Configuration validation failed at runtime.`);
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

    if (lookupType === ACCEL_LOOKUP_TYPE.KMS) {
      if (replacementArray.length === 1) {
        return cdk.aws_kms.Key.fromKeyArn(
          this,
          pascalCase(ruleName) + '-AcceleratorGetS3Key',
          cdk.aws_ssm.StringParameter.valueForStringParameter(this, this.acceleratorResourceNames.parameters.s3CmkArn),
        ).keyArn;
      } else {
        // When specific Key ID is given
        return cdk.aws_kms.Key.fromKeyArn(
          this,
          pascalCase(ruleName) + '-AcceleratorGetS3Key',
          `arn:${cdk.Stack.of(this).partition}:kms:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:key/${
            replacementArray[1]
          }`,
        ).keyArn;
      }
    }

    if (lookupType === ACCEL_LOOKUP_TYPE.Bucket && replacementArray.length === 2) {
      if (replacementArray[1].toLowerCase() === 'elbLogs'.toLowerCase()) {
        return `${
          this.acceleratorResourceNames.bucketPrefixes.elbLogs
        }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`;
      } else {
        return cdk.aws_s3.Bucket.fromBucketName(
          this,
          `${pascalCase(ruleName)}-${pascalCase(replacementType)}-InputBucket`,
          replacementArray[1].toLowerCase(),
        ).bucketName;
      }
    }
    this.logger.error(`Config rule replacement key ${replacement.input} not found`);
    throw new Error(`Configuration validation failed at runtime.`);
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

    const principals: cdk.aws_iam.PrincipalBase[] = [new cdk.aws_iam.ServicePrincipal('ssm.amazonaws.com')];
    if (isLambdaRole) {
      principals.push(new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'));
    }

    const role = new cdk.aws_iam.Role(this, pascalCase(ruleName) + '-RemediationRole', {
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

  /**
   * Function to setup Session manager
   */
  private setupSessionManager() {
    if (
      this.props.globalConfig.logging.sessionManager.sendToCloudWatchLogs ||
      this.props.globalConfig.logging.sessionManager.sendToS3
    ) {
      // Set up Session Manager Logging
      new SsmSessionManagerSettings(this, 'SsmSessionManagerSettings', {
        s3BucketName: `${
          this.acceleratorResourceNames.bucketPrefixes.centralLogs
        }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`,
        s3KeyPrefix: `session/${cdk.Aws.ACCOUNT_ID}/${cdk.Stack.of(this).region}`,
        s3BucketKeyArn: this.centralLogS3Key.keyArn,
        sendToCloudWatchLogs: this.props.globalConfig.logging.sessionManager.sendToCloudWatchLogs,
        sendToS3: this.props.globalConfig.logging.sessionManager.sendToS3,
        cloudWatchEncryptionEnabled:
          this.props.partition !== 'aws-us-gov' && this.props.globalConfig.logging.sessionManager.sendToCloudWatchLogs,
        attachPolicyToIamRoles: this.props.globalConfig.logging.sessionManager.attachPolicyToIamRoles,
        cloudWatchEncryptionKey: this.cloudwatchKey,
        constructLoggingKmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        region: cdk.Stack.of(this).region,
        acceleratorPrefix: this.props.prefixes.accelerator,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/SsmSessionManagerSettings/SessionManagerEC2Policy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Policy needed access to all S3 objects for the account to put objects into the access log bucket',
          },
        ],
      );

      // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/SsmSessionManagerSettings/SessionManagerEC2Role/Resource`,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Create an IAM managed Policy for users to be able to use Session Manager with KMS encryption',
          },
        ],
      );
    }
  }

  private securityHubEventForwardToLogs() {
    if (this.props.securityConfig.centralSecurityServices.securityHub.enable) {
      new SecurityHubEventsLog(this, 'SecurityHubEventsLog', {
        acceleratorPrefix: this.props.prefixes.accelerator,
        snsTopicArn: `arn:${cdk.Stack.of(this).partition}:sns:${cdk.Stack.of(this).region}:${
          cdk.Stack.of(this).account
        }:${this.props.prefixes.snsTopicName}-${
          this.props.securityConfig.centralSecurityServices.securityHub.snsTopicName
        }`,
        snsKmsKey: this.snsKey,
        notificationLevel: this.props.securityConfig.centralSecurityServices.securityHub.notificationLevel,
        lambdaKey: this.lambdaKey,
      });
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/SecurityHubEventsLog/SecurityHubEventsFunction/ServiceRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Managed policy for lambda to write logs to cloudwatch.',
          },
        ],
      );

      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/SecurityHubEventsFunction/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: `Allows only access to /${this.props.prefixes.accelerator}-SecurityHub log group.`,
          },
        ],
      );

      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/SecurityHubEventsLog/SecurityHubEventsFunction/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: `Allows only access to /${this.props.prefixes.accelerator}-SecurityHub log group.`,
          },
        ],
      );
    }
  }

  private configureAccountCloudTrails() {
    // Don't create any CloudTrail resources unless CloudTrail is enabled.
    if (!this.stackProperties.globalConfig.logging.cloudtrail.enable) {
      return;
    }
    for (const accountTrail of this.stackProperties.globalConfig.logging.cloudtrail.accountTrails ?? []) {
      if (!accountTrail.regions?.includes(cdk.Stack.of(this).region)) {
        continue;
      }

      if (!this.isIncluded(accountTrail.deploymentTargets)) {
        continue;
      }

      const trailName = `${this.props.prefixes.accelerator}-CloudTrail-${accountTrail.name}`;

      let accountTrailCloudWatchLogGroup: cdk.aws_logs.LogGroup | undefined = undefined;
      if (accountTrail.settings.sendToCloudWatchLogs) {
        const logGroupName = `${this.props.prefixes.trailLogName}-cloudtrail-${accountTrail.name}`;
        accountTrailCloudWatchLogGroup = new cdk.aws_logs.LogGroup(this, `CloudTrailLogGroup-${accountTrail.name}`, {
          retention: this.stackProperties.globalConfig.cloudwatchLogRetentionInDays,
          encryptionKey: this.cloudwatchKey,
          logGroupName,
        });
        this.accountTrailCloudWatchLogGroups.set(logGroupName, accountTrailCloudWatchLogGroup);
      }

      let managementEventType = cdk.aws_cloudtrail.ReadWriteType.NONE;
      if (accountTrail.settings.managementEvents) {
        managementEventType = cdk.aws_cloudtrail.ReadWriteType.ALL;
      }

      const accountCloudTrailLog = new cdk_extensions.Trail(this, `AcceleratorCloudTrail-${accountTrail.name}`, {
        bucket: cdk.aws_s3.Bucket.fromBucketName(
          this,
          'CloudTrailLogBucket',
          `${this.acceleratorResourceNames.bucketPrefixes.centralLogs}-${this.logArchiveAccountId}-${this.props.centralizedLoggingRegion}`,
        ),
        s3KeyPrefix: `cloudtrail-${accountTrail.name}`,
        cloudWatchLogGroup: accountTrailCloudWatchLogGroup,
        cloudWatchLogsRetention: this.stackProperties.globalConfig.cloudwatchLogRetentionInDays,
        enableFileValidation: true,
        encryptionKey: this.centralLogS3Key,
        includeGlobalServiceEvents: accountTrail.settings.globalServiceEvents ?? false,
        isMultiRegionTrail: accountTrail.settings.multiRegionTrail ?? false,
        isOrganizationTrail: false,
        apiCallRateInsight: accountTrail.settings.apiCallRateInsight ?? false,
        apiErrorRateInsight: accountTrail.settings.apiErrorRateInsight ?? false,
        managementEvents: managementEventType,
        sendToCloudWatchLogs: accountTrail.settings.sendToCloudWatchLogs ?? false,
        trailName: trailName,
      });

      if (accountTrail.settings.s3DataEvents) {
        accountCloudTrailLog.addEventSelector(cdk.aws_cloudtrail.DataResourceType.S3_OBJECT, [
          `arn:${cdk.Stack.of(this).partition}:s3:::`,
        ]);
      }

      if (accountTrail.settings.lambdaDataEvents) {
        accountCloudTrailLog.addEventSelector(cdk.aws_cloudtrail.DataResourceType.LAMBDA_FUNCTION, [
          `arn:${cdk.Stack.of(this).partition}:lambda`,
        ]);
      }
    }
  }
}
