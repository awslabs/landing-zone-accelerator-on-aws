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

import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  IOrganizationConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { IModuleResponse, ITagAndBackupPolicyAccountAttachmentsModuleResponse, MODULE_STATE_CODE } from 'aws-lza';

const mocks = vi.hoisted(() => ({
  manage: vi.fn(),
  logResult: vi.fn(),
  loadOwned: vi.fn(),
  compressOwned: vi.fn((ownedResources: string[]) =>
    ownedResources.length > 0 ? `gz:${ownedResources.join('|')}` : [],
  ),
  saveState: vi.fn(),
}));

vi.mock('aws-lza', () => ({
  createLogger: vi.fn(() => ({ processStart: vi.fn(), info: vi.fn(), error: vi.fn(), processEnd: vi.fn() })),
  createStatusLogger: vi.fn(() => ({ processStart: vi.fn(), info: vi.fn(), error: vi.fn(), processEnd: vi.fn() })),
  manageTagAndBackupPolicyAccountAttachments: mocks.manage,
  MODULE_STATE_CODE: {
    SUCCESS: 'success',
    FAILED: 'failed',
    COMPLETED: 'completed',
    SKIPPED: 'skipped',
  },
}));

vi.mock('../../../../lib/actions/utils/module-logging', () => ({
  logModuleExecutionResult: mocks.logResult,
}));

vi.mock('../../../../lib/actions/utils/module-state', () => ({
  saveModuleExecutionState: mocks.saveState,
}));

vi.mock('../../../../lib/actions/utils/resource-ownership-state', () => ({
  loadOwnedResources: mocks.loadOwned,
  compressOwnedResources: mocks.compressOwned,
}));

import { TagAndBackupPolicyAccountAttachments } from '../../../../lib/actions/aws-organizations/tag-and-backup-policy-account-attachments';
import { AcceleratorResourceNames } from '../../../../lib/accelerator-resource-names';
import { formatModuleDiff } from '../../../../lib/actions/utils/module-diff-formatter';
import { AcceleratorModules, ModuleExecutionPhase, ModuleParams } from '../../../../lib/types';
import { setResourcePrefixes } from '../../../../utils/app-utils';

const response: IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse> = {
  status: MODULE_STATE_CODE.SUCCESS,
  summary: 'done',
  timestamp: '2026-08-05T00:00:00.000Z',
  moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
  dryRun: false,
  response: { perPolicyResults: [] },
};

function createParams(organizationConfigOverrides: Partial<IOrganizationConfig>, dryRun = false): ModuleParams {
  const accountsConfig = new AccountsConfig(
    {
      managementAccountEmail: 'management@example.com',
      logArchiveAccountEmail: 'log-archive@example.com',
      auditAccountEmail: 'audit@example.com',
    },
    {
      mandatoryAccounts: [
        { name: 'Management', email: 'management@example.com', organizationalUnit: 'Root' },
        { name: 'LogArchive', email: 'log-archive@example.com', organizationalUnit: 'Security' },
        { name: 'Audit', email: 'audit@example.com', organizationalUnit: 'Security' },
      ],
      workloadAccounts: [{ name: 'Workload', email: 'workload@example.com', organizationalUnit: 'Infrastructure' }],
      accountIds: [
        { email: 'management@example.com', accountId: '111111111111' },
        { email: 'log-archive@example.com', accountId: '444444444444' },
        { email: 'audit@example.com', accountId: '222222222222' },
        { email: 'workload@example.com', accountId: '333333333333' },
      ],
    },
  );
  const globalConfig = new GlobalConfig({
    homeRegion: 'us-east-1',
    controlTower: { enable: false },
    managementAccountAccessRole: 'AWSControlTowerExecution',
  });
  const organizationConfig = new OrganizationConfig({
    enable: true,
    organizationalUnits: [],
    serviceControlPolicies: [],
    taggingPolicies: [],
    backupPolicies: [],
    ...organizationConfigOverrides,
  });
  const resourcePrefixes = setResourcePrefixes('AWSAccelerator');

  return {
    moduleItem: {
      name: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      description: 'test',
      runOrder: 1,
      executionPhase: ModuleExecutionPhase.DEPLOY,
      handler: vi.fn(async () => response),
    },
    runnerParameters: {
      sessionContext: {
        invokingAccountId: '111111111111',
        region: 'us-west-2',
        globalRegion: 'us-east-1',
        partition: 'aws',
      },
      configDirPath: '/tmp/config',
      prefix: 'AWSAccelerator',
      solutionId: 'AwsSolution/SO0199/v1.0.0',
      dryRun,
      stage: 'security-audit',
      loadOrganizationsFromDynamoDbTable: false,
    },
    moduleRunnerParameters: {
      configs: {
        accountsConfig,
        customizationsConfig: new CustomizationsConfig(),
        globalConfig,
        iamConfig: new IamConfig(),
        networkConfig: new NetworkConfig(),
        organizationConfig,
        replacementsConfig: new ReplacementsConfig(undefined, accountsConfig),
        securityConfig: new SecurityConfig(),
      },
      resourcePrefixes,
      acceleratorResourceNames: new AcceleratorResourceNames({
        prefixes: resourcePrefixes,
        centralizedLoggingRegion: 'us-east-1',
      }),
      logging: { centralizedRegion: 'us-east-1' },
      organizationAccounts: [],
      managementAccountCredentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        sessionToken: 'token',
      },
      sessionPolicy: '{"Version":"2012-10-17"}',
    },
    stage: 'security-audit',
  };
}

describe('TagAndBackupPolicyAccountAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.manage.mockResolvedValue(response);
    mocks.loadOwned.mockResolvedValue([]);
    mocks.saveState.mockResolvedValue(undefined);
  });

  test('returns a structured skipped response when AWS Organizations is disabled', async () => {
    const params = createParams({
      enable: false,
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: { accounts: ['UnknownAccount'] },
        },
      ],
    });

    const result = await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(result).toMatchObject({
      status: MODULE_STATE_CODE.SKIPPED,
      summary: expect.stringContaining('AWS Organizations is disabled'),
      moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      dryRun: false,
      response: { perPolicyResults: [] },
    });
    expect(mocks.manage).not.toHaveBeenCalled();
    expect(mocks.loadOwned).not.toHaveBeenCalled();
    expect(mocks.saveState).not.toHaveBeenCalled();
  });

  test('rejects an unknown direct account target before invoking the handler', async () => {
    const params = createParams({
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: { accounts: ['UnknownAccount'] },
        },
      ],
    });

    await expect(TagAndBackupPolicyAccountAttachments.configure(params)).rejects.toThrow(
      'configuration validation failed',
    );
    expect(mocks.manage).not.toHaveBeenCalled();
    expect(mocks.loadOwned).not.toHaveBeenCalled();
  });

  test('maps explicit account names to IDs and applies exclusions', async () => {
    const params = createParams({
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: {
            accounts: ['Management', 'Audit', 'Workload'],
            excludedAccounts: ['Audit'],
            organizationalUnits: ['Root'],
          },
        },
      ],
      backupPolicies: [],
    });

    const result = await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: {
          policies: [
            {
              policyName: 'TagPolicy',
              policyType: 'TAG_POLICY',
              accountIds: ['111111111111', '333333333333'],
              ownedAccountIds: [],
              cleanupOnly: false,
            },
          ],
        },
      }),
    );
    expect(mocks.saveState).toHaveBeenCalledWith(
      {
        serviceName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
        config: {
          policies: [
            {
              policyName: 'TagPolicy',
              policyType: 'TAG_POLICY',
              accountIds: ['111111111111', '333333333333'],
            },
          ],
        },
        status: response.status,
        response: {
          ...response,
          response: {
            perPolicyResults: [],
            ownedResources:
              'gz:policy-account-attachment:TAG_POLICY:TagPolicy:111111111111|' +
              'policy-account-attachment:TAG_POLICY:TagPolicy:333333333333',
          },
        },
        dryRun: false,
      },
      params,
      '111111111111:us-west-2',
    );
    expect(result).toEqual({
      ...response,
      response: {
        perPolicyResults: [],
        ownedResources: [
          'policy-account-attachment:TAG_POLICY:TagPolicy:111111111111',
          'policy-account-attachment:TAG_POLICY:TagPolicy:333333333333',
        ],
      },
    });
    expect(response.response).not.toHaveProperty('ownedResources');
  });

  test('emits configured policies with empty desired account sets', async () => {
    const params = createParams({
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: {
            accounts: ['Audit'],
            excludedAccounts: ['Audit'],
            organizationalUnits: ['Root'],
          },
        },
      ],
      backupPolicies: [
        {
          name: 'BackupPolicy',
          description: 'Test backup policy',
          policy: 'backup-policy.json',
          deploymentTargets: {
            accounts: [],
            excludedAccounts: [],
            organizationalUnits: ['Workloads'],
          },
        },
      ],
    });

    await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage.mock.calls[0][0].configuration.policies).toEqual([
      {
        policyName: 'TagPolicy',
        policyType: 'TAG_POLICY',
        accountIds: [],
        ownedAccountIds: [],
        cleanupOnly: false,
      },
      {
        policyName: 'BackupPolicy',
        policyType: 'BACKUP_POLICY',
        accountIds: [],
        ownedAccountIds: [],
        cleanupOnly: false,
      },
    ]);
  });

  test('limits input to tag and backup policies without expanding OU targets', async () => {
    const params = createParams({
      taggingPolicies: [],
      backupPolicies: [],
      serviceControlPolicies: [
        {
          name: 'ScpPolicy',
          description: 'Test service control policy',
          policy: 'scp-policy.json',
          type: 'customerManaged',
          deploymentTargets: { accounts: ['Management'], organizationalUnits: ['Root'] },
        },
      ],
      resourceControlPolicies: [
        {
          name: 'RcpPolicy',
          description: 'Test resource control policy',
          policy: 'rcp-policy.json',
          deploymentTargets: { accounts: ['Management'], organizationalUnits: ['Root'] },
        },
      ],
      chatbotPolicies: [
        {
          name: 'ChatbotPolicy',
          description: 'Test chatbot policy',
          policy: 'chatbot-policy.json',
          deploymentTargets: { accounts: ['Management'], organizationalUnits: ['Root'] },
        },
      ],
    });

    await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage.mock.calls[0][0].configuration.policies).toEqual([]);
  });

  test('uses management credentials and reconciles live state on every invocation', async () => {
    const params = createParams({
      taggingPolicies: [],
      backupPolicies: [],
    });

    await TagAndBackupPolicyAccountAttachments.configure(params);
    await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage).toHaveBeenCalledTimes(2);
    expect(mocks.loadOwned).toHaveBeenCalledTimes(2);
    expect(mocks.saveState).toHaveBeenCalledTimes(2);
    expect(mocks.manage.mock.calls[0][0]).toMatchObject({
      region: 'us-east-1',
      invokingAccountId: '111111111111',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        sessionToken: 'token',
      },
    });
    expect(mocks.manage.mock.calls[0][0]).not.toHaveProperty('sessionPolicy');
  });

  test('uses previous ownership and appends previous-only policies for cleanup', async () => {
    mocks.loadOwned.mockResolvedValue([
      'policy-account-attachment:TAG_POLICY:TagPolicy:222222222222',
      'policy-account-attachment:TAG_POLICY:TagPolicy:111111111111',
      'policy-account-attachment:TAG_POLICY:TagPolicy:222222222222',
      'policy-account-attachment:BACKUP_POLICY:RemovedBackupPolicy:333333333333',
    ]);
    const params = createParams({
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: { accounts: ['Management'] },
        },
      ],
      backupPolicies: [],
    });

    await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage.mock.calls[0][0].configuration.policies).toEqual([
      {
        policyName: 'TagPolicy',
        policyType: 'TAG_POLICY',
        accountIds: ['111111111111'],
        ownedAccountIds: ['111111111111', '222222222222'],
        cleanupOnly: false,
      },
      {
        policyName: 'RemovedBackupPolicy',
        policyType: 'BACKUP_POLICY',
        accountIds: [],
        ownedAccountIds: ['333333333333'],
        cleanupOnly: true,
      },
    ]);
    expect(mocks.saveState.mock.calls[0][0].config).toEqual({
      policies: [
        {
          policyName: 'TagPolicy',
          policyType: 'TAG_POLICY',
          accountIds: ['111111111111'],
        },
      ],
    });
    expect(mocks.saveState.mock.calls[0][0].response.response.ownedResources).toBe(
      'gz:policy-account-attachment:TAG_POLICY:TagPolicy:111111111111',
    );
  });

  test('persists empty ownership after previous-only attachments are cleaned up successfully', async () => {
    mocks.loadOwned.mockResolvedValue(['policy-account-attachment:BACKUP_POLICY:RemovedBackupPolicy:333333333333']);
    const params = createParams({ taggingPolicies: [], backupPolicies: [] });

    await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage.mock.calls[0][0].configuration.policies).toEqual([
      {
        policyName: 'RemovedBackupPolicy',
        policyType: 'BACKUP_POLICY',
        accountIds: [],
        ownedAccountIds: ['333333333333'],
        cleanupOnly: true,
      },
    ]);
    expect(mocks.saveState.mock.calls[0][0].response.response.ownedResources).toEqual([]);
  });

  test('fails before Organizations calls when ownership state cannot be read', async () => {
    mocks.loadOwned.mockRejectedValue(new Error('DynamoDB unavailable'));
    const params = createParams({ taggingPolicies: [], backupPolicies: [] });

    const result = await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(result).toMatchObject({
      status: MODULE_STATE_CODE.FAILED,
      error: { name: 'StateManagementError', message: 'DynamoDB unavailable' },
    });
    expect(mocks.manage).not.toHaveBeenCalled();
    expect(mocks.saveState).not.toHaveBeenCalled();
  });

  test('fails before Organizations calls when an ownership resource ID is invalid', async () => {
    mocks.loadOwned.mockResolvedValue(['invalid-resource-id']);
    const params = createParams({ taggingPolicies: [], backupPolicies: [] });

    const result = await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.error?.message).toContain('Invalid policy attachment ownership resource ID');
    expect(mocks.manage).not.toHaveBeenCalled();
    expect(mocks.saveState).not.toHaveBeenCalled();
  });

  test('reads ownership during dry-run without saving state', async () => {
    mocks.loadOwned.mockResolvedValue(['policy-account-attachment:TAG_POLICY:Removed%3ATagPolicy:222222222222']);
    const params = createParams({ taggingPolicies: [], backupPolicies: [] }, true);

    await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage.mock.calls[0][0]).toMatchObject({
      dryRun: true,
      configuration: {
        policies: [
          {
            policyName: 'Removed:TagPolicy',
            policyType: 'TAG_POLICY',
            accountIds: [],
            ownedAccountIds: ['222222222222'],
            cleanupOnly: true,
          },
        ],
      },
    });
    expect(mocks.saveState).not.toHaveBeenCalled();
  });

  test('does not persist ownership on failure and reseeds it after the next successful execution', async () => {
    const previousOwnedResources = ['policy-account-attachment:BACKUP_POLICY:PreviousBackupPolicy:222222222222'];
    const failedResponse: IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse> = {
      ...response,
      status: MODULE_STATE_CODE.FAILED,
      error: { name: 'OrganizationsError', message: 'attach failed' },
    };
    mocks.loadOwned.mockResolvedValueOnce(previousOwnedResources).mockResolvedValueOnce([]);
    mocks.manage.mockResolvedValueOnce(failedResponse).mockResolvedValueOnce(response);
    const params = createParams({
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: { accounts: ['Management'] },
        },
      ],
    });

    const failedResult = await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(failedResult.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(failedResult.response).not.toHaveProperty('ownedResources');
    expect(mocks.saveState).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: MODULE_STATE_CODE.FAILED,
        response: failedResponse,
      }),
      params,
      '111111111111:us-west-2',
    );

    const successResult = await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(mocks.manage.mock.calls[1][0].configuration.policies[0].ownedAccountIds).toEqual([]);
    expect(successResult.response?.ownedResources).toEqual([
      'policy-account-attachment:TAG_POLICY:TagPolicy:111111111111',
    ]);
    expect(mocks.saveState.mock.calls[1][0].response.response.ownedResources).toBe(
      'gz:policy-account-attachment:TAG_POLICY:TagPolicy:111111111111',
    );
  });

  test('does not add ownership to a partial failure response', async () => {
    const previousOwnedResources = [
      'policy-account-attachment:TAG_POLICY:TagPolicy:111111111111',
      'policy-account-attachment:TAG_POLICY:TagPolicy:222222222222',
    ];
    mocks.loadOwned.mockResolvedValue(previousOwnedResources);
    mocks.manage.mockResolvedValue({
      ...response,
      status: MODULE_STATE_CODE.FAILED,
      error: { name: 'OrganizationsError', message: 'second detach failed' },
      response: {
        perPolicyResults: [
          {
            policyName: 'TagPolicy',
            policyType: 'TAG_POLICY',
            policyId: 'p-tag',
            status: 'failed',
            accountResults: [
              {
                accountId: '111111111111',
                operation: 'detach',
                status: 'detached',
                message: 'detached',
              },
              {
                accountId: '222222222222',
                operation: 'detach',
                status: 'failed',
                message: 'detach failed',
              },
            ],
            unmanagedAccountIds: [],
            message: 'policy reconciliation failed',
          },
        ],
      },
    });
    const params = createParams({
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: { accounts: [] },
        },
      ],
    });

    const result = await TagAndBackupPolicyAccountAttachments.configure(params);

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response).not.toHaveProperty('ownedResources');
    expect(mocks.saveState.mock.calls[0][0].response.response).not.toHaveProperty('ownedResources');
  });

  test('registers a detailed dry-run diff formatter', () => {
    const output = formatModuleDiff({
      status: 'success',
      summary: '2 account attachment changes',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      dryRun: true,
      response: {
        perPolicyResults: [
          {
            policyName: 'OrgTagPolicy',
            policyType: 'TAG_POLICY',
            policyId: 'p-tag',
            status: 'dry-run',
            accountResults: [
              {
                accountId: '111111111111',
                operation: 'attach',
                status: 'dry-run',
                message: 'would attach',
              },
              {
                accountId: '222222222222',
                operation: 'detach',
                status: 'dry-run',
                message: 'would detach',
              },
            ],
            unmanagedAccountIds: [],
            message: 'would reconcile',
          },
        ],
      },
    });

    expect(output).toContain('OrgTagPolicy (TAG_POLICY)');
    expect(output).toContain('[+] attach account 111111111111');
    expect(output).toContain('[-] detach account 222222222222');
  });

  test('formats unmanaged attachments for a no-change policy without counting planned changes', () => {
    const output = formatModuleDiff({
      status: 'success',
      summary: 'no attachment changes',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      dryRun: true,
      response: {
        perPolicyResults: [
          {
            policyName: 'OrgTagPolicy',
            policyType: 'TAG_POLICY',
            policyId: 'p-tag',
            status: 'no-change',
            accountResults: [],
            unmanagedAccountIds: ['111111111111', '333333333333'],
            message: 'direct-account attachments already match desired state',
          },
        ],
      },
    });

    expect(output).toContain('OrgTagPolicy (TAG_POLICY)');
    expect(output).toContain(
      '[!] account 111111111111: not managed by LZA configuration, will be preserved; consider adding it to deploymentTargets.accounts to let LZA manage it',
    );
    expect(output).toContain(
      '[!] account 333333333333: not managed by LZA configuration, will be preserved; consider adding it to deploymentTargets.accounts to let LZA manage it',
    );
    expect(output.indexOf('account 111111111111')).toBeLessThan(output.indexOf('account 333333333333'));
    expect(output).toContain('[=] direct-account attachments already match desired state');
    expect(output).toContain('No changes');
    expect(output).not.toContain('policy/account result(s) unchanged');
    expect(output).not.toContain('[+]');
    expect(output).not.toContain('[-]');
  });

  test('formats desired attachments for a policy pending CDK creation', () => {
    const output = formatModuleDiff({
      status: 'success',
      summary: 'policy pending creation',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      dryRun: true,
      response: {
        perPolicyResults: [
          {
            policyName: 'NewBackupPolicy',
            policyType: 'BACKUP_POLICY',
            status: 'pending-create',
            accountResults: [
              {
                accountId: '333333333333',
                operation: 'attach',
                status: 'pending-create',
                message: 'attach after policy creation',
              },
            ],
            unmanagedAccountIds: [],
            message: 'Organizations CDK is expected to create this policy',
          },
        ],
      },
    });

    expect(output).toContain('NewBackupPolicy (BACKUP_POLICY)');
    expect(output).toContain('[~] Organizations CDK is expected to create this policy');
    expect(output).toContain('[+] attach account 333333333333 (pending policy creation)');
    expect(output).not.toContain('No changes');
  });

  test('formats detachments deferred by the global safety gate', () => {
    const output = formatModuleDiff({
      status: 'failed',
      summary: 'attachment failed',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      dryRun: true,
      response: {
        perPolicyResults: [
          {
            policyName: 'OrgTagPolicy',
            policyType: 'TAG_POLICY',
            policyId: 'p-tag',
            status: 'failed',
            accountResults: [
              {
                accountId: '111111111111',
                operation: 'attach',
                status: 'failed',
                message: 'attach failed',
              },
              {
                accountId: '222222222222',
                operation: 'detach',
                status: 'deferred',
                message: 'detach retained because an attachment failed',
              },
            ],
            unmanagedAccountIds: [],
            message: 'policy reconciliation failed',
          },
        ],
      },
    });

    expect(output).toContain('[!] policy reconciliation failed');
    expect(output).toContain('[!] account 111111111111: attach failed');
    expect(output).toContain('[~] detach retained because an attachment failed');
    expect(output).toContain('[~] 1 operation(s) deferred by a safety gate');
  });

  test('formats failed module responses with error details and without a no-change message', () => {
    const output = formatModuleDiff({
      status: MODULE_STATE_CODE.FAILED,
      summary: 'policy reconciliation failed',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      dryRun: true,
      error: {
        name: 'AccessDeniedException',
        message: 'organizations access denied',
      },
      response: {
        perPolicyResults: [
          {
            policyName: 'OrgTagPolicy',
            policyType: 'TAG_POLICY',
            status: 'failed',
            accountResults: [],
            unmanagedAccountIds: [],
            message: 'unable to discover policy attachments',
          },
        ],
      },
    });

    expect(output).toContain('Mode: Dry Run - FAILED');
    expect(output).toContain('[!] unable to discover policy attachments');
    expect(output).toContain('Error: AccessDeniedException');
    expect(output).toContain('Message: organizations access denied');
    expect(output).not.toContain('No changes');
  });
});
