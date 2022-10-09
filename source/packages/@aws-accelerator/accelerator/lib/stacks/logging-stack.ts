/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { NagSuppressions } from 'cdk-nag';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { AcceleratorElbRootAccounts } from '../accelerator';
import { pascalCase } from 'pascal-case';
import * as fs from 'fs';

import {
  Bucket,
  BucketEncryptionType,
  BucketReplicationProps,
  CentralLogsBucket,
  KeyLookup,
  S3PublicAccessBlock,
  CloudWatchDestination,
  CloudWatchToS3Firehose,
  CloudWatchLogsSubscriptionFilter,
  NewCloudWatchLogEvent,
  Organization,
  BucketAccessType,
} from '@aws-accelerator/constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { Logger } from '../logger';
import path from 'path';
import { VpcFlowLogsConfig } from '@aws-accelerator/config';

export class LoggingStack extends AcceleratorStack {
  private cloudwatchKey: cdk.aws_kms.IKey;
  private organizationId: string | undefined;
  private lambdaKey: cdk.aws_kms.IKey;
  private centralLogsBucketName: string;
  private centralLogsBucket: CentralLogsBucket | undefined;
  private centralLogBucketKey: cdk.aws_kms.IKey | undefined;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.centralLogsBucketName = `${
      AcceleratorStack.ACCELERATOR_CENTRAL_LOGS_BUCKET_NAME_PREFIX
    }-${this.props.accountsConfig.getLogArchiveAccountId()}-${this.props.globalConfig.homeRegion}`;

    // Set Organization ID
    this.setOrganizationId();

    Logger.debug(
      `[logging-stack] Logging stack started for account ${cdk.Stack.of(this).account} and region ${
        cdk.Stack.of(this).region
      }`,
    );
    //
    // Create S3 Key in all account
    const s3Key = this.createS3Key();

    //
    // Create KMS keys defined in config
    this.createKeys();

    // create kms key for CloudWatch logs
    // the CloudWatch key for the management account
    // in the home region is created in the prepare stack
    if (
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId() &&
      (cdk.Stack.of(this).region === this.props.globalConfig.homeRegion ||
        cdk.Stack.of(this).region === this.props.globalRegion)
    ) {
      this.cloudwatchKey = this.lookupManagementAccountCloudWatchKey();
    } else {
      this.cloudwatchKey = this.createCloudWatchKey();
    }

    // create kms key for Lambda environment encryption
    // the Lambda environment encryption key for the management account
    // in the home region is created in the prepare stack
    if (
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId() &&
      (cdk.Stack.of(this).region === this.props.globalConfig.homeRegion ||
        cdk.Stack.of(this).region === this.props.globalRegion)
    ) {
      this.lambdaKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        'AcceleratorGetLambdaKey',
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          AcceleratorStack.ACCELERATOR_LAMBDA_KEY_ARN_PARAMETER_NAME,
        ),
      );
    } else {
      this.lambdaKey = new cdk.aws_kms.Key(this, 'AcceleratorLambdaKey', {
        alias: AcceleratorStack.ACCELERATOR_LAMBDA_KEY_ALIAS,
        description: AcceleratorStack.ACCELERATOR_LAMBDA_KEY_DESCRIPTION,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      new cdk.aws_ssm.StringParameter(this, 'AcceleratorLambdaKmsArnParameter', {
        parameterName: AcceleratorStack.ACCELERATOR_LAMBDA_KEY_ARN_PARAMETER_NAME,
        stringValue: this.lambdaKey.keyArn,
      });
    }

    //
    // Block Public Access; S3 is global, only need to call in home region. This is done in the
    // logging-stack instead of the security-stack since initial buckets are created in this stack.
    //
    if (
      cdk.Stack.of(this).region === this.props.globalConfig.homeRegion &&
      !this.isAccountExcluded(
        this.props.securityConfig.centralSecurityServices.s3PublicAccessBlock.excludeAccounts ?? [],
      )
    ) {
      if (this.props.securityConfig.centralSecurityServices.s3PublicAccessBlock.enable) {
        new S3PublicAccessBlock(this, 'S3PublicAccessBlock', {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
          accountId: cdk.Stack.of(this).account,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }

    //
    // Create S3 Bucket for Access Logs - this is required
    //
    const serverAccessLogsBucket = new Bucket(this, 'AccessLogsBucket', {
      encryptionType: BucketEncryptionType.SSE_S3, // Server access logging does not support SSE-KMS
      s3BucketName: `${AcceleratorStack.ACCELERATOR_S3_ACCESS_LOGS_BUCKET_NAME_PREFIX}-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`,
      s3LifeCycleRules: this.getS3LifeCycleRules(this.props.globalConfig.logging.accessLogBucket?.lifecycleRules),
    });

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/AccessLogsBucket/Resource/Resource`, [
      {
        id: 'AwsSolutions-S1',
        reason: 'AccessLogsBucket has server access logs disabled till the task for access logging completed.',
      },
    ]);

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

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/AccessLogsBucket/Resource/Resource`, [
      {
        id: 'AwsSolutions-S1',
        reason: 'AccessLogsBucket has server access logs disabled till the task for access logging completed.',
      },
    ]);

    //
    // Create Central Logs Bucket - This is done only in the home region of the log-archive account.
    // This is the destination bucket for all logs such as AWS CloudTrail, AWS Config, and VPC Flow
    // Logs. Addition logs can also be sent to this bucket through AWS CloudWatch Logs, such as
    // application logs, OS logs, or server logs.
    //
    //

    this.createCentralLogsBucket(serverAccessLogsBucket);

    //
    // When home region central log bucket will be present to get key arn, custom resource will not be needed to get key arn from ssm parameter

    if (this.centralLogsBucket) {
      this.centralLogBucketKey = this.centralLogsBucket.getS3Bucket().getKey();
    } else {
      this.centralLogBucketKey = new KeyLookup(this, 'AcceleratorCentralLogBucketKeyLookup', {
        accountId: this.props.accountsConfig.getLogArchiveAccountId(),
        keyRegion: this.props.globalConfig.homeRegion,
        roleName: CentralLogsBucket.CROSS_ACCOUNT_SSM_PARAMETER_ACCESS_ROLE_NAME,
        keyArnParameterName: CentralLogsBucket.KEY_ARN_PARAMETER_NAME,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      }).getKey();
    }

    const replicationProps: BucketReplicationProps = {
      destination: {
        bucketName: this.centralLogsBucketName,
        accountId: this.props.accountsConfig.getLogArchiveAccountId(),
        keyArn: this.centralLogBucketKey!.keyArn,
      },
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
    };

    //
    // Create VPC Flow logs destination bucket
    this.createVpcFlowLogsBucket(s3Key, serverAccessLogsBucket, replicationProps);

    /**
     * Create S3 Bucket for ELB Access Logs, this is created in log archive account
     * For ELB to write access logs bucket is needed to have SSE-S3 server-side encryption
     */
    if (cdk.Stack.of(this).account === this.props.accountsConfig.getLogArchiveAccountId()) {
      const elbAccessLogsBucket = new Bucket(this, 'ElbAccessLogsBucket', {
        encryptionType: BucketEncryptionType.SSE_S3, // Server access logging does not support SSE-KMS
        s3BucketName: `${AcceleratorStack.ACCELERATOR_ELB_LOGS_BUCKET_PREFIX}-${cdk.Stack.of(this).account}-${
          cdk.Stack.of(this).region
        }`,
        replicationProps,
      });
      let elbAccountId = undefined;
      if (AcceleratorElbRootAccounts[cdk.Stack.of(this).region]) {
        elbAccountId = AcceleratorElbRootAccounts[cdk.Stack.of(this).region];
      }
      if (props.networkConfig.elbAccountIds?.find(item => item.region === cdk.Stack.of(this).region)) {
        elbAccountId = props.networkConfig.elbAccountIds?.find(
          item => item.region === cdk.Stack.of(this).region,
        )!.accountId;
      }
      if (elbAccountId === undefined) {
        throw new Error(`elbAccountId is not defined for region: ${cdk.Stack.of(this).region}`);
      }
      // To make sure central log bucket created before elb access log bucket, this is required when logging stack executes in home region
      if (this.centralLogsBucket) {
        elbAccessLogsBucket.node.addDependency(this.centralLogsBucket);
      }

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/ElbAccessLogsBucket/ElbAccessLogsBucketReplication/` +
          pascalCase(this.centralLogsBucketName) +
          '-ReplicationRole/DefaultPolicy/Resource',
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Allows only specific policy.',
          },
        ],
      );

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
          principals: [new iam.AccountPrincipal(`${elbAccountId}`)],
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
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/ElbAccessLogsBucket/Resource/Resource`, [
        {
          id: 'AwsSolutions-S1',
          reason: 'ElbAccessLogsBucket has server access logs disabled till the task for access logging completed.',
        },
      ]);
    }

    if (this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable) {
      // create service linked role for autoscaling
      // if ebs default encryption enabled and using a customer master key
      new iam.CfnServiceLinkedRole(this, 'AutoScalingServiceLinkedRole', {
        awsServiceName: 'autoscaling.amazonaws.com',
        description:
          'Default Service-Linked Role enables access to AWS Services and Resources used or managed by Auto Scaling',
      });
    }
    // CloudWatchLogs to S3 replication

    // First, logs receiving account will setup Kinesis DataStream and Firehose
    // in LogArchive account home region
    // KMS to encrypt Kinesis, Firehose and any Lambda environment variables for CloudWatchLogs to S3 replication

    // CloudWatch logs replication requires Kinesis Data stream, Firehose and AWS Organizations
    // Some or all of these services may not be available in all regions.
    // Only deploy in standard and GovCloud partitions

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

    Logger.debug(`[logging-stack] Stack synthesis complete`);
  }

  private setOrganizationId() {
    if (this.props.organizationConfig.enable) {
      this.organizationId = new Organization(this, 'Organization').id;
    }
  }
  /**
   * Function to create S3 Key
   */
  private createS3Key() {
    //
    // Crete S3 key in every account except audit account,
    // this is required for SSM automation to get right KMS key to encrypt unencrypted bucket
    if (cdk.Stack.of(this).account !== this.props.accountsConfig.getAuditAccountId()) {
      Logger.debug(`[Logging-stack] Create S3 Key`);
      const s3Key = new cdk.aws_kms.Key(this, 'Accelerator3Key', {
        alias: AcceleratorStack.ACCELERATOR_S3_KEY_ALIAS,
        description: AcceleratorStack.ACCELERATOR_S3_KEY_DESCRIPTION,
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

      new cdk.aws_ssm.StringParameter(this, 'AcceleratorS3KmsArnParameter', {
        parameterName: AcceleratorStack.ACCELERATOR_S3_KEY_ARN_PARAMETER_NAME,
        stringValue: s3Key.keyArn,
      });

      return s3Key;
    } else {
      return this.createAuditAccountS3Key();
    }
  }

  /**
   * Function to create Audit account S3 bucket
   */
  private createAuditAccountS3Key(): cdk.aws_kms.Key {
    Logger.debug(`[key-stack] Create S3 Key`);
    const s3Key = new cdk.aws_kms.Key(this, 'AcceleratorAuditS3Key', {
      alias: AcceleratorStack.ACCELERATOR_S3_KEY_ALIAS,
      description: AcceleratorStack.ACCELERATOR_S3_KEY_DESCRIPTION,
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

    new cdk.aws_ssm.StringParameter(this, 'AcceleratorS3KmsArnParameter', {
      parameterName: AcceleratorStack.ACCELERATOR_S3_KEY_ARN_PARAMETER_NAME,
      stringValue: s3Key.keyArn,
    });

    return s3Key;
  }

  /**
   * Function to get VPC flow logs configuration when any VPC have S3 flow logs destination
   */
  private getS3FlowLogsDestinationConfig(): VpcFlowLogsConfig | undefined {
    let vpcFlowLogs: VpcFlowLogsConfig;
    for (const vpcItem of [...this.props.networkConfig.vpcs, ...(this.props.networkConfig.vpcTemplates ?? [])] ?? []) {
      // Get account IDs
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);
      if (vpcAccountIds.includes(cdk.Stack.of(this).account) && vpcItem.region === cdk.Stack.of(this).region) {
        if (vpcItem.vpcFlowLogs) {
          vpcFlowLogs = vpcItem.vpcFlowLogs;
        } else {
          vpcFlowLogs = this.props.networkConfig.vpcFlowLogs;
        }
        if (vpcFlowLogs.destinations.includes('s3')) {
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
   * @param s3Key
   * @param serverAccessLogsBucket
   * @param replicationProps
   */
  private createVpcFlowLogsBucket(
    s3Key: cdk.aws_kms.Key,
    serverAccessLogsBucket: Bucket,
    replicationProps: BucketReplicationProps,
  ) {
    const vpcFlowLogsConfig = this.getS3FlowLogsDestinationConfig();
    if (vpcFlowLogsConfig) {
      Logger.info(`[Logging-stack] Create S3 bucket for VPC flow logs destination`);

      const vpcFlowLogsBucket = new Bucket(this, 'AcceleratorVpcFlowLogsBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `${AcceleratorStack.ACCELERATOR_VPC_FLOW_LOGS_BUCKET_NAME_PREFIX}-${cdk.Stack.of(this).account}-${
          cdk.Stack.of(this).region
        }`,
        kmsKey: s3Key,
        serverAccessLogsBucket: serverAccessLogsBucket.getS3Bucket(),
        s3LifeCycleRules: this.getS3LifeCycleRules(vpcFlowLogsConfig.destinationsConfig?.s3?.lifecycleRules),
        replicationProps: replicationProps,
      });

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
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/AcceleratorVpcFlowLogsBucket/AcceleratorVpcFlowLogsBucketReplication/` +
          pascalCase(this.centralLogsBucketName) +
          '-ReplicationRole/DefaultPolicy/Resource',
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Allows only specific policy.',
          },
        ],
      );

      new cdk.aws_ssm.StringParameter(this, 'AcceleratorVpcFlowLogsBucketArnParameter', {
        parameterName: AcceleratorStack.ACCELERATOR_VPC_FLOW_LOGS_DESTINATION_S3_BUCKET_ARN_PARAMETER_NAME,
        stringValue: vpcFlowLogsBucket.getS3Bucket().bucketArn,
      });
    }
  }

  private cloudwatchLogReceivingAccount(centralLogsBucketName: string, lambdaKey: cdk.aws_kms.IKey) {
    const logsReplicationKmsKey = new cdk.aws_kms.Key(this, 'LogsReplicationKey', {
      alias: AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_REPLICATION_KEY_ALIAS,
      description: AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_REPLICATION_KEY_DESCRIPTION,
      enableKeyRotation: true,
      // kms is used to encrypt kinesis data stream,
      // unlike data store like s3, rds, dynamodb no snapshot/object is encrypted
      // it can be destroyed as encrypts service
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    // Check to see if Dynamic Partitioning was used
    let dynamicPartitionValue = '';
    if (this.props.globalConfig.logging.cloudwatchLogs?.dynamicPartitioning) {
      dynamicPartitionValue = fs.readFileSync(
        path.join(this.props.configDirPath, this.props.globalConfig.logging.cloudwatchLogs?.dynamicPartitioning),
        'utf-8',
      );
    }

    // // Create Kinesis Data Stream
    // Kinesis Stream - data stream which will get data from CloudWatch logs
    const logsKinesisStreamCfn = new cdk.aws_kinesis.CfnStream(this, 'LogsKinesisStreamCfn', {
      retentionPeriodHours: 24,
      shardCount: 1,
      streamEncryption: {
        encryptionType: 'KMS',
        keyId: logsReplicationKmsKey.keyArn,
      },
    });
    const logsKinesisStream = cdk.aws_kinesis.Stream.fromStreamArn(
      this,
      'LogsKinesisStream',
      logsKinesisStreamCfn.attrArn,
    );

    // LogsKinesisStream/Resource AwsSolutions-KDS3
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/LogsKinesisStreamCfn`, [
      {
        id: 'AwsSolutions-KDS3',
        reason: 'Customer managed key is being used to encrypt Kinesis Data Stream',
      },
    ]);
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
    });

    // Setup Firehose to take records from Kinesis and place in S3
    // Dynamic partition incoming records
    // so files from particular log group can be placed in their respective S3 prefix
    new CloudWatchToS3Firehose(this, 'FirehoseToS3Setup', {
      dynamicPartitioningValue: dynamicPartitionValue,
      bucketName: centralLogsBucketName,
      kinesisStream: logsKinesisStream,
      firehoseKmsKey: this.centralLogBucketKey!, // for firehose to access s3
      kinesisKmsKey: logsReplicationKmsKey, // for firehose to access kinesis
      homeRegion: this.props.globalConfig.homeRegion,
      lambdaKey: lambdaKey, // to encrypt lambda environment
    });
    // FirehosePrefixProcessingLambda/ServiceRole AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/FirehoseToS3Setup/FirehosePrefixProcessingLambda/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Managed policy for Lambda basic execution attached.',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/FirehoseToS3Setup/FirehoseS3ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Bucket permissions are wildcards to abort downloads and clean up objects. KMS permissions are wildcards to re-encrypt entities.',
        },
      ],
    );

    // Kinesis-Firehose-Stream-Dynamic-Partitioning AwsSolutions-KDF1: The Kinesis Data Firehose delivery stream does have server-side encryption enabled.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/FirehoseToS3Setup/Kinesis-Firehose-Stream-Dynamic-Partitioning`,
      [
        {
          id: 'AwsSolutions-KDF1',
          reason: 'Customer managed key is used to encrypt firehose delivery stream.',
        },
      ],
    );
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
      ':destination:AWSAcceleratorCloudWatchToS3';

    // Since this is deployed organization wide, this role is required
    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CreateSubscriptionFilter-IAMrole.html
    const subscriptionFilterRole = new cdk.aws_iam.Role(this, 'SubscriptionFilterRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`),
      description: 'Role used by Subscription Filter to allow access to CloudWatch Destination',
      inlinePolicies: {
        accessLogEvents: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: ['*'],
              actions: ['logs:PutLogEvents'],
            }),
          ],
        }),
      },
    });
    // Run a custom resource to update subscription, KMS and retention for all existing log groups
    const customResourceExistingLogs = new CloudWatchLogsSubscriptionFilter(this, 'LogsSubscriptionFilter', {
      logDestinationArn: logsDestinationArnValue,
      logsKmsKey: this.cloudwatchKey,
      logArchiveAccountId: this.props.accountsConfig.getLogArchiveAccountId(),
      logsRetentionInDaysValue: this.props.globalConfig.cloudwatchLogRetentionInDays.toString(),
      subscriptionFilterRoleArn: subscriptionFilterRole.roleArn,
    });

    //For every new log group that is created, set up subscription, KMS and retention
    const newLogCreationEvent = new NewCloudWatchLogEvent(this, 'NewCloudWatchLogsCreateEvent', {
      logDestinationArn: logsDestinationArnValue,
      lambdaEnvKey: this.lambdaKey,
      logsKmsKey: this.cloudwatchKey,
      logArchiveAccountId: this.props.accountsConfig.getLogArchiveAccountId(),
      logsRetentionInDaysValue: this.props.globalConfig.cloudwatchLogRetentionInDays.toString(),
      subscriptionFilterRoleArn: subscriptionFilterRole.roleArn,
    });

    // create custom resource before the new log group logic is created.
    newLogCreationEvent.node.addDependency(customResourceExistingLogs);

    // SubscriptionFilterRole AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/SubscriptionFilterRole/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Access is needed to ready all log events across all log groups for replication to S3.',
      },
    ]);
    // SetLogRetentionSubscriptionFunction AwsSolutions-IAM4
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/SetLogRetentionSubscriptionFunction/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Managed policy for Lambda basic execution attached.',
        },
      ],
    );
    // SetLogRetentionSubscriptionFunction AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/NewCloudWatchLogsCreateEvent/SetLogRetentionSubscriptionFunction/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This role needs permissions to change retention and subscription filter for any new log group that is created to enable log replication.',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Managed policy for Lambda basic execution attached.',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/NewCloudWatchLogsCreateEvent/SetLogRetentionSubscriptionFunction/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'This role needs permissions to change retention and subscription filter for any new log group that is created to enable log replication.',
        },
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Managed policy for Lambda basic execution attached.',
        },
      ],
    );

    return customResourceExistingLogs;
  }

  private lookupManagementAccountCloudWatchKey() {
    const cloudwatchKeyArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
      this,
      AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
    );

    return cdk.aws_kms.Key.fromKeyArn(this, 'AcceleratorGetCloudWatchKey', cloudwatchKeyArn);
  }

  private createCloudWatchKey() {
    const cloudwatchKey = new cdk.aws_kms.Key(this, 'AcceleratorCloudWatchKey', {
      alias: AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ALIAS,
      description: AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_DESCRIPTION,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    cloudwatchKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow Cloudwatch logs to use the encryption key`,
        principals: [
          new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`),
        ],
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

    new cdk.aws_ssm.StringParameter(this, 'AcceleratorCloudWatchKmsArnParameter', {
      parameterName: '/accelerator/kms/cloudwatch/key-arn',
      stringValue: cloudwatchKey.keyArn,
    });

    return cloudwatchKey;
  }

  /**
   * Function to create KMS Keys defined in config file
   */
  private createKeys() {
    if (!this.props.securityConfig.keyManagementService) {
      return;
    }

    for (const keyItem of this.props.securityConfig.keyManagementService.keySets) {
      if (!this.isIncluded(keyItem.deploymentTargets)) {
        Logger.info(`[Logging-stack] KMS Key ${keyItem.name} excluded`);
        continue;
      }
      Logger.debug(`[Logging-stack] Create KMS Key ${keyItem.name}`);

      const key = new cdk.aws_kms.Key(this, 'AcceleratorKmsKey-' + pascalCase(keyItem.name), {
        alias: keyItem.alias,
        description: keyItem.description,
        enabled: keyItem.enabled,
        enableKeyRotation: keyItem.enableKeyRotation,
        removalPolicy: keyItem.removalPolicy as cdk.RemovalPolicy,
      });

      if (keyItem.policy) {
        // Read in the policy document which should be properly formatted json
        const policyDocument = require(path.join(this.props.configDirPath, keyItem.policy));

        // Create a statements list using the PolicyStatement factory
        const statements: cdk.aws_iam.PolicyStatement[] = [];
        for (const statement of policyDocument.Statement) {
          statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
        }

        // Attach statements to key policy
        statements.forEach(item => key.addToResourcePolicy(item));
      }

      // Create SSM parameter
      new cdk.aws_ssm.StringParameter(this, 'AcceleratorKmsArnParameter-' + pascalCase(keyItem.name), {
        parameterName: `/accelerator/kms/${keyItem.name}/key-arn`,
        stringValue: key.keyArn,
      });

      // AwsSolutions-S1: The KMS Symmetric key does not have automatic key rotation enabled.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}` + '/AcceleratorKmsKey-' + pascalCase(keyItem.name) + `/Resource`,
        [
          {
            id: 'AwsSolutions-KMS5',
            reason: 'CMK policy defined by customer provided policy definition file.',
          },
        ],
      );
    }
  }
  /*
   * Function to create CentralLogs bucket in LogArchive account home region only
   * @param serverAccessLogsBucket
   */
  private createCentralLogsBucket(serverAccessLogsBucket: Bucket) {
    if (
      cdk.Stack.of(this).region === this.props.globalConfig.homeRegion &&
      cdk.Stack.of(this).account === this.props.accountsConfig.getLogArchiveAccountId()
    ) {
      const awsPrincipalAccesses: { name: string; principal: string; accessType: string }[] = [];

      if (this.props.securityConfig.centralSecurityServices.macie.enable) {
        awsPrincipalAccesses.push({
          name: 'Macie',
          principal: 'macie.amazonaws.com',
          accessType: BucketAccessType.READWRITE,
        });
      }

      if (this.props.securityConfig.centralSecurityServices.guardduty.enable) {
        awsPrincipalAccesses.push({
          name: 'Guardduty',
          principal: 'guardduty.amazonaws.com',
          accessType: BucketAccessType.READWRITE,
        });
      }

      if (this.props.securityConfig.centralSecurityServices.auditManager?.enable) {
        awsPrincipalAccesses.push({
          name: 'AuditManager',
          principal: 'auditmanager.amazonaws.com',
          accessType: BucketAccessType.READWRITE,
        });
      }

      if (this.props.globalConfig.logging.sessionManager.sendToS3) {
        Logger.debug(`[Logging-stack] Grant Session Manager access to Central Logs Bucket.`);
        awsPrincipalAccesses.push({
          name: 'SessionManager',
          principal: 'session-manager.amazonaws.com',
          accessType: BucketAccessType.NO_ACCESS,
        });
      }

      this.centralLogsBucket = new CentralLogsBucket(this, 'CentralLogsBucket', {
        s3BucketName: this.centralLogsBucketName,
        serverAccessLogsBucket: serverAccessLogsBucket,
        kmsAliasName: 'alias/accelerator/central-logs/s3',
        kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
        principalOrgIdCondition: this.getPrincipalOrgIdCondition(this.organizationId),
        orgPrincipals: this.getOrgPrincipals(this.organizationId),
        s3LifeCycleRules: this.getS3LifeCycleRules(this.props.globalConfig.logging.centralLogBucket?.lifecycleRules),
        awsPrincipalAccesses,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/CentralLogsBucket/CrossAccountCentralBucketKMSArnSsmParamAccessRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Central logs bucket arn SSM parameter needs access from other accounts',
          },
        ],
      );
    }
  }
}
