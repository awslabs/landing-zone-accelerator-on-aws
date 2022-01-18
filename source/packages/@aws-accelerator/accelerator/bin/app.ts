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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import 'source-map-support/register';
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
import { AcceleratorStackNames } from '../lib/accelerator';
import { pascalCase } from 'change-case';

process.on(
  'unhandledRejection',
  (
    reason,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _,
  ) => {
    console.error(reason);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  },
);

export class GovCloudOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('KmsKeyId');
    }
  }
}

async function main() {
  Logger.info('[app] Begin Platform Accelerator CDK App');
  const app = new cdk.App();

  //
  // Read in context inputs
  //
  const stage = app.node.tryGetContext('stage');
  const account = app.node.tryGetContext('account');
  const region = app.node.tryGetContext('region');
  const partition = app.node.tryGetContext('partition');
  const configDirPath = app.node.tryGetContext('config-dir');
  const command = app.node.tryGetContext('command');

  if (partition === 'aws-us-gov') {
    cdk.Aspects.of(app).add(new GovCloudOverrides());
  }

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
    const qualifier = process.env['ACCELERATOR_QUALIFIER'] ?? 'aws-accelerator';
    const stackName = process.env['ACCELERATOR_QUALIFIER']
      ? `${pascalCase(process.env['ACCELERATOR_QUALIFIER'])}-PipelineStack`
          .split('_')
          .join('-')
          .replace(/AwsAccelerator/gi, 'AWSAccelerator')
      : 'AWSAccelerator-PipelineStack';

    new PipelineStack(app, stackName, {
      env,
      stage,
      sourceRepositoryName: process.env['ACCELERATOR_REPOSITORY_NAME']!,
      sourceBranchName: process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']!,
      qualifier: qualifier,
      managementAccountId: process.env['MANAGEMENT_ACCOUNT_ID']!,
      managementAccountRoleName: process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']!,
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
    new LoggingStack(app, AcceleratorStackNames[AcceleratorStage.LOGGING], props);
  }

  if (stage === AcceleratorStage.ACCOUNTS) {
    new AccountsStack(app, AcceleratorStackNames[AcceleratorStage.ACCOUNTS], props);
  }

  if (stage === AcceleratorStage.ORGANIZATIONS) {
    new OrganizationsStack(app, AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS], props);
  }

  if (stage === AcceleratorStage.VALIDATE) {
    new ValidateStack(app, AcceleratorStackNames[AcceleratorStage.VALIDATE], props);
  }

  if (stage === AcceleratorStage.DEPENDENCIES) {
    new DependenciesStack(app, AcceleratorStackNames[AcceleratorStage.DEPENDENCIES], props);
  }

  if (stage === AcceleratorStage.SECURITY) {
    new SecurityStack(app, AcceleratorStackNames[AcceleratorStage.SECURITY], props);
  }

  if (stage === AcceleratorStage.SECURITY_AUDIT) {
    new SecurityAuditStack(app, AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT], props);
  }

  if (stage === AcceleratorStage.OPERATIONS) {
    new OperationsStack(app, AcceleratorStackNames[AcceleratorStage.OPERATIONS], props);
  }

  if (stage === AcceleratorStage.NETWORK_TGW) {
    new NetworkTgwStack(app, AcceleratorStackNames[AcceleratorStage.NETWORK_TGW], props);
  }

  if (stage === AcceleratorStage.NETWORK_VPC) {
    new NetworkVpcStack(app, AcceleratorStackNames[AcceleratorStage.NETWORK_VPC], props);
  }

  if (stage === AcceleratorStage.NETWORK_TGW_ATTACH) {
    new NetworkTgwAttachStack(app, AcceleratorStackNames[AcceleratorStage.NETWORK_TGW_ATTACH], props);
  }

  Logger.info('[app] End Platform Accelerator CDK App');
}

main();
