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

import { AcceleratorStage } from '../lib/accelerator-stage';
import { describe, expect, test } from 'vitest';
import { snapShotTest } from './snapshot-test';
import { Create, memoize } from './accelerator-test-helpers';
import { SecurityResourcesStack } from '../lib/stacks/security-resources-stack';

const testNamePrefix = 'Construct(SecurityResourcesStack): ';

describe('SecurityResourcesStack', () => {
  snapShotTest(testNamePrefix, Create.stackProvider(`Management-us-east-1`, AcceleratorStage.SECURITY_RESOURCES));
});

describe('delegatedAdminStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`Management-us-east-1`, [
      AcceleratorStage.SECURITY_RESOURCES,
      'aws',
      'us-east-1',
      'all-enabled-delegated-admin',
    ]),
  );
});

describe('SecurityResourcesStack.getRemediationParameters', () => {
  // Cast through unknown to reach the private method without re-exporting it.
  type GetRemediationParameters = (
    ruleName: string,
    params?: unknown,
    assumeRoleArn?: string[],
    configFunctionName?: string,
  ) => Record<string, { StaticValue?: { Values: string[] }; ResourceValue?: { Value: string } }> | undefined;

  // Memoized: one SECURITY_RESOURCES stage synth shared by all tests in this describe.
  // Safe because these tests only call a read-only private method on the stack.
  const getStack = memoize(
    () => Create.stack('Management-us-east-1', AcceleratorStage.SECURITY_RESOURCES) as SecurityResourcesStack,
  );

  const callPrivate = (
    stack: SecurityResourcesStack,
    params: unknown,
    assumeRoleArn?: string[],
  ): ReturnType<GetRemediationParameters> => {
    const fn = (stack as unknown as { getRemediationParameters: GetRemediationParameters }).getRemediationParameters;
    return fn.call(stack, 'test-rule', params as never, assumeRoleArn);
  };

  test('returns undefined when neither params nor assumeRoleArn provided', () => {
    expect(callPrivate(getStack(), undefined, undefined)).toBeUndefined();
  });

  test('injects AutomationAssumeRole with empty Values when assumeRoleArn is an empty array', () => {
    const result = callPrivate(getStack(), undefined, []);
    expect(result).toEqual({
      AutomationAssumeRole: {
        StaticValue: { Values: [] },
      },
    });
  });

  test('injects AutomationAssumeRole when params is omitted', () => {
    const result = callPrivate(getStack(), undefined, ['arn:aws:iam::111122223333:role/RemediationRole']);
    expect(result).toEqual({
      AutomationAssumeRole: {
        StaticValue: { Values: ['arn:aws:iam::111122223333:role/RemediationRole'] },
      },
    });
  });

  test('matches the `parameters: []` workaround behavior', () => {
    const stack = getStack();
    const omitted = callPrivate(stack, undefined, ['arn:aws:iam::111122223333:role/RemediationRole']);
    const empty = callPrivate(stack, [], ['arn:aws:iam::111122223333:role/RemediationRole']);
    expect(omitted).toEqual(empty);
  });

  test('does not inject AutomationAssumeRole when assumeRoleArn is not provided', () => {
    const result = callPrivate(getStack(), [{ name: 'BucketName', value: 'RESOURCE_ID', type: 'String' }], undefined);
    expect(result).toBeDefined();
    expect(result!).not.toHaveProperty('AutomationAssumeRole');
    expect(result!['BucketName']).toEqual({ ResourceValue: { Value: 'RESOURCE_ID' } });
  });

  test('preserves commas in String parameter values', () => {
    const result = callPrivate(getStack(), [
      {
        name: 'Configuration',
        value: 'powerMgmt=disabled-1800,patchMgmt=testing',
        type: 'String',
      },
    ]);
    expect(result!['Configuration']).toEqual({
      StaticValue: { Values: ['powerMgmt=disabled-1800,patchMgmt=testing'] },
    });
  });

  test('splits StringList parameter values on commas', () => {
    const result = callPrivate(getStack(), [
      {
        name: 'Policies',
        value: 'PolicyA,PolicyB',
        type: 'StringList',
      },
    ]);
    expect(result!['Policies']).toEqual({
      StaticValue: { Values: ['PolicyA', 'PolicyB'] },
    });
  });

  test('preserves existing parameters and adds AutomationAssumeRole when both are provided', () => {
    const result = callPrivate(
      getStack(),
      [{ name: 'BucketName', value: 'RESOURCE_ID', type: 'String' }],
      ['arn:aws:iam::111122223333:role/RemediationRole'],
    );
    expect(result).toEqual({
      AutomationAssumeRole: {
        StaticValue: { Values: ['arn:aws:iam::111122223333:role/RemediationRole'] },
      },
      BucketName: { ResourceValue: { Value: 'RESOURCE_ID' } },
    });
  });
});
