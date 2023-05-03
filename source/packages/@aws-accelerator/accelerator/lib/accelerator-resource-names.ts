export interface AcceleratorResourceNamesProps {
  readonly prefixes: {
    /**
     * Accelerator prefix - used for resource name prefix for resources which do not have explicit prefix
     */
    readonly accelerator: string;
    readonly repoName: string;
    readonly bucketName: string;
    readonly ssmParamName: string;
    readonly kmsAlias: string;
    readonly snsTopicName: string;
    readonly secretName: string;
    readonly trailLogName: string;
    readonly databaseName: string;
  };
}

interface RoleNames {
  crossAccountCmkArnSsmParameterAccess: string;
  ipamSsmParameterAccess: string;
  ipamSubnetLookup: string;
  crossAccountCentralLogBucketCmkArnSsmParameterAccess: string;
  crossAccountSecretsCmkParameterAccess: string;
  moveAccountConfig: string;
  tgwPeering: string;
  madShareAccept: string;
  snsTopicCmkArnParameterAccess: string;
  crossAccountAssetsBucketCmkArnSsmParameterAccess: string;
  crossAccountServiceCatalogPropagation: string;
  crossAccountSsmParameterShare: string;
  assetFunctionRoleName: string;
}
interface ParameterNames {
  centralLogBucketCmkArn: string;
  controlTowerDriftDetection: string;
  controlTowerLastDriftMessage: string;
  configTableArn: string;
  configTableName: string;
  cloudTrailBucketName: string;
  flowLogsDestinationBucketArn: string;
  metadataBucketArn: string;
  metadataBucketCmkArn: string;
  acceleratorCmkArn: string;
  ebsDefaultCmkArn: string;
  s3CmkArn: string;
  secretsManagerCmkArn: string;
  cloudWatchLogCmkArn: string;
  snsTopicCmkArn: string;
  lambdaCmkArn: string;
  managementCmkArn: string;
  assetsBucketCmkArn: string;
}
interface CmkDetails {
  orgTrailLog: { alias: string; description: string };
  centralLogsBucket: { alias: string; description: string };
  metadataBucket: { alias: string; description: string };
  ebsDefault: { alias: string; description: string };
  s3: { alias: string; description: string };
  cloudWatchLog: { alias: string; description: string };
  cloudWatchLogReplication: { alias: string; description: string };
  awsBackup: { alias: string; description: string };
  sns: { alias: string; description: string };
  snsTopic: { alias: string; description: string };
  secretsManager: { alias: string; description: string };
  lambda: { alias: string; description: string };
  acceleratorKey: { alias: string; description: string };
  managementKey: { alias: string; description: string };
  assetsBucket: { alias: string; description: string };
}
interface BucketPrefixes {
  assetsAccessLog: string;
  assets: string;
  elbLogs: string;
  costUsage: string;
  s3AccessLogs: string;
  auditManager: string;
  vpcFlowLogs: string;
  metadata: string;
  centralLogs: string;
}
export class AcceleratorResourceNames {
  public roles: RoleNames = {
    crossAccountCmkArnSsmParameterAccess: 'PLACE_HOLDER',
    ipamSsmParameterAccess: 'PLACE_HOLDER',
    ipamSubnetLookup: 'PLACE_HOLDER',
    crossAccountCentralLogBucketCmkArnSsmParameterAccess: 'PLACE_HOLDER',
    crossAccountSecretsCmkParameterAccess: 'PLACE_HOLDER',
    moveAccountConfig: 'PLACE_HOLDER',
    tgwPeering: 'PLACE_HOLDER',
    madShareAccept: 'PLACE_HOLDER',
    snsTopicCmkArnParameterAccess: 'PLACE_HOLDER',
    crossAccountAssetsBucketCmkArnSsmParameterAccess: 'PLACE_HOLDER',
    crossAccountServiceCatalogPropagation: 'PLACE_HOLDER',
    crossAccountSsmParameterShare: 'PLACE_HOLDER',
    assetFunctionRoleName: 'PLACE_HOLDER',
  };
  public parameters: ParameterNames = {
    centralLogBucketCmkArn: 'PLACE_HOLDER',
    controlTowerDriftDetection: 'PLACE_HOLDER',
    controlTowerLastDriftMessage: 'PLACE_HOLDER',
    configTableArn: 'PLACE_HOLDER',
    configTableName: 'PLACE_HOLDER',
    cloudTrailBucketName: 'PLACE_HOLDER',
    flowLogsDestinationBucketArn: 'PLACE_HOLDER',
    metadataBucketArn: 'PLACE_HOLDER',
    metadataBucketCmkArn: 'PLACE_HOLDER',
    acceleratorCmkArn: 'PLACE_HOLDER',
    ebsDefaultCmkArn: 'PLACE_HOLDER',
    s3CmkArn: 'PLACE_HOLDER',
    secretsManagerCmkArn: 'PLACE_HOLDER',
    cloudWatchLogCmkArn: 'PLACE_HOLDER',
    snsTopicCmkArn: 'PLACE_HOLDER',
    lambdaCmkArn: 'PLACE_HOLDER',
    managementCmkArn: 'PLACE_HOLDER',
    assetsBucketCmkArn: 'PLACE_HOLDER',
  };
  public customerManagedKeys: CmkDetails = {
    orgTrailLog: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    centralLogsBucket: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    metadataBucket: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    ebsDefault: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    s3: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    cloudWatchLog: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    cloudWatchLogReplication: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    awsBackup: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    sns: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    snsTopic: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    secretsManager: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    lambda: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    acceleratorKey: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    managementKey: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    assetsBucket: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
  };
  public bucketPrefixes: BucketPrefixes = {
    assetsAccessLog: 'PLACE_HOLDER',
    assets: 'PLACE_HOLDER',
    elbLogs: 'PLACE_HOLDER',
    costUsage: 'PLACE_HOLDER',
    s3AccessLogs: 'PLACE_HOLDER',
    auditManager: 'PLACE_HOLDER',
    vpcFlowLogs: 'PLACE_HOLDER',
    metadata: 'PLACE_HOLDER',
    centralLogs: 'PLACE_HOLDER',
  };

  constructor(props: AcceleratorResourceNamesProps) {
    //
    // Role name initializations
    this.roles.crossAccountCentralLogBucketCmkArnSsmParameterAccess =
      props.prefixes.accelerator + '-CentralBucket-KeyArnParam-Role';
    this.roles.ipamSsmParameterAccess = props.prefixes.accelerator + '-Ipam-GetSsmParamRole';
    this.roles.ipamSubnetLookup = props.prefixes.accelerator + '-GetIpamCidrRole';
    this.roles.crossAccountCmkArnSsmParameterAccess = props.prefixes.accelerator + '-CrossAccount-SsmParameter-Role';

    this.roles.crossAccountSecretsCmkParameterAccess = props.prefixes.accelerator + '-CrossAccount-SecretsKms-Role';
    this.roles.moveAccountConfig = props.prefixes.accelerator + '-MoveAccountConfigRule-Role';
    this.roles.tgwPeering = props.prefixes.accelerator + '-TgwPeering-Role';
    this.roles.madShareAccept = props.prefixes.accelerator + '-MadAccept-Role';
    this.roles.snsTopicCmkArnParameterAccess = props.prefixes.accelerator + '-SnsTopic-KeyArnParam-Role';
    this.roles.crossAccountAssetsBucketCmkArnSsmParameterAccess =
      props.prefixes.accelerator + '-AssetsBucket-KeyArnParam-Role';
    this.roles.crossAccountServiceCatalogPropagation = props.prefixes.accelerator + '-CrossAccount-ServiceCatalog-Role';
    this.roles.crossAccountSsmParameterShare = props.prefixes.accelerator + '-CrossAccountSsmParameterShare';
    this.roles.assetFunctionRoleName = props.prefixes.accelerator + '-AssetsAccessRole';

    //
    // SSM Parameter initializations
    this.parameters.centralLogBucketCmkArn = props.prefixes.ssmParamName + '/logging/central-bucket/kms/arn';
    this.parameters.controlTowerDriftDetection = props.prefixes.ssmParamName + '/controltower/driftDetected';
    this.parameters.controlTowerLastDriftMessage = props.prefixes.ssmParamName + '/controltower/lastDriftMessage';
    this.parameters.configTableArn = props.prefixes.ssmParamName + '/prepare-stack/configTable/arn';
    this.parameters.configTableName = props.prefixes.ssmParamName + '/prepare-stack/configTable/name';
    this.parameters.cloudTrailBucketName =
      props.prefixes.ssmParamName + '/organization/security/cloudtrail/log/bucket-name';
    this.parameters.flowLogsDestinationBucketArn =
      props.prefixes.ssmParamName + '/vpc/flow-logs/destination/bucket/arn';
    this.parameters.metadataBucketArn = props.prefixes.ssmParamName + '/metadata/bucket/arn';
    this.parameters.metadataBucketCmkArn = props.prefixes.ssmParamName + '/kms/metadata/key-arn';
    this.parameters.acceleratorCmkArn = props.prefixes.ssmParamName + '/kms/key-arn';
    this.parameters.ebsDefaultCmkArn = props.prefixes.ssmParamName + '/ebs/default-encryption/key-arn';
    this.parameters.s3CmkArn = props.prefixes.ssmParamName + '/kms/s3/key-arn';
    this.parameters.secretsManagerCmkArn = props.prefixes.ssmParamName + '/kms/secrets-manager/key-arn';
    this.parameters.cloudWatchLogCmkArn = props.prefixes.ssmParamName + '/kms/cloudwatch/key-arn';
    this.parameters.snsTopicCmkArn = props.prefixes.ssmParamName + '/kms/snstopic/key-arn';
    this.parameters.lambdaCmkArn = props.prefixes.ssmParamName + '/kms/lambda/key-arn';
    this.parameters.managementCmkArn = props.prefixes.ssmParamName + '/management/kms/key-arn';
    this.parameters.assetsBucketCmkArn = props.prefixes.ssmParamName + '/assets/kms/key';

    //
    // CMK details initialization
    this.customerManagedKeys.orgTrailLog = {
      alias: props.prefixes.kmsAlias + '/organizations-cloudtrail/log-group/',
      description: 'CloudTrail Log Group CMK',
    };
    this.customerManagedKeys.centralLogsBucket = {
      alias: props.prefixes.kmsAlias + '/central-logs/s3',
      description: 'AWS Accelerator Central Logs Bucket CMK',
    };
    this.customerManagedKeys.metadataBucket = {
      alias: props.prefixes.kmsAlias + '/kms/metadata/key',
      description: 'The s3 bucket key for accelerator metadata collection',
    };
    this.customerManagedKeys.ebsDefault = {
      alias: props.prefixes.kmsAlias + '/ebs/default-encryption/key',
      description: 'AWS Accelerator default EBS Volume Encryption key',
    };
    this.customerManagedKeys.s3 = {
      alias: props.prefixes.kmsAlias + '/kms/s3/key',
      description: 'AWS Accelerator S3 Kms Key',
    };
    this.customerManagedKeys.cloudWatchLog = {
      alias: props.prefixes.kmsAlias + '/kms/cloudwatch/key',
      description: 'AWS Accelerator CloudWatch Kms Key',
    };
    this.customerManagedKeys.cloudWatchLogReplication = {
      alias: props.prefixes.kmsAlias + '/kms/replication/cloudwatch/logs/key',
      description: 'AWS Accelerator CloudWatch Logs Replication Kms Key',
    };
    this.customerManagedKeys.awsBackup = {
      alias: props.prefixes.kmsAlias + '/kms/backup/key',
      description: 'AWS Accelerator Backup Kms Key',
    };
    this.customerManagedKeys.sns = {
      alias: props.prefixes.kmsAlias + '/kms/sns/key',
      description: 'AWS Accelerator SNS Kms Key',
    };
    this.customerManagedKeys.snsTopic = {
      alias: props.prefixes.kmsAlias + '/kms/snstopic/key',
      description: 'AWS Accelerator SNS Topic Kms Key',
    };
    this.customerManagedKeys.secretsManager = {
      alias: props.prefixes.kmsAlias + '/kms/secrets-manager/key',
      description: 'AWS Accelerator Secrets Manager Kms Key',
    };
    this.customerManagedKeys.lambda = {
      alias: props.prefixes.kmsAlias + '/kms/lambda/key',
      description: 'AWS Accelerator Lambda Kms Key',
    };
    this.customerManagedKeys.acceleratorKey = {
      alias: props.prefixes.kmsAlias + '/kms/key',
      description: 'AWS Accelerator Kms Key',
    };
    this.customerManagedKeys.managementKey = {
      alias: props.prefixes.kmsAlias + '/management/kms/key',
      description: 'AWS Accelerator Management Account Kms Key',
    };
    this.customerManagedKeys.assetsBucket = {
      alias: props.prefixes.kmsAlias + '/assets/kms/key',
      description: 'Key used to encrypt solution assets',
    };

    //
    // Bucket prefixes initialization
    this.bucketPrefixes.assetsAccessLog = props.prefixes.bucketName + '-assets-logs';
    this.bucketPrefixes.assets = props.prefixes.bucketName + '-assets';
    this.bucketPrefixes.elbLogs = props.prefixes.bucketName + '-elb-access-logs';
    this.bucketPrefixes.costUsage = props.prefixes.bucketName + '-cur';
    this.bucketPrefixes.s3AccessLogs = props.prefixes.bucketName + '-s3-access-logs';
    this.bucketPrefixes.auditManager = props.prefixes.bucketName + '-auditmgr';
    this.bucketPrefixes.vpcFlowLogs = props.prefixes.bucketName + '-vpc';
    this.bucketPrefixes.metadata = props.prefixes.bucketName + '-metadata';
    this.bucketPrefixes.centralLogs = props.prefixes.bucketName + '-central-logs';
  }
}
