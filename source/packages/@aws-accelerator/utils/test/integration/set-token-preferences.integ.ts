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
import { setStsTokenPreferences } from '../../lib/set-token-preferences';
import { IAMClient, SetSecurityTokenServicePreferencesCommand, GetAccountSummaryCommand } from '@aws-sdk/client-iam';
import { throttlingBackOff } from '../../lib/throttle';
import { setRetryStrategy } from '../../lib/common-functions';
import { expect, it } from '@jest/globals';

/**
 * Run the test to see if the function is working in a single account.
 * This code will find out what version of token is being used and change it to version 1 if necessary
 * Then it will run function to see if the token has changed to version 2.
 * Put the account back in original state.
 * To run this test, run the command below:
 */
// yarn jest --testMatch [ "**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test|integ).[jt]s?(x)" ]

const iamClient = new IAMClient({ retryStrategy: setRetryStrategy() });

//get current token version
async function getTokenVersion() {
  const response = await throttlingBackOff(() => iamClient.send(new GetAccountSummaryCommand({})));
  return response.SummaryMap!['GlobalEndpointTokenVersion'];
}

// set token version to 1
async function setTokenVersion(version: number) {
  const knownVersions = [1, 2];
  if (knownVersions.includes(version)) {
    await throttlingBackOff(() =>
      iamClient.send(
        new SetSecurityTokenServicePreferencesCommand({
          GlobalEndpointTokenVersion: `v${version}Token`,
        }),
      ),
    );
  } else {
    throw new Error(`Unknown token version: ${version}`);
  }
}

it('set token preferences from 1 to 2', async () => {
  // Given
  const originalTokenVersion = await getTokenVersion();
  console.log(`Found original version to be: ${originalTokenVersion}`);
  if (originalTokenVersion !== 1) {
    await setTokenVersion(1);
  }
  await setStsTokenPreferences('testAccount', 'region');
  // When
  const testVersion = await getTokenVersion();
  console.log(`Found test version to be: ${testVersion}`);

  // Then
  expect(testVersion).toBe(2);

  //Cleanup
  //revert the token to original
  await setTokenVersion(originalTokenVersion);
});

it('set token preferences from 2 to 2', async () => {
  // Given
  const originalTokenVersion = await getTokenVersion();
  console.log(`Found original version to be: ${originalTokenVersion}`);
  if (originalTokenVersion !== 2) {
    await setTokenVersion(2);
  }
  await setStsTokenPreferences('testAccount', 'region');
  // When
  const testVersion = await getTokenVersion();
  console.log(`Found test version to be: ${testVersion}`);

  // Then
  expect(testVersion).toBe(2);

  //Cleanup
  //revert the token to original
  await setTokenVersion(originalTokenVersion);
});
