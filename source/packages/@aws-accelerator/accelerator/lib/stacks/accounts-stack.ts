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
import * as path from 'path';
import {
  EnablePolicyType,
  Policy,
  PolicyAttachment,
  PolicyType,
  PolicyTypeEnum,
  MoveAccountRule,
  RevertScpChanges,
} from '@aws-accelerator/constructs';
import { AcceleratorKeyType, AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export interface AccountsStackProps extends AcceleratorStackProps {
  readonly configDirPath: string;
}

export class AccountsStack extends AcceleratorStack {
  readonly cloudwatchKey: cdk.aws_kms.Key;
  readonly lambdaKey: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props);

    // Use existing management account CloudWatch log key if in the home region
    // otherwise create new kms key
    if (props.globalConfig.homeRegion == cdk.Stack.of(this).region) {
      this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        'AcceleratorGetCloudWatchKey',
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
        ),
      ) as cdk.aws_kms.Key;
    } else {
      this.cloudwatchKey = new cdk.aws_kms.Key(this, 'AcceleratorCloudWatchKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      // Allow Cloudwatch logs to use the encryption key
      this.cloudwatchKey.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Cloudwatch logs to use the encryption key`,
          principals: [
            new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`),
          ],
          actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
                cdk.Stack.of(this).region
              }:${cdk.Stack.of(this).account}:log-group:*`,
            },
          },
        }),
      );

      this.ssmParameters.push({
        logicalId: 'AcceleratorCloudWatchKmsArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
        stringValue: this.cloudwatchKey.keyArn,
      });
    }

    // Exactly like CloudWatch key, reference a new key if in home
    // otherwise create new kms key
    if (props.globalConfig.homeRegion == cdk.Stack.of(this).region) {
      this.lambdaKey = this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);
    } else {
      // Create KMS Key for Lambda environment variable encryption
      this.lambdaKey = new cdk.aws_kms.Key(this, 'AcceleratorLambdaKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.lambda.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.lambda.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      this.ssmParameters.push({
        logicalId: 'AcceleratorLambdaKmsArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.lambdaCmkArn,
        stringValue: this.lambdaKey.keyArn,
      });
    }

    //
    // Global Organizations actions
    //
    if (props.globalRegion === cdk.Stack.of(this).region) {
      if (props.organizationConfig.enable && !props.globalConfig.controlTower.enable) {
        new MoveAccountRule(this, 'MoveAccountRule', {
          globalRegion: props.globalRegion,
          homeRegion: props.globalConfig.homeRegion,
          moveAccountRoleName: this.acceleratorResourceNames.roles.moveAccountConfig,
          commitId: props.configCommitId ?? '',
          acceleratorPrefix: props.prefixes.accelerator,
          configTableNameParameterName: this.acceleratorResourceNames.parameters.configTableName,
          configTableArnParameterName: this.acceleratorResourceNames.parameters.configTableArn,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/MoveAccountRule/MoveAccountRole/Policy/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        );

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/MoveAccountRule/MoveAccountTargetFunction/ServiceRole/Resource`,
          [
            {
              id: 'AwsSolutions-IAM4',
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        );

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions.
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/MoveAccountRule/MoveAccountTargetFunction/ServiceRole/DefaultPolicy/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        );
      }

      if (props.organizationConfig.enable) {
        let quarantineScpId = '';
        const generatedScpFilePaths = [];

        // SCP is not supported in China Region.
        if (props.partition !== 'aws-cn') {
          const enablePolicyTypeScp = new EnablePolicyType(this, 'enablePolicyTypeScp', {
            policyType: PolicyTypeEnum.SERVICE_CONTROL_POLICY,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });

          // Deploy SCPs
          for (const serviceControlPolicy of props.organizationConfig.serviceControlPolicies) {
            this.logger.info(`Adding service control policy (${serviceControlPolicy.name})`);

            const scpPath = this.generatePolicyReplacements(
              path.join(props.configDirPath, serviceControlPolicy.policy),
              true,
              this.organizationId,
            );
            generatedScpFilePaths.push({
              name: serviceControlPolicy.name,
              path: serviceControlPolicy.policy,
              tempPath: scpPath,
            });

            const scp = new Policy(this, serviceControlPolicy.name, {
              description: serviceControlPolicy.description,
              name: serviceControlPolicy.name,
              partition: props.partition,
              path: scpPath,
              type: PolicyType.SERVICE_CONTROL_POLICY,
              strategy: serviceControlPolicy.strategy,
              acceleratorPrefix: props.prefixes.accelerator,
              kmsKey: this.cloudwatchKey,
              logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
            });
            scp.node.addDependency(enablePolicyTypeScp);

            if (
              serviceControlPolicy.name == props.organizationConfig.quarantineNewAccounts?.scpPolicyName &&
              props.partition == 'aws'
            ) {
              this.ssmParameters.push({
                logicalId: pascalCase(`SsmParam${scp.name}ScpPolicyId`),
                parameterName: `${props.prefixes.ssmParamName}/organizations/scp/${scp.name}/id`,
                stringValue: scp.id,
              });
              quarantineScpId = scp.id;
            }

            for (const organizationalUnit of serviceControlPolicy.deploymentTargets.organizationalUnits ?? []) {
              this.logger.info(
                `Attaching service control policy (${serviceControlPolicy.name}) to organizational unit (${organizationalUnit})`,
              );

              const ouPolicyAttachment = new PolicyAttachment(
                this,
                pascalCase(`Attach_${scp.name}_${organizationalUnit}`),
                {
                  policyId: scp.id,
                  targetId: props.organizationConfig.getOrganizationalUnitId(organizationalUnit),
                  type: PolicyType.SERVICE_CONTROL_POLICY,
                  strategy: scp.strategy,
                  configPolicyNames: this.getScpNamesForTarget(organizationalUnit, 'ou'),
                  acceleratorPrefix: props.prefixes.accelerator,
                  kmsKey: this.cloudwatchKey,
                  logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
                },
              );
              ouPolicyAttachment.node.addDependency(scp);
            }

            for (const account of serviceControlPolicy.deploymentTargets.accounts ?? []) {
              this.logger.info(
                `Attaching service control policy (${serviceControlPolicy.name}) to account (${account})`,
              );

              const accountPolicyAttachment = new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${account}`), {
                policyId: scp.id,
                targetId: props.accountsConfig.getAccountId(account),
                type: PolicyType.SERVICE_CONTROL_POLICY,
                strategy: scp.strategy,
                configPolicyNames: this.getScpNamesForTarget(account, 'account'),
                acceleratorPrefix: props.prefixes.accelerator,
                kmsKey: this.cloudwatchKey,
                logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
              });
              accountPolicyAttachment.node.addDependency(scp);
            }
          }
        }

        this.logger.debug('Enable Service Access for access-analyzer.amazonaws.com');
        this.createAccessAnalyzerServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

        this.logger.debug('Enable Service Access for guardduty.amazonaws.com');
        this.createGuardDutyServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

        this.logger.debug('Enable Service Access for securityhub.amazonaws.com');
        this.createSecurityHubServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

        this.logger.debug('Enable Service Access for macie.amazonaws.com');
        this.createMacieServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

        if (props.securityConfig.centralSecurityServices?.scpRevertChangesConfig?.enable) {
          this.logger.info(`Creating resources to revert modifications to scps`);
          new RevertScpChanges(this, 'RevertScpChanges', {
            configDirPath: props.configDirPath,
            homeRegion: props.globalConfig.homeRegion,
            kmsKeyCloudWatch: this.cloudwatchKey,
            kmsKeyLambda: this.lambdaKey,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
            acceleratorTopicNamePrefix: props.prefixes.snsTopicName,
            snsTopicName: props.securityConfig.centralSecurityServices.scpRevertChangesConfig?.snsTopicName,
            scpFilePaths: generatedScpFilePaths,
          });
        }

        if (props.organizationConfig.quarantineNewAccounts?.enable === true && props.partition === 'aws') {
          // Create resources to attach quarantine scp to
          // new accounts created in organizations
          this.logger.info(`Creating resources to quarantine new accounts`);
          const orgPolicyRead = new cdk.aws_iam.PolicyStatement({
            sid: 'OrgRead',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['organizations:ListPolicies', 'organizations:DescribeCreateAccountStatus'],
            resources: ['*'],
          });

          const orgPolicyWrite = new cdk.aws_iam.PolicyStatement({
            sid: 'OrgWrite',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['organizations:AttachPolicy'],
            resources: [
              `arn:${
                this.partition
              }:organizations::${props.accountsConfig.getManagementAccountId()}:policy/o-*/service_control_policy/${quarantineScpId}`,
              `arn:${this.partition}:organizations::${props.accountsConfig.getManagementAccountId()}:account/o-*/*`,
            ],
          });

          this.logger.info(`Creating function to attach quarantine scp to accounts`);
          const attachQuarantineFunction = new cdk.aws_lambda.Function(this, 'AttachQuarantineScpFunction', {
            code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/attach-quarantine-scp/dist')),
            runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
            handler: 'index.handler',
            description: 'Lambda function to attach quarantine scp to new accounts',
            timeout: cdk.Duration.minutes(5),
            environment: {
              SCP_POLICY_NAME: props.organizationConfig.quarantineNewAccounts?.scpPolicyName ?? '',
            },
            environmentEncryption: this.lambdaKey,
            initialPolicy: [orgPolicyRead, orgPolicyWrite],
          });

          // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/AttachQuarantineScpFunction/ServiceRole/Resource`,
            [
              {
                id: 'AwsSolutions-IAM4',
                reason: 'AWS Custom resource provider framework-role created by cdk.',
              },
            ],
          );

          // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/AttachQuarantineScpFunction/ServiceRole/DefaultPolicy/Resource`,
            [
              {
                id: 'AwsSolutions-IAM5',
                reason: 'Allows only specific policy.',
              },
            ],
          );

          const createAccountEventRule = new cdk.aws_events.Rule(this, 'CreateAccountRule', {
            eventPattern: {
              source: ['aws.organizations'],
              detailType: ['AWS API Call via CloudTrail'],
              detail: {
                eventSource: ['organizations.amazonaws.com'],
                eventName: ['CreateAccount'],
              },
            },
            description: 'Rule to notify when a new account is created.',
          });

          createAccountEventRule.addTarget(
            new cdk.aws_events_targets.LambdaFunction(attachQuarantineFunction, {
              maxEventAge: cdk.Duration.hours(4),
              retryAttempts: 2,
            }),
          );

          //If any GovCloud accounts are configured also
          //watch for any GovCloudCreateAccount events
          if (props.accountsConfig.anyGovCloudAccounts()) {
            this.logger.info(`Creating EventBridge rule to attach quarantine scp to accounts when GovCloud is enabled`);
            const createGovCloudAccountEventRule = new cdk.aws_events.Rule(this, 'CreateGovCloudAccountRule', {
              eventPattern: {
                source: ['aws.organizations'],
                detailType: ['AWS API Call via CloudTrail'],
                detail: {
                  eventSource: ['organizations.amazonaws.com'],
                  eventName: ['CreateGovCloudAccount'],
                },
              },
              description: 'Rule to notify when a new account is created using the create govcloud account api.',
            });

            createGovCloudAccountEventRule.addTarget(
              new cdk.aws_events_targets.LambdaFunction(attachQuarantineFunction, {
                maxEventAge: cdk.Duration.hours(4),
                retryAttempts: 2,
              }),
            );
          }

          new cdk.aws_logs.LogGroup(this, `${attachQuarantineFunction.node.id}LogGroup`, {
            logGroupName: `/aws/lambda/${attachQuarantineFunction.functionName}`,
            retention: props.globalConfig.cloudwatchLogRetentionInDays,
            encryptionKey: this.cloudwatchKey,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });
        }
      }
    }

    //
    // Create SSM parameters
    //
    this.createSsmParameters();

    //
    // Add nag suppressions by path
    //
    this.addResourceSuppressionsByPath(this.nagSuppressionInputs);

    this.logger.info('Completed stack synthesis');
  }
}
