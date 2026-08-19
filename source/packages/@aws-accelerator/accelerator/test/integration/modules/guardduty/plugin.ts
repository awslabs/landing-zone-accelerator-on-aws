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

/**
 * @fileoverview GuardDuty module integration test plugin.
 *
 * Provides only GuardDuty-specific logic: config stubs and handler reference.
 * All generic plumbing (accounts, org accounts, base params) comes from the framework.
 */
import { createLogger, IModuleBoundary, IModuleRegionFilters, IModuleResponse } from 'aws-lza';
import path from 'node:path';
import { AmazonGuardDuty } from '../../../../lib/actions/security/amazon-guardduty';
import { AcceleratorModules, ModuleParams } from '../../../../lib/types';
import { buildBaseModuleParams } from '../../framework/base-params-builder';
import { AssertionResult, ModuleTestPlugin, ResolvedEnvironment, TestManifest } from '../../framework/types';
import { runGuardDutyAssertions } from './assertions';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Manifest moduleConfig shape for GuardDuty tests.
 */
interface GuardDutyManifestConfig {
  enable: boolean;
  delegatedAdminAccount: string;
  boundary: IModuleBoundary;
  regionFilters: IModuleRegionFilters;
  autoEnableOrgMembers: boolean;
  overrideExisting?: boolean;
  deploymentTargets?: {
    accounts?: string[];
    organizationalUnits?: string[];
    excludedAccounts?: string[];
    excludedRegions?: string[];
  };
  s3Protection: {
    enable: boolean;
    excludeRegions?: string[];
  };
  eksProtection?: {
    enable: boolean;
    manageAgent?: boolean;
    excludeRegions?: string[];
  };
  ec2Protection?: {
    enable: boolean;
    keepSnapshots: boolean;
    excludeRegions?: string[];
  };
  rdsProtection?: {
    enable: boolean;
    excludeRegions?: string[];
  };
  lambdaProtection?: {
    enable: boolean;
    excludeRegions?: string[];
  };
  exportConfiguration: {
    enable: boolean;
    overrideExisting?: boolean;
    exportFrequency: string;
  };
}

/**
 * GuardDuty module test plugin.
 *
 * Only provides GuardDuty-specific config stubs. Everything else is handled
 * by buildBaseModuleParams from the framework.
 */
export const guardDutyPlugin: ModuleTestPlugin = {
  moduleName: AcceleratorModules.GUARDDUTY,

  async buildParams(manifest: TestManifest, environment: ResolvedEnvironment): Promise<ModuleParams> {
    const gdConfig = manifest.moduleConfig as unknown as GuardDutyManifestConfig;

    const delegatedAdminAccountName = gdConfig.delegatedAdminAccount;
    const delegatedAdminAccountId = environment.accounts.get(delegatedAdminAccountName);
    if (!delegatedAdminAccountId) {
      throw new Error(
        `Cannot resolve delegated admin account "${delegatedAdminAccountName}". ` +
          `Available accounts: ${[...environment.accounts.keys()].join(', ')}`,
      );
    }
    logger.info(`Resolved delegatedAdminAccount "${delegatedAdminAccountName}" → ${delegatedAdminAccountId}`);

    return buildBaseModuleParams({
      moduleName: AcceleratorModules.GUARDDUTY,
      handler: AmazonGuardDuty.configure,
      manifest,
      environment,
      configOverrides: {
        globalConfig: {
          enabledRegions: gdConfig.boundary.regions,
        },
        securityConfig: {
          centralSecurityServices: {
            guardduty: {
              enable: gdConfig.enable,
              excludeRegions: gdConfig.regionFilters.ignoredRegions,
              disabledRegions: gdConfig.regionFilters.disabledRegions,
              autoEnableOrgMembers: gdConfig.autoEnableOrgMembers,
              overrideExisting: gdConfig.overrideExisting ?? true,
              s3Protection: gdConfig.s3Protection,
              eksProtection: gdConfig.eksProtection,
              ec2Protection: gdConfig.ec2Protection,
              rdsProtection: gdConfig.rdsProtection,
              lambdaProtection: gdConfig.lambdaProtection,
              exportConfiguration: gdConfig.exportConfiguration,
              ...(gdConfig.deploymentTargets && { deploymentTargets: gdConfig.deploymentTargets }),
            },
            delegatedAdminAccount: delegatedAdminAccountName,
          },
        },
      },
    });
  },

  async execute(params: ModuleParams): Promise<IModuleResponse> {
    logger.info('Executing AmazonGuardDuty.configure()');

    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 30_000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await AmazonGuardDuty.configure(params);

      // Check if the failure is a BadRequestException (GuardDuty still processing previous operation)
      const hasBadRequest =
        response.status === 'failed' &&
        'error' in response &&
        (response as { error?: { name?: string } }).error?.name === 'BadRequestException';

      if (!hasBadRequest) {
        return response;
      }

      if (attempt === MAX_RETRIES) {
        logger.warn(
          `BadRequestException persisted after ${MAX_RETRIES} attempts (${(MAX_RETRIES * RETRY_DELAY_MS) / 1000}s total). Returning failed response.`,
        );
        return response;
      }

      logger.info(
        `BadRequestException on attempt ${attempt}/${MAX_RETRIES} — ` +
          `GuardDuty still processing previous operation. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
      );
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }

    // Unreachable — loop always returns. Satisfies TypeScript.
    throw new Error('Unexpected: retry loop exited without returning');
  },

  async assert(manifest: TestManifest, environment: ResolvedEnvironment): Promise<AssertionResult[]> {
    return runGuardDutyAssertions(manifest, environment);
  },

  /**
   * Prepare hook — no-op. BadRequestException retry is handled in execute().
   */
  async prepare(): Promise<void> {
    // Intentionally empty — retry logic in execute() handles GuardDuty async timing
  },
};
