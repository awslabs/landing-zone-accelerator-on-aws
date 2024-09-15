/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/**
 * Steps to run
 * - install cdk in the account and bootstrap it
 * - from source run
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/constructs/test/aws-ec2/integ-test-ebs-encryption --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { App, Aspects, CfnResource, IAspect, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import {
  AccountPrincipal,
  AnyPrincipal,
  ArnPrincipal,
  Effect,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct, IConstruct } from 'constructs';
import { EbsDefaultEncryption } from '../../../lib/aws-ec2/ebs-encryption';

/**
 * Aspect for setting all removal policies to DESTROY
 */
class ApplyDestroyPolicyAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }
  }
}
class LambdaDefaultMemoryAspect implements IAspect {
  visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      if (node.cfnResourceType === 'AWS::Lambda::Function') {
        const cfnProps = (node as CfnFunction)['_cfnProperties'];
        let memorySize = cfnProps['MemorySize']?.toString();

        if (!memorySize) {
          memorySize = (node as CfnFunction).memorySize;
        }

        if (!memorySize || memorySize < 512) {
          node.addPropertyOverride('MemorySize', 512);
        }
      }
    }
  }
}
// CDK App for Integration Tests
const app = new App();

export class EbsEncryptionDemoStack extends Stack {
  /**
   * Declare EBS KMS key ID to validate in integration test
   */
  public readonly ebsKmsKeyId: string;
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const logGroupKmsKey = this.createCloudwatchKey();
    const ebsEncryptionKmsKey = this.createEbsKey();

    new EbsDefaultEncryption(this, 'DefaultEncryptionTest', {
      ebsEncryptionKmsKey,
      logGroupKmsKey,
      logRetentionInDays: 3653,
    });
    Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    Aspects.of(this).add(new LambdaDefaultMemoryAspect());

    this.ebsKmsKeyId = ebsEncryptionKmsKey.keyArn;
  }

  /**
   * Create KMS key for CloudWatch Logs
   * @returns Key
   */
  private createCloudwatchKey(): Key {
    const cloudWatchKey = new Key(this, 'Key', { removalPolicy: RemovalPolicy.DESTROY });
    // Allow Cloudwatch logs to use the encryption key
    cloudWatchKey.addToResourcePolicy(
      new PolicyStatement({
        sid: `Allow Cloudwatch logs to use the encryption key`,
        principals: [new ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:${this.partition}:logs:${this.region}:${this.account}:log-group:*`,
          },
        },
      }),
    );

    return cloudWatchKey;
  }

  /**
   * Create KMS key for EBS default volume encryption
   * @returns Key
   */
  private createEbsKey(): Key {
    const ebsEncryptionKey = new Key(this, 'EbsEncryptionKey', {
      removalPolicy: RemovalPolicy.DESTROY,
    });
    ebsEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'Allow service-linked role use',
        effect: Effect.ALLOW,
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
        principals: [
          new ArnPrincipal(
            `arn:${this.partition}:iam::${this.account}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
          ),
        ],
        resources: ['*'],
      }),
    );
    ebsEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'Allow Autoscaling to create grant',
        effect: Effect.ALLOW,
        actions: ['kms:CreateGrant'],
        principals: [
          new ArnPrincipal(
            `arn:${this.partition}:iam::${this.account}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
          ),
        ],
        resources: ['*'],
        conditions: { Bool: { 'kms:GrantIsForAWSResource': 'true' } },
      }),
    );
    ebsEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'Account Access',
        effect: Effect.ALLOW,
        principals: [new AccountPrincipal(this.account)],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );
    ebsEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'ec2',
        effect: Effect.ALLOW,
        principals: [new AnyPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': this.account,
            'kms:ViaService': `ec2.${this.region}.amazonaws.com`,
          },
        },
      }),
    );

    return ebsEncryptionKey;
  }
}

// Stack under test
const stackUnderTest = new EbsEncryptionDemoStack(app, 'EbsEncryptionTestStack', {
  description: 'Stack for EBS default volume encryption integration tests',
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'EbsEncryptionTest', {
  testCases: [stackUnderTest], // Define a list of cases for this test
  cdkCommandOptions: {
    deploy: {
      args: {
        rollback: false,
      },
    },
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [stackUnderTest.region],
});
//
// Check encryption status
integ.assertions
  .awsApiCall('EC2', 'getEbsEncryptionByDefault', {})
  .expect(ExpectedResult.objectLike({ EbsEncryptionByDefault: true }));
//
// Check KMS key ID
integ.assertions
  .awsApiCall('EC2', 'getEbsDefaultKmsKeyId', {})
  .expect(ExpectedResult.objectLike({ KmsKeyId: stackUnderTest.ebsKmsKeyId }));
