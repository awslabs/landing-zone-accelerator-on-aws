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

import { describe, expect, it } from 'vitest';
import { getAccountStateValidationError } from '../../lib/lambdas/validate-environment';

describe('validate-environment account lifecycle validation', () => {
  it('prefers State over Status', () => {
    expect(
      getAccountStateValidationError('Mandatory', 'account@example.com', {
        State: 'ACTIVE',
        Status: 'SUSPENDED',
      }),
    ).toBeUndefined();
  });

  it('falls back to Status when State is absent', () => {
    expect(
      getAccountStateValidationError('Workload', 'account@example.com', {
        Status: 'ACTIVE',
      }),
    ).toBeUndefined();
  });

  it('reports PENDING_ACTIVATION from State even when legacy Status is ACTIVE', () => {
    expect(
      getAccountStateValidationError('Mandatory', 'pending@example.com', {
        State: 'PENDING_ACTIVATION',
        Status: 'ACTIVE',
      }),
    ).toBe('Mandatory account pending@example.com is in PENDING_ACTIVATION');
  });

  it('reports non-ACTIVE and missing lifecycle states', () => {
    expect(
      getAccountStateValidationError('Workload', 'suspended@example.com', {
        State: 'SUSPENDED',
        Status: 'ACTIVE',
      }),
    ).toBe('Workload account suspended@example.com is in SUSPENDED');
    expect(getAccountStateValidationError('Mandatory', 'unknown@example.com', {})).toBe(
      'Mandatory account unknown@example.com is in undefined',
    );
  });
});
