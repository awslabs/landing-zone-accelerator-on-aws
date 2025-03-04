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
  globalRegion: 'mockGlobalRegion',
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
  InviteAccountToOrganizationModule: {
    configuration: {
      email: 'account@examle.com',
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
      email: 'account@examle.com',
      name: 'mockAccountName',
      Status: 'ACTIVE',
      JoinedMethod: 'INVITED',
    },
    inviteHandshake: {
      Id: 'mockHandshakeId',
    },
  },
  MoveAccountModule: {
    configuration: {
      email: 'account@examcple.com',
      destinationOu: '/Level1/Level2/Level3',
    },
    rootDestinationOu: 'Root',
    moveAccount: {
      Id: 'mockAccountId',
      Arn: 'mockAccountArn',
      email: 'account@examle.com',
      name: 'mockAccountName',
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
};
