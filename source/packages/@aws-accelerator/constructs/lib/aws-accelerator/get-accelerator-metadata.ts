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
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'change-case';
const path = require('path');

/**
 * Initialized AcceleratorMetadataProps properties
 */
export interface AcceleratorMetadataProps {
  /**
   * Assume Role Name for writing to Accelerator metadata bucket
   */
  readonly assumeRole: string;
  /**
   * Metadata Account Id
   */
  readonly loggingAccountId: string;
  /**
   * Central logging Bucket name
   */

  readonly centralLogBucketName: string;
  /**
   * ELB log bucket name
   */
  readonly elbLogBucketName: string;
  /**
   * metadata log bucket name
   */
  readonly metadataLogBucketName: string;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * Accelerator SSM parameter Prefix
   */
  readonly acceleratorSsmParamPrefix: string;
  /**
   * The Accelerator Organization Id
   */
  readonly organizationId: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudwatchKmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Accelerator Config Repository Name
   */
  readonly acceleratorConfigRepositoryName: string;
  /**
   * Global Region
   */
  readonly globalRegion: string;
}

/**
 * Class for FMSOrganizationAdminAccount
 */
export class AcceleratorMetadata extends Construct {
  lambdaFunction: { lambda: cdk.aws_lambda.Function; logGroup: cdk.aws_logs.LogGroup };
  role: cdk.aws_iam.Role;
  rule: cdk.aws_events.Rule;
  constructor(scope: Construct, id: string, props: AcceleratorMetadataProps) {
    super(scope, id);

    const stack = cdk.Stack.of(scope);
    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;
    const functionName = `${props.acceleratorPrefix}-metadata-collection`;

    const lambdaCode = cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'get-accelerator-metadata/dist'));
    this.role = this.createLambdaRole(props.acceleratorPrefix, account, region, props.metadataLogBucketName);
    this.lambdaFunction = this.createLambdaFunction(functionName, stack, lambdaCode, this.role, props);
    this.rule = this.createMetadataCloudwatchRule(props.acceleratorPrefix, this.lambdaFunction.lambda);
    this.setCdkNagSuppressions(stack, id, this.role);
  }

  private createLambdaRole(acceleratorPrefix: string, account: string, region: string, metadataLogBucketName: string) {
    const lambdaRole = new cdk.aws_iam.Role(this, 'MetadataLambda', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: `${acceleratorPrefix}-${account}-${region}-metadata-lambda-role`,
    });
    console.log(lambdaRole.node.tryGetContext('suffix'));
    lambdaRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'codepipeline:GetPipelineExecution',
          'codepipeline:ListPipelineExecutions',
          'codecommit:GetFolder',
          'codecommit:GetFile',
          'kms:DescribeKey',
          'kms:Decrypt',
          'kms:Encrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:ListAliases',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'organizations:DescribeOrganizationalUnit',
          'organizations:DescribeAccount',
          'organizations:ListAccounts',
          'organizations:ListChildren',
          'organizations:ListOrganizationalUnitsForParent',
          'organizations:ListParents',
          'organizations:ListRoots',
          'ssm:GetParameter',
          'sts:AssumeRole',
        ],
        resources: [`*`],
      }),
    );
    lambdaRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          's3:GetObject*',
          's3:GetBucket*',
          's3:List*',
          's3:DeleteObject*',
          's3:PutObjectAcl',
          's3:PutObject',
          's3:PutObjectLegalHold',
          's3:PutObjectRetention',
          's3:PutObjectTagging',
          's3:PutObjectVersionTagging',
          's3:Abort*',
        ],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:s3:::${metadataLogBucketName}`,
          `arn:${cdk.Stack.of(this).partition}:s3:::${metadataLogBucketName}/*`,
        ],
      }),
    );
    return lambdaRole;
  }
  private createLambdaFunction(
    functionName: string,
    stack: cdk.Stack,
    code: cdk.aws_lambda.AssetCode,
    role: cdk.aws_iam.Role,
    props: AcceleratorMetadataProps,
  ) {
    const logGroup = this.setCloudwatchLogGroup(stack, functionName, props.cloudwatchKmsKey, props.logRetentionInDays);
    const lambda = new cdk.aws_lambda.Function(this, functionName, {
      functionName,
      role,
      code,
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.minutes(10),
      handler: 'index.handler',
      environment: {
        CROSS_ACCOUNT_ROLE: props.assumeRole,
        LOG_ACCOUNT_ID: props.loggingAccountId,
        PARTITION: cdk.Stack.of(this).partition,
        CONFIG_REPOSITORY_NAME: props.acceleratorConfigRepositoryName,
        ORGANIZATION_ID: props.organizationId,
        CENTRAL_LOG_BUCKET: props.centralLogBucketName,
        ELB_LOGGING_BUCKET: props.elbLogBucketName,
        METADATA_BUCKET: props.metadataLogBucketName,
        ACCELERATOR_PREFIX: props.acceleratorPrefix,
        GLOBAL_REGION: props.globalRegion,
        ACCELERATOR_VERSION_SSM_PATH: `${props.acceleratorSsmParamPrefix}/${props.acceleratorPrefix}-InstallerStack/version`,
      },
    });

    lambda.node.addDependency(logGroup);
    return {
      lambda,
      logGroup,
    };
  }
  private createMetadataCloudwatchRule(acceleratorPrefix: string, targetFunction: cdk.aws_lambda.Function) {
    const rule = new cdk.aws_events.Rule(this, pascalCase(`${acceleratorPrefix}MetadataCollectionRule`), {
      schedule: cdk.aws_events.Schedule.rate(cdk.Duration.days(1)),
      ruleName: `${acceleratorPrefix}-metadata-collection-rule`,
    });

    rule.addTarget(new cdk.aws_events_targets.LambdaFunction(targetFunction));
    return rule;
  }

  private setCloudwatchLogGroup(
    stack: cdk.Stack,
    lambdaFunctionName: string,
    kmsKey: cdk.aws_kms.Key,
    retention: number,
  ) {
    return new cdk.aws_logs.LogGroup(stack, `${lambdaFunctionName}LogGroup`, {
      logGroupName: `/aws/lambda/${lambdaFunctionName}`,
      retention,
      encryptionKey: kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
  private setCdkNagSuppressions(stack: cdk.Stack, constructId: string, role: cdk.aws_iam.Role) {
    // AwsSolutions-IAM5: AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${constructId}/${role.node.id}/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'accelerator metadata collection custom resource',
        },
      ],
    );
  }
}
