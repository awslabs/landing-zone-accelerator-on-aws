/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Bucket, CentralLogsBucket, Organization, S3PublicAccessBlock } from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class LoggingStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const organization = Organization.getInstance(this, 'Organization');

    //
    // Block Public Access; S3 is global, only need to call in home region. This is done in the
    // logging-stack instead of the security-stack since initial buckets are created in this stack.
    //
    if (cdk.Stack.of(this).region === props.globalConfig.homeRegion) {
      new S3PublicAccessBlock(this, 'S3PublicAccessBlock', {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
        accountId: cdk.Stack.of(this).account,
      });
    }

    //
    // Create S3 Bucket for Access Logs - this is required
    //
    const serverAccessLogsBucket = new Bucket(this, 'AccessLogsBucket', {
      s3BucketName: `aws-accelerator-s3-access-logs-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      kmsAliasName: 'alias/accelerator/s3-access-logs/s3',
      kmsDescription: 'AWS Accelerator S3 Access Logs Bucket CMK',
    });

    // cfn_nag: Suppress warning related to the S3 bucket
    const cfnBucket = serverAccessLogsBucket.node.defaultChild?.node.defaultChild as s3.CfnBucket;
    cfnBucket.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W35',
            reason: 'S3 Bucket access logging is not enabled for the pipeline artifacts bucket.',
          },
        ],
      },
    };

    //
    // Create Central Logs Bucket - This is done only in the home region of the log-archive account.
    // This is the destination bucket for all logs such as AWS CloudTrail, AWS Config, and VPC Flow
    // Logs. Addition logs can also be sent to this bucket through AWS CloudWatch Logs, such as
    // application logs, OS logs, or server logs.
    //
    if (
      cdk.Stack.of(this).region === props.globalConfig.homeRegion &&
      cdk.Stack.of(this).account === props.accountsConfig.getLogArchiveAccountId()
    ) {
      //const CentralLogsBucket =
      new CentralLogsBucket(this, 'CentralLogsBucket', {
        s3BucketName: `aws-accelerator-central-logs-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
        serverAccessLogsBucket: serverAccessLogsBucket,
        kmsAliasName: 'alias/accelerator/central-logs/s3',
        kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
        organizationId: organization.id,
      });
    }
  }
}
