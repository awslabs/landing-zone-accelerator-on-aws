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
import { parseAccountsConfig } from '../lib/common';
import { randomValidTagArray } from './tag-generators';

function buildMinimalAccountsConfig(tags?: Array<{ key: string; value: string }>) {
  const workloadAccount: Record<string, unknown> = {
    name: 'TestWorkload',
    email: 'workload@example.com',
    organizationalUnit: 'Workloads',
  };
  if (tags !== undefined) {
    workloadAccount['tags'] = tags;
  }
  return {
    mandatoryAccounts: [
      { name: 'Management', email: 'mgmt@example.com', organizationalUnit: 'Root' },
      { name: 'LogArchive', email: 'log@example.com', organizationalUnit: 'Security' },
      { name: 'Audit', email: 'audit@example.com', organizationalUnit: 'Security' },
    ],
    workloadAccounts: [workloadAccount],
  };
}

// Feature: lza-account-tags, Property 1: Valid account configs with tags parse successfully
describe('Property 1: Valid account configs with tags parse successfully', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   */
  it('should parse valid account configs with random tags across 100 iterations', () => {
    for (let i = 0; i < 100; i++) {
      const tags = randomValidTagArray();
      const config = buildMinimalAccountsConfig(tags);
      const parsed = parseAccountsConfig(config);

      const workload = (parsed.workloadAccounts as Array<{ tags?: Array<{ key: string; value: string }> }>)[0];
      if (tags.length === 0) {
        // Schema parses empty array as-is
        expect(workload.tags ?? []).toEqual([]);
      } else {
        expect(workload.tags).toEqual(tags);
      }
    }
  });

  it('should parse config without tags (omitted field)', () => {
    const config = buildMinimalAccountsConfig();
    const parsed = parseAccountsConfig(config);
    const workload = (parsed.workloadAccounts as Array<{ tags?: unknown }>)[0];
    expect(workload.tags).toBeUndefined();
  });
});

// Feature: lza-account-tags, Property 2: Config tag round-trip consistency
describe('Property 2: Config tag round-trip consistency', () => {
  /**
   * **Validates: Requirements 1.5**
   */
  it('should preserve tags through parse → clone → re-parse across 100 iterations', () => {
    for (let i = 0; i < 100; i++) {
      const tags = randomValidTagArray();
      const config = buildMinimalAccountsConfig(tags);

      const parsed1 = parseAccountsConfig(config);
      // Simulate round-trip: serialize to plain object and re-parse
      const serialized = JSON.parse(JSON.stringify(parsed1));
      const parsed2 = parseAccountsConfig(serialized);

      const workload1 = (parsed1.workloadAccounts as Array<{ tags?: Array<{ key: string; value: string }> }>)[0];
      const workload2 = (parsed2.workloadAccounts as Array<{ tags?: Array<{ key: string; value: string }> }>)[0];

      expect(workload2.tags ?? []).toEqual(workload1.tags ?? []);
    }
  });
});
