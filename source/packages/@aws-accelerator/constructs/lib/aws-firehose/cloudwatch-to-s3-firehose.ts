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
  /**
   *
   * Config directory path
   */
  configDir: string;
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
    const glueDatabase = new cdk.aws_glue.CfnDatabase(this, 'FirehoseCloudWatchDb', {
      catalogId: cdk.Stack.of(this).account,
      databaseInput: {
        description: 'Glue database to store AWS Accelerator CloudWatch logs',
      },
    });

    const glueTable = new cdk.aws_glue.CfnTable(this, 'FirehoseCloudWatchTable', {
      catalogId: cdk.Stack.of(this).account,
      databaseName: glueDatabase.ref,
      tableInput: {
        description: 'Glue table to store AWS Accelerator CloudWatch logs',
        name: 'aws-accelerator-firehose-transformation-table',
        tableType: 'EXTERNAL_TABLE',
        storageDescriptor: {
          // Ref: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/ValidateLogEventFlow.html
          columns: [
            {
              name: 'messagetype',
              comment:
                'Data messages use the "DATA_MESSAGE" type. Sometimes CloudWatch Logs may emit Kinesis records with a "CONTROL_MESSAGE" type, mainly for checking if the destination is reachable.',
              type: 'string',
            },
            {
              name: 'owner',
              comment: 'The AWS Account ID of the originating log data',
              type: 'string',
            },
            {
              name: 'loggroup',
              comment: 'The log group name of the originating log data.',
              type: 'string',
            },
            {
              name: 'subscriptionfilters',
              comment:
                'The list of comma delimited subscription filter names that matched with the originating log data.',
              type: 'string',
            },
            {
              name: 'logeventsid',
              comment: 'The ID property is a unique identifier for every log event.',
              type: 'string',
            },
            {
              name: 'logeventstimestamp',
              comment: 'Timestamp of the log event',
              type: 'timestamp',
            },
            {
              name: 'logeventsmessage',
              comment: 'Actual message of the log event which is in json string',
              type: 'string',
            },
          ],
        },
      },
    });

    const firehosePrefixProcessingLambda = new cdk.aws_lambda.Function(this, 'FirehosePrefixProcessingLambda', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
      functionName: 'AWSAccelerator-FirehoseRecordsProcessor',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'firehose-record-processing/dist')),
      handler: 'index.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(5),
      environmentEncryption: props.lambdaKey,
      environment: {
        DynamicS3LogPartitioningMapping: props.dynamicPartitioningValue!,
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
        // granting firehose access to glue for record conversion
        // Ref: https://docs.aws.amazon.com/firehose/latest/dev/controlling-access.html#using-iam-glue
        new cdk.aws_iam.PolicyStatement({
          actions: ['glue:GetTable', 'glue:GetTableVersion', 'glue:GetTableVersions'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:glue:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:catalog`,
            `arn:${cdk.Stack.of(this).partition}:glue:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:database/${glueDatabase.ref}`,
            `arn:${cdk.Stack.of(this).partition}:glue:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:table/${glueDatabase.ref}/${glueTable.ref}`,
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
          sizeInMBs: 128, // Maximum possible value
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
        dataFormatConversionConfiguration: {
          enabled: true,
          inputFormatConfiguration: {
            deserializer: {
              openXJsonSerDe: {
                caseInsensitive: true,
              },
            },
          },
          outputFormatConfiguration: {
            serializer: {
              parquetSerDe: {
                compression: 'SNAPPY',
              },
            },
          },
          schemaConfiguration: {
            databaseName: glueDatabase.ref,
            roleArn: firehoseServiceRole.roleArn,
            tableName: glueTable.ref,
          },
        },
      },
    });
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
}
