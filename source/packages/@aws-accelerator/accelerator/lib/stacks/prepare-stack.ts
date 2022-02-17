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
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { ValidateEnvironmentConfig } from '../validate-environment-config';
import {
  CreateControlTowerAccounts,
  CreateOrganizationAccounts,
  GetPortfolioId,
  OrganizationalUnit,
} from '@aws-accelerator/constructs';
import { Logger } from '../logger';
import { pascalCase } from 'change-case';

export class PrepareStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    Logger.debug(`[prepare-stack] homeRegion: ${props.globalConfig.homeRegion}`);
    new cdk.aws_ssm.StringParameter(this, 'Parameter', {
      parameterName: `/accelerator/prepare-stack/validate`,
      stringValue: 'value',
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
        });
      }
    }

    if (props.partition == 'aws') {
      const newAccountsTable = new cdk.aws_dynamodb.Table(this, 'NewAccounts', {
        partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
        billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      new cdk.aws_ssm.StringParameter(this, 'TableNameParameter', {
        parameterName: `/accelerator/prepare-stack/newAccountsTableName`,
        stringValue: newAccountsTable.tableName,
      });

      new cdk.aws_ssm.StringParameter(this, 'KmsKeyParameter', {
        parameterName: `/accelerator/prepare-stack/newAccountsTableKmsKeyArn`,
        stringValue: `${newAccountsTable.encryptionKey?.keyArn}`,
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
        workloadAccounts.push({
          name: workloadAccount.name,
          description: workloadAccount.description,
          email: workloadAccount.email,
          organizationalUnit: workloadAccount.organizationalUnit,
          organizationalUnitId: props.organizationConfig.getOrganizationalUnitId(workloadAccount.organizationalUnit),
        });
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
        table: newAccountsTable,
        controlTowerEnabled: props.globalConfig.controlTower.enable,
      });

      if (props.globalConfig.controlTower.enable) {
        Logger.info(`[prepare-stack] Get Portfolio Id`);
        const portfolioResults = new GetPortfolioId(this, 'GetPortFolioId', {
          displayName: 'AWS Control Tower Account Factory Portfolio',
          providerName: 'AWS Control Tower',
        });
        Logger.info(`[prepare-stack] Create new control tower accounts`);
        const controlTowerAccounts = new CreateControlTowerAccounts(this, 'CreateCTAccounts', {
          table: newAccountsTable,
          portfolioId: portfolioResults.portfolioId,
        });
        controlTowerAccounts.node.addDependency(validation);
      } else {
        Logger.info(`[prepare-stack] Creating new organization accounts`);
        const organizationAccounts = new CreateOrganizationAccounts(this, 'CreateOrganizationAccounts', {
          table: newAccountsTable,
          accountRoleName: props.globalConfig.managementAccountAccessRole,
        });
        organizationAccounts.node.addDependency(validation);
      }
    }
  }
}
