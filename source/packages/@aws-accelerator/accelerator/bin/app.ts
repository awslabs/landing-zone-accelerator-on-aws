#!/usr/bin/env node

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

import { AccountsConfig, GlobalConfig, OrganizationConfig, SecurityConfig } from '@aws-accelerator/config';
import * as cdk from '@aws-cdk/core';
import { OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';
import 'source-map-support/register';
import { AcceleratorStage } from '../lib/accelerator';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { DefaultStack } from '../lib/stacks/default-stack';
import { DependenciesStack } from '../lib/stacks/dependencies-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkingStack } from '../lib/stacks/networking-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { ValidateStack } from '../lib/stacks/validate-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit';

async function main() {
  const app = new cdk.App();

  const stage = app.node.tryGetContext('stage');
  const account = app.node.tryGetContext('account');
  const region = app.node.tryGetContext('region');
  const configDirPath = app.node.tryGetContext('config-dir');

  const env = {
    account,
    region,
  };

  switch (stage) {
    case AcceleratorStage.PIPELINE:
      new PipelineStack(app, 'AWSAccelerator-PipelineStack', { env, stage });
      break;
    case AcceleratorStage.LOGGING:
      new LoggingStack(app, 'AWSAccelerator-LoggingStack', {
        env,
        accountIds: await getAccountIds(),
        accountsConfig: AccountsConfig.load(configDirPath),
        globalConfig: GlobalConfig.load(configDirPath),
      });
      break;
    case AcceleratorStage.ORGANIZATIONS:
      new OrganizationsStack(app, 'AWSAccelerator-OrganizationsStack', {
        env,
        accountIds: await getAccountIds(),
        configDirPath,
        accountsConfig: AccountsConfig.load(configDirPath),
        organizationsConfig: OrganizationConfig.load(configDirPath),
        globalConfig: GlobalConfig.load(configDirPath),
        securityConfig: SecurityConfig.load(configDirPath),
        accountIds: await getAccountIds(),
      });
      break;
    case AcceleratorStage.VALIDATE:
      new ValidateStack(app, 'AWSAccelerator-ValidateStack', { env, stage });
      break;
    case AcceleratorStage.ACCOUNTS:
      new AccountsStack(app, 'AWSAccelerator-AccountsStack', { env, stage });
      break;
    case AcceleratorStage.DEPENDENCIES:
      new DependenciesStack(app, 'AWSAccelerator-DependenciesStack', { env, stage });
      break;
    case AcceleratorStage.SECURITY:
      new SecurityStack(app, 'AWSAccelerator-SecurityStack', {
        env,
        stage,
        accountsConfig: AccountsConfig.load(configDirPath),
        securityConfig: SecurityConfig.load(configDirPath),
      });
      break;
    case AcceleratorStage['SECURITY-AUDIT']:
      new SecurityAuditStack(app, 'AWSAccelerator-SecurityAuditStack', {
        env,
        stage,
        accountsConfig: AccountsConfig.load(configDirPath),
        securityConfig: SecurityConfig.load(configDirPath),
      });
      break;
    case AcceleratorStage.OPERATIONS:
      new OperationsStack(app, 'AWSAccelerator-OperationsStack', { env, stage });
      break;
    case AcceleratorStage.NETWORKING:
      new NetworkingStack(app, 'AWSAccelerator-NetworkingStack', { env, stage });
      break;
    default:
      new DefaultStack(app, 'AWSAccelerator-ValidateStack', { env });
  }
}

/**
 * Provides a dictionary of account email to account id. Will initially check if
 * a local file is provided with the mappings, and if not existent, build the
 * list though the Organizations client
 *
 * @returns dictionary of account email to account id
 */
async function getAccountIds(): Promise<{ [name: string]: string }> {
  const organizationsClient = new OrganizationsClient({});
  const accountIds: { [name: string]: string } = {};
  for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
    for (const account of page.Accounts ?? []) {
      if (account.Email && account.Id) {
        accountIds[account.Email] = account.Id;
      }
    }
  }
  return accountIds;
}

main();
