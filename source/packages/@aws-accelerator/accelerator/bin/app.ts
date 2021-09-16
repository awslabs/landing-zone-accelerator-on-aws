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
import { Stage } from '../lib/stages';
import { ValidateStack } from '../lib/validate-stack';
import { AccountsStack } from '../lib/accounts-stack';
import { DependenciesStack } from '../lib/dependencies-stack';
import { SecurityStack } from '../lib/security-stack';
import { OperationsStack } from '../lib/operations-stack';
import { NetworkingStack } from '../lib/networking-stack';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage');
const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region');

const env = {
  account,
  region,
};

switch (stage) {
  // This stack should only be run in the pipeline account
  case Stage.VALIDATE:
    new ValidateStack(app, 'AWSAccelerator-ValidateStack', { env, stage });
    break;
  case Stage.ACCOUNTS:
    new AccountsStack(app, 'AWSAccelerator-AccountsStack', { env, stage });
    break;
  case Stage.DEPENDENCIES:
    new DependenciesStack(app, 'AWSAccelerator-DependenciesStack', { env, stage });
    break;
  case Stage.SECURITY:
    new SecurityStack(app, 'AWSAccelerator-SecurityStack', { env, stage });
    break;
  case Stage.OPERATIONS:
    new OperationsStack(app, 'AWSAccelerator-OperationsStack', { env, stage });
    break;
  case Stage.NETWORKING:
    new NetworkingStack(app, 'AWSAccelerator-NetworkingStack', { env, stage });
    break;

  default:
    throw new Error(`Unknown stage: ${stage}`);
}
