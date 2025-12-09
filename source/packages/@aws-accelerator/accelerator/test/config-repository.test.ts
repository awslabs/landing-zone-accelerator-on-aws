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

import {
  CodeCommitConfigRepository,
  S3ConfigRepository,
  generateConfigFiles,
  createConfigZipArchive,
  GenerateConfigFilesProps,
} from '../lib/config-repository';
import * as cdk from 'aws-cdk-lib';
import { describe, it, expect, afterEach } from 'vitest';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import * as fs from 'fs';
import * as fc from 'fast-check';
import * as yaml from 'js-yaml';
import AdmZip from 'adm-zip';

describe('configRepository', () => {
  const stack = new cdk.Stack();
  const configRepository = new CodeCommitConfigRepository(stack, 'ConfigRepository', {
    repositoryName: 'aws-accelerator-config',
    repositoryBranchName: 'main',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'yes',
    enableSingleAccountMode: false,
  });

  const configRepository2 = new CodeCommitConfigRepository(stack, 'ConfigRepository2', {
    repositoryName: 'aws-accelerator-config',
    repositoryBranchName: 'main',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'no',
    enableSingleAccountMode: false,
  });

  const s3ConfigRepository = new S3ConfigRepository(stack, 'S3ConfigRepository', {
    configBucketName: 'aws-accelerator-config',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'no',
    enableSingleAccountMode: false,
    installerKey: new cdk.aws_kms.Key(stack, 'InstallerKey', {}),
    serverAccessLogsBucketName: 'server-access-logging-bucket',
  });

  describe('createRepository', () => {
    it('is created successfully', () => {
      expect(configRepository.getRepository()).toBeInstanceOf(Repository);
      expect(configRepository2.getRepository()).toBeInstanceOf(Repository);
      expect(s3ConfigRepository.getRepository()).toBeInstanceOf(cdk.aws_s3.Bucket);
    });

    it('creates the correct number of files', () => {
      const filesInCodeCommitRepo = fs.readdirSync(configRepository.tempDirPath).length;
      const filesInS3Repo = fs.readdirSync(s3ConfigRepository.tempDirPath).length;
      expect(filesInCodeCommitRepo).toEqual(6);
      expect(filesInS3Repo).toEqual(7);
    });
  });
});

/**
 * Arbitrary generator for valid email addresses
 */
const emailArbitrary = fc.emailAddress();

/**
 * Arbitrary generator for AWS regions
 */
const regionArbitrary = fc.constantFrom(
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
);

/**
 * Arbitrary generator for GenerateConfigFilesProps
 */
const configPropsArbitrary: fc.Arbitrary<GenerateConfigFilesProps> = fc.record({
  managementAccountEmail: emailArbitrary,
  logArchiveAccountEmail: emailArbitrary,
  auditAccountEmail: emailArbitrary,
  homeRegion: regionArbitrary,
  controlTowerEnabled: fc.boolean(),
  enableSingleAccountMode: fc.boolean(),
});

/**
 * Expected config file names
 */
const EXPECTED_CONFIG_FILES = [
  'global-config.yaml',
  'accounts-config.yaml',
  'iam-config.yaml',
  'network-config.yaml',
  'organization-config.yaml',
  'security-config.yaml',
];

describe('generateConfigFiles Property Tests', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    // Clean up temp directories after each test
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs.length = 0;
  });

  /**
   * **Feature: s3-config-initializer, Property 2: Config Generation Completeness**
   * *For any* valid set of input parameters (emails, region, CT enabled/disabled, single-account mode),
   * invoking `generateConfigFiles()` SHALL produce exactly 6 configuration files.
   * **Validates: Requirements 1.1, 1.2**
   */
  it('Property 2: Config Generation Completeness - generates all 6 config files for any valid input', () => {
    fc.assert(
      fc.property(configPropsArbitrary, props => {
        const result = generateConfigFiles(props);
        tempDirs.push(result.tempDirPath);

        // Check that exactly 6 config files are returned
        expect(result.configFiles).toHaveLength(6);

        // Check that all expected files exist on disk
        for (const fileName of EXPECTED_CONFIG_FILES) {
          const filePath = `${result.tempDirPath}/${fileName}`;
          expect(fs.existsSync(filePath)).toBe(true);
        }

        // Check that the returned config files match expected names
        expect(result.configFiles.sort()).toEqual(EXPECTED_CONFIG_FILES.sort());
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: s3-config-initializer, Property 3: Control Tower Enabled Configuration**
   * *For any* valid input where controlTowerEnabled is true, the generated global-config.yaml
   * SHALL contain `controlTower.enable: true` and `managementAccountAccessRole: AWSControlTowerExecution`.
   * **Validates: Requirements 1.4**
   */
  it('Property 3: Control Tower Enabled Configuration - sets correct values when CT enabled', () => {
    const ctEnabledProps = fc.record({
      managementAccountEmail: emailArbitrary,
      logArchiveAccountEmail: emailArbitrary,
      auditAccountEmail: emailArbitrary,
      homeRegion: regionArbitrary,
      controlTowerEnabled: fc.constant(true),
      enableSingleAccountMode: fc.boolean(),
    });

    fc.assert(
      fc.property(ctEnabledProps, props => {
        const result = generateConfigFiles(props);
        tempDirs.push(result.tempDirPath);

        const globalConfigPath = `${result.tempDirPath}/global-config.yaml`;
        const globalConfig = yaml.load(fs.readFileSync(globalConfigPath, 'utf8')) as Record<string, unknown>;

        expect((globalConfig['controlTower'] as Record<string, unknown>)['enable']).toBe(true);
        expect(globalConfig['managementAccountAccessRole']).toBe('AWSControlTowerExecution');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: s3-config-initializer, Property 4: Control Tower Disabled Configuration**
   * *For any* valid input where controlTowerEnabled is false, the generated global-config.yaml
   * SHALL contain `controlTower.enable: false` and `managementAccountAccessRole: OrganizationAccountAccessRole`.
   * **Validates: Requirements 1.5**
   */
  it('Property 4: Control Tower Disabled Configuration - sets correct values when CT disabled', () => {
    const ctDisabledProps = fc.record({
      managementAccountEmail: emailArbitrary,
      logArchiveAccountEmail: emailArbitrary,
      auditAccountEmail: emailArbitrary,
      homeRegion: regionArbitrary,
      controlTowerEnabled: fc.constant(false),
      enableSingleAccountMode: fc.boolean(),
    });

    fc.assert(
      fc.property(ctDisabledProps, props => {
        const result = generateConfigFiles(props);
        tempDirs.push(result.tempDirPath);

        const globalConfigPath = `${result.tempDirPath}/global-config.yaml`;
        const globalConfig = yaml.load(fs.readFileSync(globalConfigPath, 'utf8')) as Record<string, unknown>;

        expect((globalConfig['controlTower'] as Record<string, unknown>)['enable']).toBe(false);
        expect(globalConfig['managementAccountAccessRole']).toBe('OrganizationAccountAccessRole');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: s3-config-initializer, Property 5: Single Account Mode Organization Config**
   * *For any* valid input where singleAccountMode is true, the generated organization-config.yaml
   * SHALL contain `enable: false` and organizational units for Security and LogArchive.
   * **Validates: Requirements 3.1**
   */
  it('Property 5: Single Account Mode Organization Config - sets correct org config when single account mode', () => {
    const singleAccountProps = fc.record({
      managementAccountEmail: emailArbitrary,
      logArchiveAccountEmail: emailArbitrary,
      auditAccountEmail: emailArbitrary,
      homeRegion: regionArbitrary,
      controlTowerEnabled: fc.boolean(),
      enableSingleAccountMode: fc.constant(true),
    });

    fc.assert(
      fc.property(singleAccountProps, props => {
        const result = generateConfigFiles(props);
        tempDirs.push(result.tempDirPath);

        const orgConfigPath = `${result.tempDirPath}/organization-config.yaml`;
        const orgConfig = yaml.load(fs.readFileSync(orgConfigPath, 'utf8')) as Record<string, unknown>;

        expect(orgConfig['enable']).toBe(false);

        const orgUnits = orgConfig['organizationalUnits'] as Array<{ name: string }>;
        const ouNames = orgUnits.map(ou => ou.name);
        expect(ouNames).toContain('Security');
        expect(ouNames).toContain('LogArchive');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: s3-config-initializer, Property 6: Multi-Account Mode Organization Config**
   * *For any* valid input where singleAccountMode is false, the generated organization-config.yaml
   * SHALL contain the default organization configuration with Organizations enabled.
   * **Validates: Requirements 3.2**
   */
  it('Property 6: Multi-Account Mode Organization Config - sets default org config when multi-account mode', () => {
    const multiAccountProps = fc.record({
      managementAccountEmail: emailArbitrary,
      logArchiveAccountEmail: emailArbitrary,
      auditAccountEmail: emailArbitrary,
      homeRegion: regionArbitrary,
      controlTowerEnabled: fc.boolean(),
      enableSingleAccountMode: fc.constant(false),
    });

    fc.assert(
      fc.property(multiAccountProps, props => {
        const result = generateConfigFiles(props);
        tempDirs.push(result.tempDirPath);

        const orgConfigPath = `${result.tempDirPath}/organization-config.yaml`;
        const orgConfig = yaml.load(fs.readFileSync(orgConfigPath, 'utf8')) as Record<string, unknown>;

        // Default OrganizationConfig has enable: true
        expect(orgConfig['enable']).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: s3-config-initializer, Property 7: YAML Round-Trip Consistency**
   * *For any* generated configuration file, parsing the YAML content and re-serializing it
   * SHALL produce semantically equivalent YAML.
   * **Validates: Requirements 4.1**
   */
  it('Property 7: YAML Round-Trip Consistency - all generated YAML files round-trip correctly', () => {
    fc.assert(
      fc.property(configPropsArbitrary, props => {
        const result = generateConfigFiles(props);
        tempDirs.push(result.tempDirPath);

        for (const fileName of EXPECTED_CONFIG_FILES) {
          const filePath = `${result.tempDirPath}/${fileName}`;
          const originalContent = fs.readFileSync(filePath, 'utf8');

          // Parse and re-serialize
          const parsed = yaml.load(originalContent);
          const reserialized = yaml.dump(parsed);

          // Parse both to compare semantically
          const originalParsed = yaml.load(originalContent);
          const reserializedParsed = yaml.load(reserialized);

          expect(reserializedParsed).toEqual(originalParsed);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: s3-config-initializer, Property 8: Zip Archive Completeness**
   * *For any* successful config generation, the created zip archive SHALL contain all 6 configuration files
   * and each file SHALL be extractable and readable.
   * **Validates: Requirements 1.2**
   */
  it('Property 8: Zip Archive Completeness - zip contains all config files and they are extractable', () => {
    fc.assert(
      fc.property(configPropsArbitrary, props => {
        const result = generateConfigFiles(props);
        tempDirs.push(result.tempDirPath);

        const zipFilePath = createConfigZipArchive(result.tempDirPath);

        // Verify zip file exists
        expect(fs.existsSync(zipFilePath)).toBe(true);

        // Extract and verify contents
        const zip = new AdmZip(zipFilePath);
        const zipEntries = zip.getEntries();
        const zipFileNames = zipEntries.map(entry => entry.entryName);

        // Check all expected files are in the zip
        for (const fileName of EXPECTED_CONFIG_FILES) {
          expect(zipFileNames).toContain(fileName);
        }

        // Verify each file is readable
        for (const entry of zipEntries) {
          if (EXPECTED_CONFIG_FILES.includes(entry.entryName)) {
            const content = entry.getData().toString('utf8');
            expect(content.length).toBeGreaterThan(0);

            // Verify it's valid YAML
            const parsed = yaml.load(content);
            expect(parsed).toBeDefined();
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
