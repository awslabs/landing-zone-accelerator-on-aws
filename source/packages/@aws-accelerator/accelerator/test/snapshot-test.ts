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
import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { expect, test } from '@jest/globals';

export function snapShotTest(testNamePrefix: string, stackProvider: () => cdk.Stack | undefined) {
  test(`${testNamePrefix} Snapshot Test`, () => {
    const stack = stackProvider();

    expect(stack).toBeDefined();
    if (!stack) return;

    configureSnapshotSeriliazers();

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });
}

const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const isUuid = (val: unknown) => typeof val === 'string' && val.match(uuidRegex) != null;

const zipRegex = /[0-9a-f]{64}\.zip/;

const isZip = (val: unknown) => typeof val === 'string' && val.match(zipRegex) != null;

// greedy implementation: eg, because "/path/home/temp.json" matches on
// temp.json, replace the whole string to "replaced-json-path.json".
const greedyJsonRegex = /[a-z0-9]+.json/;

const isGreedyJson = (val: unknown) => typeof val === 'string' && val.match(greedyJsonRegex) != null;

// limited: only match length of generated zip file or UUID spec lengths.
const md5Regex = /^[0-9a-f]{32}$/; // limited: only match length of md5 hash.

const isMd5 = (val: unknown) => typeof val === 'string' && val.match(md5Regex) != null && !val.startsWith('REPLACED');

function configureSnapshotSeriliazers() {
  // test each serialized object - if any part of string matches regex
  // replace with value of print()
  expect.addSnapshotSerializer({
    test: isUuid,
    print: () => '"REPLACED-UUID"',
  });

  expect.addSnapshotSerializer({
    test: isZip,
    print: () => '"REPLACED-GENERATED-NAME.zip"',
  });

  expect.addSnapshotSerializer({
    test: isGreedyJson,
    print: () => '"REPLACED-JSON-PATH.json"',
  });

  expect.addSnapshotSerializer({
    test: isMd5,
    print: () => '"REPLACED-MD5"',
  });
}
