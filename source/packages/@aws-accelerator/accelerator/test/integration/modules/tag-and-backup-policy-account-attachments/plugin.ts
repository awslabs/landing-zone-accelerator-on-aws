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

import {
  AttachPolicyCommand,
  DetachPolicyCommand,
  ListPoliciesCommand,
  ListTargetsForPolicyCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { createLogger, executeApi, IModuleResponse } from 'aws-lza';
import path from 'node:path';
import { TagAndBackupPolicyAccountAttachments } from '../../../../lib/actions/aws-organizations/tag-and-backup-policy-account-attachments';
import { AcceleratorModules, ModuleParams } from '../../../../lib/types';
import { buildBaseModuleParams } from '../../framework/base-params-builder';
import { resetModuleLatestState } from '../../framework/module-state-reset';
import { AssertionResult, ModuleTestPlugin, ResolvedEnvironment, TestManifest } from '../../framework/types';
import { recordPolicyAttachmentResponse, runPolicyAttachmentAssertions } from './assertions';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const LOG_PREFIX = 'PolicyAttachmentPlugin';
const UNMANAGED_ATTACHMENT_MANIFEST_ORDER = 3;
const TARGET_WAIT_ATTEMPTS = 30;
const TARGET_WAIT_DELAY_MS = 2_000;
const SERVICE_NAME = 'tag-and-backup-policy-account-attachments';
let stateTableReset = false;

interface PolicyManifestItem {
  readonly name: string;
  readonly accounts: string[];
  readonly excludedAccounts?: string[];
}

interface PolicyAttachmentManifestConfig {
  readonly taggingPolicies?: PolicyManifestItem[];
  readonly backupPolicies?: PolicyManifestItem[];
}

/**
 * Tag and Backup Policy account-attachment integration-test plugin.
 *
 * Builds normalized policy configuration, invokes the production wrapper,
 * records responses for assertions, resets latest module state once, and
 * manages the scenario-specific unmanaged Network account attachment.
 */
export const tagAndBackupPolicyAccountAttachmentsPlugin: ModuleTestPlugin = {
  moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,

  async buildParams(manifest: TestManifest, environment: ResolvedEnvironment): Promise<ModuleParams> {
    const config: PolicyAttachmentManifestConfig = {
      taggingPolicies: manifest.moduleConfig['taggingPolicies'] as PolicyManifestItem[] | undefined,
      backupPolicies: manifest.moduleConfig['backupPolicies'] as PolicyManifestItem[] | undefined,
    };
    const organizationConfig = {
      enable: true,
      organizationalUnits: [],
      serviceControlPolicies: [],
      taggingPolicies: (config.taggingPolicies ?? []).map(policy => ({
        name: policy.name,
        description: 'LZA module integration test Tag Policy',
        policy: 'integration-test-tag-policy.json',
        deploymentTargets: {
          organizationalUnits: [],
          accounts: policy.accounts,
          excludedAccounts: policy.excludedAccounts ?? [],
        },
      })),
      backupPolicies: (config.backupPolicies ?? []).map(policy => ({
        name: policy.name,
        description: 'LZA module integration test Backup Policy',
        policy: 'integration-test-backup-policy.json',
        deploymentTargets: {
          organizationalUnits: [],
          accounts: policy.accounts,
          excludedAccounts: policy.excludedAccounts ?? [],
        },
      })),
    };

    const params = buildBaseModuleParams({
      moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      handler: TagAndBackupPolicyAccountAttachments.configure,
      manifest,
      environment,
      configOverrides: {
        globalConfig: {
          homeRegion: environment.region,
          enabledRegions: [environment.region],
        },
        organizationConfig,
      },
    });

    return params;
  },

  async execute(params: ModuleParams): Promise<IModuleResponse> {
    logger.info('Executing TagAndBackupPolicyAccountAttachments.configure()');
    const response = await TagAndBackupPolicyAccountAttachments.configure(params);
    recordPolicyAttachmentResponse(response);
    return response;
  },

  async assert(manifest: TestManifest, environment: ResolvedEnvironment): Promise<AssertionResult[]> {
    return runPolicyAttachmentAssertions(manifest, environment);
  },

  async prepare(manifest: TestManifest, environment: ResolvedEnvironment): Promise<void> {
    if (!stateTableReset) {
      stateTableReset = true;
      await resetModuleLatestState(environment, SERVICE_NAME);
    }
    const tagPolicyName = getFixtureTagPolicyName(manifest);
    const networkAccountId = resolveRequiredAccountId(environment, 'Network');
    const client = createOrganizationsClient(environment);

    await setUnmanagedNetworkAttachment(client, tagPolicyName, networkAccountId, false);
    if (manifest.order === UNMANAGED_ATTACHMENT_MANIFEST_ORDER) {
      await setUnmanagedNetworkAttachment(client, tagPolicyName, networkAccountId, true);
    }
  },

  async cleanup(manifest: TestManifest, environment: ResolvedEnvironment): Promise<void> {
    if (manifest.order !== UNMANAGED_ATTACHMENT_MANIFEST_ORDER) {
      return;
    }
    const tagPolicyName = getFixtureTagPolicyName(manifest);
    const networkAccountId = resolveRequiredAccountId(environment, 'Network');
    await setUnmanagedNetworkAttachment(createOrganizationsClient(environment), tagPolicyName, networkAccountId, false);
  },
};

function createOrganizationsClient(environment: ResolvedEnvironment): OrganizationsClient {
  return new OrganizationsClient({
    region: environment.region,
    credentials: environment.managementAccountCredentials,
  });
}

function getFixtureTagPolicyName(manifest: TestManifest): string {
  const taggingPolicies = manifest.moduleConfig['taggingPolicies'] as PolicyManifestItem[] | undefined;
  const policyName = taggingPolicies?.[0]?.name;
  if (!policyName) {
    throw new Error(`Manifest ${manifest.name} does not define the fixture Tag Policy`);
  }
  return policyName;
}

function resolveRequiredAccountId(environment: ResolvedEnvironment, accountName: string): string {
  const accountId = environment.accounts.get(accountName);
  if (!accountId) {
    throw new Error(`Unable to resolve ${accountName} account`);
  }
  return accountId;
}

/**
 * Reconcile the test-only Network direct attachment on the exact fixture Tag Policy.
 *
 * The helper discovers the fixture policy by exact name through the paginated
 * Organizations policy API, applies an attach or detach only when required, and
 * polls paginated policy targets until the requested state is visible.
 *
 * @param client Organizations client using management-account credentials
 * @param policyName Exact fixture Tag Policy name
 * @param networkAccountId Network account ID used as the unmanaged direct target
 * @param shouldBeAttached Whether the Network account must be attached
 * @returns A promise that resolves when the requested live attachment state is visible
 * @throws When the exact fixture policy cannot be found
 * @throws When an Organizations list, attach, or detach API call fails
 * @throws When the requested target state is not visible before the bounded polling timeout
 */
async function setUnmanagedNetworkAttachment(
  client: OrganizationsClient,
  policyName: string,
  networkAccountId: string,
  shouldBeAttached: boolean,
): Promise<void> {
  const policyId = await findExactTagPolicyId(client, policyName);
  const currentTargets = await listDirectAccountTargets(client, policyId);
  const isAttached = currentTargets.includes(networkAccountId);

  if (shouldBeAttached && !isAttached) {
    await executeApi(
      'AttachPolicyCommand',
      { PolicyId: policyId, TargetId: networkAccountId },
      () => client.send(new AttachPolicyCommand({ PolicyId: policyId, TargetId: networkAccountId })),
      logger,
      LOG_PREFIX,
    );
  } else if (!shouldBeAttached && isAttached) {
    await executeApi(
      'DetachPolicyCommand',
      { PolicyId: policyId, TargetId: networkAccountId },
      () => client.send(new DetachPolicyCommand({ PolicyId: policyId, TargetId: networkAccountId })),
      logger,
      LOG_PREFIX,
    );
  }

  await waitForDirectTarget(client, policyId, networkAccountId, shouldBeAttached);
}

async function findExactTagPolicyId(client: OrganizationsClient, policyName: string): Promise<string> {
  let nextToken: string | undefined;
  do {
    const response = await executeApi(
      'ListPoliciesCommand',
      { Filter: 'TAG_POLICY', NextToken: nextToken },
      () => client.send(new ListPoliciesCommand({ Filter: 'TAG_POLICY', NextToken: nextToken })),
      logger,
      LOG_PREFIX,
    );
    const policyId = response.Policies?.find(policy => policy.Name === policyName)?.Id;
    if (policyId) {
      return policyId;
    }
    nextToken = response.NextToken;
  } while (nextToken);
  throw new Error(`Fixture Tag Policy "${policyName}" was not found`);
}

async function listDirectAccountTargets(client: OrganizationsClient, policyId: string): Promise<string[]> {
  const accountIds: string[] = [];
  let nextToken: string | undefined;
  do {
    const response = await executeApi(
      'ListTargetsForPolicyCommand',
      { PolicyId: policyId, NextToken: nextToken },
      () => client.send(new ListTargetsForPolicyCommand({ PolicyId: policyId, NextToken: nextToken })),
      logger,
      LOG_PREFIX,
    );
    accountIds.push(
      ...(response.Targets ?? [])
        .filter(target => target.Type === 'ACCOUNT' && target.TargetId)
        .map(target => target.TargetId as string),
    );
    nextToken = response.NextToken;
  } while (nextToken);
  return accountIds;
}

async function waitForDirectTarget(
  client: OrganizationsClient,
  policyId: string,
  accountId: string,
  expectedPresent: boolean,
): Promise<void> {
  for (let attempt = 1; attempt <= TARGET_WAIT_ATTEMPTS; attempt++) {
    const isPresent = (await listDirectAccountTargets(client, policyId)).includes(accountId);
    if (isPresent === expectedPresent) {
      return;
    }
    if (attempt < TARGET_WAIT_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, TARGET_WAIT_DELAY_MS));
    }
  }
  throw new Error(
    `Timed out waiting for policy ${policyId} target ${accountId} to become ${
      expectedPresent ? 'attached' : 'detached'
    }`,
  );
}
