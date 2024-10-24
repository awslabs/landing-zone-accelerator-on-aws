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

import { GuardDutyClient, ListOrganizationAdminAccountsCommand } from '@aws-sdk/client-guardduty';

import { beforeAll, expect, test } from '@jest/globals';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { AssertPropsType } from '@aws-accelerator/utils/lib/test-util/common/assertion';
import { IntegrationTest } from '@aws-accelerator/utils/lib/test-util/common/integration-test';
import { RegionalTestSuite } from '@aws-accelerator/utils/lib/test-util/common/test-suite';
import { CreateEvent, DeleteEvent, UpdateEvent } from '@aws-accelerator/utils/lib/test-util/common/resources';

import { GuardDutyEnableOrganizationAdminAccountPolicyStatements } from '../../guardduty-organization-admin-account';

import { handler } from '../index';

/**
 * Successful return code for the custom resource
 */
const successStatus = { Status: 'Success', StatusCode: 200 };

const minute = 60000;
jest.setTimeout(2 * minute);

//
// Initialize integration test class
//
const integrationTest = new IntegrationTest({
  executorRolePolicyStatements: GuardDutyEnableOrganizationAdminAccountPolicyStatements,
});

RegionalTestSuite['sampleConfig:us-east-1']!.suite(RegionalTestSuite['sampleConfig:us-east-1']!.suiteName, () => {
  beforeAll(async () => {
    //
    // Setup Integration account environment
    //
    await integrationTest.setup();
  });

  afterAll(async () => {
    //
    // Cleanup of environment
    //
    await cleanup();
  });

  test('[CREATE event]: Should pass when adding Management account as delegated admin account', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = CreateEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { AdminAccounts: [{ AdminAccountId: auditAccountId, AdminStatus: 'ENABLED' }] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[UPDATE event]: Should pass when trying to update delegated admin account to the same value', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = UpdateEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.OldResourceProperties['region'] = integrationTest.environment.region;
    event.OldResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { AdminAccounts: [{ AdminAccountId: auditAccountId, AdminStatus: 'ENABLED' }] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[DELETE event]: Should pass when deleting the delegated admin account', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = DeleteEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);

    const assertProps = await getAssertProperties(1);
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { AdminAccounts: [] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });
});

RegionalTestSuite['sampleConfig:us-west-2']!.suite(RegionalTestSuite['sampleConfig:us-west-2']!.suiteName, () => {
  beforeAll(async () => {
    //
    // Setup Integration account environment
    //
    await integrationTest.setup();
  });

  afterAll(async () => {
    //
    // Cleanup of environment
    //
    await cleanup();
  });

  test('[CREATE event]: Should pass when adding Audit account as delegated admin account', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = CreateEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { AdminAccounts: [{ AdminAccountId: auditAccountId, AdminStatus: 'ENABLED' }] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[UPDATE event]: Should pass when trying to update delegated admin account to the same value', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = UpdateEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.OldResourceProperties['region'] = integrationTest.environment.region;
    event.OldResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { AdminAccounts: [{ AdminAccountId: auditAccountId, AdminStatus: 'ENABLED' }] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[DELETE event]: Should pass when deleting the delegated admin account', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = DeleteEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);

    const assertProps = await getAssertProperties(1);
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { AdminAccounts: [] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });
});

/**
 * Function to perform integration test environment cleanup.
 *
 * @description
 * This function will reset the integration test environment to perform testing during next cycle of testing.
 */
async function cleanup(): Promise<void> {
  //
  // Cleanup integration test environment
  //
  await integrationTest.cleanup();
}

/**
 * Function to get assert API properties
 * @returns {@link AssertPropsType}
 */
async function getAssertProperties(delayInMinutes?: number): Promise<AssertPropsType> {
  if (delayInMinutes) {
    // Since some API might take time to change the status hence a delay is introduces here, adjust delay time accordingly
    await integrationTest.delay(delayInMinutes * 60000);
  }

  const client = new GuardDutyClient({ credentials: integrationTest.environment.integrationAccountStsCredentials });
  return {
    serviceName: 'GuardDuty',
    apiName: 'ListOrganizationAdminAccounts',
    actualResponse: await throttlingBackOff(() => client.send(new ListOrganizationAdminAccountsCommand({}))),
  };
}
