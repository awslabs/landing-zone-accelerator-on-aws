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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IRetainResourceModuleRequest,
  retainResources,
} from '../../../../lib/actions/resource-retention/cfn-retention';

// Mock ALL AWS SDK modules completely
vi.mock('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: vi.fn(function () {
    return {
      send: vi.fn(),
    };
  }),
  DescribeStacksCommand: vi.fn(),
  GetTemplateCommand: vi.fn(),
  UpdateStackCommand: vi.fn(),
  StackStatus: {
    CREATE_COMPLETE: 'CREATE_COMPLETE',
    UPDATE_COMPLETE: 'UPDATE_COMPLETE',
    CREATE_FAILED: 'CREATE_FAILED',
    ROLLBACK_IN_PROGRESS: 'ROLLBACK_IN_PROGRESS',
    ROLLBACK_FAILED: 'ROLLBACK_FAILED',
    ROLLBACK_COMPLETE: 'ROLLBACK_COMPLETE',
    UPDATE_ROLLBACK_IN_PROGRESS: 'UPDATE_ROLLBACK_IN_PROGRESS',
    UPDATE_ROLLBACK_FAILED: 'UPDATE_ROLLBACK_FAILED',
    UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS: 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
    UPDATE_ROLLBACK_COMPLETE: 'UPDATE_ROLLBACK_COMPLETE',
    CREATE_IN_PROGRESS: 'CREATE_IN_PROGRESS',
    UPDATE_IN_PROGRESS: 'UPDATE_IN_PROGRESS',
    UPDATE_COMPLETE_CLEANUP_IN_PROGRESS: 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
  },
  TemplateStage: {
    Original: 'Original',
  },
  StackSetOperationStatus: {
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    STOPPED: 'STOPPED',
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () {
    return {
      send: vi.fn(),
    };
  }),
}));

vi.mock('@aws-sdk/client-account', () => ({
  AccountClient: vi.fn(function () {
    return {
      send: vi.fn(),
    };
  }),
  GetRegionOptStatusCommand: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:path
vi.mock('node:path', () => ({
  default: {
    parse: vi.fn(function () {
      return { name: 'cfn-retention' };
    }),
    basename: vi.fn(() => 'cfn-retention.ts'),
    join: vi.fn((...args: string[]) => args.join('/')),
    dirname: vi.fn(() => '/mock/dir'),
  },
}));

// Mock the entire @aws-lza module
vi.mock('aws-lza', () => ({
  getCredentials: vi.fn(),
  createLogger: vi.fn(function () {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      dryRun: vi.fn(),
    };
  }),
  createStatusLogger: vi.fn(function () {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      dryRun: vi.fn(),
    };
  }),
  setRetryStrategy: vi.fn(() => ({})),
  executeApi: vi.fn(),
  uploadFileToS3: vi.fn(),
  getS3Endpoint: vi.fn(
    (partition: string, region: string, bucket: string) => `https://${bucket}.s3.${region}.amazonaws.com`,
  ),
  waitUntil: vi.fn(),
  MODULE_EXCEPTIONS: {
    SERVICE_EXCEPTION: 'SERVICE_EXCEPTION',
    INVALID_INPUT: 'INVALID_INPUT',
  },
}));

const mockCredentials = { accessKeyId: 'test', secretAccessKey: 'test' };

const input: IRetainResourceModuleRequest = {
  invokingAccountId: 'XXXXXXXXXXXX',
  region: 'us-east-1',
  globalRegion: 'us-east-1',
  partition: 'aws',
  solutionId: 'test-solution',
  operation: 'CREATE',
  dryRun: false,
  configuration: {
    directory: 'cf-cr-tempaltes',
    accountId: 'XXXXXXXXXXXX',
    region: 'us-east-1',
    stackName: 'AWSAccelerator-OrganizationsStack-XXXXXXXXXXXX-us-east-1',
    resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount'],
    s3BucketName: 'aws-accelerator-pipeline-XXXXXXXXXXXX-us-east-1',
  },
};

describe('retainResources', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Import and setup mocks after clearing
    const { getCredentials, executeApi, uploadFileToS3, waitUntil } = await import('aws-lza');

    // Mock getCredentials
    (getCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredentials);

    // Mock uploadFileToS3
    (uploadFileToS3 as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Mock waitUntil
    (waitUntil as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Mock executeApi to return appropriate responses based on command name
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(
      async (commandName: string, parameters: Record<string, unknown>) => {
        if (commandName === 'DescribeStacksCommand') {
          if (parameters['StackName'] && (parameters['StackName'] as string).includes('not-found')) {
            return { Stacks: [] };
          }
          return {
            Stacks: [
              {
                StackName: input.configuration.stackName,
                StackStatus: 'CREATE_COMPLETE',
                StackStatusReason: 'Stack created successfully',
              },
            ],
          };
        }

        if (commandName === 'GetTemplateCommand') {
          return {
            TemplateBody: JSON.stringify({
              Resources: {
                TestMacieResource: {
                  Type: 'Custom::MacieEnableOrganizationAdminAccount',
                  Properties: {
                    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:test',
                  },
                },
              },
            }),
          };
        }

        if (commandName === 'UpdateStackCommand') {
          return {
            StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/12345',
          };
        }

        if (commandName === 'GetRegionOptStatusCommand') {
          return { RegionName: parameters['RegionName'], RegionOptStatus: 'ENABLED' };
        }

        return {};
      },
    );
  });

  it('should successfully complete the function', async () => {
    const response = await retainResources(input);

    expect(response).toBeDefined();
    expect(response.requestedResourceTypes).toEqual(input.configuration.resourceTypes);
    expect(response.message).toBe('Resource retention and deployment completed successfully');
    expect(response.deploymentStatus).toBe('CREATE_COMPLETE');
    expect(response.deploymentAttempted).toBe(true);
    expect(response.resourceRetentionStatus?.stackName).toBe(input.configuration.stackName);
    expect(response.resourceRetentionStatus?.modifiedResources).toBeDefined();
  });

  it('should handle stack not found scenario', async () => {
    // Create a modified input that will trigger the not-found path
    const notFoundInput = {
      ...input,
      configuration: {
        ...input.configuration,
        stackName: 'not-found-stack',
      },
    };

    const response = await retainResources(notFoundInput);

    expect(response).toBeDefined();
    expect(response.message).toContain('Stack not-found-stack not found');
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('FAILED');
    expect(response.deploymentAttempted).toBe(false);
  });

  it('should handle dry run mode', async () => {
    const dryRunInput = { ...input, dryRun: true };

    const response = await retainResources(dryRunInput);

    expect(response).toBeDefined();
    expect(response.resourceRetentionStatus?.stackName).toBe(dryRunInput.configuration.stackName);
    expect(response.message).toBe('Resource retention and deployment completed successfully');
  });

  // Additional test cases for 100% coverage

  it('should handle cross-account operations', async () => {
    const crossAccountInput = {
      ...input,
      invokingAccountId: 'YYYYYYYYYYYY',
      configuration: {
        ...input.configuration,
        accountId: 'XXXXXXXXXXXX',
        accountAccessRoleName: 'CrossAccountRole',
      },
    };

    const response = await retainResources(crossAccountInput);

    expect(response).toBeDefined();
    expect(response.message).toBe('Resource retention and deployment completed successfully');
  });

  it('should throw error for cross-account operations without role name', async () => {
    const crossAccountInput = {
      ...input,
      invokingAccountId: 'YYYYYYYYYYYY',
      configuration: {
        ...input.configuration,
        accountId: 'XXXXXXXXXXXX',
        // accountAccessRoleName is missing
      },
    };

    await expect(retainResources(crossAccountInput)).rejects.toThrow(
      'Account access role name is required for cross-account operations',
    );
  });

  it('should handle stack exists validation errors', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return { Stacks: undefined }; // Missing Stacks object
      }
      return {};
    });

    await expect(retainResources(input)).rejects.toThrow(
      'SERVICE_EXCEPTION: DescribeStacks api did not return Stacks object',
    );
  });

  it('should handle multiple stacks error', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [
            { StackName: 'stack1', StackStatus: 'CREATE_COMPLETE' },
            { StackName: 'stack2', StackStatus: 'CREATE_COMPLETE' },
          ],
        };
      }
      return {};
    });

    await expect(retainResources(input)).rejects.toThrow(
      'SERVICE_EXCEPTION: DescribeStacks api returned more than 1 stack',
    );
  });

  it('should handle ValidationError for non-existent stack', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        const error = new Error('Stack does not exist');
        error.name = 'ValidationError';
        throw error;
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('FAILED');
    expect(response.message).toContain('not found');
  });

  it('should skip retention for a disabled opt-in Region without calling CloudFormation', async () => {
    const { executeApi } = await import('aws-lza');
    const describeStacksSpy = vi.fn();
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(
      async (commandName: string, parameters: Record<string, unknown>) => {
        if (commandName === 'GetRegionOptStatusCommand') {
          return { RegionName: parameters['RegionName'], RegionOptStatus: 'DISABLED' };
        }
        if (commandName === 'DescribeStacksCommand') {
          describeStacksSpy();
          return { Stacks: [] };
        }
        return {};
      },
    );

    const optInInput = {
      ...input,
      configuration: { ...input.configuration, region: 'ca-west-1' },
    };

    const response = await retainResources(optInInput);

    expect(response.message).toContain('not enabled');
    expect(response.deploymentAttempted).toBe(false);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('FAILED');
    // Must be the non-terminal REGION_NOT_AVAILABLE code, not STACK_NOT_FOUND: the latter is
    // persisted as terminal NOT_FOUND and would suppress retention once the Region is enabled.
    expect(response.errorCode).toBe('REGION_NOT_AVAILABLE');
    // The doomed CloudFormation call must never be attempted for a disabled opt-in Region.
    expect(describeStacksSpy).not.toHaveBeenCalled();
  });

  it('should proceed normally when an opt-in Region is enabled for the account', async () => {
    // The shared executeApi mock returns RegionOptStatus ENABLED for opt-in Regions.
    const optInInput = {
      ...input,
      configuration: { ...input.configuration, region: 'ca-west-1' },
    };

    const response = await retainResources(optInInput);

    expect(response.deploymentAttempted).toBe(true);
    expect(response.message).toBe('Resource retention and deployment completed successfully');
  });

  it('should fail open and proceed when opt-in status cannot be determined', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'GetRegionOptStatusCommand') {
        const error = new Error('User is not authorized to perform: account:GetRegionOptStatus');
        error.name = 'AccessDeniedException';
        throw error;
      }
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [
            {
              StackName: input.configuration.stackName,
              StackStatus: 'CREATE_COMPLETE',
              StackStatusReason: 'Stack created successfully',
            },
          ],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: { ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:test' },
              },
            },
          }),
        };
      }
      if (commandName === 'UpdateStackCommand') {
        return { StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/12345' };
      }
      return {};
    });

    const optInInput = {
      ...input,
      configuration: { ...input.configuration, region: 'ca-west-1' },
    };

    const response = await retainResources(optInInput);
    // GetRegionOptStatus threw, so the guard fails open and the normal flow runs to completion.
    expect(response.deploymentAttempted).toBe(true);
  });

  it('should defer an opt-in Region InvalidClientTokenId when the opt-in pre-check fails open (tier-1)', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'GetRegionOptStatusCommand') {
        // Pre-check fails open (cannot determine opt-in status), so the tier-1 fallback is exercised.
        const error = new Error('User is not authorized to perform: account:GetRegionOptStatus');
        error.name = 'AccessDeniedException';
        throw error;
      }
      if (commandName === 'DescribeStacksCommand') {
        const error = new Error('The security token included in the request is invalid');
        error.name = 'InvalidClientTokenId';
        throw error;
      }
      return {};
    });

    // Opt-in Region (ca-west-1): a token rejection is a disabled-Region signal, deferred as
    // REGION_NOT_AVAILABLE (non-terminal), not classified as stack-not-found.
    const optInInput = {
      ...input,
      configuration: { ...input.configuration, region: 'ca-west-1' },
    };

    const response = await retainResources(optInInput);
    expect(response.deploymentAttempted).toBe(false);
    expect(response.errorCode).toBe('REGION_NOT_AVAILABLE');
    expect(response.message).toContain('unreachable');
    expect(response.message).not.toContain('not found');
  });

  it('should rethrow InvalidClientTokenId in a standard Region as a genuine auth failure', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        const error = new Error('The security token included in the request is invalid');
        error.name = 'InvalidClientTokenId';
        throw error;
      }
      return {};
    });

    // A standard (always-on) Region can never be a disabled opt-in Region, so InvalidClientTokenId
    // is a real credential failure (suspended/closed account, rejected assumed-role) and must stay
    // fatal - never deferred or swallowed. `input` uses the standard Region us-east-1.
    await expect(retainResources(input)).rejects.toThrow('The security token included in the request is invalid');
  });

  it('should rethrow ExpiredToken rather than deferring it as region-not-available', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        const error = new Error('The security token included in the request is expired');
        error.name = 'ExpiredToken';
        throw error;
      }
      return {};
    });

    // Genuine credential expiry must stay fatal: it is neither swallowed as stack-not-found nor
    // deferred as region-not-available, otherwise a real auth failure would silently skip
    // retention. This pins the swallow/defer-vs-rethrow boundary.
    await expect(retainResources(input)).rejects.toThrow('The security token included in the request is expired');
  });

  it('should handle template modification failure', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return { TemplateBody: 'invalid json' }; // Invalid JSON
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('FAILED');
    expect(response.message).toContain('Template modification failed');
  });

  it('should handle missing template body', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {}; // Missing TemplateBody
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('FAILED');
    expect(response.message).toContain('Template modification failed');
  });

  it('should handle template without Resources', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return { TemplateBody: JSON.stringify({ Parameters: {} }) }; // No Resources
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
    expect(response.deploymentAttempted).toBe(false);
    expect(response.message).toContain('No resources found');
    expect(response.resourceRetentionStatus?.totalModifiedResources).toBe(0);
  });

  it('should handle template with empty Resources object', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return { TemplateBody: JSON.stringify({ Resources: {} }) }; // Empty Resources object
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
    expect(response.deploymentAttempted).toBe(false);
    expect(response.message).toContain('No resources found');
    expect(response.resourceRetentionStatus?.totalModifiedResources).toBe(0);
  });

  it('should handle empty resource types', async () => {
    const emptyResourceTypesInput = {
      ...input,
      configuration: {
        ...input.configuration,
        resourceTypes: [], // Empty array
      },
    };

    const response = await retainResources(emptyResourceTypesInput);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
    expect(response.message).toContain('No resource types specified for retention policy');
  });

  it('should handle resource types not found in template', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              SomeOtherResource: {
                Type: 'AWS::Lambda::Function',
                Properties: {},
              },
            },
          }),
        };
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
    expect(response.deploymentAttempted).toBe(false);
    expect(response.message).toContain('No matching resources found for specified types');
    expect(response.resourceRetentionStatus?.totalModifiedResources).toBe(0);
    expect(response.resourceRetentionStatus?.notFoundResources).toContain(
      'Custom::MacieEnableOrganizationAdminAccount',
    );
  });

  it('should handle resources with dependencies and log groups', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
                DependsOn: ['LogGroup1', 'LogGroup2'],
              },
              LogGroup1: {
                Type: 'AWS::Logs::LogGroup',
                Properties: {},
              },
              LogGroup2: {
                Type: 'AWS::Logs::LogGroup',
                Properties: {},
              },
              OtherResource: {
                Type: 'AWS::Lambda::Function',
                Properties: {},
              },
            },
          }),
        };
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
    expect(response.resourceRetentionStatus?.modifiedResources).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'TestMacieResource' })]),
    );
  });

  it('should handle string dependency', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
                DependsOn: 'LogGroup1', // String instead of array
              },
              LogGroup1: {
                Type: 'AWS::Logs::LogGroup',
                Properties: {},
              },
            },
          }),
        };
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
  });

  it('should handle UpdateStack ValidationError for no updates', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
              },
            },
          }),
        };
      }
      if (commandName === 'UpdateStackCommand') {
        const error = new Error('No updates are to be performed');
        error.name = 'ValidationError';
        throw error;
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.message).toBe('Resource retention and deployment completed successfully');
  });

  it('should handle other UpdateStack errors', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
              },
            },
          }),
        };
      }
      if (commandName === 'UpdateStackCommand') {
        throw new Error('Some other update error');
      }
      return {};
    });

    await expect(retainResources(input)).rejects.toThrow('Some other update error');
  });

  it('should handle getDependencies with various input types', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestResource1: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
                DependsOn: null, // null dependency
              },
              TestResource2: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
                DependsOn: ['dep1', 123, 'dep2'], // mixed array with non-string
              },
            },
          }),
        };
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
  });

  it('should handle missing dryRun parameter', async () => {
    const inputWithoutDryRun = {
      ...input,
      dryRun: undefined,
    } as unknown as IRetainResourceModuleRequest;

    await expect(retainResources(inputWithoutDryRun)).rejects.toThrow(
      'dryRun parameter is required but was not provided',
    );
  });

  it('should handle unexpected stack status during wait', async () => {
    const { executeApi, waitUntil } = await import('aws-lza');
    let callCount = 0;

    // Mock waitUntil to actually execute the callback
    (waitUntil as ReturnType<typeof vi.fn>).mockImplementation(async (callback: () => Promise<boolean>) => {
      await callback();
    });

    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        callCount++;
        if (callCount === 1) {
          // First call - stack exists check
          return {
            Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
          };
        } else {
          // Subsequent calls - after deployment, return unexpected status
          return {
            Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'DELETE_IN_PROGRESS' }],
          };
        }
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
              },
            },
          }),
        };
      }
      if (commandName === 'UpdateStackCommand') {
        return {
          StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/12345',
        };
      }
      return {};
    });

    await expect(retainResources(input)).rejects.toThrow(
      'Stack AWSAccelerator-OrganizationsStack-XXXXXXXXXXXX-us-east-1 operation completed with unexpected status: DELETE_IN_PROGRESS',
    );
  });

  it('should handle stack in progress then completing successfully', async () => {
    const { executeApi, waitUntil } = await import('aws-lza');
    let callCount = 0;

    // Mock waitUntil to call the callback multiple times
    (waitUntil as ReturnType<typeof vi.fn>).mockImplementation(async (callback: () => Promise<boolean>) => {
      let result = await callback();
      while (!result) {
        result = await callback();
      }
    });

    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        callCount++;
        if (callCount === 1) {
          // First call - stack exists check
          return {
            Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
          };
        } else if (callCount === 2) {
          // Second call - stack is in progress
          return {
            Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'UPDATE_IN_PROGRESS' }],
          };
        } else {
          // Third call - stack completed
          return {
            Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'UPDATE_COMPLETE' }],
          };
        }
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
              },
            },
          }),
        };
      }
      if (commandName === 'UpdateStackCommand') {
        return {
          StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/12345',
        };
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.message).toBe('Resource retention and deployment completed successfully');
    expect(response.deploymentStatus).toBe('UPDATE_COMPLETE');
  });

  it('should handle dependencies that are not log groups', async () => {
    const { executeApi } = await import('aws-lza');
    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
                DependsOn: ['LambdaFunction', 'LogGroup1'],
              },
              LambdaFunction: {
                Type: 'AWS::Lambda::Function',
                Properties: {},
              },
              LogGroup1: {
                Type: 'AWS::Logs::LogGroup',
                Properties: {},
              },
            },
          }),
        };
      }
      return {};
    });

    const response = await retainResources(input);
    expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
    expect(response.resourceRetentionStatus?.modifiedResources).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'TestMacieResource' })]),
    );
  });

  it('should handle stack operation failure during wait', async () => {
    const { executeApi, waitUntil } = await import('aws-lza');
    let callCount = 0;

    // Mock waitUntil to actually execute the callback
    (waitUntil as ReturnType<typeof vi.fn>).mockImplementation(async (callback: () => Promise<boolean>) => {
      await callback();
    });

    (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
      if (commandName === 'DescribeStacksCommand') {
        callCount++;
        if (callCount === 1) {
          // First call - stack exists check
          return {
            Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
          };
        } else {
          // Subsequent calls - after deployment, return failed status
          return {
            Stacks: [
              {
                StackName: input.configuration.stackName,
                StackStatus: 'UPDATE_ROLLBACK_COMPLETE',
                StackStatusReason: 'Resource creation failed',
              },
            ],
          };
        }
      }
      if (commandName === 'GetTemplateCommand') {
        return {
          TemplateBody: JSON.stringify({
            Resources: {
              TestMacieResource: {
                Type: 'Custom::MacieEnableOrganizationAdminAccount',
                Properties: {},
              },
            },
          }),
        };
      }
      if (commandName === 'UpdateStackCommand') {
        return {
          StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/12345',
        };
      }
      return {};
    });

    await expect(retainResources(input)).rejects.toThrow(
      'Stack AWSAccelerator-OrganizationsStack-XXXXXXXXXXXX-us-east-1 operation failed with status UPDATE_ROLLBACK_COMPLETE - Resource creation failed',
    );
  });
});

it('should handle stack not found during wait', async () => {
  const { executeApi, waitUntil } = await import('aws-lza');
  let callCount = 0;

  // Mock waitUntil to actually execute the callback
  (waitUntil as ReturnType<typeof vi.fn>).mockImplementation(async (callback: () => Promise<boolean>) => {
    await callback();
  });

  (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
    if (commandName === 'DescribeStacksCommand') {
      callCount++;
      if (callCount === 1) {
        // First call - stack exists check
        return {
          Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
        };
      } else {
        // Subsequent calls - stack not found
        return {
          Stacks: [],
        };
      }
    }
    if (commandName === 'GetTemplateCommand') {
      return {
        TemplateBody: JSON.stringify({
          Resources: {
            TestMacieResource: {
              Type: 'Custom::MacieEnableOrganizationAdminAccount',
              Properties: {},
            },
          },
        }),
      };
    }
    if (commandName === 'UpdateStackCommand') {
      return {
        StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/12345',
      };
    }
    return {};
  });

  await expect(retainResources(input)).rejects.toThrow(
    'Stack AWSAccelerator-OrganizationsStack-XXXXXXXXXXXX-us-east-1 not found',
  );
});

it('should handle resource logical IDs filter with no matches', async () => {
  const { executeApi } = await import('aws-lza');
  (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
    if (commandName === 'DescribeStacksCommand') {
      return {
        Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
      };
    }
    if (commandName === 'GetTemplateCommand') {
      return {
        TemplateBody: JSON.stringify({
          Resources: {
            TestMacieResource: {
              Type: 'Custom::MacieEnableOrganizationAdminAccount',
              Properties: {},
            },
          },
        }),
      };
    }
    return {};
  });

  const inputWithLogicalIds = {
    ...input,
    configuration: {
      ...input.configuration,
      resourceLogicalIds: ['NonExistentResource'], // This doesn't match TestMacieResource
    },
  };

  const response = await retainResources(inputWithLogicalIds);
  expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
  expect(response.deploymentAttempted).toBe(false);
  expect(response.message).toContain('No matching resources found for specified types');
  expect(response.resourceRetentionStatus?.totalModifiedResources).toBe(0);
});

it('should handle dependency that exists but is not a log group', async () => {
  const { executeApi } = await import('aws-lza');
  (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
    if (commandName === 'DescribeStacksCommand') {
      return {
        Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
      };
    }
    if (commandName === 'GetTemplateCommand') {
      return {
        TemplateBody: JSON.stringify({
          Resources: {
            TestMacieResource: {
              Type: 'Custom::MacieEnableOrganizationAdminAccount',
              Properties: {},
              DependsOn: 'LambdaFunction', // Dependency that is NOT a LogGroup
            },
            LambdaFunction: {
              Type: 'AWS::Lambda::Function',
              Properties: {},
            },
          },
        }),
      };
    }
    return {};
  });

  const response = await retainResources(input);
  expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
  expect(response.resourceRetentionStatus?.modifiedResources).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'TestMacieResource' })]),
  );
});

it('should handle dependency that does not exist in template', async () => {
  const { executeApi } = await import('aws-lza');
  (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
    if (commandName === 'DescribeStacksCommand') {
      return {
        Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
      };
    }
    if (commandName === 'GetTemplateCommand') {
      return {
        TemplateBody: JSON.stringify({
          Resources: {
            TestMacieResource: {
              Type: 'Custom::MacieEnableOrganizationAdminAccount',
              Properties: {},
              DependsOn: 'NonExistentResource', // Dependency that doesn't exist
            },
          },
        }),
      };
    }
    return {};
  });

  const response = await retainResources(input);
  expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('SUCCEEDED');
  expect(response.resourceRetentionStatus?.modifiedResources).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'TestMacieResource' })]),
  );
});

it('should handle non-Error exceptions during template modification', async () => {
  const { executeApi } = await import('aws-lza');
  (executeApi as ReturnType<typeof vi.fn>).mockImplementation(async (commandName: string) => {
    if (commandName === 'DescribeStacksCommand') {
      return {
        Stacks: [{ StackName: input.configuration.stackName, StackStatus: 'CREATE_COMPLETE' }],
      };
    }
    if (commandName === 'GetTemplateCommand') {
      // Throw an Error to test the catch block's error handling
      throw new Error('Template retrieval failed');
    }
    return {};
  });

  const response = await retainResources(input);
  expect(response.resourceRetentionStatus?.stackModificationStatus).toBe('FAILED');
  expect(response.message).toContain('Template modification failed: Template retrieval failed');
});
