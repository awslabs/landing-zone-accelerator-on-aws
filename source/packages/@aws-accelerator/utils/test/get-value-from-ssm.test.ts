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
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand, SSMServiceException } from '@aws-sdk/client-ssm';
import { getSSMParameterValue, SSMOperationError } from '../lib/get-value-from-ssm';
import { expect, it, beforeEach, afterEach, describe } from 'vitest';

let ssmMock: AwsClientStub<SSMClient>;

beforeEach(() => {
  ssmMock = mockClient(SSMClient);
});

afterEach(() => {
  ssmMock.reset();
});

describe('getSSMParameterValue', () => {
  it('should successfully retrieve parameter value', async () => {
    // Given
    const parameterName = '/test/parameter';
    const expectedValue = 'test-value';
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: expectedValue,
      },
    });

    // When
    const result = await getSSMParameterValue(parameterName);

    // Then
    expect(result).toBe(expectedValue);
  });

  it('should handle parameter with no value', async () => {
    // Given
    const parameterName = '/test/parameter';
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: undefined,
      },
    });

    // When/Then
    await expect(getSSMParameterValue(parameterName)).rejects.toThrow(SSMOperationError);
    await expect(getSSMParameterValue(parameterName)).rejects.toThrow(
      `Parameter exists but has no value: "${parameterName}"`,
    );
  });

  it('should handle SSM service exceptions', async () => {
    // Given
    const parameterName = '/test/parameter';
    ssmMock.on(GetParameterCommand).rejects(
      new SSMServiceException({
        name: 'ParameterNotFound',
        $metadata: {},
        message: 'Parameter not found.',
        $fault: 'client',
      }),
    );

    // When/Then
    await expect(getSSMParameterValue(parameterName)).rejects.toThrow(SSMOperationError);
    await expect(getSSMParameterValue(parameterName)).rejects.toThrow(
      `SSM service error for parameter "${parameterName}": ParameterNotFound - Parameter not found.`,
    );
  });

  it('should handle unknown errors', async () => {
    // Given
    const parameterName = '/test/parameter';
    ssmMock.on(GetParameterCommand).rejects(new Error('Unknown error'));

    // When/Then
    await expect(getSSMParameterValue(parameterName)).rejects.toThrow(SSMOperationError);
    await expect(getSSMParameterValue(parameterName)).rejects.toThrow(
      `Unknown error retrieving parameter "${parameterName}" from SSM: Unknown error`,
    );
  });

  it('should use provided credentials when available', async () => {
    // Given
    const parameterName = '/test/parameter';
    const expectedValue = 'test-value';
    const credentials = {
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      sessionToken: 'test-token',
    };

    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: expectedValue,
      },
    });

    // When
    const result = await getSSMParameterValue(parameterName, credentials);

    // Then
    expect(result).toBe(expectedValue);
  });
});
