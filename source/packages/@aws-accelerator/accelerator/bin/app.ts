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
import 'source-map-support/register';
import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { Logger } from '../lib/logger';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { DefaultStack } from '../lib/stacks/default-stack';
import { DependenciesStack } from '../lib/stacks/dependencies-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkTgwAttachStack } from '../lib/stacks/network-tgw-attach-stack';
import { NetworkTgwStack } from '../lib/stacks/network-tgw-stack';
import { NetworkVpcStack } from '../lib/stacks/network-vpc-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { ValidateStack } from '../lib/stacks/validate-stack';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

async function main() {
  Logger.info('[app] Begin Platform Accelerator CDK App');
  const app = new cdk.App();

  //
  // Read in context inputs
  //
  const stage = app.node.tryGetContext('stage');
  const account = app.node.tryGetContext('account');
  const region = app.node.tryGetContext('region');
  const configDirPath = app.node.tryGetContext('config-dir');
  const command = app.node.tryGetContext('command');

  const env = {
    account,
    region,
  };

  //
  // Bootstrap Stack
  //
  if (command === 'bootstrap') {
    // Need to define a dummy stack here to allow the bootstrap to occur
    new DefaultStack(app, 'AWSAccelerator-DefaultStack', { env });
    return;
  }

  //
  // Pipeline Stack
  //
  if (stage === AcceleratorStage.PIPELINE) {
    new PipelineStack(app, 'AWSAccelerator-PipelineStack', {
      env,
      stage,
      sourceRepositoryName: process.env['ACCELERATOR_REPOSITORY_NAME']!,
      sourceBranchName: process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']!,
      managementAccountId: process.env['MANAGEMENT_ACCOUNT_ID'],
      managementAccountRoleName: process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'],
    });
    return;
  }

  //
  // Create properties to be used by AcceleratorStack types
  //
  const props = {
    env,
    configDirPath,
    accountsConfig: AccountsConfig.load(configDirPath),
    globalConfig: GlobalConfig.load(configDirPath),
    iamConfig: IamConfig.load(configDirPath),
    networkConfig: NetworkConfig.load(configDirPath),
    organizationConfig: OrganizationConfig.load(configDirPath),
    securityConfig: SecurityConfig.load(configDirPath),
  };

  //
  // Load in account IDs using the Organizations client if not provided as
  // inputs in accountsConfig
  //
  await props.accountsConfig.loadAccountIds();

  //
  // Load in organizational unit IDs using the Organizations client if not
  // provided as inputs in accountsConfig
  //
  await props.organizationConfig.loadOrganizationalUnitIds();

  //
  // AcceleratorStack types
  //
  if (stage === AcceleratorStage.LOGGING) {
    new LoggingStack(app, 'AWSAccelerator-LoggingStack', props);
  }
  if (stage === AcceleratorStage.ACCOUNTS) {
    new AccountsStack(app, 'AWSAccelerator-AccountsStack', props);
  }
  if (stage === AcceleratorStage.ORGANIZATIONS) {
    new OrganizationsStack(app, 'AWSAccelerator-OrganizationsStack', props);
  }
  if (stage === AcceleratorStage.VALIDATE) {
    new ValidateStack(app, 'AWSAccelerator-ValidateStack', props);
  }
  if (stage === AcceleratorStage.DEPENDENCIES) {
    new DependenciesStack(app, 'AWSAccelerator-DependenciesStack', props);
  }
  if (stage === AcceleratorStage.SECURITY) {
    new SecurityStack(app, 'AWSAccelerator-SecurityStack', props);
  }
  if (stage === AcceleratorStage.SECURITY_AUDIT) {
    new SecurityAuditStack(app, 'AWSAccelerator-SecurityAuditStack', props);
  }
  if (stage === AcceleratorStage.OPERATIONS) {
    new OperationsStack(app, 'AWSAccelerator-OperationsStack', props);
  }
  if (stage === AcceleratorStage.NETWORK_TGW) {
    new NetworkTgwStack(app, 'AWSAccelerator-NetworkTgwStack', props);
  }
  if (stage === AcceleratorStage.NETWORK_VPC) {
    new NetworkVpcStack(app, 'AWSAccelerator-NetworkVpcStack', props);
  }
  if (stage === AcceleratorStage.NETWORK_TGW_ATTACH) {
    new NetworkTgwAttachStack(app, 'AWSAccelerator-NetworkTgwAttachStack', props);
  }

  Logger.info('[app] End Platform Accelerator CDK App');
}

main();
