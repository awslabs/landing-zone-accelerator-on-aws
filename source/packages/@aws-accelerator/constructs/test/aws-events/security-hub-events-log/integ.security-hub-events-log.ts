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
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/constructs/test/aws-events/security-hub-events-log --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import * as cdk from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { ExpectedResult, IntegTest, Match } from '@aws-cdk/integ-tests-alpha';
import { AcceleratorAspects } from '../../../../accelerator/lib/accelerator-aspects';
import { SecurityHubEventsLog } from '@aws-accelerator/constructs';
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

export interface SecurityHubEventsLogDemoStackProps extends cdk.StackProps {
  readonly existingLogGroup: boolean;
}

export class SecurityHubEventsLogDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SecurityHubEventsLogDemoStackProps) {
    super(scope, id, props);
    const testingPrefix = 'integTest';
    const lambdaKey = this.createLambdaKey();
    const snsKey = this.createSnsKey();
    const snsTopic = this.createSnsTopic(snsKey);

    if (props.existingLogGroup) {
      const existingLogGroupName = `/${testingPrefix}-SecurityHub`;
      new cdk.aws_logs.LogGroup(this, 'ExistingLogGroup', {
        logGroupName: existingLogGroupName,
      });
    }

    new SecurityHubEventsLog(this, 'SecurityHubEventsLog', {
      acceleratorPrefix: testingPrefix,
      snsTopicArn: snsTopic.topicArn,
      snsKmsKey: snsKey,
      notificationLevel: 'CRITICAL',
      lambdaKey: lambdaKey,
      cloudWatchLogRetentionInDays: 365,
      logLevel: 'MEDIUM',
    });

    cdk.Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    new AcceleratorAspects(app, 'aws', false);
  }

  /**
   * Create KMS key for Lambda
   * @returns Key
   */
  private createLambdaKey(): cdk.aws_kms.Key {
    const lambdaKey = new cdk.aws_kms.Key(this, 'LambdaKey', { removalPolicy: cdk.RemovalPolicy.DESTROY });
    // Allow Lambda to use the encryption key
    lambdaKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow Lambda to use the encryption key`,
        principals: [new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com')],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
      }),
    );

    return lambdaKey;
  }

  /**
   * Create KMS key for SNS
   * @returns Key
   */
  private createSnsKey(): cdk.aws_kms.Key {
    const snsKey = new cdk.aws_kms.Key(this, 'SnsKey', { removalPolicy: cdk.RemovalPolicy.DESTROY });
    // Allow SNS to use the encryption key
    snsKey.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow SNS to use the encryption key`,
        principals: [new cdk.aws_iam.ServicePrincipal('sns.amazonaws.com')],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
      }),
    );

    return snsKey;
  }

  private createSnsTopic(snsKey: cdk.aws_kms.Key): cdk.aws_sns.Topic {
    const topic = new cdk.aws_sns.Topic(this, `SnsTopic`, {
      displayName: `integTest-topic-${cdk.Stack.of(this).region}}`,
      topicName: `integTest-topic-${cdk.Stack.of(this).region}`,
      masterKey: snsKey,
    });

    topic.grantPublish({
      grantPrincipal: new cdk.aws_iam.ServicePrincipal('events.amazonaws.com'),
    });

    return topic;
  }
}

// Stack under test
const stackUnderTest = new SecurityHubEventsLogDemoStack(app, 'SecurityHubEventsLogTestStack', {
  description: 'This stack includes the application resources for integration testing.',
  existingLogGroup: false,
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'NewSecurityHubEventsLogTest', {
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

const testLogGroupName = '/integTest-SecurityHub';

integ.assertions
  .awsApiCall('CloudWatchLogs', 'describeLogGroups', { logGroupNamePrefix: testLogGroupName })
  .expect(
    ExpectedResult.objectLike({
      logGroups: [{ logGroupName: testLogGroupName }],
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(2) });

integ.assertions
  .awsApiCall('CloudWatchLogs', 'describeResourcePolicies', {})
  .expect(
    ExpectedResult.objectLike({
      resourcePolicies: Match.arrayWith([
        Match.objectLike({
          policyName: 'TrustEventsToStoreLogEvent',
        }),
      ]),
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(2) });
