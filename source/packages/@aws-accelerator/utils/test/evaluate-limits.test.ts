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
import { test, beforeEach, expect, afterEach } from '@jest/globals';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { GetServiceQuotaCommand, ServiceQuotasClient } from '@aws-sdk/client-service-quotas';
import { evaluateLimits } from '../lib/evaluate-limits';

let stsMock: AwsClientStub<STSClient>;
let serviceQuotasMock: AwsClientStub<ServiceQuotasClient>;

beforeEach(() => {
  stsMock = mockClient(STSClient);
  serviceQuotasMock = mockClient(ServiceQuotasClient);
});
afterEach(() => {
  stsMock.reset();
  serviceQuotasMock.reset();
});

test('evaluateLimits everything works in same account', async () => {
  stsMock.on(GetCallerIdentityCommand).resolves({
    Account: '111111111111',
  });
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-2DC20C30', ServiceCode: 'codebuild' }).resolves({
    Quota: { Value: 10 },
  });
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-B99A9384', ServiceCode: 'lambda' }).resolves({
    Quota: { Value: 1000 },
  });
  const result = await evaluateLimits('us-east-1', '111111111111', 'aws', 'test', '111111111111');
  expect(result).toBeUndefined();
});

test('evaluateLimits low limits in same account', async () => {
  stsMock.on(GetCallerIdentityCommand).resolves({
    Account: '111111111111',
  });
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-2DC20C30', ServiceCode: 'codebuild' }).resolves({});
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-B99A9384', ServiceCode: 'lambda' }).resolves({
    Quota: { Value: 10 },
  });
  await expect(evaluateLimits('us-east-1', '111111111111', 'aws', 'test', '111111111111')).rejects.toThrowError();
});

test('evaluateLimits serviceQuota api error in same account', async () => {
  stsMock.on(GetCallerIdentityCommand).resolves({
    Account: '111111111111',
  });
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-2DC20C30', ServiceCode: 'codebuild' }).rejects();
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-B99A9384', ServiceCode: 'lambda' }).resolves({
    Quota: { Value: 10 },
  });
  await expect(evaluateLimits('us-east-1', '111111111111', 'aws', 'test', '111111111111')).rejects.toThrowError();
});

test('evaluateLimits everything works in cross account', async () => {
  stsMock.on(GetCallerIdentityCommand).resolves({
    Account: '111111111111',
  });
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-2DC20C30', ServiceCode: 'codebuild' }).resolves({
    Quota: { Value: 10 },
  });
  serviceQuotasMock.on(GetServiceQuotaCommand, { QuotaCode: 'L-B99A9384', ServiceCode: 'lambda' }).resolves({
    Quota: { Value: 1000 },
  });
  stsMock.on(AssumeRoleCommand).resolves({
    Credentials: {
      AccessKeyId: 'fake-access-key',
      SecretAccessKey: 'fake-secret-key',
      SessionToken: 'fake-session-token',
      Expiration: new Date(Date.now() + 3600 * 1000),
    },
  });
  const result = await evaluateLimits('us-east-1', '222222222222', 'aws', 'test', '111111111111');
  expect(result).toBeUndefined();
});
