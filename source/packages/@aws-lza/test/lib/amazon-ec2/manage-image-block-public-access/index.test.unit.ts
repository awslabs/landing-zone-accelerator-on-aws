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

import {
  EnableImageBlockPublicAccessCommand,
  DisableImageBlockPublicAccessCommand,
  GetImageBlockPublicAccessStateCommand,
} from '@aws-sdk/client-ec2';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-ec2', () => {
  return {
    EC2Client: class {
      send = mockSend;
    },
    EnableImageBlockPublicAccessCommand: vi.fn(),
    DisableImageBlockPublicAccessCommand: vi.fn(),
    GetImageBlockPublicAccessStateCommand: vi.fn(),
  };
});

import { IManageImageBlockPublicAccessHandlerParameter } from '../../../../interfaces/amazon-ec2/manage-image-block-public-access';
import { ManageImageBlockPublicAccessModule } from '../../../../lib/amazon-ec2/manage-image-block-public-access';
import { MOCK_CONSTANTS } from '../../../mocked-resources';

describe('ManageImageBlockPublicAccessModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  const baseInput: IManageImageBlockPublicAccessHandlerParameter = {
    configuration: { enable: true },
    ...MOCK_CONSTANTS.runnerParameters,
  };

  describe('Enable operations', () => {
    it('should enable Image Block Public Access when currently disabled', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetImageBlockPublicAccessStateCommand) {
          return Promise.resolve({ ImageBlockPublicAccessState: 'unblocked' });
        }
        if (command instanceof EnableImageBlockPublicAccessCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const response = await new ManageImageBlockPublicAccessModule().handler(baseInput);
      expect(response).toMatch('Enabled Image Block Public Access.');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should skip when already enabled', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetImageBlockPublicAccessStateCommand) {
          return Promise.resolve({ ImageBlockPublicAccessState: 'block-new-sharing' });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const response = await new ManageImageBlockPublicAccessModule().handler(baseInput);
      expect(response).toMatch('already enabled');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disable operations', () => {
    const disableInput: IManageImageBlockPublicAccessHandlerParameter = {
      ...baseInput,
      configuration: { enable: false },
    };

    it('should disable Image Block Public Access when currently enabled', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetImageBlockPublicAccessStateCommand) {
          return Promise.resolve({ ImageBlockPublicAccessState: 'block-new-sharing' });
        }
        if (command instanceof DisableImageBlockPublicAccessCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const response = await new ManageImageBlockPublicAccessModule().handler(disableInput);
      expect(response).toMatch('Disabled Image Block Public Access.');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should skip when already disabled', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetImageBlockPublicAccessStateCommand) {
          return Promise.resolve({ ImageBlockPublicAccessState: 'unblocked' });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const response = await new ManageImageBlockPublicAccessModule().handler(disableInput);
      expect(response).toMatch('already disabled');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dry run operations', () => {
    const dryRunInput: IManageImageBlockPublicAccessHandlerParameter = {
      ...baseInput,
      dryRun: true,
    };

    it('should return dry run response when enabled and currently disabled', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetImageBlockPublicAccessStateCommand) {
          return Promise.resolve({ ImageBlockPublicAccessState: 'unblocked' });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const response = await new ManageImageBlockPublicAccessModule().handler(dryRunInput);
      expect(response).toContain('Will enable');
    });

    it('should return dry run response when already enabled', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetImageBlockPublicAccessStateCommand) {
          return Promise.resolve({ ImageBlockPublicAccessState: 'block-new-sharing' });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const response = await new ManageImageBlockPublicAccessModule().handler(dryRunInput);
      expect(response).toContain('already enabled');
    });
  });

  describe('Error handling', () => {
    it('should default to disabled state when GetImageBlockPublicAccessState fails', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetImageBlockPublicAccessStateCommand) {
          return Promise.reject(new Error('Access denied'));
        }
        if (command instanceof EnableImageBlockPublicAccessCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const response = await new ManageImageBlockPublicAccessModule().handler(baseInput);
      expect(response).toMatch('Enabled Image Block Public Access.');
    });
  });
});
