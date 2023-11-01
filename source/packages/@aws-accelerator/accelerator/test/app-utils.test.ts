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

import { AccountsConfig, OrganizationConfig } from '@aws-accelerator/config';
import AWS from 'aws-sdk';
import {
  AcceleratorResourcePrefixes,
  getContext,
  setResourcePrefixes,
  isBeforeBootstrapStage,
  setAcceleratorEnvironment,
} from '../utils/app-utils';
import { describe, expect, test, jest } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';

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
  return { context, resourcePrefixes, acceleratorEnv };
}

test('AppUtilTest', () => {
  const { acceleratorEnv: testAcceleratorEnv } = testAppUtils();
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
  ssmLogName: 'aws-accelerator',
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

describe('test setAcceleratorStackProps', () => {
  function initializeMock() {
    AccountsConfig.prototype.loadAccountIds = jest
      .fn<
        (
          partition: string,
          enableSingleAccountMode: boolean,
          isOrgsEnabled: boolean,
          accountConfig: AccountsConfig,
        ) => Promise<void>
      >()
      .mockResolvedValue();
    OrganizationConfig.prototype.loadOrganizationalUnitIds = jest
      .fn<(partition: string) => Promise<void>>()
      .mockResolvedValue();

    // mock STS AssumeRole
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockAssumeRole = jest.fn<() => { promise: any }>();
    (AWS.STS.prototype.assumeRole as jest.Mock) = mockAssumeRole.mockReturnValue({
      promise: jest
        .fn<() => Promise<{ Credentials: { AccessKeyId: string; SecretAccessKey: string; SessionToken: string } }>>()
        .mockResolvedValue({
          Credentials: {
            AccessKeyId: 'fake-cred',
            SecretAccessKey: 'fake-cred',
            SessionToken: 'fake-cred',
          },
        }),
    });
    // Mock EC2 describeVpcs method
    const mockDescribeVpcs = jest.fn<() => { promise: unknown }>();
    (AWS.EC2.prototype.describeVpcs as jest.Mock) = mockDescribeVpcs.mockReturnValue({
      promise: jest
        .fn<() => Promise<{ Vpcs: { VpcId: string }[] }>>()
        .mockResolvedValueOnce({
          Vpcs: [{ VpcId: 'fake-vpc-id-1' }],
        })
        .mockResolvedValueOnce({
          Vpcs: [{ VpcId: 'fake-vpc-id-2' }],
        })
        .mockResolvedValueOnce({
          Vpcs: [{ VpcId: 'fake-vpc-id-3' }],
        })
        .mockResolvedValueOnce({
          Vpcs: [{ VpcId: 'fake-vpc-id-4' }],
        }),
    });

    // Mock EC2 describeVpcEndpoints method
    const mockDescribeVpcEndpoints = jest.fn<() => { promise: unknown }>();
    (AWS.EC2.prototype.describeVpcEndpoints as jest.Mock) = mockDescribeVpcEndpoints.mockReturnValue({
      promise: jest
        .fn<() => Promise<{ VpcEndpoints: { VpcEndpointId: string }[] }>>()
        .mockResolvedValueOnce({
          VpcEndpoints: [{ VpcEndpointId: 'fake-vpce-id-1' }],
        })
        .mockResolvedValueOnce({ VpcEndpoints: [{ VpcEndpointId: 'fake-vpce-id-2' }] }),
    });

    const accelerator = require('../lib/accelerator.ts');
    accelerator.getCentralLogBucketKmsKeyArn = jest.fn().mockReturnValue(Promise.resolve('fake-kms-arn'));
  }

  test('should load VPC IDs and VPCE IDs in network config for Finalize Stage', async () => {
    initializeMock();
    const { context, resourcePrefixes, acceleratorEnv } = testAppUtils();
    const { setAcceleratorStackProps } = require('../utils/app-utils');

    context.stage = AcceleratorStage.FINALIZE;
    const { networkConfig } = (await setAcceleratorStackProps(
      context,
      acceleratorEnv,
      resourcePrefixes,
      'us-east-1',
    )) as AcceleratorStackProps;

    // ${ACCEL_LOOKUP::VPC_ID:OU:Infrastructure} and ${ACCEL_LOOKUP::VPCE_ID:ACCOUNT:Network} are used in
    // snapshot-only/service-control-policies/data-perimeter.json
    // Here are the expected VPC IDs from account under OU Infrastructure - Network and ShareService account
    const expectedAccountVpcIds = {
      '444444444444': ['fake-vpc-id-1', 'fake-vpc-id-2'],
      '555555555555': ['fake-vpc-id-3', 'fake-vpc-id-4'],
    };
    const expectedAccountVpceIds = { '555555555555': ['fake-vpce-id-1', 'fake-vpce-id-2'] }; // expected VPCE ID from network account
    expect(networkConfig.accountVpcIds).toEqual(expectedAccountVpcIds);
    expect(networkConfig.accountVpcEndpointIds).toEqual(expectedAccountVpceIds);
  });

  test('should not load VPC IDs and VPCE IDs in network config for other Stages except for finalize and account stage', async () => {
    initializeMock();
    const { setAcceleratorStackProps } = require('../utils/app-utils');

    const { context, resourcePrefixes, acceleratorEnv } = testAppUtils();

    context.stage = AcceleratorStage.OPERATIONS;
    const { networkConfig } = (await setAcceleratorStackProps(
      context,
      acceleratorEnv,
      resourcePrefixes,
      'us-east-1',
    )) as AcceleratorStackProps;

    expect(networkConfig.accountVpcIds).toEqual(undefined);
    expect(networkConfig.accountVpcEndpointIds).toEqual(undefined);
  });
});
