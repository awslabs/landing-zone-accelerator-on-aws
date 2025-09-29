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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcceleratorToolkit } from '../lib/toolkit';
import { Toolkit, StackSelectionStrategy } from '@aws-cdk/toolkit-lib';

// Mock the Toolkit class
vi.mock('@aws-cdk/toolkit-lib', () => ({
  Toolkit: vi.fn(),
  StackSelectionStrategy: {
    ALL_STACKS: 'ALL_STACKS',
  },
}));

describe('AcceleratorToolkit', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockToolkit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCloudAssemblySource: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCloudAssemblySource = {
      dispose: vi.fn(),
    };

    mockToolkit = {
      fromAssemblyDirectory: vi.fn().mockResolvedValue(mockCloudAssemblySource),
      deploy: vi.fn().mockResolvedValue({ success: true }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Toolkit as any).mockImplementation(() => mockToolkit);
  });

  describe('runDeployStackCli', () => {
    it('should deploy with correct parameters when ACCELERATOR_FORCE_ASSET_PUBLISHING is true', async () => {
      // Arrange
      process.env['ACCELERATOR_FORCE_ASSET_PUBLISHING'] = 'true';
      const options = {
        command: 'deploy',
        accountId: '123456789012',
        region: 'us-east-1',
        stage: 'PREPARE',
        tags: { Environment: 'test' },
      };
      const stackName = 'TestStack';
      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';

      // Mock setOutputDirectory
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(AcceleratorToolkit as any, 'setOutputDirectory').mockResolvedValue('cdk.out/TestStack');

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (AcceleratorToolkit as any).runDeployStackCli(options, stackName, mockToolkit, roleArn);

      // Assert
      expect(mockToolkit.fromAssemblyDirectory).toHaveBeenCalledWith('cdk.out/TestStack');
      expect(mockToolkit.deploy).toHaveBeenCalledWith(mockCloudAssemblySource, {
        concurrency: 1,
        deploymentMethod: { method: 'direct' },
        forceAssetPublishing: true,
        roleArn: roleArn,
        stacks: {
          strategy: StackSelectionStrategy.ALL_STACKS,
        },
        tags: options.tags,
      });
      expect(result).toEqual({ success: true });
    });

    it('should deploy with forceAssetPublishing false when env var is not set', async () => {
      // Arrange
      delete process.env['ACCELERATOR_FORCE_ASSET_PUBLISHING'];
      const options = {
        command: 'deploy',
        accountId: '123456789012',
        region: 'us-east-1',
        stage: 'PREPARE',
        tags: { Environment: 'test' },
      };
      const stackName = 'TestStack';
      const roleArn = 'arn:aws:iam::123456789012:role/TestRole';

      // Mock setOutputDirectory
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(AcceleratorToolkit as any, 'setOutputDirectory').mockResolvedValue('cdk.out/TestStack');

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (AcceleratorToolkit as any).runDeployStackCli(options, stackName, mockToolkit, roleArn);

      // Assert
      expect(mockToolkit.deploy).toHaveBeenCalledWith(mockCloudAssemblySource, {
        concurrency: 1,
        deploymentMethod: { method: 'direct' },
        forceAssetPublishing: false,
        roleArn: roleArn,
        stacks: {
          strategy: StackSelectionStrategy.ALL_STACKS,
        },
        tags: options.tags,
      });
    });
  });
});
