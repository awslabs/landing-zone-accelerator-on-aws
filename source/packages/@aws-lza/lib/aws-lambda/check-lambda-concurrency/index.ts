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

import { LambdaClient, GetAccountSettingsCommand } from '@aws-sdk/client-lambda';
import { setRetryStrategy } from '../../../common/functions';
import { throttlingBackOff } from '../../../common/throttle';
import {
  ICheckLambdaConcurrencyParameter,
  ICheckLambdaConcurrencyModule,
} from '../../../interfaces/aws-lambda/check-lambda-concurrency';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
/**
 * CheckLambdaConcurrency verifies AWS Lambda concurrency limits for an account.
 *
 * This module checks whether an AWS account has sufficient Lambda concurrent execution
 * capacity to meet the required threshold. The module is used to validate
 * Lambda service quotas as a prerequisite check before deploying resources that might
 * require a specific level of Lambda concurrency.
 *
 * @implements {ICheckLambdaConcurrencyModule}
 */
export class CheckLambdaConcurrencyModule implements ICheckLambdaConcurrencyModule {
  /**
   * Main handler method for checking Lambda concurrency limits.
   *
   * This method validates if the specified AWS account has sufficient Lambda
   * concurrent execution limit to meet the required threshold. It connects to the
   * Lambda service in the specified account and region, retrieves the account's
   * concurrency limit, and compares it against the required threshold.
   *
   * @param props {@link ICheckLambdaConcurrencyParameter}
   * @returns Promise resolving to boolean indicating if the account meets the required concurrency limit
   */
  async handler(props: ICheckLambdaConcurrencyParameter): Promise<boolean> {
    const lambdaConcurrencyLimit = await this.getLambdaConcurrencyLimits(props);

    const requiredConcurrency = props.configuration.requiredConcurrency;

    return lambdaConcurrencyLimit >= requiredConcurrency;
  }

  /**
   * Retrieves the Lambda concurrency limits for the specified account.
   *
   * This method connects to the AWS Lambda service and calls the GetAccountSettings
   * API to obtain the account's concurrent execution limit.
   *
   * @param accountMetadata - Object containing account and region information
   * @returns Promise resolving to the account's Lambda concurrency limit as a number
   * @throws Error if unable to retrieve the Lambda concurrency limit
   */
  private async getLambdaConcurrencyLimits(props: ICheckLambdaConcurrencyParameter): Promise<number> {
    const client = new LambdaClient({
      region: props.region,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });
    try {
      const response = await throttlingBackOff(() => client.send(new GetAccountSettingsCommand({})));

      if (!response.AccountLimit?.ConcurrentExecutions) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: API call did not return AccountLimit.ConcurrentExecutions`,
        );
      }

      return response.AccountLimit.ConcurrentExecutions;
    } catch (error) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Encountered an error in getting Lambda concurrency limit.`,
      );
    }
  }
}
