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

import { IAMClient, SetSecurityTokenServicePreferencesCommand, GetAccountSummaryCommand } from '@aws-sdk/client-iam';
import { throttlingBackOff } from './throttle';
import { setRetryStrategy } from './common-functions';
import { createLogger } from './logger';
const logger = createLogger(['utils-set-token-preferences']);

export async function setStsTokenPreferences(account: string, globalRegion: string) {
  const iamClient = new IAMClient({ retryStrategy: setRetryStrategy(), region: globalRegion });
  try {
    const getAccountSummary = await throttlingBackOff(() => iamClient.send(new GetAccountSummaryCommand({})));
    if (getAccountSummary.SummaryMap!['GlobalEndpointTokenVersion'] !== 2) {
      logger.debug(`Setting the account ${account} to have STS version 2 token`);
      await setTokenVersion(iamClient, account);
    }
    logger.debug(`Account ${account} has STS version 2 token. No action will be taken`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    const errMsg = `There was an error getting account summary for account ${account}. Error: ${JSON.stringify(e)}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }
}

export async function setTokenVersion(iamClient: IAMClient, account: string) {
  try {
    await throttlingBackOff(() =>
      iamClient.send(
        new SetSecurityTokenServicePreferencesCommand({
          GlobalEndpointTokenVersion: 'v2Token',
        }),
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    const errMsg = `There was an error setting token version to v2 for account ${account}. Error: ${JSON.stringify(e)}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }
}
