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
 * @fileoverview Macie module integration test plugin.
 *
 * Provides only Macie-specific logic: config stubs and handler reference.
 * All generic plumbing (accounts, org accounts, base params) comes from the framework.
 */
import { IClassificationScopeExcludedBucketConfig } from '@aws-accelerator/config/lib/models/security-config';
import { createLogger, IModuleBoundary, IModuleRegionFilters, IModuleResponse } from 'aws-lza';
import path from 'node:path';
import { AmazonMacie } from '../../../../lib/actions/security/amazon-macie';
import { AcceleratorModules, ModuleParams } from '../../../../lib/types';
import { buildBaseModuleParams } from '../../framework/base-params-builder';
import { AssertionResult, ModuleTestPlugin, ResolvedEnvironment, TestManifest } from '../../framework/types';
import { runMacieAssertions } from './assertions';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Manifest moduleConfig shape for Macie tests.
 */
interface MacieManifestConfig {
  enable: boolean;
  delegatedAdminAccount: string;
  boundary: IModuleBoundary;
  regionFilters: IModuleRegionFilters;
  policyFindingsPublishingFrequency: string;
  publishSensitiveDataFindings: boolean;
  publishPolicyFindings: boolean;
  automatedDiscoveryEnabled?: boolean;
  classificationScopeExcludedBuckets?: IClassificationScopeExcludedBucketConfig[];
}

/**
 * Macie module test plugin.
 *
 * Only provides Macie-specific config stubs. Everything else is handled
 * by buildBaseModuleParams from the framework.
 */
export const maciePlugin: ModuleTestPlugin = {
  moduleName: AcceleratorModules.MACIE,

  async buildParams(manifest: TestManifest, environment: ResolvedEnvironment): Promise<ModuleParams> {
    const macieConfig = manifest.moduleConfig as unknown as MacieManifestConfig;

    const delegatedAdminAccountName = macieConfig.delegatedAdminAccount;
    const delegatedAdminAccountId = environment.accounts.get(delegatedAdminAccountName);
    if (!delegatedAdminAccountId) {
      throw new Error(
        `Cannot resolve delegated admin account "${delegatedAdminAccountName}". ` +
          `Available accounts: ${[...environment.accounts.keys()].join(', ')}`,
      );
    }
    logger.info(`Resolved delegatedAdminAccount "${delegatedAdminAccountName}" → ${delegatedAdminAccountId}`);

    return buildBaseModuleParams({
      moduleName: AcceleratorModules.MACIE,
      handler: AmazonMacie.configure,
      manifest,
      environment,
      configOverrides: {
        globalConfig: {
          enabledRegions: macieConfig.boundary.regions,
        },
        securityConfig: {
          centralSecurityServices: {
            macie: {
              enable: macieConfig.enable,
              excludeRegions: macieConfig.regionFilters.ignoredRegions,
              disabledRegions: macieConfig.regionFilters.disabledRegions,
              policyFindingsPublishingFrequency: macieConfig.policyFindingsPublishingFrequency,
              publishSensitiveDataFindings: macieConfig.publishSensitiveDataFindings,
              publishPolicyFindings: macieConfig.publishPolicyFindings,
              automatedDiscoveryEnabled: macieConfig.automatedDiscoveryEnabled ?? true,
              classificationScopeExcludedBuckets: macieConfig.classificationScopeExcludedBuckets,
              overrideExisting: true,
            },
            delegatedAdminAccount: delegatedAdminAccountName,
          },
        },
      },
    });
  },

  async execute(params: ModuleParams): Promise<IModuleResponse> {
    logger.info('Executing AmazonMacie.configure()');
    return AmazonMacie.configure(params);
  },

  async assert(manifest: TestManifest, environment: ResolvedEnvironment): Promise<AssertionResult[]> {
    return runMacieAssertions(manifest, environment);
  },

  /**
   * Prepare hook — fixed delay between Macie manifests.
   *
   * Macie's async operations (delegated admin removal, service enablement/disablement)
   * take 10-30s to finalize internally, even after the API returns success. Without this
   * delay, back-to-back manifests (e.g., [disable] → [enable]) hit ConflictException.
   */
  async prepare(): Promise<void> {
    const INTER_MANIFEST_DELAY_MS = 60_000;
    logger.info(`Waiting ${INTER_MANIFEST_DELAY_MS / 1000}s for Macie service stabilization...`);
    await new Promise(resolve => setTimeout(resolve, INTER_MANIFEST_DELAY_MS));
  },
};
