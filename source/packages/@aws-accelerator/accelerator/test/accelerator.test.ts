import { describe, beforeEach, afterEach, expect, test, jest } from '@jest/globals';
import { getCentralLogBucketKmsKeyArn, AcceleratorProps, Accelerator } from '../lib/accelerator';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { AccountsConfig, CustomizationsConfig, GlobalConfig, OrganizationConfig } from '@aws-accelerator/config';
import { AcceleratorToolkit, AcceleratorToolkitProps } from '../lib/toolkit';
import fs, { PathLike } from 'fs';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { shouldLookupDynamoDb } from '../lib/accelerator';

jest.mock('uuid', () => ({ v4: () => '123456789' }));
let stsMock: AwsClientStub<STSClient>;
let ssmMock: AwsClientStub<SSMClient>;

const fakeGlobalConfig = new GlobalConfig(
  {
    homeRegion: 'eu-central-1',
    controlTower: { enable: true },
    managementAccountAccessRole: 'fake-role',
  },
  {
    homeRegion: 'eu-central-1',
    enabledRegions: ['eu-central-1', 'us-east-1', 'us-east-2'],
    managementAccountAccessRole: 'fake-role',
    cloudwatchLogRetentionInDays: 1,
    controlTower: {
      enable: true,
    },
    logging: {
      account: 'log@example.com',
      centralizedLoggingRegion: 'eu-central-1',
      cloudtrail: {
        enable: true,
        organizationTrail: true,
      },
      sessionManager: {
        sendToCloudWatchLogs: true,
        sendToS3: true,
      },
    },
  },
);

const fakeAccountsConfig = new AccountsConfig({
  managementAccountEmail: 'mangement@example.com',
  logArchiveAccountEmail: 'log@example.com',
  auditAccountEmail: 'audit@example.com',
});

fakeAccountsConfig.accountIds = [
  { email: 'mangement@example.com', accountId: '11111111', orgsApiResponse: {} },
  { email: 'log@example.com', accountId: '22222222', orgsApiResponse: {} },
  { email: 'audit@example.com', accountId: '33333333', orgsApiResponse: {} },
];

const fakeCustomizationConfig = new CustomizationsConfig({
  customizations: {
    cloudFormationStacks: [
      {
        deploymentTargets: {
          organizationalUnits: ['Management'],
        },
        name: 'Custom-StackA',
        regions: ['eu-central-1', 'us-east-1', 'us-east-2'],
        runOrder: 1,
        template: 'fake-template',
        terminationProtection: false,
      },
    ],
    cloudFormationStackSets: [],
    serviceCatalogPortfolios: [],
  },
  applications: [
    {
      name: 'app-A',
      vpc: 'fake-vpc',
      deploymentTargets: {
        organizationalUnits: ['Management'],
      },
    },
  ],
});

const runPropsTemplate: AcceleratorToolkitProps = {
  app: undefined,
  caBundlePath: undefined,
  cdkOptions: {
    centralizeBuckets: true,
    customDeploymentRole: undefined,
    deploymentMethod: undefined,
    forceBootstrap: undefined,
    skipStaticValidation: undefined,
    useManagementAccessRole: true,
  },
  centralLogsBucketKmsKeyArn: undefined,
  centralizeCdkBootstrap: undefined,
  command: 'deploy',
  configDirPath: '',
  managementAccountId: '111111111111',
  enableSingleAccountMode: false,
  partition: 'aws',
  proxyAddress: undefined,
  stackPrefix: 'AWSAccelerator',
  stage: 'network-prep',
  useExistingRoles: false,
};

describe('getCentralLogBucketKmsKeyArn', () => {
  beforeEach(() => {
    stsMock = mockClient(STSClient);
    ssmMock = mockClient(SSMClient);
  });
  afterEach(() => {
    stsMock.reset();
    ssmMock.reset();
  });
  test('should return the correct KMS key ARN cross account', async () => {
    // Given - logArchive account is 333333333333
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '111111111111',
    });
    // Assume role in logArchive account
    stsMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'fake-access-key',
        SecretAccessKey: 'fake-secret-key',
        SessionToken: 'fake-session-token',
        Expiration: new Date(Date.now() + 3600 * 1000),
      },
    });
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'fake-arn' } });
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      true,
    );
    // Then
    expect(result).toEqual('fake-arn');
  });
  test('orgs disabled', async () => {
    // Given - logArchive account is 333333333333
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      false,
    );
    // Then
    expect(result).toEqual('123456789');
  });
  test('should return the correct KMS key ARN same account', async () => {
    // Given - logArchive account is 333333333333
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '333333333333',
    });
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'fake-arn' } });
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      true,
    );
    // Then
    expect(result).toEqual('fake-arn');
  });
  test('should return the UUID on error', async () => {
    // Given - logArchive account is 333333333333
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '333333333333',
    });
    ssmMock.on(GetParameterCommand).rejects({});
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      true,
    );
    // Then
    expect(result).toEqual('123456789');
  });
});

describe('Accelerator.run', () => {
  let executeSpy: jest.SpiedFunction<typeof AcceleratorToolkit.execute>;
  const accountIds = fakeAccountsConfig.accountIds?.map(i => i.accountId) ?? [];

  const deployStageActions = [
    AcceleratorStage.NETWORK_PREP,
    AcceleratorStage.SECURITY,
    AcceleratorStage.OPERATIONS,
    AcceleratorStage.NETWORK_VPC,
    AcceleratorStage.SECURITY_RESOURCES,
    AcceleratorStage.NETWORK_ASSOCIATIONS,
    AcceleratorStage.CUSTOMIZATIONS,
  ];

  beforeEach(() => {
    stsMock = mockClient(STSClient);
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '111111111111',
    });
    jest.spyOn(GlobalConfig, 'loadRawGlobalConfig').mockReturnValue(fakeGlobalConfig);

    jest.spyOn(AccountsConfig, 'load').mockReturnValue(fakeAccountsConfig);

    jest.spyOn(OrganizationConfig, 'loadRawOrganizationsConfig').mockReturnValue(new OrganizationConfig());
    jest.spyOn(OrganizationConfig, 'load').mockReturnValue(new OrganizationConfig());

    jest.spyOn(AccountsConfig.prototype, 'loadAccountIds').mockResolvedValue();

    jest.spyOn(CustomizationsConfig, 'load').mockReturnValue(fakeCustomizationConfig);

    jest
      .spyOn(fs, 'existsSync')
      .mockImplementation((path: PathLike) => path.toString() === 'customizations-config.yaml');

    executeSpy = jest.spyOn(AcceleratorToolkit, 'execute').mockResolvedValue();
  });

  afterEach(() => {
    stsMock.reset();
    jest.resetAllMocks();
    executeSpy.mockRestore();
  });

  test('Deploy to given region only', async () => {
    const region = 'eu-central-1';

    const props: AcceleratorProps = {
      command: 'deploy',
      configDirPath: '',
      stage: 'network-prep',
      region,
      partition: 'aws',
      enableSingleAccountMode: false,
    };

    const callHistory = [];
    for (const accountId of accountIds) {
      const callProps = {
        ...runPropsTemplate,
        accountId,
        region,
      };

      // Add assumeRoleName for non-management accounts
      if (accountId !== '11111111') {
        callProps.assumeRoleName = 'fake-role';
      }

      callHistory.push(callProps);
    }

    await Accelerator.run(props);

    expect(executeSpy).toHaveBeenCalledTimes(callHistory.length);

    callHistory.forEach(h => expect(executeSpy).toHaveBeenCalledWith(h));
  });

  it.each(deployStageActions)('%s should only deploy into given region', async stage => {
    const region = 'eu-central-1';

    const props: AcceleratorProps = {
      command: 'deploy',
      configDirPath: '',
      stage: stage.valueOf(),
      region,
      partition: 'aws',
      enableSingleAccountMode: false,
    };

    await Accelerator.run(props);

    const deployRegions = executeSpy.mock.calls.flatMap(c => c[0]).map(c => c.region!);

    deployRegions.forEach(r => expect(r).toBe(region));
  });

  it.each(deployStageActions)('%s should deploy into all regions', async stage => {
    const props: AcceleratorProps = {
      command: 'deploy',
      configDirPath: '',
      stage: stage.valueOf(),
      partition: 'aws',
      enableSingleAccountMode: false,
    };

    await Accelerator.run(props);

    const deployRegions = executeSpy.mock.calls.flatMap(c => c[0]).map(c => c.region!);

    fakeGlobalConfig.enabledRegions.forEach(r => expect(deployRegions).toContain(r));
  });
});

describe('shouldLookupDynamoDb', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return false when stage is undefined', () => {
    expect(shouldLookupDynamoDb()).toBe(false);
  });

  it('should return false when ACCELERATOR_SKIP_DYNAMODB_LOOKUP is true', () => {
    process.env['ACCELERATOR_SKIP_DYNAMODB_LOOKUP'] = 'true';
    expect(shouldLookupDynamoDb(AcceleratorStage.NETWORK_ASSOCIATIONS)).toBe(false);
  });

  it('should return false for excluded stages', () => {
    expect(shouldLookupDynamoDb(AcceleratorStage.PREPARE)).toBe(false);
    expect(shouldLookupDynamoDb(AcceleratorStage.ACCOUNTS)).toBe(false);
    expect(shouldLookupDynamoDb(AcceleratorStage.PIPELINE)).toBe(false);
    expect(shouldLookupDynamoDb(AcceleratorStage.TESTER_PIPELINE)).toBe(false);
    expect(shouldLookupDynamoDb(AcceleratorStage.DIAGNOSTICS_PACK)).toBe(false);
  });

  it('should return true for non-excluded stages', () => {
    expect(shouldLookupDynamoDb(AcceleratorStage.NETWORK_VPC)).toBe(true);
    expect(shouldLookupDynamoDb(AcceleratorStage.SECURITY)).toBe(true);
    expect(shouldLookupDynamoDb(AcceleratorStage.OPERATIONS)).toBe(true);
  });
});
