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

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { pascalCase } from 'pascal-case';
import path from 'path';
import { DEFAULT_LAMBDA_RUNTIME } from '../../../utils/lib/lambda';

import {
  AccessLogBucketConfig,
  AseaResourceType,
  AssetBucketConfig,
  CentralLogBucketConfig,
  CloudWatchLogsExclusionConfig,
  ElbLogBucketConfig,
  SnsTopicConfig,
  VpcFlowLogsConfig,
} from '@aws-accelerator/config';
import * as t from '@aws-accelerator/config/lib/common/types';
import {
  Bucket,
  BucketEncryption,
  BucketEncryptionType,
  BucketPolicy,
  BucketPolicyProps,
  BucketPrefix,
  BucketPrefixProps,
  BucketReplicationProps,
  CentralLogsBucket,
  CloudWatchDestination,
  CloudWatchLogDataProtection,
  CloudWatchLogsSubscriptionFilter,
  CloudWatchToS3Firehose,
  KmsEncryption,
  NewCloudWatchLogEvent,
  PutSsmParameter,
  S3PublicAccessBlock,
  ServiceLinkedRole,
  SsmParameterLookup,
  ValidateBucket,
} from '@aws-accelerator/constructs';

import {
  AcceleratorImportedBucketType,
  AwsPrincipalAccessesType,
  BucketAccessType,
  PrincipalOrgIdConditionType,
} from '@aws-accelerator/utils/lib/common-resources';
import { AcceleratorElbRootAccounts, OptInRegions } from '@aws-accelerator/utils/lib/regions';

import {
  AcceleratorKeyType,
  AcceleratorStack,
  AcceleratorStackProps,
  CloudWatchDataProtectionIdentifiers,
  NagSuppressionRuleIds,
} from './accelerator-stack';
import { StreamMode } from 'aws-cdk-lib/aws-kinesis';

export type cloudwatchExclusionProcessedItem = {
  account: string;
  region: string;
  excludeAll?: boolean;
  logGroupNames?: string[];
};

type excludeUniqueItemType = { account: string; region: string };

type CentralLogsBucketPrincipalAndPrefixesType = {
  awsPrincipalAccesses: AwsPrincipalAccessesType[];
  bucketPrefixes: string[];
};

type PolicyAttachmentsType = {
  policy: string;
};

export class LoggingStack extends AcceleratorStack {
  private cloudwatchKey: cdk.aws_kms.IKey | undefined;
  private lambdaKey: cdk.aws_kms.IKey | undefined;
  private centralLogsBucket: CentralLogsBucket | undefined;
  private centralLogBucketKey: cdk.aws_kms.IKey | undefined;
  private centralSnsKey: cdk.aws_kms.IKey | undefined;
  private snsForwarderFunction: cdk.aws_lambda.IFunction | undefined;
  private importedCentralLogBucket: cdk.aws_s3.IBucket | undefined;
  private importedCentralLogBucketKey: cdk.aws_kms.IKey | undefined;
  private sqsKey: cdk.aws_kms.IKey | undefined;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Get principal organization condition
    const principalOrgIdCondition = this.getPrincipalOrgIdCondition(this.organizationId);

    // Create S3 Key in all account
    const s3Key = this.createS3KmsKey();

    //
    // Create Managed active directory admin user secrets key
    //
    this.createManagedDirectoryAdminSecretsManagerKey();

    //
    // Create CloudWatch key
    //
    this.cloudwatchKey = this.createCloudWatchKey(props);

    //
    // Create Lambda key
    //
    this.lambdaKey = this.createLambdaKey(props);

    //
    // Create SQS key
    //
    this.sqsKey = this.createSqsKey();

    //
    // Create Auto scaling service linked role
    //
    const autoScalingSlr = this.createAutoScalingServiceLinkedRole({
      cloudwatch: this.cloudwatchKey,
      lambda: this.lambdaKey,
    });

    //
    // Create AWS Cloud9 service linked role
    //
    const cloud9Slr = this.createAwsCloud9ServiceLinkedRole({ cloudwatch: this.cloudwatchKey, lambda: this.lambdaKey });

    //
    // Create Config Service Linked Role
    //
    this.createConfigServiceLinkedRole({
      cloudwatch: this.cloudwatchKey,
      lambda: this.lambdaKey,
    });

    //
    // Create KMS keys defined in config
    this.createKeys(autoScalingSlr, cloud9Slr);

    // Create Notification Role for FMS Notifications if enabled
    this.createFMSNotificationRole();

    //
    // Configure block S3 public access
    //
    this.configureS3PublicAccessBlock(props);

    //
    // SNS Topics creation
    //
    this.createSnsTopics(props);

    //
    // Create S3 Bucket for Access Logs - this is required
    //
    const serverAccessLogsBucket = this.createOrGetServerAccessLogBucket();

    //
    // Create or get existing central log bucket
    this.createOrGetCentralLogsBucket(serverAccessLogsBucket!, principalOrgIdCondition);

    //
    // Create the bucket replication pros
    const replicationProps: BucketReplicationProps = this.createReplicationProps();

    //
    // Create VPC Flow logs destination bucket
    this.createVpcFlowLogsBucket(replicationProps, s3Key, serverAccessLogsBucket);

    //
    // Create or get ELB access logs bucket
    //
    this.createOrGetElbAccessLogsBucket(principalOrgIdCondition, replicationProps);

    //
    // Configure CloudWatchLogs to S3 replication
    //
    this.configureCloudWatchLogReplication(props);

    //
    // Set certificate assets
    //
    this.setupCertificateAssets(props, principalOrgIdCondition);

    //
    // Create Metadata Bucket
    //
    this.createMetadataBucket(serverAccessLogsBucket);

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    //
    // Configure Account level CloudWatch Log data protection policy
    //
    this.configureAccountDataProtectionPolicy();

    this.logger.debug(`Stack synthesis complete`);

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();
  }

  private createReplicationProps(): BucketReplicationProps {
    this.centralLogBucketKey = this.getCentralLogBucketKey();
    const replicationProps: BucketReplicationProps = {
      destination: {
        bucketName: this.centralLogsBucketName,
        accountId: this.props.accountsConfig.getLogArchiveAccountId(),
        keyArn: this.centralLogBucketKey.keyArn,
      },
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      useExistingRoles: this.props.useExistingRoles ?? false,
      acceleratorPrefix: this.props.prefixes.accelerator,
    };
    return replicationProps;
  }

  /**
   * Function to configure CloudWatch log replication
   * @param props {@link AcceleratorStackProps}
   *
   * @remarks
   * First, logs receiving account will setup Kinesis DataStream and Firehose in LogArchive account home region KMS to encrypt Kinesis, Firehose and any Lambda environment variables for CloudWatchLogs to S3 replication
   *
   * CloudWatch logs replication requires Kinesis Data stream, Firehose and AWS Organizations.
   * Some or all of these services may not be available in all regions.
   * Only deploy in standard and GovCloud partitions
   *
   * Check to see if users specified enable on CloudWatch logs in global config.
   * Defaults to true if undefined. If set to false, no resources are created.
   */
  private configureCloudWatchLogReplication(props: AcceleratorStackProps): void {
    if (props.globalConfig.logging.cloudwatchLogs?.enable ?? true) {
      if (props.partition === 'aws' || props.partition === 'aws-us-gov' || props.partition === 'aws-cn') {
        if (cdk.Stack.of(this).account === props.accountsConfig.getLogArchiveAccountId()) {
          const receivingLogs = this.cloudwatchLogReceivingAccount(this.centralLogsBucketName, this.lambdaKey);
          const creatingLogs = this.cloudwatchLogCreatingAccount();

          // Log receiving setup should be complete before logs creation setup can start or else there will be errors about destination not ready.
          creatingLogs.node.addDependency(receivingLogs);
        } else {
          // Any account in LZA needs to setup log subscriptions for CloudWatch Logs
          // The destination needs to be present before its setup
          this.cloudwatchLogCreatingAccount();
        }
      }
    }
  }

  /**
   * Function to create or get ELB access log bucket
   * @param principalOrgIdCondition {@link PrincipalOrgIdConditionType}
   * @param replicationProps {@link BucketReplicationProps}
   * @returns
   */
  private createOrGetElbAccessLogsBucket(
    principalOrgIdCondition: PrincipalOrgIdConditionType,
    replicationProps?: BucketReplicationProps,
  ): cdk.aws_s3.IBucket | undefined {
    /**
     * Create S3 Bucket for ELB Access Logs, this is created in log archive account
     * For ELB to write access logs bucket is needed to have SSE-S3 server-side encryption
     */
    if (cdk.Stack.of(this).account === this.props.accountsConfig.getLogArchiveAccountId()) {
      const elbAccountId = this.getElbAccountId();
      if (this.props.globalConfig.logging.elbLogBucket?.importedBucket) {
        const bucket = this.getImportedBucket(
          this.props.globalConfig.logging.elbLogBucket.importedBucket.name,
          AcceleratorImportedBucketType.ELB_LOGS_BUCKET,
          's3',
        ).bucket;

        this.updateImportedBucketResourcePolicy({
          bucketConfig: this.props.globalConfig.logging.elbLogBucket,
          importedBucket: bucket,
          bucketType: AcceleratorImportedBucketType.ELB_LOGS_BUCKET,
          overridePolicyFile: this.props.globalConfig.logging.elbLogBucket.customPolicyOverrides?.policy,
          principalOrgIdCondition,
          elbAccountId: elbAccountId,
          organizationId: this.organizationId,
        });

        return bucket;
      } else {
        return this.createElbAccessLogsBucket(replicationProps, elbAccountId);
      }
    }
    return undefined;
  }

  /**
   * Function to get ELB account id
   * @returns
   */
  private getElbAccountId() {
    let elbAccountId = undefined;
    if (AcceleratorElbRootAccounts.get(cdk.Stack.of(this).region)) {
      elbAccountId = AcceleratorElbRootAccounts.get(cdk.Stack.of(this).region);
    }
    if (this.props.networkConfig.elbAccountIds?.find(item => item.region === cdk.Stack.of(this).region)) {
      elbAccountId = this.props.networkConfig.elbAccountIds?.find(
        item => item.region === cdk.Stack.of(this).region,
      )!.accountId;
    }

    return elbAccountId;
  }

  /**
   * Function to create ELB access logs bucket
   * @param replicationProps {@link BucketReplicationProps}
   * @param elbAccountId string
   *
   * @returns bucket {@link cdk.aws_s3.IBucket} | undefined
   *
   * @remarks
   * Create S3 Bucket for ELB Access Logs, this is created in log archive account.
   * For ELB to write access logs bucket is needed to have SSE-S3 server-side encryption
   */
  private createElbAccessLogsBucket(
    replicationProps?: BucketReplicationProps,
    elbAccountId?: string,
  ): cdk.aws_s3.IBucket | undefined {
    const elbAccessLogsBucket = new Bucket(this, 'ElbAccessLogsBucket', {
      encryptionType: BucketEncryptionType.SSE_S3, // ELB Access Logs bucket does not support SSE-KMS
      s3BucketName: this.getElbLogsBucketName(),
      replicationProps,
      s3LifeCycleRules: this.getS3LifeCycleRules(this.props.globalConfig.logging.elbLogBucket?.lifecycleRules),
    });

    // To make sure central log bucket created before elb access log bucket, this is required when logging stack executes in home region
    if (this.centralLogsBucket) {
      elbAccessLogsBucket.node.addDependency(this.centralLogsBucket);
    }

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path:
            `/${this.stackName}/ElbAccessLogsBucket/ElbAccessLogsBucketReplication/` +
            pascalCase(this.centralLogsBucketName) +
            '-ReplicationRole/DefaultPolicy/Resource',
          reason: 'Allows only specific policy.',
        },
      ],
    });

    let elbPrincipal;
    if (elbAccountId) {
      elbPrincipal = new iam.AccountPrincipal(`${elbAccountId}`);
    } else {
      elbPrincipal = new iam.ServicePrincipal(`logdelivery.elasticloadbalancing.amazonaws.com`);
    }
    const policies = [
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow get acl access for SSM principal',
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetBucketAcl'],
        principals: [new iam.ServicePrincipal('ssm.amazonaws.com')],
        resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}`],
      }),
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow write access for ELB Account principal',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        principals: [elbPrincipal],
        resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}/*`],
      }),
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow write access for delivery logging service principal',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}/*`],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
        },
      }),
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow read bucket ACL access for delivery logging service principal',
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetBucketAcl'],
        principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
        resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}`],
      }),
    ];
    policies.forEach(item => {
      elbAccessLogsBucket.getS3Bucket().addToResourcePolicy(item);
    });

    elbAccessLogsBucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization principals to use of the bucket',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['s3:GetBucketLocation', 's3:PutObject'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: [
          `${elbAccessLogsBucket.getS3Bucket().bucketArn}`,
          `${elbAccessLogsBucket.getS3Bucket().bucketArn}/*`,
        ],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.S1,
      details: [
        {
          path: `${this.stackName}/ElbAccessLogsBucket/Resource/Resource`,
          reason: 'ElbAccessLogsBucket has server access logs disabled till the task for access logging completed.',
        },
      ],
    });

    this.elbLogBucketAddResourcePolicies(elbAccessLogsBucket.getS3Bucket());

    return elbAccessLogsBucket.getS3Bucket();
  }

  /**
   * Function to get or create server access log bucket
   * @returns bucket {@link cdk.aws_s3.IBucket} | undefined
   */
  private createOrGetServerAccessLogBucket(): cdk.aws_s3.IBucket | undefined {
    if (this.props.globalConfig.logging.accessLogBucket?.importedBucket) {
      const bucket = this.getImportedBucket(
        this.props.globalConfig.logging.accessLogBucket.importedBucket.name,
        AcceleratorImportedBucketType.SERVER_ACCESS_LOGS_BUCKET,
        's3',
      ).bucket;

      this.updateImportedBucketResourcePolicy({
        bucketConfig: this.props.globalConfig.logging.accessLogBucket,
        importedBucket: bucket,
        bucketType: AcceleratorImportedBucketType.SERVER_ACCESS_LOGS_BUCKET,
        overridePolicyFile: this.props.globalConfig.logging.accessLogBucket.customPolicyOverrides?.policy,
        organizationId: this.organizationId,
      });

      return bucket;
    }

    if (!this.isAccessLogsBucketEnabled) {
      this.logger.info(
        `AWS S3 access log bucket disable for ${cdk.Stack.of(this).account} account in ${
          cdk.Stack.of(this).region
        } region, server access logs bucket creation excluded`,
      );
      return undefined;
    }

    return this.createServerAccessLogBucket();
  }

  /**
   * Function to create server access log bucket.
   * @returns bucket {@link cdk.aws_s3.IBucket}
   */
  private createServerAccessLogBucket(): cdk.aws_s3.IBucket {
    //
    // Create S3 Bucket for Access Logs - this is required
    //
    const serverAccessLogsBucket = new Bucket(this, 'AccessLogsBucket', {
      encryptionType: BucketEncryptionType.SSE_S3, // Server access logging does not support SSE-KMS
      s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.s3AccessLogs}-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`,
      s3LifeCycleRules: this.getS3LifeCycleRules(this.props.globalConfig.logging.accessLogBucket?.lifecycleRules),
    });

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.S1,
      details: [
        {
          path: `${this.stackName}/AccessLogsBucket/Resource/Resource`,
          reason: 'AccessLogsBucket has server access logs disabled till the task for access logging completed.',
        },
      ],
    });

    serverAccessLogsBucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow write access for logging service principal',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        principals: [new iam.ServicePrincipal('logging.s3.amazonaws.com')],
        resources: [serverAccessLogsBucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );

    return serverAccessLogsBucket.getS3Bucket();
  }

  /**
   * Function to get existing or solution defined Central Log Bucket Encryption Key
   * @returns cdk.aws_kms.IKey
   *
   * @remarks
   * For stacks in logging account and centralizedLoggingRegion region, bucket will be present to get key arn.
   * All other environment stacks will need custom resource to get key arn from ssm parameter.
   */
  private getCentralLogBucketKey(): cdk.aws_kms.IKey {
    if (this.props.globalConfig.logging.centralLogBucket?.importedBucket?.name) {
      if (this.importedCentralLogBucket) {
        return this.importedCentralLogBucketKey!;
      } else {
        return this.getAcceleratorKey(AcceleratorKeyType.IMPORTED_CENTRAL_LOG_BUCKET, this.cloudwatchKey)!;
      }
    } else {
      if (this.centralLogsBucket) {
        return this.centralLogsBucket.getS3Bucket().getKey();
      } else {
        return this.getAcceleratorKey(AcceleratorKeyType.CENTRAL_LOG_BUCKET, this.cloudwatchKey)!;
      }
    }
  }
  /**
   * Function to create CloudWatch key
   * @param props {@link AcceleratorStackProps}
   * @returns cdk.aws_kms.IKey
   */
  private createCloudWatchKey(props: AcceleratorStackProps): cdk.aws_kms.IKey | undefined {
    if (!this.isCloudWatchLogsGroupCMKEnabled) {
      this.logger.info(
        `CloudWatch Encryption CMK disable for ${cdk.Stack.of(this).account} account in ${
          cdk.Stack.of(this).region
        } region, CMK creation excluded`,
      );
      return undefined;
    }
    // Create kms key for CloudWatch logs the CloudWatch key. Management account home region this key was created in prepare stack
    if (
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId() &&
      (cdk.Stack.of(this).region === this.props.globalConfig.homeRegion ||
        cdk.Stack.of(this).region === this.props.globalRegion)
    ) {
      return this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    } else {
      const cloudwatchKey = new cdk.aws_kms.Key(this, 'AcceleratorCloudWatchKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      cloudwatchKey.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Cloudwatch logs to use the encryption key`,
          principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
          actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'kms:EncryptionContext:aws:logs:arn': `arn:${this.props.partition}:logs:${
                cdk.Stack.of(this).region
              }:*:log-group:*`,
            },
          },
        }),
      );

      cloudwatchKey.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow EventBridge to send to encrypted CloudWatch log groups`,
          principals: [new cdk.aws_iam.ServicePrincipal('events.amazonaws.com')],
          actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
          resources: ['*'],
          conditions: {
            StringEqualsIfExists: {
              'aws:SourceAccount': cdk.Stack.of(this).account,
            },
          },
        }),
      );

      this.ssmParameters.push({
        logicalId: 'AcceleratorCloudWatchKmsArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
        stringValue: cloudwatchKey.keyArn,
      });

      return cloudwatchKey;
    }
  }

  /**
   * Function to create Lambda key
   * @param props {@link AcceleratorStackProps}
   * @returns cdk.aws_kms.IKey
   */
  private createLambdaKey(props: AcceleratorStackProps): cdk.aws_kms.IKey | undefined {
    if (!this.isLambdaCMKEnabled) {
      this.logger.info(
        `Lambda Encryption CMK disable for ${cdk.Stack.of(this).account} account in ${
          cdk.Stack.of(this).region
        } region, CMK creation excluded`,
      );
      return undefined;
    }
    // Create kms key for Lambda environment encryption
    // the Lambda environment encryption key for the management account
    // in the home region is created in the prepare stack
    if (
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId() &&
      (cdk.Stack.of(this).region === this.props.globalConfig.homeRegion ||
        cdk.Stack.of(this).region === this.props.globalRegion)
    ) {
      return this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);
    } else {
      const key = new cdk.aws_kms.Key(this, 'AcceleratorLambdaKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.lambda.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.lambda.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      this.ssmParameters.push({
        logicalId: 'AcceleratorLambdaKmsArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.lambdaCmkArn,
        stringValue: key.keyArn,
      });

      return key;
    }
  }
  /**
   * Function to create SQS queue key
   * @returns cdk.aws_kms.IKey
   */
  private createSqsKey(): cdk.aws_kms.IKey | undefined {
    if (!this.isSqsQueueCMKEnabled) {
      this.logger.info(
        `SQS Queue Encryption CMK disable for ${cdk.Stack.of(this).account} account in ${
          cdk.Stack.of(this).region
        } region, CMK creation excluded`,
      );
      return undefined;
    }

    const key = new cdk.aws_kms.Key(this, 'AcceleratorSqsKey', {
      alias: this.acceleratorResourceNames.customerManagedKeys.sqs.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.sqs.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.ssmParameters.push({
      logicalId: 'AcceleratorSqsKmsArnParameter',
      parameterName: this.acceleratorResourceNames.parameters.sqsCmkArn,
      stringValue: key.keyArn,
    });

    return key;
  }
  /***
   * Function to normalize extension for firehose generated logs
   */
  private normalizeExtension(extension: string | undefined): string | undefined {
    if (!extension) {
      return undefined;
    }
    return extension.startsWith('.') ? extension : `.${extension}`;
  }

  /**
   * Function to configure block S3 public access
   * @param props {@link AcceleratorStackProps}
   * @returns  S3PublicAccessBlock | undefined
   */
  private configureS3PublicAccessBlock(props: AcceleratorStackProps): S3PublicAccessBlock | undefined {
    //
    // Block Public Access; S3 is global, only need to call in home region. This is done in the
    // logging-stack instead of the security-stack since initial buckets are created in this stack.
    //
    let s3PublicAccessBlock: S3PublicAccessBlock | undefined;
    if (
      cdk.Stack.of(this).region === this.props.globalConfig.homeRegion &&
      !this.isAccountExcluded(props.securityConfig.centralSecurityServices.s3PublicAccessBlock.excludeAccounts ?? [])
    ) {
      if (props.securityConfig.centralSecurityServices.s3PublicAccessBlock.enable) {
        s3PublicAccessBlock = new S3PublicAccessBlock(this, 'S3PublicAccessBlock', {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
          accountId: cdk.Stack.of(this).account,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }

    return s3PublicAccessBlock;
  }

  /**
   * Function to create SNS topics
   * @param props {@link AcceleratorStackProps}
   */
  private createSnsTopics(props: AcceleratorStackProps): void {
    // SNS Topics creation
    if (
      props.globalConfig.snsTopics &&
      cdk.Stack.of(this).account === props.accountsConfig.getLogArchiveAccountId() &&
      !this.isRegionExcluded(props.globalConfig.snsTopics?.deploymentTargets.excludedRegions ?? [])
    ) {
      this.createCentralSnsKey();

      for (const snsTopic of props.globalConfig.snsTopics?.topics ?? []) {
        this.createLoggingAccountSnsTopic(snsTopic, this.centralSnsKey!);
      }
    }

    if (
      this.isIncluded(props.globalConfig.snsTopics?.deploymentTargets ?? new t.DeploymentTargets()) &&
      cdk.Stack.of(this).account !== props.accountsConfig.getLogArchiveAccountId()
    ) {
      const snsKey = this.createSnsKey();
      this.createSnsForwarderFunction();
      for (const snsTopic of props.globalConfig.snsTopics?.topics ?? []) {
        this.createSnsTopic(snsTopic, snsKey);
      }
    }
  }

  /**
   * Function to create S3 Key
   * @returns cdk.aws_kms.IKey | undefined
   */
  private createS3KmsKey(): cdk.aws_kms.IKey | undefined {
    if (!this.isS3CMKEnabled) {
      this.logger.info(
        `AWS S3 Encryption CMK disable for ${cdk.Stack.of(this).account} account in ${
          cdk.Stack.of(this).region
        } region, CMK creation excluded`,
      );
      return undefined;
    }
    //
    // Crete S3 key in every account except audit account,
    // this is required for SSM automation to get right KMS key to encrypt unencrypted bucket
    if (cdk.Stack.of(this).account === this.props.accountsConfig.getAuditAccountId()) {
      return this.createAuditAccountS3Key();
    }
    this.logger.debug(`Create S3 non audit KMS Key`);
    const s3Key = this.createNonAuditS3Key();
    this.ssmParameters.push({
      logicalId: 'AcceleratorS3KmsArnParameter',
      parameterName: this.acceleratorResourceNames.parameters.s3CmkArn,
      stringValue: s3Key.keyArn,
    });

    return s3Key;
  }

  private createNonAuditS3Key(): cdk.aws_kms.Key {
    const s3Key = new cdk.aws_kms.Key(this, 'Accelerator3Key', {
      alias: this.acceleratorResourceNames.customerManagedKeys.s3.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.s3.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow S3 to use the encryption key`,
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `s3.${cdk.Stack.of(this).region}.amazonaws.com`,
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow AWS Services to encrypt and describe logs',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyPair',
          'kms:GenerateDataKeyPairWithoutPlaintext',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:ReEncryptFrom',
          'kms:ReEncryptTo',
        ],
        principals: [new cdk.aws_iam.ServicePrincipal(`delivery.logs.amazonaws.com`)],
        resources: ['*'],
      }),
    );
    return s3Key;
  }

  /**
   * Function to create Audit account S3 bucket encryption Key
   * @returns cdk.aws_kms.IKey | undefined
   */
  private createAuditAccountS3Key(): cdk.aws_kms.IKey | undefined {
    if (!this.isS3CMKEnabled) {
      this.logger.info(
        `AWS S3 Encryption CMK disable for ${cdk.Stack.of(this).account} account in ${
          cdk.Stack.of(this).region
        } region, CMK creation excluded`,
      );
      return undefined;
    }
    this.logger.debug(`Create S3 Key`);
    const s3Key = new cdk.aws_kms.Key(this, 'AcceleratorAuditS3Key', {
      alias: this.acceleratorResourceNames.customerManagedKeys.s3.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.s3.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow S3 to use the encryption key`,
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `s3.${cdk.Stack.of(this).region}.amazonaws.com`,
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow services to confirm encryption',
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    const allowedServicePrincipals: { name: string; principal: string }[] = [];

    allowedServicePrincipals.push({ name: 'CloudTrail', principal: 'cloudtrail.amazonaws.com' });

    if (this.props.securityConfig.centralSecurityServices.auditManager?.enable) {
      allowedServicePrincipals.push({ name: 'AuditManager', principal: 'auditmanager.amazonaws.com' });
      s3Key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Audit Manager service to provision encryption key grants`,
          principals: [new cdk.aws_iam.AnyPrincipal()],
          actions: ['kms:CreateGrant'],
          conditions: {
            StringLike: {
              'kms:ViaService': 'auditmanager.*.amazonaws.com',
              ...this.getPrincipalOrgIdCondition(this.organizationId),
            },
            Bool: { 'kms:GrantIsForAWSResource': 'true' },
          },
          resources: ['*'],
        }),
      );
    }

    allowedServicePrincipals.forEach(item => {
      s3Key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow ${item.name} service to use the encryption key`,
          principals: [new cdk.aws_iam.ServicePrincipal(item.principal)],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: ['*'],
        }),
      );
    });

    this.ssmParameters.push({
      logicalId: 'AcceleratorS3KmsArnParameter',
      parameterName: this.acceleratorResourceNames.parameters.s3CmkArn,
      stringValue: s3Key.keyArn,
    });

    return s3Key;
  }

  /**
   * Function to get VPC flow logs configuration when any VPC have S3 flow logs destination
   */
  private getS3FlowLogsDestinationConfig(): VpcFlowLogsConfig | undefined {
    let vpcFlowLogs: VpcFlowLogsConfig | undefined;
    for (const vpcItem of [...this.props.networkConfig.vpcs, ...(this.props.networkConfig.vpcTemplates ?? [])]) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);
      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        if (vpcItem.vpcFlowLogs) {
          vpcFlowLogs = vpcItem.vpcFlowLogs;
        } else {
          vpcFlowLogs = this.props.networkConfig.vpcFlowLogs;
        }
        if (vpcFlowLogs && vpcFlowLogs.destinations.includes('s3')) {
          return vpcFlowLogs;
        }
      }
    }
    return undefined;
  }

  /**
   * Function to create VPC FlowLogs bucket.
   * This bucket depends on Central Logs bucket and Server access logs bucket.
   * This bucket also depends on local S3 key.
   * @param replicationProps {@link BucketReplicationProps}
   * @param s3Key {@link cdk.aws_kms.IKey} | undefined
   * @param serverAccessLogsBucket {@link cdk.aws_s3.IBucket} | undefined
   */
  private createVpcFlowLogsBucket(
    replicationProps: BucketReplicationProps,
    s3Key?: cdk.aws_kms.IKey,
    serverAccessLogsBucket?: cdk.aws_s3.IBucket,
  ) {
    const vpcFlowLogsConfig = this.getS3FlowLogsDestinationConfig();
    if (vpcFlowLogsConfig) {
      this.logger.info(`Create S3 bucket for VPC flow logs destination`);

      const vpcFlowLogsBucket = new Bucket(this, 'AcceleratorVpcFlowLogsBucket', {
        encryptionType: this.isS3CMKEnabled ? BucketEncryptionType.SSE_KMS : BucketEncryptionType.SSE_S3,
        s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.vpcFlowLogs}-${cdk.Stack.of(this).account}-${
          cdk.Stack.of(this).region
        }`,
        kmsKey: s3Key,
        serverAccessLogsBucket,
        s3LifeCycleRules: this.getS3LifeCycleRules(vpcFlowLogsConfig.destinationsConfig?.s3?.lifecycleRules),
        replicationProps: replicationProps,
      });

      if (!serverAccessLogsBucket) {
        // AwsSolutions-S1: The S3 Bucket has server access logs disabled
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.S1,
          details: [
            {
              path: `/${this.stackName}/AcceleratorVpcFlowLogsBucket/Resource/Resource`,
              reason: 'Due to configuration settings, server access logs have been disabled.',
            },
          ],
        });
      }

      vpcFlowLogsBucket.getS3Bucket().addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow read bucket ACL access for delivery logging service principal',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['s3:GetBucketAcl'],
          principals: [new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          resources: [`${vpcFlowLogsBucket.getS3Bucket().bucketArn}`],
        }),
      );

      vpcFlowLogsBucket.getS3Bucket().addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          principals: [new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          actions: ['s3:GetBucketAcl', 's3:ListBucket'],
          resources: [vpcFlowLogsBucket.getS3Bucket().bucketArn],
        }),
      );

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path:
              `${this.stackName}/AcceleratorVpcFlowLogsBucket/AcceleratorVpcFlowLogsBucketReplication/` +
              pascalCase(this.centralLogsBucketName) +
              '-ReplicationRole/DefaultPolicy/Resource',
            reason: 'Allows only specific policy.',
          },
        ],
      });

      this.ssmParameters.push({
        logicalId: 'AcceleratorVpcFlowLogsBucketArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.flowLogsDestinationBucketArn,
        stringValue: vpcFlowLogsBucket.getS3Bucket().bucketArn,
      });
    }
  }

  private cloudwatchLogReceivingAccount(centralLogsBucketName: string, lambdaKey?: cdk.aws_kms.IKey) {
    const logsReplicationKmsKey = new cdk.aws_kms.Key(this, 'LogsReplicationKey', {
      alias: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLogReplication.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLogReplication.description,
      enableKeyRotation: true,
      // kms is used to encrypt kinesis data stream,
      // unlike data store like s3, rds, dynamodb no snapshot/object is encrypted
      // it can be destroyed as encrypts service
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // // Create Kinesis Data Stream
    // Kinesis Stream - data stream which will get data from CloudWatch logs
    const dataStreamMode =
      this.props.globalConfig.logging.cloudwatchLogs?.kinesis?.streamingMode ?? StreamMode.PROVISIONED;
    const logsKinesisStreamCfn = new cdk.aws_kinesis.CfnStream(this, 'LogsKinesisStreamCfn', {
      retentionPeriodHours: this.props.globalConfig.logging.cloudwatchLogs?.kinesis?.retention ?? 24,
      streamEncryption: {
        encryptionType: 'KMS',
        keyId: logsReplicationKmsKey.keyArn,
      },
      streamModeDetails: {
        streamMode: dataStreamMode,
      },
      ...(dataStreamMode === StreamMode.PROVISIONED && {
        shardCount: this.props.globalConfig.logging.cloudwatchLogs?.kinesis?.shardCount ?? 1,
      }),
    });
    const logsKinesisStream = cdk.aws_kinesis.Stream.fromStreamArn(
      this,
      'LogsKinesisStream',
      logsKinesisStreamCfn.attrArn,
    );

    // LogsKinesisStream/Resource AwsSolutions-KDS3
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.KDS3,
      details: [
        {
          path: `${this.stackName}/LogsKinesisStreamCfn`,
          reason: 'Customer managed key is being used to encrypt Kinesis Data Stream',
        },
      ],
    });

    // Cloudwatch logs destination which points to Kinesis Data Stream
    const cloudwatchCfnDestination = new CloudWatchDestination(this, 'LogsDestinationSetup', {
      kinesisKmsKey: logsReplicationKmsKey,
      kinesisStream: logsKinesisStream,
      organizationId: this.organizationId,
      partition: this.props.partition,
      accountIds:
        this.props.partition === 'aws-cn' || !this.organizationId
          ? this.props.accountsConfig.getAccountIds()
          : undefined,
      acceleratorPrefix: this.props.prefixes.accelerator,
      useExistingRoles: this.props.useExistingRoles ?? false,
    });

    // Setup Firehose to take records from Kinesis and place in S3
    // Dynamic partition incoming records
    // so files from particular log group can be placed in their respective S3 prefix
    const cloudWatchToS3Firehose = new CloudWatchToS3Firehose(this, 'FirehoseToS3Setup', {
      dynamicPartitioningValue: this.props.globalConfig.logging.cloudwatchLogs?.dynamicPartitioning ?? undefined,
      dynamicPartitioningByAccountId:
        this.props.globalConfig.logging.cloudwatchLogs?.dynamicPartitioningByAccountId ?? false,
      bucketName: centralLogsBucketName,
      kinesisStream: logsKinesisStream,
      firehoseKmsKey: this.centralLogBucketKey!, // for firehose to access s3
      kinesisKmsKey: logsReplicationKmsKey, // for firehose to access kinesis
      homeRegion: this.props.globalConfig.homeRegion,
      lambdaKey: lambdaKey, // to encrypt lambda environment
      configDir: this.props.configDirPath,
      acceleratorPrefix: this.props.prefixes.accelerator,
      useExistingRoles: this.props.useExistingRoles ?? false,
      firehoseRecordsProcessorFunctionName:
        this.acceleratorResourceNames.parameters.firehoseRecordsProcessorFunctionName,
      logsKmsKey: this.cloudwatchKey,
      logsRetentionInDaysValue: this.props.globalConfig.cloudwatchLogRetentionInDays.toString(),
      firehoseLogExtension: this.normalizeExtension(
        this.props.globalConfig.logging.cloudwatchLogs?.firehose?.fileExtension,
      ),
      firehoseLambdaProcessorRetries: (
        this.props.globalConfig.logging.cloudwatchLogs?.firehose?.lambdaProcessor?.retries ?? 3
      ).toString(),
      firehoseLambdaProcessorBufferSize: (
        this.props.globalConfig.logging.cloudwatchLogs?.firehose?.lambdaProcessor?.bufferSize ?? 0.2
      ).toString(),
      firehoseLambdaProcessorBufferInterval: (
        this.props.globalConfig.logging.cloudwatchLogs?.firehose?.lambdaProcessor?.bufferInterval ?? 60
      ).toString(),
    });

    if (this.centralLogsBucket) {
      cloudWatchToS3Firehose.node.addDependency(this.centralLogsBucket);
    }

    return cloudwatchCfnDestination;
  }
  private cloudwatchLogCreatingAccount() {
    const logsDestinationArnValue =
      'arn:' +
      this.props.partition +
      ':logs:' +
      cdk.Stack.of(this).region +
      ':' +
      this.props.accountsConfig.getLogArchiveAccountId() +
      ':destination:' +
      `${this.props.prefixes.accelerator}CloudWatchToS3`;

    // Since this is deployed organization wide, this role is required
    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CreateSubscriptionFilter-IAMrole.html
    const subscriptionFilterRole = new cdk.aws_iam.Role(this, 'SubscriptionFilterRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`),
      description: 'Role used by Subscription Filter to allow access to CloudWatch Destination',
      inlinePolicies: {
        accessLogEvents: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: [`arn:${this.props.partition}:logs:${cdk.Stack.of(this).region}:*:log-group:*:*`],
              actions: ['logs:PutLogEvents'],
            }),
          ],
        }),
      },
    });

    const exclusionAccountMap: cloudwatchExclusionProcessedItem[] = this.prepareCloudWatchExclusionList(
      this.props.globalConfig.logging.cloudwatchLogs?.exclusions ?? [],
    );
    let accountRegionExclusion: cloudwatchExclusionProcessedItem | undefined;
    if (exclusionAccountMap.length > 0) {
      const accountSpecificExclusion = exclusionAccountMap.filter(obj => {
        return obj.account === cdk.Stack.of(this).account && obj.region === cdk.Stack.of(this).region;
      });
      if (accountSpecificExclusion.length > 1) {
        this.logger.error(
          `(Multiple cloudwatch exclusions ${JSON.stringify(accountSpecificExclusion)} found for account: ${
            cdk.Stack.of(this).account
          } in region: ${cdk.Stack.of(this).region}`,
        );
      } else {
        accountRegionExclusion = exclusionAccountMap.find(obj => {
          return obj.account === cdk.Stack.of(this).account && obj.region === cdk.Stack.of(this).region;
        });
      }
    }
    // Run a custom resource to update subscription, KMS and retention for all existing log groups
    const customResourceExistingLogs = new CloudWatchLogsSubscriptionFilter(this, 'LogsSubscriptionFilter', {
      logDestinationArn: logsDestinationArnValue,
      logsKmsKey: this.cloudwatchKey,
      logArchiveAccountId: this.props.accountsConfig.getLogArchiveAccountId(),
      logsRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays.toString(),
      subscriptionFilterRoleArn: subscriptionFilterRole.roleArn,
      logExclusionOption: accountRegionExclusion,
      replaceLogDestinationArn: this.props.globalConfig.logging.cloudwatchLogs?.replaceLogDestinationArn,
      acceleratorPrefix: this.props.prefixes.accelerator,
      useExistingRoles: this.props.useExistingRoles ?? false,
      // if no type is specified then assume that subscription filter has to be applied to each log group
      subscriptionType: this.props.globalConfig.logging.cloudwatchLogs?.subscription?.type ?? 'LOG_GROUP',
      selectionCriteria: this.props.globalConfig.logging.cloudwatchLogs?.subscription?.selectionCriteria,
      overrideExisting: this.props.globalConfig.logging.cloudwatchLogs?.subscription?.overrideExisting,
      filterPattern: this.props.globalConfig.logging.cloudwatchLogs?.subscription?.filterPattern,
    });

    //For every new log group that is created, set up subscription, KMS and retention
    const newLogCreationEvent = new NewCloudWatchLogEvent(this, 'NewCloudWatchLogsCreateEvent', {
      logDestinationArn: logsDestinationArnValue,
      lambdaEnvKey: this.lambdaKey,
      logsKmsKey: this.cloudwatchKey,
      logArchiveAccountId: this.props.accountsConfig.getLogArchiveAccountId(),
      logsRetentionInDaysValue: this.props.globalConfig.cloudwatchLogRetentionInDays.toString(),
      subscriptionFilterRoleArn: subscriptionFilterRole.roleArn,
      exclusionSetting: accountRegionExclusion!,
      acceleratorPrefix: this.props.prefixes.accelerator,
      useExistingRoles: this.props.useExistingRoles ?? false,
      // if no type is specified then assume that subscription filter has to be applied to each log group
      subscriptionType: this.props.globalConfig.logging.cloudwatchLogs?.subscription?.type ?? 'LOG_GROUP',
      sqsKey: this.sqsKey,
    });

    // create custom resource before the new log group logic is created.
    newLogCreationEvent.node.addDependency(customResourceExistingLogs);

    // SubscriptionFilterRole AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/SubscriptionFilterRole/Resource`,
          reason: 'Access is needed to ready all log events across all log groups for replication to S3.',
        },
      ],
    });

    // SetLogRetentionSubscriptionFunction AwsSolutions-IAM4
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/SetLogRetentionSubscriptionFunction/ServiceRole/Resource`,
          reason: 'AWS Managed policy for Lambda basic execution attached.',
        },
      ],
    });

    // SetLogRetentionSubscriptionFunction AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/NewCloudWatchLogsCreateEvent/SetLogRetentionSubscriptionFunction/ServiceRole/DefaultPolicy/Resource`,
          reason:
            'This role needs permissions to change retention and subscription filter for any new log group that is created to enable log replication.',
        },
      ],
    });

    // SetLogRetentionSubscriptionFunction AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/NewCloudWatchLogsCreateEvent/SetLogRetentionSubscriptionFunction/ServiceRole/Resource`,
          reason:
            'This role needs permissions to change retention and subscription filter for any new log group that is created to enable log replication.',
        },
      ],
    });

    return customResourceExistingLogs;
  }

  /**
   * Function to get CloudWatch Exclusion Processed Items
   * @param exclusionList {@link CloudWatchLogsExclusionConfig}[]
   * @returns cloudwatchExclusionProcessedItem[] {@link cloudwatchExclusionProcessedItem}
   */
  private getCloudWatchExclusionProcessedItems(
    exclusionList: CloudWatchLogsExclusionConfig[],
  ): cloudwatchExclusionProcessedItem[] {
    const processedItems: cloudwatchExclusionProcessedItem[] = [];
    for (const exclusion of exclusionList) {
      processedItems.push(...this.convertCloudWatchExclusionToAccountIds(exclusion));
    }
    return processedItems;
  }

  /**
   * Find the unique account, region pair in the given input
   * @param processedItems {@link cloudwatchExclusionProcessedItem}
   * @returns excludeUniqueItemType[] {@link excludeUniqueItemType}
   */
  private getCloudWatchExcludeUniqueMap(processedItems: cloudwatchExclusionProcessedItem[]): excludeUniqueItemType[] {
    const excludeItemsMapUnique: excludeUniqueItemType[] = [];
    processedItems.forEach(item => {
      const output = { account: item.account, region: item.region };
      const findItem = excludeItemsMapUnique.find(obj => {
        return obj.account === output.account && obj.region === output.region;
      });

      if (!findItem) {
        excludeItemsMapUnique.push(output);
      }
    });
    return excludeItemsMapUnique;
  }

  private prepareCloudWatchExclusionList(exclusionList: CloudWatchLogsExclusionConfig[]) {
    exclusionList.push({
      accounts: ['LogArchive'],
      regions: this.props.globalConfig.enabledRegions,
      logGroupNames: [`/aws/lambda/${this.props.prefixes.accelerator}-FirehoseRecordsProcessor`],
      organizationalUnits: undefined,
      excludeAll: undefined,
    });

    // Input will be an array of OUs and account.
    // Decompose input to account Ids with single regions
    const processedItems = this.getCloudWatchExclusionProcessedItems(exclusionList);

    const excludeItemsMapUnique = this.getCloudWatchExcludeUniqueMap(processedItems);

    const output: cloudwatchExclusionProcessedItem[] = [];
    for (const uniqueElement of excludeItemsMapUnique) {
      //pick objects from main array which match uniqueElement
      const filteredItems: cloudwatchExclusionProcessedItem[] | undefined = processedItems.filter(item => {
        return item.account === uniqueElement.account && item.region === uniqueElement.region;
      });
      if (filteredItems) {
        // merge excludeAll - if for an account/region there is even one excludeAll then exclude (like IAM policies do Deny)
        // merge logGroupsNames - merge all arrays and run Set to remove duplicates

        const allLogGroupNames: string[] = [];
        let globalExclude: boolean | undefined = undefined;
        filteredItems.forEach(obj => {
          if (obj.excludeAll) {
            globalExclude = true;
          }
        });
        filteredItems.forEach(obj => {
          if (obj.logGroupNames) {
            allLogGroupNames.push(...obj.logGroupNames);
          }
        });
        output.push({
          account: uniqueElement.account,
          region: uniqueElement.region,
          excludeAll: globalExclude,
          logGroupNames: Array.from(new Set(allLogGroupNames)),
        });
      }
    }
    return output;
  }

  private convertCloudWatchExclusionToAccountIds(exclusion: CloudWatchLogsExclusionConfig) {
    const output: cloudwatchExclusionProcessedItem[] = [];
    if (exclusion.organizationalUnits) {
      const accountsNamesInOu = this.getAccountsFromOu(exclusion.organizationalUnits);
      const getOuExclusionList: cloudwatchExclusionProcessedItem[] =
        this.convertCloudWatchExclusionAccountsToAccountIds(accountsNamesInOu, exclusion);

      output.push(...getOuExclusionList);
    }
    if (exclusion.accounts) {
      const getAccountExclusionList: cloudwatchExclusionProcessedItem[] =
        this.convertCloudWatchExclusionAccountsToAccountIds(exclusion.accounts, exclusion);
      output.push(...getAccountExclusionList);
    }
    return output;
  }
  private getAccountsFromOu(ouNames: string[]) {
    const allAccounts = [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts];
    const allAccountNames: string[] = [];
    if (ouNames.includes('Root')) {
      // root means all accounts
      for (const allAccountItem of allAccounts) {
        allAccountNames.push(allAccountItem.name);
      }
    } else {
      for (const ouName of ouNames) {
        // look in all accounts for specific OU
        for (const allAccountItem of allAccounts) {
          if (ouName === allAccountItem.organizationalUnit) {
            allAccountNames.push(allAccountItem.name);
          }
        }
      }
    }
    return allAccountNames;
  }

  private convertCloudWatchExclusionAccountsToAccountIds(
    accountsList: string[],
    exclusion: CloudWatchLogsExclusionConfig,
  ) {
    const output: cloudwatchExclusionProcessedItem[] = [];
    for (const accountItem of accountsList) {
      const outputItem: cloudwatchExclusionProcessedItem[] = this.reduceCloudWatchExclusionAccountByRegion(
        accountItem,
        exclusion,
      );
      output.push(...outputItem);
    }
    return output;
  }
  private reduceCloudWatchExclusionAccountByRegion(accountItem: string, exclusion: CloudWatchLogsExclusionConfig) {
    const processedItems: cloudwatchExclusionProcessedItem[] = [];
    for (const regionItem of exclusion.regions ?? this.props.globalConfig.enabledRegions) {
      const singleProcessedItem: cloudwatchExclusionProcessedItem = {
        account: this.props.accountsConfig.getAccountId(accountItem),
        region: regionItem,
        excludeAll: exclusion.excludeAll,
        logGroupNames: exclusion.logGroupNames,
      };
      processedItems.push(singleProcessedItem);
    }
    return processedItems;
  }

  /**
   * Function to Create Managed active directory admin user secrets key
   */
  private createManagedDirectoryAdminSecretsManagerKey() {
    for (const managedActiveDirectory of this.props.iamConfig.managedActiveDirectories ?? []) {
      if (this.isManagedByAseaGlobal(AseaResourceType.MANAGED_AD, managedActiveDirectory.name)) {
        this.logger.info(`${managedActiveDirectory.name} is managed by ASEA, skipping creation of resources.`);
        return;
      }
      const madAccountId = this.props.accountsConfig.getAccountId(managedActiveDirectory.account);
      const madAdminSecretAccountId = this.props.accountsConfig.getAccountId(
        this.props.iamConfig.getManageActiveDirectorySecretAccountName(managedActiveDirectory.name),
      );
      const madAdminSecretRegion = this.props.iamConfig.getManageActiveDirectorySecretRegion(
        managedActiveDirectory.name,
      );

      if (cdk.Stack.of(this).account == madAdminSecretAccountId && cdk.Stack.of(this).region == madAdminSecretRegion) {
        const key = new cdk.aws_kms.Key(this, 'AcceleratorSecretsManagerKmsKey', {
          alias: this.acceleratorResourceNames.customerManagedKeys.secretsManager.alias,
          description: this.acceleratorResourceNames.customerManagedKeys.secretsManager.description,
          enableKeyRotation: true,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow MAD instance role to access the key`,
            principals: [new cdk.aws_iam.AccountPrincipal(madAccountId)],
            actions: ['kms:Decrypt'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'kms:ViaService': `secretsmanager.${cdk.Stack.of(this).region}.amazonaws.com`,
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
              StringLike: {
                'kms:EncryptionContext:SecretARN': `arn:${cdk.Stack.of(this).partition}:secretsmanager:${
                  cdk.Stack.of(this).region
                }:${madAdminSecretAccountId}:secret:${this.props.prefixes.secretName}/ad-user/*`,
              },
            },
          }),
        );

        const secretsManagerKmsKeyArnParameter = new cdk.aws_ssm.StringParameter(
          this,
          'AcceleratorSecretsManagerKmsKeyArnParameter',
          {
            parameterName: this.acceleratorResourceNames.parameters.secretsManagerCmkArn,
            stringValue: key.keyArn,
          },
        );

        // Create role to give access to Secret manager KSM arn parameter, this will be used by MAD account to give access to this KMS for MAD instance
        new cdk.aws_iam.Role(this, 'CrossAccountAcceleratorSecretsKmsArnSsmParamAccessRole', {
          roleName: this.acceleratorResourceNames.roles.crossAccountSecretsCmkParameterAccess,
          assumedBy: this.getOrgPrincipals(this.organizationId, true),
          inlinePolicies: {
            default: new cdk.aws_iam.PolicyDocument({
              statements: [
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                  resources: [secretsManagerKmsKeyArnParameter.parameterArn],
                  conditions: {
                    ArnLike: {
                      'aws:PrincipalARN': [
                        `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-*`,
                      ],
                    },
                  },
                }),
                new cdk.aws_iam.PolicyStatement({
                  effect: cdk.aws_iam.Effect.ALLOW,
                  actions: ['ssm:DescribeParameters'],
                  resources: ['*'],
                  conditions: {
                    ArnLike: {
                      'aws:PrincipalARN': [
                        `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-*`,
                      ],
                    },
                  },
                }),
              ],
            }),
          },
        });
        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
        // rule suppression with evidence for this permission.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/CrossAccountAcceleratorSecretsKmsArnSsmParamAccessRole/Resource`,
              reason: 'Cross account kms arn SSM parameter needs access from other accounts',
            },
          ],
        });

        return; // Create only one kms key even if there are multiple AD
      }
    }
  }

  /**
   * Function to create KMS Keys defined in config file
   */
  private createKeys(autoScalingSlr?: ServiceLinkedRole, cloud9Slr?: ServiceLinkedRole) {
    if (!this.props.securityConfig.keyManagementService) {
      return;
    }

    for (const keyItem of this.props.securityConfig.keyManagementService.keySets) {
      if (!this.isIncluded(keyItem.deploymentTargets)) {
        this.logger.info(`KMS Key ${keyItem.name} excluded`);
        continue;
      }
      this.logger.debug(`Create KMS Key ${keyItem.name}`);

      const key = new cdk.aws_kms.Key(this, 'AcceleratorKmsKey-' + pascalCase(keyItem.name), {
        alias: keyItem.alias,
        description: keyItem.description,
        enabled: keyItem.enabled,
        enableKeyRotation: keyItem.enableKeyRotation,
        removalPolicy: keyItem.removalPolicy as cdk.RemovalPolicy,
      });
      // Add dependency on service-linked roles
      // This is required for KMS keys to reference SLRs
      // in their key policies
      if (autoScalingSlr) {
        key.node.addDependency(autoScalingSlr.resource);
      }
      if (cloud9Slr) {
        key.node.addDependency(cloud9Slr.resource);
      }

      if (keyItem.policy) {
        // Read in the policy document which should be properly formatted json
        const policyDocument = JSON.parse(
          this.generatePolicyReplacements(
            path.join(this.props.configDirPath, keyItem.policy),
            false,
            this.organizationId,
          ),
        );

        // Create a statements list using the PolicyStatement factory
        const statements: cdk.aws_iam.PolicyStatement[] = [];
        for (const statement of policyDocument.Statement) {
          statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
        }

        // Attach statements to key policy
        statements.forEach(item => key.addToResourcePolicy(item));
      }

      // Create SSM parameter
      this.ssmParameters.push({
        logicalId: 'AcceleratorKmsArnParameter-' + pascalCase(keyItem.name),
        parameterName: `${this.props.prefixes.ssmParamName}/kms/${keyItem.name}/key-arn`,
        stringValue: key.keyArn,
      });

      // AwsSolutions-S1: The KMS Symmetric key does not have automatic key rotation enabled.
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.S1,
        details: [
          {
            path: `${this.stackName}` + '/AcceleratorKmsKey-' + pascalCase(keyItem.name) + `/Resource`,
            reason: 'CMK policy defined by customer provided policy definition file.',
          },
        ],
      });
    }
  }

  /**
   * Create list of principal needs access to CentralLogs bucket
   * @returns
   */
  private createCentralLogsBucketPrincipalAndPrefixes(): CentralLogsBucketPrincipalAndPrefixesType {
    const awsPrincipalAccesses: AwsPrincipalAccessesType[] = [];
    const bucketPrefixes: string[] = [];
    if (this.props.securityConfig.centralSecurityServices.macie.enable) {
      awsPrincipalAccesses.push({
        name: 'Macie',
        principal: 'macie.amazonaws.com',
        accessType: BucketAccessType.READWRITE,
      });

      for (const region of this.props.globalConfig.enabledRegions) {
        if (
          OptInRegions.includes(region) &&
          !this.props.securityConfig.centralSecurityServices.macie.excludeRegions?.includes(region)
        ) {
          awsPrincipalAccesses.push({
            name: `Macie-${region}`,
            principal: `macie.${region}.amazonaws.com`,
            accessType: BucketAccessType.READWRITE,
          });
        }
      }
    }

    if (this.props.securityConfig.centralSecurityServices.guardduty.enable) {
      awsPrincipalAccesses.push({
        name: 'Guardduty',
        principal: 'guardduty.amazonaws.com',
        accessType: BucketAccessType.READWRITE,
      });
      let guardDutyPrefix: string | undefined = 'guardduty';
      if (
        this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideGuardDutyPrefix
          ?.useCustomPrefix
      ) {
        guardDutyPrefix =
          this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideGuardDutyPrefix
            ?.customOverride ?? undefined;
      }
      if (guardDutyPrefix) {
        bucketPrefixes.push(guardDutyPrefix);
      }

      for (const region of this.props.globalConfig.enabledRegions) {
        if (OptInRegions.includes(region)) {
          awsPrincipalAccesses.push({
            name: `Guardduty-${region}`,
            principal: `guardduty.${region}.amazonaws.com`,
            accessType: BucketAccessType.READWRITE,
          });
          let guardDutyPrefix: string | undefined = 'guardduty';
          if (
            !this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideGuardDutyPrefix
              ?.useCustomPrefix
          ) {
            guardDutyPrefix =
              this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.overrideGuardDutyPrefix
                ?.customOverride ?? undefined;
          }
          if (guardDutyPrefix) {
            bucketPrefixes.push(guardDutyPrefix);
          }
        }
      }
    }

    if (this.props.securityConfig.centralSecurityServices.auditManager?.enable) {
      awsPrincipalAccesses.push({
        name: 'AuditManager',
        principal: 'auditmanager.amazonaws.com',
        accessType: BucketAccessType.READWRITE,
      });
    }

    if (this.props.globalConfig.logging.sessionManager.sendToS3) {
      this.logger.debug(`Grant Session Manager access to Central Logs Bucket.`);
      awsPrincipalAccesses.push({
        name: 'SessionManager',
        principal: 'session-manager.amazonaws.com',
        accessType: BucketAccessType.NO_ACCESS,
      });
    }

    return { awsPrincipalAccesses: awsPrincipalAccesses, bucketPrefixes: bucketPrefixes };
  }

  /**
   * Function to get existing bucket
   * @param importedBucketName string
   * @param bucketType {@link AcceleratorImportedBucketType}
   * @param encryptionType 'kms' | 's3'
   * @returns bucket {@link cdk.aws_s3.IBucket}
   */
  private getImportedBucket(
    importedBucketName: string,
    bucketType: AcceleratorImportedBucketType,
    encryptionType: 'kms' | 's3',
  ): { bucket: cdk.aws_s3.IBucket; bucketKmsArn: string | undefined } {
    // Get existing bucket
    const bucket = cdk.aws_s3.Bucket.fromBucketName(
      this,
      pascalCase(`Imported${bucketType}Bucket`),
      this.getBucketNameReplacement(importedBucketName),
    );

    const validateBucket = new ValidateBucket(this, pascalCase(`ValidateImported${bucketType}Bucket`), {
      bucket: bucket,
      validationCheckList: ['encryption'],
      encryptionType,
      customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
      customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
      customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
    });

    return { bucket: bucket, bucketKmsArn: validateBucket.bucketKmsArn };
  }

  private getExternalPolicyStatements(externalPolicyFilePaths: string[]): cdk.aws_iam.PolicyStatement[] {
    const policyStatements: cdk.aws_iam.PolicyStatement[] = [];
    for (const externalPolicyFilePath of externalPolicyFilePaths) {
      const policyDocument = JSON.parse(
        this.generatePolicyReplacements(externalPolicyFilePath, false, this.organizationId),
      );

      for (const statement of policyDocument.Statement) {
        policyStatements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
      }
    }

    return policyStatements;
  }

  /**
   * Function to create kms policy statements for imported bucket
   * @param overridePolicy boolean
   * @param applyAcceleratorManagedPolicy boolean
   * @param bucketType {@link AcceleratorImportedBucketType}
   * @param principalOrgIdCondition {@link PrincipalOrgIdConditionType}
   * @param centralLogsBucketPrincipalAndPrefixes {@link CentralLogsBucketPrincipalAndPrefixesType}
   * @returns policyStatements {@link cdk.aws_iam.PolicyStatement}[]
   */
  private createImportedBucketKmsPolicyStatements(
    overridePolicy: boolean,
    applyAcceleratorManagedPolicy: boolean,
    bucketType: AcceleratorImportedBucketType,
    principalOrgIdCondition: PrincipalOrgIdConditionType,
    centralLogsBucketPrincipalAndPrefixes?: CentralLogsBucketPrincipalAndPrefixesType,
  ): cdk.aws_iam.PolicyStatement[] {
    if (overridePolicy) {
      return [];
    }

    const policyStatements: cdk.aws_iam.PolicyStatement[] = [];

    if (bucketType === AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET && applyAcceleratorManagedPolicy) {
      policyStatements.push(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Enable IAM User Permissions',
          principals: [new cdk.aws_iam.AccountRootPrincipal()],
          actions: ['kms:*'],
          resources: ['*'],
        }),
      );

      policyStatements.push(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow S3 use of the key',
          actions: [
            'kms:Decrypt',
            'kms:DescribeKey',
            'kms:Encrypt',
            'kms:GenerateDataKey',
            'kms:GenerateDataKeyWithoutPlaintext',
            'kms:GenerateRandom',
            'kms:GetKeyPolicy',
            'kms:GetKeyRotationStatus',
            'kms:ListAliases',
            'kms:ListGrants',
            'kms:ListKeyPolicies',
            'kms:ListKeys',
            'kms:ListResourceTags',
            'kms:ListRetirableGrants',
            'kms:ReEncryptFrom',
            'kms:ReEncryptTo',
          ],
          principals: [new cdk.aws_iam.ServicePrincipal('s3.amazonaws.com')],
          resources: ['*'],
        }),
      );

      policyStatements.push(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow AWS Services to encrypt and describe logs',
          actions: [
            'kms:Decrypt',
            'kms:DescribeKey',
            'kms:Encrypt',
            'kms:GenerateDataKey',
            'kms:GenerateDataKeyPair',
            'kms:GenerateDataKeyPairWithoutPlaintext',
            'kms:GenerateDataKeyWithoutPlaintext',
            'kms:ReEncryptFrom',
            'kms:ReEncryptTo',
          ],
          principals: [
            new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
            new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
            new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
            new cdk.aws_iam.ServicePrincipal('ssm.amazonaws.com'),
          ],
          resources: ['*'],
        }),
      );

      policyStatements.push(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Organization use of the key',
          actions: [
            'kms:Decrypt',
            'kms:DescribeKey',
            'kms:Encrypt',
            'kms:GenerateDataKey',
            'kms:GenerateDataKeyPair',
            'kms:GenerateDataKeyPairWithoutPlaintext',
            'kms:GenerateDataKeyWithoutPlaintext',
            'kms:ReEncryptFrom',
            'kms:ReEncryptTo',
            'kms:ListAliases',
          ],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: ['*'],
          conditions: {
            StringEquals: {
              ...principalOrgIdCondition,
            },
          },
        }),
      );

      if (centralLogsBucketPrincipalAndPrefixes?.awsPrincipalAccesses) {
        const awsPrincipalAccesses = centralLogsBucketPrincipalAndPrefixes.awsPrincipalAccesses;
        // Allow bucket encryption key for given aws principals
        awsPrincipalAccesses
          .filter(item => item.accessType !== BucketAccessType.NO_ACCESS)
          .forEach(item => {
            policyStatements.push(
              new cdk.aws_iam.PolicyStatement({
                sid: `Allow ${item.name} service to use the encryption key`,
                principals: [new cdk.aws_iam.ServicePrincipal(item.principal)],
                actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                resources: ['*'],
              }),
            );
          });
      }
    }

    return policyStatements;
  }

  private getExternalPolicyFilePaths(
    overridePolicyFile?: string,
    attachmentPolicies?: PolicyAttachmentsType[],
  ): string[] {
    const policyFilePaths: string[] = [];

    if (overridePolicyFile) {
      return [
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, overridePolicyFile),
          true,
          undefined,
          `${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-replaced-${path.parse(overridePolicyFile).base}`,
        ),
      ];
    }
    for (const attachmentPolicy of attachmentPolicies ?? []) {
      policyFilePaths.push(
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, attachmentPolicy.policy),
          true,
          undefined,
          `${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}-replaced-${
            path.parse(attachmentPolicy.policy).base
          }`,
        ),
      );
    }

    return policyFilePaths;
  }

  private createImportedBucketKey(bucketType: AcceleratorImportedBucketType): cdk.aws_kms.Key {
    if (AcceleratorImportedBucketType.ASSETS_BUCKET === bucketType) {
      const key = new cdk.aws_kms.Key(this, pascalCase(`Imported${bucketType}BucketKey`), {
        enableKeyRotation: true,
        alias: this.acceleratorResourceNames.customerManagedKeys.importedAssetBucket.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.importedAssetBucket.description,
      });
      key.addToResourcePolicy(this.createImportBucketKeyPolicyStatement());
      new cdk.aws_ssm.StringParameter(this, 'AcceleratorImportedAssetsBucketKmsArnParameter', {
        parameterName: this.acceleratorResourceNames.parameters.importedAssetsBucketCmkArn,
        stringValue: key.keyArn,
      });
      return key;
    } else if (AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET === bucketType) {
      const key = new cdk.aws_kms.Key(this, pascalCase(`Imported${bucketType}BucketKey`), {
        enableKeyRotation: true,
        alias: this.acceleratorResourceNames.customerManagedKeys.importedCentralLogsBucket.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.importedCentralLogsBucket.description,
      });
      key.addToResourcePolicy(this.createImportBucketKeyPolicyStatement());
      new cdk.aws_ssm.StringParameter(this, 'AcceleratorImportedCentralLogsBucketKmsArnParameter', {
        parameterName: this.acceleratorResourceNames.parameters.importedCentralLogBucketCmkArn,
        stringValue: key.keyArn,
      });
      return key;
    } else {
      throw new Error(`Invalid bucket type ${bucketType}, cannot create key for imported bucket`);
    }
  }

  private createImportBucketKeyPolicyStatement(): cdk.aws_iam.PolicyStatement {
    return new cdk.aws_iam.PolicyStatement({
      sid: `Allow Accelerator and Assets Role to use the encryption key`,
      principals: [new cdk.aws_iam.AnyPrincipal()],
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          ...this.getPrincipalOrgIdCondition(this.organizationId),
        },
        ArnLike: {
          'aws:PrincipalARN': [
            `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-AssetsAccessRole`,
          ],
        },
      },
    });
  }

  /**
   * Function to update imported bucket encryption key
   * @param options
   */
  private updateImportedBucketEncryption(options: {
    bucketConfig: CentralLogBucketConfig | AssetBucketConfig;
    bucketType: AcceleratorImportedBucketType;
    bucketItem: { bucket: cdk.aws_s3.IBucket; bucketKmsArn: string | undefined };
    principalOrgIdCondition: PrincipalOrgIdConditionType;
    centralLogsBucketPrincipalAndPrefixes?: CentralLogsBucketPrincipalAndPrefixesType;
    bucketKmsArnParameterName?: string;
    organizationId?: string;
  }) {
    const applyAcceleratorManagedPolicy =
      options.bucketConfig.importedBucket!.applyAcceleratorManagedBucketPolicy ?? false;
    const createAcceleratorManagedKey = options.bucketConfig.importedBucket!.createAcceleratorManagedKey ?? false;

    const externalPolicyFilePaths: string[] = [];
    let overridePolicy = false;
    let bucketKeyArn = options.bucketItem.bucketKmsArn;

    if (options.bucketConfig.customPolicyOverrides?.kmsPolicy) {
      overridePolicy = true;
      externalPolicyFilePaths.push(
        ...this.getExternalPolicyFilePaths(options.bucketConfig.customPolicyOverrides.kmsPolicy),
      );
    } else {
      externalPolicyFilePaths.push(
        ...this.getExternalPolicyFilePaths(undefined, options.bucketConfig.kmsResourcePolicyAttachments),
      );
    }

    if (createAcceleratorManagedKey) {
      const key = this.createImportedBucketKey(options.bucketType);

      bucketKeyArn = key.keyArn;

      const policyStatements: cdk.aws_iam.PolicyStatement[] = [
        ...this.getExternalPolicyStatements(externalPolicyFilePaths),
      ];

      policyStatements.push(
        ...this.createImportedBucketKmsPolicyStatements(
          overridePolicy,
          applyAcceleratorManagedPolicy,
          options.bucketType,
          options.principalOrgIdCondition,
          options.centralLogsBucketPrincipalAndPrefixes,
        ),
      );

      for (const policyStatement of policyStatements) {
        key.addToResourcePolicy(policyStatement);
      }

      // Set bucket encryption with accelerator created key
      new BucketEncryption(this, pascalCase(`Imported${options.bucketType}BucketEncryption`), {
        bucket: options.bucketItem.bucket,
        kmsKey: key,
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
    } else {
      if (externalPolicyFilePaths.length > 0 && options.bucketItem.bucketKmsArn) {
        // Update imported bucket kms policy
        new KmsEncryption(this, pascalCase(`Imported${options.bucketType}BucketKmsEncryption`), {
          kmsArn: options.bucketItem.bucketKmsArn,
          policyFilePaths: externalPolicyFilePaths,
          organizationId: options.organizationId,
          customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
          customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
          customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }

    if (options.bucketKmsArnParameterName && options.bucketType === AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET) {
      // Store existing central log bucket's encryption key arn in ssm parameter for future usage,
      // parameter will be created in every account central logging region only
      new PutSsmParameter(this, pascalCase(`PutImported${options.bucketType}BucketKmsArnParameter`), {
        accountIds: [this.props.accountsConfig.getLogArchiveAccountId()],
        region: this.props.centralizedLoggingRegion,
        roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        parameters: [
          {
            name: options.bucketKmsArnParameterName,
            value: bucketKeyArn!,
          },
        ],
        invokingAccountId: cdk.Stack.of(this).account,
        acceleratorPrefix: this.props.prefixes.accelerator,
      });

      this.importedCentralLogBucketKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        'ImportedCentralLogsBucketKey',
        bucketKeyArn!,
      );
    }
  }

  /**
   * Function to update imported bucket's resource policy
   * @param applyAcceleratorManagedPolicy boolean
   * @param importedBucket {@link cdk.aws_s3.IBucket}
   * @param bucketType {@link AcceleratorImportedBucketType}
   * @param overridePolicyFile string
   * @param s3ResourcePolicyAttachments {@link PolicyAttachmentsType}[]
   * @param principalOrgIdCondition {@link PrincipalOrgIdConditionType}
   * @param centralLogsBucketPrincipalAndPrefixes {@link CentralLogsBucketPrincipalAndPrefixesType}
   * @param elbAccountId string
   */
  private updateImportedBucketResourcePolicy(options: {
    bucketConfig: CentralLogBucketConfig | ElbLogBucketConfig | AccessLogBucketConfig | AssetBucketConfig;
    importedBucket: cdk.aws_s3.IBucket;
    bucketType: AcceleratorImportedBucketType;
    overridePolicyFile?: string;
    principalOrgIdCondition?: PrincipalOrgIdConditionType;
    centralLogsBucketPrincipalAndPrefixes?: CentralLogsBucketPrincipalAndPrefixesType;
    elbAccountId?: string;
    organizationId?: string;
  }) {
    const externalPolicyFilePaths: string[] = [];

    let attachmentPolicyFiles: PolicyAttachmentsType[] | undefined;

    if (!options.overridePolicyFile) {
      attachmentPolicyFiles = options.bucketConfig.s3ResourcePolicyAttachments;
    }

    externalPolicyFilePaths.push(...this.getExternalPolicyFilePaths(options.overridePolicyFile, attachmentPolicyFiles));

    const applyAcceleratorManagedPolicy =
      options.bucketConfig.importedBucket!.applyAcceleratorManagedBucketPolicy ?? false;

    let props: BucketPolicyProps = {
      bucketType: AcceleratorImportedBucketType.SERVER_ACCESS_LOGS_BUCKET,
      applyAcceleratorManagedPolicy,
      bucket: options.importedBucket,
      bucketPolicyFilePaths: externalPolicyFilePaths,
      customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
      customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
      customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
    };

    if (options.bucketType === AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET) {
      props = {
        bucketType: AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET,
        applyAcceleratorManagedPolicy,
        bucket: options.importedBucket,
        bucketPolicyFilePaths: externalPolicyFilePaths,
        principalOrgIdCondition: options.principalOrgIdCondition,
        awsPrincipalAccesses: options.centralLogsBucketPrincipalAndPrefixes!.awsPrincipalAccesses,
        organizationId: options.organizationId,
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      };
    }

    if (options.bucketType === AcceleratorImportedBucketType.ELB_LOGS_BUCKET) {
      props = {
        bucketType: AcceleratorImportedBucketType.ELB_LOGS_BUCKET,
        applyAcceleratorManagedPolicy,
        bucket: options.importedBucket,
        bucketPolicyFilePaths: externalPolicyFilePaths,
        principalOrgIdCondition: options.principalOrgIdCondition,
        organizationId: options.organizationId,
        elbAccountId: options.elbAccountId,
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      };
    }

    if (options.bucketType === AcceleratorImportedBucketType.ASSETS_BUCKET) {
      props = {
        bucketType: AcceleratorImportedBucketType.ASSETS_BUCKET,
        applyAcceleratorManagedPolicy,
        bucket: options.importedBucket,
        bucketPolicyFilePaths: externalPolicyFilePaths,
        principalOrgIdCondition: options.principalOrgIdCondition,
        organizationId: options.organizationId,
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        firewallRoles: [
          `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-AssetsAccessRole`,
          `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-FirewallConfigAccessRole`,
        ],
      };
    }
    new BucketPolicy(this, pascalCase(`Imported${options.bucketType}BucketPolicy`), props);
  }

  /**
   * Function to create or get existing CentralLogBucket
   * @param serverAccessLogsBucket {@link Bucket} | {@link cdk.aws_s3.IBucket}
   * @param principalOrgIdCondition {@link PrincipalOrgIdConditionType}
   *
   * @remarks
   * When imported bucket is used solution will lookup the existing bucket else solution will deploy central log bucket.
   */
  private createOrGetCentralLogsBucket(
    serverAccessLogsBucket: cdk.aws_s3.IBucket,
    principalOrgIdCondition: PrincipalOrgIdConditionType,
  ) {
    if (
      cdk.Stack.of(this).region === this.props.centralizedLoggingRegion &&
      cdk.Stack.of(this).account === this.props.accountsConfig.getLogArchiveAccountId()
    ) {
      const centralLogsBucketPrincipalAndPrefixes = this.createCentralLogsBucketPrincipalAndPrefixes();

      if (this.props.globalConfig.logging.centralLogBucket?.importedBucket) {
        const importedBucketItem = this.getImportedBucket(
          this.props.globalConfig.logging.centralLogBucket.importedBucket.name,
          AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET,
          'kms',
        );
        this.importedCentralLogBucket = importedBucketItem.bucket;

        this.updateImportedBucketEncryption({
          bucketConfig: this.props.globalConfig.logging.centralLogBucket,
          bucketType: AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET,
          bucketItem: importedBucketItem,
          principalOrgIdCondition,
          centralLogsBucketPrincipalAndPrefixes,
          bucketKmsArnParameterName: this.acceleratorResourceNames.parameters.importedCentralLogBucketCmkArn,
          organizationId: this.organizationId,
        });

        this.updateImportedBucketResourcePolicy({
          bucketConfig: this.props.globalConfig.logging.centralLogBucket,
          importedBucket: this.importedCentralLogBucket,
          bucketType: AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET,
          overridePolicyFile: this.props.globalConfig.logging.centralLogBucket.customPolicyOverrides?.s3Policy,
          principalOrgIdCondition,
          centralLogsBucketPrincipalAndPrefixes,
          organizationId: this.organizationId,
        });

        this.createImportedLogBucketPrefixes(
          this.importedCentralLogBucket,
          centralLogsBucketPrincipalAndPrefixes.bucketPrefixes,
        );
      } else {
        this.createCentralLogsBucket(serverAccessLogsBucket, centralLogsBucketPrincipalAndPrefixes);
      }
    }
  }

  /**
   * Function to create CentralLogs bucket in LogArchive account home region only.
   * @param serverAccessLogsBucket cdk.aws_s3.IBucket | undefined
   *
   * @remarks
   * When existing central log bucket not used then create Central Logs Bucket - This is done only in the home region of the log-archive account.
   * This is the destination bucket for all logs such as AWS CloudTrail, AWS Config, and VPC Flow logs.
   * Addition logs can also be sent to this bucket through AWS CloudWatch Logs, such as application logs, OS logs, or server logs.
   */
  private createCentralLogsBucket(
    serverAccessLogsBucket: cdk.aws_s3.IBucket,
    centralLogsBucketPrincipalAndPrefixes: {
      awsPrincipalAccesses: AwsPrincipalAccessesType[];
      bucketPrefixes: string[];
    },
  ) {
    if (
      cdk.Stack.of(this).region === this.props.centralizedLoggingRegion &&
      cdk.Stack.of(this).account === this.props.accountsConfig.getLogArchiveAccountId()
    ) {
      const bucketPrefixProps: BucketPrefixProps = {
        source: {
          bucketName: this.centralLogsBucketName,
        },
        bucketPrefixes: centralLogsBucketPrincipalAndPrefixes.bucketPrefixes,
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      };

      this.centralLogsBucket = new CentralLogsBucket(this, 'CentralLogsBucket', {
        s3BucketName: this.centralLogsBucketName,
        serverAccessLogsBucket: serverAccessLogsBucket,
        kmsAliasName: this.acceleratorResourceNames.customerManagedKeys.centralLogsBucket.alias,
        kmsDescription: this.acceleratorResourceNames.customerManagedKeys.centralLogsBucket.description,
        principalOrgIdCondition: this.getPrincipalOrgIdCondition(this.organizationId),
        orgPrincipals: this.getOrgPrincipals(this.organizationId),
        s3LifeCycleRules: this.getS3LifeCycleRules(this.props.globalConfig.logging.centralLogBucket?.lifecycleRules),
        awsPrincipalAccesses: centralLogsBucketPrincipalAndPrefixes.awsPrincipalAccesses,
        bucketPrefixProps,
        acceleratorPrefix: this.props.prefixes.accelerator,
        crossAccountAccessRoleName:
          this.acceleratorResourceNames.roles.crossAccountCentralLogBucketCmkArnSsmParameterAccess,
        cmkArnSsmParameterName: this.acceleratorResourceNames.parameters.centralLogBucketCmkArn,
        managementAccountAccessRole: this.props.globalConfig.managementAccountAccessRole,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/CentralLogsBucket/CrossAccountCentralBucketKMSArnSsmParamAccessRole/Resource`,
            reason: 'Central logs bucket arn SSM parameter needs access from other accounts',
          },
        ],
      });

      this.centralLogBucketAddResourcePolicies(this.centralLogsBucket);
    }
  }

  private createLoggingAccountSnsTopic(snsTopic: SnsTopicConfig, snsKey: cdk.aws_kms.IKey): cdk.aws_sns.Topic {
    this.logger.info('Creating SNS topic in log archive account home region.');

    const topic = new cdk.aws_sns.Topic(this, `${pascalCase(snsTopic.name)}SNSTopic`, {
      displayName: `${this.props.prefixes.snsTopicName}-${snsTopic.name}`,
      topicName: `${this.props.prefixes.snsTopicName}-${snsTopic.name}`,
      masterKey: snsKey,
    });
    for (const email of snsTopic.emailAddresses) {
      topic.addSubscription(new cdk.aws_sns_subscriptions.EmailSubscription(email));
    }

    topic.grantPublish({
      grantPrincipal: new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com'),
    });

    topic.grantPublish({
      grantPrincipal: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    if (this.props.securityConfig.centralSecurityServices.securityHub.snsTopicName === snsTopic.name) {
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.ServicePrincipal('events.amazonaws.com'),
      });
    }

    topic.grantPublish({
      grantPrincipal: this.getOrgPrincipals(this.organizationId),
    });

    return topic;
  }

  private createSnsForwarderFunction() {
    const centralSnsKeyArn = new SsmParameterLookup(this, 'LookupCentralSnsKeyArnParameter', {
      name: this.acceleratorResourceNames.parameters.snsTopicCmkArn,
      accountId: this.props.accountsConfig.getLogArchiveAccountId(),
      parameterRegion: cdk.Stack.of(this).region,
      roleName: this.acceleratorResourceNames.roles.snsTopicCmkArnParameterAccess,
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      acceleratorPrefix: this.props.prefixes.accelerator,
    }).value;

    this.snsForwarderFunction = new cdk.aws_lambda.Function(this, 'SnsTopicForwarderFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/sns-topic-forwarder/dist')),
      runtime: DEFAULT_LAMBDA_RUNTIME,
      handler: 'index.handler',
      description: 'Lambda function to forward Accelerator SNS Topics to log archive account',
      timeout: cdk.Duration.minutes(2),
      environmentEncryption: this.lambdaKey,
      environment: {
        SNS_CENTRAL_ACCOUNT: this.props.accountsConfig.getLogArchiveAccountId(),
        PARTITION: `${cdk.Stack.of(this).partition}`,
      },
    });

    new cdk.aws_logs.LogGroup(this, 'SnsForwarderFunctionLogGroup', {
      logGroupName: `/aws/lambda/${this.snsForwarderFunction.functionName}`,
      retention: this.props.globalConfig.cloudwatchLogRetentionInDays,
      encryptionKey: this.cloudwatchKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.snsForwarderFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'sns',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sns:Publish'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:sns:${
            cdk.Stack.of(this).region
          }:${this.props.accountsConfig.getLogArchiveAccountId()}:${this.props.prefixes.snsTopicName}-*`,
        ],
      }),
    );

    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `/${this.stackName}/SnsTopicForwarderFunction/ServiceRole/Resource`,
          reason: 'Lambda function managed policy',
        },
      ],
    });

    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `/${this.stackName}/SnsTopicForwarderFunction/ServiceRole/DefaultPolicy/Resource`,
          reason: 'Allows only specific topics.',
        },
      ],
    });

    this.snsForwarderFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'kms',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [centralSnsKeyArn],
      }),
    );
  }

  private createSnsTopic(snsTopic: SnsTopicConfig, snsKey: cdk.aws_kms.IKey): cdk.aws_sns.Topic {
    this.logger.info(`Creating SNS topic ${snsTopic.name} in ${cdk.Stack.of(this).account}`);

    const topic = new cdk.aws_sns.Topic(this, `${pascalCase(snsTopic.name)}SNSTopic`, {
      displayName: `${this.props.prefixes.snsTopicName}-${snsTopic.name}`,
      topicName: `${this.props.prefixes.snsTopicName}-${snsTopic.name}`,
      masterKey: snsKey,
    });

    topic.grantPublish({
      grantPrincipal: new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com'),
    });

    if (this.props.securityConfig.centralSecurityServices.securityHub.snsTopicName === snsTopic.name) {
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.ServicePrincipal('events.amazonaws.com'),
      });
    }

    const fmsDelegatedAdminAccount = this.props.networkConfig.firewallManagerService?.delegatedAdminAccount;
    if (
      fmsDelegatedAdminAccount &&
      cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(fmsDelegatedAdminAccount)
    ) {
      topic.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'fms',
          actions: ['sns:Publish'],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: [topic.topicArn],
          conditions: {
            ArnLike: {
              'aws:PrincipalARN': [
                `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${
                  this.props.prefixes.accelerator
                }-FMS`,
              ],
            },
          },
        }),
      );
    }
    topic.addSubscription(new cdk.aws_sns_subscriptions.LambdaSubscription(this.snsForwarderFunction!));

    return topic;
  }

  private createCentralSnsKey() {
    this.centralSnsKey = new cdk.aws_kms.Key(this, 'AcceleratorSnsTopicKey', {
      alias: this.acceleratorResourceNames.customerManagedKeys.snsTopic.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.snsTopic.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.centralSnsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'sns',
        principals: [new cdk.aws_iam.ServicePrincipal('sns.amazonaws.com')],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    this.centralSnsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'cloudwatch',
        principals: [new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );

    this.centralSnsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'events',
        principals: [new cdk.aws_iam.ServicePrincipal('events.amazonaws.com')],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEqualsIfExists: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );

    this.centralSnsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'crossaccount',
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    new cdk.aws_ssm.StringParameter(this, 'AcceleratorCentralSnsKmsArnParameter', {
      parameterName: this.acceleratorResourceNames.parameters.snsTopicCmkArn,
      stringValue: this.centralSnsKey.keyArn,
    });

    if (cdk.Stack.of(this).region === this.props.globalConfig.homeRegion) {
      // SSM parameter access IAM Role for central sns topic key
      new cdk.aws_iam.Role(this, 'CrossAccountCentralSnsTopicKMSArnSsmParamAccessRole', {
        roleName: this.acceleratorResourceNames.roles.snsTopicCmkArnParameterAccess,
        assumedBy: this.getOrgPrincipals(this.organizationId, true),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                resources: [
                  `arn:${cdk.Stack.of(this).partition}:ssm:*:*:parameter${
                    this.acceleratorResourceNames.parameters.snsTopicCmkArn
                  }`,
                ],
                conditions: {
                  StringEquals: {
                    ...this.getPrincipalOrgIdCondition(this.organizationId),
                  },
                  ArnLike: {
                    'aws:PrincipalARN': [
                      `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-*`,
                    ],
                  },
                },
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:DescribeParameters'],
                resources: ['*'],
                conditions: {
                  StringEquals: {
                    ...this.getPrincipalOrgIdCondition(this.organizationId),
                  },
                  ArnLike: {
                    'aws:PrincipalARN': [
                      `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-*`,
                    ],
                  },
                },
              }),
            ],
          }),
        },
      });
    }

    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `/${this.stackName}/CrossAccountCentralSnsTopicKMSArnSsmParamAccessRole`,
          reason: 'Allows only specific role arns.',
        },
      ],
    });
  }

  private createSnsKey(): cdk.aws_kms.IKey {
    const snsKey = new cdk.aws_kms.Key(this, 'AcceleratorSnsTopicKey', {
      alias: this.acceleratorResourceNames.customerManagedKeys.snsTopic.alias,
      description: this.acceleratorResourceNames.customerManagedKeys.snsTopic.description,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    snsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'sns',
        principals: [new cdk.aws_iam.ServicePrincipal('sns.amazonaws.com')],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );
    const fmsDelegatedAdminAccount = this.props.networkConfig.firewallManagerService?.delegatedAdminAccount;
    if (
      fmsDelegatedAdminAccount &&
      cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(fmsDelegatedAdminAccount)
    ) {
      snsKey.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Accelerator Role to use the encryption key`,
          principals: [new cdk.aws_iam.AnyPrincipal()],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'aws:PrincipalARN': [
                `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${
                  this.props.prefixes.accelerator
                }-FMS-Notifications`,
              ],
            },
          },
        }),
      );
    }

    snsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'cloudwatch',
        principals: [
          new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('events.amazonaws.com'),
        ],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEqualsIfExists: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );

    snsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'accelerator-role',
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'aws:PrincipalARN': [
              `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${
                this.props.prefixes.accelerator
              }-*`,
            ],
          },
        },
      }),
    );
    new cdk.aws_ssm.StringParameter(this, 'AcceleratorCentralSnsKmsArnParameter', {
      parameterName: this.acceleratorResourceNames.parameters.snsTopicCmkArn,
      stringValue: snsKey.keyArn,
    });

    return snsKey;
  }

  private centralLogBucketAddResourcePolicies(centralLogsBucket: CentralLogsBucket) {
    this.logger.info(`Adding central log bucket resource policies to KMS`);
    const centralLogsBucketKey = centralLogsBucket.getS3Bucket().getKey();
    for (const attachment of this.props.globalConfig.logging.centralLogBucket?.kmsResourcePolicyAttachments ?? []) {
      const policyDocument = JSON.parse(
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, attachment.policy),
          false,
          this.organizationId,
        ),
      );

      // Create a statements list using the PolicyStatement factory
      const statements: cdk.aws_iam.PolicyStatement[] = [];
      for (const statement of policyDocument.Statement) {
        statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
        for (const statement of statements) {
          centralLogsBucketKey?.addToResourcePolicy(statement);
        }
      }
    }
    this.logger.info(`Adding central log bucket resource policies to S3`);
    const realCentralLogBucket = centralLogsBucket?.getS3Bucket().getS3Bucket();
    for (const attachment of this.props.globalConfig.logging.centralLogBucket?.s3ResourcePolicyAttachments ?? []) {
      const policyDocument = JSON.parse(
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, attachment.policy),
          false,
          this.organizationId,
        ),
      );
      // Create a statements list using the PolicyStatement factory
      const statements: cdk.aws_iam.PolicyStatement[] = [];
      for (const statement of policyDocument.Statement) {
        statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
      }
      for (const statement of statements) {
        realCentralLogBucket?.addToResourcePolicy(statement);
      }
    }
  }

  private createFMSNotificationRole() {
    const fmsConfiguration = this.props.networkConfig.firewallManagerService;

    // Exit if Notification channels don't exist.
    if (
      !fmsConfiguration?.notificationChannels ||
      fmsConfiguration.notificationChannels.length === 0 ||
      !this.props.networkConfig.firewallManagerService?.delegatedAdminAccount
    ) {
      return;
    }
    if (
      cdk.Stack.of(this).region === this.props.globalConfig.homeRegion &&
      cdk.Stack.of(this).account ===
        this.props.accountsConfig.getAccountId(this.props.networkConfig.firewallManagerService?.delegatedAdminAccount)
    ) {
      const roleName = `${this.props.prefixes.accelerator}-FMS-Notifications`;
      const auditAccountId = this.props.accountsConfig.getAuditAccountId();

      //Create Role for SNS Topic access from security config and global config
      this.logger.info('Creating FMS Notification Channel Role AWSAccelerator - FMS');
      const fmsRole = new cdk.aws_iam.Role(this, `aws-accelerator-fms`, {
        roleName,
        assumedBy: new cdk.aws_iam.ServicePrincipal('fms.amazonaws.com'),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['sns:Publish'],
                resources: ['*'],
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                resources: [
                  `arn:${cdk.Stack.of(this).partition}:kms:*:${auditAccountId}:key/*`,
                  `arn:${cdk.Stack.of(this).partition}:kms:*:${cdk.Stack.of(this).account}:key/*`,
                ],
              }),
            ],
          }),
        },
      });

      NagSuppressions.addResourceSuppressions(fmsRole, [
        { id: 'AwsSolutions-IAM5', reason: 'Allow cross-account resources to encrypt KMS under this path.' },
      ]);
    }
  }

  private elbLogBucketAddResourcePolicies(elbLogBucket: cdk.aws_s3.IBucket) {
    this.logger.info(`Adding elb log bucket resource policies to S3`);
    for (const attachment of this.props.globalConfig.logging.elbLogBucket?.s3ResourcePolicyAttachments ?? []) {
      const policyDocument = JSON.parse(
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, attachment.policy),
          false,
          this.organizationId,
        ),
      );
      // Create a statements list using the PolicyStatement factory
      const statements: cdk.aws_iam.PolicyStatement[] = [];
      for (const statement of policyDocument.Statement) {
        statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
      }

      for (const statement of statements) {
        elbLogBucket.addToResourcePolicy(statement);
      }
    }
  }

  /**
   * Function to setup certificate assets
   * @param props {@link AcceleratorStackProps}
   * @param principalOrgIdCondition {@link PrincipalOrgIdConditionType}
   *
   * @remarks
   * Setup s3 bucket with CMK to only allow specific role access to the key. This bucket will be used to store private key material for the solution.
   * Central assets bucket will only be created in the management account in home region
   */
  private setupCertificateAssets(
    props: AcceleratorStackProps,
    principalOrgIdCondition: PrincipalOrgIdConditionType,
  ): void {
    if (
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId() &&
      cdk.Stack.of(this).region === props.globalConfig.homeRegion
    ) {
      if (!this.props.globalConfig.logging.assetBucket?.importedBucket) {
        // This is key is always created regardless of the S3 encryption setting
        // This bucket may contain sensitive data
        const assetsKmsKey = new cdk.aws_kms.Key(this, 'AssetsKmsKey', {
          alias: this.acceleratorResourceNames.customerManagedKeys.assetsBucket.alias,
          description: this.acceleratorResourceNames.customerManagedKeys.assetsBucket.description,
          enableKeyRotation: true,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Allow management account access
        assetsKmsKey.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'Management Actions',
            principals: [new cdk.aws_iam.AccountPrincipal(cdk.Stack.of(this).account)],
            actions: [
              'kms:Create*',
              'kms:Describe*',
              'kms:Enable*',
              'kms:List*',
              'kms:Put*',
              'kms:Update*',
              'kms:Revoke*',
              'kms:Disable*',
              'kms:Get*',
              'kms:Delete*',
              'kms:ScheduleKeyDeletion',
              'kms:CancelKeyDeletion',
              'kms:GenerateDataKey',
            ],
            resources: ['*'],
          }),
        );
        //grant s3 service access
        assetsKmsKey.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow S3 to use the encryption key`,
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'kms:ViaService': `s3.${cdk.Stack.of(this).region}.amazonaws.com`,
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
            },
          }),
        );
        //grant AssetsAccessRole access to KMS
        assetsKmsKey.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
            resources: ['*'],
            conditions: {
              StringLike: {
                'aws:PrincipalARN': `arn:${cdk.Stack.of(this).partition}:iam::*:role/${
                  props.prefixes.accelerator
                }-AssetsAccessRole`,
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
            },
          }),
        );
        new cdk.aws_ssm.StringParameter(this, 'SsmParamAssetsAccountBucketKMSArn', {
          parameterName: this.acceleratorResourceNames.parameters.assetsBucketCmkArn,
          stringValue: assetsKmsKey.keyArn,
        });
        this.createAssetsBucket(assetsKmsKey);
      } else {
        this.importAssetsBucket(principalOrgIdCondition);
      }
      const ssmParameterArn = `arn:${cdk.Stack.of(this).partition}:ssm:${
        cdk.Stack.of(this).region
      }:${this.props.accountsConfig.getManagementAccountId()}:parameter`;
      const assetBucketKmsKeyArnSsmParameterArn = this.props.globalConfig.logging.assetBucket?.importedBucket
        ?.createAcceleratorManagedKey
        ? `${ssmParameterArn}${this.acceleratorResourceNames.parameters.importedAssetsBucketCmkArn}`
        : `${ssmParameterArn}${this.acceleratorResourceNames.parameters.assetsBucketCmkArn}`;
      // SSM parameter access IAM Role for
      new cdk.aws_iam.Role(this, 'CrossAccountAssetsBucketKMSArnSsmParamAccessRole', {
        roleName: this.acceleratorResourceNames.roles.crossAccountAssetsBucketCmkArnSsmParameterAccess,
        assumedBy: this.getOrgPrincipals(this.organizationId, true),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                resources: [assetBucketKmsKeyArnSsmParameterArn],
                conditions: {
                  ArnLike: {
                    'aws:PrincipalARN': [
                      `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.prefixes.accelerator}-*`,
                    ],
                  },
                },
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:DescribeParameters'],
                resources: ['*'],
                conditions: {
                  ArnLike: {
                    'aws:PrincipalARN': [
                      `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.prefixes.accelerator}-*`,
                    ],
                  },
                },
              }),
            ],
          }),
        },
      });
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/CrossAccountAssetsBucketKMSArnSsmParamAccessRole/Resource`,
            reason: 'Allows only specific policy.',
          },
        ],
      });
    }
  }

  /**
   * Function to import S3 Asset Bucket
   * @param principalOrgIdCondition {@link PrincipalOrgIdConditionType}
   */
  private importAssetsBucket(principalOrgIdCondition: PrincipalOrgIdConditionType): void {
    const bucketName = this.props.globalConfig.logging.assetBucket!.importedBucket!.name;
    const importedBucketItem = this.getImportedBucket(bucketName, AcceleratorImportedBucketType.ASSETS_BUCKET, 'kms');
    this.updateImportedBucketResourcePolicy({
      bucketConfig: this.props.globalConfig.logging.assetBucket!,
      importedBucket: importedBucketItem.bucket,
      bucketType: AcceleratorImportedBucketType.ASSETS_BUCKET,
      overridePolicyFile: this.props.globalConfig.logging.assetBucket!.customPolicyOverrides?.s3Policy,
      principalOrgIdCondition,
      organizationId: this.organizationId,
    });
    this.updateImportedBucketEncryption({
      bucketConfig: this.props.globalConfig.logging.assetBucket!,
      bucketType: AcceleratorImportedBucketType.ASSETS_BUCKET,
      bucketItem: importedBucketItem,
      principalOrgIdCondition,
      bucketKmsArnParameterName: this.acceleratorResourceNames.parameters.importedAssetsBucketCmkArn,
      organizationId: this.organizationId,
    });

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.S1,
      details: [
        {
          path: `${this.stackName}/AssetsAccessLogsBucket/Resource/Resource`,
          reason: 'AccessLogsBucket has server access logs disabled until the task for access logging completed.',
        },
      ],
    });

    new cdk.CfnOutput(this, 'AWSAcceleratorAssetsBucket', {
      value: importedBucketItem.bucket.bucketName,
      description: 'Name of the bucket which hosts solution assets ',
    });
  }

  /**
   * Function to create S3 Asset Bucket
   * @param assetsKmsKey {@link cdk.aws_kms.Key}
   * @param serverAccessLogsBucket {@link cdk.aws_s3.IBucket} | undefined
   * @param principalOrgIdCondition {@link PrincipalOrgIdConditionType}
   *
   */
  private createAssetsBucket(assetsKmsKey: cdk.aws_kms.Key | undefined) {
    // Create the server access logs bucket for the Assets S3 Bucket
    const serverAccessLogsBucket = new Bucket(this, 'AssetsAccessLogsBucket', {
      encryptionType: BucketEncryptionType.SSE_S3, // Server access logging does not support SSE-KMS
      s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.assetsAccessLog}-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`,
      s3LifeCycleRules: this.getS3LifeCycleRules(this.props.globalConfig.logging.accessLogBucket?.lifecycleRules),
    });

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.S1,
      details: [
        {
          path: `${this.stackName}/AssetsAccessLogsBucket/Resource/Resource`,
          reason: 'AccessLogsBucket has server access logs disabled until the task for access logging completed.',
        },
      ],
    });

    //  Create S3 Assets bucket
    const assetsBucket = new Bucket(this, 'CertificateAssetBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.assets}-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`,
      kmsKey: assetsKmsKey,
      serverAccessLogsBucketName: serverAccessLogsBucket.getS3Bucket().bucketName,
    });

    assetsBucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['s3:GetObject*', 's3:ListBucket'],
        resources: [assetsBucket.getS3Bucket().bucketArn, `${assetsBucket.getS3Bucket().bucketArn}/*`],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
          StringLike: {
            'aws:PrincipalARN': [
              `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-AssetsAccessRole`,
              `arn:${cdk.Stack.of(this).partition}:iam::*:role/${
                this.props.prefixes.accelerator
              }-FirewallConfigAccessRole`,
            ],
          },
        },
      }),
    );

    this.logger.info(`Adding Assets bucket resource policies to S3`);
    if (this.props.globalConfig.logging.assetBucket?.s3ResourcePolicyAttachments) {
      for (const attachment of this.props.globalConfig.logging.assetBucket.s3ResourcePolicyAttachments ?? []) {
        const policyDocument = JSON.parse(
          this.generatePolicyReplacements(
            path.join(this.props.configDirPath, attachment.policy),
            false,
            this.organizationId,
          ),
        );
        // Create a statements list using the PolicyStatement factory
        const statements: cdk.aws_iam.PolicyStatement[] = [];
        for (const statement of policyDocument.Statement) {
          statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
        }
        for (const statement of statements) {
          assetsBucket.getS3Bucket().addToResourcePolicy(statement);
        }
      }
    }

    new cdk.CfnOutput(this, 'AWSAcceleratorAssetsBucket', {
      value: assetsBucket.getS3Bucket().bucketName,
      description: 'Name of the bucket which hosts solution assets ',
    });
  }

  /**
   * Function to create Server access logs bucket
   * @param serverAccessLogsBucket {@link cdk.aws_s3.IBucket} | undefined
   */
  private createMetadataBucket(serverAccessLogsBucket?: cdk.aws_s3.IBucket) {
    if (this.props.globalConfig.acceleratorMetadata?.enable) {
      if (
        cdk.Stack.of(this).region === this.props.globalConfig.homeRegion &&
        cdk.Stack.of(this).account ===
          this.props.accountsConfig.getAccountId(this.props.globalConfig.acceleratorMetadata.account)
      ) {
        const metadataBucket = new Bucket(this, 'AcceleratorMetadataBucket', {
          encryptionType: this.isS3CMKEnabled ? BucketEncryptionType.SSE_KMS : BucketEncryptionType.SSE_S3,
          kmsAliasName: this.acceleratorResourceNames.customerManagedKeys.metadataBucket.alias,
          kmsDescription: this.acceleratorResourceNames.customerManagedKeys.metadataBucket.description,
          s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.metadata}-${cdk.Stack.of(this).account}-${
            cdk.Stack.of(this).region
          }`,
          serverAccessLogsBucket,
        });

        const bucket = metadataBucket.getS3Bucket();
        bucket.grantReadWrite(new cdk.aws_iam.AccountPrincipal(this.props.accountsConfig.getManagementAccountId()));
        this.ssmParameters.push({
          logicalId: 'AcceleratorS3MetadataBucket',
          parameterName: this.acceleratorResourceNames.parameters.metadataBucketArn,
          stringValue: bucket.bucketArn,
        });

        if (!serverAccessLogsBucket) {
          // AwsSolutions-S1: The S3 Bucket has server access logs disabled
          this.nagSuppressionInputs.push({
            id: NagSuppressionRuleIds.S1,
            details: [
              {
                path: `/${this.stackName}/AcceleratorMetadataBucket/Resource/Resource`,
                reason: 'Due to configuration settings, server access logs have been disabled.',
              },
            ],
          });
        }

        if (!this.isS3CMKEnabled) {
          return;
        }

        const key = metadataBucket.getKey();
        key.grantEncryptDecrypt(new cdk.aws_iam.AccountPrincipal(this.props.accountsConfig.getManagementAccountId()));
        bucket.addToResourcePolicy(
          new iam.PolicyStatement({
            actions: ['s3:Get*', 's3:List*'],
            resources: [bucket.bucketArn, bucket.arnForObjects('*')],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            conditions: {
              StringEquals: {
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
              ArnLike: {
                'aws:PrincipalARN': `arn:${cdk.Stack.of(this).partition}:iam::*:role/${
                  this.props.prefixes.accelerator
                }-*`,
              },
            },
          }),
        );
        key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'Allow org to perform encryption',
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
              ArnLike: {
                'aws:PrincipalARN': `arn:${cdk.Stack.of(this).partition}:iam::*:role/${
                  this.props.prefixes.accelerator
                }-*`,
              },
            },
          }),
        );
        const readOnlyAccessRoleArns = this.props.globalConfig.acceleratorMetadata.readOnlyAccessRoleArns;
        if (readOnlyAccessRoleArns && readOnlyAccessRoleArns.length > 0) {
          const principals = readOnlyAccessRoleArns.map((roleArn: string) => new cdk.aws_iam.ArnPrincipal(roleArn));

          key.addToResourcePolicy(
            new iam.PolicyStatement({
              actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey'],
              principals,
              resources: ['*'],
            }),
          );

          bucket.addToResourcePolicy(
            new iam.PolicyStatement({
              actions: ['s3:GetObject', 's3:ListBucket'],
              resources: [bucket.bucketArn, bucket.arnForObjects('*')],
              principals,
            }),
          );
        }

        this.ssmParameters.push({
          logicalId: 'AcceleratorKmsMetadataKey',
          parameterName: this.acceleratorResourceNames.parameters.metadataBucketCmkArn,
          stringValue: key.keyArn,
        });
      }
    }
  }

  /**
   * Function to create imported central log bucket prefixes
   * @param centralLogBucket {@link cdk.aws_s3.IBucket}
   * @param bucketPrefixes {@link string[]}
   */
  private createImportedLogBucketPrefixes(centralLogBucket: cdk.aws_s3.IBucket, bucketPrefixes: string[]) {
    // Configure prefix creation
    if (bucketPrefixes) {
      new BucketPrefix(this, 'ImportedLogBucketPrefix', {
        source: { bucket: centralLogBucket },
        bucketPrefixes: bucketPrefixes,
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }
  }

  /**
   * Function to configure account level CloudWatch log data protection
   * @returns
   */
  private configureAccountDataProtectionPolicy() {
    if (!this.props.globalConfig.logging.cloudwatchLogs?.dataProtection) {
      return;
    }

    if (this.props.globalConfig.logging.cloudwatchLogs.dataProtection.deploymentTargets) {
      if (!this.isIncluded(this.props.globalConfig.logging.cloudwatchLogs.dataProtection.deploymentTargets)) {
        this.logger.info(
          `CloudWatch log data protection ignored for account ${cdk.Stack.of(this).account}, region ${
            cdk.Stack.of(this).region
          }`,
        );
        return;
      }
    }

    this.logger.info(
      `CloudWatch log data protection will be configured for account ${cdk.Stack.of(this).account}, region ${
        cdk.Stack.of(this).region
      }`,
    );
    const identifierNames: string[] = [];

    for (const category of this.props.globalConfig.logging.cloudwatchLogs.dataProtection.managedDataIdentifiers
      .categories) {
      identifierNames.push(...this.getDataIdentifierNamesForCategory(category));
    }

    new CloudWatchLogDataProtection(this, 'AcceleratorCloudWatchDataProtection', {
      centralLogBucketName: this.centralLogsBucketName,
      identifierNames: identifierNames,
      overrideExisting: this.props.globalConfig.logging.cloudwatchLogs.dataProtection.overrideExisting ?? false,
      customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey,
      customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
      customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
    });
  }

  /**
   * Function to get CloudWatch log data identifier names for given category
   * @param category string
   * @returns names string[]
   */
  private getDataIdentifierNamesForCategory(category: string): string[] {
    const identifierNames: string[] = [];
    if (category === t.CloudWatchLogDataProtectionCategories.Credentials) {
      return CloudWatchDataProtectionIdentifiers.Credentials;
    }
    return identifierNames;
  }
}
