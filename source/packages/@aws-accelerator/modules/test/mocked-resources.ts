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

import {
  AccountConfig,
  AccountsConfig,
  CentralSecurityServicesConfig,
  CloudWatchLogsConfig,
  CustomizationsConfig,
  DefaultVpcsConfig,
  GlobalConfig,
  IamConfig,
  ISecurityHubConfig,
  LoggingConfig,
  NetworkConfig,
  OrganizationalUnitConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { Account, Organization } from '@aws-sdk/client-organizations';

const mockSecurityHubConfig: ISecurityHubConfig = {
  enable: true,
  regionAggregation: false,
  snsTopicName: undefined,
  notificationLevel: undefined,
  excludeRegions: [],
  deploymentTargets: undefined,
  autoEnableOrgMembers: undefined,
  standards: [],
  logging: undefined,
};

export const mockLzaLoggingBucketGlobalConfig = {
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
    centralizedLoggingRegion: 'mockRegion',
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

export const mockImportedLoggingBucketGlobalConfig = {
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

export const mockGlobalConfiguration = {
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

export const mockGlobalConfigurationWithOutLandingZone = {
  homeRegion: 'mockHomeRegion',
  controlTower: {
    enable: true,
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

export const mockAccountsConfiguration: Partial<AccountsConfig> = {
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

export const mockCustomizationsConfig: Partial<CustomizationsConfig> = {
  customizations: { cloudFormationStacks: [], cloudFormationStackSets: [], serviceCatalogPortfolios: [] },
  applications: [],
  firewalls: undefined,
  getCustomStacks: jest.fn().mockReturnValue(undefined),
  getAppStacks: jest.fn().mockReturnValue(undefined),
};

export const mockIamConfig: Partial<IamConfig> = {
  providers: [],
  policySets: [],
  roleSets: [],
  groupSets: [],
  userSets: [],
};

export const mockNetworkConfig: Partial<NetworkConfig> = {
  defaultVpc: {
    delete: false,
  } as DefaultVpcsConfig,
  transitGateways: [],
  endpointPolicies: [],
  vpcs: [],
};

export const mockOrganizationConfig: Partial<OrganizationConfig> = {
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

export const mockReplacementsConfig: Partial<ReplacementsConfig> = {
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

export const mockSecurityConfig: Partial<SecurityConfig> = {
  centralSecurityServices: {
    delegatedAdminAccount: 'Audit',
    securityHub: mockSecurityHubConfig,
  } as CentralSecurityServicesConfig,
};

export const mockSecurityConfigWithoutSecurityHub: Partial<SecurityConfig> = {
  centralSecurityServices: {
    delegatedAdminAccount: 'Audit',
    securityHub: {
      enable: false,
    },
  } as CentralSecurityServicesConfig,
};

export const MOCK_CONSTANTS = {
  mandatoryConfigFiles: [
    'accounts-config.yaml',
    'global-config.yaml',
    'iam-config.yaml',
    'network-config.yaml',
    'organization-config.yaml',
    'security-config.yaml',
  ],
  centralLogBucketCmkSsmParameter: {
    Name: 'test-parameter',
    Type: 'String',
    Value: 'mockBucketKeyArn',
    Version: 1,
    LastModifiedDate: new Date(),
  },
  homeRegion: 'us-west-2',
  centralizedLoggingRegion: 'mockRegion',
  accountIds: ['111111111111', '222222222222'],
  orgEnabled: true,
  enableSingleAccountMode: false,
  importedBucketName: 'mockImportedBucketName',
  cdkOptions: { customDeploymentRole: 'customDeploymentRole' },
  managementAccountAccessRole: 'mockManagementAccountAccessRole',
  globalRegion: 'mockGlobalRegion',
  invalidStage: 'mockStage',
  invalidModule: 'mockModule',
  runnerParameters: {
    partition: 'mockPartition',
    region: 'mockRegion',
    prefix: 'mockPrefix',
    configDirPath: '/path/to/config',
    useExistingRole: false,
    solutionId: 'mockSolutionId',
    dryRun: false,
  },
  configs: {
    customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
    iamConfig: mockIamConfig as IamConfig,
    networkConfig: mockNetworkConfig as NetworkConfig,
    organizationConfig: mockOrganizationConfig as OrganizationConfig,
    replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
    securityConfig: mockSecurityConfig as SecurityConfig,
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
      sqsCmkArn: '/accelerator/kms/sqs/key-arn',
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
      sqs: {
        alias: 'alias/accelerator/kms/sqs/key',
        description: 'AWS Accelerator SQS Kms Key',
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
  organizationDetails: {
    Id: 'o-1234567890',
    Arn: 'arn:aws:organizations::123456789012:organization/o-1234567890',
    FeatureSet: 'ALL',
    MasterAccountArn: 'arn:aws:organizations::123456789012:account/o-1234567890/123456789012',
    MasterAccountId: '123456789012',
    MasterAccountEmail: 'test@example.com',
  } as Organization,
  organizationAccounts: [
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
  ] as Account[],
  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
    expiration: new Date('2024-12-31'),
  },
  managementAccount: { name: 'management', email: 'management@example.com' },
  auditAccount: { name: 'audit', email: 'audit@example.com' },
  logArchiveAccount: { name: 'logArchive', email: 'logArchive@example.com' },
  includedRegions: ['mockRegion1', 'mockRegion2'],
  managementAccountId: 'mockManagementAccountID',
  auditAccountId: 'mockAuditAccountID',
  logArchiveAccountId: 'mockLogArchiveAccountID',

  unknownError: new Error('Unknown command'),

  acceleratorEnvironmentDetails: {
    accountId: 'mockAccountId',
    accountName: 'mockAccountName',
    region: 'mockRegion',
  },

  enabledRegions: ['mockRegion1', 'mockRegion2', 'mockRegion3'],
  excludedRegions: ['mockRegion1', 'mockRegion2'],
};
