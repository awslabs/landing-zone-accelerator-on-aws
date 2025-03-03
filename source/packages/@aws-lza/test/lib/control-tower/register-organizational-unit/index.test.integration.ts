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
import path from 'path';
import { beforeAll, expect, test } from '@jest/globals';
import { createLogger } from '../../../../common/logger';
import { IntegrationTest } from '../../../helpers/integration-test';
import { RegionalTestSuite } from '../../../helpers/test-suite';
import { RegisterOrganizationalUnitModule } from '../../../../lib/control-tower/register-organizational-unit';
import {
  CreateOrganizationalUnitCommand,
  DeleteOrganizationalUnitCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import {
  getOrganizationalUnitArn,
  getOrganizationalUnitIdByPath,
  getOrganizationRootId,
  setRetryStrategy,
} from '../../../../common/functions';
import { throttlingBackOff } from '../../../../common/throttle';
import { AssertPropsType } from '../../../helpers/assertion';
import { ControlTowerClient, ListEnabledBaselinesCommand } from '@aws-sdk/client-controltower';
import { STSClient } from '@aws-sdk/client-sts';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const testOuItems = {
  newOuName: 'RegisterOuModuleIntegrationTestOu',
  existingOuName: 'Root',
  existingNestedOuName: 'Level1/Level2-02/Level3-01/Level4-01/Level5-01',
  existingOuResponsePattern: new RegExp(
    `AWS Organizations organizational unit \\(OU\\) \\".*?\\" is already registered with AWS Control Tower`,
  ),
  newOuResponsePattern: new RegExp(
    `Registration of AWS Organizations organizational unit \\(OU\\) \\".*?\\" with AWS Control Tower is successful.`,
  ),
};
let testOuId: string | undefined;
let testOuArn: string | undefined;
let controlTowerClient: ControlTowerClient;
let organizationClient: OrganizationsClient;

const minute = 60000;
jest.setTimeout(10 * minute);

//
// Initialize integration test class
//
const integrationTest = new IntegrationTest();

RegionalTestSuite['sampleConfig:us-east-1']!.suite(RegionalTestSuite['sampleConfig:us-east-1']!.suiteName, () => {
  beforeAll(async () => {
    //
    // Setup Integration account environment
    //
    await integrationTest.prepare();
  });

  test('should skip registration becasue ou already registered', async () => {
    // Setup
    await prepare(testOuItems.existingOuName);

    // Execute && Verify
    expect(
      await new RegisterOrganizationalUnitModule().handler({
        configuration: {
          name: testOuItems.existingOuName,
        },
        operation: 'register-organizational-unit',
        partition: integrationTest.environment.partition,
        region: integrationTest.environment.region,
        credentials: integrationTest.environment.integrationAccountStsCredentials,
      }),
    ).toMatch(testOuItems.existingOuResponsePattern);

    // Assert
    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCallPartial({
        expectedResponse: { enabledBaselines: [{ targetIdentifier: testOuArn }] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('should skip registration becasue ou already registered for nested ou name', async () => {
    // Setup
    await prepare(testOuItems.existingNestedOuName);

    // Execute && Verify
    expect(
      await new RegisterOrganizationalUnitModule().handler({
        configuration: {
          name: testOuItems.existingNestedOuName,
        },
        operation: 'register-organizational-unit',
        partition: integrationTest.environment.partition,
        region: integrationTest.environment.region,
        credentials: integrationTest.environment.integrationAccountStsCredentials,
      }),
    ).toMatch(testOuItems.existingOuResponsePattern);

    // Assert
    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCallPartial({
        expectedResponse: { enabledBaselines: [{ targetIdentifier: testOuArn }] },
        ...assertProps,
      }),
    ).toBeTruthy();
  });

  test('should register ou successfully', async () => {
    // Setup
    await prepare(testOuItems.newOuName);

    // Execute && Verify
    expect(
      await new RegisterOrganizationalUnitModule().handler({
        configuration: {
          name: testOuItems.newOuName,
        },
        operation: 'register-organizational-unit',
        partition: integrationTest.environment.partition,
        region: integrationTest.environment.region,
        credentials: integrationTest.environment.integrationAccountStsCredentials,
      }),
    ).toMatch(testOuItems.newOuResponsePattern);

    // Assert
    const assertProps = await getAssertProperties();
    expect(
      await integrationTest.assertion.assertApiCallPartial({
        expectedResponse: { enabledBaselines: [{ targetIdentifier: testOuArn }] },
        ...assertProps,
      }),
    ).toBeTruthy();

    // Cleanup
    await cleanup();
  });
});

/**
 * Function to prepare integration test environment.
 *
 * @description
 * This function will perform any pre-requisite for the test.
 */
async function prepare(ouName: string): Promise<void> {
  controlTowerClient = new ControlTowerClient({
    region: integrationTest.environment.region,
    customUserAgent: integrationTest.environment.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: integrationTest.environment.integrationAccountStsCredentials,
  });

  organizationClient = new OrganizationsClient({
    region: integrationTest.environment.region,
    customUserAgent: integrationTest.environment.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: integrationTest.environment.integrationAccountStsCredentials,
  });

  const formattedOuName = ouName.toLowerCase() === 'root' ? `Root/${ouName}` : ouName;

  if (formattedOuName === testOuItems.newOuName) {
    logger.info(`Creating organizational unit ${formattedOuName}.`);
    const organizationalRootId = await getOrganizationRootId(organizationClient);

    const response = await throttlingBackOff(() =>
      organizationClient.send(
        new CreateOrganizationalUnitCommand({
          Name: formattedOuName,
          ParentId: organizationalRootId,
        }),
      ),
    );
    logger.info(`Organizational unit ${formattedOuName} created successfully.`);
    testOuId = response.OrganizationalUnit?.Id;
    testOuArn = response.OrganizationalUnit?.Arn;
  } else {
    logger.info(`Getting organizational unit id for ${formattedOuName}.`);
    testOuId = await getOrganizationalUnitIdByPath(organizationClient, formattedOuName);
    logger.info(`Organizational unit id for ${formattedOuName} is ${testOuId}.`);

    logger.info(`Getting organizational unit arn for ${formattedOuName}.`);
    testOuArn = await getOrganizationalUnitArn(
      organizationClient,
      new STSClient({
        region: integrationTest.environment.region,
        customUserAgent: integrationTest.environment.solutionId,
        retryStrategy: setRetryStrategy(),
        credentials: integrationTest.environment.integrationAccountStsCredentials,
      }),
      testOuId!,
      integrationTest.environment.partition,
    );
    logger.info(`Organizational unit arn for ${formattedOuName} is ${testOuArn}.`);
  }

  if (!testOuId) {
    throw new Error(`Organizational unit with name ${formattedOuName} not found, integration test preparation failed.`);
  }

  if (!testOuArn) {
    throw new Error(`Organizational unit with name ${formattedOuName} not found, integration test preparation failed.`);
  }
}

/**
 * Function to perform integration test environment cleanup.
 *
 * @description
 * This function will reset the integration test environment to perform testing during next cycle of testing.
 */
async function cleanup(): Promise<void> {
  logger.info(`Deleting organization unit ${testOuId}.`);
  await throttlingBackOff(() =>
    organizationClient.send(
      new DeleteOrganizationalUnitCommand({
        OrganizationalUnitId: testOuId,
      }),
    ),
  );
  logger.info(`Organization unit ${testOuId} deleted successfully.`);
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
  return {
    serviceName: 'Organizations',
    apiName: 'ListEnabledBaselines',
    actualResponse: await throttlingBackOff(() =>
      controlTowerClient.send(new ListEnabledBaselinesCommand({ filter: { targetIdentifiers: [testOuArn!] } })),
    ),
  };
}
