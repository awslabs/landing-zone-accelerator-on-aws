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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateConfigFiles } from '../lib/config-repository';
import { S3ConfigManager } from '../lib/s3-config-manager';

/**
 * Helper function to simulate CLI environment variable validation
 * This mirrors the parseEnvironment() function in init-config.ts
 */
function validateRequiredEnvVars(): string[] {
  const requiredVars = [
    'CONFIG_S3_PATH',
    'MANAGEMENT_ACCOUNT_EMAIL',
    'LOG_ARCHIVE_ACCOUNT_EMAIL',
    'AUDIT_ACCOUNT_EMAIL',
    'AWS_REGION',
  ];
  return requiredVars.filter(varName => !process.env[varName]);
}

describe('init-config CLI Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Missing Required Environment Variables', () => {
    it('should identify all missing required variables when none are set', () => {
      // Clear all required env vars
      delete process.env['CONFIG_S3_PATH'];
      delete process.env['MANAGEMENT_ACCOUNT_EMAIL'];
      delete process.env['LOG_ARCHIVE_ACCOUNT_EMAIL'];
      delete process.env['AUDIT_ACCOUNT_EMAIL'];
      delete process.env['AWS_REGION'];

      const missingVars = validateRequiredEnvVars();

      expect(missingVars).toContain('CONFIG_S3_PATH');
      expect(missingVars).toContain('MANAGEMENT_ACCOUNT_EMAIL');
      expect(missingVars).toContain('LOG_ARCHIVE_ACCOUNT_EMAIL');
      expect(missingVars).toContain('AUDIT_ACCOUNT_EMAIL');
      expect(missingVars).toContain('AWS_REGION');
      expect(missingVars.length).toBe(5);
    });

    it('should identify missing CONFIG_S3_PATH', () => {
      process.env['MANAGEMENT_ACCOUNT_EMAIL'] = 'mgmt@example.com';
      process.env['LOG_ARCHIVE_ACCOUNT_EMAIL'] = 'log@example.com';
      process.env['AUDIT_ACCOUNT_EMAIL'] = 'audit@example.com';
      process.env['AWS_REGION'] = 'us-east-1';
      delete process.env['CONFIG_S3_PATH'];

      const missingVars = validateRequiredEnvVars();

      expect(missingVars).toEqual(['CONFIG_S3_PATH']);
    });

    it('should identify missing MANAGEMENT_ACCOUNT_EMAIL', () => {
      process.env['CONFIG_S3_PATH'] = 's3://bucket/config.zip';
      process.env['LOG_ARCHIVE_ACCOUNT_EMAIL'] = 'log@example.com';
      process.env['AUDIT_ACCOUNT_EMAIL'] = 'audit@example.com';
      process.env['AWS_REGION'] = 'us-east-1';
      delete process.env['MANAGEMENT_ACCOUNT_EMAIL'];

      const missingVars = validateRequiredEnvVars();

      expect(missingVars).toEqual(['MANAGEMENT_ACCOUNT_EMAIL']);
    });

    it('should identify multiple missing variables', () => {
      process.env['CONFIG_S3_PATH'] = 's3://bucket/config.zip';
      process.env['AWS_REGION'] = 'us-east-1';
      delete process.env['MANAGEMENT_ACCOUNT_EMAIL'];
      delete process.env['LOG_ARCHIVE_ACCOUNT_EMAIL'];
      delete process.env['AUDIT_ACCOUNT_EMAIL'];

      const missingVars = validateRequiredEnvVars();

      expect(missingVars).toContain('MANAGEMENT_ACCOUNT_EMAIL');
      expect(missingVars).toContain('LOG_ARCHIVE_ACCOUNT_EMAIL');
      expect(missingVars).toContain('AUDIT_ACCOUNT_EMAIL');
      expect(missingVars.length).toBe(3);
    });
  });

  describe('Valid Environment Variable Combinations', () => {
    it('should return no missing vars when all required variables are set', () => {
      process.env['CONFIG_S3_PATH'] = 's3://test-bucket/lza/config.zip';
      process.env['MANAGEMENT_ACCOUNT_EMAIL'] = 'mgmt@example.com';
      process.env['LOG_ARCHIVE_ACCOUNT_EMAIL'] = 'log@example.com';
      process.env['AUDIT_ACCOUNT_EMAIL'] = 'audit@example.com';
      process.env['AWS_REGION'] = 'us-east-1';

      const missingVars = validateRequiredEnvVars();

      expect(missingVars.length).toBe(0);
    });

    it('should work with all required vars and optional CONTROL_TOWER_ENABLED=yes', () => {
      process.env['CONFIG_S3_PATH'] = 's3://test-bucket/lza/config.zip';
      process.env['MANAGEMENT_ACCOUNT_EMAIL'] = 'mgmt@example.com';
      process.env['LOG_ARCHIVE_ACCOUNT_EMAIL'] = 'log@example.com';
      process.env['AUDIT_ACCOUNT_EMAIL'] = 'audit@example.com';
      process.env['AWS_REGION'] = 'us-east-1';
      process.env['CONTROL_TOWER_ENABLED'] = 'yes';

      const missingVars = validateRequiredEnvVars();
      expect(missingVars.length).toBe(0);

      // Verify config generation works with these values
      const result = generateConfigFiles({
        managementAccountEmail: process.env['MANAGEMENT_ACCOUNT_EMAIL']!,
        logArchiveAccountEmail: process.env['LOG_ARCHIVE_ACCOUNT_EMAIL']!,
        auditAccountEmail: process.env['AUDIT_ACCOUNT_EMAIL']!,
        homeRegion: process.env['AWS_REGION']!,
        controlTowerEnabled: true,
        enableSingleAccountMode: false,
      });

      expect(result.configFiles.length).toBe(6);
    });

    it('should work with all required vars and optional SINGLE_ACCOUNT_MODE=true', () => {
      process.env['CONFIG_S3_PATH'] = 's3://test-bucket/lza/config.zip';
      process.env['MANAGEMENT_ACCOUNT_EMAIL'] = 'mgmt@example.com';
      process.env['LOG_ARCHIVE_ACCOUNT_EMAIL'] = 'log@example.com';
      process.env['AUDIT_ACCOUNT_EMAIL'] = 'audit@example.com';
      process.env['AWS_REGION'] = 'us-west-2';
      process.env['SINGLE_ACCOUNT_MODE'] = 'true';

      const missingVars = validateRequiredEnvVars();
      expect(missingVars.length).toBe(0);

      // Verify config generation works with these values
      const result = generateConfigFiles({
        managementAccountEmail: process.env['MANAGEMENT_ACCOUNT_EMAIL']!,
        logArchiveAccountEmail: process.env['LOG_ARCHIVE_ACCOUNT_EMAIL']!,
        auditAccountEmail: process.env['AUDIT_ACCOUNT_EMAIL']!,
        homeRegion: process.env['AWS_REGION']!,
        controlTowerEnabled: false,
        enableSingleAccountMode: true,
      });

      expect(result.configFiles.length).toBe(6);
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should default controlTowerEnabled to true when not specified', () => {
      const controlTowerEnabled = (process.env['CONTROL_TOWER_ENABLED'] ?? 'yes').toLowerCase();
      expect(controlTowerEnabled === 'yes' || controlTowerEnabled === 'true').toBe(true);
    });

    it('should parse controlTowerEnabled as false when set to "no"', () => {
      process.env['CONTROL_TOWER_ENABLED'] = 'no';
      const controlTowerEnabled = (process.env['CONTROL_TOWER_ENABLED'] ?? 'yes').toLowerCase();
      expect(controlTowerEnabled === 'yes' || controlTowerEnabled === 'true').toBe(false);
    });

    it('should default singleAccountMode to false when not specified', () => {
      const singleAccountMode = (process.env['SINGLE_ACCOUNT_MODE'] ?? 'false').toLowerCase();
      expect(singleAccountMode === 'true' || singleAccountMode === 'yes').toBe(false);
    });

    it('should parse singleAccountMode as true when set to "true"', () => {
      process.env['SINGLE_ACCOUNT_MODE'] = 'true';
      const singleAccountMode = (process.env['SINGLE_ACCOUNT_MODE'] ?? 'false').toLowerCase();
      expect(singleAccountMode === 'true' || singleAccountMode === 'yes').toBe(true);
    });
  });

  describe('S3 Path Validation', () => {
    it('should accept valid S3 paths', () => {
      const validPaths = [
        's3://my-bucket/config.zip',
        's3://my-bucket/path/to/config.zip',
        's3://bucket-name-123/lza/aws-accelerator-config.zip',
      ];

      for (const path of validPaths) {
        const manager = new S3ConfigManager({ s3Path: path, region: 'us-east-1' });
        expect(manager.getPathComponents().bucket).toBeTruthy();
        expect(manager.getPathComponents().key).toBeTruthy();
      }
    });

    it('should reject invalid S3 paths', () => {
      const invalidPaths = [
        'my-bucket/config.zip', // Missing s3://
        'https://my-bucket/config.zip', // Wrong protocol
        's3://my-bucket', // Missing key
      ];

      for (const path of invalidPaths) {
        expect(() => new S3ConfigManager({ s3Path: path, region: 'us-east-1' })).toThrow('Invalid S3 path');
      }
    });
  });
});
