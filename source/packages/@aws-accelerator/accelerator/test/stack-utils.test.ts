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
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AccountConfig,
  AppConfigItem,
  CloudFormationStackConfig,
  CustomizationConfig,
  CustomizationsConfig,
  DeploymentTargets,
} from '@aws-accelerator/config';
import { describe, expect, it, vi } from 'vitest';

import { AcceleratorStage } from '../lib/accelerator-stage';
import { ApplicationsStack } from '../lib/stacks/applications-stack';
import { CustomStack } from '../lib/stacks/custom-stack';
import { createAcceleratorStackProps } from './stacks/stack-props-test-helper';
import {
  AcceleratorContext,
  AcceleratorEnvironment,
  AcceleratorResourcePrefixes,
  setAcceleratorEnvironment,
  setResourcePrefixes,
} from '../utils/app-utils';
import { createCustomizationsStacks, createPipelineStack, createTesterStack } from '../utils/stack-utils';

const pipelineAccountId = '111111111111';
const managementAccountId = '222222222222';
const managementAccountRoleName = 'AWSAccelerator-CrossAccountRole';

const resourcePrefixes: AcceleratorResourcePrefixes = setResourcePrefixes('AWSAccelerator');

function getContext(stage: AcceleratorStage): AcceleratorContext {
  return {
    partition: 'aws',
    useExistingRoles: false,
    stage,
    account: pipelineAccountId,
    region: 'us-east-1',
  };
}

/**
 * Builds the accelerator environment for the given stage.
 *
 * The installer only computes a functional external pipeline account deployment when both
 * `MANAGEMENT_ACCOUNT_ID` and `MANAGEMENT_ACCOUNT_ROLE_NAME` are provided, so both are modelled
 * independently here.
 */
function getAcceleratorEnvironment(
  stage: AcceleratorStage,
  externalManagementAccount?: { id?: string; roleName?: string },
): AcceleratorEnvironment {
  return setAcceleratorEnvironment(
    {
      USE_EXISTING_CONFIG_REPO: 'No',
      MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME: 'AWSControlTowerExecution',
      ACCELERATOR_REPOSITORY_BRANCH_NAME: 'main',
      // Mandatory for the pipeline stage, per checkMandatoryEnvVariables. CONTROL_TOWER_ENABLED must be
      // set, and keeping it away from 'Yes' also keeps createPipelineStack away from the management
      // account credential lookup and the Control Tower landing zone API call.
      AUDIT_ACCOUNT_EMAIL: 'audit@example.com',
      CONTROL_TOWER_ENABLED: 'No',
      LOG_ARCHIVE_ACCOUNT_EMAIL: 'log-archive@example.com',
      MANAGEMENT_ACCOUNT_EMAIL: 'management@example.com',
      // The pipeline stack resolves its source bucket by name, so this must be a valid bucket name.
      SECURE_BUCKET_NAME: `aws-accelerator-installer-${pipelineAccountId}-us-east-1`,
      ...(externalManagementAccount?.id ? { MANAGEMENT_ACCOUNT_ID: externalManagementAccount.id } : {}),
      ...(externalManagementAccount?.roleName
        ? { MANAGEMENT_ACCOUNT_ROLE_NAME: externalManagementAccount.roleName }
        : {}),
    },
    resourcePrefixes,
    stage,
  );
}

/**
 * Asserts that every deployment role ARN recorded in the cloud assembly for the single stack of the given app
 * resolves to the expected role in the pipeline account
 *
 * @remarks
 * The synthesizer derives all four of its role properties from one ARN, so pinning the three roles the
 * stack artifact exposes also pins `fileAssetPublishingRoleArn`. That fourth role is not asserted here:
 * these stacks use `DefaultStackSynthesizer`, whose file assets are recorded in a separate asset
 * manifest rather than on the stack artifact, so `stackArtifact.assets` is empty and cannot carry it.
 */
function expectDeploymentRole(app: cdk.App | undefined, roleName: string) {
  expect(app).toBeDefined();
  const stackArtifact = app!.synth().stacks[0];
  const expectedRoleArn = `arn:aws:iam::${pipelineAccountId}:role/${roleName}`;

  expect(stackArtifact.assumeRoleArn).toEqual(expectedRoleArn);
  expect(stackArtifact.cloudFormationExecutionRoleArn).toEqual(expectedRoleArn);
  expect(stackArtifact.lookupRole?.arn).toEqual(expectedRoleArn);
}

describe('createPipelineStack', () => {
  const stage = AcceleratorStage.PIPELINE;

  it('should use the management deployment role when the management account id is not set', async () => {
    const app = await createPipelineStack(getContext(stage), getAcceleratorEnvironment(stage), resourcePrefixes, false);
    expectDeploymentRole(app, 'AWSAccelerator-Management-Deployment-Role');
  });

  it('should use the management deployment role when the pipeline account is the management account', async () => {
    const app = await createPipelineStack(
      getContext(stage),
      getAcceleratorEnvironment(stage, { id: pipelineAccountId, roleName: managementAccountRoleName }),
      resourcePrefixes,
      false,
    );
    expectDeploymentRole(app, 'AWSAccelerator-Management-Deployment-Role');
  });

  it('should use the account deployment role when the pipeline account is not the management account', async () => {
    const app = await createPipelineStack(
      getContext(stage),
      getAcceleratorEnvironment(stage, { id: managementAccountId, roleName: managementAccountRoleName }),
      resourcePrefixes,
      false,
    );
    expectDeploymentRole(app, 'AWSAccelerator-Deployment-Role');
  });

  it('should use the management deployment role when the management account role name is not set', async () => {
    const app = await createPipelineStack(
      getContext(stage),
      getAcceleratorEnvironment(stage, { id: managementAccountId }),
      resourcePrefixes,
      false,
    );
    expectDeploymentRole(app, 'AWSAccelerator-Management-Deployment-Role');
  });
});

describe('createTesterStack', () => {
  const stage = AcceleratorStage.TESTER_PIPELINE;

  it('should use the management deployment role when the management account id is not set', () => {
    const app = createTesterStack(getContext(stage), getAcceleratorEnvironment(stage), resourcePrefixes);
    expectDeploymentRole(app, 'AWSAccelerator-Management-Deployment-Role');
  });

  it('should use the account deployment role when the pipeline account is not the management account', () => {
    const app = createTesterStack(
      getContext(stage),
      getAcceleratorEnvironment(stage, { id: managementAccountId, roleName: managementAccountRoleName }),
      resourcePrefixes,
    );
    expectDeploymentRole(app, 'AWSAccelerator-Deployment-Role');
  });

  it('should use the management deployment role when the management account role name is not set', () => {
    const app = createTesterStack(
      getContext(stage),
      getAcceleratorEnvironment(stage, { id: managementAccountId }),
      resourcePrefixes,
    );
    expectDeploymentRole(app, 'AWSAccelerator-Management-Deployment-Role');
  });
});

describe('createCustomizationsStacks', () => {
  it('does not inject SOLUTION_ID into customer templates through any customizations aspect registration', () => {
    const accountId = pipelineAccountId;
    const region = 'us-east-1';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-stack-utils-test-'));
    const templateFile = 'customer-lambda.yaml';

    try {
      fs.writeFileSync(
        path.join(tmpDir, templateFile),
        [
          "AWSTemplateFormatVersion: '2010-09-09'",
          'Resources:',
          '  CustomerFunction:',
          '    Type: AWS::Lambda::Function',
          '    Properties:',
          '      Handler: index.handler',
          '      Role: arn:aws:iam::111111111111:role/customer-role',
          '      Runtime: nodejs22.x',
          '      Code:',
          '        ZipFile: exports.handler = async () => {};',
          '      Environment:',
          '        Variables:',
          '          CUSTOMER_VALUE: preserved',
          '',
        ].join('\n'),
      );

      const deploymentTargets = Object.assign(new DeploymentTargets(), {
        organizationalUnits: ['Root'],
      });
      const account = Object.assign(new AccountConfig(), {
        name: 'TestAccount',
        description: 'Test account',
        email: 'test@example.com',
        organizationalUnit: 'Test',
      });
      const customStackConfig = Object.assign(new CloudFormationStackConfig(), {
        deploymentTargets,
        description: 'Customer Lambda stack',
        name: 'CustomerLambda',
        regions: [region],
        template: templateFile,
      });
      const customizationConfig = Object.assign(new CustomizationConfig(), {
        cloudFormationStacks: [customStackConfig],
      });
      const application = Object.assign(new AppConfigItem(), {
        name: 'NoOpApplication',
        vpc: 'NoVpc',
        deploymentTargets,
      });
      const customizationsConfig = new CustomizationsConfig({
        customizations: customizationConfig,
        applications: [application],
      });
      const props = createAcceleratorStackProps({
        configDirPath: tmpDir,
        partition: 'aws',
        customizationsConfig,
        env: { account: accountId, region },
      });

      Object.assign(props.accountsConfig, {
        mandatoryAccounts: [account],
        getAccountId: vi.fn(() => accountId),
      });
      Object.assign(props.organizationConfig, {
        isIgnored: vi.fn(() => false),
      });

      const app = createCustomizationsStacks(
        getContext(AcceleratorStage.CUSTOMIZATIONS),
        props,
        { account: accountId, region },
        accountId,
        region,
      );
      expect(app?.node.children.some(child => child instanceof ApplicationsStack)).toBe(true);
      const customStack = app?.node.children.find(child => child instanceof CustomStack);
      if (!(customStack instanceof CustomStack)) {
        throw new Error('Expected customizations orchestration to create a CustomStack');
      }

      const template = Template.fromStack(customStack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 512,
        Environment: {
          Variables: Match.objectEquals({
            CUSTOMER_VALUE: 'preserved',
          }),
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
