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
 * yarn integ-runner --update-on-failed --parallel-regions us-east-1 --directory ./packages/@aws-accelerator/constructs/test/aws-organizations/integ-test-enable-policy-type --language typescript --force
 * - in the target account it will create a stack, run assertion and delete the stack
 */

import { ExpectedResult, IntegTest } from '@aws-cdk/integ-tests-alpha';
import { App, Aspects, CfnResource, IAspect, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { EnablePolicyType, PolicyTypeEnum } from '../../../lib/aws-organizations/enable-policy-type';
import { AcceleratorAspects } from '../../../../accelerator/lib/accelerator-aspects';

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

// CDK App for Integration Tests
const app = new App();
new AcceleratorAspects(app, 'aws', false);

export class EnablePolicyTypeStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    new EnablePolicyType(this, 'EnableScp', {
      policyType: PolicyTypeEnum.SERVICE_CONTROL_POLICY,
      logRetentionInDays: 3653,
    });

    new EnablePolicyType(this, 'EnableTag', {
      policyType: PolicyTypeEnum.TAG_POLICY,
      logRetentionInDays: 3653,
    });

    new EnablePolicyType(this, 'EnableBackup', {
      policyType: PolicyTypeEnum.BACKUP_POLICY,
      logRetentionInDays: 3653,
    });

    new EnablePolicyType(this, 'EnableAi', {
      policyType: PolicyTypeEnum.AISERVICES_OPT_OUT_POLICY,
      logRetentionInDays: 3653,
    });

    Aspects.of(this).add(new ApplyDestroyPolicyAspect());
  }
}

// Stack under test
const stackUnderTest = new EnablePolicyTypeStack(app, 'EnablePolicyTypeTestStack', {
  description: 'Stack for enable Organizations policy type integration tests',
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'EnablePolicyTypeTest', {
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

integ.assertions.awsApiCall('Organizations', 'listRoots', {}).expect(
  ExpectedResult.objectLike({
    Roots: [
      {
        Name: 'Root',
        PolicyTypes: [
          { Type: 'AISERVICES_OPT_OUT_POLICY', Status: 'ENABLED' },
          { Type: 'BACKUP_POLICY', Status: 'ENABLED' },
          { Type: 'TAG_POLICY', Status: 'ENABLED' },
          { Type: 'SERVICE_CONTROL_POLICY', Status: 'ENABLED' },
        ],
      },
    ],
  }),
);
