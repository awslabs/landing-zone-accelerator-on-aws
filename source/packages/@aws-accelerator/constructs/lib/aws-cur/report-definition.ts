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
import * as path from 'path';

export interface IReportDefinition extends cdk.IResource {
  /**
   * The name of the report that you want to create.
   * @attribute
   */
  readonly reportName: string;
}

type Compression = 'ZIP' | 'GZIP' | 'Parquet' | string;

type Format = 'textORcsv' | 'Parquet' | string;

type ReportVersioning = 'CREATE_NEW_REPORT' | 'OVERWRITE_REPORT' | string;

type TimeUnit = 'HOURLY' | 'DAILY' | 'MONTHLY' | string;

type AdditionalArtifacts = 'REDSHIFT' | 'QUICKSIGHT' | 'ATHENA' | string;

export interface ReportDefinitionProps {
  /**
   * The compression format that Amazon Web Services uses for the report.
   *
   */
  readonly compression: Compression;

  /**
   * The format that Amazon Web Services saves the report in.
   *
   */
  readonly format: Format;

  /**
   * Whether you want Amazon Web Services to update your reports after they have been finalized if
   * Amazon Web Services detects charges related to previous months.
   *
   */
  readonly refreshClosedReports: boolean | cdk.IResolvable;

  /**
   * The name of the report that you want to create.
   *
   * @default - A CDK generated name
   */
  readonly reportName: string;

  /**
   * Whether you want Amazon Web Services to overwrite the previous version of each report or to
   * deliver the report in addition to the previous versions.
   *
   */
  readonly reportVersioning: ReportVersioning;

  /**
   * The S3 bucket where Amazon Web Services delivers the report.
   *
   */
  readonly s3Bucket: cdk.aws_s3.IBucket;

  /**
   * The prefix that Amazon Web Services adds to the report name when Amazon Web Services delivers the report.
   *
   */
  readonly s3Prefix: string;

  /**
   * The Region of the S3 bucket that Amazon Web Services delivers the report into.
   *
   */
  readonly s3Region: string;

  /**
   * The granularity of the line items in the report.
   *
   */
  readonly timeUnit: TimeUnit;

  /**
   * A list of manifests that you want Amazon Web Services to create for this report.
   *
   * @default - no additional artifacts
   */
  readonly additionalArtifacts?: AdditionalArtifacts[];

  /**
   * A list of strings that indicate additional content that Amazon Web Services includes in
   * the report, such as individual resource IDs.
   *
   * @default - no additional schema elements
   */
  readonly additionalSchemaElements?: string[];

  /**
   * The Amazon Resource Name (ARN) of the billing view.
   *
   * @default - no billing view ARN
   */
  readonly billingViewArn?: string;

  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * The partition of this stack.
   */
  readonly partition: string;
}

export class ReportDefinition extends cdk.Resource implements IReportDefinition {
  public readonly reportName: string;
  private readonly globalRegion: string;

  constructor(scope: Construct, id: string, props: ReportDefinitionProps) {
    super(scope, id, {
      physicalName: props.reportName,
    });

    this.reportName = this.physicalName;

    if (props.partition === 'aws-cn') {
      this.globalRegion = 'cn-northwest-1';
    } else {
      this.globalRegion = 'us-east-1';
    }

    // Cfn resource AWS::CUR::ReportDefinition is available in region us-east-1 only.
    if (cdk.Stack.of(this).region === 'us-east-1') {
      // Use native Cfn construct
      new cdk.aws_cur.CfnReportDefinition(this, 'Resource', {
        compression: props.compression,
        format: props.format,
        refreshClosedReports: props.refreshClosedReports,
        reportName: props.reportName,
        reportVersioning: props.reportVersioning,
        s3Bucket: props.s3Bucket.bucketName,
        s3Prefix: props.s3Prefix,
        s3Region: props.s3Region,
        timeUnit: props.timeUnit,
        additionalArtifacts: props.additionalArtifacts,
        additionalSchemaElements: props.additionalSchemaElements,
        billingViewArn: props.billingViewArn,
      });
    } else {
      // Use custom resource
      const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::CrossRegionReportDefinition', {
        codeDirectory: path.join(__dirname, 'cross-region-report-definition/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
        policyStatements: [
          {
            Effect: 'Allow',
            Action: ['cur:DeleteReportDefinition', 'cur:ModifyReportDefinition', 'cur:PutReportDefinition'],
            Resource: '*',
          },
        ],
      });

      const resource = new cdk.CustomResource(this, 'Resource', {
        resourceType: 'Custom::CrossRegionReportDefinition',
        serviceToken: provider.serviceToken,
        properties: {
          reportDefinition: {
            ReportName: props.reportName,
            TimeUnit: props.timeUnit,
            Format: props.format,
            Compression: props.compression,
            S3Bucket: props.s3Bucket.bucketName,
            S3Prefix: props.s3Prefix,
            S3Region: props.s3Region,
            AdditionalSchemaElements: props.additionalSchemaElements ?? [],
            AdditionalArtifacts: props.additionalArtifacts,
            RefreshClosedReports: props.refreshClosedReports,
            ReportVersioning: props.reportVersioning,
            BillingViewArn: props.billingViewArn,
          },
        },
      });

      /**
       * Singleton pattern to define the log group for the singleton function
       * in the stack
       */
      const stack = cdk.Stack.of(scope);
      const logGroup =
        (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
        new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
          logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
          retention: props.logRetentionInDays,
          encryptionKey: props.kmsKey,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
      resource.node.addDependency(logGroup);
    }

    // Add bucket policy
    const policy = this.addBucketPolicy(props.s3Bucket);
    this.node.addDependency(policy);
  }

  private addBucketPolicy(bucket: cdk.aws_s3.IBucket): cdk.aws_s3.BucketPolicy {
    const _stmt1: cdk.aws_iam.PolicyStatement = new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
      principals: [new cdk.aws_iam.ServicePrincipal('billingreports.amazonaws.com')],
      resources: [bucket.bucketArn],
      conditions: {
        StringEquals: {
          'aws:SourceArn': `arn:${cdk.Aws.PARTITION}:cur:${this.globalRegion}:${cdk.Aws.ACCOUNT_ID}:definition/*`,
          'aws:SourceAccount': `${cdk.Aws.ACCOUNT_ID}`,
        },
      },
    });

    const _stmt2: cdk.aws_iam.PolicyStatement = new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['s3:PutObject'],
      principals: [new cdk.aws_iam.ServicePrincipal('billingreports.amazonaws.com')],
      resources: [bucket.arnForObjects('*')],
      conditions: {
        StringEquals: {
          'aws:SourceArn': `arn:${cdk.Aws.PARTITION}:cur:${this.globalRegion}:${cdk.Aws.ACCOUNT_ID}:definition/*`,
          'aws:SourceAccount': `${cdk.Aws.ACCOUNT_ID}`,
        },
      },
    });

    bucket.addToResourcePolicy(_stmt1);
    bucket.addToResourcePolicy(_stmt2);

    return bucket.policy!;
  }
}
