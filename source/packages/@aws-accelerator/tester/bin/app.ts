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
import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { TesterStack, CONFIG_FILE_NAME, CONFIG_FILE_CONTENT_TYPE } from '../lib/tester-stack';

/**
 * Test Accelerator CDK App
 */
async function main() {
  const usage =
    'Usage: app.ts --context account=ACCOUNT --context region=REGION --context management-cross-account-role-name=MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME --context config-dir=CONFIG_DIRECTORY [--context qualifier=QUALIFIER] [--context management-account-id=MANAGEMENT_ACCOUNT_ID] [--context management-account-role-name=MANAGEMENT_ACCOUNT_ROLE_NAME]';
  const app = new cdk.App();

  const acceleratorPrefix = app.node.tryGetContext('acceleratorPrefix');
  const account = app.node.tryGetContext('account');
  const region = app.node.tryGetContext('region');
  const qualifier = app.node.tryGetContext('qualifier');
  const managementCrossAccountRoleName = app.node.tryGetContext('management-cross-account-role-name');
  const configDirPath = app.node.tryGetContext('config-dir');

  if (account === undefined) {
    console.warn(`[tester-app] Invalid --account ${account}`);
    throw new Error(usage);
  }

  if (region === undefined) {
    console.warn(`[tester-app] Invalid --account ${region}`);
    throw new Error(usage);
  }

  if (managementCrossAccountRoleName === undefined) {
    console.warn(`[tester-app] Invalid --management-cross-account-role-name ${managementCrossAccountRoleName}`);
    throw new Error(usage);
  }

  if (configDirPath === undefined || !fs.existsSync(configDirPath)) {
    console.warn(`[tester-app] Invalid --config-dir ${configDirPath}`);
    throw new Error(usage);
  }

  const configFilePath = path.join(configDirPath, CONFIG_FILE_NAME);
  if (!fs.existsSync(configFilePath)) {
    throw new Error(`[tester-app] Config file not found ${configFilePath}`);
  }

  const configFileContent = yaml.load(fs.readFileSync(configFilePath, 'utf8')) as CONFIG_FILE_CONTENT_TYPE;

  new TesterStack(
    app,
    qualifier === undefined
      ? `${acceleratorPrefix}-TesterStack-${account}-${region}`
      : `${qualifier}-tester-stack-${account}-${region}`,
    {
      synthesizer: new cdk.DefaultStackSynthesizer({
        generateBootstrapVersionRule: false,
      }),
      managementCrossAccountRoleName: managementCrossAccountRoleName,
      configFileContent: configFileContent,
      qualifier: qualifier === undefined ? 'aws-accelerator' : qualifier,
      managementAccountId: app.node.tryGetContext('management-account-id'),
      managementAccountRoleName: app.node.tryGetContext('management-account-role-name'),
    },
  );
}

//call the main function
main();
