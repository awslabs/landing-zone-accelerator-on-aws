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

import { afterEach, describe, expect, test, vi } from 'vitest';
import { isAcceleratorTaggingEnabled, resolveAcceleratorTags } from '../lib/accelerator-tagging';

describe('function isAcceleratorTaggingEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('is enabled for commercial partitions', () => {
    expect(isAcceleratorTaggingEnabled('aws')).toBe(true);
    expect(isAcceleratorTaggingEnabled('aws-us-gov')).toBe(true);
    expect(isAcceleratorTaggingEnabled('aws-cn')).toBe(true);
  });

  test('is disabled for aws-iso and aws-iso-b by default', () => {
    expect(isAcceleratorTaggingEnabled('aws-iso')).toBe(false);
    expect(isAcceleratorTaggingEnabled('aws-iso-b')).toBe(false);
  });

  test('is enabled for aws-iso partitions when ACCELERATOR_ENABLE_TAG is true', () => {
    vi.stubEnv('ACCELERATOR_ENABLE_TAG', 'true');
    expect(isAcceleratorTaggingEnabled('aws-iso')).toBe(true);
    expect(isAcceleratorTaggingEnabled('aws-iso-b')).toBe(true);
  });

  test('does not override the partition gate when ACCELERATOR_ENABLE_TAG is not "true"', () => {
    vi.stubEnv('ACCELERATOR_ENABLE_TAG', 'false');
    expect(isAcceleratorTaggingEnabled('aws-iso')).toBe(false);
  });
});

describe('function resolveAcceleratorTags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('adds the generated Accelerator tag using the supplied prefix', () => {
    const tags = resolveAcceleratorTags({ partition: 'aws', acceleratorPrefix: 'AWSAccelerator' });
    expect(tags.get('Accelerator')).toEqual('AWSAccelerator');
  });

  test('retains resource tags that do not collide with global tags', () => {
    const tags = resolveAcceleratorTags({
      resourceTags: [{ key: 'env', value: 'prod' }],
      globalTags: [{ key: 'owner', value: 'network' }],
      partition: 'aws',
      acceleratorPrefix: 'AWSAccelerator',
    });
    expect(tags.get('env')).toEqual('prod');
    expect(tags.get('owner')).toEqual('network');
  });

  test('global tags override resource tags on key collision', () => {
    const tags = resolveAcceleratorTags({
      resourceTags: [{ key: 'env', value: 'dev' }],
      globalTags: [{ key: 'env', value: 'prod' }],
      partition: 'aws',
      acceleratorPrefix: 'AWSAccelerator',
    });
    expect(tags.get('env')).toEqual('prod');
  });

  test('global tags override the generated Accelerator tag', () => {
    const tags = resolveAcceleratorTags({
      globalTags: [{ key: 'Accelerator', value: 'Custom' }],
      partition: 'aws',
      acceleratorPrefix: 'AWSAccelerator',
    });
    expect(tags.get('Accelerator')).toEqual('Custom');
  });

  test('later resource tags win over earlier ones for the same key', () => {
    const tags = resolveAcceleratorTags({
      resourceTags: [
        { key: 'env', value: 'dev' },
        { key: 'env', value: 'staging' },
      ],
      partition: 'aws',
      acceleratorPrefix: 'AWSAccelerator',
    });
    expect(tags.get('env')).toEqual('staging');
  });

  test('omits Accelerator and global tags where tagging is gated off', () => {
    const tags = resolveAcceleratorTags({
      resourceTags: [{ key: 'env', value: 'dev' }],
      globalTags: [{ key: 'env', value: 'prod' }],
      partition: 'aws-iso',
      acceleratorPrefix: 'AWSAccelerator',
    });
    expect(tags.has('Accelerator')).toBe(false);
    expect(tags.get('env')).toEqual('dev');
  });

  test('returns an empty map when nothing is tagged and tagging is gated off', () => {
    const tags = resolveAcceleratorTags({ partition: 'aws-iso-b', acceleratorPrefix: 'AWSAccelerator' });
    expect(tags.size).toEqual(0);
  });
});
