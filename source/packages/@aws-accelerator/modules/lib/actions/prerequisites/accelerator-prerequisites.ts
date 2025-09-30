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

import { checkLambdaConcurrency, ICheckLambdaConcurrencyParameter } from '../../../../../@aws-lza/index';
import { getCredentials } from '../../../../../@aws-lza/common/functions';
import { ModuleParams } from '../../../models/types';
import { AcceleratorEnvironment } from '../../../../../@aws-lza/common/types';
import { DefaultMinimumLambdaConcurrencyThreshold } from '../../../models/constants';

export abstract class AcceleratorPrerequisites {
  public static async execute(params: ModuleParams): Promise<string> {
    const accountIds = params.moduleRunnerParameters.organizationAccounts.map(account => account.Id);
    const regions = params.moduleRunnerParameters.configs.globalConfig.enabledRegions;

    // Check lambda concurrency in all accounts/regions
    const environments: AcceleratorEnvironment[] = [];
    for (const accountId of accountIds) {
      for (const region of regions) {
        if (accountId) {
          environments.push({ accountId: accountId, region });
        }
      }
    }

    // Batch API calls
    const batchSize = params.runnerParameters.maxConcurrentExecution;
    const responses: string[] = [];
    for (let i = 0; i < environments.length; i += batchSize) {
      const batchPromises = environments.slice(i, i + batchSize).map(async (accountParams): Promise<string | null> => {
        const meetsPrerequisites = await this.checkLambdaConcurrency(
          params,
          accountParams.accountId,
          accountParams.region,
        );
        if (!meetsPrerequisites) {
          return `Lambda concurrency limit for account ${accountParams.accountId} in region ${accountParams.region} is insufficient`;
        }
        return null;
      });
      responses.push(
        ...(await Promise.all(batchPromises)).filter((str): str is string => {
          return typeof str === 'string';
        }),
      );
    }

    if (responses.length > 0) {
      throw new Error(responses.join('\n'));
    }

    return `Module "${params.moduleItem.name}" completed successfully`;
  }

  private static async checkLambdaConcurrency(
    params: ModuleParams,
    accountId: string,
    region: string,
  ): Promise<boolean> {
    let credentials = params.moduleRunnerParameters.managementAccountCredentials;

    if (accountId !== params.moduleRunnerParameters.configs.accountsConfig.getManagementAccountId()) {
      credentials = await getCredentials({
        accountId,
        region,
        solutionId: params.runnerParameters.solutionId,
        partition: params.runnerParameters.partition,
        assumeRoleName: params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
      });
      if (!credentials) {
        throw new Error(`Failed to get credentials for account ${accountId}`);
      }
    }

    const requiredConcurrency = parseInt(
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] ?? DefaultMinimumLambdaConcurrencyThreshold,
    );

    const config: ICheckLambdaConcurrencyParameter = {
      moduleName: params.moduleItem.name,
      region,
      credentials,
      solutionId: params.runnerParameters.solutionId,
      partition: params.runnerParameters.partition,
      operation: 'prerequisites',
      dryRun: params.runnerParameters.dryRun,
      configuration: {
        requiredConcurrency,
      },
    };
    return await checkLambdaConcurrency(config);
  }
}
