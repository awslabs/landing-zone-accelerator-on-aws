/**
 * Abstract class to configure static input for create-log-groups custom resource AWS Lambda unit testing
 */
export abstract class StaticInput {
  public static readonly createProps = {
    s3BucketName: 's3BucketName',
    s3KeyPrefix: 's3KeyPrefix',
    s3EncryptionEnabled: 's3EncryptionEnabled',
    cloudWatchLogGroupName: 'cloudWatchLogGroupName',
    cloudWatchEncryptionEnabled: 'cloudWatchEncryptionEnabled',
    kmsKeyId: 'kmsKeyId',
  };
  public static readonly createPropsSetting = {
    schemaVersion: '1.0',
    description: 'Document to hold regional settings for Session Manager',
    sessionType: 'Standard_Stream',
    inputs: {
      cloudWatchEncryptionEnabled: StaticInput.createProps.cloudWatchEncryptionEnabled === 'true',
      cloudWatchLogGroupName: StaticInput.createProps.cloudWatchLogGroupName,
      kmsKeyId: StaticInput.createProps.kmsKeyId,
      s3BucketName: StaticInput.createProps.s3BucketName,
      s3EncryptionEnabled: StaticInput.createProps.s3EncryptionEnabled === 'true',
      s3KeyPrefix: StaticInput.createProps.s3KeyPrefix,
      runAsEnabled: false,
      runAsDefaultUser: '',
    },
  };
  public static readonly updateProps = {
    s3BucketName: 's3BucketName',
    s3EncryptionEnabled: 's3EncryptionEnabled',
    cloudWatchLogGroupName: 'cloudWatchLogGroupName',
    cloudWatchEncryptionEnabled: 'cloudWatchEncryptionEnabled',
    kmsKeyId: 'kmsKeyId',
  };
  public static readonly updatePropsSetting = {
    schemaVersion: '1.0',
    description: 'Document to hold regional settings for Session Manager',
    sessionType: 'Standard_Stream',
    inputs: {
      cloudWatchEncryptionEnabled: StaticInput.updateProps.cloudWatchEncryptionEnabled === 'true',
      cloudWatchLogGroupName: StaticInput.updateProps.cloudWatchLogGroupName,
      kmsKeyId: StaticInput.updateProps.kmsKeyId,
      s3BucketName: StaticInput.updateProps.s3BucketName,
      s3EncryptionEnabled: StaticInput.updateProps.s3EncryptionEnabled === 'true',
      runAsEnabled: false,
      runAsDefaultUser: '',
    },
  };
}
