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
/* eslint @typescript-eslint/no-explicit-any: 0 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SSMClient, UpdateServiceSettingCommand, GetServiceSettingCommand } from '@aws-sdk/client-ssm';

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn(),
  UpdateServiceSettingCommand: vi.fn(),
  GetServiceSettingCommand: vi.fn(),
  ServiceSettingNotFound: class extends Error {
    constructor(message?: string) {
      super(message || 'Service setting not found');
      this.name = 'ServiceSettingNotFound';
    }
  },
  ThrottlingException: class extends Error {
    constructor(message?: string) {
      super(message || 'Request was throttled');
      this.name = 'ThrottlingException';
    }
  },
}));

import { IBlockPublicDocumentSharingHandlerParameter } from '../../../../interfaces/aws-ssm/manage-document-public-access-block';
import { BlockPublicDocumentSharingModule } from '../../../../lib/aws-ssm/manage-document-public-access-block';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

describe('BlockPublicDocumentSharingModule', () => {
  const mockSend = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();

    (SSMClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('Live Execution Operations', () => {
    const input: IBlockPublicDocumentSharingHandlerParameter = {
      configuration: MOCK_CONSTANTS.BlockPublicDocumentSharingModule.configuration,
      ...MOCK_CONSTANTS.runnerParameters,
    };
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should be successful in enabling SSM Block Public Document Sharing', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Enable' }, // Currently allows public sharing
          });
        }
        if (command instanceof UpdateServiceSettingCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler(input);

      // Verify
      expect(response).toMatch('Enabled SSM Block Public Document Sharing for the environment.');
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledWith({
        SettingId: '/ssm/documents/console/public-sharing-permission',
        SettingValue: 'Disable',
      });
    });

    it('should be successful when SSM Block Public Document Sharing is already enabled', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Disable' }, // Already blocks public sharing
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler(input);

      // Verify
      expect(response).toMatch(
        'SSM Block Public Document Sharing already enabled for the environment, accelerator skipped the process of enabling SSM Block Public Document Sharing.',
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should be successful in disabling SSM Block Public Document Sharing when currently enabled', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Disable' }, // Currently blocks public sharing
          });
        }
        if (command instanceof UpdateServiceSettingCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler({
        configuration: { enable: false },
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch('Disabled SSM Block Public Document Sharing for the environment.');
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledWith({
        SettingId: '/ssm/documents/console/public-sharing-permission',
        SettingValue: 'Enable',
      });
    });

    it('should be successful when SSM Block Public Document Sharing is already disabled', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Enable' }, // Already allows public sharing
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler({
        configuration: { enable: false },
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch(
        'SSM Block Public Document Sharing already disabled for the environment, accelerator skipped the process of disabling SSM Block Public Document Sharing.',
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should handle ServiceSettingNotFound exception with default behavior', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          const error = new Error('Setting not found');
          error.name = 'ServiceSettingNotFound';
          return Promise.reject(error);
        }
        if (command instanceof UpdateServiceSettingCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler(input);

      // Verify
      expect(response).toMatch('Enabled SSM Block Public Document Sharing for the environment.');
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(1);
    });

    it('should throw error when invalid configuration provided', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Enable' },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(
        new BlockPublicDocumentSharingModule().handler({
          configuration: { enable: 'invalid' as any },
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: SSM Block Public Document Sharing configuration is invalid.`,
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should throw error when GetServiceSetting API does not return SettingValue', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: {}, // Missing SettingValue
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new BlockPublicDocumentSharingModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetServiceSetting API did not return SettingValue.`,
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should throw error when GetServiceSetting API fails with unknown error', async () => {
      // Setup
      const testError = new Error('Unknown API error');
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.reject(testError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new BlockPublicDocumentSharingModule().handler(input)).rejects.toThrow('Unknown API error');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should throw error when UpdateServiceSetting API fails', async () => {
      // Setup
      const testError = new Error('Update API error');
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Enable' },
          });
        }
        if (command instanceof UpdateServiceSettingCommand) {
          return Promise.reject(testError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new BlockPublicDocumentSharingModule().handler(input)).rejects.toThrow('Update API error');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dry Run Mode Operations', () => {
    const input: IBlockPublicDocumentSharingHandlerParameter = {
      configuration: MOCK_CONSTANTS.BlockPublicDocumentSharingModule.configuration,
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    it('should return dry run response when enabling and currently disabled', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Enable' }, // Currently allows public sharing
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler(input);

      // Verify
      expect(response).toContain('[DRY-RUN]:');
      expect(response).toContain(
        'SSM Block Public Document Sharing not enabled for the environment, accelerator will enable SSM Block Public Document Sharing.',
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should return dry run response when enabling and already enabled', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Disable' }, // Already blocks public sharing
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler(input);

      // Verify
      expect(response).toContain('[DRY-RUN]:');
      expect(response).toContain(
        'SSM Block Public Document Sharing already enabled for the environment, accelerator will skip the process of enabling SSM Block Public Document Sharing.',
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should return dry run response when disabling and currently enabled', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Disable' }, // Currently blocks public sharing
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler({
        ...input,
        configuration: { enable: false },
      });

      // Verify
      expect(response).toContain('[DRY-RUN]:');
      expect(response).toContain(
        'SSM Block Public Document Sharing enabled for the environment, accelerator will disable SSM Block Public Document Sharing.',
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should return dry run response when disabling and already disabled', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Enable' }, // Already allows public sharing
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler({
        ...input,
        configuration: { enable: false },
      });

      // Verify
      expect(response).toContain('[DRY-RUN]:');
      expect(response).toContain(
        'SSM Block Public Document Sharing already disabled for the environment, accelerator will skip the process of disabling SSM Block Public Document Sharing.',
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });

    it('should return dry run response for invalid configuration', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetServiceSettingCommand) {
          return Promise.resolve({
            ServiceSetting: { SettingValue: 'Enable' },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new BlockPublicDocumentSharingModule().handler({
        ...input,
        configuration: { enable: 'invalid' as any },
      });

      // Verify
      expect(response).toContain('[DRY-RUN]:');
      expect(response).toContain(`Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}`);
      expect(response).toContain('SSM Block Public Document Sharing configuration is invalid');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetServiceSettingCommand).toHaveBeenCalledTimes(1);
      expect(UpdateServiceSettingCommand).toHaveBeenCalledTimes(0);
    });
  });
});
