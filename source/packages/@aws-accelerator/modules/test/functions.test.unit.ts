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
import { beforeEach, describe, expect, test } from '@jest/globals';
import {
  getAcceleratorModuleRunnerParameters,
  getCentralLogBucketName,
  getCentralLogsBucketKeyArn,
  getManagementAccountCredentials,
  getOrganizationAccounts,
  getOrganizationDetails,
  scriptUsage,
  validateAndGetRunnerParameters,
} from '../lib/functions';
import { version } from '../../../../package.json';
import {
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import { ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import {
  AccountConfig,
  AccountsConfig,
  CentralSecurityServicesConfig,
  CloudWatchLogsConfig,
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
import { AcceleratorConfigurationsType } from '../lib/libraries/lza';
import { ConfigLoader } from '../lib/config-loader';

//
// Mock values
//
const mockLzaLoggingBucketGlobalConfig = {
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
    centralizedLoggingRegion: 'us-east-1',
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
    customDeploymentRole: 'mockCustomDeploymentRole',
  } as unknown,
} as GlobalConfig;

const mockImportedLoggingBucketGlobalConfig = {
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
    centralLogBucket: {
      importedBucket: { name: 'mock-existing-central-log-bucket', createAcceleratorManagedKey: true },
    },
  } as LoggingConfig,
  cdkOptions: {
    centralizeBuckets: true,
    useManagementAccessRole: true,
  },
} as GlobalConfig;

const mockAccountsConfigurations: Partial<AccountsConfig> = {
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
  // Common
  globalRegion: 'mockGlobalRegion',
  solutionId: 'mockSolutionId',
  partition: 'mockPartition',
  region: 'us-east-1',
  centralizedLoggingRegion: 'us-east-1',

  managementAccountId: 'mockManagementAccountId',
  managementAccountRoleName: 'mockManagementAccountRole',

  // getManagementAccountCredentials
  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
    expiration: new Date('2024-12-31'),
  },

  // validateConfigDirPath
  configDirPath: '/path/to/config',
  mandatoryConfigFiles: [
    'accounts-config.yaml',
    'global-config.yaml',
    'iam-config.yaml',
    'network-config.yaml',
    'organization-config.yaml',
    'security-config.yaml',
  ],

  // getOrganizationDetails
  organization: {
    Id: 'o-1234567890',
    Arn: 'arn:aws:organizations::123456789012:organization/o-1234567890',
    FeatureSet: 'ALL',
    MasterAccountArn: 'arn:aws:organizations::123456789012:account/o-1234567890/123456789012',
    MasterAccountId: '123456789012',
    MasterAccountEmail: 'test@example.com',
  },

  // getOrganizationAccounts
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
  logging: {
    centralizedRegion: 'mockHomeRegion',
    bucketName: 'mock-existing-central-log-bucket',
    bucketKeyArn: 'mockBucketKeyArn',
  },
  centralLogBucketCmkSsmParameter: {
    Name: 'mockName',
    Type: 'String',
    Value: 'mockBucketKeyArn',
    Version: 1,
    LastModifiedDate: new Date(),
  },
  mockAcceleratorEnvironmentDetails: {
    accountId: 'mockAccountId',
    accountName: 'mockAccountName',
    region: 'mockRegion',
  },
  organizationAccounts: [{ accountId: 'mockAccountId', name: 'mock-account' }],
  logArchiveAccount: {
    name: 'Log-Archive',
    email: 'log-archive@example.com',
    organizationalUnit: 'Security',
  },
};

const mockYargs = {
  options: jest.fn().mockReturnThis(),
  parseSync: jest.fn(),
};

jest.mock('@aws-sdk/client-organizations', () => ({
  ...jest.requireActual('@aws-sdk/client-organizations'),
  paginateListAccounts: jest.fn(),
  OrganizationsClient: jest.fn(),
  DescribeOrganizationCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
    }),
  })),
  GetParameterCommand: jest.fn(),
  ParameterNotFound: class ParameterNotFound extends Error {
    constructor() {
      super('Parameter not found');
      this.name = 'ParameterNotFound';
    }
  },
}));

jest.mock('yargs', () => ({
  __esModule: true,
  default: () => mockYargs,
}));

jest.mock('../../../@aws-lza/common/functions', () => ({
  getCredentials: jest.fn(),
  setRetryStrategy: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../../@aws-lza/common/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn().mockReturnValue(undefined),
    warn: jest.fn().mockReturnValue(undefined),
    error: jest.fn().mockReturnValue(undefined),
  }),
}));

describe('functions', () => {
  describe('validateAndGetRunnerParameters', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockYargs.options.mockReturnValue(mockYargs);
    });

    describe('required parameters validation', () => {
      test('should throw error when partition is missing', () => {
        mockYargs.parseSync.mockReturnValue({
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
        });

        expect(() => validateAndGetRunnerParameters()).toThrow(
          `Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`,
        );
      });

      test('should throw error when region is missing', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
        });

        expect(() => validateAndGetRunnerParameters()).toThrow(
          `Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`,
        );
      });

      test('should throw error when config-dir is missing', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          stage: 'pipeline',
        });

        expect(() => validateAndGetRunnerParameters()).toThrow(
          `Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`,
        );
      });

      test('should throw error when stage is missing', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
        });

        expect(() => validateAndGetRunnerParameters()).toThrow(
          `Missing required parameters for lza module \n ** Script Usage ** ${scriptUsage}`,
        );
      });
    });

    describe('use-existing-role parameter', () => {
      test('should set useExistingRole to false when parameter is not provided', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.useExistingRole).toBe(false);
      });

      test('should set useExistingRole to true when parameter is "yes"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
          'use-existing-role': 'yes',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.useExistingRole).toBe(true);
      });

      test('should set useExistingRole to false when parameter is "no"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
          'use-existing-role': 'no',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.useExistingRole).toBe(false);
      });
    });

    describe('dry-run parameter', () => {
      test('should set dryRun to false when parameter is not provided', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.dryRun).toBe(false);
      });

      test('should set dryRun to true when parameter is "yes"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
          'dry-run': 'yes',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.dryRun).toBe(true);
      });

      test('should set dryRun to false when parameter is "no"', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
          'dry-run': 'no',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.dryRun).toBe(false);
      });
    });

    describe('return object', () => {
      test('should return object with all parameters including defaults', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
        });

        const result = validateAndGetRunnerParameters();

        expect(result).toEqual({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          configDirPath: MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
          prefix: 'AWSAccelerator',
          useExistingRole: false,
          solutionId: `AwsSolution/SO0199/${version}`,
          dryRun: false,
        });
      });

      test('should use provided prefix when available', () => {
        mockYargs.parseSync.mockReturnValue({
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          'config-dir': MOCK_CONSTANTS.configDirPath,
          stage: 'pipeline',
          prefix: 'CustomPrefix',
        });

        const result = validateAndGetRunnerParameters();
        expect(result.prefix).toBe('CustomPrefix');
      });
    });
  });

  describe('getManagementAccountCredentials', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      delete process.env['MANAGEMENT_ACCOUNT_ID'];
      delete process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'];
    });

    test('should return undefined when environment variables are not set', async () => {
      // Verify

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      expect(result).toBeUndefined();
    });

    test('should return credentials when environment variables are properly set', async () => {
      // Setup

      process.env['MANAGEMENT_ACCOUNT_ID'] = MOCK_CONSTANTS.managementAccountId;
      process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'] = MOCK_CONSTANTS.managementAccountRoleName;

      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
    });

    test('should handle partial environment variable configuration', async () => {
      // Setup

      process.env['MANAGEMENT_ACCOUNT_ID'] = MOCK_CONSTANTS.managementAccountId;

      // Execute

      const result = await getManagementAccountCredentials(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
      );

      // Verify

      expect(result).toBeUndefined();
    });
  });

  describe('getOrganizationAccounts', () => {
    test('should return organization accounts when no credentials provided', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.accounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: undefined,
        }),
      );
      expect(paginateListAccounts).toHaveBeenCalledWith({ client: expect.any(Object) }, {});
    });

    test('should return organization accounts with management account credentials', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.accounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should return organization accounts with management account credentials', async () => {
      // Setup

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.accounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
      expect(OrganizationsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.globalRegion,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should handle empty accounts list', async () => {
      // Setup

      const mockPaginator = [{ Accounts: [] }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual([]);
    });

    test('should handle multiple pages of accounts', async () => {
      // Setup

      const mockPaginator = [{ Accounts: [MOCK_CONSTANTS.accounts[0]] }, { Accounts: [MOCK_CONSTANTS.accounts[1]] }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
    });

    test('should handle undefined Accounts in response', async () => {
      // Setup

      const mockPaginator = [{ Accounts: undefined }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      // Execute

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual([]);
    });
  });

  describe('getOrganizationDetails', () => {
    const mockSend = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
    });

    test('should return organization details when successful', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({
        Organization: MOCK_CONSTANTS.credentials,
      });

      // Execute

      const result = await getOrganizationDetails(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(DescribeOrganizationCommand));
      expect(OrganizationsClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.globalRegion,
        customUserAgent: MOCK_CONSTANTS.solutionId,
        retryStrategy: undefined,
        credentials: MOCK_CONSTANTS.credentials,
      });
    });

    test('should throw error when Organization is not returned', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({});

      // Verify

      await expect(
        getOrganizationDetails(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId, MOCK_CONSTANTS.credentials),
      ).rejects.toThrow("Aws Organization couldn't fetch organizations details");

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should return undefined when Organizations is not in use', async () => {
      // Setup

      mockSend.mockRejectedValueOnce(
        new AWSOrganizationsNotInUseException({
          message: 'AWS Organizations is not in use',
          $metadata: {},
        }),
      );

      // Execute

      const result = await getOrganizationDetails(
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify

      expect(result).toBeUndefined();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error for other exceptions', async () => {
      // Setup

      const mockError = new Error('Some other error');
      mockSend.mockRejectedValueOnce(mockError);

      // Verify

      await expect(
        getOrganizationDetails(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId, MOCK_CONSTANTS.credentials),
      ).rejects.toThrow(mockError);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should work without credentials parameter', async () => {
      // Setup

      mockSend.mockResolvedValueOnce({
        Organization: MOCK_CONSTANTS.credentials,
      });

      // Execute

      const result = await getOrganizationDetails(MOCK_CONSTANTS.globalRegion, MOCK_CONSTANTS.solutionId);

      // Verify

      expect(result).toEqual(MOCK_CONSTANTS.credentials);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(OrganizationsClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.globalRegion,
        customUserAgent: MOCK_CONSTANTS.solutionId,
        retryStrategy: undefined,
        credentials: undefined,
      });
    });
  });

  describe('getCentralLogsBucketKeyArn', () => {
    const mockSend = jest.fn();
    let ssmMockClient: SSMClient;
    let mockAccountsConfig: Partial<AccountsConfig>;

    beforeEach(() => {
      jest.clearAllMocks();
      (SSMClient as jest.Mock).mockImplementation(() => ({
        send: mockSend,
      }));
      ssmMockClient = new SSMClient({});
      mockAccountsConfig = {
        getLogArchiveAccount: jest.fn().mockReturnValue({ name: 'logarchive', email: 'logarchive@example.com' }),
        getLogArchiveAccountId: jest.fn().mockReturnValue('logarchive'),
        ...mockAccountsConfigurations,
      };
    });

    test('should return CMK ARN when parameter exists', async () => {
      // Setup
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      // Execute
      const result = await getCentralLogsBucketKeyArn(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.centralizedLoggingRegion,
        MOCK_CONSTANTS.acceleratorResourceNames,
        mockLzaLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.centralLogBucketCmkSsmParameter.Value);
      expect(SSMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.region,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should use imported bucket parameter name when createAcceleratorManagedKey is true', async () => {
      // Setup
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      // Execute
      const result = await getCentralLogsBucketKeyArn(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.centralizedLoggingRegion,
        MOCK_CONSTANTS.acceleratorResourceNames,
        mockImportedLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.centralLogBucketCmkSsmParameter.Value);
      expect(SSMClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: MOCK_CONSTANTS.region,
          customUserAgent: MOCK_CONSTANTS.solutionId,
          credentials: MOCK_CONSTANTS.credentials,
        }),
      );
    });

    test('should return undefined when parameter is not found', async () => {
      // Setup
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      mockSend.mockRejectedValueOnce(
        new ParameterNotFound({
          message: 'Parameter not found',
          $metadata: {},
        }),
      );

      // Execute
      const result = await getCentralLogsBucketKeyArn(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.centralizedLoggingRegion,
        MOCK_CONSTANTS.acceleratorResourceNames,
        mockImportedLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBeUndefined();
    });

    test('should throw error for other exceptions', async () => {
      // Setup
      const mockError = new Error('Some other error');
      jest
        .spyOn(require('../../../@aws-lza/common/functions'), 'getCredentials')
        .mockResolvedValue(MOCK_CONSTANTS.credentials);

      mockSend.mockRejectedValueOnce(mockError);

      // Execute & Verify
      await expect(
        getCentralLogsBucketKeyArn(
          MOCK_CONSTANTS.partition,
          MOCK_CONSTANTS.solutionId,
          MOCK_CONSTANTS.centralizedLoggingRegion,
          MOCK_CONSTANTS.acceleratorResourceNames,
          mockImportedLoggingBucketGlobalConfig as GlobalConfig,
          mockAccountsConfig as AccountsConfig,
          MOCK_CONSTANTS.credentials,
        ),
      ).rejects.toThrow(mockError);
    });
  });

  describe('getCentralLogBucketName', () => {
    let mockAccountsConfig: Partial<AccountsConfig>;
    beforeEach(() => {
      jest.clearAllMocks();
      mockAccountsConfig = {
        getLogArchiveAccount: jest.fn().mockReturnValue({ name: 'logarchive', email: 'logarchive@example.com' }),
        getLogArchiveAccountId: jest.fn().mockReturnValue('logarchive'),
        ...mockAccountsConfigurations,
      };
    });
    test('should return imported bucket name when provided', () => {
      // Execute
      const result = getCentralLogBucketName(
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.acceleratorResourceNames,
        MOCK_CONSTANTS.mockAcceleratorEnvironmentDetails,
        mockImportedLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
      );

      // Verify
      expect(result).toBe(mockImportedLoggingBucketGlobalConfig.logging.centralLogBucket?.importedBucket?.name);
    });

    test('should return generated bucket name when no imported bucket is provided', () => {
      // Execute
      const result = getCentralLogBucketName(
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.acceleratorResourceNames,
        MOCK_CONSTANTS.mockAcceleratorEnvironmentDetails,
        mockLzaLoggingBucketGlobalConfig as GlobalConfig,
        mockAccountsConfig as AccountsConfig,
      );

      // Verify
      expect(result).toBe(`aws-accelerator-central-logs-logarchive-${MOCK_CONSTANTS.region}`);
    });
  });

  describe('getAcceleratorModuleRunnerParameters', () => {
    const mockSsmSend = jest.fn();
    const mockOrgSend = jest.fn();
    let ssmMockClient: SSMClient;
    let orgMockClient: OrganizationsClient;
    let mockAccountsConfig: Partial<AccountsConfig>;
    let configs: AcceleratorConfigurationsType;

    beforeEach(() => {
      jest.clearAllMocks();

      (OrganizationsClient as jest.Mock).mockImplementation(() => ({
        send: mockOrgSend,
      }));

      (SSMClient as jest.Mock).mockImplementation(() => ({
        send: mockSsmSend,
      }));

      ssmMockClient = new SSMClient({});
      orgMockClient = new OrganizationsClient({});

      mockAccountsConfig = {
        getLogArchiveAccount: jest.fn().mockReturnValue({ name: 'logarchive', email: 'logarchive@example.com' }),
        getLogArchiveAccountId: jest.fn().mockReturnValue('logarchive'),
        ...mockAccountsConfigurations,
      };

      const mockPaginator = [{ Accounts: MOCK_CONSTANTS.accounts }];
      (paginateListAccounts as jest.Mock).mockImplementation(() => mockPaginator);

      (ssmMockClient.send as jest.Mock).mockReturnValue({
        Parameter: MOCK_CONSTANTS.centralLogBucketCmkSsmParameter,
      });

      (orgMockClient.send as jest.Mock).mockReturnValue({
        Organization: MOCK_CONSTANTS.organization,
      });

      configs = {
        accountsConfig: mockAccountsConfig as AccountsConfig,
        customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
        globalConfig: mockImportedLoggingBucketGlobalConfig,
        iamConfig: mockIamConfig as IamConfig,
        networkConfig: mockNetworkConfig as NetworkConfig,
        organizationConfig: mockOrganizationConfig as OrganizationConfig,
        replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
        securityConfig: mockSecurityConfig as SecurityConfig,
      };

      jest.spyOn(ConfigLoader, 'getAcceleratorConfigurations').mockResolvedValue(configs);
    });

    test('should return correct parameters when organization is enabled', async () => {
      // Execute
      const result = await getAcceleratorModuleRunnerParameters(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toEqual({
        configs: configs,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationAccounts: MOCK_CONSTANTS.accounts,
        organizationDetails: MOCK_CONSTANTS.organization,
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      });

      expect(ConfigLoader.getAcceleratorConfigurations).toHaveBeenCalledWith(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.credentials,
      );
    });

    test('should return correct parameters when centralized logging region is enabled', async () => {
      //Setup
      configs = {
        accountsConfig: mockAccountsConfig as AccountsConfig,
        customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
        globalConfig: mockLzaLoggingBucketGlobalConfig,
        iamConfig: mockIamConfig as IamConfig,
        networkConfig: mockNetworkConfig as NetworkConfig,
        organizationConfig: mockOrganizationConfig as OrganizationConfig,
        replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
        securityConfig: mockSecurityConfig as SecurityConfig,
      };

      jest.spyOn(ConfigLoader, 'getAcceleratorConfigurations').mockResolvedValue(configs);

      // Execute
      const result = await getAcceleratorModuleRunnerParameters(
        MOCK_CONSTANTS.configDirPath,
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.resourcePrefixes,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      // Verify
      expect(result).toBeDefined();
    });

    test('should return error when organization is not enabled but organization is enabled in configuration', async () => {
      // Setup
      const errorMessage =
        'AWS Organizations not configured but organization is enabled in organization-config.yaml file !!!';

      mockOrgSend.mockRejectedValueOnce(
        new AWSOrganizationsNotInUseException({
          message: errorMessage,
          $metadata: {},
        }),
      );

      // Execute & Verify
      await expect(
        getAcceleratorModuleRunnerParameters(
          MOCK_CONSTANTS.configDirPath,
          MOCK_CONSTANTS.partition,
          MOCK_CONSTANTS.resourcePrefixes,
          MOCK_CONSTANTS.solutionId,
          MOCK_CONSTANTS.credentials,
        ),
      ).rejects.toThrow(new Error(errorMessage));
    });
  });
});
