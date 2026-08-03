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

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';

import { isGlobalType } from '../lib/common';
import { IAcceleratorMetadataConfig } from '../lib/models/global-config';
import * as globalSchema from '../lib/schemas/global-config.json';

/**
 * Validate an `IAcceleratorMetadataConfig` input through the global-config
 * schema. This mirrors the schema validation performed by `parseGlobalConfig`
 * (AJV) when a `global-config.yaml` is loaded.
 */
function isValidAcceleratorMetadataConfig(input: unknown): boolean {
  return isGlobalType<IAcceleratorMetadataConfig>('IAcceleratorMetadataConfig', input);
}

describe('AcceleratorMetadataConfig', () => {
  // Issue #4577: readOnlyAccessRoleArns is documented as optional, so a config
  // that provides an array must continue to validate.
  it('accepts readOnlyAccessRoleArns when provided as an array', () => {
    const input: IAcceleratorMetadataConfig = {
      enable: true,
      account: 'Logging',
      readOnlyAccessRoleArns: ['arn:aws:iam::111111111111:role/test-access-role'],
    };

    expect(isValidAcceleratorMetadataConfig(input)).toBe(true);
  });

  // Issue #4577: removing the property entirely (the key is absent) must not
  // fail validation. Before the fix the schema marked the property required,
  // producing "must have required property 'readOnlyAccessRoleArns'".
  it('accepts acceleratorMetadata when readOnlyAccessRoleArns is omitted', () => {
    const input = {
      enable: true,
      account: 'Logging',
    };

    expect(isValidAcceleratorMetadataConfig(input)).toBe(true);
  });

  it('accepts acceleratorMetadata when readOnlyAccessRoleArns is an empty array', () => {
    const input: IAcceleratorMetadataConfig = {
      enable: true,
      account: 'Logging',
      readOnlyAccessRoleArns: [],
    };

    expect(isValidAcceleratorMetadataConfig(input)).toBe(true);
  });

  // A key left in YAML without a value is parsed as null. The contract is an
  // optional array, so callers must either omit the key or provide an array.
  it('rejects acceleratorMetadata when readOnlyAccessRoleArns is null', () => {
    const input = {
      enable: true,
      account: 'Logging',
      readOnlyAccessRoleArns: null,
    };

    expect(isValidAcceleratorMetadataConfig(input)).toBe(false);
  });

  // The required properties must still be enforced.
  it('rejects acceleratorMetadata when the required account property is missing', () => {
    const input = {
      enable: true,
    };

    expect(isValidAcceleratorMetadataConfig(input)).toBe(false);
  });

  // When readOnlyAccessRoleArns is present it must be an array. Driven directly
  // via AJV so we can inspect the rendered validation error path.
  it('rejects readOnlyAccessRoleArns when it is not an array', () => {
    const input = {
      enable: true,
      account: 'Logging',
      readOnlyAccessRoleArns: 5,
    };

    expect(isValidAcceleratorMetadataConfig(input)).toBe(false);

    const ajv = new Ajv({ allErrors: true, verbose: true });
    const schemaWithRef = {
      ...(globalSchema as object),
      $ref: '#/definitions/IAcceleratorMetadataConfig',
    };
    const valid = ajv.validate(schemaWithRef, input);

    expect(valid).toBe(false);
    expect(ajv.errors).not.toBeNull();
    const roleArnErrors = (ajv.errors ?? []).filter(e => e.instancePath === '/readOnlyAccessRoleArns');
    expect(roleArnErrors.length).toBeGreaterThan(0);
    expect(roleArnErrors.some(error => error.message === 'must be array')).toBe(true);
  });
});
