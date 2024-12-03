import { AccountId, MakeKeyArn, MakeRoleArn, Partition, Region } from '../../../../test/unit-test/common/resources';

/**
 * Config Recorder Resource Properties
 */
type ConfigRecorderPropertyType = {
  s3BucketName: string;
  s3BucketKmsKeyArn: string;
  recorderRoleArn: string;
  includeGlobalResourceTypes: boolean;
};
/**
 * Abstract class to configure static input for config-recorder
 */
export abstract class StaticInput {
  public static readonly accountId = AccountId;
  public static readonly roleName = 'MockRoleName';
  public static readonly s3BucketName = 'central-111111111111-us-east-1';
  public static readonly oldS3BucketName = 'central-logs-11111111111-us-west-2';
  public static readonly recorderRoleArn = MakeRoleArn(StaticInput.roleName, Partition, StaticInput.accountId);
  public static readonly s3BucketKmsKeyArn = MakeKeyArn('s3Key', Partition, StaticInput.accountId, Region);

  public static readonly newPropsWithGlobalResources: ConfigRecorderPropertyType = {
    s3BucketName: StaticInput.s3BucketName,
    s3BucketKmsKeyArn: StaticInput.s3BucketKmsKeyArn,
    recorderRoleArn: StaticInput.recorderRoleArn,
    includeGlobalResourceTypes: true,
  };

  public static readonly newPropsWithoutGlobalResources: ConfigRecorderPropertyType = {
    s3BucketName: StaticInput.s3BucketName,
    s3BucketKmsKeyArn: StaticInput.s3BucketKmsKeyArn,
    recorderRoleArn: StaticInput.recorderRoleArn,
    includeGlobalResourceTypes: false,
  };

  public static readonly oldPropsWithGlobalResources: ConfigRecorderPropertyType = {
    s3BucketName: StaticInput.s3BucketName,
    s3BucketKmsKeyArn: StaticInput.s3BucketKmsKeyArn,
    recorderRoleArn: StaticInput.recorderRoleArn,
    includeGlobalResourceTypes: true,
  };

  public static readonly oldPropsWithGlobalResourcesOldBucket: ConfigRecorderPropertyType = {
    s3BucketName: StaticInput.oldS3BucketName,
    s3BucketKmsKeyArn: StaticInput.s3BucketKmsKeyArn,
    recorderRoleArn: StaticInput.recorderRoleArn,
    includeGlobalResourceTypes: true,
  };

  public static readonly oldPropsWithoutGlobalResources: ConfigRecorderPropertyType = {
    s3BucketName: StaticInput.s3BucketName,
    s3BucketKmsKeyArn: StaticInput.s3BucketKmsKeyArn,
    recorderRoleArn: StaticInput.recorderRoleArn,
    includeGlobalResourceTypes: false,
  };

  public static readonly createUpdateResponse = {
    Status: 'SUCCESS',
  };
}
