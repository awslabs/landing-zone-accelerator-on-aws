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

import { CreateEvent, DeleteEvent, UpdateEvent } from '@aws-accelerator/utils/lib/test-util/common/resources';

import { beforeAll, expect, test } from '@jest/globals';

import { IntegrationTest } from '@aws-accelerator/utils/lib/test-util/common/integration-test';
import { RegionalTestSuite } from '@aws-accelerator/utils/lib/test-util/common/test-suite';

import { MacieEnableOrganizationAdminAccountPolicyStatements } from '../../macie-organization-admin-account';

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
  executorRolePolicyStatements: MacieEnableOrganizationAdminAccountPolicyStatements,
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
  });

  test('[UPDATE event]: Should pass when trying to update delegated admin account to the same value', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = UpdateEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.OldResourceProperties['region'] = integrationTest.environment.region;
    event.OldResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);
  });

  test('[DELETE event]: Should pass when deleting the delegated admin account', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = DeleteEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);
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
  });

  test('[UPDATE event]: Should pass when trying to update delegated admin account to the same value', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = UpdateEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;
    event.OldResourceProperties['region'] = integrationTest.environment.region;
    event.OldResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);
  });

  test('[DELETE event]: Should pass when deleting the delegated admin account', async () => {
    const auditAccountId = integrationTest.getAccountId('Audit');
    const event = DeleteEvent;
    event.ResourceProperties['region'] = integrationTest.environment.region;
    event.ResourceProperties['adminAccountId'] = auditAccountId;

    expect(await handler(event)).toEqual(successStatus);
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
