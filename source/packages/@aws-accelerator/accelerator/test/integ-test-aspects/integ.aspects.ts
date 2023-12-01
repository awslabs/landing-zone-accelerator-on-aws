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
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/accelerator/test/integ-test-aspects --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import * as cdk from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { AcceleratorAspects } from '../../lib/accelerator-aspects';
import { version } from '../../../../../package.json';
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

export class AspectIntegTestStack extends cdk.Stack {
  public function128Name: string;
  public function512Name: string;
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const function128 = new cdk.aws_lambda.Function(this, 'Function128', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: cdk.aws_lambda.Code.fromInline('exports.handler = function(event, ctx, cb) { return cb(null, "hi"); }'),
      memorySize: 128,
    });

    const function512 = new cdk.aws_lambda.Function(this, 'Function512', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: cdk.aws_lambda.Code.fromInline('exports.handler = function(event, ctx, cb) { return cb(null, "hi"); }'),
      memorySize: 512,
    });

    cdk.Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    new AcceleratorAspects(app, 'aws', false);
    this.function128Name = function128.functionName;
    this.function512Name = function512.functionName;
  }
}

// Stack under test
const stackUnderTest = new AspectIntegTestStack(app, 'AspectIntegTestStack', {
  description: 'This stack includes the applications resources for integration testing.',
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'AspectIntegTest', {
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

// test that the aspect increases default memory from 128 to 256
integ.assertions
  .awsApiCall('Lambda', 'getFunction', { FunctionName: stackUnderTest.function128Name })
  .expect(
    ExpectedResult.objectLike({
      Configuration: { MemorySize: 256 },
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(5) });

// test that the aspect ignores functions with memorySize defined > 256 & AWS Solutions env variable is populated
integ.assertions
  .awsApiCall('Lambda', 'getFunction', { FunctionName: stackUnderTest.function512Name })
  .expect(
    ExpectedResult.objectLike({
      Configuration: {
        MemorySize: 512,
        Environment: {
          Variables: {
            SOLUTION_ID: `AwsSolution/SO0199/${version}`,
          },
        },
      },
    }),
  )
  .waitForAssertions({ totalTimeout: cdk.Duration.minutes(5) });
