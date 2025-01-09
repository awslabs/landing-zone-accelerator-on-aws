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

import { beforeEach, describe, test } from '@jest/globals';
import { ModuleRunner } from '../index';
import * as lza from '../lib/libraries/lza';
import { AcceleratorStage } from '../../accelerator';
import { AcceleratorModuleNames, AcceleratorModuleRunnerParametersType } from '../lib/libraries/lza';
import {
  AccountConfig,
  AccountsConfig,
  CentralSecurityServicesConfig,
  CloudWatchLogsConfig,
  ControlTowerConfig,
  CustomizationsConfig,
  DefaultVpcsConfig,
  GlobalConfig,
  IamConfig,
  LoggingConfig,
  NetworkConfig,
  OrganizationalUnitConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';

const mockGlobalConfiguration = {
  homeRegion: 'mockHomeRegion',
  controlTower: {
    enable: true,
    landingZone: {
      version: 'mockCTVersion',
      logging: {
        loggingBucketRetentionDays: 365,
        accessLoggingBucketRetentionDays: 365,
        organizationTrail: true,
      },
      security: {
        enableIdentityCenterAccess: true,
      },
    },
  },
  logging: {
    cloudwatchLogs: {} as CloudWatchLogsConfig,
    sessionManager: {
      sendToCloudWatchLogs: false,
      sendToS3: false,
    },
    cloudtrail: {
      enable: false,
    },
  } as LoggingConfig,
  cdkOptions: {
    centralizeBuckets: true,
    useManagementAccessRole: true,
  },
} as GlobalConfig;

const mockAccountsConfiguration: Partial<AccountsConfig> = {
  mandatoryAccounts: [
    {
      name: 'Management',
      description: 'mockManagement',
      email: 'mockManagement@example.com',
      organizationalUnit: 'Root',
    },
    {
      name: 'LogArchive',
      description: 'mockLogArchive',
      email: 'mockLogArchive@example.com',
      organizationalUnit: 'Security',
    },
    {
      name: 'Audit',
      description: 'mockAudit',
      email: 'mockAudit@example.com',
      organizationalUnit: 'Security',
    },
  ] as AccountConfig[],
  workloadAccounts: [
    {
      name: 'SharedServices',
      description: 'mockSharedServices',
      email: 'mockSharedServices@example.com',
      organizationalUnit: 'Infrastructure',
    },
    {
      name: 'Network',
      description: 'mockNetwork',
      email: 'mockNetwork@example.com',
      organizationalUnit: 'Infrastructure',
    },
  ] as AccountConfig[],
  accountIds: [
    {
      email: 'mockAccount1@example.com',
      accountId: '111111111111',
      status: 'ACTIVE',
    },
    {
      email: 'mockAccount2@example.com',
      accountId: '222222222222',
      status: 'ACTIVE',
    },
  ],
};

const mockCustomizationsConfig: Partial<CustomizationsConfig> = {
  customizations: { cloudFormationStacks: [], cloudFormationStackSets: [], serviceCatalogPortfolios: [] },
  applications: [],
  firewalls: undefined,
  getCustomStacks: jest.fn().mockReturnValue(undefined),
  getAppStacks: jest.fn().mockReturnValue(undefined),
};

const mockIamConfig: Partial<IamConfig> = {
  providers: [],
  policySets: [],
  roleSets: [],
  groupSets: [],
  userSets: [],
};

const mockNetworkConfig: Partial<NetworkConfig> = {
  defaultVpc: {
    delete: false,
  } as DefaultVpcsConfig,
  transitGateways: [],
  endpointPolicies: [],
  vpcs: [],
};

const mockOrganizationConfig: Partial<OrganizationConfig> = {
  enable: true,
  organizationalUnits: [
    {
      name: 'Security',
    } as OrganizationalUnitConfig,
    {
      name: 'Infrastructure',
    } as OrganizationalUnitConfig,
    {
      name: 'Suspended',
      ignore: true,
    } as OrganizationalUnitConfig,
  ],
  serviceControlPolicies: [],
  taggingPolicies: [],
  chatbotPolicies: [],
  backupPolicies: [],
};

const mockReplacementsConfig: Partial<ReplacementsConfig> = {
  globalReplacements: [],
  placeholders: {
    Management: 'Management',
    LogArchive: 'LogArchive',
    Audit: 'Audit',
    SharedServices: 'SharedServices',
    Network: 'Network',
  },
  validateOnly: false,
};

const mockSecurityConfig: Partial<SecurityConfig> = {
  centralSecurityServices: {
    delegatedAdminAccount: 'Audit',
  } as CentralSecurityServicesConfig,
};

const MOCK_CONSTANTS = {
  invalidStage: 'mockStage',
  invalidModule: 'mockModule',
  runnerParams: {
    partition: 'mockPartition',
    region: 'mockRegion',
    prefix: 'mockPrefix',
    configDirPath: '/path/to/config',
    useExistingRole: false,
    solutionId: 'mockSolutionId',
    dryRun: false,
  },
  // getManagementAccountCredentials
  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
    expiration: new Date('2024-12-31'),
  },
  //setResourcePrefixes
  resourcePrefixes: {
    accelerator: 'AWSAccelerator',
    bucketName: 'aws-accelerator',
    databaseName: 'aws-accelerator',
    kmsAlias: 'alias/accelerator',
    repoName: 'aws-accelerator',
    secretName: '/accelerator',
    snsTopicName: 'aws-accelerator',
    ssmParamName: '/accelerator',
    importResourcesSsmParamName: '/accelerator/imported-resources',
    trailLogName: 'aws-accelerator',
    ssmLogName: 'aws-accelerator',
  },
  acceleratorResourceNames: {
    roles: {
      crossAccountCmkArnSsmParameterAccess: 'AWSAccelerator-CrossAccount-SsmParameter-Role',
      ipamSsmParameterAccess: 'AWSAccelerator-Ipam-GetSsmParamRole',
      ipamSubnetLookup: 'AWSAccelerator-GetIpamCidrRole',
      crossAccountCentralLogBucketCmkArnSsmParameterAccess:
        'AWSAccelerator-mockHomeRegion-CentralBucket-KeyArnParam-Role',
      crossAccountCustomerGatewayRoleName: 'AWSAccelerator-CrossAccount-CustomerGateway-Role',
      crossAccountLogsRoleName: 'AWSAccelerator-CrossAccount-PutLogs-Role',
      crossAccountSecretsCmkParameterAccess: 'AWSAccelerator-CrossAccount-SecretsKms-Role',
      crossAccountTgwRouteRoleName: 'AWSAccelerator-CrossAccount-TgwRoutes-Role',
      crossAccountVpnRoleName: 'AWSAccelerator-CrossAccount-SiteToSiteVpn-Role',
      moveAccountConfig: 'AWSAccelerator-MoveAccountConfigRule-Role',
      tgwPeering: 'AWSAccelerator-TgwPeering-Role',
      madShareAccept: 'AWSAccelerator-MadAccept-Role',
      snsTopicCmkArnParameterAccess: 'AWSAccelerator-SnsTopic-KeyArnParam-Role',
      crossAccountAssetsBucketCmkArnSsmParameterAccess: 'AWSAccelerator-AssetsBucket-KeyArnParam-Role',
      crossAccountServiceCatalogPropagation: 'AWSAccelerator-CrossAccount-ServiceCatalog-Role',
      crossAccountSsmParameterShare: 'AWSAccelerator-CrossAccountSsmParameterShare',
      assetFunctionRoleName: 'AWSAccelerator-AssetsAccessRole',
      firewallConfigFunctionRoleName: 'AWSAccelerator-FirewallConfigAccessRole',
      diagnosticsPackAssumeRoleName: 'AWSAccelerator-DiagnosticsPackAccessRole',
    },
    parameters: {
      importedCentralLogBucketCmkArn: '/accelerator/imported-resources/logging/central-bucket/kms/arn',
      importedAssetBucket: '/accelerator/imported-bucket/assets/s3',
      centralLogBucketCmkArn: '/accelerator/logging/central-bucket/kms/arn',
      controlTowerDriftDetection: '/accelerator/controltower/driftDetected',
      controlTowerLastDriftMessage: '/accelerator/controltower/lastDriftMessage',
      configTableArn: '/accelerator/prepare-stack/configTable/arn',
      configTableName: '/accelerator/prepare-stack/configTable/name',
      cloudTrailBucketName: '/accelerator/organization/security/cloudtrail/log/bucket-name',
      flowLogsDestinationBucketArn: '/accelerator/vpc/flow-logs/destination/bucket/arn',
      metadataBucketArn: '/accelerator/metadata/bucket/arn',
      metadataBucketCmkArn: '/accelerator/kms/metadata/key-arn',
      acceleratorCmkArn: '/accelerator/kms/key-arn',
      ebsDefaultCmkArn: '/accelerator/ebs/default-encryption/key-arn',
      s3CmkArn: '/accelerator/kms/s3/key-arn',
      secretsManagerCmkArn: '/accelerator/kms/secrets-manager/key-arn',
      cloudWatchLogCmkArn: '/accelerator/kms/cloudwatch/key-arn',
      snsTopicCmkArn: '/accelerator/kms/snstopic/key-arn',
      lambdaCmkArn: '/accelerator/kms/lambda/key-arn',
      managementCmkArn: '/accelerator/management/kms/key-arn',
      importedAssetsBucketCmkArn: '/accelerator/imported-resources/imported/assets/kms/key',
      assetsBucketCmkArn: '/accelerator/assets/kms/key',
      identityCenterInstanceArn: '/accelerator/organization/security/identity-center/instance-arn',
      identityStoreId: '/accelerator/organization/security/identity-center/identity-store-id',
      firehoseRecordsProcessorFunctionName: 'AWSAccelerator-FirehoseRecordsProcessor',
      resourceTableName: '/accelerator/prepare-stack/resourceTable/name',
    },
    customerManagedKeys: {
      orgTrailLog: {
        alias: 'alias/accelerator/organizations-cloudtrail/log-group/',
        description: 'CloudTrail Log Group CMK',
      },
      centralLogsBucket: {
        alias: 'alias/accelerator/central-logs/s3',
        description: 'AWS Accelerator Central Logs Bucket CMK',
      },
      s3: {
        alias: 'alias/accelerator/kms/s3/key',
        description: 'AWS Accelerator S3 Kms Key',
      },
      cloudWatchLog: {
        alias: 'alias/accelerator/kms/cloudwatch/key',
        description: 'AWS Accelerator CloudWatch Kms Key',
      },
      cloudWatchLogReplication: {
        alias: 'alias/accelerator/kms/replication/cloudwatch/logs/key',
        description: 'AWS Accelerator CloudWatch Logs Replication Kms Key',
      },
      awsBackup: {
        alias: 'alias/accelerator/kms/backup/key',
        description: 'AWS Accelerator Backup Kms Key',
      },
      sns: {
        alias: 'alias/accelerator/kms/sns/key',
        description: 'AWS Accelerator SNS Kms Key',
      },
      snsTopic: {
        alias: 'alias/accelerator/kms/snstopic/key',
        description: 'AWS Accelerator SNS Topic Kms Key',
      },
      secretsManager: {
        alias: 'alias/accelerator/kms/secrets-manager/key',
        description: 'AWS Accelerator Secrets Manager Kms Key',
      },
      lambda: {
        alias: 'alias/accelerator/kms/lambda/key',
        description: 'AWS Accelerator Lambda Kms Key',
      },
      acceleratorKey: {
        alias: 'alias/accelerator/kms/key',
        description: 'AWS Accelerator Kms Key',
      },
      managementKey: {
        alias: 'alias/accelerator/management/kms/key',
        description: 'AWS Accelerator Management Account Kms Key',
      },
      importedAssetsBucketCmkArn: {
        alias: 'alias/accelerator/imported/assets/kms/key',
        description: 'Key used to encrypt solution assets',
      },
      assetsBucket: {
        alias: 'alias/accelerator/assets/kms/key',
        description: 'Key used to encrypt solution assets',
      },
      ssmKey: {
        alias: 'alias/accelerator/sessionmanager-logs/session',
        description: 'AWS Accelerator Session Manager Session Encryption',
      },
      importedCentralLogsBucket: {
        alias: 'alias/accelerator/imported-bucket/central-logs/s3',
        description: 'AWS Accelerator Imported Central Logs Bucket CMK',
      },
      importedAssetBucket: {
        alias: 'alias/accelerator/imported-bucket/assets/s3',
        description: 'AWS Accelerator Imported Asset Bucket CMK',
      },
      metadataBucket: {
        alias: 'alias/accelerator/kms/metadata/key',
        description: 'The s3 bucket key for accelerator metadata collection',
      },
      ebsDefault: {
        alias: 'alias/accelerator/ebs/default-encryption/key',
        description: 'AWS Accelerator default EBS Volume Encryption key',
      },
    },
    bucketPrefixes: {
      assetsAccessLog: 'aws-accelerator-assets-logs',
      assets: 'aws-accelerator-assets',
      elbLogs: 'aws-accelerator-elb-access-logs',
      firewallConfig: 'aws-accelerator-firewall-config',
      costUsage: 'aws-accelerator-cur',
      s3AccessLogs: 'aws-accelerator-s3-access-logs',
      auditManager: 'aws-accelerator-auditmgr',
      vpcFlowLogs: 'aws-accelerator-vpc',
      metadata: 'aws-accelerator-metadata',
      centralLogs: 'aws-accelerator-central-logs',
    },
  },
  logging: {
    centralizedRegion: 'mockHomeRegion',
    bucketName: 'mock-existing-central-log-bucket',
    bucketKeyArn: 'mockBucketKeyArn',
  },
  organization: {
    Id: 'o-1234567890',
    Arn: 'arn:aws:organizations::123456789012:organization/o-1234567890',
    FeatureSet: 'ALL',
    MasterAccountArn: 'arn:aws:organizations::123456789012:account/o-1234567890/123456789012',
    MasterAccountId: '123456789012',
    MasterAccountEmail: 'test@example.com',
  },
  accounts: [
    {
      Id: '111111111111',
      Arn: 'arn:aws:organizations::111111111111:account/o-exampleorgid/111111111111',
      Email: 'account1@example.com',
      Name: 'Account1',
      Status: 'ACTIVE',
      JoinedMethod: 'CREATED',
      JoinedTimestamp: new Date('2023-01-01'),
    },
    {
      Id: '222222222222',
      Arn: 'arn:aws:organizations::111111111111:account/o-exampleorgid/222222222222',
      Email: 'account2@example.com',
      Name: 'Account2',
      Status: 'ACTIVE',
      JoinedMethod: 'INVITED',
      JoinedTimestamp: new Date('2023-01-02'),
    },
  ],
};

jest.mock('../lib/functions', () => ({
  getManagementAccountCredentials: jest.fn().mockReturnValue(undefined),
  getAcceleratorModuleRunnerParameters: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../accelerator/utils/app-utils', () => ({
  setResourcePrefixes: jest.fn().mockReturnValue(undefined),
}));

describe('ModuleRunner', () => {
  let mockAccountsConfig: Partial<AccountsConfig>;
  let mockModuleRunnerParameters: AcceleratorModuleRunnerParametersType;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAccountsConfig = {
      getManagementAccount: jest.fn().mockReturnValue({ name: 'management', email: 'management@example.com' }),
      getManagementAccountId: jest.fn().mockReturnValue('management'),
      getAuditAccount: jest.fn().mockReturnValue({ name: 'audit', email: 'audit@example.com' }),
      getAuditAccountId: jest.fn().mockReturnValue('audit'),
      getLogArchiveAccount: jest.fn().mockReturnValue({ name: 'mogarchive', email: 'mogarchive@example.com' }),
      getLogArchiveAccountId: jest.fn().mockReturnValue('mogarchive'),
      ...mockAccountsConfiguration,
    };

    mockModuleRunnerParameters = {
      configs: {
        accountsConfig: mockAccountsConfig as AccountsConfig,
        customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
        globalConfig: mockGlobalConfiguration,
        iamConfig: mockIamConfig as IamConfig,
        networkConfig: mockNetworkConfig as NetworkConfig,
        organizationConfig: mockOrganizationConfig as OrganizationConfig,
        replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
        securityConfig: mockSecurityConfig as SecurityConfig,
      },
      resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
      acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
      logging: MOCK_CONSTANTS.logging,
      organizationAccounts: [],
      organizationDetails: undefined,
      managementAccountCredentials: MOCK_CONSTANTS.credentials,
    };

    jest
      .spyOn(require('../lib/functions'), 'getAcceleratorModuleRunnerParameters')
      .mockReturnValue(mockModuleRunnerParameters);
  });

  describe('execute', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return a message when no modules are found for the given stage', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [];

      const result = await ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParams, stage: MOCK_CONSTANTS.invalidStage });

      expect(result).toBe(`No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`);
    });

    test('should return a message when no modules array is empty for the given stage', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        {
          stage: { name: MOCK_CONSTANTS.invalidStage },
          modules: [],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParams,
        stage: MOCK_CONSTANTS.invalidStage,
      });

      expect(result).toBe(`No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`);
    });

    test('should throw an error when multiple entries are found for a stage', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        { stage: { name: MOCK_CONSTANTS.invalidStage } },
        { stage: { name: MOCK_CONSTANTS.invalidStage } },
      ];

      await expect(
        ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParams, stage: MOCK_CONSTANTS.invalidStage }),
      ).rejects.toThrow(
        `Internal error - duplicate entries found for stage ${MOCK_CONSTANTS.invalidStage} in AcceleratorModuleStageDetails`,
      );
    });

    test('should execute PREPARE stage modules and return status', async () => {
      // Setup

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [
            {
              name: AcceleratorModuleNames.CONTROL_TOWER,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
            },
            {
              name: AcceleratorModuleNames.AWS_ORGANIZATIONS,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParams, stage: AcceleratorStage.PREPARE });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should execute PREPARE stage modules and return status when CT landing zone is not available in configuration', async () => {
      //Setup

      mockModuleRunnerParameters = {
        configs: {
          accountsConfig: mockAccountsConfig as AccountsConfig,
          customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
          globalConfig: {
            homeRegion: 'mockHomeRegion',
            controlTower: {
              enable: true,
            } as ControlTowerConfig,
          } as GlobalConfig,
          iamConfig: mockIamConfig as IamConfig,
          networkConfig: mockNetworkConfig as NetworkConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
          securityConfig: mockSecurityConfig as SecurityConfig,
        },
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationAccounts: [],
        organizationDetails: undefined,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      };

      jest
        .spyOn(require('../lib/functions'), 'getAcceleratorModuleRunnerParameters')
        .mockReturnValue(mockModuleRunnerParameters);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [
            {
              name: AcceleratorModuleNames.CONTROL_TOWER,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
            },
            {
              name: AcceleratorModuleNames.AWS_ORGANIZATIONS,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParams, stage: AcceleratorStage.PREPARE });

      expect(result).toBe(
        `Module ${AcceleratorModuleNames.CONTROL_TOWER} execution skipped, No configuration found for Control Tower Landing zone\nModule 2 executed`,
      );
    });

    test('should execute NETWORK_PREP modules and return status', async () => {
      // Setup

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        {
          stage: { name: AcceleratorStage.NETWORK_PREP },
          modules: [
            {
              name: AcceleratorModuleNames.NETWORK,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParams,
        stage: AcceleratorStage.NETWORK_PREP,
      });

      expect(result).toBe('Module 1 executed');
    });

    test('should execute SECURITY modules and return status', async () => {
      // Setup

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        {
          stage: { name: AcceleratorStage.SECURITY },
          modules: [
            {
              name: AcceleratorModuleNames.SECURITY,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParams,
        stage: AcceleratorStage.SECURITY,
      });

      expect(result).toBe('Module 1 executed');
    });

    test('should execute stage modules with parallel module executions and return status', async () => {
      // Setup

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        {
          stage: { name: AcceleratorStage.SECURITY },
          modules: [
            {
              name: AcceleratorModuleNames.SECURITY,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
            },
            {
              name: AcceleratorModuleNames.NETWORK,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParams,
        stage: AcceleratorStage.SECURITY,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should handle and log errors during execution', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lza.AcceleratorModuleStageDetails as any) = [
        {
          stage: { name: MOCK_CONSTANTS.invalidStage },
          modules: [
            {
              name: MOCK_CONSTANTS.invalidModule,
              runOrder: 1,
              handler: jest.fn().mockRejectedValue(new Error('Test error')),
            },
          ],
        },
      ];

      await expect(
        ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParams, stage: MOCK_CONSTANTS.invalidStage }),
      ).rejects.toThrow(`Unknown Module ${MOCK_CONSTANTS.invalidModule}`);
    });
  });
});
