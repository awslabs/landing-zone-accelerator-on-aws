import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';

/**
 * Construction properties for a Secure S3 Bucket object.
 */
export interface SecureS3BucketProps {
  /**
   * Physical name of this bucket.
   *
   * @default - Assigned by CloudFormation (recommended).
   */
  readonly s3BucketName?: string;
  /**
   * Policy to apply when the bucket is removed from this stack.
   *
   * @default - The bucket will be orphaned.
   */
  readonly s3RemovalPolicy?: cdk.RemovalPolicy;
  /**
   * The name of the alias.
   */
  readonly kmsAliasName: string;
  /**
   * A description of the key.
   *
   * Use a description that helps your users decide
   * whether the key is appropriate for a particular task.
   *
   */
  readonly kmsDescription: string;
}

/**
 * Defines a Secure S3 Bucket object. By default a KMS CMK is generated and
 * associated to the bucket.
 */
export class SecureS3Bucket extends cdk.Construct {
  private readonly bucket: s3.Bucket;
  private readonly cmk: kms.Key;

  constructor(scope: cdk.Construct, id: string, props: SecureS3BucketProps) {
    super(scope, id);

    this.cmk = new kms.Key(this, 'Cmk', {
      enableKeyRotation: true,
      description: props.kmsDescription,
    });
    this.cmk.addAlias(props.kmsAliasName);

    this.bucket = new s3.Bucket(this, 'Resource', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.cmk,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: props.s3BucketName,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'deny-non-encrypted-object-uploads',
        effect: iam.Effect.DENY,
        actions: ['s3:PutObject'],
        resources: [this.bucket.arnForObjects('*')],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          StringNotEquals: {
            's3:x-amz-server-side-encryption': 'aws:kms',
          },
        },
      }),
    );
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'deny-insecure-connections',
        effect: iam.Effect.DENY,
        actions: ['s3:*'],
        resources: [this.bucket.arnForObjects('*')],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      }),
    );

    // cfn_nag: Suppress warning related to the S3AutoDeleteObjects lambda
    const cfnS3AutoDeleteObjectsFunction = cdk.Stack.of(this)
      .node.findChild('Custom::S3AutoDeleteObjectsCustomResourceProvider')
      .node.findChild('Handler') as lambda.CfnFunction;
    cfnS3AutoDeleteObjectsFunction.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W58',
            reason:
              'Lambda functions deployed through CDK have the required permission to write CloudWatch Logs. It uses custom policy instead of AWSLambdaBasicExecutionRole with more tighter permissions.',
          },
          {
            id: 'W89',
            reason: 'This function supports infrastructure deployment and is not deployed inside a VPC.',
          },
          {
            id: 'W92',
            reason:
              'This function supports infrastructure deployment and does not require setting ReservedConcurrentExecutions.',
          },
        ],
      },
    };
  }

  public getS3Bucket(): s3.IBucket {
    return this.bucket;
  }

  protected override validate(): string[] {
    const errors: string[] = [];

    // errors.push('some error');

    return errors;
  }
}
