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
   * Prepare hook — waits for Macie to reach a stable state before each manifest.
   * Prevents ConflictException when [enable] runs immediately after [disable].
   * Macie's disable operation is asynchronous — the API accepts the request but
   * takes 10-30s to fully remove the delegated admin.
   */
  async prepare(_manifest: TestManifest, environment: ResolvedEnvironment): Promise<void> {
    await waitForMacieStateStabilization(environment);
  },
};

// ─── Macie State Stabilization ──────────────────────────────────────────────

const MACIE_STABILIZATION_TIMEOUT_MS = 60_000;
const MACIE_STABILIZATION_POLL_INTERVAL_MS = 5_000;
const RETRIABLE_ERRORS = new Set(['ThrottlingException', 'TooManyRequestsException', 'ServiceUnavailableException']);

/**
 * Polls Macie state until it reaches a stable condition (enabled with admin, paused, or not enabled).
 * Throws on timeout or fatal errors.
 */
async function waitForMacieStateStabilization(environment: ResolvedEnvironment): Promise<void> {
  const { Macie2Client, GetMacieSessionCommand } = await import('@aws-sdk/client-macie2');
  const { OrganizationsClient, paginateListDelegatedAdministrators } = await import('@aws-sdk/client-organizations');

  const credentials = environment.managementAccountCredentials
    ? {
        accessKeyId: environment.managementAccountCredentials.accessKeyId,
        secretAccessKey: environment.managementAccountCredentials.secretAccessKey,
        sessionToken: environment.managementAccountCredentials.sessionToken,
      }
    : undefined;

  const orgClient = new OrganizationsClient({ region: environment.region, credentials });
  const macieClient = new Macie2Client({ region: environment.region, credentials });
  const startTime = Date.now();

  logger.info('Waiting for Macie delegated admin state to stabilize...');

  while (Date.now() - startTime < MACIE_STABILIZATION_TIMEOUT_MS) {
    const result = await checkMacieState(
      macieClient,
      GetMacieSessionCommand,
      orgClient,
      paginateListDelegatedAdministrators,
    );
    if (result === 'stable') {
      return;
    }
    if (result === 'cooldown') {
      // Macie API shows admin removed, but internal state needs extra time
      const COOLDOWN_MS = 15_000;
      logger.info(`Applying ${COOLDOWN_MS / 1000}s cooldown for Macie internal state finalization...`);
      await new Promise(resolve => setTimeout(resolve, COOLDOWN_MS));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, MACIE_STABILIZATION_POLL_INTERVAL_MS));
  }

  logger.warn('Macie state stabilization timed out after 60s — environment may not be ready');
  throw new Error('Macie state stabilization timed out after 60s. Delegated admin may still be in transition.');
}

/**
 * Single check of Macie state. Returns 'stable' if ready to proceed, 'waiting' if still in transition.
 * Throws on fatal errors.
 */
async function checkMacieState(
  macieClient: InstanceType<typeof import('@aws-sdk/client-macie2').Macie2Client>,
  GetMacieSessionCommand: typeof import('@aws-sdk/client-macie2').GetMacieSessionCommand,
  orgClient: InstanceType<typeof import('@aws-sdk/client-organizations').OrganizationsClient>,
  paginateListDelegatedAdministrators: typeof import('@aws-sdk/client-organizations').paginateListDelegatedAdministrators,
): Promise<'stable' | 'waiting' | 'cooldown'> {
  try {
    const session = await macieClient.send(new GetMacieSessionCommand({}));

    if (session.status === 'PAUSED') {
      logger.info('Macie is PAUSED — disable complete, safe to proceed');
      return 'stable';
    }

    const admins = await listMacieDelegatedAdmins(orgClient, paginateListDelegatedAdministrators);

    if (session.status === 'ENABLED' && admins.length > 0) {
      logger.info(`Macie is ENABLED with ${admins.length} admin(s) — stable, proceeding`);
      return 'stable';
    }

    // ENABLED with no admins — delegated admin removed but Macie may still be finalizing internally
    logger.info('Macie ENABLED with no delegated admin — adding cooldown for internal state transition');
    return 'cooldown';
  } catch (error: unknown) {
    return handleMacieStateError(error);
  }
}

/**
 * Lists Macie delegated administrator account IDs.
 */
async function listMacieDelegatedAdmins(
  orgClient: InstanceType<typeof import('@aws-sdk/client-organizations').OrganizationsClient>,
  paginateListDelegatedAdministrators: typeof import('@aws-sdk/client-organizations').paginateListDelegatedAdministrators,
): Promise<string[]> {
  const admins: string[] = [];
  const paginator = paginateListDelegatedAdministrators(
    { client: orgClient },
    { ServicePrincipal: 'macie.amazonaws.com' },
  );
  for await (const page of paginator) {
    for (const admin of page.DelegatedAdministrators ?? []) {
      if (admin.Id) {
        admins.push(admin.Id);
      }
    }
  }
  return admins;
}

/**
 * Handles errors during Macie state check. Returns 'stable' for expected non-enabled states,
 * 'waiting' for retriable errors, and throws for fatal errors.
 */
function handleMacieStateError(error: unknown): 'stable' | 'waiting' | 'cooldown' {
  const errorName = (error as { name?: string }).name;

  if (errorName === 'AccessDeniedException') {
    logger.info('Macie not enabled (AccessDenied) — stable, proceeding');
    return 'stable';
  }

  const msg = error instanceof Error ? error.message : JSON.stringify(error);

  if (errorName && RETRIABLE_ERRORS.has(errorName)) {
    logger.warn(`Retriable error checking Macie state: ${msg} — retrying...`);
    return 'waiting';
  }

  throw new Error(`Fatal error while waiting for Macie state stabilization: ${errorName ?? 'Unknown'}: ${msg}`);
}
