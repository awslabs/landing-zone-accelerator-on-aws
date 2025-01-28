import {
  AccountsConfig,
  AuditManagerConfig,
  AwsConfig,
  AwsConfigAggregation,
  CentralSecurityServicesConfig,
  CloudWatchLogsConfig,
  ControlTowerConfig,
  CustomizationsConfig,
  DetectiveConfig,
  EbsDefaultVolumeEncryptionConfig,
  GlobalConfig,
  GroupSetConfig,
  GuardDutyConfig,
  IamConfig,
  LoggingConfig,
  MacieConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  S3PublicAccessBlockConfig,
  ScpRevertChangesConfig,
  SecurityConfig,
  SecurityHubConfig,
  SsmAutomationConfig,
  UserSetConfig,
} from '@aws-accelerator/config';
import { jest } from '@jest/globals';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { AcceleratorResourcePrefixes } from '../../utils/app-utils';

export function createAcceleratorStackProps(
  props: AcceleratorStackProps | undefined = undefined,
  auditAccountId: string | undefined = undefined,
): AcceleratorStackProps {
  const iamConfig: Partial<IamConfig> = {
    userSets: [new UserSetConfig()],
    groupSets: [new GroupSetConfig()],
    providers: [],
    policySets: [],
    roleSets: [],
  };

  const accountsConfig: Partial<AccountsConfig> = {
    getAccountId: jest.fn(name => '123456789' + name),
    getAccountIds: jest.fn(() => ['123456789', '234567890', '345678901', '456789012']),
    getManagementAccountId: jest.fn(() => '234567890'),
    getLogArchiveAccountId: jest.fn(() => '345678901'),
    getAuditAccountId: jest.fn(() => auditAccountId ?? '456789012'),
    mandatoryAccounts: [],
    workloadAccounts: [],
  };

  const globalConfig: Partial<GlobalConfig> = {
    homeRegion: 'us-east-1',
    controlTower: new ControlTowerConfig(),
    logging: {
      cloudwatchLogs: new CloudWatchLogsConfig(),
      sessionManager: {
        sendToCloudWatchLogs: false,
        sendToS3: false,
      },
      cloudtrail: {
        enable: false,
      },
    } as LoggingConfig,
  };

  const networkConfig: Partial<NetworkConfig> = {
    vpcs: [],
    transitGateways: [],
  };

  const organizationConfig: Partial<OrganizationConfig> = {
    getOrganizationId: jest.fn(() => '1234567890'),
    getOrganizationalUnitArn: jest.fn(ouName => `arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/${ouName}`),
    enable: true,
    backupPolicies: [],
    taggingPolicies: [],
  };

  const centralSecurityServices: CentralSecurityServicesConfig = {
    delegatedAdminAccount: 'Audit',
    auditManager: new AuditManagerConfig(),
    detective: new DetectiveConfig(),
    macie: new MacieConfig(),
    guardduty: new GuardDutyConfig(),
    securityHub: new SecurityHubConfig(),
    ebsDefaultVolumeEncryption: new EbsDefaultVolumeEncryptionConfig(),
    s3PublicAccessBlock: new S3PublicAccessBlockConfig(),
    scpRevertChangesConfig: new ScpRevertChangesConfig(),
    snsSubscriptions: [],
    ssmAutomation: new SsmAutomationConfig(),
  };

  const aggregation = {
    enable: false,
    delegatedAdminAccount: undefined,
  } as unknown as AwsConfigAggregation;

  const securityConfig: Partial<SecurityConfig> = {
    centralSecurityServices: centralSecurityServices,
    accessAnalyzer: {
      enable: false,
    },
    awsConfig: {
      aggregation,
    } as AwsConfig,
  };

  const prefixes: AcceleratorResourcePrefixes = {
    ssmParamName: '/accelerator',
    accelerator: 'unit-test',
    bucketName: 'test-bucket',
    databaseName: '',
    kmsAlias: '',
    repoName: '',
    secretName: '',
    snsTopicName: '',
    importResourcesSsmParamName: '',
    trailLogName: '',
    ssmLogName: '',
  };

  const stackProps: AcceleratorStackProps = {
    globalRegion: 'us-east-1',
    centralizedLoggingRegion: 'us-east-1',
    configDirPath: './',
    partition: 'unit-test',
    configRepositoryName: 'unit-test',
    configRepositoryLocation: 's3',
    isDiagnosticsPackEnabled: 'false',
    pipelineAccountId: '1234567890',
    enableSingleAccountMode: true,
    useExistingRoles: false,
    stackName: 'test-stack-name',
    env: {
      region: 'us-east-1',
      account: '00000001',
    },

    iamConfig: iamConfig as IamConfig,
    accountsConfig: accountsConfig as AccountsConfig,
    globalConfig: globalConfig as GlobalConfig,
    networkConfig: networkConfig as NetworkConfig,
    organizationConfig: organizationConfig as OrganizationConfig,
    securityConfig: securityConfig as SecurityConfig,
    customizationsConfig: {} as CustomizationsConfig,
    replacementsConfig: {} as ReplacementsConfig,
    prefixes: prefixes,

    ...props,
  };

  return stackProps;
}
