/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'License' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { createLogger, IModuleResponse } from 'aws-lza';
import path from 'node:path';
import { ConfigRuleTagging } from '../../../../lib/actions/security/config-rule-tagging';
import { AcceleratorModules, ModuleParams } from '../../../../lib/types';
import { buildBaseModuleParams } from '../../framework/base-params-builder';
import { resetModuleLatestState } from '../../framework/module-state-reset';
import { getModuleTestRoleName } from '../../framework/permissions-boundary';
import { AssertionResult, ModuleTestPlugin, ResolvedEnvironment, TestManifest } from '../../framework/types';
import { recordConfigRuleTaggingResponse, runConfigRuleTaggingAssertions } from './assertions';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const SERVICE_NAME = 'config-rule-tagging';
let stateTableReset = false;

interface ConfigRuleManifestRule {
  readonly name: string;
  readonly tags?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

interface ConfigRuleManifestConfig {
  readonly account: string;
  readonly region?: string;
  readonly globalTags?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  readonly rules: ReadonlyArray<ConfigRuleManifestRule>;
}

/**
 * Config Rule Tagging integration-test plugin.
 *
 * Builds the minimal accelerator configuration for each manifest, invokes the
 * production wrapper, records its response for assertions, and resets the latest
 * module-state row once before the first manifest.
 */
export const configRuleTaggingPlugin: ModuleTestPlugin = {
  moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,

  async buildParams(manifest: TestManifest, environment: ResolvedEnvironment): Promise<ModuleParams> {
    const config: ConfigRuleManifestConfig = {
      account: manifest.moduleConfig['account'] as string,
      region: manifest.moduleConfig['region'] as string | undefined,
      globalTags: manifest.moduleConfig['globalTags'] as ConfigRuleManifestConfig['globalTags'],
      rules: manifest.moduleConfig['rules'] as ConfigRuleManifestConfig['rules'],
    };
    const region = config.region ?? environment.region;

    const params = buildBaseModuleParams({
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      handler: ConfigRuleTagging.configure,
      manifest,
      environment,
      configOverrides: {
        globalConfig: {
          homeRegion: environment.region,
          enabledRegions: [region],
          managementAccountAccessRole: getModuleTestRoleName(SERVICE_NAME),
          tags: config.globalTags ?? [],
        },
        organizationConfig: {
          enable: true,
          organizationalUnits: [],
          serviceControlPolicies: [],
          taggingPolicies: [],
          backupPolicies: [],
          getIgnoredOus: () => [],
        },
        securityConfig: {
          awsConfig: {
            ruleSets:
              config.rules.length === 0
                ? []
                : [
                    {
                      deploymentTargets: {
                        organizationalUnits: [],
                        accounts: [config.account],
                        excludedAccounts: [],
                        excludedRegions: [],
                      },
                      rules: config.rules.map(rule => ({
                        name: rule.name,
                        tags: rule.tags ?? [],
                      })),
                    },
                  ],
          },
        },
      },
    });

    return params;
  },

  async execute(params: ModuleParams): Promise<IModuleResponse> {
    logger.info('Executing ConfigRuleTagging.configure()');
    const response = await ConfigRuleTagging.configure(params);
    recordConfigRuleTaggingResponse(response);
    return response;
  },

  async assert(manifest: TestManifest, environment: ResolvedEnvironment): Promise<AssertionResult[]> {
    return runConfigRuleTaggingAssertions(manifest, environment);
  },

  async prepare(_manifest: TestManifest, environment: ResolvedEnvironment): Promise<void> {
    if (!stateTableReset) {
      stateTableReset = true;
      await resetModuleLatestState(environment, SERVICE_NAME);
    }
  },
};
