import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManagePolicy } from '../../../../lib/aws-organizations/manage-policy';
import {
  IManagePolicyHandlerParameter,
  IManagePolicyConfiguration,
  OperationFlag,
} from '../../../../interfaces/aws-organizations/manage-policy';
import {
  PolicyType,
  OrganizationsClient,
  PolicyNotFoundException,
  PolicyNotAttachedException,
  paginateListPolicies,
  paginateListTargetsForPolicy,
} from '@aws-sdk/client-organizations';
import { S3Client } from '@aws-sdk/client-s3';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

vi.mock('@aws-sdk/client-organizations');
vi.mock('@aws-sdk/client-s3');
vi.mock('../../../../common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

const mockAsyncIterable = (data: unknown) =>
  ({
    async *[Symbol.asyncIterator]() {
      yield data;
    },
  } as ReturnType<typeof paginateListPolicies>);

// Helper function to create base parameters
const createBaseParams = (
  overrides: Partial<Omit<IManagePolicyHandlerParameter, 'configuration'>> & {
    configuration?: Partial<IManagePolicyConfiguration>;
  } = {},
): IManagePolicyHandlerParameter => {
  const baseConfig: IManagePolicyConfiguration = {
    name: 'test-policy',
    type: PolicyType.SERVICE_CONTROL_POLICY,
    operationFlag: OperationFlag.UPSERT,
    content: '{}',
  };

  const mergedConfig: IManagePolicyConfiguration = {
    ...baseConfig,
    ...overrides.configuration,
  } as IManagePolicyConfiguration;

  return {
    operation: 'manage-policy' as const,
    dryRun: overrides.dryRun ?? false,
    partition: overrides.partition ?? 'aws',
    region: overrides.region ?? 'us-east-1',
    configuration: mergedConfig,
  };
};

describe('ManagePolicy', () => {
  let managePolicy: ManagePolicy;
  let mockOrganizationsClient: { send: ReturnType<typeof vi.fn> };
  let mockS3Client: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    managePolicy = new ManagePolicy();
    mockOrganizationsClient = { send: vi.fn() };
    mockS3Client = { send: vi.fn() };
    vi.mocked(OrganizationsClient).mockImplementation(() => mockOrganizationsClient as unknown as OrganizationsClient);
    vi.mocked(S3Client).mockImplementation(() => mockS3Client as unknown as S3Client);
    vi.mocked(paginateListPolicies).mockImplementation(() => mockAsyncIterable({ Policies: [], $metadata: {} }));
    vi.mocked(paginateListTargetsForPolicy).mockImplementation(() => mockAsyncIterable({ Targets: [], $metadata: {} }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Dry Run Operations', () => {
    it('should handle dry run scenarios', async () => {
      // Test creation dry run
      let params = createBaseParams({ dryRun: true });
      let result = await managePolicy.handler(params);
      expect(result.status).toBe(true);
      expect(result.message).toContain('Will create policy');

      // Test deletion dry run
      params = createBaseParams({ dryRun: true, configuration: { operationFlag: OperationFlag.DELETE } });
      result = await managePolicy.handler(params);
      expect(result.status).toBe(true);
      expect(result.message).toContain('Will detach and delete policy');

      // Test dry run with validation errors
      params = createBaseParams({
        dryRun: true,
        configuration: { content: undefined, bucketName: undefined, objectPath: undefined },
      });
      result = await managePolicy.handler(params);
      expect(result.status).toBe(true);
      expect(result.message).toContain('Will experience');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate all configuration errors', async () => {
      const testCases = [
        {
          config: { content: '{}', bucketName: 'bucket', objectPath: 'path' },
          expectedError: 'Cannot specify both direct policy content and S3 location',
        },
        { config: { bucketName: 'bucket' }, expectedError: "Both 'bucketName' and 'objectPath' are required" },
        {
          config: { content: undefined, bucketName: undefined, objectPath: undefined },
          expectedError: 'Policy content must be provided',
        },
        { config: { content: 'invalid json' }, expectedError: 'Invalid JSON in policy content' },
      ];

      for (const { config, expectedError } of testCases) {
        const params = createBaseParams({ configuration: config });
        const result = await managePolicy.handler(params);
        expect(result.status).toBe(false);
        expect(result.message).toContain(expectedError);
      }
    });
  });

  describe('Policy Creation', () => {
    it('should create new policy successfully', async () => {
      const params = createBaseParams();
      vi.mocked(paginateListPolicies).mockImplementationOnce(() => mockAsyncIterable({ Policies: [], $metadata: {} }));
      mockOrganizationsClient.send.mockResolvedValue({
        Policy: { PolicySummary: { Id: 'policy-123' } },
      });

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Policy "test-policy" successfully created. Policy ID: policy-123');
    });

    it('should update existing policy', async () => {
      const params = createBaseParams();
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      mockOrganizationsClient.send.mockResolvedValueOnce({});

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Policy "test-policy" successfully updated. Policy ID: policy-123');
    });

    it('should handle policy creation failure when ID not returned', async () => {
      const params = createBaseParams();
      vi.mocked(paginateListPolicies).mockImplementationOnce(() => mockAsyncIterable({ Policies: [], $metadata: {} }));
      mockOrganizationsClient.send.mockResolvedValue({ Policy: {} });

      await expect(managePolicy.handler(params)).rejects.toThrow('Policy ID not returned');
    });
  });

  describe('S3 Content Operations', () => {
    it('should retrieve policy content from S3 successfully', async () => {
      const params = createBaseParams({
        configuration: {
          bucketName: 'bucket',
          objectPath: 'path',
          content: undefined,
        },
      });
      mockS3Client.send.mockResolvedValue({
        Body: { transformToString: () => '{}' },
      });
      vi.mocked(paginateListPolicies).mockImplementationOnce(() => mockAsyncIterable({ Policies: [], $metadata: {} }));
      mockOrganizationsClient.send.mockResolvedValue({
        Policy: { PolicySummary: { Id: 'policy-123' } },
      });

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
    });

    it('should handle S3 object with no body', async () => {
      const params = createBaseParams({
        configuration: {
          bucketName: 'bucket',
          objectPath: 'path',
          content: undefined,
        },
      });
      mockS3Client.send.mockResolvedValue({});

      await expect(managePolicy.handler(params)).rejects.toThrow('has no body content');
    });

    it('should handle S3 access errors', async () => {
      const params = createBaseParams({
        configuration: {
          bucketName: 'bucket',
          objectPath: 'path',
          content: undefined,
        },
      });
      mockS3Client.send.mockRejectedValue(new Error('S3 access denied'));

      await expect(managePolicy.handler(params)).rejects.toThrow('S3 access denied');
    });
  });

  describe('Policy Deletion', () => {
    it('should delete policy successfully', async () => {
      const params = createBaseParams({
        configuration: {
          operationFlag: OperationFlag.DELETE,
        },
      });
      mockOrganizationsClient.send.mockResolvedValue({});
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      vi.mocked(paginateListTargetsForPolicy).mockImplementationOnce(() =>
        mockAsyncIterable({ Targets: [{ TargetId: 'target-1' }], $metadata: {} }),
      );

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
      expect(result.message).toContain('successfully deleted');
    });

    it('should handle policy not found during deletion', async () => {
      const params = createBaseParams({
        configuration: {
          operationFlag: OperationFlag.DELETE,
        },
      });
      vi.mocked(paginateListPolicies).mockImplementationOnce(() => mockAsyncIterable({ Policies: [], $metadata: {} }));

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
      expect(result.message).toContain('successfully deleted');
    });

    it('should handle PolicyNotFoundException during deletion', async () => {
      const params = createBaseParams({
        configuration: {
          operationFlag: OperationFlag.DELETE,
        },
      });
      mockOrganizationsClient.send.mockRejectedValueOnce(
        new PolicyNotFoundException({ message: 'Not found', $metadata: {} }),
      );
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      vi.mocked(paginateListTargetsForPolicy).mockImplementationOnce(() =>
        mockAsyncIterable({ Targets: [], $metadata: {} }),
      );

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
    });

    it('should handle deletion errors', async () => {
      const params = createBaseParams({
        configuration: {
          operationFlag: OperationFlag.DELETE,
        },
      });
      mockOrganizationsClient.send.mockRejectedValueOnce(new Error('Delete failed'));
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      vi.mocked(paginateListTargetsForPolicy).mockImplementationOnce(() =>
        mockAsyncIterable({ Targets: [], $metadata: {} }),
      );

      await expect(managePolicy.handler(params)).rejects.toThrow('Delete failed');
    });

    it('should handle PolicyNotAttachedException during detach', async () => {
      const params = createBaseParams({
        configuration: {
          operationFlag: OperationFlag.DELETE,
        },
      });
      mockOrganizationsClient.send
        .mockRejectedValueOnce(new PolicyNotAttachedException({ message: 'Not attached', $metadata: {} }))
        .mockResolvedValueOnce({});
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      vi.mocked(paginateListTargetsForPolicy).mockImplementationOnce(() =>
        mockAsyncIterable({ Targets: [{ TargetId: 'target-1' }], $metadata: {} }),
      );

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
    });

    it('should handle detach errors', async () => {
      const params = createBaseParams({
        configuration: {
          operationFlag: OperationFlag.DELETE,
        },
      });
      mockOrganizationsClient.send.mockRejectedValueOnce(new Error('Detach failed'));
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      vi.mocked(paginateListTargetsForPolicy).mockImplementationOnce(() =>
        mockAsyncIterable({ Targets: [{ TargetId: 'target-1' }], $metadata: {} }),
      );

      await expect(managePolicy.handler(params)).rejects.toThrow('Detach failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle policies with null names during lookup', async () => {
      const params = createBaseParams();
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({
          Policies: [
            { Name: null, Id: 'policy-123' },
            { Name: 'test-policy', Id: 'policy-456' },
          ],
          $metadata: {},
        }),
      );
      mockOrganizationsClient.send.mockResolvedValueOnce({});

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
    });

    it('should handle undefined Policies array', async () => {
      const params = createBaseParams();
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: undefined, $metadata: {} }),
      );
      mockOrganizationsClient.send.mockResolvedValueOnce({
        Policy: { PolicySummary: { Id: 'policy-123' } },
      });

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
    });

    it('should handle undefined targets during deletion', async () => {
      const params = createBaseParams({
        configuration: {
          operationFlag: OperationFlag.DELETE,
        },
      });
      mockOrganizationsClient.send.mockResolvedValue({});
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      vi.mocked(paginateListTargetsForPolicy).mockImplementationOnce(() =>
        mockAsyncIterable({ Targets: undefined, $metadata: {} }),
      );

      const result = await managePolicy.handler(params);

      expect(result.status).toBe(true);
    });

    it('should handle policy listing errors', async () => {
      const params = createBaseParams();
      vi.mocked(paginateListPolicies).mockImplementationOnce(() => {
        throw new Error('List policies failed');
      });

      await expect(managePolicy.handler(params)).rejects.toThrow('List policies failed');
    });

    it('should handle policy update errors', async () => {
      const params = createBaseParams();
      vi.mocked(paginateListPolicies).mockImplementationOnce(() =>
        mockAsyncIterable({ Policies: [{ Name: 'test-policy', Id: 'policy-123' }], $metadata: {} }),
      );
      mockOrganizationsClient.send.mockRejectedValueOnce(new Error('Update failed'));

      await expect(managePolicy.handler(params)).rejects.toThrow('Update failed');
    });

    it('should handle defensive code in getPolicyContent', async () => {
      const directTestParams = createBaseParams({
        configuration: {
          content: undefined,
          bucketName: undefined,
          objectPath: undefined,
        },
      });

      await expect(managePolicy['getPolicyContent'](directTestParams)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Policy content must be provided`,
      );
    });
  });
});
