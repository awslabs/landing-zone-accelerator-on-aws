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

import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import 'source-map-support/register';
import { version } from '../../../../package.json';
import * as installer from '../lib/installer-stack';

const app = new cdk.App();
cdk.Aspects.of(app).add(new AwsSolutionsChecks());

const useExternalPipelineAccount = app.node.tryGetContext('use-external-pipeline-account') === 'true';
const enableTester = app.node.tryGetContext('enable-tester') === 'true';
const managementCrossAccountRoleName = app.node.tryGetContext('management-cross-account-role-name');
const enableSingleAccountMode = app.node.tryGetContext('enable-single-account-mode') === 'true';

if (enableTester && managementCrossAccountRoleName === undefined) {
  console.log(`Invalid --management-cross-account-role-name ${managementCrossAccountRoleName}`);
  throw new Error(
    'Usage: app.ts [--context use-external-pipeline-account=BOOLEAN] [--context enable-tester=BOOLEAN] [--context management-cross-account-role-name=MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME]',
  );
}

new installer.InstallerStack(app, 'AWSAccelerator-InstallerStack', {
  description: `(SO0199) Landing Zone Accelerator on AWS. Version ${version}.`,
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  useExternalPipelineAccount: useExternalPipelineAccount,
  enableTester: enableTester,
  managementCrossAccountRoleName: managementCrossAccountRoleName,
  enableSingleAccountMode,
});
