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
  public static readonly documentWithoutRunAsSettings = { Content: '{}' };
  public static readonly documentWithRunAsSettings = {
    Content: JSON.stringify({
      inputs: {
        runAsEnabled: true,
        runAsDefaultUser: 'XXXX',
      },
    }),
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
  public static readonly createPropsWithRunAsSettings = {
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
      runAsEnabled: true,
      runAsDefaultUser: 'XXXX',
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

  /**
   * The session document inputs produced by {@link createProps}, which configures no session
   * preferences. Used as the baseline the session preference cases build on.
   */
  public static readonly baselineInputs = {
    cloudWatchEncryptionEnabled: false,
    cloudWatchLogGroupName: StaticInput.createProps.cloudWatchLogGroupName,
    kmsKeyId: StaticInput.createProps.kmsKeyId,
    s3BucketName: '',
    s3EncryptionEnabled: false,
    s3KeyPrefix: '',
    runAsEnabled: false,
    runAsDefaultUser: '',
  };

  /**
   * A document that carries no session preference inputs, as written by releases before these
   * properties were configurable.
   */
  public static readonly documentWithoutSessionPreferences = {
    Content: JSON.stringify({ inputs: StaticInput.baselineInputs }),
  };

  /**
   * A document whose session preference inputs were set out of band, for example through the console.
   */
  public static readonly documentWithSessionPreferences = {
    Content: JSON.stringify({
      inputs: {
        ...StaticInput.baselineInputs,
        cloudWatchStreamingEnabled: true,
        idleSessionTimeout: '45',
        maxSessionDuration: '720',
        shellProfile: { linux: 'echo out-of-band', windows: 'Write-Host out-of-band' },
      },
    }),
  };

  /**
   * {@link createProps} with every session preference configured. CloudFormation stringifies custom
   * resource property values, so the booleans and numbers arrive as strings.
   */
  public static readonly createPropsWithSessionPreferences = {
    ...StaticInput.createProps,
    cloudWatchStreamingEnabled: 'true',
    idleSessionTimeout: '15',
    maxSessionDuration: '60',
    shellProfile: { linux: 'echo configured', windows: 'Write-Host configured' },
  };

  public static readonly configuredSessionPreferenceInputs = {
    ...StaticInput.baselineInputs,
    cloudWatchStreamingEnabled: true,
    idleSessionTimeout: '15',
    maxSessionDuration: '60',
    shellProfile: { linux: 'echo configured', windows: 'Write-Host configured' },
  };

  /**
   * {@link createProps} with only `idleSessionTimeout` configured, used to check that the remaining
   * preferences are carried forward from the existing document rather than dropped.
   */
  public static readonly createPropsWithIdleSessionTimeoutOnly = {
    ...StaticInput.createProps,
    idleSessionTimeout: '15',
  };
}
