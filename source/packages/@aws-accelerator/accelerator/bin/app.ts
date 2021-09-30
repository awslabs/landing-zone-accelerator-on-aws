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

import * as cdk from '@aws-cdk/core';
import 'source-map-support/register';
import { AcceleratorStage } from '../lib/accelerator';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { DependenciesStack } from '../lib/stacks/dependencies-stack';
import { NetworkingStack } from '../lib/stacks/networking-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { ValidateStack } from '../lib/stacks/validate-stack';
import { OrganizationConfig } from '@aws-accelerator/config';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage');
const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region');
const configDirPath = app.node.tryGetContext('config-dir');

if (configDirPath === undefined) {
  throw new Error('config-dir not specified');
}
console.log(configDirPath);

// const globalConfig = GlobalConfig.load(props.configDirPath);
const organizationsConfig = OrganizationConfig.load(configDirPath);
// const accountsConfig = AccountsConfig.load(props.configDirPath);

const env = {
  account,
  region,
};

switch (stage) {
  case AcceleratorStage.PIPELINE:
    new PipelineStack(app, 'AWSAccelerator-PipelineStack', { env, stage });
    break;
  case AcceleratorStage.ORGANIZATIONS:
    new OrganizationsStack(app, 'Accelerator-OrganizationsStack', { env, stage, organizationsConfig });
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
    new SecurityStack(app, 'AWSAccelerator-SecurityStack', { env, stage });
    break;
  case AcceleratorStage.OPERATIONS:
    new OperationsStack(app, 'AWSAccelerator-OperationsStack', { env, stage });
    break;
  case AcceleratorStage.NETWORKING:
    new NetworkingStack(app, 'AWSAccelerator-NetworkingStack', { env, stage });
    break;

  default:
    throw new Error(`Unknown stage: ${stage}`);
}
