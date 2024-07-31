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
import { GetServiceQuotaCommand, ServiceQuotasClient } from '@aws-sdk/client-service-quotas';
import { getCrossAccountCredentials, setRetryStrategy } from './common-functions';
import { throttlingBackOff } from './throttle';
import { createLogger } from './logger';
const logger = createLogger(['utils-evaluate-limits']);

export async function evaluateLimits(
  region: string,
  accountId: string,
  partition: string,
  roleName: string,
  currentAccountId: string,
  homeRegion: string,
) {
  let codebuildParallelLimit = 3;
  // only check for codebuild limit in pipeline account of homeRegion other regions/accounts does not need codebuild
  if (accountId === process.env['PIPELINE_ACCOUNT_ID'] && region === homeRegion) {
    codebuildParallelLimit = await getLimits('L-2DC20C30', 'codebuild', {
      region,
      accountId,
      partition,
      roleName,
      currentAccountId,
    });
    logger.debug(`CodeBuild limit in account ${accountId} region ${region} is ${codebuildParallelLimit}`);
  }
  const lambdaConcurrencyLimit = await getLimits('L-B99A9384', 'lambda', {
    region,
    accountId,
    partition,
    roleName,
    currentAccountId,
  });

  logger.debug(`Lambda limit in account ${accountId} region ${region} is ${lambdaConcurrencyLimit}`);

  // setting this from environment variables to make changes in runtime easier
  const acceleratorCodebuildParallelBuildLimit = process.env['ACCELERATOR_CODEBUILD_PARALLEL_LIMIT'] ?? '3';
  const acceleratorLambdaConcurrencyLimit = process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] ?? '1000';

  if (
    codebuildParallelLimit < parseInt(acceleratorCodebuildParallelBuildLimit) ||
    lambdaConcurrencyLimit < parseInt(acceleratorLambdaConcurrencyLimit)
  ) {
    const errMsg = `CodeBuild limit in account ${accountId} region ${region} is ${codebuildParallelLimit} and Lambda limit in account ${accountId} region ${region} is ${lambdaConcurrencyLimit}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }
}

async function getLimits(
  quotaCode: string,
  serviceName: string,
  accountMetadata: { region: string; accountId: string; partition: string; roleName: string; currentAccountId: string },
) {
  const serviceQuotasClient = await getServiceQuotasClient(accountMetadata);
  try {
    const result = await throttlingBackOff(() =>
      serviceQuotasClient.send(new GetServiceQuotaCommand({ QuotaCode: quotaCode, ServiceCode: serviceName })),
    );
    return result.Quota?.Value ?? 0;
  } catch (error) {
    const errMsg = `Encountered an error in getting service ${serviceName} limit for quota ${quotaCode}. Error: ${JSON.stringify(
      error,
    )}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }
}

async function getServiceQuotasClient(accountMetadata: {
  region: string;
  accountId: string;
  partition: string;
  roleName: string;
  currentAccountId: string;
}): Promise<ServiceQuotasClient> {
  if (
    accountMetadata.currentAccountId === accountMetadata.accountId ||
    accountMetadata.currentAccountId === process.env['MANAGEMENT_ACCOUNT_ID']
  ) {
    return new ServiceQuotasClient({ retryStrategy: setRetryStrategy(), region: accountMetadata.region });
  } else {
    const crossAccountCredentials = await getCrossAccountCredentials(
      accountMetadata.accountId,
      accountMetadata.region,
      accountMetadata.partition,
      accountMetadata.roleName,
    );
    return new ServiceQuotasClient({
      retryStrategy: setRetryStrategy(),
      region: accountMetadata.region,
      credentials: {
        accessKeyId: crossAccountCredentials.Credentials!.AccessKeyId!,
        secretAccessKey: crossAccountCredentials.Credentials!.SecretAccessKey!,
        sessionToken: crossAccountCredentials.Credentials!.SessionToken!,
      },
    });
  }
}
