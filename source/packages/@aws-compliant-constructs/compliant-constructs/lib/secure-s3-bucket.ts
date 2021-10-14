import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';

export enum BucketAccessType {
  READONLY = 'readonly',
  WRITEONLY = 'writeonly',
  READWRITE = 'readwrite',
}

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

  /**
   * @optional
   * A list of AWS principals and access type the bucket to grant
   * principal should be a valid AWS resource principal like for AWS Macie it should be macie.amazonaws.com
   * accessType should be any of these possible values BucketAccessType.READONLY, BucketAccessType.WRITEONLY, & and BucketAccessType.READWRITE
   */
  readonly awsPrincipalAccesses?: { principalAccesses: [{ principal: string; accessType: string }] };
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
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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

    // Add access policy for inputed AWS principal to the bucket
    // (add a `if` to make TS happy)
    if (props.awsPrincipalAccesses) {
      props.awsPrincipalAccesses.principalAccesses.forEach(input => {
        switch (input.accessType) {
          case BucketAccessType.READONLY:
            this.bucket.grantRead(new iam.ServicePrincipal(input.principal));
            break;
          case BucketAccessType.WRITEONLY:
            this.bucket.grantWrite(new iam.ServicePrincipal(input.principal));
            break;
          case BucketAccessType.READWRITE:
            this.bucket.grantReadWrite(new iam.ServicePrincipal(input.principal));
            break;
          default:
            throw new Error(`Invalid Access Type ${input.accessType} for ${input.principal} principal.`);
        }
      });
    }
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
