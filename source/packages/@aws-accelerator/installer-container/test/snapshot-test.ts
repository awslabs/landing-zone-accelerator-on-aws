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

/**
 * Snapshot Testing Utility for CDK Stacks
 *
 * This module provides utilities for snapshot testing CDK stacks. Snapshot tests
 * capture the synthesized CloudFormation template and compare it against a saved
 * snapshot to detect unintended changes.
 *
 * Benefits of Snapshot Testing:
 * - Catches unintended changes to CloudFormation templates
 * - Provides a clear diff when infrastructure changes
 * - Acts as documentation of the expected infrastructure state
 * - Fast to write and maintain compared to assertion-based tests
 *
 * Usage:
 * ```typescript
 * import { snapShotTest } from './snapshot-test';
 *
 * describe('MyStack', () => {
 *   snapShotTest('MyStack with default config', () => {
 *     const app = new cdk.App();
 *     return new MyStack(app, 'TestStack', { ... });
 *   });
 * });
 * ```
 *
 * Updating Snapshots:
 * When you intentionally change infrastructure, update snapshots with:
 * `yarn test:unit -u` or `vitest run -u`
 *
 * Snapshot Location:
 * Snapshots are stored in test/__snapshots__/ directory
 */

import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { expect, test } from 'vitest';

/**
 * Creates a snapshot test for a CDK stack
 *
 * This function synthesizes a CDK stack to CloudFormation and compares it against
 * a saved snapshot. Dynamic values (UUIDs, hashes, etc.) are normalized to ensure
 * consistent snapshots across test runs.
 *
 * @param testNamePrefix - Descriptive name for the test (e.g., "Construct(MyStack): ")
 * @param stackProvider - Function that creates and returns the stack to test
 *
 * @example
 * ```typescript
 * snapShotTest('Construct(MyStack): Default Config', () => {
 *   const app = new cdk.App();
 *   return new MyStack(app, 'TestStack', {
 *     prop1: 'value1',
 *     prop2: true,
 *   });
 * });
 * ```
 */
export function snapShotTest(testNamePrefix: string, stackProvider: () => cdk.Stack | undefined) {
  test(`${testNamePrefix} Snapshot Test`, () => {
    const stack = stackProvider();

    expect(stack).toBeDefined();
    if (!stack) return;

    // Configure serializers to normalize dynamic values before snapshot comparison
    configureSnapshotSerializers();

    // Synthesize the stack to CloudFormation and compare with snapshot
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  }, 120000); // 120s timeout for CDK synthesis
}

/**
 * Regular Expressions for Dynamic Value Detection
 *
 * These patterns identify values that change between test runs and need to be
 * normalized for consistent snapshots.
 */

// Matches UUIDs in format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const isUuid = (val: unknown) => typeof val === 'string' && val.match(uuidRegex) != null;

// Matches CDK-generated zip file names with 64-character hex hashes
const zipRegex = /[0-9a-f]{64}\.zip/;
const isZip = (val: unknown) => typeof val === 'string' && val.match(zipRegex) != null;

// Matches JSON file paths (greedy implementation)
// Note: This is greedy - if "/path/home/temp.json" matches, the entire string
// is replaced with "REPLACED-JSON-PATH.json"
const greedyJsonRegex = /[a-z0-9]+.json/;
const isGreedyJson = (val: unknown) => typeof val === 'string' && val.match(greedyJsonRegex) != null;

// Matches MD5 hashes (32-character hex strings)
// Limited to exact length to avoid false positives
const md5Regex = /^[0-9a-f]{32}$/;
const isMd5 = (val: unknown) => typeof val === 'string' && val.match(md5Regex) != null && !val.startsWith('REPLACED');

/**
 * Configures snapshot serializers to normalize dynamic values
 *
 * CDK generates dynamic values (UUIDs, hashes, file names) that change between
 * test runs. These serializers replace dynamic values with static placeholders
 * to ensure snapshots remain stable.
 *
 * Serializers are applied in order and test each value in the snapshot:
 * 1. UUIDs → "REPLACED-UUID"
 * 2. Zip files → "REPLACED-GENERATED-NAME.zip"
 * 3. JSON paths → "REPLACED-JSON-PATH.json"
 * 4. MD5 hashes → "REPLACED-MD5"
 *
 * Adding New Serializers:
 * If you encounter new dynamic values causing snapshot instability:
 * 1. Identify the pattern (regex)
 * 2. Create a test function (e.g., isMyValue)
 * 3. Add a serializer with expect.addSnapshotSerializer()
 */
function configureSnapshotSerializers() {
  // Replace UUIDs with static placeholder
  expect.addSnapshotSerializer({
    test: isUuid,
    print: () => '"REPLACED-UUID"',
  });

  // Replace CDK-generated zip file names with static placeholder
  expect.addSnapshotSerializer({
    test: isZip,
    print: () => '"REPLACED-GENERATED-NAME.zip"',
  });

  // Replace JSON file paths with static placeholder
  expect.addSnapshotSerializer({
    test: isGreedyJson,
    print: () => '"REPLACED-JSON-PATH.json"',
  });

  // Replace MD5 hashes with static placeholder
  expect.addSnapshotSerializer({
    test: isMd5,
    print: () => '"REPLACED-MD5"',
  });
}
