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

import { AccountsConfig, OrganizationConfig } from '@aws-accelerator/config';
import { mockClient } from 'aws-sdk-client-mock';
import { EC2Client, DescribeVpcsCommand, DescribeVpcEndpointsCommand } from '@aws-sdk/client-ec2';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { AcceleratorResourcePrefixes, setResourcePrefixes, setAcceleratorEnvironment } from '../utils/app-utils';
import { describe, expect, test, vi } from 'vitest';
import * as path from 'path';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';

function testAppUtils() {
  const context = {
    configDirPath: path.join(__dirname, `configs/snapshot-only`),
    partition: 'aws',
    stage: AcceleratorStage.ACCOUNTS,
  };
  // Set various resource name prefixes used in code base
  const resourcePrefixes = setResourcePrefixes(process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator');

  // Set accelerator environment variables
  const acceleratorEnv = setAcceleratorEnvironment(process.env, resourcePrefixes);
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
    AccountsConfig.prototype.loadAccountIds = vi
      .fn<
        (
          partition: string,
          enableSingleAccountMode: boolean,
          isOrgsEnabled: boolean,
          accountConfig: AccountsConfig,
        ) => Promise<void>
      >()
      .mockResolvedValue();

    OrganizationConfig.prototype.loadOrganizationalUnitIds = vi
      .fn<
        (
          partition: string,
          managementAccountCredentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
          loadFromDynamoDbTable?: boolean,
        ) => Promise<void>
      >()
      .mockResolvedValue();

    // Mock STS Client
    const stsMock = mockClient(STSClient);
    stsMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'fake-cred',
        SecretAccessKey: 'fake-cred',
        SessionToken: 'fake-cred',
        Expiration: new Date(),
      },
    });
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '123456789012',
    });

    // Mock EC2 Client
    const ec2Mock = mockClient(EC2Client);

    // Mock DescribeVpcs responses
    ec2Mock
      .on(DescribeVpcsCommand)
      .resolvesOnce({
        Vpcs: [{ VpcId: 'fake-vpc-id-1' }],
      })
      .resolvesOnce({
        Vpcs: [{ VpcId: 'fake-vpc-id-2' }],
      })
      .resolvesOnce({
        Vpcs: [{ VpcId: 'fake-vpc-id-3' }],
      })
      .resolvesOnce({
        Vpcs: [{ VpcId: 'fake-vpc-id-4' }],
      });

    // Mock DescribeVpcEndpoints responses
    ec2Mock
      .on(DescribeVpcEndpointsCommand)
      .resolvesOnce({
        VpcEndpoints: [{ VpcEndpointId: 'fake-vpce-id-1' }],
      })
      .resolvesOnce({
        VpcEndpoints: [{ VpcEndpointId: 'fake-vpce-id-2' }],
      });

    vi.doMock('../lib/accelerator.ts', () => ({
      ...vi.importActual('../lib/accelerator.ts'),
      getCentralLogBucketKmsKeyArn: vi.fn().mockReturnValue(Promise.resolve('fake-kms-arn')),
    }));
  }

  test('should load VPC IDs and VPCE IDs in network config for Finalize Stage', async () => {
    initializeMock();
    const { context, resourcePrefixes, acceleratorEnv } = testAppUtils();
    const { setAcceleratorStackProps } = await import('../utils/app-utils');

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
    const { setAcceleratorStackProps } = await import('../utils/app-utils');

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
