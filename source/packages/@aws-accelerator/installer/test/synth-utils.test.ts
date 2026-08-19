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
import { describe, expect, it, vi } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { toCloudFormation } from './synth-utils';

/**
 * Canary for the CloudFormation Validate suppression in synth-utils.ts.
 *
 * toCloudFormation relies on aws-cdk-lib skipping its built-in WASM validator whenever a
 * user-registered CloudFormationValidatePlugin instance is present on the App. Because our
 * no-op plugin overrides validate(), a spy on the base class prototype only fires when the
 * framework's own validator runs. If an aws-cdk-lib upgrade changes the skip behavior, the
 * suppression case below fails instead of the validator silently running again.
 */
describe('synth-utils CloudFormation Validate suppression', () => {
  it('does not run the built-in validator when synthesizing through toCloudFormation', () => {
    const validateSpy = vi.spyOn(cdk.CloudFormationValidatePlugin.prototype, 'validate');
    try {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'SuppressedStack');
      new cdk.CfnResource(stack, 'Topic', { type: 'AWS::SNS::Topic' });

      const template = toCloudFormation(stack);

      expect(template.Resources?.Topic).toBeDefined();
      expect(validateSpy).not.toHaveBeenCalled();
    } finally {
      validateSpy.mockRestore();
    }
  });

  it('control: the built-in validator runs when nothing is registered, proving the spy detects it', () => {
    const validateSpy = vi
      .spyOn(cdk.CloudFormationValidatePlugin.prototype, 'validate')
      .mockReturnValue({ success: true, violations: [] });
    try {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'UnsuppressedStack');
      new cdk.CfnResource(stack, 'Topic', { type: 'AWS::SNS::Topic' });

      app.synth();

      expect(validateSpy).toHaveBeenCalled();
    } finally {
      validateSpy.mockRestore();
    }
  });
});
