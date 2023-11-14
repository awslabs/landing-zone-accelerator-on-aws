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
import { setStsTokenPreferences, setTokenVersion } from '../lib/set-token-preferences';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { IAMClient, SetSecurityTokenServicePreferencesCommand, GetAccountSummaryCommand } from '@aws-sdk/client-iam';
import { expect, it, beforeEach, afterEach, test } from '@jest/globals';

let iamMock: AwsClientStub<IAMClient>;
beforeEach(() => {
  iamMock = mockClient(IAMClient);
});
afterEach(() => {
  iamMock.reset();
});

it('does not set the token preferences', async () => {
  //Given
  iamMock.on(GetAccountSummaryCommand).resolves({
    SummaryMap: {
      AccessKeysPerUserQuota: 2,
      AccountAccessKeysPresent: 1,
      AccountMFAEnabled: 0,
      AccountSigningCertificatesPresent: 0,
      AttachedPoliciesPerGroupQuota: 10,
      AttachedPoliciesPerRoleQuota: 10,
      AttachedPoliciesPerUserQuota: 10,
      GlobalEndpointTokenVersion: 2,
      GroupPolicySizeQuota: 5120,
      Groups: 15,
      GroupsPerUserQuota: 10,
      GroupsQuota: 100,
      MFADevices: 6,
      MFADevicesInUse: 3,
      Policies: 8,
      PoliciesQuota: 1000,
      PolicySizeQuota: 5120,
      PolicyVersionsInUse: 22,
      PolicyVersionsInUseQuota: 10000,
      ServerCertificates: 1,
      ServerCertificatesQuota: 20,
      SigningCertificatesPerUserQuota: 2,
      UserPolicySizeQuota: 2048,
      Users: 27,
      UsersQuota: 5000,
      VersionsPerPolicyQuota: 5,
    },
  });
  iamMock.on(SetSecurityTokenServicePreferencesCommand).resolves({});

  //when
  const response = await setStsTokenPreferences('123456789012', 'region');

  // then - no response from SetSecurityTokenServicePreferences API
  expect(response).toBeUndefined();
});

it('sets the token preferences', async () => {
  //Given
  iamMock.on(GetAccountSummaryCommand).resolves({
    SummaryMap: {
      AccessKeysPerUserQuota: 2,
      AccountAccessKeysPresent: 1,
      AccountMFAEnabled: 0,
      AccountSigningCertificatesPresent: 0,
      AttachedPoliciesPerGroupQuota: 10,
      AttachedPoliciesPerRoleQuota: 10,
      AttachedPoliciesPerUserQuota: 10,
      GlobalEndpointTokenVersion: 1,
      GroupPolicySizeQuota: 5120,
      Groups: 15,
      GroupsPerUserQuota: 10,
      GroupsQuota: 100,
      MFADevices: 6,
      MFADevicesInUse: 3,
      Policies: 8,
      PoliciesQuota: 1000,
      PolicySizeQuota: 5120,
      PolicyVersionsInUse: 22,
      PolicyVersionsInUseQuota: 10000,
      ServerCertificates: 1,
      ServerCertificatesQuota: 20,
      SigningCertificatesPerUserQuota: 2,
      UserPolicySizeQuota: 2048,
      Users: 27,
      UsersQuota: 5000,
      VersionsPerPolicyQuota: 5,
    },
  });
  iamMock.on(SetSecurityTokenServicePreferencesCommand).resolves({});

  //when
  const response = await setStsTokenPreferences('123456789012', 'region');

  // then - no response from SetSecurityTokenServicePreferences API
  expect(response).toBeUndefined();
});

test('throws error on GetAccountSummary', async () => {
  iamMock.on(GetAccountSummaryCommand).rejects();
  await expect(setStsTokenPreferences('123456789012', 'region')).rejects.toThrowError('{}');
});

test('throws error on SetSecurityTokenServicePreferencesCommand', async () => {
  // given
  iamMock
    .on(SetSecurityTokenServicePreferencesCommand, {
      GlobalEndpointTokenVersion: 'v2Token',
    })
    .rejects();
  // when and then
  await expect(setTokenVersion(new IAMClient(), '123456789012')).rejects.toThrowError('{}');
});
