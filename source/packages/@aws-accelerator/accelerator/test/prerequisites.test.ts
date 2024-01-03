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

import { checkPrerequisiteParameters, main } from '../lib/prerequisites';
import { describe, test, beforeEach, afterAll, jest, expect, afterEach } from '@jest/globals';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { GetServiceQuotaCommand, ServiceQuotasClient } from '@aws-sdk/client-service-quotas';

import * as path from 'path';

let stsMock: AwsClientStub<STSClient>;
let serviceQuotasMock: AwsClientStub<ServiceQuotasClient>;

describe('skip prerequisites', () => {
  const OLD_ENV = process.env;
  const OLD_ARGS = process.argv;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
    process.argv = [...OLD_ARGS]; // Make a copy
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old env
    process.argv = OLD_ARGS; // Restore old args
  });
  test('nothing runs', async () => {
    // Set the variables
    process.env['ACCELERATOR_SKIP_PREREQUISITES'] = 'true';
    process.argv = [
      'ts-node',
      'packages/@aws-accelerator/accelerator/lib/prerequisites.ts',
      '--config-dir',
      '/test/config/accel006_config',
      '--partition',
      'aws',
      '--account',
      '111111111111',
      '--region',
      'us-east-2',
    ];
  });
});

describe('test inputs to function', () => {
  test('no account specified but region specified', async () => {
    expect(async () => {
      await main(undefined, 'region', true, '/test/config/accel006_config', 'aws');
    }).rejects.toThrow();
  });
  test('no minimal, no account specified but region specified', async () => {
    expect(async () => {
      await main(undefined, 'region', false, '/test/config/accel006_config', 'aws');
    }).rejects.toThrow();
  });
  test('minimal specified account and region not specified', async () => {
    expect(async () => {
      await main(undefined, undefined, true, '/test/config/accel006_config', 'aws');
    }).rejects.toThrow();
  });
  test('all valid inputs', () => {
    const configDirPath = path.join(__dirname, 'configs/snapshot-only/');
    expect(checkPrerequisiteParameters(undefined, undefined, true, configDirPath, 'aws')).toBeTruthy();
  });
});

describe('run prerequisites', () => {
  beforeEach(() => {
    stsMock = mockClient(STSClient);
    serviceQuotasMock = mockClient(ServiceQuotasClient);
  });
  afterEach(() => {
    stsMock.reset();
    serviceQuotasMock.reset();
  });

  test('account region specific run', async () => {
    // Set the variables
    const configDirPath = path.join(__dirname, 'configs/snapshot-only/');
    process.env['ACCELERATOR_SKIP_PREREQUISITES'] = 'false';
    process.argv = [
      'ts-node',
      'packages/@aws-accelerator/accelerator/lib/prerequisites.ts',
      '--config-dir',
      configDirPath,
      '--partition',
      'aws',
      '--account',
      '111111111111',
      '--region',
      'us-east-2',
    ];
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '111111111111',
    });
    serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-2DC20C30', ServiceCode: 'codebuild' }).resolves({
      Quota: { Value: 10 },
    });
    serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-B99A9384', ServiceCode: 'lambda' }).resolves({
      Quota: { Value: 1000 },
    });
    const result = await main('111111111111', 'us-east-2', false, configDirPath, 'aws');
    expect(result).toBeUndefined();
  });
  test('minimal run', async () => {
    // Set the variables
    const configDirPath = path.join(__dirname, 'configs/snapshot-only/');
    process.env['ACCELERATOR_SKIP_PREREQUISITES'] = 'false';
    process.argv = [
      'ts-node',
      'packages/@aws-accelerator/accelerator/lib/prerequisites.ts',
      '--config-dir',
      configDirPath,
      '--partition',
      'aws',
      '--minimal',
    ];
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '111111111111',
    });
    serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-2DC20C30', ServiceCode: 'codebuild' }).resolves({
      Quota: { Value: 10 },
    });
    serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-B99A9384', ServiceCode: 'lambda' }).resolves({
      Quota: { Value: 1000 },
    });
    const result = await main(undefined, undefined, true, configDirPath, 'aws');
    expect(result).toBeUndefined();
  });
  test('build run', async () => {
    // Set the variables
    const configDirPath = path.join(__dirname, 'configs/snapshot-only/');
    process.env['ACCELERATOR_SKIP_PREREQUISITES'] = 'false';
    process.argv = [
      'ts-node',
      'packages/@aws-accelerator/accelerator/lib/prerequisites.ts',
      '--config-dir',
      configDirPath,
      '--partition',
      'aws',
    ];
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '111111111111',
    });
    stsMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'fake-access-key',
        SecretAccessKey: 'fake-secret-key',
        SessionToken: 'fake-session-token',
        Expiration: new Date(Date.now() + 3600 * 1000),
      },
    });
    serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-2DC20C30', ServiceCode: 'codebuild' }).resolves({
      Quota: { Value: 10 },
    });
    serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-B99A9384', ServiceCode: 'lambda' }).resolves({
      Quota: { Value: 1000 },
    });
    const result = await main(undefined, undefined, false, configDirPath, 'aws');
    expect(result).toBeUndefined();
  });
});
