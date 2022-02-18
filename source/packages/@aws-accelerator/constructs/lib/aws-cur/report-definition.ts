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

import { Aws, IResolvable, IResource, Resource } from 'aws-cdk-lib';
import * as cur from 'aws-cdk-lib/aws-cur';
import * as iam from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface IReportDefinition extends IResource {
  /**
   * The name of the report that you want to create.
   * @attribute
   */
  readonly reportName: string;
}

export type Compression = 'ZIP' | 'GZIP' | 'Parquet' | string;

export type Format = 'textORcsv' | 'Parquet' | string;

export type ReportVersioning = 'CREATE_NEW_REPORT' | 'OVERWRITE_REPORT' | string;

export type TimeUnit = 'HOURLY' | 'DAILY' | 'MONTHLY' | string;

export type AdditionalArtifacts = 'REDSHIFT' | 'QUICKSIGHT' | 'ATHENA' | string;

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
  readonly refreshClosedReports: boolean | IResolvable;

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
  readonly s3Bucket: IBucket;

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
}

export class ReportDefinition extends Resource implements IReportDefinition {
  public readonly reportName: string;

  constructor(scope: Construct, id: string, props: ReportDefinitionProps) {
    super(scope, id, {
      physicalName: props.reportName,
    });

    this.reportName = this.physicalName;

    new cur.CfnReportDefinition(this, 'Resource', {
      compression: props.compression,
      format: props.format,
      refreshClosedReports: props.refreshClosedReports,
      reportName: props.reportName,
      reportVersioning: props.reportVersioning,
      s3Bucket: props.s3Bucket.bucketName,
      s3Prefix: props.s3Prefix,
      s3Region: props.s3Region,
      timeUnit: props.timeUnit,
      additionalArtifacts: props.additionalArtifacts ? props.additionalArtifacts : undefined,
      additionalSchemaElements: props.additionalSchemaElements ? props.additionalSchemaElements : undefined,
      billingViewArn: props.billingViewArn ? props.billingViewArn : undefined,
    });

    this.addBucketPolicy(props.s3Bucket);
  }

  private addBucketPolicy(bucket: IBucket) {
    const _stmt1: iam.PolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
      principals: [new iam.ServicePrincipal('billingreports.amazonaws.com')],
      resources: [bucket.bucketArn],
      conditions: {
        StringEquals: {
          'aws:SourceArn': `arn:${Aws.PARTITION}:cur:us-east-1:${Aws.ACCOUNT_ID}:definition/*`,
          'aws:SourceAccount': `${Aws.ACCOUNT_ID}`,
        },
      },
    });

    const _stmt2: iam.PolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutObject'],
      principals: [new iam.ServicePrincipal('billingreports.amazonaws.com')],
      resources: [bucket.arnForObjects('*')],
      conditions: {
        StringEquals: {
          'aws:SourceArn': `arn:${Aws.PARTITION}:cur:us-east-1:${Aws.ACCOUNT_ID}:definition/*`,
          'aws:SourceAccount': `${Aws.ACCOUNT_ID}`,
        },
      },
    });

    bucket.addToResourcePolicy(_stmt1);
    bucket.addToResourcePolicy(_stmt2);
  }
}
