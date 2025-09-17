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
  DisableAWSServiceAccessCommand,
  EnableAWSServiceAccessCommand,
  InvalidInputException,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import {
  DisableOrganizationsRootCredentialsManagementCommand,
  DisableOrganizationsRootSessionsCommand,
  EnableOrganizationsRootCredentialsManagementCommand,
  EnableOrganizationsRootSessionsCommand,
  IAMClient,
  ServiceNotSupportedException,
  ListOrganizationsFeaturesCommand,
  ServiceAccessNotEnabledException,
  NoSuchEntityException,
} from '@aws-sdk/client-iam';
import { IRootUserManagementHandlerParameter } from '../../../../interfaces/aws-iam/root-user-management';
import { RootUserManagementModule } from '../../../../lib/aws-iam/root-user-management';

import { MOCK_CONSTANTS } from '../../../mocked-resources';

vi.mock('@aws-sdk/client-organizations', () => ({
  OrganizationsClient: vi.fn(),
  EnableAWSServiceAccessCommand: vi.fn(),
  DisableAWSServiceAccessCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-iam', () => ({
  IAMClient: vi.fn(),
  EnableOrganizationsRootCredentialsManagementCommand: vi.fn(),
  DisableOrganizationsRootCredentialsManagementCommand: vi.fn(),
  EnableOrganizationsRootSessionsCommand: vi.fn(),
  DisableOrganizationsRootSessionsCommand: vi.fn(),
  ListOrganizationsFeaturesCommand: vi.fn(),
  ServiceAccessNotEnabledException: class extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'ServiceAccessNotEnabledException';
    }
  },
}));

describe('CentralRootUserManagementModule', () => {
  const mockSend = vi.fn();
  const rootUserManagement: RootUserManagementModule = new RootUserManagementModule();

  beforeEach(() => {
    vi.clearAllMocks();
    (OrganizationsClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    (IAMClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('handler', () => {
    const mockPropsAllEnabled: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: true,
        credentials: true,
        session: true,
      },
      ...MOCK_CONSTANTS.runnerParameters,
    };

    const mockPropsCredentialsOnly: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: true,
        credentials: true,
        session: false,
      },
      ...MOCK_CONSTANTS.runnerParameters,
    };

    const mockPropsAllDisabled: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: false,
        credentials: false,
        session: false,
      },
      ...MOCK_CONSTANTS.runnerParameters,
    };

    const mockPropsCapabilitiesDisabled: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: true,
        credentials: false,
        session: false,
      },
      ...MOCK_CONSTANTS.runnerParameters,
    };

    it('returns success when enabling all features from a disabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.reject(
            new ServiceAccessNotEnabledException({ message: 'Service access not enabled', $metadata: {} }),
          );
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllEnabled);
      expect(result).toBe('success');
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(1);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(1);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(1);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
    });

    it('returns success when enabling credentials management only', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: [],
          });
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsCredentialsOnly);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(1);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toBe('success');
    });

    it('returns success when enabling sessions management only', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({ EnabledFeatures: ['RootCredentialsManagement'] });
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllEnabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(1);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toBe('success');
    });

    it('returns success when disabling all features from a enabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
          });
        }
        if (command instanceof DisableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllDisabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(1);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(1);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(1);
      expect(result).toBe('success');
    });

    it('returns success when disabling all capabilities from a enabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
          });
        }
        if (command instanceof DisableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsCapabilitiesDisabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(1);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(1);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toBe('success');
    });
  });
});

describe('CentralRootUserManagementModule DryRun', () => {
  const mockSend = vi.fn();
  const rootUserManagement: RootUserManagementModule = new RootUserManagementModule();

  beforeEach(() => {
    vi.clearAllMocks();
    (OrganizationsClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    (IAMClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('handler', () => {
    const mockPropsAllEnabled: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: true,
        credentials: true,
        session: true,
      },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    const mockPropsCredentialsOnly: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: true,
        credentials: true,
        session: false,
      },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    const mockPropsAllDisabled: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: false,
        credentials: false,
        session: false,
      },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    const mockPropsCapabilitiesDisabled: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: true,
        credentials: false,
        session: false,
      },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    const mockPropsSessionDisabled: IRootUserManagementHandlerParameter = {
      configuration: {
        enabled: true,
        credentials: true,
        session: false,
      },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    it('returns success when enabling all features from a disabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.reject(
            new ServiceAccessNotEnabledException({ message: 'Service access not enabled', $metadata: {} }),
          );
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllEnabled);
      expect(result).toMatch(
        'Status: Will enable AWS Service Access for IAM. Will enable IAM Root User Credentials Management. Will enable IAM Root User Session Management.',
      );

      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
    });

    it('returns success when enabling credentials and session', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({});
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllEnabled);
      expect(result).toMatch(
        'Status: Will enable IAM Root User Credentials Management. Will enable IAM Root User Session Management.',
      );

      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
    });

    it('returns success when enabling service and credentials from a disabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.reject(
            new ServiceAccessNotEnabledException({ message: 'Service access not enabled', $metadata: {} }),
          );
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsCredentialsOnly);
      expect(result).toMatch(
        'Status: Will enable AWS Service Access for IAM. Will enable IAM Root User Credentials Management.',
      );

      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
    });

    it('returns success when enabling credentials management only', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: [],
          });
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsCredentialsOnly);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatch('Status: Will enable IAM Root User Credentials Management.');
    });

    it('returns success when enabling sessions management only', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({ EnabledFeatures: ['RootCredentialsManagement'] });
        }
        if (command instanceof EnableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof EnableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllEnabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatch('Status: Will enable IAM Root User Session Management.');
    });

    it('returns success when disabling all features from a enabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
          });
        }
        if (command instanceof DisableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllDisabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatch(
        'Status: Will disable IAM Root User Session Management. Will disable IAM Root User Credentials Management. Will disable AWS Service Access for IAM.',
      );
    });

    it('returns success when disabling all capabilities from a enabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
          });
        }
        if (command instanceof DisableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsCapabilitiesDisabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatch(
        'Status: Will disable IAM Root User Session Management. Will disable IAM Root User Credentials Management.',
      );
    });

    it('returns success when disabling session from a enabled state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
          });
        }
        if (command instanceof DisableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsSessionDisabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatch('Status: Will disable IAM Root User Session Management.');
    });

    it('returns success configuration and status match', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationsFeaturesCommand) {
          return Promise.resolve({
            EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
          });
        }
        if (command instanceof DisableAWSServiceAccessCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DisableOrganizationsRootSessionsCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const result = await rootUserManagement.handler(mockPropsAllEnabled);
      expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
      expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
      expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatch('Status: No updates requred.  Current state and configuration match.');
    });
  });
});

describe('CentralRootUserManagementModule Failures', () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (OrganizationsClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    (IAMClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  const mockPropsAllEnabled: IRootUserManagementHandlerParameter = {
    configuration: {
      enabled: true,
      credentials: true,
      session: true,
    },
    ...MOCK_CONSTANTS.runnerParameters,
  };

  const mockPropsAllDisabled: IRootUserManagementHandlerParameter = {
    configuration: {
      enabled: false,
      credentials: false,
      session: false,
    },
    ...MOCK_CONSTANTS.runnerParameters,
  };

  it('returns failure when enabling service', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationsFeaturesCommand) {
        return Promise.reject(
          new ServiceAccessNotEnabledException({ message: 'Service access not enabled', $metadata: {} }),
        );
      }
      if (command instanceof EnableAWSServiceAccessCommand) {
        return Promise.reject(new InvalidInputException({ message: 'Service access not enabled', $metadata: {} }));
      }
      if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
        return Promise.resolve();
      }
      if (command instanceof EnableOrganizationsRootSessionsCommand) {
        return Promise.resolve();
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const result = new RootUserManagementModule().handler(mockPropsAllEnabled);
    expect(ListOrganizationsFeaturesCommand).toHaveBeenCalledTimes(1);
    expect(EnableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
    expect(EnableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
    expect(EnableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
    expect(DisableOrganizationsRootSessionsCommand).toHaveBeenCalledTimes(0);
    expect(DisableOrganizationsRootCredentialsManagementCommand).toHaveBeenCalledTimes(0);
    expect(DisableAWSServiceAccessCommand).toHaveBeenCalledTimes(0);
    await expect(result).rejects.toThrowError();
  });

  it('returns failure when enabling credentials', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationsFeaturesCommand) {
        return Promise.resolve({
          EnabledFeatures: [],
        });
      }
      if (command instanceof EnableAWSServiceAccessCommand) {
        return Promise.resolve();
      }
      if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
        return Promise.reject(new ServiceNotSupportedException({ message: 'Test failure', $metadata: {} }));
      }
      if (command instanceof EnableOrganizationsRootSessionsCommand) {
        return Promise.resolve();
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const result = new RootUserManagementModule().handler(mockPropsAllEnabled);
    await expect(result).rejects.toThrowError();
  });

  it('returns failure when enabling session', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationsFeaturesCommand) {
        return Promise.resolve({
          EnabledFeatures: ['RootCredentialsManagement'],
        });
      }
      if (command instanceof EnableAWSServiceAccessCommand) {
        return Promise.resolve();
      }
      if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
        return Promise.resolve();
      }
      if (command instanceof EnableOrganizationsRootSessionsCommand) {
        return Promise.reject(new ServiceNotSupportedException({ message: 'Test failure', $metadata: {} }));
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const result = new RootUserManagementModule().handler(mockPropsAllEnabled);
    expect(result).rejects.toThrowError();
  });

  it('returns failure when checking status', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationsFeaturesCommand) {
        return Promise.reject(new NoSuchEntityException({ message: 'Test Error', $metadata: {} }));
      }
      if (command instanceof EnableAWSServiceAccessCommand) {
        return Promise.resolve();
      }
      if (command instanceof EnableOrganizationsRootCredentialsManagementCommand) {
        return Promise.resolve();
      }
      if (command instanceof EnableOrganizationsRootSessionsCommand) {
        return Promise.resolve();
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const result = new RootUserManagementModule().handler(mockPropsAllEnabled);
    await expect(result).rejects.toThrowError();
  });

  it('returns failure when disabling session', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationsFeaturesCommand) {
        return Promise.resolve({
          EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
        });
      }
      if (command instanceof DisableAWSServiceAccessCommand) {
        return Promise.resolve();
      }
      if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
        return Promise.resolve();
      }
      if (command instanceof DisableOrganizationsRootSessionsCommand) {
        return Promise.reject(new ServiceNotSupportedException({ message: 'Test failure', $metadata: {} }));
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const result = new RootUserManagementModule().handler(mockPropsAllDisabled);
    expect(result).rejects.toThrowError();
  });

  it('returns failure when disabling credentials', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationsFeaturesCommand) {
        return Promise.resolve({
          EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
        });
      }
      if (command instanceof DisableAWSServiceAccessCommand) {
        return Promise.resolve();
      }
      if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
        return Promise.reject(new ServiceNotSupportedException({ message: 'Test failure', $metadata: {} }));
      }
      if (command instanceof DisableOrganizationsRootSessionsCommand) {
        return Promise.resolve();
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const result = new RootUserManagementModule().handler(mockPropsAllDisabled);
    expect(result).rejects.toThrowError();
  });

  it('returns failure when disabling service access', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationsFeaturesCommand) {
        return Promise.resolve({
          EnabledFeatures: ['RootSessions', 'RootCredentialsManagement'],
        });
      }
      if (command instanceof DisableAWSServiceAccessCommand) {
        return Promise.reject(new ServiceNotSupportedException({ message: 'Test failure', $metadata: {} }));
      }
      if (command instanceof DisableOrganizationsRootCredentialsManagementCommand) {
        return Promise.resolve();
      }
      if (command instanceof DisableOrganizationsRootSessionsCommand) {
        return Promise.resolve();
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const result = new RootUserManagementModule().handler(mockPropsAllDisabled);
    expect(result).rejects.toThrowError();
  });
});
