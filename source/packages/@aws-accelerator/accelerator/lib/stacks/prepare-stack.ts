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

import {
  CreateControlTowerAccounts,
  CreateOrganizationAccounts,
  GetPortfolioId,
  OrganizationalUnit,
} from '@aws-accelerator/constructs';

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

      new cdk.aws_ssm.StringParameter(this, 'AcceleratorManagementKmsArnParameter', {
        parameterName: PrepareStack.MANAGEMENT_KEY_ARN_PARAMETER_NAME,
        stringValue: key.keyArn,
      });

      if (props.organizationConfig.enable) {
        //
        // Loop through list of organizational-units in the configuration file and
        // create them.
        //
        // Note: The Accelerator will only create new Organizational Units if they
        //       do not already exist. If Organizational Units are found outside of
        //       those that are listed in the configuration file, they are ignored
        //       and left in place
        //
        const organizationalUnitList: { [key: string]: OrganizationalUnit } = {};

        for (const organizationalUnit of props.organizationConfig.organizationalUnits) {
          const name = organizationalUnit.name;

          Logger.info(`[prepare-stack] Adding organizational unit (${name}) with path (${organizationalUnit.path})`);

          // Create Organizational Unit
          organizationalUnitList[name] = new OrganizationalUnit(this, pascalCase(name), {
            name,
            path: organizationalUnit.path,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });
        }
      }

      if (props.partition == 'aws') {
        let govCloudAccountMappingTable: cdk.aws_dynamodb.ITable | undefined;
        Logger.info(`[prepare-stack] newOrgAccountsTable`);
        const newOrgAccountsTable = new cdk.aws_dynamodb.Table(this, 'NewOrgAccounts', {
          partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
          billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
          encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
          encryptionKey: key,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
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
          });

          // AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
          NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/govCloudAccountMapping/Resource`, [
            {
              id: 'AwsSolutions-DDB3',
              reason:
                'govCloudAccountMapping DynamoDB table do not need point in time recovery, data can be re-created',
            },
          ]);

          new cdk.aws_ssm.StringParameter(this, 'GovCloudAccountMappingTableNameParameter', {
            parameterName: `/accelerator/prepare-stack/govCloudAccountMappingTableName`,
            stringValue: govCloudAccountMappingTable.tableName,
          });
        }

        new cdk.aws_ssm.StringParameter(this, 'NewOrgAccountsTableNameParameter', {
          parameterName: `/accelerator/prepare-stack/NewOrgAccountsTableName`,
          stringValue: newOrgAccountsTable.tableName,
        });

        const mandatoryAccounts: {
          name: string;
          description: string;
          email: string;
          organizationalUnit: string;
          organizationalUnitId: string;
        }[] = [];

        const workloadAccounts: {
          name: string;
          description: string;
          email: string;
          enableGovCloud?: boolean;
          organizationalUnit: string;
          organizationalUnitId: string;
        }[] = [];

        const existingAccounts: {
          email: string;
          accountId: string;
        }[] = [];

        for (const mandatoryAccount of props.accountsConfig.mandatoryAccounts) {
          mandatoryAccounts.push({
            name: mandatoryAccount.name,
            description: mandatoryAccount.description,
            email: mandatoryAccount.email,
            organizationalUnit: mandatoryAccount.organizationalUnit,
            organizationalUnitId: props.organizationConfig.getOrganizationalUnitId(mandatoryAccount.organizationalUnit),
          });
        }

        for (const workloadAccount of props.accountsConfig.workloadAccounts) {
          if (
            props.accountsConfig.isGovCloudAccount(workloadAccount) &&
            props.accountsConfig.isGovCloudEnabled(workloadAccount)
          ) {
            workloadAccounts.push({
              name: workloadAccount.name,
              description: workloadAccount.description,
              email: workloadAccount.email,
              enableGovCloud: true,
              organizationalUnit: workloadAccount.organizationalUnit,
              organizationalUnitId: props.organizationConfig.getOrganizationalUnitId(
                workloadAccount.organizationalUnit,
              ),
            });
          } else {
            workloadAccounts.push({
              name: workloadAccount.name,
              description: workloadAccount.description,
              email: workloadAccount.email,
              enableGovCloud: false,
              organizationalUnit: workloadAccount.organizationalUnit,
              organizationalUnitId: props.organizationConfig.getOrganizationalUnitId(
                workloadAccount.organizationalUnit,
              ),
            });
          }
        }

        for (const accountId of props.accountsConfig.accountIds || []) {
          existingAccounts.push({
            email: accountId.email,
            accountId: accountId.accountId,
          });
        }

        Logger.info(`[prepare-stack] Validate Environment`);
        const validation = new ValidateEnvironmentConfig(this, 'ValidateEnvironmentConfig', {
          workloadAccounts: workloadAccounts,
          mandatoryAccounts: mandatoryAccounts,
          existingAccounts: existingAccounts,
          newOrgAccountsTable: newOrgAccountsTable,
          newCTAccountsTable: newCTAccountsTable,
          controlTowerEnabled: props.globalConfig.controlTower.enable,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        Logger.info(`[prepare-stack] Create new organization accounts`);
        const organizationAccounts = new CreateOrganizationAccounts(this, 'CreateOrganizationAccounts', {
          newOrgAccountsTable: newOrgAccountsTable,
          govCloudAccountMappingTable: govCloudAccountMappingTable,
          accountRoleName: props.globalConfig.managementAccountAccessRole,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
        organizationAccounts.node.addDependency(validation);

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
        }
      }
    }

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-onEvent/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-onEvent role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-onTimeout/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-onTimeout role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-isComplete/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWS Custom resource provider framework-isComplete role created by cdk. Provisioning products and service catalog needs AWSServiceCatalogEndUserFullAccess managed policy access.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateCTAccounts/CreateControlTowerAcccountsProvider/framework-onEvent/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-onEvent role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateCTAccounts/CreateControlTowerAccountStatus/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'AWS Custom resource provider service role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateCTAccounts/CreateControlTowerAccountStatus/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider service role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateCTAccounts/CreateControlTowerAccount/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider service role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-onTimeout/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-onTimeout role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateOrganizationAccounts/CreateOrganizationAccountsProvider/framework-isComplete/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-isComplete role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateOrganizationAccounts/CreateOrganizationAccountStatus/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'AWS Custom resource provider service role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateOrganizationAccounts/CreateOrganizationAccountStatus/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider service role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/CreateOrganizationAccounts/CreateOrganizationAccounts/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider service role created by cdk.',
        },
      ],
    );

    Logger.info('[prepare-stack] Completed stack synthesis');
  }
}
