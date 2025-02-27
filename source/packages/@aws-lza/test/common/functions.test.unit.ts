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
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import {
  ControlTowerClient,
  GetLandingZoneCommand,
  ListLandingZonesCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-controltower';
import {
  Account,
  DescribeOrganizationCommand,
  InvalidInputException,
  ListRootsCommand,
  OrganizationalUnit,
  OrganizationsClient,
  paginateListAccounts,
  paginateListOrganizationalUnitsForParent,
} from '@aws-sdk/client-organizations';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

import {
  delay,
  generateDryRunResponse,
  getAccountDetailsFromOrganizations,
  getAccountId,
  getCredentials,
  getCurrentAccountId,
  getLandingZoneDetails,
  getLandingZoneIdentifier,
  getModuleDefaultParameters,
  getOrganizationAccounts,
  getOrganizationalUnitArn,
  getOrganizationalUnitIdByPath,
  getOrganizationalUnitsForParent,
  getOrganizationId,
  getOrganizationRootId,
  getParentOuId,
  setRetryStrategy,
} from '../../common/functions';
import { MOCK_CONSTANTS } from '../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../common/enums';
import { AcceleratorModuleName, IModuleCommonParameter } from '../../common/resources';

jest.mock('@aws-sdk/util-retry');
jest.mock('@aws-sdk/client-controltower', () => {
  return {
    ControlTowerClient: jest.fn(),
    GetLandingZoneCommand: jest.fn(),
    ResourceNotFoundException: jest.fn(),
    ListLandingZonesCommand: jest.fn(),
  };
});
jest.mock('@aws-sdk/client-organizations', () => ({
  DescribeOrganizationCommand: jest.fn(),
  OrganizationsClient: jest.fn(),
  paginateListOrganizationalUnitsForParent: jest.fn(),
  paginateListAccounts: jest.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  InvalidInputException: jest.fn().mockImplementation(function (this: any, params) {
    const error = new Error(params.message);
    error.name = 'InvalidInputException';
    Object.setPrototypeOf(error, InvalidInputException.prototype);
    return error;
  }),
  ListRootsCommand: jest.fn(),
}));
jest.mock('@aws-sdk/client-sts', () => {
  return {
    STSClient: jest.fn(),
    GetCallerIdentityCommand: jest.fn(),
    AssumeRoleCommand: jest.fn(),
  };
});

jest.mock('../../common/throttle', () => ({
  throttlingBackOff: jest.fn(fn => fn()),
}));

describe('functions', () => {
  const mockSend = jest.fn();
  describe('setRetryStrategy', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test('should create a ConfiguredRetryStrategy with default attempts when env variable is not set', () => {
      const result = setRetryStrategy();

      expect(ConfiguredRetryStrategy).toHaveBeenCalledWith(800, expect.any(Function));
      expect(result).toBeInstanceOf(ConfiguredRetryStrategy);
    });

    test('should create a ConfiguredRetryStrategy with custom attempts when env variable is set', () => {
      process.env['ACCELERATOR_SDK_MAX_ATTEMPTS'] = '5';

      const result = setRetryStrategy();

      expect(ConfiguredRetryStrategy).toHaveBeenCalledWith(5, expect.any(Function));
      expect(result).toBeInstanceOf(ConfiguredRetryStrategy);
    });

    test('should pass a correct retry delay function', () => {
      setRetryStrategy();

      const mockConstructor = ConfiguredRetryStrategy as jest.MockedClass<typeof ConfiguredRetryStrategy>;
      const constructorArgs = mockConstructor.mock.calls[0];
      const delayArgument = constructorArgs[1];

      if (typeof delayArgument === 'function') {
        expect(delayArgument(0)).toBe(100);
        expect(delayArgument(1)).toBe(1100);
        expect(delayArgument(2)).toBe(2100);
      } else {
        fail('Expected second argument to be a function, but it was not');
      }
    });
  });

  describe('delay function', () => {
    const originalSetTimeout = global.setTimeout;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(global, 'setTimeout');
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
      global.setTimeout = originalSetTimeout;
    });

    test('should resolve after the specified number of minutes', async () => {
      // Setup
      const minutes = 2;

      // Execute
      const delayPromise = delay(minutes);

      // Verify
      jest.advanceTimersByTime(minutes * 60000);
      await expect(delayPromise).resolves.toBeUndefined();
    });

    test('should not resolve before the specified time', async () => {
      // Setup
      const minutes = 3;

      // Execute
      const delayPromise = delay(minutes);

      // Verify
      jest.advanceTimersByTime(minutes * 60000 - 1);
      const immediatePromise = Promise.resolve();
      await expect(Promise.race([delayPromise, immediatePromise])).resolves.toBeUndefined();
    });

    test('should use setTimeout with correct delay in milliseconds', () => {
      // Setup
      const minutes = 5;

      // Execute
      delay(minutes);

      // Verify
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), minutes * 60000);
    });
  });

  describe('getLandingZoneDetails', () => {
    const mockLandingZoneIdentifier = 'mockLandingZoneIdentifier';
    const mockRegion = 'mockRegion';

    beforeEach(() => {
      jest.clearAllMocks();

      (ControlTowerClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return undefined when landingZoneIdentifier is not provided', async () => {
      // Execute
      const result = await getLandingZoneDetails(new ControlTowerClient({}), mockRegion, undefined);

      // Verify
      expect(result).toBeUndefined();
    });

    test('should return landing zone details when valid response is received', async () => {
      // Setup
      const mockResponse = {
        landingZone: {
          arn: 'mockArn',
          status: 'mockStatus',
          version: 'mockVersion',
          latestAvailableVersion: 'mockLatestAvailableVersion',
          driftStatus: { status: 'mockDriftStatus' },
          manifest: {
            governedRegions: ['mockRegion1', 'mockRegion1'],
            accessManagement: { enabled: true },
            organizationStructure: {
              security: { name: 'mockSecurityOuName' },
              sandbox: { name: 'mockSandboxOuName' },
            },
            centralizedLogging: {
              configurations: {
                loggingBucket: { retentionDays: 365 },
                accessLoggingBucket: { retentionDays: 365 },
                kmsKeyArn: 'mockKmsKeyArn',
              },
            },
          },
        },
      };

      mockSend.mockImplementation(command => {
        if (command instanceof GetLandingZoneCommand) {
          return Promise.resolve(mockResponse);
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const result = await getLandingZoneDetails(new ControlTowerClient({}), mockRegion, mockLandingZoneIdentifier);

      // Verify
      expect(result).toEqual({
        landingZoneIdentifier: mockResponse.landingZone.arn,
        governedRegions: mockResponse.landingZone.manifest.governedRegions,
        enableIdentityCenterAccess: mockResponse.landingZone.manifest.accessManagement.enabled,
        securityOuName: mockResponse.landingZone.manifest.organizationStructure.security.name,
        sandboxOuName: mockResponse.landingZone.manifest.organizationStructure.sandbox.name,
        loggingBucketRetentionDays:
          mockResponse.landingZone.manifest.centralizedLogging.configurations.loggingBucket.retentionDays,
        accessLoggingBucketRetentionDays:
          mockResponse.landingZone.manifest.centralizedLogging.configurations.accessLoggingBucket.retentionDays,
        kmsKeyArn: mockResponse.landingZone.manifest.centralizedLogging.configurations.kmsKeyArn,
        status: mockResponse.landingZone.status,
        version: mockResponse.landingZone.version,
        latestAvailableVersion: mockResponse.landingZone.latestAvailableVersion,
        driftStatus: mockResponse.landingZone.driftStatus.status,
      });
      expect(GetLandingZoneCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw an error when ResourceNotFoundException is received', async () => {
      // Setup
      const errorMessage = `Existing AWS Control Tower Landing Zone home region differs from the executing environment region ${mockRegion}. Existing Landing Zone identifier is ${mockLandingZoneIdentifier}`;
      mockSend.mockImplementation(command => {
        if (command instanceof GetLandingZoneCommand) {
          return Promise.reject(new ResourceNotFoundException({ message: errorMessage, $metadata: {} }));
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await getLandingZoneDetails(new ControlTowerClient({}), mockRegion, mockLandingZoneIdentifier);
      }).rejects.toThrowError(errorMessage);

      expect(GetLandingZoneCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw the original error for other types of errors', async () => {
      // Setup
      const errorMessage = `some other error`;
      mockSend.mockImplementation(command => {
        if (command instanceof GetLandingZoneCommand) {
          return Promise.reject(new Error(errorMessage));
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await getLandingZoneDetails(new ControlTowerClient({}), mockRegion, mockLandingZoneIdentifier);
      }).rejects.toThrowError(errorMessage);
    });
  });

  describe('getOrganizationalUnitsForParent', () => {
    const parentId = 'mockParentId';

    beforeEach(() => {
      jest.clearAllMocks();

      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return an empty array when no organizational units are found', async () => {
      // Setup
      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            OrganizationalUnits: [],
          };
        },
      }));

      // Execute
      const result = await getOrganizationalUnitsForParent(new OrganizationsClient({}), parentId);

      // Verify
      expect(result).toEqual([]);
    });

    test('should return all organizational units from a single page', async () => {
      // Setup
      const mockOUs: OrganizationalUnit[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2' },
      ];
      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            OrganizationalUnits: mockOUs,
          };
        },
      }));

      // Execute
      const result = await getOrganizationalUnitsForParent(new OrganizationsClient({}), parentId);

      // Verify
      expect(result).toEqual(mockOUs);
    });

    test('should return all organizational units from multiple pages', async () => {
      // Setup
      const mockOUs1: OrganizationalUnit[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2' },
      ];
      const mockOUs2: OrganizationalUnit[] = [{ Id: 'mockId3', Name: 'mockName3', Arn: 'mockArn3' }];

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield { OrganizationalUnits: mockOUs1 };
          yield { OrganizationalUnits: mockOUs2 };
        },
      }));

      // Execute
      const result = await getOrganizationalUnitsForParent(new OrganizationsClient({}), parentId);

      // Verify
      expect(result).toEqual([...mockOUs1, ...mockOUs2]);
    });

    test('should handle InvalidInputException and throw appropriate error', async () => {
      // Setup
      const invalidParentId = 'invalidParentId';
      const errorMessage = 'Invalid input';

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => {
        throw new InvalidInputException({ message: errorMessage, $metadata: {} });
      });

      // Execute & Verify
      await expect(async () => {
        await getOrganizationalUnitsForParent(new OrganizationsClient({}), invalidParentId);
      }).rejects.toThrowError(`InvalidInputException: Invalid parent id: ${invalidParentId}`);
      expect(paginateListOrganizationalUnitsForParent).toHaveBeenCalledTimes(1);
    });

    test('should propagate unknown errors', async () => {
      // Setup
      const parentId = 'mockParentId';
      const errorMessage = 'Unknown error';

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => {
        const error = new Error(errorMessage);
        error.name = 'UnknownError';
        throw error;
      });

      // Execute & Verify
      await expect(async () => {
        await getOrganizationalUnitsForParent(new OrganizationsClient({}), parentId);
      }).rejects.toThrowError(errorMessage);
    });

    test('should handle undefined OrganizationalUnits in the response', async () => {
      // Setup
      const mockOUs: OrganizationalUnit[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2' },
      ];

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield { OrganizationalUnits: undefined };
          yield { OrganizationalUnits: mockOUs };
        },
      }));

      // Execute
      const result = await getOrganizationalUnitsForParent(new OrganizationsClient({}), parentId);

      // Verify
      expect(result).toEqual(mockOUs);
    });
  });

  describe('getLandingZoneIdentifier', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      (ControlTowerClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return undefined when no landing zones are found', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListLandingZonesCommand) {
          return Promise.resolve({ landingZones: [] });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const result = await getLandingZoneIdentifier(new ControlTowerClient({}));

      // Verify
      expect(result).toBeUndefined();
      expect(ListLandingZonesCommand).toHaveBeenCalledTimes(1);
    });

    test('should return the ARN when exactly one landing zone is found', async () => {
      // Setup
      const arn = 'mockArn';
      mockSend.mockImplementation(command => {
        if (command instanceof ListLandingZonesCommand) {
          return Promise.resolve({ landingZones: [{ arn }] });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const result = await getLandingZoneIdentifier(new ControlTowerClient({}));

      // Verify
      expect(result).toEqual(arn);
      expect(ListLandingZonesCommand).toHaveBeenCalledTimes(1);
    });

    test('should return undefined when one landing zone is found but has no ARN', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListLandingZonesCommand) {
          return Promise.resolve({ landingZones: [{}] });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const result = await getLandingZoneIdentifier(new ControlTowerClient({}));

      // Verify
      expect(result).toBeUndefined();
      expect(ListLandingZonesCommand).toHaveBeenCalledTimes(1);
    });

    test('should handle exception when multiple landingZones in the response', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListLandingZonesCommand) {
          return Promise.resolve({ landingZones: [{ arn: 'mockArn1' }, { arn: 'mockArn2' }] });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute && Verify
      expect(async () => {
        await getLandingZoneIdentifier(new ControlTowerClient({}));
      }).rejects.toThrowError(`Internal error: ListLandingZonesCommand returned multiple landing zones`);
      expect(ListLandingZonesCommand).toHaveBeenCalledTimes(1);
    });

    test('should handle exception when ListLandingZonesCommand did not return landingZones object', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListLandingZonesCommand) {
          return Promise.resolve({ landingZones: undefined });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute && Verify
      expect(async () => {
        await getLandingZoneIdentifier(new ControlTowerClient({}));
      }).rejects.toThrowError(`Internal error: ListLandingZonesCommand did not return landingZones object`);
      expect(ListLandingZonesCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCredentials', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      (STSClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    const MOCK_CONSTANTS = {
      mandatoryOptions: {
        accountId: 'mockAccountId',
        region: 'mockRegion',
        solutionId: 'mockSolutionId',
      },
      partition: 'mockPartition',
      assumeRoleName: 'mockAssumeRoleName',
      sessionName: 'mockSessionName',
      assumeRoleArn: 'mockAssumeRoleArn',
      credentials: {
        AccessKeyId: 'mockAccessKeyId',
        SecretAccessKey: 'mockSecretAccessKey',
        SessionToken: 'mockSessionToken',
        expiration: undefined,
      },
    };

    test('throws error when both assumeRoleName and assumeRoleArn are provided', async () => {
      // Execute && Verify
      await expect(
        getCredentials({
          ...MOCK_CONSTANTS.mandatoryOptions,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
        }),
      ).rejects.toThrow('Either assumeRoleName or assumeRoleArn can be provided not both');
    });

    test('throws error when neither assumeRoleName nor assumeRoleArn are provided', async () => {
      // Execute && Verify
      await expect(getCredentials({ ...MOCK_CONSTANTS.mandatoryOptions })).rejects.toThrow(
        'Either assumeRoleName or assumeRoleArn must provided',
      );
    });

    test('throws error when assumeRoleName is provided but partition is not', async () => {
      // Execute && Verify
      await expect(
        getCredentials({ ...MOCK_CONSTANTS.mandatoryOptions, assumeRoleName: MOCK_CONSTANTS.assumeRoleName }),
      ).rejects.toThrow('When assumeRoleName provided partition must be provided');
    });

    test('returns undefined when already in target environment', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Arn: MOCK_CONSTANTS.assumeRoleArn });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const result = await getCredentials({
        ...MOCK_CONSTANTS.mandatoryOptions,
        partition: MOCK_CONSTANTS.partition,
        assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
      });

      // Verify
      expect(result).toBeUndefined();
    });

    test('returns credentials when assume role is successful', async () => {
      const roleArn = 'mockRoleArn';

      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Arn: roleArn });
        }
        if (command instanceof AssumeRoleCommand) {
          return Promise.resolve({ Credentials: MOCK_CONSTANTS.credentials });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const result = await getCredentials({
        ...MOCK_CONSTANTS.mandatoryOptions,
        partition: MOCK_CONSTANTS.partition,
        assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
        sessionName: MOCK_CONSTANTS.sessionName,
      });

      // Verify
      expect(result).toBeDefined();
      expect(result).toEqual({
        accessKeyId: MOCK_CONSTANTS.credentials.AccessKeyId,
        secretAccessKey: MOCK_CONSTANTS.credentials.SecretAccessKey,
        sessionToken: MOCK_CONSTANTS.credentials.SessionToken,
        expiration: MOCK_CONSTANTS.credentials.expiration,
      });
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledWith({
        RoleArn: MOCK_CONSTANTS.assumeRoleArn,
        RoleSessionName: MOCK_CONSTANTS.sessionName,
      });
    });

    test('throws error when AssumeRole response is does not have AccessKeyId', async () => {
      const roleArn = 'mockRoleArn';

      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Arn: roleArn });
        }
        if (command instanceof AssumeRoleCommand) {
          return Promise.resolve({ Credentials: { SecretAccessKey: MOCK_CONSTANTS.credentials.SecretAccessKey } });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(
        getCredentials({
          ...MOCK_CONSTANTS.mandatoryOptions,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
        }),
      ).rejects.toThrow('Internal error: AssumeRoleCommand did not return AccessKeyId');
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledWith({
        RoleArn: MOCK_CONSTANTS.assumeRoleArn,
        RoleSessionName: 'AcceleratorAssumeRole',
      });
    });

    test('throws error when AssumeRole response is does not have SecretAccessKey', async () => {
      const roleArn = 'mockRoleArn';

      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Arn: roleArn });
        }
        if (command instanceof AssumeRoleCommand) {
          return Promise.resolve({ Credentials: { AccessKeyId: MOCK_CONSTANTS.credentials.AccessKeyId } });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(
        getCredentials({
          ...MOCK_CONSTANTS.mandatoryOptions,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleArn: MOCK_CONSTANTS.assumeRoleArn,
          sessionName: MOCK_CONSTANTS.sessionName,
        }),
      ).rejects.toThrow('Internal error: AssumeRoleCommand did not return SecretAccessKey');
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledWith({
        RoleArn: MOCK_CONSTANTS.assumeRoleArn,
        RoleSessionName: MOCK_CONSTANTS.sessionName,
      });
    });

    test('throws error when AssumeRole response is does not have SessionToken', async () => {
      const roleArn = 'mockRoleArn';

      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Arn: roleArn });
        }
        if (command instanceof AssumeRoleCommand) {
          return Promise.resolve({
            Credentials: {
              AccessKeyId: MOCK_CONSTANTS.credentials.AccessKeyId,
              SecretAccessKey: MOCK_CONSTANTS.credentials.SecretAccessKey,
            },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(
        getCredentials({
          ...MOCK_CONSTANTS.mandatoryOptions,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
        }),
      ).rejects.toThrow('Internal error: AssumeRoleCommand did not return SessionToken');
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledWith({
        RoleArn: `arn:${MOCK_CONSTANTS.partition}:iam::${MOCK_CONSTANTS.mandatoryOptions.accountId}:role/${MOCK_CONSTANTS.assumeRoleName}`,
        RoleSessionName: 'AcceleratorAssumeRole',
      });
    });

    test('throws error when AssumeRole response is does not have Credentials', async () => {
      const roleArn = 'mockRoleArn';

      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Arn: roleArn });
        }
        if (command instanceof AssumeRoleCommand) {
          return Promise.resolve({ Credentials: undefined });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(
        getCredentials({
          ...MOCK_CONSTANTS.mandatoryOptions,
          partition: MOCK_CONSTANTS.partition,
          assumeRoleName: MOCK_CONSTANTS.assumeRoleName,
        }),
      ).rejects.toThrow(`Internal error: AssumeRoleCommand did not return Credentials`);
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledTimes(1);
      expect(AssumeRoleCommand).toHaveBeenCalledWith({
        RoleArn: `arn:${MOCK_CONSTANTS.partition}:iam::${MOCK_CONSTANTS.mandatoryOptions.accountId}:role/${MOCK_CONSTANTS.assumeRoleName}`,
        RoleSessionName: 'AcceleratorAssumeRole',
      });
    });
  });

  describe('getOrganizationRootId', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return root id when valid response is received', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({
            Roots: [MOCK_CONSTANTS.organizationRoot],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const result = await getOrganizationRootId(new OrganizationsClient({}));

      // Verify
      expect(result).toEqual(MOCK_CONSTANTS.organizationRoot.Id);
      expect(ListRootsCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw error when Roots is not in response', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({ Roots: undefined });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(async () => {
        await getOrganizationRootId(new OrganizationsClient({}));
      }).rejects.toThrow(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListRootsCommand api didn't return Roots object.`);
    });

    test('should throw error when Roots array is empty', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({ Roots: [] });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(async () => {
        await getOrganizationRootId(new OrganizationsClient({}));
      }).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListRootsCommand api returned multiple Roots or no Roots`,
      );
    });

    test('should throw error when root id is not in response', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({
            Roots: [
              {
                Name: MOCK_CONSTANTS.organizationRoot.Name,
                Arn: MOCK_CONSTANTS.organizationRoot.Arn,
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(async () => {
        await getOrganizationRootId(new OrganizationsClient({}));
      }).rejects.toThrow(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListRootsCommand api didn't return root id.`);
    });
  });

  describe('getOrganizationalUnitIdByPath', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return OU id for valid path', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({
            Roots: [{ Id: MOCK_CONSTANTS.organizationRoot.Id }],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      (paginateListOrganizationalUnitsForParent as jest.Mock)
        .mockImplementationOnce(() => ({
          [Symbol.asyncIterator]: async function* () {
            yield {
              OrganizationalUnits: [MOCK_CONSTANTS.existingOrganizationalUnits[0]],
            };
          },
        }))
        .mockImplementationOnce(() => ({
          [Symbol.asyncIterator]: async function* () {
            yield {
              OrganizationalUnits: [MOCK_CONSTANTS.existingOrganizationalUnits[1]],
            };
          },
        }));

      // Execute
      const result = await getOrganizationalUnitIdByPath(
        new OrganizationsClient({}),
        `${MOCK_CONSTANTS.existingOrganizationalUnits[0].Name}/${MOCK_CONSTANTS.existingOrganizationalUnits[1].Name}`,
      );

      // Verify
      expect(result).toEqual(MOCK_CONSTANTS.existingOrganizationalUnits[1].Id);
    });

    test('should return undefined for invalid path', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({
            Roots: [{ Id: MOCK_CONSTANTS.organizationRoot.Id }],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            OrganizationalUnits: [],
          };
        },
      }));

      // Execute
      const result = await getOrganizationalUnitIdByPath(new OrganizationsClient({}), MOCK_CONSTANTS.invalidOuPath);

      // Verify
      expect(result).toBeUndefined();
    });

    test('should return ou id for root', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({
            Roots: [{ Id: MOCK_CONSTANTS.organizationRoot.Id }],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            OrganizationalUnits: [],
          };
        },
      }));

      // Execute
      const result = await getOrganizationalUnitIdByPath(
        new OrganizationsClient({}),
        MOCK_CONSTANTS.organizationRoot.Name,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.organizationRoot.Id);
    });

    test('should return ou id for root ou within organization Root', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({
            Roots: [{ Id: MOCK_CONSTANTS.organizationRoot.Id }],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            OrganizationalUnits: [MOCK_CONSTANTS.organizationRoot],
          };
        },
      }));

      // Execute
      const result = await getOrganizationalUnitIdByPath(
        new OrganizationsClient({}),
        `${MOCK_CONSTANTS.organizationRoot.Name}/${MOCK_CONSTANTS.organizationRoot.Name}`,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.organizationRoot.Id);
    });

    test('should handle empty path', async () => {
      // Execute
      const result = await getOrganizationalUnitIdByPath(new OrganizationsClient({}), '');

      // Verify
      expect(result).toBeUndefined();
    });
  });

  describe('generateDryRunResponse', () => {
    test('should generate dry run response', () => {
      // Execute
      const response = generateDryRunResponse(
        AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE,
        MOCK_CONSTANTS.runnerParameters.operation,
        MOCK_CONSTANTS.dryRunStatus,
      );

      // Verify
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.setupLandingZoneModule(MOCK_CONSTANTS.dryRunStatus),
      );
    });
  });

  describe('getModuleDefaultParameters', () => {
    test('returns default parameters with provided values', () => {
      // Setup
      const moduleName = 'TestModule';
      const props: IModuleCommonParameter = {
        moduleName: AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE,
        operation: MOCK_CONSTANTS.runnerParameters.operation,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        globalRegion: MOCK_CONSTANTS.globalRegion,
        region: MOCK_CONSTANTS.runnerParameters.region,
        useExistingRole: MOCK_CONSTANTS.runnerParameters.useExistingRole,
        dryRun: true,
      };

      // Execute
      const result = getModuleDefaultParameters(moduleName, props);

      // Verify
      expect(result).toEqual({
        moduleName: AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE,
        globalRegion: MOCK_CONSTANTS.globalRegion,
        useExistingRole: MOCK_CONSTANTS.runnerParameters.useExistingRole,
        dryRun: true,
      });
    });

    test('returns default parameters with fallback values when props are undefined', () => {
      // Setup
      const moduleName = 'TestModule';
      const props: IModuleCommonParameter = {
        // moduleName: AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE,
        operation: MOCK_CONSTANTS.runnerParameters.operation,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        region: MOCK_CONSTANTS.runnerParameters.region,
      };

      // Execute
      const result = getModuleDefaultParameters(moduleName, props);

      // Verify
      expect(result).toEqual({
        moduleName: moduleName,
        globalRegion: MOCK_CONSTANTS.runnerParameters.region,
        useExistingRole: false,
        dryRun: false,
      });
    });
  });

  describe('getParentOuId', () => {
    test('returns root id', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ListRootsCommand) {
          return Promise.resolve({
            Roots: [MOCK_CONSTANTS.organizationRoot],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const result = await getParentOuId(new OrganizationsClient({}), MOCK_CONSTANTS.organizationRoot.Name);

      // // Verify
      expect(result).toEqual(MOCK_CONSTANTS.organizationRoot.Id);
    });

    test('returns non root id', async () => {
      // Setup

      (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            OrganizationalUnits: [MOCK_CONSTANTS.existingOrganizationalUnits[0]],
          };
        },
      }));

      // Execute
      const result = await getParentOuId(
        new OrganizationsClient({}),
        MOCK_CONSTANTS.existingOrganizationalUnits[0].Name,
      );

      // Verify
      expect(result).toEqual(MOCK_CONSTANTS.existingOrganizationalUnits[0].Id);
    });
  });

  describe('getOrganizationAccounts', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test('returns organizations accounts', async () => {
      // Setup
      const mockAccounts: Account[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1', Email: 'mockEmail1@example.com' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2', Email: 'mockEmail2@example.com' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      // Execute
      const result = await getOrganizationAccounts(new OrganizationsClient({}));

      // Verify
      expect(result).toEqual(mockAccounts);
    });

    test('returns organizations accounts when Accounts object undefined', async () => {
      // Setup
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: undefined,
          };
        },
      }));

      // Execute
      const result = await getOrganizationAccounts(new OrganizationsClient({}));

      // Verify
      expect(result).toEqual([]);
    });
  });

  describe('getAccountDetailsFromOrganizations', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test('returns undefined when account with email not found accounts', async () => {
      const mockAccounts: Account[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1', Email: 'mockEmail1@example.com' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2', Email: 'mockEmail2@example.com' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));
      const email = 'mock-email@example.com';
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      // Execute
      const result = await getAccountDetailsFromOrganizations(new OrganizationsClient({}), email);

      // Verify
      expect(result).toBeUndefined();
    });

    test('returns undefined when Account object does not have email property', async () => {
      const mockAccounts: Account[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));
      const email = 'mock-email@example.com';
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      // Execute
      const result = await getAccountDetailsFromOrganizations(new OrganizationsClient({}), email);

      // Verify
      expect(result).toBeUndefined();
    });

    test('returns account when account with email of different case found', async () => {
      const mockAccounts: Account[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1', Email: 'mockEmail1@example.com' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2', Email: 'mockEmail2@example.com' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      // Execute
      const result = await getAccountDetailsFromOrganizations(new OrganizationsClient({}), 'MOCKEMAIL1@example.COM');

      // Verify
      expect(result).toBe(mockAccounts[0]);
    });

    test('returns account when account with email of similar case found', async () => {
      const mockAccounts: Account[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1', Email: 'mockEmail1@example.com' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2', Email: 'mockEmail2@example.com' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      // Execute
      const result = await getAccountDetailsFromOrganizations(new OrganizationsClient({}), mockAccounts[1].Email!);

      // Verify
      expect(result).toBe(mockAccounts[1]);
    });
  });

  describe('getAccountId', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test('returns error when account not found', async () => {
      const mockAccounts: Account[] = [
        { Id: 'mockId1', Name: 'mockName1', Arn: 'mockArn1', Email: 'mockEmail1@example.com' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2', Email: 'mockEmail2@example.com' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));
      const email = 'mock-email@example.com';
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      await expect(async () => {
        await getAccountId(new OrganizationsClient({}), email);
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with email "${email}" not found in AWS Organizations.`,
      );
      expect(paginateListAccounts).toHaveBeenCalledTimes(1);
    });

    test('returns error when Account object does not have Id property', async () => {
      const mockAccounts: Account[] = [
        { Name: 'mockName1', Arn: 'mockArn1', Email: 'mockEmail1@example.com' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2', Email: 'mockEmail2@example.com' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      await expect(async () => {
        await getAccountId(new OrganizationsClient({}), mockAccounts[0].Email!);
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListAccounts api did not return the Account object Id property for the account with email "${mockAccounts[0].Email}".`,
      );
      expect(paginateListAccounts).toHaveBeenCalledTimes(1);
    });

    test('returns account id', async () => {
      const mockAccounts: Account[] = [
        { Name: 'mockName1', Arn: 'mockArn1', Email: 'mockEmail1@example.com' },
        { Id: 'mockId2', Name: 'mockName2', Arn: 'mockArn2', Email: 'mockEmail2@example.com' },
      ];
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));
      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: mockAccounts,
          };
        },
      }));

      const response = await getAccountId(new OrganizationsClient({}), mockAccounts[1].Email!);
      expect(response).toBe(mockAccounts[1].Id);
      expect(paginateListAccounts).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOrganizationId', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return organization id', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeOrganizationCommand) {
          return Promise.resolve({ Organization: MOCK_CONSTANTS.organization });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await getOrganizationId(new OrganizationsClient({}));

      // Verify
      expect(response).toBe(MOCK_CONSTANTS.organization.Id);
      expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw error when DescribeOrganizationCommand api did not return Organization object', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeOrganizationCommand) {
          return Promise.resolve({ Organization: undefined });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute && Verify
      await expect(async () => {
        await getOrganizationId(new OrganizationsClient({}));
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeOrganizationCommand api did not return Organization object.`,
      );
      expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw error when DescribeOrganizationCommand api did not return Organization object Id property', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeOrganizationCommand) {
          return Promise.resolve({ Organization: { Id: undefined } });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute && Verify
      await expect(async () => {
        await getOrganizationId(new OrganizationsClient({}));
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeOrganizationCommand api did not return Organization object Id property.`,
      );
      expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentAccountId', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      (STSClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return account id', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Account: MOCK_CONSTANTS.accountId });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await getCurrentAccountId(new STSClient({}));

      // Verify
      expect(response).toBe(MOCK_CONSTANTS.accountId);
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw error when GetCallerIdentityCommand api did not return Account property', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Account: undefined });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute && Verify
      await expect(async () => {
        await getCurrentAccountId(new STSClient({}));
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetCallerIdentityCommand api did not return Account property.`,
      );
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOrganizationalUnitArn', () => {
    const mockOrgSend = jest.fn();
    const mockStsSend = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockOrgSend,
      }));

      (STSClient as jest.Mock).mockImplementation(() => ({
        send: mockStsSend,
      }));
    });

    test('should return organizational unit id when organization id provided', async () => {
      // Setup
      mockStsSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Account: MOCK_CONSTANTS.accountId });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      mockOrgSend.mockImplementation(command => {
        if (command instanceof DescribeOrganizationCommand) {
          return Promise.resolve({ Organization: MOCK_CONSTANTS.organization });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await getOrganizationalUnitArn(
        new OrganizationsClient({}),
        new STSClient({}),
        MOCK_CONSTANTS.organization.Id,
        MOCK_CONSTANTS.runnerParameters.partition,
      );

      // Verify
      expect(response).toBe(
        `arn:${MOCK_CONSTANTS.runnerParameters.partition}:organizations::${MOCK_CONSTANTS.accountId}:ou/${
          MOCK_CONSTANTS.organization.Id
        }/${MOCK_CONSTANTS.organization.Id.toLowerCase()}`,
      );
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
      expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    });

    test('should return organizational unit id when organization id not provided', async () => {
      // Setup
      mockStsSend.mockImplementation(command => {
        if (command instanceof GetCallerIdentityCommand) {
          return Promise.resolve({ Account: MOCK_CONSTANTS.accountId });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await getOrganizationalUnitArn(
        new OrganizationsClient({}),
        new STSClient({}),
        MOCK_CONSTANTS.organization.Id,
        MOCK_CONSTANTS.runnerParameters.partition,
        MOCK_CONSTANTS.organization.Id,
      );

      // Verify
      expect(response).toBe(
        `arn:${MOCK_CONSTANTS.runnerParameters.partition}:organizations::${MOCK_CONSTANTS.accountId}:ou/${
          MOCK_CONSTANTS.organization.Id
        }/${MOCK_CONSTANTS.organization.Id.toLowerCase()}`,
      );
      expect(GetCallerIdentityCommand).toHaveBeenCalledTimes(1);
      expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(0);
    });
  });
});
