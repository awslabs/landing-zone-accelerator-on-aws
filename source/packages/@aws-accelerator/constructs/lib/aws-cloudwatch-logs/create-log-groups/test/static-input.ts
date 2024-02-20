import {
  AccountId,
  MakeKeyArn,
  MakeLogGroupArn,
  MakeRoleArn,
  Partition,
  Region,
} from '../../../../test/unit-test/common/resources';

/**
 * CloudWatch Log group property used for Create CloudWatch log group custom resource.
 */
type CloudWatchLogGroupPropertyType = {
  logGroupName: string;
  retention: string;
  terminationProtected: string;
  keyArn: string;
  owningAccountId?: string;
  owningRegion?: string;
  roleName?: string;
};
/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  public static readonly owningAccountId = '222222222222';
  public static readonly owningRegion = 'us-east-1';
  public static readonly roleName = 'MockRoleName';
  public static readonly mockLogGroupName = '/mock/log-group-1';
  public static readonly assumeRoleArn = MakeRoleArn(StaticInput.roleName, Partition, StaticInput.owningAccountId);

  public static readonly newProps: CloudWatchLogGroupPropertyType = {
    logGroupName: StaticInput.mockLogGroupName,
    retention: '180',
    terminationProtected: 'true',
    keyArn: MakeKeyArn(StaticInput.mockLogGroupName, Partition, AccountId, Region),
  };

  public static readonly oldProps: CloudWatchLogGroupPropertyType = {
    logGroupName: StaticInput.mockLogGroupName,
    retention: '60',
    terminationProtected: 'true',
    keyArn: MakeKeyArn(StaticInput.mockLogGroupName, Partition, AccountId, Region),
  };

  public static readonly crossAccountNewProps = {
    logGroupName: StaticInput.mockLogGroupName,
    retention: '180',
    terminationProtected: 'true',
    keyArn: MakeKeyArn(StaticInput.mockLogGroupName, Partition, StaticInput.owningAccountId, StaticInput.owningRegion),
    owningAccountId: StaticInput.owningAccountId,
    owningRegion: StaticInput.owningRegion,
    roleName: StaticInput.roleName,
  };

  public static readonly crossAccountOldProps = {
    logGroupName: StaticInput.mockLogGroupName,
    retention: '60',
    terminationProtected: 'true',
    keyArn: MakeKeyArn(
      `existing-${StaticInput.mockLogGroupName}`,
      Partition,
      StaticInput.owningAccountId,
      StaticInput.owningRegion,
    ),
    owningAccountId: StaticInput.owningAccountId,
    owningRegion: StaticInput.owningRegion,
    roleName: StaticInput.roleName,
  };

  public static readonly createUpdateResponse = {
    Data: {
      LogGroupArn: MakeLogGroupArn(StaticInput.newProps.logGroupName, Partition, AccountId, Region),
    },
    PhysicalResourceId: StaticInput.newProps.logGroupName,
    Status: 'SUCCESS',
  };

  public static readonly crossAccountCreateUpdateResponse = {
    Data: {
      LogGroupArn: MakeLogGroupArn(
        StaticInput.newProps.logGroupName,
        Partition,
        this.owningAccountId,
        this.owningRegion,
      ),
    },
    PhysicalResourceId: StaticInput.newProps.logGroupName,
    Status: 'SUCCESS',
  };

  public static readonly crossAccountMissingOptionError = new Error(
    `Cross-account log group required but roleName parameter is undefined`,
  );

  public static readonly missingAccessKeyError = new Error(`Access key ID not returned from AssumeRole command`);

  public static readonly missingSecretAccessKeyError = new Error(
    `Secret access key not returned from AssumeRole command`,
  );

  public static readonly missingSessionTokenError = new Error(`Session token not returned from AssumeRole command`);

  public static readonly assumeRoleCredential = {
    AccessKeyId: 'MockAccessKeyId',
    SecretAccessKey: 'MockSecretAccessKey',
    SessionToken: 'MockSessionToken',
    Expiration: undefined,
  };
}
