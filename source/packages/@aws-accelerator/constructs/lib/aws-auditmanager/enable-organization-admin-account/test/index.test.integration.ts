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

import { AuditManagerClient, GetOrganizationAdminAccountCommand } from '@aws-sdk/client-auditmanager';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import { CreateEvent, DeleteEvent, UpdateEvent } from '@aws-accelerator/utils/lib/test-util/common/resources';
import { AssertPropsType } from '@aws-accelerator/utils/lib/test-util/common/assertion';

import { beforeAll, expect, test } from '@jest/globals';

import { IntegrationTest } from '@aws-accelerator/utils/lib/test-util/common/integration-test';
import { RegionalTestSuite } from '@aws-accelerator/utils/lib/test-util/common/test-suite';

import { AuditManagerOrganizationAdminAccount } from '../../auditmanager-organization-admin-account';
import { handler } from '../index';

const minute = 60000;
jest.setTimeout(2 * minute);

//
// Initialize integration test class
//
const kmsKeyArn = process.env['KMS_KEY_ARN'] ?? undefined;

const integrationTest = new IntegrationTest({
  executorRolePolicyStatements: AuditManagerOrganizationAdminAccount.getCustomResourceRolePolicyStatements(kmsKeyArn),
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

  test('[CREATE event]: Should pass when trying to update delegated admin account to the Audit account along with encryption key', async () => {
    const event = CreateEvent;

    const auditAccountId = integrationTest.getAccountId('Audit');

    event.ResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.ResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.ResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    expect(await handler(event)).toHaveProperty('Status', 'Success');

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { adminAccountId: auditAccountId },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[UPDATE event]: Should pass when trying to update delegated admin account to the Audit account along with encryption key', async () => {
    const event = UpdateEvent;

    const auditAccountId = integrationTest.getAccountId('Audit');

    event.ResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.ResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.ResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    event.OldResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.OldResourceProperties['region'] = integrationTest.environment.region;
    event.OldResourceProperties['adminAccountId'] = auditAccountId;
    event.OldResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.OldResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    expect(await handler(event)).toHaveProperty('Status', 'Success');

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { adminAccountId: auditAccountId },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[DELETE event]: Should pass when trying to update delegated admin account to the Audit account along with encryption key', async () => {
    const event = DeleteEvent;

    const auditAccountId = integrationTest.getAccountId('Audit');

    event.ResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.ResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.ResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    expect(await handler(event)).toHaveProperty('Status', 'Success');

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { adminAccountId: auditAccountId },
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

  test('[CREATE event]: Should pass when trying to update delegated admin account to the Audit account along with encryption key', async () => {
    const event = CreateEvent;

    const auditAccountId = integrationTest.getAccountId('Audit');

    event.ResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.ResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.ResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    expect(await handler(event)).toHaveProperty('Status', 'Success');

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { adminAccountId: auditAccountId },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[UPDATE event]: Should pass when trying to update delegated admin account to the Audit account along with encryption key', async () => {
    const event = UpdateEvent;

    const auditAccountId = integrationTest.getAccountId('Audit');

    event.ResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.ResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.ResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    event.OldResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.OldResourceProperties['region'] = integrationTest.environment.region;
    event.OldResourceProperties['adminAccountId'] = auditAccountId;
    event.OldResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.OldResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    expect(await handler(event)).toHaveProperty('Status', 'Success');

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { adminAccountId: auditAccountId },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('[DELETE event]: Should pass when trying to update delegated admin account to the Audit account along with encryption key', async () => {
    const event = DeleteEvent;

    const auditAccountId = integrationTest.getAccountId('Audit');

    event.ResourceProperties['managementAccountId'] = integrationTest.getAccountId('Management');
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.ResourceProperties['kmsKeyArn'] = kmsKeyArn;
    event.ResourceProperties['solutionId'] = integrationTest.environment.solutionId;

    expect(await handler(event)).toHaveProperty('Status', 'Success');

    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCall({
        expectedResponse: { adminAccountId: auditAccountId },
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

  const client = new AuditManagerClient({ credentials: integrationTest.environment.integrationAccountStsCredentials });
  return {
    serviceName: 'AuditManager',
    apiName: 'ListOrganizationAdminAccounts',
    actualResponse: await throttlingBackOff(() => client.send(new GetOrganizationAdminAccountCommand({}))),
  };
}
