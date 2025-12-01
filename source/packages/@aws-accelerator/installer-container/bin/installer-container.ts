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
import * as installer from '../lib/installer-container-stack';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { IConstruct } from 'constructs';

const logger = createLogger(['installer-container']);

async function main() {
  const app = new cdk.App();
  cdk.Aspects.of(app).add(new AwsSolutionsChecks());

  const useExternalPipelineAccount = app.node.tryGetContext('use-external-pipeline-account') === 'true';
  const useS3Source = app.node.tryGetContext('use-s3-source') === 'true';
  const s3SourceKmsKeyArn = app.node.tryGetContext('s3-source-kms-key-arn');
  const managementCrossAccountRoleName = app.node.tryGetContext('management-cross-account-role-name');
  const enableSingleAccountMode = app.node.tryGetContext('enable-single-account-mode') === 'true';
  // Read permission boundary flag from CDK context to enable IAM permission boundaries on all roles
  const usePermissionBoundary = app.node.tryGetContext('use-permission-boundary') === 'true';
  const setNodeVersion = app.node.tryGetContext('enable-set-node-version') === 'true';

  new installer.InstallerContainerStack(app, 'AWSAccelerator-InstallerContainerStack', {
    description: `(SO0199) Landing Zone Accelerator on AWS. Version ${version}.`,
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: useExternalPipelineAccount,
    useS3Source: useS3Source,
    s3SourceKmsKeyArn: s3SourceKmsKeyArn,
    managementCrossAccountRoleName: managementCrossAccountRoleName,
    enableSingleAccountMode,
    // Pass permission boundary flag to stack for conditional resource creation
    usePermissionBoundary,
    setNodeVersion,
  });
  // Apply permission boundary aspect to all IAM roles if enabled
  if (usePermissionBoundary) {
    cdk.Aspects.of(app).add(new installerPermissionBoundary());
  }
}

/**
 * CDK Aspect that applies IAM permission boundaries to all IAM roles in the stack.
 * This ensures roles cannot exceed the permissions defined in the boundary policy.
 * The boundary policy name is expected to be provided via CloudFormation parameter.
 */
class installerPermissionBoundary implements cdk.IAspect {
  public visit(node: IConstruct): void {
    // Apply permission boundary to all IAM Role resources
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
