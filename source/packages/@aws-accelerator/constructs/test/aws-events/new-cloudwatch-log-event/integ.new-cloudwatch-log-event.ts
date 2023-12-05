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
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/constructs/test/aws-events/new-cloudwatch-log-event --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import * as cdk from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct, IConstruct } from 'constructs';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { AcceleratorAspects } from '../../../../accelerator/lib/accelerator-aspects';
import { CloudWatchDestination, NewCloudWatchLogEvent } from '@aws-accelerator/constructs';
/**
 * Aspect for setting all removal policies to DESTROY
 */
class ApplyDestroyPolicyAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      node.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}

// CDK App for Integration Tests
const app = new cdk.App();

export class NewCloudWatchLogEventDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    const key = new Key(this, 'Key', { removalPolicy: cdk.RemovalPolicy.DESTROY });
    // Allow Cloudwatch logs to use the encryption key
    key.addToResourcePolicy(
      new PolicyStatement({
        sid: `Allow Cloudwatch logs to use the encryption key`,
        principals: [new ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`)],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
              cdk.Stack.of(this).region
            }:${cdk.Stack.of(this).account}:log-group:*`,
          },
        },
      }),
    );

    // Create Kinesis Data Stream
    // Kinesis Stream - data stream which will get data from CloudWatch logs
    const logsKinesisStreamCfn = new cdk.aws_kinesis.CfnStream(this, 'LogsKinesisStreamCfn', {
      retentionPeriodHours: 24,
      shardCount: 1,
      streamEncryption: {
        encryptionType: 'KMS',
        keyId: key.keyArn,
      },
    });
    const logsKinesisStream = cdk.aws_kinesis.Stream.fromStreamArn(
      this,
      'LogsKinesisStream',
      logsKinesisStreamCfn.attrArn,
    );

    // Cloudwatch logs destination which points to Kinesis Data Stream
    new CloudWatchDestination(this, 'LogsDestinationSetup', {
      kinesisKmsKey: key,
      kinesisStream: logsKinesisStream,
      partition: cdk.Stack.of(this).partition,
      accountIds: [cdk.Stack.of(this).account],
      acceleratorPrefix: 'AWSAccelerator',
      useExistingRoles: false,
    });

    const subscriptionFilterRole = new cdk.aws_iam.Role(this, 'SubscriptionFilterRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`),
      description: 'Role used by Subscription Filter to allow access to CloudWatch Destination',
      inlinePolicies: {
        accessLogEvents: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: ['*'],
              actions: ['logs:PutLogEvents'],
            }),
          ],
        }),
      },
    });

    const accountRegionExclusion = {
      account: cdk.Stack.of(this).account,
      region: cdk.Stack.of(this).region,
      logGroupNames: ['aws-controltower/CloudTrailLogs', 'demoGroup', 'test*'],
    };
    const logsDestinationArnValue = `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
      cdk.Stack.of(this).account
    }:destination:AWSAcceleratorCloudWatchToS3`;

    const newCwLogEvent = new NewCloudWatchLogEvent(this, 'NewCloudWatchLogEvent', {
      logDestinationArn: logsDestinationArnValue,
      lambdaEnvKey: key,
      logsKmsKey: key,
      logArchiveAccountId: cdk.Stack.of(this).account,
      logsRetentionInDaysValue: '3653',
      subscriptionFilterRoleArn: subscriptionFilterRole.roleArn,
      exclusionSetting: accountRegionExclusion!,
      acceleratorPrefix: 'AWSAccelerator',
      useExistingRoles: false,
    });

    const includedGroup = new cdk.aws_logs.LogGroup(this, 'IncludedGroup', {
      logGroupName: 'includedGroup',
    });

    const excludedGroup = new cdk.aws_logs.LogGroup(this, 'ExcludedGroup', {
      logGroupName: 'demoGroup',
    });

    const excludedWildcardGroup = new cdk.aws_logs.LogGroup(this, 'ExcludedWildcardGroup', {
      logGroupName: 'testerGroup',
    });

    includedGroup.node.addDependency(newCwLogEvent);
    excludedGroup.node.addDependency(newCwLogEvent);
    excludedWildcardGroup.node.addDependency(newCwLogEvent);

    cdk.Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    new AcceleratorAspects(app, 'aws', false);
  }
}

// Stack under test
const stackUnderTest = new NewCloudWatchLogEventDemoStack(app, 'NewCloudWatchLogEventIntegrationTestStack', {
  description: 'This stack includes the application’s resources for integration testing.',
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'NewCloudWatchLogEventTest', {
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
  .awsApiCall('CloudWatchLogs', 'describeSubscriptionFilters', { logGroupName: 'includedGroup' })
  .expect(
    ExpectedResult.objectLike({
      subscriptionFilters: [{ filterName: 'includedGroup' }],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(10) });

integ.assertions
  .awsApiCall('CloudWatchLogs', 'describeSubscriptionFilters', { logGroupName: 'demoGroup' })
  .expect(
    ExpectedResult.objectLike({
      subscriptionFilters: [],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(10) });

integ.assertions
  .awsApiCall('CloudWatchLogs', 'describeSubscriptionFilters', { logGroupName: 'testerGroup' })
  .expect(
    ExpectedResult.objectLike({
      subscriptionFilters: [],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(10) });
