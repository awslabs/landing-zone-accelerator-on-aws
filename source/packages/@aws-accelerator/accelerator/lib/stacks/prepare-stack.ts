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
import { Construct } from 'constructs';
import * as fs from 'fs';
import path from 'path';

import {
  Account,
  CreateControlTowerAccounts,
  CreateOrganizationAccounts,
  GetPortfolioId,
  MoveAccounts,
  OrganizationalUnits,
} from '@aws-accelerator/constructs';

import { LoadAcceleratorConfigTable } from '../load-config-table';
import { ValidateEnvironmentConfig } from '../validate-environment-config';
import { AcceleratorStack, AcceleratorStackProps, NagSuppressionRuleIds } from './accelerator-stack';
import {
  AccountsConfig,
  OrganizationConfig,
  ReplacementsConfig,
  ServiceControlPolicyConfig,
} from '@aws-accelerator/config';

type scpTargetType = 'ou' | 'account';

/**
 * Service Control Policy Type
 */
type serviceControlPolicyType = {
  name: string;
  targetType: scpTargetType;
  strategy: string;
  targets: { name: string; id: string }[];
};
export class PrepareStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    let organizationAccounts: CreateOrganizationAccounts | undefined;
    let controlTowerAccounts: CreateControlTowerAccounts | undefined;

    if (
      cdk.Stack.of(this).region === props.globalConfig.homeRegion &&
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId()
    ) {
      this.logger.info(`homeRegion: ${props.globalConfig.homeRegion}`);
      this.ssmParameters.push({
        logicalId: 'Parameter',
        parameterName: `${props.prefixes.ssmParamName}/prepare-stack/validate`,
        stringValue: 'value',
      });

      //
      // Create Management Account Key
      //
      const managementAccountKey = this.createManagementKey(props);

      //
      // Create Management Account CloudWatch Key
      //
      const cloudwatchKey = this.createManagementAccountCloudWatchKey();

      //
      // Create Management Account Lambda Key
      //
      const lambdaKey = this.createManagementAccountLambdaKey();

      const commitId = props.configCommitId || '';

      // Make assets from the configuration directory
      this.logger.info(`Configuration assets creation`);
      const accountConfigAsset = new cdk.aws_s3_assets.Asset(this, 'AccountConfigAsset', {
        path: path.join(props.configDirPath, AccountsConfig.FILENAME),
      });
      const organizationsConfigAsset = new cdk.aws_s3_assets.Asset(this, 'OrganizationConfigAsset', {
        path: path.join(props.configDirPath, OrganizationConfig.FILENAME),
      });
      let replacementsConfigAsset = undefined;
      if (fs.existsSync(path.join(props.configDirPath, ReplacementsConfig.FILENAME))) {
        replacementsConfigAsset = new cdk.aws_s3_assets.Asset(this, 'ReplacementsConfigAsset', {
          path: path.join(props.configDirPath, ReplacementsConfig.FILENAME),
        });
      }

      const driftDetectedParameter = new cdk.aws_ssm.StringParameter(this, 'AcceleratorControlTowerDriftParameter', {
        parameterName: this.acceleratorResourceNames.parameters.controlTowerDriftDetection,
        stringValue: 'false',
        allowedPattern: '^(true|false)$',
      });

      const driftMessageParameter = new cdk.aws_ssm.StringParameter(
        this,
        'AcceleratorControlTowerDriftMessageParameter',
        {
          parameterName: this.acceleratorResourceNames.parameters.controlTowerLastDriftMessage,
          stringValue: 'none',
        },
      );

      if (props.organizationConfig.enable) {
        const configTable = new cdk.aws_dynamodb.Table(this, 'AcceleratorConfigTable', {
          partitionKey: { name: 'dataType', type: cdk.aws_dynamodb.AttributeType.STRING },
          sortKey: { name: 'acceleratorKey', type: cdk.aws_dynamodb.AttributeType.STRING },
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
          encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
          encryptionKey: managementAccountKey,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          pointInTimeRecovery: true,
        });

        configTable.addLocalSecondaryIndex({
          indexName: 'awsResourceKeys',
          sortKey: { name: 'awsKey', type: cdk.aws_dynamodb.AttributeType.STRING },
          projectionType: cdk.aws_dynamodb.ProjectionType.KEYS_ONLY,
        });

        // AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.DDB3,
          details: [
            {
              path: `${this.stackName}/AcceleratorConfigTable/Resource`,
              reason:
                'AcceleratorConfigTable DynamoDB table do not need point in time recovery, data can be re-created',
            },
          ],
        });

        new cdk.aws_ssm.StringParameter(this, 'ConfigTableArnParameter', {
          parameterName: this.acceleratorResourceNames.parameters.configTableArn,
          stringValue: configTable.tableArn,
        });

        new cdk.aws_ssm.StringParameter(this, 'ConfigTableNameParameter', {
          parameterName: this.acceleratorResourceNames.parameters.configTableName,
          stringValue: configTable.tableName,
        });

        new cdk.aws_iam.Role(this, 'AcceleratorMoveAccountRole', {
          roleName: this.acceleratorResourceNames.roles.moveAccountConfig,
          assumedBy: new cdk.aws_iam.AccountPrincipal(cdk.Stack.of(this).account),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                  resources: [
                    `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.prefixes.ssmParamName}/prepare-stack/configTable/*`,
                  ],
                }),
              ],
            }),
          },
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/AcceleratorMoveAccountRole/Resource`,
              reason: 'CDK generated role',
            },
          ],
        });

        this.logger.info(`Load Config Table`);
        const loadAcceleratorConfigTable = new LoadAcceleratorConfigTable(this, 'LoadAcceleratorConfigTable', {
          acceleratorConfigTable: configTable,
          configRepositoryName: props.configRepositoryName,
          managementAccountEmail: props.accountsConfig.getManagementAccount().email,
          auditAccountEmail: props.accountsConfig.getAuditAccount().email,
          logArchiveAccountEmail: props.accountsConfig.getLogArchiveAccount().email,
          configS3Bucket: organizationsConfigAsset.s3BucketName,
          organizationsConfigS3Key: organizationsConfigAsset.s3ObjectKey,
          accountConfigS3Key: accountConfigAsset.s3ObjectKey,
          replacementsConfigS3Key: replacementsConfigAsset?.s3ObjectKey,
          commitId,
          partition: props.partition,
          region: cdk.Stack.of(this).region,
          managementAccountId: props.accountsConfig.getManagementAccountId(),
          stackName: cdk.Stack.of(this).stackName,
          kmsKey: cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          enableSingleAccountMode: props.enableSingleAccountMode,
          isOrgsEnabled: props.organizationConfig.enable,
        });

        this.logger.info(`Call create ou construct`);
        const createOrganizationalUnits = new OrganizationalUnits(this, 'CreateOrganizationalUnits', {
          acceleratorConfigTable: configTable,
          commitId,
          controlTowerEnabled: props.globalConfig.controlTower.enable,
          organizationsEnabled: props.organizationConfig.enable,
          kmsKey: cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        createOrganizationalUnits.node.addDependency(loadAcceleratorConfigTable);

        // Invite Accounts to Organization (GovCloud)
        this.logger.info(`Invite Accounts To OU`);
        const inviteAccountsToOu = new Account(this, 'InviteAccountsToOu', {
          acceleratorConfigTable: configTable,
          commitId,
          assumeRoleName: props.globalConfig.managementAccountAccessRole,
          kmsKey: cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
        inviteAccountsToOu.node.addDependency(createOrganizationalUnits);

        // Move accounts to OU based on config
        this.logger.info(`Move Accounts To OU`);
        const moveAccounts = new MoveAccounts(this, 'MoveAccounts', {
          globalRegion: props.globalRegion,
          configTable: configTable,
          commitId,
          managementAccountId: props.accountsConfig.getManagementAccountId(),
          lambdaKmsKey: lambdaKey,
          cloudWatchLogsKmsKey: cloudwatchKey,
          cloudWatchLogRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          controlTower: props.globalConfig.controlTower.enable,
        });
        moveAccounts.node.addDependency(inviteAccountsToOu);
        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM4,
          details: [
            {
              path: `${this.stackName}/MoveAccounts/MoveAccountsFunction/ServiceRole/Resource`,
              reason: 'Custom resource lambda require access to other services',
            },
          ],
        });

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM4,
          details: [
            {
              path: `${this.stackName}/MoveAccounts/MoveAccountsProvider/framework-onEvent/ServiceRole/Resource`,
              reason: 'Custom resource lambda require access to other services',
            },
          ],
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/MoveAccounts/MoveAccountsFunction/ServiceRole/DefaultPolicy/Resource`,
              reason: 'Custom resource lambda require access to other services',
            },
          ],
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/MoveAccounts/MoveAccountsProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
              reason: 'Custom resource lambda require access to other services',
            },
          ],
        });

        //
        // Create Account Management Configuration DynamoDB tables
        this.createConfigurationTables({
          props,
          configTable,
          loadAcceleratorConfigTable,
          organizationAccounts,
          controlTowerAccounts,
          driftDetectedParameter,
          driftMessageParameter,
          moveAccounts,
          managementAccountKey,
          cloudwatchKey,
        });
      }
    }
    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();

    this.logger.info('Completed stack synthesis');
  }

  private createConfigurationTables(options: {
    props: AcceleratorStackProps;
    configTable: cdk.aws_dynamodb.Table;
    loadAcceleratorConfigTable: LoadAcceleratorConfigTable;
    organizationAccounts?: CreateOrganizationAccounts;
    controlTowerAccounts?: CreateControlTowerAccounts;
    driftDetectedParameter: cdk.aws_ssm.StringParameter;
    driftMessageParameter: cdk.aws_ssm.StringParameter;
    moveAccounts: MoveAccounts;
    managementAccountKey: cdk.aws_kms.IKey;
    cloudwatchKey?: cdk.aws_kms.IKey;
  }) {
    this.logger.info(`Tables`);
    if (
      options.props.partition === 'aws' ||
      options.props.partition === 'aws-us-gov' ||
      options.props.partition === 'aws-cn'
    ) {
      this.logger.info(`Create mapping table`);
      let govCloudAccountMappingTable: cdk.aws_dynamodb.ITable | undefined;
      this.logger.info(`newOrgAccountsTable`);
      const newOrgAccountsTable = new cdk.aws_dynamodb.Table(this, 'NewOrgAccounts', {
        partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
        billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: options.managementAccountKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        pointInTimeRecovery: true,
      });

      // AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.DDB3,
        details: [
          {
            path: `${this.stackName}/NewOrgAccounts/Resource`,
            reason: 'NewOrgAccounts DynamoDB table do not need point in time recovery, data can be re-created',
          },
        ],
      });

      this.logger.info(`newControlTowerAccountsTable`);
      const newCTAccountsTable = new cdk.aws_dynamodb.Table(this, 'NewCTAccounts', {
        partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
        billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
        encryptionKey: options.managementAccountKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        pointInTimeRecovery: true,
      });

      // AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.DDB3,
        details: [
          {
            path: `${this.stackName}/NewCTAccounts/Resource`,
            reason: 'NewCTAccounts DynamoDB table do not need point in time recovery, data can be re-created',
          },
        ],
      });

      this.logger.info(`Table Parameter`);
      this.ssmParameters.push({
        logicalId: 'NewCTAccountsTableNameParameter',
        parameterName: `${options.props.prefixes.ssmParamName}/prepare-stack/NewCTAccountsTableName`,
        stringValue: newCTAccountsTable.tableName,
      });

      if (options.props.partition === 'aws' && options.props.accountsConfig.anyGovCloudAccounts()) {
        this.logger.info(`Create GovCloudAccountsMappingTable`);
        govCloudAccountMappingTable = new cdk.aws_dynamodb.Table(this, 'govCloudAccountMapping', {
          partitionKey: { name: 'commercialAccountId', type: cdk.aws_dynamodb.AttributeType.STRING },
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
          encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
          encryptionKey: options.managementAccountKey,
          pointInTimeRecovery: true,
        });

        this.ssmParameters.push({
          logicalId: 'GovCloudAccountMappingTableNameParameter',
          parameterName: `${options.props.prefixes.ssmParamName}/prepare-stack/govCloudAccountMappingTableName`,
          stringValue: govCloudAccountMappingTable.tableName,
        });
      }

      this.ssmParameters.push({
        logicalId: 'NewOrgAccountsTableNameParameter',
        parameterName: `${options.props.prefixes.ssmParamName}/prepare-stack/NewOrgAccountsTableName`,
        stringValue: newOrgAccountsTable.tableName,
      });

      this.logger.info(`Validate Environment`);
      const validation = new ValidateEnvironmentConfig(this, 'ValidateEnvironmentConfig', {
        acceleratorConfigTable: options.configTable,
        newOrgAccountsTable: newOrgAccountsTable,
        newCTAccountsTable: newCTAccountsTable,
        controlTowerEnabled: options.props.globalConfig.controlTower.enable,
        organizationsEnabled: options.props.organizationConfig.enable,
        commitId: options.loadAcceleratorConfigTable.id,
        stackName: cdk.Stack.of(this).stackName,
        region: cdk.Stack.of(this).region,
        managementAccountId: options.props.accountsConfig.getManagementAccountId(),
        partition: options.props.partition,
        kmsKey: options.cloudwatchKey,
        serviceControlPolicies: this.createScpListsForValidation(),
        policyTagKey: `${options.props.prefixes.accelerator}Managed`,
        logRetentionInDays: options.props.globalConfig.cloudwatchLogRetentionInDays,
        driftDetectionParameter: options.driftDetectedParameter,
        driftDetectionMessageParameter: options.driftMessageParameter,
      });

      validation.node.addDependency(options.moveAccounts);

      this.logger.info(`Create new organization accounts`);
      options.organizationAccounts = new CreateOrganizationAccounts(this, 'CreateOrganizationAccounts', {
        newOrgAccountsTable: newOrgAccountsTable,
        govCloudAccountMappingTable: govCloudAccountMappingTable,
        accountRoleName: options.props.globalConfig.managementAccountAccessRole,
        kmsKey: options.cloudwatchKey,
        logRetentionInDays: options.props.globalConfig.cloudwatchLogRetentionInDays,
      });
      options.organizationAccounts.node.addDependency(validation);

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
      this.createNagSuppressionsInputs(NagSuppressionRuleIds.IAM4, orgAccountsIam4SuppressionPaths);

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
      this.createNagSuppressionsInputs(NagSuppressionRuleIds.IAM5, orgAccountsIam5SuppressionPaths);

      if (options.props.globalConfig.controlTower.enable) {
        // Allow security/audit account access
        options.managementAccountKey.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'auditAccount',
            principals: [new cdk.aws_iam.AccountPrincipal(options.props.accountsConfig.getAuditAccountId())],
            actions: ['kms:GenerateDataKey', 'kms:Encrypt', 'kms:Decrypt', 'kms:DescribeKey'],
            resources: ['*'],
          }),
        );

        this.logger.info(`Get Portfolio Id`);
        const portfolioResults = new GetPortfolioId(this, 'GetPortFolioId', {
          displayName: 'AWS Control Tower Account Factory Portfolio',
          providerName: 'AWS Control Tower',
          kmsKey: options.cloudwatchKey,
          logRetentionInDays: options.props.globalConfig.cloudwatchLogRetentionInDays,
        });
        this.logger.info(`Create new control tower accounts`);
        options.controlTowerAccounts = new CreateControlTowerAccounts(this, 'CreateCTAccounts', {
          table: newCTAccountsTable,
          portfolioId: portfolioResults.portfolioId,
          kmsKey: options.cloudwatchKey,
          logRetentionInDays: options.props.globalConfig.cloudwatchLogRetentionInDays,
        });
        options.controlTowerAccounts.node.addDependency(validation);
        options.controlTowerAccounts.node.addDependency(options.organizationAccounts);

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
        this.createNagSuppressionsInputs(NagSuppressionRuleIds.IAM4, ctAccountsIam4SuppressionPaths);

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
        this.createNagSuppressionsInputs(NagSuppressionRuleIds.IAM5, ctAccountsIam5SuppressionPaths);

        // resources for control tower lifecycle events
        const controlTowerOuEventsFunction = new cdk.aws_lambda.Function(this, 'ControlTowerOuEventsFunction', {
          code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/control-tower-ou-events/dist')),
          runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
          handler: 'index.handler',
          description: 'Lambda function to process ControlTower OU events from CloudTrail',
          timeout: cdk.Duration.minutes(5),
          environment: {
            CONFIG_TABLE_NAME: options.configTable.tableName,
          },
        });

        controlTowerOuEventsFunction.addToRolePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'dynamodb',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['dynamodb:UpdateItem', 'dynamodb:PutItem'],
            resources: [options.configTable.tableArn],
          }),
        );

        controlTowerOuEventsFunction.addToRolePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'organizations',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['organizations:DescribeOrganizationalUnit', 'organizations:ListParents'],
            resources: [
              `arn:${
                cdk.Stack.of(this).partition
              }:organizations::${options.props.accountsConfig.getManagementAccountId()}:account/o-*/*`,
            ],
          }),
        );

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/ControlTowerOuEventsFunction/ServiceRole/DefaultPolicy/Resource`,
              reason: 'Requires access to all org units.',
            },
          ],
        });

        new cdk.aws_logs.LogGroup(this, `${controlTowerOuEventsFunction.node.id}LogGroup`, {
          logGroupName: `/aws/lambda/${controlTowerOuEventsFunction.functionName}`,
          retention: options.props.globalConfig.cloudwatchLogRetentionInDays,
          encryptionKey: options.cloudwatchKey,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM4,
          details: [
            {
              path: `${this.stackName}/ControlTowerOuEventsFunction/ServiceRole/Resource`,
              reason: 'AWS Basic Lambda execution permissions.',
            },
          ],
        });

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

        const controlTowerNotificationTopic = new cdk.aws_sns.Topic(this, 'ControlTowerNotification', {
          //Check this if it causes any issue changing topic name
          topicName: `${options.props.prefixes.accelerator}-ControlTowerNotification`,
          displayName: 'ForwardedControlTowerNotifications',
          masterKey: options.managementAccountKey,
        });

        controlTowerNotificationTopic.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'auditAccount',
            principals: [new cdk.aws_iam.AccountPrincipal(options.props.accountsConfig.getAuditAccountId())],
            actions: ['sns:Publish'],
            resources: [controlTowerNotificationTopic.topicArn],
          }),
        );

        // function to process control tower notifications
        const controlTowerNotificationsFunction = new cdk.aws_lambda.Function(
          this,
          'ControlTowerNotificationsFunction',
          {
            code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/control-tower-notifications/dist')),
            runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
            handler: 'index.handler',
            description: 'Lambda function to process ControlTower notifications from audit account',
            timeout: cdk.Duration.minutes(5),
            environment: {
              DRIFT_PARAMETER_NAME: options.driftDetectedParameter.parameterName,
              DRIFT_MESSAGE_PARAMETER_NAME: options.driftMessageParameter.parameterName,
            },
          },
        );

        new cdk.aws_logs.LogGroup(this, `${controlTowerNotificationsFunction.node.id}LogGroup`, {
          logGroupName: `/aws/lambda/${controlTowerNotificationsFunction.functionName}`,
          retention: options.props.globalConfig.cloudwatchLogRetentionInDays,
          encryptionKey: options.cloudwatchKey,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        controlTowerNotificationsFunction.addEventSource(new SnsEventSource(controlTowerNotificationTopic));
        controlTowerNotificationsFunction.addToRolePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'ssm',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['ssm:PutParameter'],
            resources: [options.driftDetectedParameter.parameterArn, options.driftMessageParameter.parameterArn],
          }),
        );

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM4,
          details: [
            {
              path: `${this.stackName}/ControlTowerNotificationsFunction/ServiceRole/Resource`,
              reason: 'AWS Basic Lambda execution permissions.',
            },
          ],
        });
      }
    }
  }

  /**
   * Create Management Key
   * @param props
   * @returns key {@link cdk.aws_kms.IKey}
   */
  private createManagementKey(props: AcceleratorStackProps): cdk.aws_kms.IKey {
    this.logger.info(`Creating Management Encryption Key`);
    const key = new cdk.aws_kms.Key(this, 'ManagementKey', {
      alias: this.acceleratorResourceNames.customerManagedKeys.managementKey.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.managementKey.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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
              `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${
                props.prefixes.accelerator
              }-*`,
            ],
          },
        },
      }),
    );

    // Allow Cloudwatch logs to use the encryption key
    key.addToResourcePolicy(
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

    // Allow sns to use the encryption key
    key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'sns',
        principals: [new cdk.aws_iam.ServicePrincipal('sns.amazonaws.com')],
        actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
        resources: ['*'],
      }),
    );

    this.ssmParameters.push({
      logicalId: 'AcceleratorManagementKmsArnParameter',
      parameterName: `${props.prefixes.ssmParamName}/management/kms/key-arn`,
      stringValue: key.keyArn,
    });

    return key;
  }

  /**
   * Create Management account CloudWatch key
   * @returns cloudwatchKey {@link cdk.aws_kms.Key}
   */
  private createManagementAccountCloudWatchKey(): cdk.aws_kms.IKey | undefined {
    if (!this.isCloudWatchLogsGroupCMKEnabled) {
      this.logger.info(`CloudWatch Encryption CMK disable for Management account home region, CMK creation excluded`);
      return undefined;
    }
    this.logger.info(`CloudWatch Encryption Key`);
    const cloudwatchKey = new cdk.aws_kms.Key(this, 'AcceleratorManagementCloudWatchKey', {
      alias: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Allow Cloudwatch logs to use the encryption key
    cloudwatchKey.addToResourcePolicy(
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
      stringValue: cloudwatchKey.keyArn,
    });

    return cloudwatchKey;
  }

  /**
   * Create Management Account Lambda key
   * @returns lambdaKey {@link cdk.aws_kms.Key}
   */
  private createManagementAccountLambdaKey(): cdk.aws_kms.IKey | undefined {
    if (!this.isLambdaCMKEnabled) {
      this.logger.info(`Lambda Encryption CMK disable for Management account home region, CMK creation excluded`);
      return undefined;
    }
    this.logger.info(`Lambda Encryption Key`);
    const lambdaKey = new cdk.aws_kms.Key(this, 'AcceleratorManagementLambdaKey', {
      alias: this.acceleratorResourceNames.customerManagedKeys.lambda.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.lambda.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.ssmParameters.push({
      logicalId: 'AcceleratorLambdaKmsArnParameter',
      parameterName: this.acceleratorResourceNames.parameters.lambdaCmkArn,
      stringValue: lambdaKey.keyArn,
    });

    return lambdaKey;
  }

  /**
   * Create NagSuppressions inputs
   * @param inputs
   */
  private createNagSuppressionsInputs(type: NagSuppressionRuleIds, inputs: string[]) {
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    for (const input of inputs) {
      this.nagSuppressionInputs.push({
        id: type,
        details: [
          {
            path: `${this.stackName}/${input}`,
            reason: 'AWS Custom resource provider role created by cdk.',
          },
        ],
      });
    }
  }

  /**
   * Function to create Service Control Policy list SCP with target organizationalUnits
   * @param scpItem {@link ServiceControlPolicyConfig}
   * @param serviceControlPolicies {@link serviceControlPolicyType}[]
   */
  private createOrganizationalUnitsScpLists(
    scpItem: ServiceControlPolicyConfig,
    serviceControlPolicies: serviceControlPolicyType[],
  ) {
    if (scpItem.deploymentTargets.organizationalUnits && scpItem.deploymentTargets.organizationalUnits.length > 0) {
      const targets: { name: string; id: string }[] = [];
      scpItem.deploymentTargets.organizationalUnits.forEach(item =>
        targets.push({ name: item, id: this.props.organizationConfig.getOrganizationalUnitId(item) }),
      );

      if (targets.length > 0) {
        const strategy: string = scpItem.strategy ? scpItem.strategy : 'deny-list';
        serviceControlPolicies.push({
          name: scpItem.name,
          targetType: 'ou',
          strategy,
          targets,
        });
      }
    }
  }

  /**
   * Function to create Service Control Policy list SCP with target accounts
   * @param scpItem {@link ServiceControlPolicyConfig}
   * @param serviceControlPolicies {@link serviceControlPolicyType}[]
   */
  private createAccountsScpLists(
    scpItem: ServiceControlPolicyConfig,
    serviceControlPolicies: serviceControlPolicyType[],
  ) {
    if (scpItem.deploymentTargets.accounts && scpItem.deploymentTargets.accounts.length > 0) {
      const targets: { name: string; id: string }[] = [];

      scpItem.deploymentTargets.accounts.forEach(item => {
        try {
          targets.push({ name: item, id: this.props.accountsConfig.getAccountId(item) });
        } catch {
          this.logger.warn(`Account ID not found for ${item}. Scp count validation skipped for the account ${item}.`);
        }
      });

      if (targets.length > 0) {
        const strategy: string = scpItem.strategy ? scpItem.strategy : 'deny-list';
        serviceControlPolicies.push({
          name: scpItem.name,
          targetType: 'account',
          strategy,
          targets,
        });
      }
    }
  }

  private createScpListsForValidation(): {
    name: string;
    targetType: scpTargetType;
    targets: { name: string; id: string }[];
  }[] {
    const serviceControlPolicies: serviceControlPolicyType[] = [];

    for (const scpItem of this.props.organizationConfig.serviceControlPolicies) {
      // Create SCP list with target as OrganizationUnits
      this.createOrganizationalUnitsScpLists(scpItem, serviceControlPolicies);

      // Create SCP list with target as accounts
      this.createAccountsScpLists(scpItem, serviceControlPolicies);
    }
    return serviceControlPolicies;
  }
}
