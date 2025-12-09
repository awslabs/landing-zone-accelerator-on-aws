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

import { AcceleratorResourcePrefixes } from '../utils/app-utils';
export interface AcceleratorResourceNamesProps {
  readonly prefixes: AcceleratorResourcePrefixes;
  /**
   * Centralize Logging region
   */
  readonly centralizedLoggingRegion: string;
}

interface RoleNames {
  crossAccountCmkArnSsmParameterAccess: string;
  ipamSsmParameterAccess: string;
  ipamSubnetLookup: string;
  crossAccountCentralLogBucketCmkArnSsmParameterAccess: string;
  crossAccountCustomerGatewayRoleName: string;
  crossAccountLogsRoleName: string;
  crossAccountSecretsCmkParameterAccess: string;
  crossAccountTgwRouteRoleName: string;
  crossAccountVpnRoleName: string;
  moveAccountConfig: string;
  tgwPeering: string;
  madShareAccept: string;
  snsTopicCmkArnParameterAccess: string;
  crossAccountAssetsBucketCmkArnSsmParameterAccess: string;
  crossAccountServiceCatalogPropagation: string;
  crossAccountSsmParameterShare: string;
  assetFunctionRoleName: string;
  firewallConfigFunctionRoleName: string;
  diagnosticsPackAssumeRoleName: string;
}
interface ParameterNames {
  importedCentralLogBucketCmkArn: string;
  importedAssetBucket: string;
  centralLogBucketCmkArn: string;
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
  importedAssetsBucketCmkArn: string;
  assetsBucketCmkArn: string;
  identityCenterInstanceArn: string;
  identityStoreId: string;
  firehoseRecordsProcessorFunctionName: string;
  resourceTableName: string;
  sqsCmkArn: string;
}
interface CmkDetails {
  orgTrailLog: { alias: string; description: string };
  centralLogsBucket: { alias: string; description: string };
  importedCentralLogsBucket: { alias: string; description: string };
  importedAssetBucket: { alias: string; description: string };
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
  importedAssetsBucketCmkArn: { alias: string; description: string };
  assetsBucket: { alias: string; description: string };
  ssmKey: { alias: string; description: string };
  sqs: { alias: string; description: string };
}
interface BucketPrefixes {
  assetsAccessLog: string;
  assets: string;
  elbLogs: string;
  firewallConfig: string;
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
    crossAccountCustomerGatewayRoleName: 'PLACE_HOLDER',
    crossAccountLogsRoleName: 'PLACE_HOLDER',
    crossAccountSecretsCmkParameterAccess: 'PLACE_HOLDER',
    crossAccountTgwRouteRoleName: 'PLACE_HOLDER',
    crossAccountVpnRoleName: 'PLACE_HOLDER',
    moveAccountConfig: 'PLACE_HOLDER',
    tgwPeering: 'PLACE_HOLDER',
    madShareAccept: 'PLACE_HOLDER',
    snsTopicCmkArnParameterAccess: 'PLACE_HOLDER',
    crossAccountAssetsBucketCmkArnSsmParameterAccess: 'PLACE_HOLDER',
    crossAccountServiceCatalogPropagation: 'PLACE_HOLDER',
    crossAccountSsmParameterShare: 'PLACE_HOLDER',
    assetFunctionRoleName: 'PLACE_HOLDER',
    firewallConfigFunctionRoleName: 'PLACE_HOLDER',
    diagnosticsPackAssumeRoleName: 'PLACE_HOLDER',
  };
  public parameters: ParameterNames = {
    importedCentralLogBucketCmkArn: 'PLACE_HOLDER',
    importedAssetBucket: 'PLACE_HOLDER',
    centralLogBucketCmkArn: 'PLACE_HOLDER',
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
    importedAssetsBucketCmkArn: 'PLACE_HOLDER',
    assetsBucketCmkArn: 'PLACE_HOLDER',
    identityCenterInstanceArn: 'PLACE_HOLDER',
    identityStoreId: 'PLACE_HOLDER',
    firehoseRecordsProcessorFunctionName: 'PLACE_HOLDER',
    resourceTableName: 'PLACE_HOLDER',
    sqsCmkArn: 'PLACE_HOLDER',
  };
  public customerManagedKeys: CmkDetails = {
    orgTrailLog: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    centralLogsBucket: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    importedCentralLogsBucket: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    importedAssetBucket: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
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
    importedAssetsBucketCmkArn: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    assetsBucket: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    ssmKey: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
    sqs: { alias: 'PLACE_HOLDER', description: 'PLACE_HOLDER' },
  };
  public bucketPrefixes: BucketPrefixes = {
    assetsAccessLog: 'PLACE_HOLDER',
    assets: 'PLACE_HOLDER',
    elbLogs: 'PLACE_HOLDER',
    firewallConfig: 'PLACE_HOLDER',
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
      props.prefixes.accelerator + '-' + props.centralizedLoggingRegion + '-CentralBucket-KeyArnParam-Role';
    this.roles.ipamSsmParameterAccess = props.prefixes.accelerator + '-Ipam-GetSsmParamRole';
    this.roles.ipamSubnetLookup = props.prefixes.accelerator + '-GetIpamCidrRole';
    this.roles.crossAccountCmkArnSsmParameterAccess = props.prefixes.accelerator + '-CrossAccount-SsmParameter-Role';
    this.roles.crossAccountCustomerGatewayRoleName = props.prefixes.accelerator + '-CrossAccount-CustomerGateway-Role';
    this.roles.crossAccountLogsRoleName = props.prefixes.accelerator + '-CrossAccount-PutLogs-Role';
    this.roles.crossAccountSecretsCmkParameterAccess = props.prefixes.accelerator + '-CrossAccount-SecretsKms-Role';
    this.roles.crossAccountTgwRouteRoleName = props.prefixes.accelerator + '-CrossAccount-TgwRoutes-Role';
    this.roles.crossAccountVpnRoleName = props.prefixes.accelerator + '-CrossAccount-SiteToSiteVpn-Role';
    this.roles.moveAccountConfig = props.prefixes.accelerator + '-MoveAccountConfigRule-Role';
    this.roles.tgwPeering = props.prefixes.accelerator + '-TgwPeering-Role';
    this.roles.madShareAccept = props.prefixes.accelerator + '-MadAccept-Role';
    this.roles.snsTopicCmkArnParameterAccess = props.prefixes.accelerator + '-SnsTopic-KeyArnParam-Role';
    this.roles.crossAccountAssetsBucketCmkArnSsmParameterAccess =
      props.prefixes.accelerator + '-AssetsBucket-KeyArnParam-Role';
    this.roles.crossAccountServiceCatalogPropagation = props.prefixes.accelerator + '-CrossAccount-ServiceCatalog-Role';
    this.roles.crossAccountSsmParameterShare = props.prefixes.accelerator + '-CrossAccountSsmParameterShare';
    this.roles.assetFunctionRoleName = props.prefixes.accelerator + '-AssetsAccessRole';
    this.roles.firewallConfigFunctionRoleName = props.prefixes.accelerator + '-FirewallConfigAccessRole';
    // Changing the role name for diagnosticsPackAssumeRoleName will need to be change in diagnostics-pack-stack.ts file, this stack deploys during installer
    this.roles.diagnosticsPackAssumeRoleName = props.prefixes.accelerator + '-DiagnosticsPackAccessRole';

    //
    // SSM Parameter initializations
    this.parameters.importedCentralLogBucketCmkArn =
      props.prefixes.importResourcesSsmParamName + '/logging/central-bucket/kms/arn';
    this.parameters.importedAssetBucket = props.prefixes.ssmParamName + '/imported-bucket/assets/s3';
    this.parameters.centralLogBucketCmkArn = props.prefixes.ssmParamName + '/logging/central-bucket/kms/arn';
    this.parameters.configTableArn = props.prefixes.ssmParamName + '/prepare-stack/configTable/arn';
    this.parameters.configTableName = props.prefixes.ssmParamName + '/prepare-stack/configTable/name';
    this.parameters.resourceTableName = props.prefixes.ssmParamName + '/prepare-stack/resourceTable/name';
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
    this.parameters.importedAssetsBucketCmkArn =
      props.prefixes.importResourcesSsmParamName + '/imported/assets/kms/key';
    this.parameters.assetsBucketCmkArn = props.prefixes.ssmParamName + '/assets/kms/key';
    this.parameters.identityCenterInstanceArn =
      props.prefixes.ssmParamName + '/organization/security/identity-center/instance-arn';
    this.parameters.identityStoreId =
      props.prefixes.ssmParamName + '/organization/security/identity-center/identity-store-id';

    this.parameters.sqsCmkArn = props.prefixes.ssmParamName + '/kms/sqs/key-arn';
    //
    // CMK details initialization
    this.customerManagedKeys.orgTrailLog = {
      alias: props.prefixes.kmsAlias + '/organizations-cloudtrail/log-group/',
      description: 'KMS key for encrypting CloudWatch Logs for organization-wide CloudTrail in management account',
    };
    this.customerManagedKeys.centralLogsBucket = {
      alias: props.prefixes.kmsAlias + '/central-logs/s3',
      description: 'KMS key for encrypting centralized S3 logging bucket in log archive account',
    };
    this.customerManagedKeys.importedCentralLogsBucket = {
      alias: props.prefixes.kmsAlias + '/imported-bucket/central-logs/s3',
      description: 'KMS key for encrypting imported centralized S3 logging bucket in the log archive account',
    };
    this.customerManagedKeys.importedAssetBucket = {
      alias: props.prefixes.kmsAlias + '/imported-bucket/assets/s3',
      description: 'KMS key for encrypting imported S3 assets bucket in the log archive account',
    };
    this.customerManagedKeys.metadataBucket = {
      alias: props.prefixes.kmsAlias + '/kms/metadata/key',
      description: 'KMS key for encrypting S3 bucket storing LZA metadata and configuration in the log archive account',
    };
    this.customerManagedKeys.ebsDefault = {
      alias: props.prefixes.kmsAlias + '/ebs/default-encryption/key',
      description: 'KMS key for default EBS volume encryption across all accounts',
    };
    this.customerManagedKeys.s3 = {
      alias: props.prefixes.kmsAlias + '/kms/s3/key',
      description: 'KMS key for encrypting general-purpose S3 buckets created by LZA',
    };
    this.customerManagedKeys.cloudWatchLog = {
      alias: props.prefixes.kmsAlias + '/kms/cloudwatch/key',
      description: 'KMS key for encrypting CloudWatch Log Groups created by LZA',
    };
    this.customerManagedKeys.cloudWatchLogReplication = {
      alias: props.prefixes.kmsAlias + '/kms/replication/cloudwatch/logs/key',
      description:
        'KMS key for encrypting Kinesis Data Streams used for CloudWatch Logs replication in the log archive account',
    };
    this.customerManagedKeys.awsBackup = {
      alias: props.prefixes.kmsAlias + '/kms/backup/key',
      description: 'KMS key for encrypting AWS Backup vaults and recovery points',
    };
    this.customerManagedKeys.sns = {
      alias: props.prefixes.kmsAlias + '/kms/sns/key',
      description: 'KMS key for encrypting SNS topics in security audit account',
    };
    this.customerManagedKeys.snsTopic = {
      alias: props.prefixes.kmsAlias + '/kms/snstopic/key',
      description: 'KMS key for encrypting SNS topics for notifications and alerts in the log archive account',
    };
    this.customerManagedKeys.secretsManager = {
      alias: props.prefixes.kmsAlias + '/kms/secrets-manager/key',
      description: 'KMS key for encrypting AWS Secrets Manager secrets created by LZA in the log archive account',
    };
    this.customerManagedKeys.lambda = {
      alias: props.prefixes.kmsAlias + '/kms/lambda/key',
      description: 'KMS key for encrypting Lambda function environment variables',
    };
    this.customerManagedKeys.acceleratorKey = {
      alias: props.prefixes.kmsAlias + '/kms/key',
      description:
        'KMS key for encrypting cross-service resources (SNS, Lambda, CloudWatch, SQS, Macie, GuardDuty, Audit Manager) in the audit account',
    };
    this.customerManagedKeys.managementKey = {
      alias: props.prefixes.kmsAlias + '/management/kms/key',
      description: 'KMS key for encrypting DynamoDB tables, CloudWatch Logs, and SNS topics in the management account',
    };
    this.customerManagedKeys.importedAssetsBucketCmkArn = {
      alias: props.prefixes.kmsAlias + '/imported/assets/kms/key',
      description: 'KMS key for encrypting imported S3 bucket containing solution assets in the log archive account',
    };
    this.customerManagedKeys.assetsBucket = {
      alias: props.prefixes.kmsAlias + '/assets/kms/key',
      description:
        'KMS key for encrypting S3 bucket containing LZA solution assets and CDK artifacts in the management account',
    };

    this.customerManagedKeys.ssmKey = {
      alias: props.prefixes.kmsAlias + '/sessionmanager-logs/session',
      description: 'KMS key for encrypting SSM Session Manager session logs and data',
    };
    this.customerManagedKeys.sqs = {
      alias: props.prefixes.kmsAlias + '/kms/sqs/key',
      description: 'KMS key for encrypting SQS queues created by LZA',
    };
    //
    // Bucket prefixes initialization
    this.bucketPrefixes.assetsAccessLog = props.prefixes.bucketName + '-assets-logs';
    this.bucketPrefixes.assets = props.prefixes.bucketName + '-assets';
    this.bucketPrefixes.elbLogs = props.prefixes.bucketName + '-elb-access-logs';
    this.bucketPrefixes.firewallConfig = props.prefixes.bucketName + '-firewall-config';
    this.bucketPrefixes.costUsage = props.prefixes.bucketName + '-cur';
    this.bucketPrefixes.s3AccessLogs = props.prefixes.bucketName + '-s3-access-logs';
    this.bucketPrefixes.auditManager = props.prefixes.bucketName + '-auditmgr';
    this.bucketPrefixes.vpcFlowLogs = props.prefixes.bucketName + '-vpc';
    this.bucketPrefixes.metadata = props.prefixes.bucketName + '-metadata';
    this.bucketPrefixes.centralLogs = props.prefixes.bucketName + '-central-logs';

    //
    // Lambda function name initialization
    this.parameters.firehoseRecordsProcessorFunctionName = props.prefixes.accelerator + '-FirehoseRecordsProcessor';
  }
}
