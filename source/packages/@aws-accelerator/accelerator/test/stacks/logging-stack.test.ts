import {
  AccountsConfig,
  GlobalConfig,
  LoggingConfig,
  OrganizationConfig,
  NetworkConfig,
  SecurityConfig,
  CustomizationsConfig,
  ReplacementsConfig,
  IamConfig,
} from '@aws-accelerator/config';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { LoggingStack } from '../../lib/stacks/logging-stack';
import { AcceleratorResourcePrefixes } from '../../utils/app-utils';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';

let app: cdk.App;
let loggingStack: LoggingStack;

beforeEach(() => {
  jest.spyOn(LoggingStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  jest.spyOn(LoggingStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');

  app = new cdk.App();
  loggingStack = new LoggingStack(app, 'unit-test-logging-stack', createProps('us-east-1'));
});

afterEach(() => {
  jest.resetAllMocks();
});

function createProps(homeRegion: string): AcceleratorStackProps {
  const mockOrganizationConfig = {
    getOrganizationId: jest.fn().mockImplementation(() => '1234567890'),
  } as unknown as OrganizationConfig;

  const mockAccountsConfig = {
    getAccountId: jest.fn().mockImplementation(() => '100000'),
    getAccountIds: jest.fn().mockImplementation(() => ['100000']),
    getManagementAccountId: jest.fn().mockImplementation(() => '200000'),
    getLogArchiveAccountId: jest.fn().mockImplementation(() => '300000'),
    getAuditAccountId: jest.fn().mockImplementation(() => '400000'),
    mandatoryAccounts: [],
    workloadAccounts: [],
  } as unknown as AccountsConfig;

  const mockNetworkConfig = {
    vpcs: [],
  } as unknown as NetworkConfig;

  const mockLoggingConfig = {
    vpcs: [],
  } as unknown as LoggingConfig;

  const mockIAMConfig = {
    vpcs: [],
  } as unknown as IamConfig;

  const mockSecurityConfig = {
    centralSecurityServices: {
      ebsDefaultVolumeEncryption: {
        enable: false,
      },
      s3PublicAccessBlock: {
        enable: false,
        excludeAccounts: [],
      },
    },
  } as unknown as SecurityConfig;

  const props: AcceleratorStackProps = {
    accountsConfig: mockAccountsConfig,
    configDirPath: '../configs',
    globalConfig: {
      logging: mockLoggingConfig,
      homeRegion: homeRegion,
    } as GlobalConfig,
    networkConfig: mockNetworkConfig,
    organizationConfig: mockOrganizationConfig,
    securityConfig: mockSecurityConfig,
    customizationsConfig: {} as CustomizationsConfig,
    replacementsConfig: {} as ReplacementsConfig,
    partition: 'unit-test',
    configRepositoryName: 'unit-test',
    configRepositoryLocation: 's3',
    globalRegion: 'us-east-1',
    centralizedLoggingRegion: 'us-east-1',
    prefixes: {
      ssmParamName: '/accelerator',
    } as AcceleratorResourcePrefixes,
    enableSingleAccountMode: true,
    useExistingRoles: false,
    isDiagnosticsPackEnabled: 'false',
    pipelineAccountId: '1234567890',

    env: {
      region: 'us-east-1',
      account: '100000',
    },
    iamConfig: mockIAMConfig,
  };

  return props;
}

describe('normalizeExtension', () => {
  test('should return undefined when input is undefined', () => {
    const result = loggingStack['normalizeExtension'](undefined);
    expect(result).toBeUndefined();
  });

  test('should add dot prefix when extension does not start with dot', () => {
    const result = loggingStack['normalizeExtension']('txt');
    expect(result).toBe('.txt');
  });

  test('should not modify extension that already starts with dot', () => {
    const result = loggingStack['normalizeExtension']('.pdf');
    expect(result).toBe('.pdf');
  });
});
