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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { S3ConfigManager } from '../lib/s3-config-manager';
import { S3Client, HeadObjectCommand, NotFound } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

// Arbitrary for generating valid S3 bucket names (simplified)
const bucketNameArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}[a-z0-9]$/);

// Arbitrary for generating valid S3 keys
const s3KeyArbitrary = fc
  .array(fc.stringMatching(/^[a-z0-9-]{1,10}$/), { minLength: 1, maxLength: 4 })
  .map(parts => parts.join('/') + '/config.zip');

// Arbitrary for generating valid AWS regions
const regionArbitrary = fc.constantFrom(
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
);

describe('S3ConfigManager Tests', () => {
  describe('S3 Path Parsing', () => {
    /**
     * **Feature: s3-config-initializer, Property 1: Idempotent Config Creation**
     * Testing the path parsing component - for any valid S3 path, parsing should
     * correctly extract bucket and key components.
     * **Validates: Requirements 1.6**
     */
    it('Property 1 (partial): S3 path parsing correctly extracts bucket and key for any valid path', () => {
      fc.assert(
        fc.property(fc.tuple(bucketNameArbitrary, s3KeyArbitrary, regionArbitrary), ([bucket, key, region]) => {
          const s3Path = `s3://${bucket}/${key}`;
          const manager = new S3ConfigManager({ s3Path, region });
          const components = manager.getPathComponents();

          expect(components.bucket).toBe(bucket);
          expect(components.key).toBe(key);
        }),
        { numRuns: 100 },
      );
    });

    it('throws error for invalid S3 paths without s3:// prefix', () => {
      fc.assert(
        fc.property(fc.tuple(bucketNameArbitrary, s3KeyArbitrary, regionArbitrary), ([bucket, key, region]) => {
          const invalidPath = `${bucket}/${key}`; // Missing s3://
          expect(() => new S3ConfigManager({ s3Path: invalidPath, region })).toThrow('Invalid S3 path');
        }),
        { numRuns: 50 },
      );
    });

    it('throws error for S3 paths without key', () => {
      fc.assert(
        fc.property(fc.tuple(bucketNameArbitrary, regionArbitrary), ([bucket, region]) => {
          const invalidPath = `s3://${bucket}`; // Missing key
          expect(() => new S3ConfigManager({ s3Path: invalidPath, region })).toThrow('Invalid S3 path');
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Idempotent Config Creation', () => {
    const s3Mock = mockClient(S3Client);

    beforeEach(() => {
      s3Mock.reset();
    });

    afterEach(() => {
      s3Mock.reset();
    });

    /**
     * **Feature: s3-config-initializer, Property 1: Idempotent Config Creation**
     * For any S3 path where a config already exists, invoking configExists() SHALL
     * return true, enabling the caller to skip generation and upload.
     * **Validates: Requirements 1.6**
     */
    it('Property 1: configExists returns true when config exists at S3 path', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(bucketNameArbitrary, s3KeyArbitrary, regionArbitrary),
          async ([bucket, key, region]) => {
            // Reset mock for each iteration
            s3Mock.reset();

            // Mock HeadObject to return success (object exists)
            s3Mock.on(HeadObjectCommand).resolves({
              ContentLength: 1024,
              ContentType: 'application/zip',
            });

            const s3Path = `s3://${bucket}/${key}`;
            const manager = new S3ConfigManager({ s3Path, region });

            const exists = await manager.configExists();

            // When config exists, configExists should return true
            expect(exists).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Feature: s3-config-initializer, Property 1: Idempotent Config Creation**
     * For any S3 path where no config exists, invoking configExists() SHALL
     * return false, enabling the caller to proceed with generation and upload.
     * **Validates: Requirements 1.6**
     */
    it('Property 1: configExists returns false when config does not exist at S3 path', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(bucketNameArbitrary, s3KeyArbitrary, regionArbitrary),
          async ([bucket, key, region]) => {
            // Reset mock for each iteration
            s3Mock.reset();

            // Mock HeadObject to throw NotFound (object doesn't exist)
            s3Mock.on(HeadObjectCommand).rejects(new NotFound({ message: 'Not Found', $metadata: {} }));

            const s3Path = `s3://${bucket}/${key}`;
            const manager = new S3ConfigManager({ s3Path, region });

            const exists = await manager.configExists();

            // When config doesn't exist, configExists should return false
            expect(exists).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * **Feature: s3-config-initializer, Property 10: Permission Error Handling for Config Existence Check**
     * For any S3 path where checking object existence returns a 403 Forbidden error,
     * the system SHALL treat this as "config does not exist" and return false,
     * allowing the caller to proceed with config generation.
     * **Validates: Requirements 6.1, 6.2**
     */
    it('Property 10: configExists returns false when HeadObject returns 403 Forbidden', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(bucketNameArbitrary, s3KeyArbitrary, regionArbitrary),
          async ([bucket, key, region]) => {
            // Reset mock for each iteration
            s3Mock.reset();

            // Mock HeadObject to throw 403 Forbidden error
            const forbiddenError = new Error('Forbidden') as Error & {
              name: string;
              $metadata: { httpStatusCode: number };
            };
            forbiddenError.name = 'Forbidden';
            forbiddenError.$metadata = { httpStatusCode: 403 };
            s3Mock.on(HeadObjectCommand).rejects(forbiddenError);

            const s3Path = `s3://${bucket}/${key}`;
            const manager = new S3ConfigManager({ s3Path, region });

            const exists = await manager.configExists();

            // When HeadObject returns 403, configExists should return false (treat as "does not exist")
            expect(exists).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Error Handling Unit Tests', () => {
    const s3Mock = mockClient(S3Client);

    beforeEach(() => {
      s3Mock.reset();
    });

    afterEach(() => {
      s3Mock.reset();
    });

    /**
     * Unit test: 403 errors should return false from configExists()
     * **Validates: Requirements 6.1, 6.2**
     */
    it('configExists returns false when HeadObject returns 403 Forbidden', async () => {
      const forbiddenError = new Error('Forbidden') as Error & { name: string; $metadata: { httpStatusCode: number } };
      forbiddenError.name = 'Forbidden';
      forbiddenError.$metadata = { httpStatusCode: 403 };
      s3Mock.on(HeadObjectCommand).rejects(forbiddenError);

      const manager = new S3ConfigManager({
        s3Path: 's3://test-bucket/lza/config.zip',
        region: 'us-east-1',
      });

      const exists = await manager.configExists();
      expect(exists).toBe(false);
    });

    /**
     * Unit test: 404 errors should return false from configExists()
     * **Validates: Requirements 6.2**
     */
    it('configExists returns false when HeadObject returns 404 Not Found', async () => {
      s3Mock.on(HeadObjectCommand).rejects(new NotFound({ message: 'Not Found', $metadata: {} }));

      const manager = new S3ConfigManager({
        s3Path: 's3://test-bucket/lza/config.zip',
        region: 'us-east-1',
      });

      const exists = await manager.configExists();
      expect(exists).toBe(false);
    });

    /**
     * Unit test: 200 OK should return true from configExists()
     * **Validates: Requirements 6.3**
     */
    it('configExists returns true when HeadObject returns 200 OK', async () => {
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 1024,
        ContentType: 'application/zip',
      });

      const manager = new S3ConfigManager({
        s3Path: 's3://test-bucket/lza/config.zip',
        region: 'us-east-1',
      });

      const exists = await manager.configExists();
      expect(exists).toBe(true);
    });

    /**
     * Unit test: Other errors (500, network errors) should be re-thrown
     * **Validates: Requirements 6.3**
     */
    it('configExists re-throws errors that are not 403 or 404', async () => {
      const serverError = new Error('Internal Server Error') as Error & { $metadata: { httpStatusCode: number } };
      serverError.$metadata = { httpStatusCode: 500 };
      s3Mock.on(HeadObjectCommand).rejects(serverError);

      const manager = new S3ConfigManager({
        s3Path: 's3://test-bucket/lza/config.zip',
        region: 'us-east-1',
      });

      await expect(manager.configExists()).rejects.toThrow('Failed to check if configuration exists');
    });

    it('configExists re-throws network errors', async () => {
      const networkError = new Error('Network timeout') as Error & { name: string };
      networkError.name = 'NetworkError';
      s3Mock.on(HeadObjectCommand).rejects(networkError);

      const manager = new S3ConfigManager({
        s3Path: 's3://test-bucket/lza/config.zip',
        region: 'us-east-1',
      });

      await expect(manager.configExists()).rejects.toThrow('Failed to check if configuration exists');
    });
  });
});
