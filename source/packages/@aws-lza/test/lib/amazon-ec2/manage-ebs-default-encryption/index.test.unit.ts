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
import { describe, beforeEach, expect, test } from '@jest/globals';

import { ManageEbsDefaultEncryptionModule } from '../../../../lib/amazon-ec2/manage-ebs-default-encryption/index';

import { MOCK_CONSTANTS } from '../../../mocked-resources';
import {
  DisableEbsEncryptionByDefaultCommand,
  EC2Client,
  EnableEbsEncryptionByDefaultCommand,
  GetEbsDefaultKmsKeyIdCommand,
  GetEbsEncryptionByDefaultCommand,
  ModifyEbsDefaultKmsKeyIdCommand,
} from '@aws-sdk/client-ec2';
import { IManageEbsDefaultEncryptionHandlerParameter } from '../../../../interfaces/amazon-ec2/manage-ebs-default-encryption';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

// Mock dependencies
jest.mock('@aws-sdk/client-ec2', () => {
  return {
    EC2Client: jest.fn(),
    GetEbsEncryptionByDefaultCommand: jest.fn(),
    GetEbsDefaultKmsKeyIdCommand: jest.fn(),
    EnableEbsEncryptionByDefaultCommand: jest.fn(),
    ModifyEbsDefaultKmsKeyIdCommand: jest.fn(),
    DisableEbsEncryptionByDefaultCommand: jest.fn(),
  };
});

describe('ManageEbsDefaultEncryptionModule', () => {
  const mockSend = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();

    (EC2Client as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('Live Execution Operations', () => {
    const input: IManageEbsDefaultEncryptionHandlerParameter = {
      configuration: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.configuration,
      ...MOCK_CONSTANTS.runnerParameters,
    };
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful in configuring default encryption key', async () => {
      // Setup
      let getEbsEncryptionByDefaultCommandCount = 0;

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          getEbsEncryptionByDefaultCommandCount++;
          if (getEbsEncryptionByDefaultCommandCount === 1) {
            return Promise.resolve({
              EbsEncryptionByDefault: false,
            });
          }
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        if (command instanceof EnableEbsEncryptionByDefaultCommand) {
          return Promise.resolve({});
        }
        if (command instanceof ModifyEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({ KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.configuration.kmsKeyId });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Amazon EBS default encryption set to kms key id changed from "${MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId}" to "${MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.configuration.kmsKeyId}" for the environment.`,
      );
      expect(mockSend).toHaveBeenCalledTimes(5);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(2);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
    });

    test('should be successful in when default encryption is already configured', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: false,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        if (command instanceof EnableEbsEncryptionByDefaultCommand) {
          return Promise.resolve({});
        }
        if (command instanceof ModifyEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({ KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.configuration.kmsKeyId });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Amazon EBS default encryption already set to kms key id to "${MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.configuration.kmsKeyId}" for the environment, accelerator skipped the process of enabling EBS default encryption key.`,
      );
      expect(mockSend).toHaveBeenCalledTimes(4);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(2);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful disable default encryption when default encryption is enabled', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        if (command instanceof DisableEbsEncryptionByDefaultCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler({
        configuration: { enableDefaultEncryption: false },
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch(`Disabled Amazon EBS default encryption for the environment.`);
      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
      expect(DisableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
    });

    test('should be successful disable default encryption when default encryption is already disabled', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: false,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler({
        configuration: { enableDefaultEncryption: false },
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch(
        `Amazon EBS default encryption already disabled for the environment,  accelerator skipped the process of disabling EBS default encryption key.`,
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
      expect(DisableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when invalid configuration provided', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: false,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(
        new ManageEbsDefaultEncryptionModule().handler({
          configuration: { enableDefaultEncryption: true },
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: when default encryption is enabled kms key id can not be undefined or missing.`,
        ),
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when GetEbsEncryptionByDefault API did not return EbsEncryptionByDefault object', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: undefined,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(
        new ManageEbsDefaultEncryptionModule().handler({
          configuration: { enableDefaultEncryption: true },
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetEbsEncryptionByDefault API did not return EbsEncryptionByDefault object.`,
        ),
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when GetEbsDefaultKmsKeyId API did not return KmsKeyId', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: undefined,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(
        new ManageEbsDefaultEncryptionModule().handler({
          configuration: { enableDefaultEncryption: true },
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrowError(
        new RegExp(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetEbsDefaultKmsKeyId API did not return KmsKeyId.`),
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when ModifyEbsDefaultKmsKeyId API did not return KmsKeyId', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        if (command instanceof EnableEbsEncryptionByDefaultCommand) {
          return Promise.resolve({});
        }
        if (command instanceof ModifyEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({ KmsKeyId: undefined });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new ManageEbsDefaultEncryptionModule().handler(input)).rejects.toThrowError(
        new RegExp(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ModifyEbsDefaultKmsKeyId API did not return KmsKeyId.`),
      );
      expect(mockSend).toHaveBeenCalledTimes(4);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(2);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dry Run Mode Operations', () => {
    const input: IManageEbsDefaultEncryptionHandlerParameter = {
      configuration: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.configuration,
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should throw error when invalid configuration provided', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler({
        configuration: { enableDefaultEncryption: true },
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason default encryption is set to enable, but kms key id is undefined or missing.`,
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful disable default encryption when default encryption is enabled', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler({
        configuration: { enableDefaultEncryption: false },
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        `Amazon EBS default encryption enabled for the environment, accelerator will disable default encryption.`,
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful disable default encryption when default encryption is already disabled', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: false,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler({
        configuration: { enableDefaultEncryption: false },
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        `Amazon EBS default encryption already disabled for the environment, accelerator will skip the process of disabling EBS default encryption key.`,
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful in configuring default encryption key', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: false,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Amazon EBS default encryption not enabled for the environment, accelerator will enable default encryption and set the default encryption kms key to "${input.configuration.kmsKeyId}".`,
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful modify default encryption key', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Existing Amazon EBS default encryption key id is ${MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.existingEncryptionKeyId}, accelerator will set default encryption key to "${input.configuration.kmsKeyId}".`,
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful when existing encryption key is same as default encryption key', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof GetEbsEncryptionByDefaultCommand) {
          return Promise.resolve({
            EbsEncryptionByDefault: true,
          });
        }
        if (command instanceof GetEbsDefaultKmsKeyIdCommand) {
          return Promise.resolve({
            KmsKeyId: input.configuration.kmsKeyId,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new ManageEbsDefaultEncryptionModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Existing Amazon EBS default encryption key id is "${input.configuration.kmsKeyId}", accelerator will skip the process of enabling EBS default encryption key.`,
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(GetEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(1);
      expect(GetEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(1);
      expect(EnableEbsEncryptionByDefaultCommand).toHaveBeenCalledTimes(0);
      expect(ModifyEbsDefaultKmsKeyIdCommand).toHaveBeenCalledTimes(0);
    });
  });
});
