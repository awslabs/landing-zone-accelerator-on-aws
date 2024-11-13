#!/usr/bin/env node

/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { IConstruct } from 'constructs';

const logger = createLogger(['installer']);

async function main() {
  const app = new cdk.App();
  cdk.Aspects.of(app).add(new AwsSolutionsChecks());

  const useExternalPipelineAccount = app.node.tryGetContext('use-external-pipeline-account') === 'true';
  const enableTester = app.node.tryGetContext('enable-tester') === 'true';
  const useS3Source = app.node.tryGetContext('use-s3-source') === 'true';
  const s3SourceKmsKeyArn = app.node.tryGetContext('s3-source-kms-key-arn');
  const managementCrossAccountRoleName = app.node.tryGetContext('management-cross-account-role-name');
  const enableSingleAccountMode = app.node.tryGetContext('enable-single-account-mode') === 'true';
  const usePermissionBoundary = app.node.tryGetContext('use-permission-boundary') === 'true';
  const enableRegionByRegionDeployment = app.node.tryGetContext('enable-region-by-region-deployment') === 'true';

  if (enableTester && managementCrossAccountRoleName === undefined) {
    console.log(`Invalid --management-cross-account-role-name ${managementCrossAccountRoleName}`);
    throw new Error(
      'Usage: app.ts [--context use-external-pipeline-account=BOOLEAN] [--context enable-tester=BOOLEAN] [--context management-cross-account-role-name=MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME] [--context use-permission-boundary=BOOLEAN]',
    );
  }

  new installer.InstallerStack(app, 'AWSAccelerator-InstallerStack', {
    description: `(SO0199) Landing Zone Accelerator on AWS. Version ${version}.`,
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: useExternalPipelineAccount,
    enableTester: enableTester,
    useS3Source: useS3Source,
    s3SourceKmsKeyArn: s3SourceKmsKeyArn,
    managementCrossAccountRoleName: managementCrossAccountRoleName,
    enableSingleAccountMode,
    usePermissionBoundary,
    enableRegionByRegionDeployment,
  });
  if (usePermissionBoundary) {
    cdk.Aspects.of(app).add(new installerPermissionBoundary());
  }
}

class installerPermissionBoundary implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource && node.cfnResourceType === 'AWS::IAM::Role') {
      node.addPropertyOverride(
        'PermissionsBoundary.Fn::Sub',
        'arn:${AWS::Partition}:iam::${AWS::AccountId}:policy/${PermissionBoundaryPolicyName}',
      );
    }
  }
}

(async () => {
  try {
    await main();
  } catch (err) {
    logger.error(err);
    throw new Error(`${err}`);
  }
})();
