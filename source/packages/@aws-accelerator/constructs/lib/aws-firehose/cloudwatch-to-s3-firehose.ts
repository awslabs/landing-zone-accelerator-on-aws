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
import * as path from 'path';

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
   * KMS key to encrypt the Lambda
   */
  lambdaKey: cdk.aws_kms.IKey;
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
}
/**
 * Class to configure CloudWatch replication on logs receiving account
 */
export class CloudWatchToS3Firehose extends Construct {
  constructor(scope: Construct, id: string, props: CloudWatchToS3FirehoseProps) {
    super(scope, id);

    let dynamicPartitioning = '';
    if (props.dynamicPartitioningValue) {
      dynamicPartitioning = props.dynamicPartitioningValue;
    }

    let logsStorageBucket: cdk.aws_s3.IBucket;
    if (props.bucket && props.bucketName) {
      throw new Error('Source bucket or source bucketName (only one property) should be defined.');
    }

    if (!props.bucket && !props.bucketName) {
      throw new Error('Source bucket or source bucketName property must be defined when using bucket replication.');
    }

    if (props.bucketName) {
      logsStorageBucket = cdk.aws_s3.Bucket.fromBucketName(this, `${pascalCase(props.bucketName)}`, props.bucketName);
    } else {
      logsStorageBucket = props.bucket!;
    }

    const firehosePrefixProcessingLambda = new cdk.aws_lambda.Function(this, 'FirehosePrefixProcessingLambda', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
      functionName: 'AWSAccelerator-FirehoseRecordsProcessor',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'firehose-record-processing/dist')),
      handler: 'index.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
      environmentEncryption: props.lambdaKey,
      environment: {
        DynamicS3LogPartitioningMapping: dynamicPartitioning,
      },
    });

    // Access is based on least privileged apis
    // Ref: https://docs.aws.amazon.com/firehose/latest/dev/controlling-access.html#using-iam-s3
    const firehoseAccessS3KmsLambda = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [props.firehoseKmsKey.keyArn],
          conditions: {
            StringEquals: {
              'kms:ViaService': `s3.${props.homeRegion}.amazonaws.com`,
            },
            StringLike: {
              'kms:EncryptionContext:aws:s3:arn': `${logsStorageBucket.bucketArn}/*`,
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
          resources: [logsStorageBucket.bucketArn, `${logsStorageBucket.bucketArn}/*`],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['lambda:InvokeFunction', 'lambda:GetFunctionConfiguration'],
          resources: [
            `${firehosePrefixProcessingLambda.functionArn}:*`,
            `${firehosePrefixProcessingLambda.functionArn}`,
          ],
        }),
      ],
    });

    const firehoseServiceRole = new cdk.aws_iam.Role(this, 'FirehoseS3ServiceRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('firehose.amazonaws.com'),
      description: 'Role used by Kinesis Firehose to place Kinesis records in the central bucket.',
      // placing inline policy as firehose needs this from get-go or there might be a few initial failures
      inlinePolicies: {
        AccessS3KmsLambda: firehoseAccessS3KmsLambda,
      },
    });

    const firehoseAccessKinesis = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['kinesis:DescribeStream', 'kinesis:GetShardIterator', 'kinesis:GetRecords', 'kinesis:ListShards'],
          resources: [props.kinesisStream.streamArn],
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
          resources: [props.kinesisKmsKey.keyArn],
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

    new cdk.aws_kinesisfirehose.CfnDeliveryStream(this, 'Kinesis-Firehose-Stream-Dynamic-Partitioning', {
      deliveryStreamType: 'KinesisStreamAsSource',
      kinesisStreamSourceConfiguration: {
        kinesisStreamArn: props.kinesisStream.streamArn,
        roleArn: kinesisStreamRole.roleArn,
      },
      extendedS3DestinationConfiguration: {
        bucketArn: logsStorageBucket.bucketArn,
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 64, // Minimum with dynamic partitioning
        },
        compressionFormat: 'UNCOMPRESSED',
        roleArn: firehoseServiceRole.roleArn,
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
              ],
            },
          ],
        },
      },
    });
  }
}
