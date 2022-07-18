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
import { SnsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import path from 'path';

import {
  Account,
  CreateControlTowerAccounts,
  CreateOrganizationAccounts,
  GetPortfolioId,
  OrganizationalUnits,
} from '@aws-accelerator/constructs';

import { LoadAcceleratorConfigTable } from '../load-config-table';
import { Logger } from '../logger';
import { ValidateEnvironmentConfig } from '../validate-environment-config';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class PrepareStack extends AcceleratorStack {
  public static readonly MANAGEMENT_KEY_ARN_PARAMETER_NAME = '/accelerator/management/kms/key-arn';

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    if (
      cdk.Stack.of(this).region === props.globalConfig.homeRegion &&
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId()
    ) {
      Logger.debug(`[prepare-stack] homeRegion: ${props.globalConfig.homeRegion}`);
      new cdk.aws_ssm.StringParameter(this, 'Parameter', {
        parameterName: `/accelerator/prepare-stack/validate`,
        stringValue: 'value',
      });

      const key = new cdk.aws_kms.Key(this, 'ManagementKey', {
        alias: 'alias/accelerator/management/kms/key',
        description: 'AWS Accelerator Management Account Kms Key',
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      // Make assets from the configuration directory
      Logger.debug(`[prepare-stack] Configuration assets creation`);
      const accountConfigAsset = new cdk.aws_s3_assets.Asset(this, 'AccountConfigAsset', {
        path: path.join(props.configDirPath, 'accounts-config.yaml'),
      });
      const organzationsConfigAsset = new cdk.aws_s3_assets.Asset(this, 'OrganizationConfigAsset', {
        path: path.join(props.configDirPath, 'organization-config.yaml'),
      });

      // Allow Accelerator Role to use the encryption key
      key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Accelerator Role in this account to use the encryption key`,
          principals: [new cdk.aws_iam.AnyPrincipal()],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'aws:PrincipalARN': [
                `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/AWSAccelerator-*`,
              ],
            },
          },
        }),
      );

      // Allow Cloudwatch logs to use the encryption key
      key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Cloudwatch logs to use the encryption key`,
          principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
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

      // Allow sns to use the encryption key
      key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'sns',
          principals: [new cdk.aws_iam.ServicePrincipal('sns.amazonaws.com')],
          actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
          resources: ['*'],
        }),
      );

      // Allow security/audit account access
      key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'auditAccount',
          principals: [new cdk.aws_iam.AccountPrincipal(props.accountsConfig.getAuditAccountId())],
          actions: ['kms:GenerateDataKey', 'kms:Encrypt', 'kms:Decrypt', 'kms:DescribeKey'],
          resources: ['*'],
        }),
      );

      new cdk.aws_ssm.StringParameter(this, 'AcceleratorManagementKmsArnParameter', {
        parameterName: PrepareStack.MANAGEMENT_KEY_ARN_PARAMETER_NAME,
        stringValue: key.keyArn,
      });

      const driftDetectedParameter = new cdk.aws_ssm.StringParameter(this, 'AcceleratorControlTowerDriftParameter', {
        parameterName: '/accelerator/controltower/driftDetected',
        stringValue: 'false',
        allowedPattern: '^(true|false)$',
      });

      const driftMessageParameter = new cdk.aws_ssm.StringParameter(
        this,
        'AcceleratorControlTowerDriftMessageParameter',
        {
          parameterName: '/accelerator/controltower/lastDriftMessage',
          stringValue: 'none',
        },
      );

      const configTable = new cdk.aws_dynamodb.Table(this, 'AcceleratorConfigTable', {
        partitionKey: { name: 'dataType', type: cdk.aws_dynamodb.AttributeType.STRING },
        sortKey: { name: 'acceleratorKey', type: cdk.aws_dynamodb.AttributeType.STRING },
        billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: key,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        pointInTimeRecovery: true,
      });

      configTable.addLocalSecondaryIndex({
        indexName: 'awsResourceKeys',
        sortKey: { name: 'awsKey', type: cdk.aws_dynamodb.AttributeType.STRING },
        projectionType: cdk.aws_dynamodb.ProjectionType.KEYS_ONLY,
      });

      // AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/AcceleratorConfigTable/Resource`, [
        {
          id: 'AwsSolutions-DDB3',
          reason: 'AcceleratorConfigTable DynamoDB table do not need point in time recovery, data can be re-created',
        },
      ]);

      Logger.info(`[prepare-stack] Load Config Table`);
      const configRepoName = props.qualifier ? `${props.qualifier}-config` : 'aws-accelerator-config';
      const loadAcceleratorConfigTable = new LoadAcceleratorConfigTable(this, 'LoadAcceleratorConfigTable', {
        acceleratorConfigTable: configTable,
        configRepositoryName: configRepoName,
        managementAccountEmail: props.accountsConfig.getManagementAccount().email,
        auditAccountEmail: props.accountsConfig.getAuditAccount().email,
        logArchiveAccountEmail: props.accountsConfig.getLogArchiveAccount().email,
        configS3Bucket: organzationsConfigAsset.s3BucketName,
        organizationsConfigS3Key: organzationsConfigAsset.s3ObjectKey,
        accountConfigS3Key: accountConfigAsset.s3ObjectKey,
        commitId: props.configCommitId || '',
        partition: props.partition,
        region: cdk.Stack.of(this).region,
        managementAccountId: props.accountsConfig.getManagementAccountId(),
        stackName: cdk.Stack.of(this).stackName,
        kmsKey: key,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });

      Logger.info(`[prepare-stack] Call create ou construct`);
      const createOrganizationalUnits = new OrganizationalUnits(this, 'CreateOrganizationalUnits', {
        acceleratorConfigTable: configTable,
        commitId: props.configCommitId || '',
        controlTowerEnabled: props.globalConfig.controlTower.enable,
        organizationsEnabled: props.organizationConfig.enable,
        kmsKey: key,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });

      createOrganizationalUnits.node.addDependency(configTable);
      createOrganizationalUnits.node.addDependency(loadAcceleratorConfigTable);

      // Invite Accounts to Organization (GovCloud)
      const inviteAccountsToOu = new Account(this, 'InviteAccountsToOu', {
        acceleratorConfigTable: configTable,
        commitId: props.configCommitId || '',
        assumeRoleName: props.globalConfig.managementAccountAccessRole,
        kmsKey: key,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
      inviteAccountsToOu.node.addDependency(loadAcceleratorConfigTable);
      inviteAccountsToOu.node.addDependency(createOrganizationalUnits);

      if (props.partition == 'aws') {
        let govCloudAccountMappingTable: cdk.aws_dynamodb.ITable | undefined;
        Logger.info(`[prepare-stack] newOrgAccountsTable`);
        const newOrgAccountsTable = new cdk.aws_dynamodb.Table(this, 'NewOrgAccounts', {
          partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
          encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
          encryptionKey: key,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          pointInTimeRecovery: true,
        });

        // AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
        NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/NewOrgAccounts/Resource`, [
          {
            id: 'AwsSolutions-DDB3',
            reason: 'NewOrgAccounts DynamoDB table do not need point in time recovery, data can be re-created',
          },
        ]);

        Logger.info(`[prepare-stack] newControlTowerAccountsTable`);
        const newCTAccountsTable = new cdk.aws_dynamodb.Table(this, 'NewCTAccounts', {
          partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
          encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
          encryptionKey: key,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          pointInTimeRecovery: true,
        });

        // AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
        NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/NewCTAccounts/Resource`, [
          {
            id: 'AwsSolutions-DDB3',
            reason: 'NewCTAccounts DynamoDB table do not need point in time recovery, data can be re-created',
          },
        ]);

        new cdk.aws_ssm.StringParameter(this, 'NewCTAccountsTableNameParameter', {
          parameterName: `/accelerator/prepare-stack/NewCTAccountsTableName`,
          stringValue: newCTAccountsTable.tableName,
        });

        if (props.accountsConfig.anyGovCloudAccounts()) {
          Logger.info(`[prepare-stack] Create GovCloudAccountsMappingTable`);
          govCloudAccountMappingTable = new cdk.aws_dynamodb.Table(this, 'govCloudAccountMapping', {
            partitionKey: { name: 'commercialAccountId', type: cdk.aws_dynamodb.AttributeType.STRING },
            billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryptionKey: key,
            pointInTimeRecovery: true,
          });

          new cdk.aws_ssm.StringParameter(this, 'GovCloudAccountMappingTableNameParameter', {
            parameterName: `/accelerator/prepare-stack/govCloudAccountMappingTableName`,
            stringValue: govCloudAccountMappingTable.tableName,
          });
        }

        new cdk.aws_ssm.StringParameter(this, 'NewOrgAccountsTableNameParameter', {
          parameterName: `/accelerator/prepare-stack/NewOrgAccountsTableName`,
          stringValue: newOrgAccountsTable.tableName,
        });

        Logger.info(`[prepare-stack] Validate Environment`);
        const validation = new ValidateEnvironmentConfig(this, 'ValidateEnvironmentConfig', {
          acceleratorConfigTable: configTable,
          newOrgAccountsTable: newOrgAccountsTable,
          newCTAccountsTable: newCTAccountsTable,
          controlTowerEnabled: props.globalConfig.controlTower.enable,
          commitId: loadAcceleratorConfigTable.id,
          stackName: cdk.Stack.of(this).stackName,
          region: cdk.Stack.of(this).region,
          managementAccountId: props.accountsConfig.getManagementAccountId(),
          partition: props.partition,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          driftDetectionParameter: driftDetectedParameter,
          driftDetectionMessageParameter: driftMessageParameter,
        });

        validation.node.addDependency(loadAcceleratorConfigTable);
        validation.node.addDependency(createOrganizationalUnits);
        validation.node.addDependency(inviteAccountsToOu);

        Logger.info(`[prepare-stack] Create new organization accounts`);
        const organizationAccounts = new CreateOrganizationAccounts(this, 'CreateOrganizationAccounts', {
          newOrgAccountsTable: newOrgAccountsTable,
          govCloudAccountMappingTable: govCloudAccountMappingTable,
          accountRoleName: props.globalConfig.managementAccountAccessRole,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
        organizationAccounts.node.addDependency(validation);

        // cdk-nag suppressions
        const orgAccountsIam4SuppressionPaths = [
          'CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-onEvent/ServiceRole/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-onTimeout/ServiceRole/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-isComplete/ServiceRole/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccounts/ServiceRole/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccountStatus/ServiceRole/Resource',
        ];

        const orgAccountsIam5SuppressionPaths = [
          'CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-isComplete/ServiceRole/DefaultPolicy/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-onTimeout/ServiceRole/DefaultPolicy/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccountStatus/ServiceRole/DefaultPolicy/Resource',
          'CreateOrganizationAccounts/CreateOrganizationAccountsProvider/waiter-state-machine/Role/DefaultPolicy/Resource',
        ];

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        for (const orgAccountsIam4SuppressionPath of orgAccountsIam4SuppressionPaths) {
          NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${orgAccountsIam4SuppressionPath}`, [
            { id: 'AwsSolutions-IAM4', reason: 'AWS Custom resource provider role created by cdk.' },
          ]);
        }

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
        for (const orgAccountsIam5SuppressionPath of orgAccountsIam5SuppressionPaths) {
          NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${orgAccountsIam5SuppressionPath}`, [
            { id: 'AwsSolutions-IAM5', reason: 'AWS Custom resource provider role created by cdk.' },
          ]);
        }

        if (props.globalConfig.controlTower.enable) {
          Logger.info(`[prepare-stack] Get Portfolio Id`);
          const portfolioResults = new GetPortfolioId(this, 'GetPortFolioId', {
            displayName: 'AWS Control Tower Account Factory Portfolio',
            providerName: 'AWS Control Tower',
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });
          Logger.info(`[prepare-stack] Create new control tower accounts`);
          const controlTowerAccounts = new CreateControlTowerAccounts(this, 'CreateCTAccounts', {
            table: newCTAccountsTable,
            portfolioId: portfolioResults.portfolioId,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });
          controlTowerAccounts.node.addDependency(validation);
          controlTowerAccounts.node.addDependency(organizationAccounts);

          // cdk-nag suppressions
          const ctAccountsIam4SuppressionPaths = [
            'CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-onTimeout/ServiceRole/Resource',
            'CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-isComplete/ServiceRole/Resource',
            'CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-onEvent/ServiceRole/Resource',
            'CreateCTAccounts/CreateControlTowerAccountStatus/ServiceRole/Resource',
            'CreateCTAccounts/CreateControlTowerAccount/ServiceRole/Resource',
          ];

          const ctAccountsIam5SuppressionPaths = [
            'CreateCTAccounts/CreateControlTowerAccountStatus/ServiceRole/DefaultPolicy/Resource',
            'CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource',
            'CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-isComplete/ServiceRole/DefaultPolicy/Resource',
            'CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-onTimeout/ServiceRole/DefaultPolicy/Resource',
            'CreateCTAccounts/CreateControlTowerAcccountsProvider/waiter-state-machine/Role/DefaultPolicy/Resource',
          ];

          // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
          for (const ctAccountsIam4SuppressionPath of ctAccountsIam4SuppressionPaths) {
            NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${ctAccountsIam4SuppressionPath}`, [
              { id: 'AwsSolutions-IAM4', reason: 'AWS Custom resource provider role created by cdk.' },
            ]);
          }

          // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
          for (const ctAccountsIam5SuppressionPath of ctAccountsIam5SuppressionPaths) {
            NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/${ctAccountsIam5SuppressionPath}`, [
              { id: 'AwsSolutions-IAM5', reason: 'AWS Custom resource provider role created by cdk.' },
            ]);
          }
          // resources for control tower lifecycle events
          const controlTowerOuEventsFunction = new cdk.aws_lambda.Function(this, 'ControlTowerOuEventsFunction', {
            code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/control-tower-ou-events/dist')),
            runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
            handler: 'index.handler',
            description: 'Lambda function to process ControlTower OU events from CloudTrail',
            timeout: cdk.Duration.minutes(5),
            environment: {
              CONFIG_TABLE_NAME: configTable.tableName,
            },
          });

          controlTowerOuEventsFunction.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
              sid: 'dynamodb',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['dynamodb:UpdateItem', 'dynamodb:PutItem'],
              resources: [configTable.tableArn],
            }),
          );

          controlTowerOuEventsFunction.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
              sid: 'organizations',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['organizations:DescribeOrganizationalUnit', 'organizations:ListParents'],
              resources: [`arn:aws:organizations::${props.accountsConfig.getManagementAccountId()}:account/o-*/*`],
            }),
          );

          // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/ControlTowerOuEventsFunction/ServiceRole/DefaultPolicy/Resource`,
            [
              {
                id: 'AwsSolutions-IAM5',
                reason: 'Requires access to all org units.',
              },
            ],
          );

          new cdk.aws_logs.LogGroup(this, `${controlTowerOuEventsFunction.node.id}LogGroup`, {
            logGroupName: `/aws/lambda/${controlTowerOuEventsFunction.functionName}`,
            retention: props.globalConfig.cloudwatchLogRetentionInDays,
            encryptionKey: key,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });

          // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/ControlTowerOuEventsFunction/ServiceRole/Resource`,
            [
              {
                id: 'AwsSolutions-IAM4',
                reason: 'AWS Basic Lambda execution permissions.',
              },
            ],
          );

          const controlTowerOuEventsRule = new cdk.aws_events.Rule(this, 'ControlTowerOuEventsRule', {
            description: 'Rule to monitor for Control Tower OU registration and de-registration events',
            eventPattern: {
              source: ['aws.controltower'],
              detailType: ['AWS Service Event via CloudTrail'],
              detail: {
                eventName: ['RegisterOrganizationalUnit', 'DeregisterOrganizationalUnit'],
              },
            },
          });

          controlTowerOuEventsRule.addTarget(
            new cdk.aws_events_targets.LambdaFunction(controlTowerOuEventsFunction, { retryAttempts: 3 }),
          );

          const controlTowerNofificationTopic = new cdk.aws_sns.Topic(this, 'ControlTowerNotification', {
            topicName: 'AWSAccelerator-ControlTowerNotification',
            displayName: 'ForwardedControlTowerNotifications',
            masterKey: key,
          });

          controlTowerNofificationTopic.addToResourcePolicy(
            new cdk.aws_iam.PolicyStatement({
              sid: 'auditAccount',
              principals: [new cdk.aws_iam.AccountPrincipal(props.accountsConfig.getAuditAccountId())],
              actions: ['sns:Publish'],
              resources: [controlTowerNofificationTopic.topicArn],
            }),
          );

          // function to process control tower notifications
          const controlTowerNotificationsFunction = new cdk.aws_lambda.Function(
            this,
            'ControlTowerNotificationsFunction',
            {
              code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/control-tower-notifications/dist')),
              runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
              handler: 'index.handler',
              description: 'Lambda function to process ControlTower notifications from audit account',
              timeout: cdk.Duration.minutes(5),
              environment: {
                DRIFT_PARAMETER_NAME: driftDetectedParameter.parameterName,
                DRIFT_MESSAGE_PARAMETER_NAME: driftMessageParameter.parameterName,
              },
            },
          );

          new cdk.aws_logs.LogGroup(this, `${controlTowerNotificationsFunction.node.id}LogGroup`, {
            logGroupName: `/aws/lambda/${controlTowerNotificationsFunction.functionName}`,
            retention: props.globalConfig.cloudwatchLogRetentionInDays,
            encryptionKey: key,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          });

          controlTowerNotificationsFunction.addEventSource(new SnsEventSource(controlTowerNofificationTopic));
          controlTowerNotificationsFunction.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
              sid: 'ssm',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:PutParameter'],
              resources: [driftDetectedParameter.parameterArn, driftMessageParameter.parameterArn],
            }),
          );

          // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
          NagSuppressions.addResourceSuppressionsByPath(
            this,
            `${this.stackName}/ControlTowerNotificationsFunction/ServiceRole/Resource`,
            [
              {
                id: 'AwsSolutions-IAM4',
                reason: 'AWS Basic Lambda execution permissions.',
              },
            ],
          );
        }
      }
    }

    Logger.info('[prepare-stack] Completed stack synthesis');
  }
}
