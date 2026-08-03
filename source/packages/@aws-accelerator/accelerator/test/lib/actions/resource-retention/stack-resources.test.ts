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

import { MODULE_STATE_CODE } from 'aws-lza';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cfnRetention from '../../../../lib/actions/resource-retention/cfn-retention';
import * as registry from '../../../../lib/actions/resource-retention/registry';
import * as retentionState from '../../../../lib/actions/resource-retention/retention-state';
import { StackResources } from '../../../../lib/actions/resource-retention/stack-resources';
import { RetentionStatus } from '../../../../lib/actions/resource-retention/types';
import { AcceleratorModules, ModuleParams } from '../../../../lib/types';

// Mock dependencies
vi.mock('../../../../lib/actions/resource-retention/cfn-retention');
vi.mock('../../../../lib/actions/resource-retention/retention-state');
vi.mock('../../../../lib/actions/resource-retention/registry');
vi.mock('../../../../lib/actions/utils/common-config', () => ({
  getCfnRetentionBucketName: vi.fn(() => 'cdk-accel-assets-123456789012-us-east-1'),
}));

describe('StackResources', () => {
  const mockParams: ModuleParams = {
    moduleItem: {
      name: AcceleratorModules.STACK_RESOURCES_RETENTION,
      description: 'Test module',
      runOrder: 1,
      executionPhase: 'deploy' as unknown as never,
      handler: vi.fn(),
    },
    runnerParameters: {
      sessionContext: {
        invokingAccountId: '123456789012',
        region: 'us-east-1',
        globalRegion: 'us-east-1',
        partition: 'aws',
      },
      solutionId: 'AwsSolution/SO0199/v1.0.0',
      dryRun: false,
      configDirPath: '/config',
      prefix: 'AWSAccelerator',
      loadOrganizationsFromDynamoDbTable: false,
    },
    moduleRunnerParameters: {
      configs: {
        accountsConfig: {
          getManagementAccountId: vi.fn(() => '111111111111'),
          getAuditAccountId: vi.fn(() => '222222222222'),
          getActiveAccountIds: vi.fn(() => ['111111111111', '222222222222', '333333333333']),
          mandatoryAccounts: [
            { name: 'Management', email: 'mgmt@example.com', organizationalUnit: 'Root' },
            { name: 'LogArchive', email: 'log@example.com', organizationalUnit: 'Security' },
            { name: 'Audit', email: 'audit@example.com', organizationalUnit: 'Security' },
          ],
          workloadAccounts: [{ name: 'Workload', email: 'workload@example.com', organizationalUnit: 'Workloads' }],
          accountIds: [
            { accountId: '111111111111', email: 'mgmt@example.com' },
            { accountId: '222222222222', email: 'audit@example.com' },
            { accountId: '333333333333', email: 'workload@example.com' },
          ],
        } as unknown as never,
        globalConfig: {
          enabledRegions: ['us-east-1', 'us-west-2'],
          homeRegion: 'us-east-1',
          managementAccountAccessRole: 'AWSControlTowerExecution',
        } as unknown as never,
        organizationConfig: {
          isIgnored: vi.fn(() => false),
          getIgnoredOus: vi.fn(() => []),
        } as unknown as never,
      } as unknown as never,
      organizationAccounts: [
        { Id: '111111111111', Name: 'Management' },
        { Id: '222222222222', Name: 'Audit' },
        { Id: '333333333333', Name: 'Workload' },
      ],
      managementAccountCredentials: {} as unknown as never,
    } as unknown as never,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('StackResources.retain', () => {
    it('should skip when no resources registered', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {};

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.SKIPPED);
      expect(result.summary).toContain('No resources registered');
      expect(result.moduleName).toBe(AcceleratorModules.STACK_RESOURCES_RETENTION);
    });

    it('should process registered resources successfully', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 5,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.summary).toContain('Successfully processed');
      expect(result.summary).toContain('retained');
    });

    it('should handle retention failures', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Retention failed',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'FAILED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 0,
        },
      });

      // The function catches the error and returns a failed result
      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.summary).toContain('Resource retention failed');
      expect(result.error?.message).toContain('Retention failed');
    });

    it('should handle NOT_FOUND stacks', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Stack not found',
        errorCode: cfnRetention.RetentionErrorCode.STACK_NOT_FOUND,
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'FAILED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 0,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.summary).toContain('not found');
    });

    it('should handle dry-run mode', async () => {
      const dryRunParams: ModuleParams = {
        ...mockParams,
        runnerParameters: {
          ...mockParams.runnerParameters,
          dryRun: true,
        },
      };

      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully (dry-run)',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 5,
        },
      });

      const result = await StackResources.retain(dryRunParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.dryRun).toBe(true);
    });

    it('should handle unexpected errors', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      vi.mocked(retentionState.getAllRetentionStates).mockRejectedValue(new Error('DynamoDB error'));

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.summary).toContain('Resource retention failed');
      expect(result.error?.message).toContain('DynamoDB error');
    });

    it('should handle OrganizationsStack deployment targets', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-OrganizationsStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieEnableOrganizationAdminAccount'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // Verify only management account was targeted (2 regions)
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(2);
    });

    it('should handle SecurityAuditStack deployment targets', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityAuditStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieCreateMember'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieCreateMember'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // Verify only audit account was targeted (2 regions)
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(2);
    });

    it('should handle PrepareStack deployment targets', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-PrepareStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieSession'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieSession'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // Verify only management account in homeRegion was targeted (1 region)
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(1);
    });

    it('should handle AccountsStack deployment targets', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-AccountsStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieUpdateConfig'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieUpdateConfig'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // Verify only management account in globalRegion was targeted (1 region)
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(1);
    });

    it('should handle FinalizeStack deployment targets', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-FinalizeStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieUpdateSession'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieUpdateSession'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // Verify only management account in globalRegion was targeted (1 region)
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(1);
    });

    it('should skip already completed stacks', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      // Add completed state for ALL stacks (3 accounts × 2 regions = 6 stacks)
      const accounts = ['111111111111', '222222222222', '333333333333'];
      const regions = ['us-east-1', 'us-west-2'];
      for (const accountId of accounts) {
        for (const region of regions) {
          const stackName = `AWSAccelerator-SecurityStack-${accountId}-${region}`;
          allStates.set(`${accountId}:${region}:${stackName}`, {
            serviceName: AcceleratorModules.MACIE,
            accountId,
            region,
            stackName,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
            retentionStatus: RetentionStatus.COMPLETED,
            retentionAttempts: 1,
            resourcesRetained: true,
          });
        }
      }

      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.summary).toContain('skipped');
      // Verify retainResources was not called for completed stacks
      expect(cfnRetention.retainResources).not.toHaveBeenCalled();
    });

    it('should retry failed stacks', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      allStates.set('111111111111:us-east-1:AWSAccelerator-SecurityStack-111111111111-us-east-1', {
        serviceName: AcceleratorModules.MACIE,
        accountId: '111111111111',
        region: 'us-east-1',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-east-1',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: RetentionStatus.FAILED,
        retentionAttempts: 1,
        resourcesRetained: false,
        lastError: 'Previous error',
      });

      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 5,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // Verify retainResources was called to retry
      expect(cfnRetention.retainResources).toHaveBeenCalled();
    });

    it('should skip stacks with resourcesRetained flag', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      // Add state with resourcesRetained=true for ALL stacks (3 accounts × 2 regions = 6 stacks)
      const accounts = ['111111111111', '222222222222', '333333333333'];
      const regions = ['us-east-1', 'us-west-2'];
      for (const accountId of accounts) {
        for (const region of regions) {
          const stackName = `AWSAccelerator-SecurityStack-${accountId}-${region}`;
          allStates.set(`${accountId}:${region}:${stackName}`, {
            serviceName: AcceleratorModules.MACIE,
            accountId,
            region,
            stackName,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
            retentionStatus: RetentionStatus.IN_PROGRESS,
            retentionAttempts: 1,
            resourcesRetained: true,
          });
        }
      }

      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.summary).toContain('skipped');
      expect(cfnRetention.retainResources).not.toHaveBeenCalled();
    });

    it('should handle multiple stack types with different deployment targets', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-OrganizationsStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount'],
          },
        ],
        'AWSAccelerator-SecurityAuditStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieCreateMember'],
          },
        ],
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: [],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // OrganizationsStack: 1 account × 2 regions = 2
      // SecurityAuditStack: 1 account × 2 regions = 2
      // SecurityStack: 3 accounts × 2 regions = 6
      // Total: 10 stacks
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(10);
    });

    it('should handle batching with custom batch size', async () => {
      // Set custom batch size via environment variable
      const originalBatchSize = process.env['CFN_RETENTION_BATCH_SIZE'];
      process.env['CFN_RETENTION_BATCH_SIZE'] = '2';

      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // 3 accounts × 2 regions = 6 stacks, batch size 2 = 3 batches
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(6);

      // Restore original batch size
      if (originalBatchSize === undefined) {
        delete process.env['CFN_RETENTION_BATCH_SIZE'];
      } else {
        process.env['CFN_RETENTION_BATCH_SIZE'] = originalBatchSize;
      }
    });

    it('should handle retainResources throwing an error', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockRejectedValue(new Error('CloudFormation API error'));

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.summary).toContain('Resource retention failed');
      expect(result.error?.message).toContain('Retention failed');
    });

    it('should handle PENDING status stacks', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      allStates.set('111111111111:us-east-1:AWSAccelerator-SecurityStack-111111111111-us-east-1', {
        serviceName: AcceleratorModules.MACIE,
        accountId: '111111111111',
        region: 'us-east-1',
        stackName: 'AWSAccelerator-SecurityStack-111111111111-us-east-1',
        resourceTypes: ['Custom::MacieExportConfigClassification'],
        retentionStatus: RetentionStatus.PENDING,
        retentionAttempts: 0,
        resourcesRetained: false,
      });

      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 5,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(cfnRetention.retainResources).toHaveBeenCalled();
    });

    it('should handle error checking retention need', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      // getAllRetentionStates throws error (simulating error in batch state retrieval)
      vi.mocked(retentionState.getAllRetentionStates).mockRejectedValue(new Error('DynamoDB query error'));

      const result = await StackResources.retain(mockParams);

      // Should fail because getAllRetentionStates error is not caught
      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.error?.message).toContain('DynamoDB query error');
    });

    it('should aggregate multiple services for same stack type', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
          {
            serviceName: 'guardduty' as AcceleratorModules,
            resourceTypes: ['Custom::GuardDutyCreatePublishingDestination'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);

      let callCount = 0;
      vi.mocked(cfnRetention.retainResources).mockImplementation(async (request: unknown) => {
        callCount++;
        const req = request as { configuration: { resourceTypes: string[] } };
        // Verify both resource types are included
        expect(req.configuration.resourceTypes).toContain('Custom::MacieExportConfigClassification');
        expect(req.configuration.resourceTypes).toContain('Custom::GuardDutyCreatePublishingDestination');

        return {
          message: 'Resources retained successfully',
          requestedResourceTypes: req.configuration.resourceTypes,
          resourceRetentionStatus: {
            stackName: 'test-stack',
            stackModificationStatus: 'SUCCEEDED',
            modifiedResources: [],
            notFoundResources: [],
            totalModifiedResources: 2,
          },
        };
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(callCount).toBe(6); // 3 accounts × 2 regions
    });

    it('should handle error in needsRetention when checking individual state', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      // getAllRetentionStates returns empty map (no cached states)
      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);

      // First call to getRetentionState throws error (triggers catch block in needsRetention)
      let getStateCallCount = 0;
      vi.mocked(retentionState.getRetentionState).mockImplementation(async () => {
        getStateCallCount++;
        if (getStateCallCount === 1) {
          throw new Error('DynamoDB connection error');
        }
        return undefined;
      });

      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      // Should fail because getRetentionState error causes retainStackResources to fail
      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(getStateCallCount).toBeGreaterThan(0);
    });

    it('should handle promise rejection in batch execution', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);

      // First call succeeds, second call throws (not rejects, but throws synchronously)
      let callCount = 0;
      vi.mocked(cfnRetention.retainResources).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Network timeout');
        }
        return {
          message: 'Resources retained successfully',
          requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
          resourceRetentionStatus: {
            stackName: 'test-stack',
            stackModificationStatus: 'SUCCEEDED',
            modifiedResources: [],
            notFoundResources: [],
            totalModifiedResources: 1,
          },
        };
      });

      const result = await StackResources.retain(mockParams);

      // Should fail because one retention failed
      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.error?.message).toContain('Retention failed');
    });

    it('should handle non-Error rejection in promise', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);

      // Reject with non-Error object (string)
      let callCount = 0;
      vi.mocked(cfnRetention.retainResources).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw 'String error message'; // Non-Error rejection
        }
        return {
          message: 'Resources retained successfully',
          requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
          resourceRetentionStatus: {
            stackName: 'test-stack',
            stackModificationStatus: 'SUCCEEDED',
            modifiedResources: [],
            notFoundResources: [],
            totalModifiedResources: 1,
          },
        };
      });

      const result = await StackResources.retain(mockParams);

      // Should fail and handle non-Error rejection
      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.summary).toContain('Retention failed');
    });

    it('should cover promise rejection path with actual rejected promise', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);

      // Make getRetentionState throw to force retainStackResources to fail early
      // This will cause the promise to reject before the try-catch can handle it
      vi.mocked(retentionState.getRetentionState).mockRejectedValue(new Error('Critical state error'));

      const result = await StackResources.retain(mockParams);

      // Should fail because getRetentionState error causes operation to fail
      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    });

    it('should skip retention for a service when its SKIP env var is set', async () => {
      const originalSkip = process.env['SKIP_MACIE_MODULE'];
      process.env['SKIP_MACIE_MODULE'] = 'true';

      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
          {
            serviceName: 'guardduty' as AcceleratorModules,
            resourceTypes: ['Custom::GuardDutyCreatePublishingDestination'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockImplementation(async (request: unknown) => {
        const req = request as { configuration: { resourceTypes: string[] } };
        // Only GuardDuty resource should be present, Macie should be filtered out
        expect(req.configuration.resourceTypes).not.toContain('Custom::MacieExportConfigClassification');
        expect(req.configuration.resourceTypes).toContain('Custom::GuardDutyCreatePublishingDestination');
        return {
          message: 'Resources retained successfully',
          requestedResourceTypes: req.configuration.resourceTypes,
          resourceRetentionStatus: {
            stackName: 'test-stack',
            stackModificationStatus: 'SUCCEEDED',
            modifiedResources: [],
            notFoundResources: [],
            totalModifiedResources: 1,
          },
        };
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // 3 accounts × 2 regions = 6 calls (only GuardDuty resources)
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(6);

      if (originalSkip === undefined) {
        delete process.env['SKIP_MACIE_MODULE'];
      } else {
        process.env['SKIP_MACIE_MODULE'] = originalSkip;
      }
    });

    it('should skip entire stack prefix when all services are skipped', async () => {
      const originalSkip = process.env['SKIP_MACIE_MODULE'];
      process.env['SKIP_MACIE_MODULE'] = 'true';

      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.summary).toContain('all services filtered out');
      // Early return — no DynamoDB or retention calls
      expect(retentionState.getAllRetentionStates).not.toHaveBeenCalled();
      expect(cfnRetention.retainResources).not.toHaveBeenCalled();

      if (originalSkip === undefined) {
        delete process.env['SKIP_MACIE_MODULE'];
      } else {
        process.env['SKIP_MACIE_MODULE'] = originalSkip;
      }
    });

    it('should not skip retention when SKIP env var is not set', async () => {
      // Ensure SKIP_MACIE_MODULE is not set
      const originalSkip = process.env['SKIP_MACIE_MODULE'];
      delete process.env['SKIP_MACIE_MODULE'];

      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // 3 accounts × 2 regions = 6 calls
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(6);

      if (originalSkip === undefined) {
        delete process.env['SKIP_MACIE_MODULE'];
      } else {
        process.env['SKIP_MACIE_MODULE'] = originalSkip;
      }
    });

    it('should handle non-Error type in promise rejection', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);

      // Reject with non-Error type (number) to test the instanceof Error check
      vi.mocked(retentionState.getRetentionState).mockRejectedValue(12345);

      const result = await StackResources.retain(mockParams);

      // Should fail and handle non-Error rejection with "Unknown error"
      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    });

    it('should handle NetworkAssociationsStack targeting all accounts and regions', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-NetworkAssociationsStack': [
          {
            serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
            resourceTypes: [
              'AWS::EC2::TransitGatewayRouteTableAssociation',
              'AWS::EC2::TransitGatewayRouteTablePropagation',
            ],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: [
          'AWS::EC2::TransitGatewayRouteTableAssociation',
          'AWS::EC2::TransitGatewayRouteTablePropagation',
        ],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 2,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // NetworkAssociationsStack falls through to default: all accounts × all regions
      // 3 accounts × 2 regions = 6 stacks
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(6);

      // Verify both resource types are passed in each call
      for (const call of vi.mocked(cfnRetention.retainResources).mock.calls) {
        const request = call[0] as unknown as { configuration: { resourceTypes: string[] } };
        expect(request.configuration.resourceTypes).toContain('AWS::EC2::TransitGatewayRouteTableAssociation');
        expect(request.configuration.resourceTypes).toContain('AWS::EC2::TransitGatewayRouteTablePropagation');
      }
    });

    it('should skip TGW retention when SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE is set', async () => {
      const originalSkip = process.env['SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE'];
      process.env['SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE'] = 'true';

      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-NetworkAssociationsStack': [
          {
            serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
            resourceTypes: [
              'AWS::EC2::TransitGatewayRouteTableAssociation',
              'AWS::EC2::TransitGatewayRouteTablePropagation',
            ],
          },
        ],
      };

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.summary).toContain('all services filtered out');
      expect(cfnRetention.retainResources).not.toHaveBeenCalled();

      if (originalSkip === undefined) {
        delete process.env['SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE'];
      } else {
        process.env['SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE'] = originalSkip;
      }
    });

    it('should handle NetworkAssociationsStack with NOT_FOUND stacks gracefully', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-NetworkAssociationsStack': [
          {
            serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
            resourceTypes: [
              'AWS::EC2::TransitGatewayRouteTableAssociation',
              'AWS::EC2::TransitGatewayRouteTablePropagation',
            ],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      // All stacks return NOT_FOUND (accounts without TGWs won't have this stack)
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Stack not found',
        errorCode: cfnRetention.RetentionErrorCode.STACK_NOT_FOUND,
        requestedResourceTypes: [
          'AWS::EC2::TransitGatewayRouteTableAssociation',
          'AWS::EC2::TransitGatewayRouteTablePropagation',
        ],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'FAILED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 0,
        },
      });

      const result = await StackResources.retain(mockParams);

      // Should complete successfully even when all stacks are NOT_FOUND
      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.summary).toContain('not found');
    });

    it('should handle mixed Macie and TGW registry entries across different stacks', async () => {
      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-OrganizationsStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount'],
          },
        ],
        'AWSAccelerator-NetworkAssociationsStack': [
          {
            serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
            resourceTypes: [
              'AWS::EC2::TransitGatewayRouteTableAssociation',
              'AWS::EC2::TransitGatewayRouteTablePropagation',
            ],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: [],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(mockParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // OrganizationsStack: 1 account (mgmt) × 2 regions = 2
      // NetworkAssociationsStack: 3 accounts × 2 regions = 6
      // Total: 8 stacks
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(8);
    });

    it('should exclude accounts in ignored OUs from retention', async () => {
      // Create params with an ignored OU containing the workload account
      const ignoredOuParams: ModuleParams = {
        ...mockParams,
        moduleRunnerParameters: {
          ...mockParams.moduleRunnerParameters,
          configs: {
            ...(mockParams.moduleRunnerParameters as unknown as { configs: object }).configs,
            accountsConfig: {
              ...(
                mockParams.moduleRunnerParameters as unknown as {
                  configs: { accountsConfig: object };
                }
              ).configs.accountsConfig,
              getActiveAccountIds: vi.fn(() => ['111111111111', '222222222222']),
            } as unknown as never,
            organizationConfig: {
              isIgnored: vi.fn((ouName: string) => ouName === 'Workloads'),
              getIgnoredOus: vi.fn(() => [{ name: 'Workloads', ignore: true }]),
            } as unknown as never,
          } as unknown as never,
        } as unknown as never,
      };

      vi.mocked(registry).RESOURCE_RETENTION_REGISTRY = {
        'AWSAccelerator-SecurityStack': [
          {
            serviceName: AcceleratorModules.MACIE,
            resourceTypes: ['Custom::MacieExportConfigClassification'],
          },
        ],
      };

      const allStates = new Map();
      vi.mocked(retentionState.getAllRetentionStates).mockResolvedValue(allStates);
      vi.mocked(retentionState.getRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.saveRetentionState).mockResolvedValue(undefined);
      vi.mocked(retentionState.updateRetentionStatus).mockResolvedValue(undefined);
      vi.mocked(cfnRetention.retainResources).mockResolvedValue({
        message: 'Resources retained successfully',
        requestedResourceTypes: ['Custom::MacieExportConfigClassification'],
        resourceRetentionStatus: {
          stackName: 'test-stack',
          stackModificationStatus: 'SUCCEEDED',
          modifiedResources: [],
          notFoundResources: [],
          totalModifiedResources: 1,
        },
      });

      const result = await StackResources.retain(ignoredOuParams);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      // SecurityStack targets all accounts, but account 333333333333 (Workloads OU) should be excluded
      // Remaining: 2 accounts (mgmt + audit) × 2 regions = 4 stacks
      expect(cfnRetention.retainResources).toHaveBeenCalledTimes(4);
    });
  });
});
