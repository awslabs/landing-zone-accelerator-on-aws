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

import { describe, expect, test, jest } from '@jest/globals';
import { CustomResourceProviderRuntime } from 'aws-cdk-lib';
import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { DEFAULT_LAMBDA_RUNTIME, CUSTOM_RESOURCE_PROVIDER_RUNTIME } from '../lib/lambda';

describe('Lambda Runtime and Custom Resource Provider Runtime', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('DEFAULT_LAMBDA_RUNTIME is created correctly', () => {
    expect(DEFAULT_LAMBDA_RUNTIME).toBeInstanceOf(Runtime);
    expect(DEFAULT_LAMBDA_RUNTIME.name).toBe('nodejs20.x');
    expect(DEFAULT_LAMBDA_RUNTIME.family).toBe(RuntimeFamily.NODEJS);
  });

  test('CUSTOM_RESOURCE_PROVIDER_RUNTIME is set correctly for supported version', () => {
    expect(CUSTOM_RESOURCE_PROVIDER_RUNTIME).toBe(CustomResourceProviderRuntime.NODEJS_20_X);
  });
});
