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
import {
  checkLambdaConcurrency,
  checkServiceQuota,
  createStatusLogger,
  getServiceQuotaCode,
  ICheckLambdaConcurrencyParameter,
  ICheckServiceQuotaParameter,
  IGetServiceQuotaCodeParameter,
} from '../../../../../@aws-lza/index';
import {
  DefaultMinimumCodeBuildConcurrencyThreshold,
  DefaultMinimumLambdaConcurrencyThreshold,
} from '../../../models/constants';
import { ModuleParams } from '../../../models/types';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

export abstract class PipelinePrerequisites {
  public static async execute(params: ModuleParams): Promise<string> {
    const homeRegion = params.moduleRunnerParameters.configs.globalConfig.homeRegion;

    const promises: Promise<string>[] = [
      PipelinePrerequisites.checkCodeBuildLimit(params, homeRegion),
      PipelinePrerequisites.checkLambdaConcurrency(params, homeRegion),
    ];

    const statuses = (await Promise.all(promises)).filter(status => status);

    if (statuses.length > 0) {
      throw new Error(statuses.join('\n'));
    }

    return `Module "${params.moduleItem.name}" completed successfully`;
  }

  private static async checkLambdaConcurrency(params: ModuleParams, region: string): Promise<string> {
    const requiredConcurrency = parseInt(
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] ?? DefaultMinimumLambdaConcurrencyThreshold,
    );
    const config: ICheckLambdaConcurrencyParameter = {
      moduleName: params.moduleItem.name,
      region,
      solutionId: params.runnerParameters.solutionId,
      partition: params.runnerParameters.partition,
      operation: 'prerequisites',
      dryRun: params.runnerParameters.dryRun,
      configuration: {
        requiredConcurrency,
      },
    };
    const result = await checkLambdaConcurrency(config);

    return result ? '' : `Lambda concurrency for pipeline account in home region ${region} is insufficient`;
  }

  private static async getCodeBuildServiceQuotaCode(params: ModuleParams, region: string) {
    const config: IGetServiceQuotaCodeParameter = {
      moduleName: params.moduleItem.name,
      region,
      solutionId: params.runnerParameters.solutionId,
      partition: params.runnerParameters.partition,
      operation: 'prerequisites',
      dryRun: params.runnerParameters.dryRun,
      configuration: {
        serviceCode: 'codebuild',
        quotaName: 'Concurrently running builds for Linux/Medium environment',
      },
    };

    return await getServiceQuotaCode(config);
  }

  private static async checkCodeBuildLimit(params: ModuleParams, region: string): Promise<string> {
    const requiredServiceQuota = parseInt(
      process.env['ACCELERATOR_CODEBUILD_PARALLEL_LIMIT'] ?? DefaultMinimumCodeBuildConcurrencyThreshold,
    );
    const codeBuildServiceQuotaCode = await this.getCodeBuildServiceQuotaCode(params, region);
    if (!codeBuildServiceQuotaCode) {
      statusLogger.warn(
        `Skipping CodeBuild concurrency check in pipeline account for region ${region} because no service quota code was found.`,
      );
      return ``;
    }
    const config: ICheckServiceQuotaParameter = {
      moduleName: params.moduleItem.name,
      region,
      solutionId: params.runnerParameters.solutionId,
      partition: params.runnerParameters.partition,
      operation: 'prerequisites',
      dryRun: params.runnerParameters.dryRun,
      configuration: {
        requiredServiceQuota,
        serviceCode: 'codebuild',
        quotaCode: codeBuildServiceQuotaCode,
      },
    };

    const result = await checkServiceQuota(config);

    return result ? '' : `CodeBuild concurrency limit for pipeline account in home region ${region} is insufficient`;
  }
}
