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

import {
  AcceleratorResourcePrefixes,
  getContext,
  setResourcePrefixes,
  isBeforeBootstrapStage,
  setAcceleratorEnvironment,
} from '../utils/app-utils';
import { describe, expect, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

function testAppUtils() {
  const app = new cdk.App({
    context: { 'config-dir': path.join(__dirname, `configs/snapshot-only`), partition: 'aws' },
  });
  // Read in context inputs
  const context = getContext(app);

  // Set various resource name prefixes used in code base
  const resourcePrefixes = setResourcePrefixes(process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator');

  // Set accelerator environment variables
  const acceleratorEnv = setAcceleratorEnvironment(process.env, resourcePrefixes, context.stage);
  return acceleratorEnv;
}

test('AppUtilTest', () => {
  const testAcceleratorEnv = testAppUtils();
  expect(testAcceleratorEnv).toHaveProperty('auditAccountEmail');
});

const prefixes: AcceleratorResourcePrefixes = {
  accelerator: 'AWSAccelerator',
  bucketName: 'accelerator-bucket',
  databaseName: 'accelerator-db',
  kmsAlias: 'alias/accelerator-kms',
  repoName: 'accelerator-repo',
  secretName: 'accelerator-secret',
  snsTopicName: 'accelerator',
  ssmParamName: 'aws-accelerator-ssm',
  importResourcesSsmParamName: 'aws-accelerator-import-resources-ssm',
  trailLogName: 'accelerator-trail-log',
};

describe('getContext ideally', () => {
  test('getContext default', () => {
    const app = new cdk.App({
      context: {
        partition: 'aws',
        'config-dir': '/path/to/config/dir',
        stage: 'logging',
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const context = getContext(app);
    expect(context).toBeDefined();
  });
  test('getContext no partition', () => {
    const app = new cdk.App({
      context: {
        'config-dir': '/path/to/config/dir',
        stage: 'logging',
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    function getContextNoPartition() {
      getContext(app);
    }
    expect(getContextNoPartition).toThrowError(new Error('Partition value must be specified in app context'));
  });
});

describe('test setResourcePrefixes', () => {
  test('setResourcePrefixes default', () => {
    const prefixReturn = setResourcePrefixes(process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator');
    expect(prefixReturn.accelerator).toBe('AWSAccelerator');
  });
  test('setResourcePrefixes custom prefix', () => {
    const prefixReturn = setResourcePrefixes('CustomPrefix');
    expect(prefixReturn.accelerator).toBe('CustomPrefix');
  });
});

describe('test isBeforeBootstrapStage', () => {
  test('isBeforeBootstrapStage default', () => {
    const isBeforeBootstrapStageReturn = isBeforeBootstrapStage('synth', 'prepare');
    expect(isBeforeBootstrapStageReturn).toBe(true);
  });
  test('isBeforeBootstrapStage post bootstrap', () => {
    const isBeforeBootstrapStageReturn = isBeforeBootstrapStage('synth', 'logging');
    expect(isBeforeBootstrapStageReturn).toBe(false);
  });
  test('isBeforeBootstrapStage bootstrap', () => {
    const isBeforeBootstrapStageReturn = isBeforeBootstrapStage('bootstrap');
    expect(isBeforeBootstrapStageReturn).toBe(true);
  });
  test('isBeforeBootstrapStage no stage', () => {
    const isBeforeBootstrapStageReturn = isBeforeBootstrapStage('deploy');
    expect(isBeforeBootstrapStageReturn).toBe(false);
  });
});

describe('test setAcceleratorEnvironment', () => {
  test('setAcceleratorEnvironment default', () => {
    const setAcceleratorEnvironmentReturn = setAcceleratorEnvironment(
      { USE_EXISTING_CONFIG_REPO: 'No', ACCELERATOR_QUALIFIER: 'AWSAccelerator' },
      prefixes,
      'prepare',
    );
    expect(setAcceleratorEnvironmentReturn.qualifier).toBeDefined;
  });
  test('setAcceleratorEnvironment config repo error', () => {
    function setConfigRepoNameError() {
      setAcceleratorEnvironment(
        { USE_EXISTING_CONFIG_REPO: 'Yes', ACCELERATOR_QUALIFIER: 'AWSAccelerator' },
        prefixes,
        'prepare',
      );
    }
    const errMsg =
      'Attempting to deploy pipeline stage(s) and environment variables are not set [EXISTING_CONFIG_REPOSITORY_NAME, EXISTING_CONFIG_REPOSITORY_BRANCH_NAME], when USE_EXISTING_CONFIG_REPO environment is set to Yes';
    expect(setConfigRepoNameError).toThrowError(new Error(errMsg));
  });
  test('setAcceleratorEnvironment existing repo', () => {
    const setAcceleratorEnvironmentReturn = setAcceleratorEnvironment(
      {
        USE_EXISTING_CONFIG_REPO: 'Yes',
        ACCELERATOR_QUALIFIER: 'AWSAccelerator',
        EXISTING_CONFIG_REPOSITORY_NAME: 'test-config',
        EXISTING_CONFIG_REPOSITORY_BRANCH_NAME: 'test',
      },
      prefixes,
      'prepare',
    );
    expect(setAcceleratorEnvironmentReturn.configRepositoryName).toBe('test-config');
  });
  test('setAcceleratorEnvironment checkMandatoryEnvVariables error', () => {
    function checkMandatoryEnvVariablesError() {
      setAcceleratorEnvironment(
        {
          USE_EXISTING_CONFIG_REPO: 'No',
          ACCELERATOR_QUALIFIER: 'AWSAccelerator',
          MANAGEMENT_ACCOUNT_EMAIL: 'management@example.com',
          LOG_ARCHIVE_ACCOUNT_EMAIL: 'log@example.com',
        },
        prefixes,
        'pipeline',
      );
    }

    expect(checkMandatoryEnvVariablesError).toThrowError(
      new Error(
        'Missing mandatory environment variables: AUDIT_ACCOUNT_EMAIL, CONTROL_TOWER_ENABLED, ACCELERATOR_REPOSITORY_BRANCH_NAME',
      ),
    );
  });
});
