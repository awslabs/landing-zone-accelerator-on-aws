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

import {
  DirectConnectClient,
  DescribeDirectConnectGatewaysCommand,
  UpdateDirectConnectGatewayCommand,
  DirectConnectGatewayState,
} from '@aws-sdk/client-direct-connect';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import { CreateEvent, UpdateEvent, DeleteEvent } from '@aws-accelerator/utils/lib/test-util/common/resources';
import { AssertPropsType } from '@aws-accelerator/utils/lib/test-util/common/assertion';

import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';

import { IntegrationTest } from '@aws-accelerator/utils/lib/test-util/common/integration-test';
import { RegionalTestSuite } from '@aws-accelerator/utils/lib/test-util/common/test-suite';

import { DirectConnectGatewayPolicyStatements } from '../../direct-connect-gateway';

import { handler } from '../index';

const msInMinute = 60000;
jest.setTimeout(2 * msInMinute);

const apiDelayInMinutes = 0.5; // delay before checking Status through API

let directConnectGatewayId: string | undefined;
// variables for testing, name and asn
const randomStr = Math.random().toString(36).substring(2, 8);
const gatewayName = `lza-integ-${randomStr}`;
const gatewayNameUpdated = `${gatewayName}-updated`;
const asn = 65000;

//
// Initialize integration test class
//
const integrationTest = new IntegrationTest({
  executorRolePolicyStatements: DirectConnectGatewayPolicyStatements,
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

  test('[CREATE event]: Should pass when trying to create Direct Connect Gateway', async () => {
    const event = CreateEvent;

    event.ResourceProperties['gatewayName'] = gatewayName;
    event.ResourceProperties['asn'] = asn;

    const response = await handler(event);
    directConnectGatewayId = response?.PhysicalResourceId;

    expect(response).toHaveProperty('Status', 'SUCCESS');
    expect(directConnectGatewayId).toBeDefined();

    // Call DX Client for verification
    const assertProps = await getAssertProperties(directConnectGatewayId!, apiDelayInMinutes);
    const gateway = assertProps.actualResponse['directConnectGateways'][0];

    // Verify DXGW is created and available
    expect(gateway.amazonSideAsn).toBe(asn);
    expect(gateway.directConnectGatewayId).toBe(directConnectGatewayId);
    expect(gateway.directConnectGatewayName).toBe(gatewayName);
    expect(gateway.directConnectGatewayState).toBe(DirectConnectGatewayState.available);
  });

  test('[UPDATE event]: Should pass with error message when changing the ASN of Direct Connect Gateway', async () => {
    const event = UpdateEvent;

    event.PhysicalResourceId = directConnectGatewayId!;

    event.OldResourceProperties['gatewayName'] = gatewayName;
    event.OldResourceProperties['asn'] = asn;

    event.ResourceProperties['gatewayName'] = gatewayName;
    event.ResourceProperties['asn'] = asn + 1;

    // Spy on the send method
    const sendSpy = jest.spyOn(DirectConnectClient.prototype, 'send');

    // Verify that no UpdateDirectConnectGateway command was sent
    expect(sendSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.any(UpdateDirectConnectGatewayCommand),
      }),
    );
  });

  test('[UPDATE event]: Should pass when changing the name of Direct Connect Gateway', async () => {
    const event = UpdateEvent;

    event.PhysicalResourceId = directConnectGatewayId!;

    event.OldResourceProperties['gatewayName'] = gatewayName;

    event.ResourceProperties['gatewayName'] = gatewayNameUpdated;

    expect(await handler(event)).toHaveProperty('Status', 'SUCCESS');

    // Call DX Client for verification
    const assertProps = await getAssertProperties(directConnectGatewayId!, apiDelayInMinutes);
    const gateway = assertProps.actualResponse['directConnectGateways'][0];

    // Verify DXGW is renamed
    expect(gateway.directConnectGatewayId).toBe(directConnectGatewayId);
    expect(gateway.directConnectGatewayName).toBe(gatewayNameUpdated);
    expect(gateway.directConnectGatewayState).toBe(DirectConnectGatewayState.available);
  });

  test('[DELETE event]: Should pass when deleting Direct Connect Gateway', async () => {
    const event = DeleteEvent;

    event.ResourceProperties['gatewayName'] = gatewayNameUpdated;
    event.ResourceProperties['asn'] = asn;
    event.PhysicalResourceId = directConnectGatewayId!;

    expect(await handler(event)).toHaveProperty('Status', 'SUCCESS');

    // Verift DXGW is in deleted||deleting
    const assertProps = await getAssertProperties(directConnectGatewayId!, apiDelayInMinutes);
    const gateway = assertProps.actualResponse['directConnectGateways'][0];

    expect(gateway.directConnectGatewayId).toBe(directConnectGatewayId);
    expect(gateway.directConnectGatewayName).toBe(gatewayNameUpdated);
    // Expect a deleting or deleted status
    expect([DirectConnectGatewayState.deleted, DirectConnectGatewayState.deleting]).toContain(
      gateway.directConnectGatewayState,
    );
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
 * @param {string} directConnectGatewayId - The ID of the Direct Connect Gateway to describe
 * @param {number} [delayInMinutes] - Optional delay in minutes before making the API call
 * @returns {Promise<AssertPropsType>} Object containing service details and API response
 */
async function getAssertProperties(directConnectGatewayId: string, delayInMinutes?: number): Promise<AssertPropsType> {
  if (delayInMinutes) {
    await integrationTest.delay(delayInMinutes * 60000);
  }

  const client = new DirectConnectClient({ credentials: integrationTest.environment.integrationAccountStsCredentials });
  return {
    serviceName: 'DirectConnect',
    apiName: 'DescribeDirectConnectGatewaysCommand',
    actualResponse: await throttlingBackOff(() =>
      client.send(
        new DescribeDirectConnectGatewaysCommand({
          directConnectGatewayId,
        }),
      ),
    ),
  };
}
