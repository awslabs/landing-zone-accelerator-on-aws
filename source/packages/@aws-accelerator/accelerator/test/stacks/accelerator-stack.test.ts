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
/* eslint @typescript-eslint/no-explicit-any: 0 */

import { describe, beforeEach, afterEach, it, jest } from '@jest/globals';
import { AcceleratorStack, AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DeploymentTargets } from '@aws-accelerator/config';

class TestStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
  }
}

let app: cdk.App;
let testStack: TestStack;

beforeEach(() => {
  app = new cdk.App();
  const props = createAcceleratorStackProps();
  testStack = new TestStack(app, 'unit-test-accelerator-stack', props);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('isIncluded', () => {
  it('excluded region returns false', () => {
    const deploymentTargets = {
      excludedRegions: ['us-east-1'],
    } as DeploymentTargets;
    expect(testStack.isIncluded(deploymentTargets)).toBeFalsy();
  });

  it('excluded account returns false', () => {
    const deploymentTargets = {
      excludedAccounts: ['00000001'],
    } as DeploymentTargets;
    expect(testStack.isIncluded(deploymentTargets)).toBeFalsy();
  });

  it('included account returns true', () => {
    const deploymentTargets = {} as DeploymentTargets;
    jest.spyOn(AcceleratorStack.prototype as any, 'isAccountIncluded').mockImplementationOnce(() => true);
    expect(testStack.isIncluded(deploymentTargets)).toBeTruthy();
  });

  it('included OU returns true', () => {
    const deploymentTargets = {} as DeploymentTargets;
    jest.spyOn(AcceleratorStack.prototype as any, 'isOrganizationalUnitIncluded').mockImplementationOnce(() => true);
    expect(testStack.isIncluded(deploymentTargets)).toBeTruthy();
  });

  it('implicit deny', () => {
    const deploymentTargets = {} as DeploymentTargets;
    expect(testStack.isIncluded(deploymentTargets)).toBeFalsy();
  });
});
