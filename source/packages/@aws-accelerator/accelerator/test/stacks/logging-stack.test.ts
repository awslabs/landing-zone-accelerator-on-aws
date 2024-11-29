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

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { LoggingStack } from '../../lib/stacks/logging-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

let app: cdk.App;
let loggingStack: LoggingStack;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(LoggingStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  jest.spyOn(LoggingStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');

  app = new cdk.App();
  const props = createAcceleratorStackProps();
  loggingStack = new LoggingStack(app, 'unit-test-logging-stack', props);
});

describe('normalizeExtension', () => {
  test('should return undefined when input is undefined', () => {
    const result = loggingStack['normalizeExtension'](undefined);
    expect(result).toBeUndefined();
  });

  test('should add dot prefix when extension does not start with dot', () => {
    const result = loggingStack['normalizeExtension']('txt');
    expect(result).toBe('.txt');
  });

  test('should not modify extension that already starts with dot', () => {
    const result = loggingStack['normalizeExtension']('.pdf');
    expect(result).toBe('.pdf');
  });
});
