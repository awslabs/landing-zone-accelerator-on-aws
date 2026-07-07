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

const ALPHA_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.';

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomString(minLen: number, maxLen: number, chars = ALPHA_CHARS): string {
  const len = randomInt(minLen, maxLen);
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[randomInt(0, chars.length - 1)];
  }
  return result;
}

export function randomValidTagKey(): string {
  let key = randomString(1, 128);
  while (key.startsWith('aws:')) {
    key = randomString(1, 128);
  }
  return key;
}

export function randomValidTagValue(): string {
  return randomString(0, 256);
}

export function randomValidTagArray(maxCount = 50): Array<{ key: string; value: string }> {
  const count = randomInt(0, maxCount);
  const usedKeys = new Set<string>();
  const tags: Array<{ key: string; value: string }> = [];
  for (let i = 0; i < count; i++) {
    let key = randomValidTagKey();
    while (usedKeys.has(key)) {
      key = randomValidTagKey();
    }
    usedKeys.add(key);
    tags.push({ key, value: randomValidTagValue() });
  }
  return tags;
}
