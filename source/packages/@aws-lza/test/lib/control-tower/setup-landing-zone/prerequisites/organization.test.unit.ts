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
import { describe, beforeEach, expect, test, vi } from 'vitest';
import { Organization } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/organization';
import {
  AWSOrganizationsNotInUseException,
  CreateOrganizationalUnitCommand,
  DescribeOrganizationCommand,
  EnableAllFeaturesCommand,
  ListParentsCommand,
  ListRootsCommand,
  MoveAccountCommand,
  OrganizationFeatureSet,
  OrganizationsClient,
  paginateListAccounts,
  paginateListAWSServiceAccessForOrganization,
  paginateListOrganizationalUnitsForParent,
} from '@aws-sdk/client-organizations';
import { paginateListInstances } from '@aws-sdk/client-sso-admin';

// Mock dependencies
vi.mock('@aws-sdk/client-organizations', () => {
  return {
    AWSOrganizationsNotInUseException: vi.fn(),
    EnableAllFeaturesCommand: vi.fn(),
    DescribeOrganizationCommand: vi.fn(),
    ListRootsCommand: vi.fn(),
    CreateOrganizationalUnitCommand: vi.fn(),
    MoveAccountCommand: vi.fn(),
    ListParentsCommand: vi.fn(),
    OrganizationsClient: vi.fn(),
    paginateListAccounts: vi.fn(),
    paginateListAWSServiceAccessForOrganization: vi.fn(),
    paginateListOrganizationalUnitsForParent: vi.fn(),
    OrganizationFeatureSet: {
      ALL: 'ALL',
      CONSOLIDATED_BILLING: 'CONSOLIDATED_BILLING',
    },
  };
});
vi.mock('@aws-sdk/client-sso-admin', () => {
  return {
    paginateListInstances: vi.fn(),
    SSOAdminClient: vi.fn(),
  };
});

vi.mock('../../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../../common/functions');
  return {
    ...actual,
    getAccountId: vi.fn().mockReturnValue('fakeAccountId'),
  };
});

const MOCK_CONSTANTS = {
  globalRegion: 'mockGlobalRegion',
  region: 'mockRegion',
  solutionId: 'mockSolutionId',
  partition: 'mockPartition',
  govCloudPartition: 'aws-us-gov',
  sharedAccountEmail: { logArchive: 'mockLogArchive@example.com', audit: 'mockAudit@example.com' },
  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
    expiration: new Date('2024-12-31'),
  },
  unknownError: new Error('Unknown command'),
  ssoInstances: { InstanceArn: 'mockInstanceArn', IdentityStoreId: 'mockIdentityStoreId', Name: 'mockName' },
  allEnabledOrganization: { Id: 'mockId', Arn: 'mockArn', FeatureSet: OrganizationFeatureSet.ALL },
  allEnabledFeatureNotEnabledOrganization: { Id: 'mockId', Arn: 'mockArn' },
  billingFeatureNotEnabledOrganization: {
    Id: 'mockId',
    Arn: 'mockArn',
    FeatureSet: OrganizationFeatureSet.CONSOLIDATED_BILLING,
  },
  enabledServicePrincipals: [
    { ServicePrincipal: 'mockServicePrincipal1' },
    { ServicePrincipal: 'mockServicePrincipal2' },
  ],
  roots: { Id: 'mockId', Arn: 'mockArn', Name: 'mockName' },
  organizationalUnit: { Id: 'mockId', Arn: 'mockArn', Name: 'mockName' },
  accounts: [
    { Id: 'mockId1', Arn: 'mockArn1', Email: 'mockLogArchive@example.com', Name: 'mockName1', Status: 'ACTIVE' },
    { Id: 'mockId2', Arn: 'mockArn2', Email: 'mockAudit@example.com', Name: 'mockName2', Status: 'ACTIVE' },
    { Id: 'mockId3', Arn: 'mockArn3', Email: 'mockEmail3@example.com', Name: 'mockName3', Status: 'ACTIVE' },
  ],
  govCloudAccounts: [
    { Id: 'mockId1', Arn: 'mockArn1', Email: 'mockLogArchive@example.com', Name: 'mockName1', Status: 'ACTIVE' },
    { Id: 'mockId2', Arn: 'mockArn2', Email: 'mockAudit@example.com', Name: 'mockName2', Status: 'ACTIVE' },
    { Id: 'mockId3', Arn: 'mockArn3', Email: 'mockEmail3@example.com', Name: 'mockName3', Status: 'ACTIVE' },
    { Id: 'mockId4', Arn: 'mockArn4', Email: 'mockEmail4@example.com', Name: 'mockName4', Status: 'ACTIVE' },
  ],
  identityCenterEnabledFailureError: new RegExp(
    `AWS Control Tower Landing Zone cannot deploy because IAM Identity Center is configured.`,
  ),
  organizationsNotEnabledFailureError: new RegExp(
    `AWS Control Tower Landing Zone cannot deploy because AWS Organizations have not been configured for the environment.`,
  ),
  organizationsServiceEnabledFailureError: new RegExp(
    `AWS Control Tower Landing Zone cannot deploy because AWS Organizations have services enabled.`,
  ),
  govCloudOrganizationsHaveAccountsFailureError: new RegExp(
    `Either AWS Organizations does not have required shared accounts`,
  ),
};

describe('IAM Role Tests', () => {
  const mockOrganizationsSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (OrganizationsClient as vi.Mock).mockImplementation(() => ({
      send: mockOrganizationsSend,
    }));

    (paginateListInstances as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Instances: [],
        };
      },
    }));

    (paginateListOrganizationalUnitsForParent as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [],
        };
      },
    }));

    (paginateListAccounts as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Accounts: [],
        };
      },
    }));

    (paginateListAWSServiceAccessForOrganization as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          EnabledServicePrincipals: [],
        };
      },
    }));
  });

  test('should successfully moveAccountToOu', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof ListParentsCommand) {
        return Promise.resolve({ Parents: [{ Id: 'mockId' }] });
      }
      if (command instanceof MoveAccountCommand) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    await Organization.moveAccounts('fakeRegion', 'mockId2', ['mockEmail']);

    expect(MoveAccountCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        AccountId: 'fakeAccountId',
        DestinationParentId: 'mockId2',
        SourceParentId: 'mockId',
      }),
    );
  });

  test('should skip moveAccountToOu if already in the same OU', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof ListParentsCommand) {
        return Promise.resolve({ Parents: [{ Id: 'mockId' }] });
      }
      if (command instanceof MoveAccountCommand) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    await Organization.moveAccounts('fakeRegion', 'mockId', ['mockEmail']);

    expect(MoveAccountCommand).not.toHaveBeenCalled();
  });

  test('should fail moveAccountToOu if no returned parent', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof ListParentsCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    expect(async () => {
      await Organization.moveAccounts('fakeRegion', 'mockId2', ['mockEmail']);
    }).rejects.toThrow('Account "mockEmail" does not have a parent OU.');
  });

  test('should fail moveAccountToOu if no Parents', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof ListParentsCommand) {
        return Promise.resolve({ Parents: [] });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    expect(async () => {
      await Organization.moveAccounts('fakeRegion', 'mockId2', ['mockEmail']);
    }).rejects.toThrow('Account "mockEmail" does not have a parent OU.');
  });

  test('should successfully create OU', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof CreateOrganizationalUnitCommand) {
        return Promise.resolve({
          OrganizationalUnit: {
            Id: 'mockId4',
            Name: 'fakeNewOu',
            Arn: 'mockArn4',
          },
        });
      }

      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
    });

    (paginateListOrganizationalUnitsForParent as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [MOCK_CONSTANTS.organizationalUnit],
        };
      },
    }));

    const result = await Organization.createOu('fakeRegion', 'fakeNewOu', 'mockName');

    expect(result).toBe('mockId4');
  });

  test('should fail to create OU if no parentOu', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
    });

    (paginateListOrganizationalUnitsForParent as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [MOCK_CONSTANTS.organizationalUnit],
        };
      },
    }));

    expect(async () => {
      await Organization.createOu('fakeRegion', 'fakeNewOu', 'wrongOuName');
    }).rejects.toThrow('InvalidInputException: Parent OU "wrongOuName" not found.');
  });

  test('should fail to create OU if SDK call returns no OU id', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof CreateOrganizationalUnitCommand) {
        return Promise.resolve({
          OrganizationalUnit: {
            Name: 'fakeNewOu',
            Arn: 'mockArn4',
          },
        });
      }

      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
    });

    (paginateListOrganizationalUnitsForParent as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [MOCK_CONSTANTS.organizationalUnit],
        };
      },
    }));

    expect(async () => {
      await Organization.createOu('fakeRegion', 'fakeNewOu', 'mockName');
    }).rejects.toThrow(
      'ServiceException: Organization unit "fakeNewOu" create organization unit api did not return OrganizationalUnit object with ID.',
    );
  });

  test('should fail to create OU if SDK call fails', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof CreateOrganizationalUnitCommand) {
        return Promise.resolve({});
      }

      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
    });

    (paginateListOrganizationalUnitsForParent as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [MOCK_CONSTANTS.organizationalUnit],
        };
      },
    }));

    expect(async () => {
      await Organization.createOu('fakeRegion', 'fakeNewOu', 'mockName');
    }).rejects.toThrow(
      'ServiceException: Organization unit "fakeNewOu" create organization unit api did not return OrganizationalUnit object with ID.',
    );
  });

  test('should skip to create OU if OU already exists', async () => {
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
    });

    (paginateListOrganizationalUnitsForParent as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [MOCK_CONSTANTS.organizationalUnit],
        };
      },
    }));

    const result = await Organization.createOu('fakeRegion', 'mockName', 'mockName');

    expect(result).toBe('mockId');
    expect(CreateOrganizationalUnitCommand).not.toHaveBeenCalled();
  });

  test('should successfully validated organizations', async () => {
    // Setup

    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: MOCK_CONSTANTS.allEnabledOrganization });
      }
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
      if (command instanceof EnableAllFeaturesCommand) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute
    const response = await Organization.validate(
      MOCK_CONSTANTS.globalRegion,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.sharedAccountEmail,
      MOCK_CONSTANTS.credentials,
      MOCK_CONSTANTS.solutionId,
    );

    expect(response).toBeUndefined();
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(2);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(0);
  });

  test('organizations validation failed becasue IdentityCenter already enabled', async () => {
    // Setup
    (paginateListInstances as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Instances: [MOCK_CONSTANTS.ssoInstances],
        };
      },
    }));

    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: MOCK_CONSTANTS.allEnabledOrganization });
      }
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await Organization.validate(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.sharedAccountEmail,
        MOCK_CONSTANTS.credentials,
        MOCK_CONSTANTS.solutionId,
      );
    }).rejects.toThrow(MOCK_CONSTANTS.identityCenterEnabledFailureError);
  });

  test('should successfully validated organizations when IdentityCenter Instances undefined', async () => {
    // Setup
    (paginateListInstances as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Instances: undefined,
        };
      },
    }));

    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: MOCK_CONSTANTS.allEnabledOrganization });
      }
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
      if (command instanceof EnableAllFeaturesCommand) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute
    const response = await Organization.validate(
      MOCK_CONSTANTS.globalRegion,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.sharedAccountEmail,
      MOCK_CONSTANTS.credentials,
      MOCK_CONSTANTS.solutionId,
    );

    expect(response).toBeUndefined();
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(2);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(0);
  });

  test('organizations validation failed becasue describe organization did not return organization details', async () => {
    // Setup
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: undefined });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await Organization.validate(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.sharedAccountEmail,
        MOCK_CONSTANTS.credentials,
        MOCK_CONSTANTS.solutionId,
      );
    }).rejects.toThrow(MOCK_CONSTANTS.organizationsNotEnabledFailureError);
  });

  test('organizations validation failed becasue describe organization returned AWSOrganizationsNotInUseException exception', async () => {
    // Setup
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.reject(
          new AWSOrganizationsNotInUseException({ message: 'Organizations not enabled', $metadata: {} }),
        );
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await Organization.validate(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.sharedAccountEmail,
        MOCK_CONSTANTS.credentials,
        MOCK_CONSTANTS.solutionId,
      );
    }).rejects.toThrow(MOCK_CONSTANTS.organizationsNotEnabledFailureError);
  });

  test('organizations validation failed becasue describe organization returned unhandled exception', async () => {
    // Setup
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await Organization.validate(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.sharedAccountEmail,
        MOCK_CONSTANTS.credentials,
        MOCK_CONSTANTS.solutionId,
      );
    }).rejects.toThrow(MOCK_CONSTANTS.unknownError.message);
  });

  test('organizations validation failed becasue Organizations have services enabled', async () => {
    // Setup
    (paginateListAWSServiceAccessForOrganization as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          EnabledServicePrincipals: MOCK_CONSTANTS.enabledServicePrincipals,
        };
      },
    }));

    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: MOCK_CONSTANTS.allEnabledOrganization });
      }
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await Organization.validate(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.sharedAccountEmail,
        MOCK_CONSTANTS.credentials,
        MOCK_CONSTANTS.solutionId,
      );
    }).rejects.toThrow(MOCK_CONSTANTS.organizationsServiceEnabledFailureError);
  });

  test('should successfully validated organizations with EnabledServicePrincipals undefined', async () => {
    // Setup
    (paginateListAWSServiceAccessForOrganization as vi.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          EnabledServicePrincipals: undefined,
        };
      },
    }));

    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: MOCK_CONSTANTS.allEnabledOrganization });
      }
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
      if (command instanceof EnableAllFeaturesCommand) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute
    const response = await Organization.validate(
      MOCK_CONSTANTS.globalRegion,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.sharedAccountEmail,
      MOCK_CONSTANTS.credentials,
      MOCK_CONSTANTS.solutionId,
    );

    expect(response).toBeUndefined();
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(2);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(0);
  });

  test('should enable all features in organizations', async () => {
    // Setup

    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: MOCK_CONSTANTS.allEnabledFeatureNotEnabledOrganization });
      }
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
      if (command instanceof EnableAllFeaturesCommand) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute
    const response = await Organization.validate(
      MOCK_CONSTANTS.globalRegion,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.sharedAccountEmail,
      MOCK_CONSTANTS.credentials,
      MOCK_CONSTANTS.solutionId,
    );

    expect(response).toBeUndefined();
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(2);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(1);
  });

  test('should not enable all features in organizations becasue already enabled', async () => {
    // Setup

    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({ Organization: MOCK_CONSTANTS.allEnabledOrganization });
      }
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({ Roots: [MOCK_CONSTANTS.roots] });
      }
      if (command instanceof EnableAllFeaturesCommand) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute
    const response = await Organization.validate(
      MOCK_CONSTANTS.globalRegion,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.sharedAccountEmail,
      MOCK_CONSTANTS.credentials,
      MOCK_CONSTANTS.solutionId,
    );

    expect(response).toBeUndefined();
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(2);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(0);
  });

  describe('getOrganizationAccountDetailsByEmail Tests', () => {
    test('get accounts by email', async () => {
      // Setup

      (paginateListAccounts as vi.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: MOCK_CONSTANTS.govCloudAccounts,
          };
        },
      }));

      // Execute
      const response = await Organization.getOrganizationAccountDetailsByEmail(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.sharedAccountEmail.audit,
        MOCK_CONSTANTS.credentials,
        MOCK_CONSTANTS.solutionId,
      );

      expect(response).toBeDefined();
    });

    test('account not found by email', async () => {
      // Setup
      const dummyEmail = 'mock@example.com';

      (paginateListAccounts as vi.Mock).mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: MOCK_CONSTANTS.govCloudAccounts,
          };
        },
      }));

      // Execute & Verify
      await expect(async () => {
        await Organization.getOrganizationAccountDetailsByEmail(
          MOCK_CONSTANTS.globalRegion,
          dummyEmail,
          MOCK_CONSTANTS.credentials,
          MOCK_CONSTANTS.solutionId,
        );
      }).rejects.toThrow(`Account with email ${dummyEmail} not found`);
    });
  });
});
