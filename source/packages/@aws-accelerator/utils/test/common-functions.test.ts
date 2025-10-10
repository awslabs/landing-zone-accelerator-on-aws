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
import { describe, it, beforeEach, expect, afterAll } from '@jest/globals';
import {
  getNodeVersion,
  chunkArray,
  getStsEndpoint,
  wildcardMatch,
  getCrossAccountCredentials,
  getCurrentAccountId,
  getStsCredentials,
  getGlobalRegion,
  fileExists,
  directoryExists,
  getAllFilesInPattern,
  checkDiffFiles,
} from '../lib/common-functions';
import { config } from '../../../../package.json';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let stsMock: AwsClientStub<STSClient>;
beforeEach(() => {
  stsMock = mockClient(STSClient);
});
afterEach(() => {
  stsMock.reset();
});

describe('getCrossAccountCredentials', () => {
  it('should return credentials', async () => {
    stsMock.on(AssumeRoleCommand).resolves({});
    const response = await getCrossAccountCredentials('account', 'us-east-1', 'aws', 'role');
    expect(response).toBeDefined();
  });
});
describe('getCurrentAccountId', () => {
  it('should return current account Id', async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '111111111111',
    });
    const response = await getCurrentAccountId('aws', 'us-east-1');
    expect(response).toBeDefined();
  });
});

describe('getStsCredentials', () => {
  it('should return credentials', async () => {
    stsMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'AKIAI44QH8DHBEXAMPLE',
        SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        SessionToken: 'je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY',
        Expiration: new Date(Date.now() + 1800 * 1000), // expire in only 30 minutes
      },
    });
    const response = await getStsCredentials(new STSClient(), 'role');
    expect(response).toBeDefined();
  });
});

describe('getNodeVersion', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return the ACCELERATOR_NODE_VERSION when set and no input is provided', () => {
    process.env['ACCELERATOR_NODE_VERSION'] = '19';
    expect(getNodeVersion()).toBe(19);
  });

  it('should return the default version when no input or env var is provided', () => {
    expect(getNodeVersion()).toBe(config.node.version.default);
  });

  it('should throw an error for invalid ACCELERATOR_NODE_VERSION', () => {
    process.env['ACCELERATOR_NODE_VERSION'] = 'invalid';
    expect(() => getNodeVersion()).toThrow(
      `Invalid or unsupported Node.js version: NaN. Minimum supported version is ${config.node.version.minimum}.`,
    );
  });

  it('should throw an error for version below minimum', () => {
    process.env['ACCELERATOR_NODE_VERSION'] = '17';
    expect(() => getNodeVersion()).toThrow(
      `Invalid or unsupported Node.js version: 17. Minimum supported version is ${config.node.version.minimum}.`,
    );
  });

  it('should prioritize input over environment variable', () => {
    process.env['ACCELERATOR_NODE_VERSION'] = '19';
    expect(getNodeVersion()).toBe(19);
  });
});

describe('chunkArray', () => {
  it('should split array into chunks of specified size', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = chunkArray(input, 3);
    expect(result).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8],
    ]);
  });

  it('should handle empty array', () => {
    const input: number[] = [];
    const result = chunkArray(input, 2);
    expect(result).toEqual([]);
  });

  it('should handle chunk size equal to array length', () => {
    const input = [1, 2, 3];
    const result = chunkArray(input, 3);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it('should handle chunk size larger than array length', () => {
    const input = [1, 2, 3];
    const result = chunkArray(input, 5);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it('should handle chunk size of 1', () => {
    const input = [1, 2, 3];
    const result = chunkArray(input, 1);
    expect(result).toEqual([[1], [2], [3]]);
  });

  it('should work with strings', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = chunkArray(input, 2);
    expect(result).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('should work with mixed types', () => {
    const input = [1, 'a', true, null];
    const result = chunkArray(input, 2);
    expect(result).toEqual([
      [1, 'a'],
      [true, null],
    ]);
  });
});

describe('getStsEndpoint', () => {
  const testRegion = 'us-east-1';

  it('should return correct endpoint for aws-iso partition', () => {
    const endpoint = getStsEndpoint('aws-iso', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.c2s.ic.gov`);
  });

  it('should return correct endpoint for aws-iso-b partition', () => {
    const endpoint = getStsEndpoint('aws-iso-b', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.sc2s.sgov.gov`);
  });

  it('should return correct endpoint for aws-cn partition', () => {
    const endpoint = getStsEndpoint('aws-cn', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.amazonaws.com.cn`);
  });

  it('should return correct endpoint for aws-iso-f partition', () => {
    const endpoint = getStsEndpoint('aws-iso-f', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.csp.hci.ic.gov`);
  });

  it('should return correct endpoint for aws-iso-e partition', () => {
    const endpoint = getStsEndpoint('aws-iso-e', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.cloud.adc-e.uk`);
  });

  it('should return default endpoint for commercial AWS partition', () => {
    const endpoint = getStsEndpoint('aws', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.amazonaws.com`);
  });

  it('should return default endpoint for AWS GovCloud partition', () => {
    const endpoint = getStsEndpoint('aws-us-gov', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.amazonaws.com`);
  });

  it('should handle different regions correctly', () => {
    const differentRegions = ['us-west-1', 'eu-central-1', 'ap-southeast-2'];

    differentRegions.forEach(region => {
      const endpoint = getStsEndpoint('aws', region);
      expect(endpoint).toBe(`https://sts.${region}.amazonaws.com`);
    });
  });

  it('should handle unknown partitions with default endpoint', () => {
    const endpoint = getStsEndpoint('unknown-partition', testRegion);
    expect(endpoint).toBe(`https://sts.${testRegion}.amazonaws.com`);
  });

  it('should handle empty strings correctly', () => {
    const endpoint = getStsEndpoint('', '');
    expect(endpoint).toBe('https://sts..amazonaws.com');
  });
});

describe('wildcardMatch', () => {
  it('should match exact strings', () => {
    expect(wildcardMatch('hello', 'hello')).toBe(true);
    expect(wildcardMatch('test', 'test')).toBe(true);
    expect(wildcardMatch('hello', 'world')).toBe(false);
  });

  it('should handle question mark wildcard', () => {
    expect(wildcardMatch('test', 't?st')).toBe(true);
    expect(wildcardMatch('test', 't??t')).toBe(true);
    expect(wildcardMatch('test', 't???')).toBe(true);
    expect(wildcardMatch('test', 't?s')).toBe(false);
  });

  it('should handle asterisk wildcard', () => {
    expect(wildcardMatch('test', 't*')).toBe(true);
    expect(wildcardMatch('test', '*st')).toBe(true);
    expect(wildcardMatch('test', 't*t')).toBe(true);
    expect(wildcardMatch('test', '*')).toBe(true);
    expect(wildcardMatch('test', 't*s*')).toBe(true);
    expect(wildcardMatch('test', 'x*')).toBe(false);
  });

  it('should handle combination of wildcards', () => {
    expect(wildcardMatch('test123', 't*?23')).toBe(true);
    expect(wildcardMatch('test123', 't?st*')).toBe(true);
    expect(wildcardMatch('test123', '*?23')).toBe(true);
    expect(wildcardMatch('test123', 't*?3?')).toBe(false);
  });

  it('should handle empty strings', () => {
    expect(wildcardMatch('', '')).toBe(true);
    expect(wildcardMatch('', '*')).toBe(true);
    expect(wildcardMatch('', '?')).toBe(false);
    expect(wildcardMatch('test', '')).toBe(false);
  });

  it('should handle case sensitivity', () => {
    expect(wildcardMatch('Test', 'test')).toBe(false);
    expect(wildcardMatch('TEST', 'test')).toBe(false);
    expect(wildcardMatch('Test', 'T?st')).toBe(true);
  });

  it('should handle multiple asterisks', () => {
    expect(wildcardMatch('test123test', '*test*test*')).toBe(true);
    expect(wildcardMatch('testABCtestXYZ', '*test*test*')).toBe(true);
    expect(wildcardMatch('testtest', '*test*test*')).toBe(true);
    expect(wildcardMatch('test', '*test*test*')).toBe(false);
  });
});

describe('getGlobalRegion', () => {
  test('returns correct region for aws-us-gov partition', () => {
    expect(getGlobalRegion('aws-us-gov')).toBe('us-gov-west-1');
  });

  test('returns correct region for aws-iso partition', () => {
    expect(getGlobalRegion('aws-iso')).toBe('us-iso-east-1');
  });

  test('returns correct region for aws-iso-b partition', () => {
    expect(getGlobalRegion('aws-iso-b')).toBe('us-isob-east-1');
  });

  test('returns correct region for aws-iso-e partition', () => {
    expect(getGlobalRegion('aws-iso-e')).toBe('eu-isoe-west-1');
  });

  test('returns correct region for aws-iso-f partition', () => {
    expect(getGlobalRegion('aws-iso-f')).toBe('us-isof-south-1');
  });

  test('returns correct region for aws-cn partition', () => {
    expect(getGlobalRegion('aws-cn')).toBe('cn-northwest-1');
  });

  test('returns us-east-1 for default (aws) partition', () => {
    expect(getGlobalRegion('aws')).toBe('us-east-1');
  });

  test('returns us-east-1 for unknown partition', () => {
    expect(getGlobalRegion('unknown-partition')).toBe('us-east-1');
  });
});

describe('File and Directory Existence Functions', () => {
  let testDir: string;
  let testFile: string;

  beforeAll(async () => {
    // Create a temporary directory for testing
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'test-'));
    testFile = path.join(testDir, 'testfile.txt');

    // Create a test file
    await fs.promises.writeFile(testFile, 'Test content');
  });

  afterAll(async () => {
    // Clean up: remove the test file and directory
    await fs.promises.unlink(testFile);
    await fs.promises.rmdir(testDir);
  });

  describe('fileExists', () => {
    test('returns true when file exists', async () => {
      const result = await fileExists(testFile);
      expect(result).toBe(true);
    });

    test('returns false when file does not exist', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      const result = await fileExists(nonExistentFile);
      expect(result).toBe(false);
    });
  });

  describe('directoryExists', () => {
    test('returns true when directory exists', async () => {
      const result = await directoryExists(testDir);
      expect(result).toBe(true);
    });

    test('returns false when path exists but is not a directory', async () => {
      const result = await directoryExists(testFile);
      expect(result).toBe(false);
    });

    test('returns false when directory does not exist', async () => {
      const nonExistentDir = path.join(testDir, 'nonexistent');
      const result = await directoryExists(nonExistentDir);
      expect(result).toBe(false);
    });
  });
});

describe('File Pattern Functions', () => {
  let testDir: string;

  beforeAll(async () => {
    // Create a temporary directory for testing
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'test-'));

    // Create test files
    await fs.promises.writeFile(path.join(testDir, 'file1.template'), 'content');
    await fs.promises.writeFile(path.join(testDir, 'file2.template'), 'content');
    await fs.promises.writeFile(path.join(testDir, 'file1.diff'), 'content');
    await fs.promises.writeFile(path.join(testDir, 'file2.diff'), 'content');
    await fs.promises.writeFile(path.join(testDir, 'other.txt'), 'content');

    // Create a subdirectory with more files
    const subDir = path.join(testDir, 'subdir');
    await fs.promises.mkdir(subDir);
    await fs.promises.writeFile(path.join(subDir, 'file3.template'), 'content');
    await fs.promises.writeFile(path.join(subDir, 'file3.diff'), 'content');
  });

  afterAll(async () => {
    // Clean up: remove all test files and directories
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  describe('getAllFilesInPattern', () => {
    test('returns correct files with .template pattern', async () => {
      const files = await getAllFilesInPattern(testDir, '.template');
      expect(files).toEqual(expect.arrayContaining(['file1', 'file2', 'file3']));
      expect(files).toHaveLength(3);
    });

    test('returns correct files with .diff pattern', async () => {
      const files = await getAllFilesInPattern(testDir, '.diff');
      expect(files).toEqual(expect.arrayContaining(['file1', 'file2', 'file3']));
      expect(files).toHaveLength(3);
    });

    test('returns full paths when fullPath is true', async () => {
      const files = await getAllFilesInPattern(testDir, '.template', true);
      expect(files).toEqual(
        expect.arrayContaining([
          expect.stringContaining('file1.template'),
          expect.stringContaining('file2.template'),
          expect.stringContaining('file3.template'),
        ]),
      );
      expect(files).toHaveLength(3);
    });

    test('does not return files that do not match the pattern', async () => {
      const files = await getAllFilesInPattern(testDir, '.template');
      expect(files).not.toContain('other');
    });
  });

  describe('checkDiffFiles', () => {
    test('does not throw when template and diff files match', async () => {
      await expect(checkDiffFiles(testDir, '.template', '.diff')).resolves.not.toThrow();
    });

    test('throws when template and diff files do not match', async () => {
      // Create an extra .template file to cause a mismatch
      await fs.promises.writeFile(path.join(testDir, 'extra.template'), 'content');

      await expect(checkDiffFiles(testDir, '.template', '.diff')).rejects.toThrow(
        'Number of template files 4 does not match number of diff files 3 in directory',
      );
    });
  });
});
