#!/usr/bin/env node

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

import 'source-map-support/register';
import { version } from '../../../../package.json';
import * as cdk from 'aws-cdk-lib';
import { GovCloudAccountVendingStack } from '../lib/govcloud-avm-stack';

// Set accelerator prefix environment variable
const acceleratorPrefix = process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator';

const app = new cdk.App();
new GovCloudAccountVendingStack(app, `${acceleratorPrefix}-GovCloudAccountVending`, {
  description: `(SO0199-govcloudavm) Landing Zone Accelerator on AWS. Version ${version}.`,
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  acceleratorPrefix: acceleratorPrefix,
});
