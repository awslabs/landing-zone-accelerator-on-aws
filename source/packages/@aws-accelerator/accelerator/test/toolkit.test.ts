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
  BootstrapSource: {
    default: vi.fn().mockReturnValue('default-source'),
    customTemplate: vi.fn().mockReturnValue('custom-source'),
  },
  BootstrapEnvironments: {
    fromList: vi.fn().mockReturnValue('environments'),
  },
  BaseCredentials: {
    custom: vi.fn().mockReturnValue('mock-credentials'),
  },
  CdkAppMultiContext: vi.fn(),
  ToolkitError: {
    isAuthenticationError: vi.fn().mockReturnValue(false),
    isAssemblyError: vi.fn().mockReturnValue(false),
    isContextProviderError: vi.fn().mockReturnValue(false),
    isToolkitError: vi.fn().mockReturnValue(false),
  },
}));

// Mock AWS SDK credential providers
vi.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: vi.fn().mockReturnValue('mock-node-provider'),
  fromTemporaryCredentials: vi.fn().mockReturnValue('mock-temp-credentials'),
}));

// Capture the module-level logger so the failure-path logging in synthesizeCdkApp
// can be asserted (the module `const logger = createLogger(['toolkit'])` is bound to
// this mock at import time).
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Preserve every real @aws-accelerator/utils export (toolkit.ts imports many); only
// replace createLogger so the module logger is our spyable mock.
vi.mock('@aws-accelerator/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@aws-accelerator/utils')>();
  return { ...actual, createLogger: vi.fn(() => mockLogger) };
});

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
    (Toolkit as any).mockImplementation(function () {
      return mockToolkit;
    });
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

  describe('bootstrapToolKitStacks', () => {
    it('should set forceDeployment to true when forceBootstrap is enabled', async () => {
      // Arrange
      const options = {
        command: 'bootstrap',
        accountId: '123456789012',
        region: 'us-east-1',
        partition: 'aws',
        stackPrefix: 'AWSAccelerator',
        managementAccountId: '123456789012',
        enableSingleAccountMode: false,
        useExistingRoles: false,
        cdkOptions: {
          forceBootstrap: true,
        },
      };

      mockToolkit.bootstrap = vi.fn().mockResolvedValue(undefined);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (AcceleratorToolkit as any).bootstrapToolKitStacks(mockToolkit, options);

      // Assert
      expect(mockToolkit.bootstrap).toHaveBeenCalledWith(
        'environments',
        expect.objectContaining({
          forceDeployment: true,
          tags: expect.arrayContaining([expect.objectContaining({ Key: 'Accelerator', Value: 'AWSAccelerator' })]),
        }),
      );
    });

    it('should set forceDeployment to false when forceBootstrap is not set', async () => {
      // Arrange
      const options = {
        command: 'bootstrap',
        accountId: '123456789012',
        region: 'us-east-1',
        partition: 'aws',
        stackPrefix: 'AWSAccelerator',
        managementAccountId: '123456789012',
        enableSingleAccountMode: false,
        useExistingRoles: false,
      };

      mockToolkit.bootstrap = vi.fn().mockResolvedValue(undefined);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (AcceleratorToolkit as any).bootstrapToolKitStacks(mockToolkit, options);

      // Assert
      expect(mockToolkit.bootstrap).toHaveBeenCalledWith(
        'environments',
        expect.objectContaining({
          forceDeployment: false,
          tags: expect.arrayContaining([expect.objectContaining({ Key: 'Accelerator', Value: 'AWSAccelerator' })]),
        }),
      );
    });
  });

  describe('getCdkToolKit', () => {
    it('should create toolkit with correct configuration', async () => {
      // Arrange
      const options = {
        command: 'deploy',
        accountId: '123456789012',
        region: 'us-east-1',
        partition: 'aws',
        stackPrefix: 'AWSAccelerator',
        managementAccountId: '123456789012',
        enableSingleAccountMode: false,
        useExistingRoles: false,
      };
      const toolkitStackName = 'AWSAccelerator-CDKToolkit';

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (AcceleratorToolkit as any).getCdkToolKit(options, toolkitStackName);

      // Assert
      expect(result).toBeDefined();
      expect(Toolkit).toHaveBeenCalled();
    });

    it('should create toolkit with GovCloud configuration', async () => {
      // Arrange
      const options = {
        command: 'deploy',
        accountId: '123456789012',
        region: 'us-gov-west-1',
        partition: 'aws-us-gov',
        stackPrefix: 'AWSAccelerator',
        managementAccountId: '123456789012',
        enableSingleAccountMode: false,
        useExistingRoles: false,
      };
      const toolkitStackName = 'AWSAccelerator-CDKToolkit';

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (AcceleratorToolkit as any).getCdkToolKit(options, toolkitStackName);

      // Assert
      expect(result).toBeDefined();
      expect(Toolkit).toHaveBeenCalled();
    });
  });

  describe('getDeploymentRole', () => {
    const getDeploymentRole = (props: {
      stackPrefix: string;
      customDeploymentRoleName?: string;
      accountId: string;
      managementAccountId: string;
      stage: string;
    }): string => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (AcceleratorToolkit as any).getDeploymentRole(props);
    };

    it.each(['accounts', 'prepare', 'pipeline'])(
      'should return the management deployment role for the %s stage in the management account',
      stage => {
        expect(
          getDeploymentRole({
            stackPrefix: 'AWSAccelerator',
            accountId: '111111111111',
            managementAccountId: '111111111111',
            stage,
          }),
        ).toEqual('AWSAccelerator-Management-Deployment-Role');
      },
    );

    it.each(['accounts', 'prepare', 'pipeline'])(
      'should return the account deployment role for the %s stage when the deployment account is not the management account',
      stage => {
        expect(
          getDeploymentRole({
            stackPrefix: 'AWSAccelerator',
            accountId: '222222222222',
            managementAccountId: '111111111111',
            stage,
          }),
        ).toEqual('AWSAccelerator-Deployment-Role');
      },
    );

    it('should return the account deployment role for the tester-pipeline stage in the management account', () => {
      expect(
        getDeploymentRole({
          stackPrefix: 'AWSAccelerator',
          accountId: '111111111111',
          managementAccountId: '111111111111',
          stage: 'tester-pipeline',
        }),
      ).toEqual('AWSAccelerator-Deployment-Role');
    });

    it('should return the custom deployment role for a non-management stage', () => {
      expect(
        getDeploymentRole({
          stackPrefix: 'AWSAccelerator',
          customDeploymentRoleName: 'MyCustomRole',
          accountId: '111111111111',
          managementAccountId: '111111111111',
          stage: 'network-vpc',
        }),
      ).toEqual('MyCustomRole');
    });

    it('should prefer the management deployment role over the custom deployment role in the management account', () => {
      expect(
        getDeploymentRole({
          stackPrefix: 'AWSAccelerator',
          customDeploymentRoleName: 'MyCustomRole',
          accountId: '111111111111',
          managementAccountId: '111111111111',
          stage: 'prepare',
        }),
      ).toEqual('AWSAccelerator-Management-Deployment-Role');
    });

    it('should use the custom deployment role for a management stage outside the management account', () => {
      expect(
        getDeploymentRole({
          stackPrefix: 'AWSAccelerator',
          customDeploymentRoleName: 'MyCustomRole',
          accountId: '222222222222',
          managementAccountId: '111111111111',
          stage: 'prepare',
        }),
      ).toEqual('MyCustomRole');
    });
  });

  describe('buildSynthErrorDetails', () => {
    it('surfaces the underlying cause and stack errors that toolkit-lib hides', () => {
      // Arrange: mirror how toolkit-lib wraps the real error as AssemblyError
      const underlying = new Error('Network_VPCs synth failed: some real reason');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapper: any = new Error('Assembly builder failed');
      wrapper.cause = underlying;
      wrapper.stacks = [{ messages: ['stack annotation error A'] }, { messages: ['stack annotation error B'] }];

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details: string[] = (AcceleratorToolkit as any).buildSynthErrorDetails(wrapper);

      // Assert
      expect(details[0]).toBe(wrapper.stack);
      const causeLine = details.find(d => d.startsWith('Underlying cause:'));
      expect(causeLine).toBeDefined();
      // Message on the label line, no redundant `Error:` class prefix
      expect(causeLine).toContain('Network_VPCs synth failed: some real reason');
      expect(causeLine!.startsWith('Underlying cause: Network_VPCs synth failed: some real reason')).toBe(true);
      expect(causeLine).not.toContain('Underlying cause: Error:');
      // Stack frames are appended on their own lines
      expect(causeLine).toContain('\n    at ');
      const stackLine = details.find(d => d.startsWith('Stack errors:'));
      expect(stackLine).toBeDefined();
      expect(stackLine).toContain('stack annotation error A');
      expect(stackLine).toContain('stack annotation error B');
    });

    it('handles a non-Error cause without throwing', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapper: any = new Error('Assembly builder failed');
      wrapper.cause = 'plain string cause';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details: string[] = (AcceleratorToolkit as any).buildSynthErrorDetails(wrapper);

      expect(details.some(d => d === 'Underlying cause: plain string cause')).toBe(true);
      expect(details.some(d => d.startsWith('Stack errors:'))).toBe(false);
    });

    it('returns only the base line when there is no cause or stacks', () => {
      const err = new Error('plain error');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details: string[] = (AcceleratorToolkit as any).buildSynthErrorDetails(err);

      expect(details).toHaveLength(1);
      expect(details[0]).toBe(err.stack);
    });

    it('falls back to <unserializable> when stack messages cannot be JSON-serialized', () => {
      // BigInt values throw a TypeError in JSON.stringify; the branch must not escape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapper: any = new Error('Assembly builder failed');
      wrapper.stacks = [{ messages: [1n] }];

      let details: string[] = [];
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details = (AcceleratorToolkit as any).buildSynthErrorDetails(wrapper);
      }).not.toThrow();

      expect(details.some(d => d === 'Stack errors: <unserializable>')).toBe(true);
    });

    it('falls back to <unserializable> on a circular stack payload', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circular: any = { messages: [] };
      circular.messages.push(circular);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapper: any = new Error('Assembly builder failed');
      wrapper.stacks = [circular];

      let details: string[] = [];
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details = (AcceleratorToolkit as any).buildSynthErrorDetails(wrapper);
      }).not.toThrow();

      expect(details.some(d => d === 'Stack errors: <unserializable>')).toBe(true);
    });
  });

  describe('synthesizeCdkApp', () => {
    it('rethrows the original error when assembly building fails', async () => {
      // Arrange
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapper: any = new Error('Assembly builder failed');
      wrapper.cause = new Error('the real reason');
      mockToolkit.fromAssemblyBuilder = vi.fn().mockRejectedValue(wrapper);

      const options = { command: 'deploy', accountId: '123456789012', region: 'us-east-1', stage: 'PREPARE' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = { synth: vi.fn() } as any;

      // Act + Assert: the caller must still receive the original error
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AcceleratorToolkit as any).synthesizeCdkApp(mockToolkit, app, options),
      ).rejects.toBe(wrapper);
    });

    it('still rethrows the original error when detail logging throws (circular options)', async () => {
      // Arrange: synth fails, and the detail-logging block throws because
      // JSON.stringify(options) hits a circular reference -> exercises the
      // outer-catch fallback and its guaranteed rethrow.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapper: any = new Error('Assembly builder failed');
      wrapper.cause = new Error('the real reason');
      mockToolkit.fromAssemblyBuilder = vi.fn().mockRejectedValue(wrapper);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const circularOptions: any = { command: 'deploy', region: 'us-east-1' };
      circularOptions.self = circularOptions;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = { synth: vi.fn() } as any;

      // Act + Assert: the fallback must not mask the original error
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AcceleratorToolkit as any).synthesizeCdkApp(mockToolkit, app, circularOptions),
      ).rejects.toBe(wrapper);
    });

    it('surfaces the underlying cause to the logger, not just rethrowing the wrapper', async () => {
      // Arrange: synth fails with a toolkit-lib-style wrapper whose real reason
      // lives on `.cause`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapper: any = new Error('Assembly builder failed');
      wrapper.cause = new Error('the real reason');
      mockToolkit.fromAssemblyBuilder = vi.fn().mockRejectedValue(wrapper);

      const options = { command: 'deploy', accountId: '123456789012', region: 'us-east-1', stage: 'PREPARE' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = { synth: vi.fn() } as any;

      // Act: swallow the expected rethrow so we can assert on the logging.
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (AcceleratorToolkit as any).synthesizeCdkApp(mockToolkit, app, options),
      ).rejects.toBe(wrapper);

      // Assert: the catch -> buildSynthErrorDetails wiring actually emitted the
      // underlying cause. This guards against a refactor that reverts the catch to
      // logging only the wrapper's message/stack while still rethrowing -- which the
      // two rethrow-only tests above would not catch (see issue #4882).
      const loggedCause = mockLogger.error.mock.calls
        .map((call: unknown[]) => call[0])
        .find((arg: unknown) => typeof arg === 'string' && arg.startsWith('Underlying cause: the real reason'));
      expect(loggedCause).toBeDefined();
    });
  });
});
