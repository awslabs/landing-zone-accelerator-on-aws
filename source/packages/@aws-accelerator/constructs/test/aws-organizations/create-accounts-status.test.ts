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
import { buildAccountOrgInfo } from '../../lib/aws-organizations/create-accounts-status';

describe('create-accounts-status account cache serialization', () => {
  it('writes State to the compatible status key and falls back to Status', () => {
    expect(
      buildAccountOrgInfo('account@example.com', '111111111111', {
        State: 'ACTIVE',
        Status: 'SUSPENDED',
      }),
    ).toEqual({
      email: 'account@example.com',
      accountId: '111111111111',
      status: 'ACTIVE',
      orgsApiResponse: {
        State: 'ACTIVE',
        Status: 'SUSPENDED',
      },
    });
    expect(
      buildAccountOrgInfo('legacy@example.com', '222222222222', {
        Status: 'ACTIVE',
      }).status,
    ).toBe('ACTIVE');
  });
});
