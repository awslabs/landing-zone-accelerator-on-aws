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
import { Organization } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/organization';
import {
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  EnableAllFeaturesCommand,
  ListRootsCommand,
  OrganizationFeatureSet,
  OrganizationsClient,
  paginateListAccounts,
  paginateListAWSServiceAccessForOrganization,
  paginateListOrganizationalUnitsForParent,
} from '@aws-sdk/client-organizations';
import { paginateListInstances } from '@aws-sdk/client-sso-admin';

// Mock dependencies
jest.mock('@aws-sdk/client-organizations', () => {
  return {
    AWSOrganizationsNotInUseException: jest.fn(),
    EnableAllFeaturesCommand: jest.fn(),
    DescribeOrganizationCommand: jest.fn(),
    ListRootsCommand: jest.fn(),
    OrganizationsClient: jest.fn(),
    paginateListAccounts: jest.fn(),
    paginateListAWSServiceAccessForOrganization: jest.fn(),
    paginateListOrganizationalUnitsForParent: jest.fn(),
    OrganizationFeatureSet: {
      ALL: 'ALL',
      CONSOLIDATED_BILLING: 'CONSOLIDATED_BILLING',
    },
  };
});
jest.mock('@aws-sdk/client-sso-admin', () => {
  return {
    paginateListInstances: jest.fn(),
    SSOAdminClient: jest.fn(),
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
    { Id: 'mockId1', Arn: 'mockArn1', Email: 'mockLogArchive@example.com', Name: 'mockName1' },
    { Id: 'mockId2', Arn: 'mockArn2', Email: 'mockAudit@example.com', Name: 'mockName2' },
    { Id: 'mockId3', Arn: 'mockArn3', Email: 'mockEmail3@example.com', Name: 'mockName3' },
  ],
  govCloudAccounts: [
    { Id: 'mockId1', Arn: 'mockArn1', Email: 'mockLogArchive@example.com', Name: 'mockName1' },
    { Id: 'mockId2', Arn: 'mockArn2', Email: 'mockAudit@example.com', Name: 'mockName2' },
    { Id: 'mockId3', Arn: 'mockArn3', Email: 'mockEmail3@example.com', Name: 'mockName3' },
    { Id: 'mockId4', Arn: 'mockArn4', Email: 'mockEmail4@example.com', Name: 'mockName4' },
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
  organizationsHaveOusFailureError: new RegExp(
    `AWS Control Tower Landing Zone cannot deploy because there are multiple organizational units in AWS Organizations.`,
  ),
  govCloudOrganizationsHaveAccountsFailureError: new RegExp(
    `Either AWS Organizations does not have required shared accounts`,
  ),
  organizationsHaveAccountsFailureError: new RegExp(
    `AWS Control Tower Landing Zone cannot deploy because there are multiple accounts in AWS Organizations.`,
  ),
};

describe('IAM Role Tests', () => {
  const mockOrganizationsSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (OrganizationsClient as jest.Mock).mockImplementation(() => ({
      send: mockOrganizationsSend,
    }));

    (paginateListInstances as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Instances: [],
        };
      },
    }));

    (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [],
        };
      },
    }));

    (paginateListAccounts as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Accounts: [],
        };
      },
    }));

    (paginateListAWSServiceAccessForOrganization as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          EnabledServicePrincipals: [],
        };
      },
    }));
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
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(1);
  });

  test('organizations validation failed becasue IdentityCenter already enabled', async () => {
    // Setup
    (paginateListInstances as jest.Mock).mockImplementation(() => ({
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
    (paginateListInstances as jest.Mock).mockImplementation(() => ({
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
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(1);
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
    (paginateListAWSServiceAccessForOrganization as jest.Mock).mockImplementation(() => ({
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
    (paginateListAWSServiceAccessForOrganization as jest.Mock).mockImplementation(() => ({
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
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(1);
  });

  test('organizations validation failed becasue Organizations have other OUs', async () => {
    // Setup
    (paginateListOrganizationalUnitsForParent as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          OrganizationalUnits: [MOCK_CONSTANTS.organizationalUnit],
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
    }).rejects.toThrow(MOCK_CONSTANTS.organizationsHaveOusFailureError);
  });

  test('organizations validation failed becasue Organizations have other accounts', async () => {
    // Setup
    (paginateListAccounts as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Accounts: MOCK_CONSTANTS.accounts,
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
    }).rejects.toThrow(MOCK_CONSTANTS.organizationsHaveAccountsFailureError);
  });

  test('organizations validation failed becasue Organizations have other accounts and Accounts object undefined', async () => {
    // Setup
    (paginateListAccounts as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Accounts: undefined,
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
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(1);
  });

  test('organizations validation failed becasue Organizations have other accounts for gov cloud partition', async () => {
    // Setup
    (paginateListAccounts as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Accounts: MOCK_CONSTANTS.govCloudAccounts,
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
        MOCK_CONSTANTS.govCloudPartition,
        MOCK_CONSTANTS.sharedAccountEmail,
        MOCK_CONSTANTS.credentials,
        MOCK_CONSTANTS.solutionId,
      );
    }).rejects.toThrow(MOCK_CONSTANTS.govCloudOrganizationsHaveAccountsFailureError);
  });

  test('should successfully validated organizations becasue Organizations have other accounts for gov cloud partition', async () => {
    // Setup
    (paginateListAccounts as jest.Mock).mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Accounts: MOCK_CONSTANTS.govCloudAccounts.slice(0, -1),
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
      MOCK_CONSTANTS.govCloudPartition,
      MOCK_CONSTANTS.sharedAccountEmail,
      MOCK_CONSTANTS.credentials,
      MOCK_CONSTANTS.solutionId,
    );

    expect(response).toBeUndefined();
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(1);
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
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
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
    expect(DescribeOrganizationCommand).toHaveBeenCalledTimes(1);
    expect(EnableAllFeaturesCommand).toHaveBeenCalledTimes(1);
  });

  describe('getOrganizationAccountDetailsByEmail Tests', () => {
    test('get accounts by email', async () => {
      // Setup

      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
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

      (paginateListAccounts as jest.Mock).mockImplementation(() => ({
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
