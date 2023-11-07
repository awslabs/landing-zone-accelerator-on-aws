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
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/constructs/test/aws-ec2/integ-test-account-warming --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import { CfnResource, Stack, StackProps, IAspect, Aspects, RemovalPolicy, App, Duration } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { WarmAccount } from '../../../lib/aws-ec2/account-warming';
import { Construct, IConstruct } from 'constructs';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
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

        if (!memorySize || memorySize < 256) {
          node.addPropertyOverride('MemorySize', 256);
        }
      }
    }
  }
}
// CDK App for Integration Tests
const app = new App();

export class AccountWarmingDemoStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const key = new Key(this, 'Key', { removalPolicy: RemovalPolicy.DESTROY });
    // Allow Cloudwatch logs to use the encryption key
    key.addToResourcePolicy(
      new PolicyStatement({
        sid: `Allow Cloudwatch logs to use the encryption key`,
        principals: [new ServicePrincipal(`logs.${Stack.of(this).region}.${Stack.of(this).urlSuffix}`)],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:${Stack.of(this).partition}:logs:${Stack.of(this).region}:${
              Stack.of(this).account
            }:log-group:*`,
          },
        },
      }),
    );
    new WarmAccount(this, 'AccountWarming', {
      cloudwatchKmsKey: key,
      logRetentionInDays: 3653,
      ssmPrefix: '/test',
    });
    Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    Aspects.of(this).add(new LambdaDefaultMemoryAspect());
  }
}

// Stack under test
const stackUnderTest = new AccountWarmingDemoStack(app, 'AccountWarmingIntegrationTestStack', {
  description: 'This stack includes the application’s resources for integration testing.',
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'AccountWarmingTest', {
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
integ.assertions
  .awsApiCall('SSM', 'getParameter', { Name: '/test/account/pre-warmed' })
  .expect(
    ExpectedResult.objectLike({
      Parameter: { Name: '/test/account/pre-warmed', Value: 'true', Type: 'String' },
    }),
  )
  .waitForAssertions({ totalTimeout: Duration.minutes(2) });
