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
import { Construct } from 'constructs';
import { pascalCase } from 'change-case';
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Construction properties for CloudWatch to S3 replication for Kinesis Stream.
 */
export interface CloudWatchToS3FirehoseProps {
  /**
   *
   * Dynamic partitioning as JSON string array to partition records in firehose
   */
  dynamicPartitioningValue?: string;
  /**
   *
   * Source bucket object is must when source bucket name wasn't provided
   * This bucket will have all the CloudWatch Logs
   */
  bucket?: cdk.aws_s3.IBucket;
  /**
   *
   * Source bucket name is must when source bucket object wasn't provided
   * This bucket will have all the CloudWatch Logs
   */
  bucketName?: string;
  /**
   *
   * Kinesis Stream which will trigger Firehose
   */
  kinesisStream: cdk.aws_kinesis.IStream;
  /**
   *
   * KMS key to encrypt the Firehose
   */
  firehoseKmsKey: cdk.aws_kms.IKey;
  /**
   *
   * KMS key to encrypt the Lambda, when undefined default AWS managed key will be used
   */
  lambdaKey?: cdk.aws_kms.IKey;
  /**
   *
   * Home region where the log archive bucket is located.
   */
  homeRegion: string;
  /**
   *
   * KMS key to encrypt the Lambda
   */
  kinesisKmsKey: cdk.aws_kms.IKey;
  /**
   *
   * Config directory path
   */
  configDir: string;
  /**
   * Accelerator Prefix defaults to 'AWSAccelerator'.
   */
  acceleratorPrefix: string;
  /**
   * Use existing IAM roles for deployment.
   */
  useExistingRoles: boolean;
  /**
   * Firehose preprocessor function name
   */
  firehoseRecordsProcessorFunctionName: string;
  /**
   *
   * KMS key to encrypt the CloudWatch log group, when undefined default AWS managed key will be used
   */
  logsKmsKey?: cdk.aws_kms.IKey;
  /**
   *
   * CloudWatch Logs Retention in days from global config
   */
  logsRetentionInDaysValue: string;
}
/**
 * Class to configure CloudWatch replication on logs receiving account
 */
export class CloudWatchToS3Firehose extends Construct {
  constructor(scope: Construct, id: string, props: CloudWatchToS3FirehoseProps) {
    super(scope, id);

    if (props.dynamicPartitioningValue) {
      this.packageDynamicPartitionInDeployment(props.configDir, props.dynamicPartitioningValue);
    }

    let logsStorageBucket: cdk.aws_s3.IBucket;

    if ((!props.bucket && !props.bucketName) || (props.bucket && props.bucketName)) {
      throw new Error(
        'Either source bucket or source bucketName property must be defined. Only one property must be defined.',
      );
    }

    if (props.bucketName) {
      logsStorageBucket = cdk.aws_s3.Bucket.fromBucketName(this, `${pascalCase(props.bucketName)}`, props.bucketName);
    } else {
      logsStorageBucket = props.bucket!;
    }

    const firehosePrefixProcessingLambda = new cdk.aws_lambda.Function(this, 'FirehosePrefixProcessingLambda', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      functionName: props.firehoseRecordsProcessorFunctionName,
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'firehose-record-processing/dist')),
      handler: 'index.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
      environmentEncryption: props.lambdaKey,
      environment: {
        DynamicS3LogPartitioningMapping: props.dynamicPartitioningValue!,
        KinesisStreamArn: props.kinesisStream.streamArn,
      },
    });
    // Allow lambda to place records back to kinesis stream if the payload is over 6MB
    firehosePrefixProcessingLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['kinesis:PutRecords', 'kinesis:PutRecord', 'kinesis:ListShards'],
        resources: [props.kinesisStream.streamArn],
      }),
    );
    // Allow lambda use to kinesis stream kms key
    firehosePrefixProcessingLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'kms:Decrypt',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:ReEncryptTo',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:GenerateDataKeyPairWithoutPlaintext',
          'kms:GenerateDataKeyPair',
          'kms:ReEncryptFrom',
        ],
        resources: [props.kinesisKmsKey.keyArn],
      }),
    );
    const firehoseCloudwatchLogs = new cdk.aws_logs.LogGroup(this, 'FirehoseCloudwatchLogs', {
      logGroupName: `/accelerator/logs/firehose/${props.kinesisStream.streamName}`,
      retention: parseInt(props.logsRetentionInDaysValue),
      encryptionKey: props.logsKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const firehoseCloudwatchLogStream = new cdk.aws_logs.LogStream(this, 'FirehoseCloudWatchLogStream', {
      logGroup: firehoseCloudwatchLogs,
      logStreamName: 'DestinationDeliveryError',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const firehose = new cdk.aws_kinesisfirehose.CfnDeliveryStream(this, 'FirehoseStream', {
      deliveryStreamType: 'KinesisStreamAsSource',
      kinesisStreamSourceConfiguration: {
        kinesisStreamArn: props.kinesisStream.streamArn,
        roleArn: this.createKinesisStreamRole(
          props.kinesisStream.streamArn,
          props.kinesisKmsKey.keyArn,
          props.acceleratorPrefix,
          props.useExistingRoles,
        ),
      },
      extendedS3DestinationConfiguration: {
        bucketArn: logsStorageBucket.bucketArn,
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 64, // Minimum value that this can take
        },
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseCloudwatchLogs.logGroupName,
          logStreamName: firehoseCloudwatchLogStream.logStreamName,
        },
        compressionFormat: 'UNCOMPRESSED',
        dataFormatConversionConfiguration: {
          enabled: false,
        },
        roleArn: this.createFirehoseServiceRole(
          props.firehoseKmsKey.keyArn,
          props.homeRegion,
          logsStorageBucket.bucketArn,
          firehosePrefixProcessingLambda.functionArn,
          props.acceleratorPrefix,
          props.useExistingRoles,
          firehoseCloudwatchLogs,
          firehoseCloudwatchLogStream.logStreamName,
          props.logsKmsKey,
        ),
        dynamicPartitioningConfiguration: {
          enabled: true,
        },
        errorOutputPrefix: `CloudWatchLogs/processing-failed`,
        encryptionConfiguration: {
          kmsEncryptionConfig: {
            awskmsKeyArn: props.firehoseKmsKey.keyArn,
          },
        },
        prefix: '!{partitionKeyFromLambda:dynamicPrefix}',
        processingConfiguration: {
          enabled: true,
          processors: [
            {
              type: 'Lambda',
              parameters: [
                {
                  parameterName: 'LambdaArn',
                  parameterValue: firehosePrefixProcessingLambda.functionArn,
                },
                {
                  parameterName: 'NumberOfRetries',
                  parameterValue: '3',
                },
                {
                  // The AWS Lambda function has a 6 MB invocation payload quota. Your data can expand in size after it's processed by the AWS Lambda function. A smaller buffer size allows for more room should the data expand after processing.
                  // Minimum: 0.2 MB, maximum: 3 MB.
                  // setting to minimum to allow for large spikes in log traffic to firehose
                  parameterName: 'BufferSizeInMBs',
                  parameterValue: '0.2',
                },
                {
                  // The period of time during which Kinesis Data Firehose buffers incoming data before invoking the AWS Lambda function. The AWS Lambda function is invoked once the value of the buffer size or the buffer interval is reached.
                  // Minimum: 60 seconds, maximum: 900 seconds
                  // setting minimum so that lambda function is invoked frequently
                  parameterName: 'BufferIntervalInSeconds',
                  parameterValue: '60',
                },
              ],
            },
          ],
        },
      },
    });

    const stack = cdk.Stack.of(scope);

    // FirehosePrefixProcessingLambda/ServiceRole AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${firehosePrefixProcessingLambda.node.path}/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Managed policy for Lambda basic execution attached.',
        },
      ],
    );

    // Kinesis-Firehose-Stream-Dynamic-Partitioning AwsSolutions-KDF1: The Kinesis Data Firehose delivery stream does have server-side encryption enabled.
    NagSuppressions.addResourceSuppressionsByPath(stack, `${firehose.node.path}`, [
      {
        id: 'AwsSolutions-KDF1',
        reason: 'Customer managed key is used to encrypt firehose delivery stream.',
      },
    ]);

    // FirehoseToS3Setup/FirehoseServiceRole/Resource AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/FirehoseToS3Setup/FirehoseServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Bucket permissions are wildcards to abort downloads and clean up objects. KMS permissions are wildcards to re-encrypt entities.',
        },
      ],
    );
  }
  private packageDynamicPartitionInDeployment(configDirPath: string, dynamicPartitionPath: string) {
    const deploymentPackagePath = path.join(__dirname, 'firehose-record-processing/dist');

    // Make deployment folder
    fs.mkdirSync(path.join(deploymentPackagePath), { recursive: true });
    // dynamic partition can be in a path. Create the path in deployment package before copying file in.
    fs.mkdirSync(path.dirname(path.join(deploymentPackagePath, dynamicPartitionPath)), { recursive: true });
    // Copy file
    fs.copyFileSync(
      path.join(configDirPath, dynamicPartitionPath),
      path.join(deploymentPackagePath, dynamicPartitionPath),
    );
  }
  private createFirehoseServiceRole(
    firehoseKmsKeyArn: string,
    homeRegion: string,
    logsStorageBucketArn: string,
    processingLambdaArn: string,
    acceleratorPrefix: string,
    useExistingRoles: boolean,
    firehoseCloudwatchLogs: cdk.aws_logs.LogGroup,
    firehoseCloudwatchLogStream: string,
    logsKmsKey?: cdk.aws_kms.IKey,
  ) {
    if (useExistingRoles) {
      return `arn:${cdk.Stack.of(this).partition}:iam::${
        cdk.Stack.of(this).account
      }:role/${acceleratorPrefix}FirehoseRole`;
    }
    // Access is based on least privileged apis
    // Ref: https://docs.aws.amazon.com/firehose/latest/dev/controlling-access.html#using-iam-s3
    const policyStatements: cdk.aws_iam.PolicyStatement[] = [
      new cdk.aws_iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [firehoseKmsKeyArn],
        conditions: {
          StringEquals: {
            'kms:ViaService': `s3.${homeRegion}.amazonaws.com`,
          },
          StringLike: {
            'kms:EncryptionContext:aws:s3:arn': `${logsStorageBucketArn}/*`,
          },
        },
      }),
      new cdk.aws_iam.PolicyStatement({
        actions: [
          's3:AbortMultipartUpload',
          's3:GetBucketLocation',
          's3:GetObject',
          's3:ListBucket',
          's3:ListBucketMultipartUploads',
          's3:PutObject',
        ],
        resources: [logsStorageBucketArn, `${logsStorageBucketArn}/*`],
      }),
      new cdk.aws_iam.PolicyStatement({
        actions: ['lambda:InvokeFunction', 'lambda:GetFunctionConfiguration'],
        resources: [`${processingLambdaArn}:*`, `${processingLambdaArn}`],
      }),
      new cdk.aws_iam.PolicyStatement({
        actions: ['logs:PutLogEvents'],
        resources: [`${firehoseCloudwatchLogs.logGroupArn}:logstream:${firehoseCloudwatchLogStream}`],
      }),
    ];

    if (logsKmsKey) {
      policyStatements.push(
        new cdk.aws_iam.PolicyStatement({
          actions: ['kms:Encrypt*', 'kms:Describe*'],
          resources: [logsKmsKey.keyArn],
        }),
      );
    }

    const firehoseAccessS3KmsLambda = new cdk.aws_iam.PolicyDocument({
      statements: policyStatements,
    });

    const firehoseServiceRole = new cdk.aws_iam.Role(this, 'FirehoseServiceRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('firehose.amazonaws.com'),
      description: 'Role used by Kinesis Firehose to place Kinesis records in the central bucket.',
      // placing inline policy as firehose needs this from get-go or there might be a few initial failures
      inlinePolicies: {
        AccessS3KmsLambda: firehoseAccessS3KmsLambda,
      },
    });
    return firehoseServiceRole.roleArn;
  }
  private createKinesisStreamRole(
    kinesisStreamArn: string,
    kinesisStreamKmsArn: string,
    acceleratorPrefix: string,
    useExistingRoles: boolean,
  ) {
    if (useExistingRoles) {
      return `arn:${cdk.Stack.of(this).partition}:iam::${
        cdk.Stack.of(this).account
      }:role/${acceleratorPrefix}FirehoseRole`;
    }
    const firehoseAccessKinesis = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['kinesis:DescribeStream', 'kinesis:GetShardIterator', 'kinesis:GetRecords', 'kinesis:ListShards'],
          resources: [kinesisStreamArn],
        }),

        new cdk.aws_iam.PolicyStatement({
          actions: [
            'kms:Decrypt',
            'kms:Encrypt',
            'kms:GenerateDataKey',
            'kms:ReEncryptTo',
            'kms:GenerateDataKeyWithoutPlaintext',
            'kms:GenerateDataKeyPairWithoutPlaintext',
            'kms:GenerateDataKeyPair',
            'kms:ReEncryptFrom',
          ],
          resources: [kinesisStreamKmsArn],
        }),
      ],
    });

    const kinesisStreamRole = new cdk.aws_iam.Role(this, 'FirehoseKinesisStreamServiceRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('firehose.amazonaws.com'),
      description: 'Role used by Kinesis Firehose to get records from Kinesis.',
      // placing inline policy as firehose needs this from get-go or there might be a few initial failures
      inlinePolicies: {
        AccessKinesis: firehoseAccessKinesis,
      },
    });

    return kinesisStreamRole.roleArn;
  }
}
