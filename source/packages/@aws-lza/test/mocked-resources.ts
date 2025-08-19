import { AcceleratorModuleName } from '../common/resources';

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
const operation = 'mockOperation';

export const MOCK_CONSTANTS = {
  unknownError: new Error('Unknown command'),
  serviceError: new Error('Arbitrary service error'),
  globalRegion: 'mockGlobalRegion',
  testModuleName: 'mockTestModule',
  runnerParameters: {
    operation: operation,
    partition: 'mockPartition',
    region: 'mockRegion',
    prefix: 'mockPrefix',
    configDirPath: '/path/to/config',
    useExistingRole: false,
    solutionId: 'mockSolutionId',
  },
  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
    expiration: new Date('2024-12-31'),
  },
  accountId: 'mockAccountId',
  validCreateOuConfiguration: {
    name: 'mockOuName',
  },
  nestedOuNameConfiguration: {
    name: 'mockOuName1/mockOuName3',
  },
  organizationRoot: {
    Id: 'mockRootId',
    Name: 'Root',
    Arn: 'mockRootArn',
  },
  newOrganizationalUnit: {
    Id: 'mockOuId',
    Arn: 'mockOuArn',
    Name: 'mockOuName',
  },
  existingOrganizationalUnits: [
    {
      Id: 'mockOuId1',
      Arn: 'mockOuArn1',
      Name: 'mockOuName1',
    },
    {
      Id: 'mockOuId2',
      Arn: 'mockOuArn2',
      Name: 'mockOuName2',
    },
  ],
  invalidOuPath: 'InvalidOU/NonExistent',
  dryRunStatus: 'mock dryrun status',
  dryRunResponsePattern: {
    setupLandingZoneModule: (status: string) =>
      new RegExp(
        `\\[DRY-RUN\\]: ${AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE} ${operation} \\(no actual changes were made\\)[\\s\\S]*?${status}`,
      ),
    organizationalUnitModule: (status: string) =>
      new RegExp(
        `\\[DRY-RUN\\]: ${AcceleratorModuleName.AWS_ORGANIZATIONS} ${operation} \\(no actual changes were made\\)[\\s\\S]*?${status}`,
      ),
  },
  setupControlTowerLandingZoneConfiguration: {
    version: 'mockVersion',
    enabledRegions: ['mockRegion1', 'mockRegion2'],
    logging: {
      organizationTrail: true,
      retention: {
        loggingBucket: 30,
        accessLoggingBucket: 30,
      },
    },
    security: {
      enableIdentityCenterAccess: true,
    },
    sharedAccounts: {
      management: {
        name: 'Management',
        email: 'mockManagement@example.com',
      },
      logging: {
        name: 'Logging',
        email: 'mockLogArchive@example.com',
      },
      audit: {
        name: 'Audit',
        email: 'mockAudit@example.com',
      },
    },
  },
  InviteAccountsBatchToOrganizationModule: {
    existingAccounts: [
      {
        Id: 'mockExistingAccountId1',
        Arn: 'mockExistingAccountArn1',
        Email: 'mockExistingAccount1@example.com',
        Name: 'Mock Existing Account-1',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date(),
      },
      {
        Id: 'mockExistingAccountId2',
        Arn: 'mockExistingAccountArn2',
        Email: 'mockExistingAccount2@example.com',
        Name: 'Mock Existing Account-2',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date(),
      },
    ],
    overlapExistingAccounts: [
      {
        Id: 'mockExistingAccountId1',
        Arn: 'mockExistingAccountArn1',
        Email: 'mockExistingAccount1@example.com',
        Name: 'Mock Existing Account-1',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date(),
      },
      {
        Id: 'mockAccountId1',
        Arn: 'mockAccountArn1',
        Email: 'account1@example.com',
        Name: 'Mock Existing Account-1',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date(),
      },
    ],
    allOverlapExistingAccounts: [
      {
        Id: 'mockAccountId1',
        Arn: 'mockAccountArn1',
        Email: 'account1@example.com',
        Name: 'Mock Existing Account-1',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date(),
      },
      {
        Id: 'mockAccountId2',
        Arn: 'mockAccountArn2',
        Email: 'account2@example.com',
        Name: 'Mock Existing Account-2',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date(),
      },
    ],
    configuration: [
      {
        email: 'account1@example.com',
        accountId: 'mockAccountId1',
        accountAccessRoleName: 'mockAccountAccessRoleName',
        tags: [
          { Key: 'tag1', Value: 'value1' },
          { Key: 'tag1', Value: 'value1' },
        ],
      },
      {
        email: 'account2@example.com',
        accountId: 'mockAccountId2',
        accountAccessRoleName: 'mockAccountAccessRoleName',
        tags: [
          { Key: 'tag2', Value: 'value2' },
          { Key: 'tag2', Value: 'value2' },
        ],
      },
    ],
    inValidConfiguration: [
      {
        email: 'account1Example.com',
        accountId: 'mockAccountId1',
        accountAccessRoleName: 'mockAccountAccessRoleName',
        tags: [
          { Key: 'tag1', Value: 'value1' },
          { Key: 'tag1', Value: 'value1' },
        ],
      },
      {
        email: 'account2Example.com',
        accountId: 'mockAccountId2',
        accountAccessRoleName: 'mockAccountAccessRoleName',
        tags: [
          { Key: 'tag2', Value: 'value2' },
          { Key: 'tag2', Value: 'value2' },
        ],
      },
    ],
  },
  InviteAccountToOrganizationModule: {
    configuration: {
      email: 'account@example.com',
      accountId: 'mockAccountId',
      accountAccessRoleName: 'mockAccountAccessRoleName',
      tags: [
        { Key: 'tag1', Value: 'value1' },
        { Key: 'tag1', Value: 'value1' },
      ],
    },
    invitingAccount: {
      Id: 'mockAccountId',
      Arn: 'mockAccountArn',
      email: 'account@example.com',
      name: 'mockAccountName',
      Status: 'ACTIVE',
      JoinedMethod: 'INVITED',
    },
    inviteHandshake: {
      Id: 'mockHandshakeId',
    },
  },
  MoveAccountsBatchModule: {
    configuration: [
      {
        email: 'account1@example.com',
        destinationOu: '/Level1/Level2/Level3',
      },
      {
        email: 'account2@example.com',
        destinationOu: '/Level1/Level2/Level3/Level4',
      },
    ],
    invalidConfiguration: [
      {
        email: 'account1example.com',
        destinationOu: '/Level1/Level2/Level3',
      },
      {
        email: 'account2example.com',
        destinationOu: '/Level1/Level2/Level3/Level4',
      },
    ],
    moveAccounts: [
      {
        Id: 'mockAccountId1',
        Arn: 'mockAccountArn1',
        Email: 'account1@example.com',
        Name: 'mockAccountName1',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
      },
      {
        Id: 'mockAccountId2',
        Arn: 'mockAccountArn2',
        Email: 'account2@example.com',
        Name: 'mockAccountName2',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
      },
    ],
  },
  MoveAccountModule: {
    configuration: {
      email: 'account@example.com',
      destinationOu: '/Level1/Level2/Level3',
    },
    rootDestinationOu: 'Root',
    moveAccount: {
      Id: 'mockAccountId',
      Arn: 'mockAccountArn',
      Email: 'account@example.com',
      Name: 'mockAccountName',
      Status: 'ACTIVE',
      JoinedMethod: 'INVITED',
    },
    destinationParentId: 'mockDestinationParentId',
    currentParent: {
      Id: 'mockCurrentParentId',
      Type: 'ORGANIZATIONAL_UNIT',
    },
  },
  organization: {
    Id: 'mockOrganizationId',
  },
  RegisterOrganizationalUnitModule: {
    configuration: {
      name: 'mockOu',
    },
    existingLandingZoneIdentifier: 'mockLandingZoneIdentifier',
    existingLandingArn: 'mockExistingLandingArn',
    securityOuName: 'Security',
    landingZoneVersion: '4.0',
    organizationalUnitId: 'mockOrganizationalUnitId',
    operationIdentifier: 'mockOperationIdentifier',
    enabledBaselines: {
      mockTarget1: {
        arn: 'mockEnabledBaselineArn1',
        baselineIdentifier: 'mockBaselineIdentifier1',
        statusSummary: {
          status: 'SUCCEEDED',
        },
        targetIdentifier: 'mockTargetIdentifier1',
        baselineVersion: '4.0',
      },
      mockTarget2: {
        arn: 'mockEnabledBaselineArn1',
        baselineIdentifier: 'mockBaselineIdentifier1',
        statusSummary: {
          status: 'SUCCEEDED',
        },
        targetIdentifier: 'mockTargetIdentifier1',
        baselineVersion: '4.0',
      },
      mockOu: {
        arn: 'mockOuArn',
        baselineIdentifier: 'mockOuBaselineIdentifier1',
        statusSummary: {
          status: 'SUCCEEDED',
        },
        targetIdentifier: 'mockOuArn',
        baselineVersion: '4.0',
      },
      mockOuFailed: {
        arn: 'mockOuArn',
        baselineIdentifier: 'mockOuBaselineIdentifier1',
        statusSummary: {
          status: 'FAILED',
        },
        targetIdentifier: 'mockOuArn',
        baselineVersion: '4.0',
      },
      mockOuOldBaseLineVersion: {
        arn: 'mockOuArn',
        baselineIdentifier: 'mockOuBaselineIdentifier1',
        statusSummary: {
          status: 'SUCCEEDED',
        },
        targetIdentifier: 'mockOuArn',
        baselineVersion: '3.0',
      },
      mockIdentityCenterBaseline: {
        arn: 'mockIdentityCenterBaselineArn',
        baselineIdentifier: 'mockIdentityCenterBaselineArn',
        statusSummary: {
          status: 'SUCCEEDED',
        },
        targetIdentifier: 'mockIdentityCenterBaselineArn',
        baselineVersion: '4.0',
      },
    },
    baselines: {
      controlTowerBaseline: {
        arn: 'mockControlTowerBaselineArn',
        description: 'mock description',
        name: 'AWSControlTowerBaseline',
      },
      identityCenterBaseline: {
        arn: 'mockIdentityCenterBaselineArn',
        description: 'mock description',
        name: 'IdentityCenterBaseline',
      },
      auditBaseline: {
        arn: 'mockAuditBaselineArn',
        description: 'mock description',
        name: 'AuditBaseline',
      },
    },
  },
  ManageEbsDefaultEncryptionModule: {
    configuration: {
      enableDefaultEncryption: true,
      kmsKeyId: 'mockKmsKeyId',
    },
    existingEncryptionKeyId: 'mockExistingEncryptionKeyId',
  },
  GetCloudFormationTemplatesModule: {
    configuration: {
      centralAccountId: '111122223333',
      acceleratorEnvironments: [
        { accountId: '111122223333', region: 'us-east-1' },
        { accountId: '444455556666', region: 'us-west-2' },
      ],
      roleNameToAssume: 'TestRole',
      stackPrefix: 'TestStack',
      directory: '/tmp/cfn-templates-test',
    },
  },
  ManageOrganizationAdminModule: {
    adminId: 'newAdminId',
    oldAdminId: 'oldAdminId',
  },
  controlTowerEnabledBaselines: [
    {
      arn: 'mockEnabledBaselineArn1',
      baselineIdentifier: 'mockBaselineIdentifier1',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockTargetIdentifier1',
      baselineVersion: '4.0',
    },
    {
      arn: 'mockEnabledBaselineArn2',
      baselineIdentifier: 'mockBaselineIdentifier2',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockTargetIdentifier2',
      baselineVersion: '4.0',
    },
    {
      arn: 'mockEnabledBaselineArn3',
      baselineIdentifier: 'mockBaselineIdentifier3',
      statusSummary: {
        status: 'SUCCEEDED',
      },
      targetIdentifier: 'mockTargetIdentifier3',
      baselineVersion: '4.0',
    },
  ],
  ConfigureRootUserManagmentModule: {
    enabled: true,
    credentials: true,
    session: true,
  },
  BlockPublicDocumentSharingModule: {
    configuration: {
      enable: true,
    },
  },
};

export function countOverlappingAccounts(): {
  totalInputAccounts: number;
  existingAccountsCount: number;
  newAccountsCount: number;
} {
  const { overlapExistingAccounts, configuration } = MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule;

  // Extract emails from overlapExistingAccounts
  const overlapEmails = overlapExistingAccounts.map(account => account.Email?.toLowerCase());

  // Extract emails from configuration
  const configEmails = configuration.map(account => account.email?.toLowerCase());

  // Find common emails
  const commonEmails = overlapEmails.filter(email => configEmails.includes(email));

  // Count of accounts in overlapExistingAccounts that match configuration accounts
  return {
    totalInputAccounts: configEmails.length,
    existingAccountsCount: commonEmails.length,
    newAccountsCount: configEmails.length - commonEmails.length,
  };
}
