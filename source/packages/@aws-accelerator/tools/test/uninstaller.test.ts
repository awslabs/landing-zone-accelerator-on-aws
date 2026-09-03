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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcceleratorTool, AcceleratorToolProps } from '../lib/classes/accelerator-tool';
import { OrganizationsClient } from '@aws-sdk/client-organizations';

// Mock CloudFormation client for stack detection and config extraction tests
vi.mock('@aws-sdk/client-cloudformation', async importOriginal => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-cloudformation')>();
  return {
    ...actual,
    CloudFormationClient: vi.fn().mockImplementation(function () {
      return {
        send: vi.fn(),
      };
    }),
  };
});

// Mock STS client for AcceleratorTool methods that call GetCallerIdentity
vi.mock('@aws-sdk/client-sts', async importOriginal => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-sts')>();
  return {
    ...actual,
    STSClient: vi.fn().mockImplementation(function () {
      return {
        send: vi.fn().mockResolvedValue({
          Account: '111122223333',
        }),
      };
    }),
  };
});

/**
 * Helper to build minimal valid AcceleratorToolProps
 */
function makeProps(overrides: Partial<AcceleratorToolProps> = {}): AcceleratorToolProps {
  return {
    installerStackName: 'AWSAccelerator-InstallerContainerStack',
    partition: 'aws',
    fullDestroy: true,
    deleteAccelerator: false,
    keepBootstraps: false,
    keepData: false,
    keepPipelineAndConfig: false,
    stageName: 'all',
    actionName: 'all',
    debug: false,
    ignoreTerminationProtection: true,
    ...overrides,
  };
}

describe('AcceleratorTool construction', () => {
  it('should create instance with valid props', () => {
    // Given
    const props = makeProps();

    // When
    const tool = new AcceleratorTool(props);

    // Then
    expect(tool).toBeDefined();
  });

  it('should accept optional configPath prop', () => {
    // Given
    const props = makeProps({ configPath: '/tmp/config' });

    // When
    const tool = new AcceleratorTool(props);

    // Then
    expect(tool).toBeDefined();
  });
});

describe('resetCredentialEnvironment', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'AWS_ACCESS_KEY_ID',
    'AWS_ACCESS_KEY',
    'AWS_SECRET_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_PROFILE',
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should clear credential env vars and restore AWS_PROFILE', () => {
    // Given
    process.env['AWS_ACCESS_KEY_ID'] = 'ASIAIOSFODNN7EXAMPLE';
    process.env['AWS_ACCESS_KEY'] = 'ASIAIOSFODNN7EXAMPLE';
    process.env['AWS_SECRET_KEY'] = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    process.env['AWS_SESSION_TOKEN'] = 'test-session-token';
    delete process.env['AWS_PROFILE'];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;
    tool.savedAwsProfile = 'test-profile';

    // When
    tool.resetCredentialEnvironment();

    // Then
    expect(process.env['AWS_ACCESS_KEY_ID']).toBeUndefined();
    expect(process.env['AWS_ACCESS_KEY']).toBeUndefined();
    expect(process.env['AWS_SECRET_KEY']).toBeUndefined();
    expect(process.env['AWS_SECRET_ACCESS_KEY']).toBeUndefined();
    expect(process.env['AWS_SESSION_TOKEN']).toBeUndefined();
    expect(process.env['AWS_PROFILE']).toBe('test-profile');
  });

  it('should not set AWS_PROFILE when savedAwsProfile is undefined', () => {
    // Given
    process.env['AWS_ACCESS_KEY_ID'] = 'ASIAIOSFODNN7EXAMPLE';
    delete process.env['AWS_PROFILE'];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    // When
    tool.resetCredentialEnvironment();

    // Then
    expect(process.env['AWS_ACCESS_KEY_ID']).toBeUndefined();
    expect(process.env['AWS_PROFILE']).toBeUndefined();
  });
});

describe('getOrganizationAccountList lifecycle filtering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers State and only cleans up ACTIVE and PENDING_CLOSURE accounts', async () => {
    vi.spyOn(OrganizationsClient.prototype, 'send').mockResolvedValue({
      Accounts: [
        {
          Id: '111111111111',
          Name: 'StateActive',
          Email: 'state-active@example.com',
          State: 'ACTIVE',
          Status: 'SUSPENDED',
        },
        {
          Id: '222222222222',
          Name: 'LegacyActive',
          Email: 'legacy-active@example.com',
          Status: 'ACTIVE',
        },
        {
          Id: '333333333333',
          Name: 'StateSuspended',
          Email: 'state-suspended@example.com',
          State: 'SUSPENDED',
          Status: 'ACTIVE',
        },
        {
          Id: '444444444444',
          Name: 'LegacySuspended',
          Email: 'legacy-suspended@example.com',
          Status: 'SUSPENDED',
        },
        {
          Id: '555555555555',
          Name: 'Closed',
          Email: 'closed@example.com',
          State: 'CLOSED',
          Status: 'ACTIVE',
        },
        {
          Id: '666666666666',
          Name: 'PendingActivation',
          Email: 'pending-activation@example.com',
          State: 'PENDING_ACTIVATION',
        },
        {
          Id: '777777777777',
          Name: 'PendingClosure',
          Email: 'pending-closure@example.com',
          State: 'PENDING_CLOSURE',
        },
        {
          Id: '888888888888',
          Name: 'MissingState',
          Email: 'missing-state@example.com',
        },
        {
          Id: '999999999999',
          Name: 'UnknownState',
          Email: 'unknown-state@example.com',
          State: 'UNKNOWN_STATE',
        },
      ],
      NextToken: undefined,
    } as never);
    const tool = new AcceleratorTool(makeProps());
    tool['pipelineManagementAccount'] = {
      accountId: '111111111111',
      assumeRoleName: undefined,
      credentials: undefined,
    };
    const warnSpy = vi.spyOn(tool['logger'], 'warn');

    const result = await tool['getOrganizationAccountList']();

    expect(result).toEqual([
      { accountName: 'StateActive', accountId: '111111111111' },
      { accountName: 'LegacyActive', accountId: '222222222222' },
      { accountName: 'PendingClosure', accountId: '777777777777' },
    ]);
    expect(warnSpy.mock.calls.filter(([message]) => String(message).includes('lifecycle state'))).toHaveLength(6);
    expect(warnSpy).toHaveBeenCalledWith(
      'Account StateSuspended (state-suspended@example.com) has lifecycle state SUSPENDED and will not be cleaned up',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Account LegacySuspended (legacy-suspended@example.com) has lifecycle state SUSPENDED and will not be cleaned up',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Account Closed (closed@example.com) has lifecycle state CLOSED and will not be cleaned up',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Account PendingActivation (pending-activation@example.com) has lifecycle state PENDING_ACTIVATION and will not be cleaned up',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Account MissingState (missing-state@example.com) has lifecycle state UNKNOWN and will not be cleaned up',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Account UnknownState (unknown-state@example.com) has lifecycle state UNKNOWN_STATE and will not be cleaned up',
    );
  });
});

describe('detectInstallerStackType', () => {
  it('should return CONTAINER when stack has AWS::ECS::Cluster resource', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi.fn().mockResolvedValue({
      StackResourceSummaries: [
        { ResourceType: 'AWS::ECS::Cluster', PhysicalResourceId: 'arn:aws:ecs:us-east-1:111122223333:cluster/test' },
        { ResourceType: 'AWS::S3::Bucket', PhysicalResourceId: 'amzn-s3-demo-bucket' },
      ],
      NextToken: undefined,
    });

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // When
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (AcceleratorTool as any).detectInstallerStackType('AWSAccelerator-InstallerContainerStack');

    // Then
    expect(result).toBe('container');
  });

  it('should return CODEPIPELINE when stack has AWS::CodePipeline::Pipeline resource', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi.fn().mockResolvedValue({
      StackResourceSummaries: [{ ResourceType: 'AWS::CodePipeline::Pipeline', PhysicalResourceId: 'test-pipeline' }],
      NextToken: undefined,
    });

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // When
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (AcceleratorTool as any).detectInstallerStackType('AWSAccelerator-InstallerStack');

    // Then
    expect(result).toBe('codepipeline');
  });

  it('should throw when stack has neither ECS nor CodePipeline resources', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi.fn().mockResolvedValue({
      StackResourceSummaries: [{ ResourceType: 'AWS::S3::Bucket', PhysicalResourceId: 'amzn-s3-demo-bucket' }],
      NextToken: undefined,
    });

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // When / Then
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AcceleratorTool as any).detectInstallerStackType('SomeUnknownStack'),
    ).rejects.toThrow('Unable to determine installer stack type');
  });

  it('should throw when stack does not exist', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi.fn().mockRejectedValue(new Error('Stack not found'));

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // When / Then
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AcceleratorTool as any).detectInstallerStackType('NonExistentStack'),
    ).rejects.toThrow('Failed to detect installer stack type');
  });
});

describe('getContainerDeploymentConfig', () => {
  it('should extract config from stack parameters for external pipeline deployment', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi
      .fn()
      .mockResolvedValueOnce({
        Stacks: [
          {
            Parameters: [
              { ParameterKey: 'AcceleratorQualifier', ParameterValue: 'myqualifier' },
              { ParameterKey: 'AcceleratorPrefix', ParameterValue: 'AWSAccelerator' },
              { ParameterKey: 'ManagementAccountId', ParameterValue: '444455556666' },
              { ParameterKey: 'ManagementAccountRoleName', ParameterValue: 'AWSAccelerator-ContainerDeploymentRole' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        StackResourceSummaries: [
          { ResourceType: 'AWS::ECS::Cluster', PhysicalResourceId: 'arn:aws:ecs:us-east-1:111122223333:cluster/lza' },
          {
            ResourceType: 'AWS::ECS::TaskDefinition',
            PhysicalResourceId: 'arn:aws:ecs:us-east-1:111122223333:task-definition/lza:1',
          },
        ],
        NextToken: undefined,
      });

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    // When
    const config = await tool.getContainerDeploymentConfig('AWSAccelerator-InstallerContainerStack');

    // Then
    expect(config.acceleratorQualifier).toBe('myqualifier');
    expect(config.acceleratorPrefix).toBe('AWSAccelerator');
    expect(config.oneWordPrefix).toBe('accelerator');
    expect(config.managementAccountId).toBe('444455556666');
    expect(config.managementAccountRoleName).toBe('AWSAccelerator-ContainerDeploymentRole');
    expect(config.isExternalPipeline).toBe(true);
    expect(config.ecsClusterArn).toContain('cluster/lza');
    expect(config.taskDefinitionArn).toContain('task-definition/lza');
  });

  it('should set isExternalPipeline false when qualifier is empty', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi
      .fn()
      .mockResolvedValueOnce({
        Stacks: [
          {
            Parameters: [
              { ParameterKey: 'AcceleratorQualifier', ParameterValue: '' },
              { ParameterKey: 'AcceleratorPrefix', ParameterValue: 'AWSAccelerator' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        StackResourceSummaries: [],
        NextToken: undefined,
      });

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    // When
    const config = await tool.getContainerDeploymentConfig('AWSAccelerator-InstallerContainerStack');

    // Then
    expect(config.isExternalPipeline).toBe(false);
    expect(config.oneWordPrefix).toBe('accelerator');
  });

  it('should derive oneWordPrefix as-is for custom prefix', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi
      .fn()
      .mockResolvedValueOnce({
        Stacks: [
          {
            Parameters: [{ ParameterKey: 'AcceleratorPrefix', ParameterValue: 'MyCustomPrefix' }],
          },
        ],
      })
      .mockResolvedValueOnce({
        StackResourceSummaries: [],
        NextToken: undefined,
      });

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    // When
    const config = await tool.getContainerDeploymentConfig('test-stack');

    // Then
    expect(config.oneWordPrefix).toBe('MyCustomPrefix');
  });

  it('should throw when stack is not found', async () => {
    // Given
    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation');
    const mockSend = vi.fn().mockResolvedValue({ Stacks: [] });

    vi.mocked(CloudFormationClient).mockImplementation(function () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { send: mockSend } as any;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    // When / Then
    await expect(tool.getContainerDeploymentConfig('NonExistentStack')).rejects.toThrow(
      'Container installer stack NonExistentStack not found',
    );
  });
});

describe('cleanupStack retained resource scoping', () => {
  /**
   * Retained resources (log groups, buckets, KMS keys, backup vaults) are queued in
   * shared instance arrays across all accounts/regions before stacks are deleted in
   * parallel.
   * Cleanup must therefore only operate on resources belonging to the completed stack.
   */
  it('should only delete post-stack resources belonging to the completed stack', async () => {
    // Given
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    const stackAClient = { send: vi.fn() };
    const stackBClient = { send: vi.fn() };
    tool.logGroups = [
      { client: stackAClient, ownerKey: 'stack-a', logGroup: 'stack-a-log-group' },
      { client: stackBClient, ownerKey: 'stack-b', logGroup: 'stack-b-log-group' },
    ];

    vi.spyOn(tool, 'deletePreStackDeleteResources').mockResolvedValue(undefined);
    vi.spyOn(tool, 'completeStackDeletion').mockResolvedValue(undefined);
    vi.spyOn(tool, 'deleteBackupVaults').mockResolvedValue(undefined);
    vi.spyOn(tool, 'deleteBuckets').mockResolvedValue(undefined);
    vi.spyOn(tool, 'deleteKmsKeys').mockResolvedValue(undefined);
    const deleteCloudWatchLogs = vi.spyOn(tool, 'deleteCloudWatchLogs').mockResolvedValue(true);

    // When
    await tool.cleanupStack({ send: vi.fn() }, 'stack-a');

    // Then - only stack-a's log group is deleted
    expect(deleteCloudWatchLogs).toHaveBeenCalledTimes(1);
    expect(deleteCloudWatchLogs).toHaveBeenCalledWith(stackAClient, 'stack-a', 'stack-a-log-group');

    // And - stack-b's log group remains queued for its own cleanup
    expect(tool.logGroups).toEqual([{ client: stackBClient, ownerKey: 'stack-b', logGroup: 'stack-b-log-group' }]);
  });

  it('should preserve other stacks retained resources across all resource types', async () => {
    // Given
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    tool.logGroups = [
      { client: {}, ownerKey: 'stack-a', logGroup: 'a-lg' },
      { client: {}, ownerKey: 'stack-b', logGroup: 'b-lg' },
    ];
    tool.buckets = [
      { client: {}, ownerKey: 'stack-a', bucket: 'a-bucket' },
      { client: {}, ownerKey: 'stack-b', bucket: 'b-bucket' },
    ];
    tool.kmsKeys = [
      { client: {}, ownerKey: 'stack-a', key: 'a-key' },
      { client: {}, ownerKey: 'stack-b', key: 'b-key' },
    ];
    tool.backupVaults = [
      { client: {}, ownerKey: 'stack-a', backup: 'a-vault' },
      { client: {}, ownerKey: 'stack-b', backup: 'b-vault' },
    ];

    vi.spyOn(tool, 'deletePreStackDeleteResources').mockResolvedValue(undefined);
    vi.spyOn(tool, 'completeStackDeletion').mockResolvedValue(undefined);
    const deleteCloudWatchLogs = vi.spyOn(tool, 'deleteCloudWatchLogs').mockResolvedValue(true);
    const deleteBucket = vi.spyOn(tool, 'deleteBucket').mockResolvedValue(undefined);
    const scheduleKeyDeletion = vi.spyOn(tool, 'scheduleKeyDeletion').mockResolvedValue(undefined);
    const deleteBackupVault = vi.spyOn(tool, 'deleteBackupVault').mockResolvedValue(undefined);

    // When
    await tool.cleanupStack({ send: vi.fn() }, 'stack-a');

    // Then - only stack-a's resource is passed to each leaf delete (loop filter),
    // guarding against an inverted loop predicate acting on the wrong stack
    expect(deleteCloudWatchLogs).toHaveBeenCalledTimes(1);
    expect(deleteCloudWatchLogs).toHaveBeenCalledWith(expect.anything(), 'stack-a', 'a-lg');
    expect(deleteBucket).toHaveBeenCalledTimes(1);
    expect(deleteBucket).toHaveBeenCalledWith(expect.anything(), 'stack-a', 'a-bucket');
    expect(scheduleKeyDeletion).toHaveBeenCalledTimes(1);
    expect(scheduleKeyDeletion).toHaveBeenCalledWith(expect.anything(), 'stack-a', 'a-key');
    expect(deleteBackupVault).toHaveBeenCalledTimes(1);
    expect(deleteBackupVault).toHaveBeenCalledWith(expect.anything(), 'stack-a', 'a-vault');

    // And - all stack-b resources remain queued (clearing filter)
    expect(tool.logGroups).toEqual([{ client: {}, ownerKey: 'stack-b', logGroup: 'b-lg' }]);
    expect(tool.buckets).toEqual([{ client: {}, ownerKey: 'stack-b', bucket: 'b-bucket' }]);
    expect(tool.kmsKeys).toEqual([{ client: {}, ownerKey: 'stack-b', key: 'b-key' }]);
    expect(tool.backupVaults).toEqual([{ client: {}, ownerKey: 'stack-b', backup: 'b-vault' }]);
  });

  it('should only detach/clear IAM roles and policies belonging to the completed stack', async () => {
    // Given - iamRoles/iamPolicies are cleaned up by removeSsmManagedPolicies and
    // detachPoliciesFromRole, whose sole caller is deletePreStackDeleteResources. That
    // caller is deliberately NOT mocked here so the pre-stack IAM scoping filters are
    // actually exercised (an inverted ===/!== predicate would otherwise go uncaught).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    const stackARoleClient = { send: vi.fn().mockResolvedValue({ AttachedPolicies: [] }) };
    const stackBRoleClient = { send: vi.fn().mockResolvedValue({ AttachedPolicies: [] }) };
    const stackAPolicyClient = { send: vi.fn().mockResolvedValue({ PolicyRoles: [] }) };
    const stackBPolicyClient = { send: vi.fn().mockResolvedValue({ PolicyRoles: [] }) };

    tool.iamRoles = [
      { client: stackARoleClient, ownerKey: 'stack-a', roleName: 'stack-a-role' },
      { client: stackBRoleClient, ownerKey: 'stack-b', roleName: 'stack-b-role' },
    ];
    tool.iamPolicies = [
      { client: stackAPolicyClient, ownerKey: 'stack-a', policyName: 'stack-a-policy' },
      { client: stackBPolicyClient, ownerKey: 'stack-b', policyName: 'stack-b-policy' },
    ];

    // Avoid a live SSM lookup for managed policy names
    vi.spyOn(tool, 'getSsmManagedPolicies').mockResolvedValue([]);

    // When - run the real pre-stack IAM cleanup for stack-a only
    await tool.deletePreStackDeleteResources('stack-a');

    // Then - only stack-a's role/policy clients are acted on
    expect(stackARoleClient.send).toHaveBeenCalled();
    expect(stackBRoleClient.send).not.toHaveBeenCalled();
    expect(stackAPolicyClient.send).toHaveBeenCalled();
    expect(stackBPolicyClient.send).not.toHaveBeenCalled();

    // And - stack-b's entries remain queued for their own stack's cleanup
    expect(tool.iamRoles).toEqual([{ client: stackBRoleClient, ownerKey: 'stack-b', roleName: 'stack-b-role' }]);
    expect(tool.iamPolicies).toEqual([
      { client: stackBPolicyClient, ownerKey: 'stack-b', policyName: 'stack-b-policy' },
    ]);
  });
});

describe('CDKToolkit bootstrap per-owner scoping', () => {
  /**
   * The CDKToolkit bootstrap stack uses the same CloudFormation stack name in every
   * account/region ("${prefix}-CDKToolkit"), so it cannot be used as the scoping key
   * for retained resources. Each account/region must instead be tracked under an
   * owner-qualified key so parallel deletion does not drain one owner's KMS key,
   * S3 bucket, and log groups from another owner's cleanup pass.
   */
  it('prepareStackResourcesForDelete tags CDKToolkit resources with an owner-qualified key', async () => {
    // Given - a CDKToolkit stack in two owners with distinct retained resources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    const ownerAResources = [
      { ResourceType: 'AWS::KMS::Key', PhysicalResourceId: 'key-owner-a' },
      { ResourceType: 'AWS::S3::Bucket', PhysicalResourceId: 'bucket-owner-a' },
      { ResourceType: 'AWS::Logs::LogGroup', PhysicalResourceId: 'log-owner-a' },
    ];
    const ownerBResources = [
      { ResourceType: 'AWS::KMS::Key', PhysicalResourceId: 'key-owner-b' },
      { ResourceType: 'AWS::S3::Bucket', PhysicalResourceId: 'bucket-owner-b' },
      { ResourceType: 'AWS::Logs::LogGroup', PhysicalResourceId: 'log-owner-b' },
    ];

    // The CFN stack name is identical in both accounts; only the client and owner
    // key differ. Both List calls hit the same shared bucket list to mimic an
    // S3 API that returns all buckets from the caller's account.
    const cfnClientA = {
      send: vi
        .fn()
        .mockResolvedValueOnce({ StackResourceSummaries: ownerAResources, NextToken: undefined })
        .mockResolvedValue({ Buckets: [{ Name: 'bucket-owner-a' }] }),
    };
    const cfnClientB = {
      send: vi
        .fn()
        .mockResolvedValueOnce({ StackResourceSummaries: ownerBResources, NextToken: undefined })
        .mockResolvedValue({ Buckets: [{ Name: 'bucket-owner-b' }] }),
    };
    const s3ClientA = {
      send: vi.fn().mockResolvedValue({ Buckets: [{ Name: 'bucket-owner-a' }] }),
    };
    const s3ClientB = {
      send: vi.fn().mockResolvedValue({ Buckets: [{ Name: 'bucket-owner-b' }] }),
    };

    const cfnName = 'AWSAccelerator-CDKToolkit';
    const ownerA = `${cfnName}-111111111111-us-east-1`;
    const ownerB = `${cfnName}-222222222222-us-east-1`;

    // When - queue retained resources for both owners under the shared CFN name
    await tool.prepareStackResourcesForDelete(cfnName, ownerA, cfnClientA, {}, s3ClientA, {}, {}, {});
    await tool.prepareStackResourcesForDelete(cfnName, ownerB, cfnClientB, {}, s3ClientB, {}, {}, {});

    // Then - each account's resources are tagged with its own owner-qualified key,
    // so filtering by ownerKey isolates them for per-owner cleanup.
    expect(tool.kmsKeys.filter((k: { ownerKey: string }) => k.ownerKey === ownerA)).toHaveLength(1);
    expect(tool.kmsKeys.filter((k: { ownerKey: string }) => k.ownerKey === ownerB)).toHaveLength(1);
    expect(tool.buckets.filter((b: { ownerKey: string }) => b.ownerKey === ownerA)).toHaveLength(1);
    expect(tool.buckets.filter((b: { ownerKey: string }) => b.ownerKey === ownerB)).toHaveLength(1);
    expect(tool.logGroups.filter((l: { ownerKey: string }) => l.ownerKey === ownerA)).toHaveLength(1);
    expect(tool.logGroups.filter((l: { ownerKey: string }) => l.ownerKey === ownerB)).toHaveLength(1);
  });

  it('cleanupStack drains only the completing owner even when multiple share the CDKToolkit CFN name', async () => {
    // Given - two owners have queued their CDKToolkit retained resources under
    // owner-qualified keys, but both share the same CloudFormation stack name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    const cfnName = 'AWSAccelerator-CDKToolkit';
    const ownerA = `${cfnName}-111111111111-us-east-1`;
    const ownerB = `${cfnName}-222222222222-us-east-1`;

    const clientA = { send: vi.fn() };
    const clientB = { send: vi.fn() };

    tool.logGroups = [
      { client: clientA, ownerKey: ownerA, logGroup: 'log-a' },
      { client: clientB, ownerKey: ownerB, logGroup: 'log-b' },
    ];
    tool.buckets = [
      { client: clientA, ownerKey: ownerA, bucket: 'bucket-a' },
      { client: clientB, ownerKey: ownerB, bucket: 'bucket-b' },
    ];
    tool.kmsKeys = [
      { client: clientA, ownerKey: ownerA, key: 'key-a' },
      { client: clientB, ownerKey: ownerB, key: 'key-b' },
    ];

    vi.spyOn(tool, 'deletePreStackDeleteResources').mockResolvedValue(undefined);
    vi.spyOn(tool, 'completeStackDeletion').mockResolvedValue(undefined);
    const deleteCloudWatchLogs = vi.spyOn(tool, 'deleteCloudWatchLogs').mockResolvedValue(true);
    const deleteBucket = vi.spyOn(tool, 'deleteBucket').mockResolvedValue(undefined);
    const scheduleKeyDeletion = vi.spyOn(tool, 'scheduleKeyDeletion').mockResolvedValue(undefined);

    // When - complete cleanup for owner A only; the shared CFN name is passed
    // separately for the actual DeleteStack API call.
    await tool.cleanupStack({ send: vi.fn() }, cfnName, ownerA);

    // Then - only owner A's retained resources are drained
    expect(deleteCloudWatchLogs).toHaveBeenCalledTimes(1);
    expect(deleteCloudWatchLogs).toHaveBeenCalledWith(clientA, ownerA, 'log-a');
    expect(deleteBucket).toHaveBeenCalledTimes(1);
    expect(deleteBucket).toHaveBeenCalledWith(clientA, ownerA, 'bucket-a');
    expect(scheduleKeyDeletion).toHaveBeenCalledTimes(1);
    expect(scheduleKeyDeletion).toHaveBeenCalledWith(clientA, ownerA, 'key-a');

    // And - owner B's resources are still queued for its own cleanup pass
    expect(tool.logGroups).toEqual([{ client: clientB, ownerKey: ownerB, logGroup: 'log-b' }]);
    expect(tool.buckets).toEqual([{ client: clientB, ownerKey: ownerB, bucket: 'bucket-b' }]);
    expect(tool.kmsKeys).toEqual([{ client: clientB, ownerKey: ownerB, key: 'key-b' }]);
  });

  it('completeStacksDeletion computes owner-qualified keys for CDKToolkit and identity keys for regular stacks', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;
    const prefix = 'AWSAccelerator';
    const cfnName = `${prefix}-CDKToolkit`;
    const clients = {
      cloudFormation: {},
      cloudWatchLogs: {},
      s3: {},
      backup: {},
      iam: {},
      kms: {},
    };
    tool.deleteStackLists = [
      { clients, stackName: cfnName, accountID: '111111111111', region: 'us-east-1' },
      { clients, stackName: cfnName, accountID: '222222222222', region: 'us-east-1' },
      { clients, stackName: `${prefix}-LoggingStack`, accountID: '111111111111', region: 'us-east-1' },
    ];

    vi.spyOn(tool, 'validateStackExistence').mockResolvedValue({ StackName: 'exists' });
    vi.spyOn(tool, 'disableStackTermination').mockResolvedValue(true);
    const prepare = vi.spyOn(tool, 'prepareStackResourcesForDelete').mockResolvedValue(undefined);
    const cleanup = vi.spyOn(tool, 'cleanupStack').mockResolvedValue(undefined);

    // When
    await tool.completeStacksDeletion(prefix);

    // Then - both CDKToolkit entries share the CFN stack name but each carries
    // a distinct account/region-qualified owner key. Passing them as literals
    // via the arg matchers catches any future collapse to fullyQualifiedStackName.
    const ownerA = `${cfnName}-111111111111-us-east-1`;
    const ownerB = `${cfnName}-222222222222-us-east-1`;
    expect(prepare).toHaveBeenNthCalledWith(
      1,
      cfnName,
      ownerA,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(prepare).toHaveBeenNthCalledWith(
      2,
      cfnName,
      ownerB,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(cleanup).toHaveBeenNthCalledWith(1, expect.anything(), cfnName, ownerA);
    expect(cleanup).toHaveBeenNthCalledWith(2, expect.anything(), cfnName, ownerB);
    expect(ownerA).not.toEqual(ownerB);

    const regularCfn = `${prefix}-LoggingStack-111111111111-us-east-1`;
    expect(prepare).toHaveBeenNthCalledWith(
      3,
      regularCfn,
      regularCfn,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(cleanup).toHaveBeenNthCalledWith(3, expect.anything(), regularCfn, regularCfn);
  });

  it('cleanupStack calls DeleteStack with the shared CFN stack name, not the owner key', async () => {
    // Given
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = new AcceleratorTool(makeProps()) as any;

    const cfnName = 'AWSAccelerator-CDKToolkit';
    const ownerKey = `${cfnName}-111111111111-us-east-1`;
    const cfnClient = { send: vi.fn() };

    vi.spyOn(tool, 'deletePreStackDeleteResources').mockResolvedValue(undefined);
    vi.spyOn(tool, 'deletePostStackDeleteResources').mockResolvedValue(undefined);
    const completeStackDeletion = vi.spyOn(tool, 'completeStackDeletion').mockResolvedValue(undefined);

    // When
    await tool.cleanupStack(cfnClient, cfnName, ownerKey);

    // Then - DeleteStack targets the actual CloudFormation stack name, which is
    // the same in every account. The account-qualified owner key must never be
    // used as the CFN stack name (that stack does not exist).
    expect(completeStackDeletion).toHaveBeenCalledWith(cfnClient, cfnName);
  });
});
