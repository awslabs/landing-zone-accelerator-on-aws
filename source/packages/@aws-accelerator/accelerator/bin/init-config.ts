#!/usr/bin/env node
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
 * CLI script to initialize LZA configuration files and upload to S3.
 *
 * Environment Variables:
 * - CONFIG_S3_PATH (required): Full S3 path for config zip (e.g., "s3://bucket/lza/aws-accelerator-config.zip")
 * - MANAGEMENT_ACCOUNT_EMAIL (required): Email for management account
 * - LOG_ARCHIVE_ACCOUNT_EMAIL (required): Email for log archive account
 * - AUDIT_ACCOUNT_EMAIL (required): Email for audit account
 * - AWS_REGION (required): AWS region
 * - CONTROL_TOWER_ENABLED (optional): "yes" or "no", defaults to "yes"
 * - SINGLE_ACCOUNT_MODE (optional): "true" or "false", defaults to "false"
 */

import * as path from 'path';
import { generateConfigFiles, createConfigZipArchive } from '../lib/config-repository';
import { S3ConfigManager } from '../lib/s3-config-manager';
import { createLogger } from '@aws-accelerator/utils';
import { ControlTowerLandingZoneConfig } from '@aws-accelerator/config';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

interface CLIConfig {
  configS3Path: string;
  managementEmail: string;
  logArchiveEmail: string;
  auditEmail: string;
  region: string;
  controlTowerEnabled: boolean;
  singleAccountMode: boolean;
}

/**
 * Parse and validate environment variables with comprehensive error handling
 */
function parseEnvironment(): CLIConfig {
  const requiredVars = [
    'CONFIG_S3_PATH',
    'MANAGEMENT_ACCOUNT_EMAIL',
    'LOG_ARCHIVE_ACCOUNT_EMAIL',
    'AUDIT_ACCOUNT_EMAIL',
    'AWS_REGION',
  ];

  // Check for missing variables
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    logger.error('Environment Variable Validation Failed');
    logger.error('=====================================');
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    logger.error('');
    logger.error('Required environment variables:');
    logger.error('  CONFIG_S3_PATH              - S3 path for config zip (s3://bucket/path/file.zip)');
    logger.error('  MANAGEMENT_ACCOUNT_EMAIL    - Email address for management account');
    logger.error('  LOG_ARCHIVE_ACCOUNT_EMAIL   - Email address for log archive account');
    logger.error('  AUDIT_ACCOUNT_EMAIL         - Email address for audit account');
    logger.error('  AWS_REGION                  - AWS region (e.g., us-east-1)');
    logger.error('');
    logger.error('Optional environment variables:');
    logger.error('  CONTROL_TOWER_ENABLED       - "yes" or "no" (default: "yes")');
    logger.error('  SINGLE_ACCOUNT_MODE         - "true" or "false" (default: "false")');
    logger.error('  INSTALLER_STACK_NAME        - CloudFormation stack name for error reporting');
    logger.error('');
    logger.error('Troubleshooting:');
    logger.error('  - Verify ECS task definition environment variables are correctly configured');
    logger.error('  - Check CloudFormation parameters are passed to container environment');
    logger.error('  - Ensure run-lza.sh script is setting all required variables');
    process.exit(1);
  }

  // Extract values
  const configS3Path = process.env['CONFIG_S3_PATH']!;
  const managementEmail = process.env['MANAGEMENT_ACCOUNT_EMAIL']!;
  const logArchiveEmail = process.env['LOG_ARCHIVE_ACCOUNT_EMAIL']!;
  const auditEmail = process.env['AUDIT_ACCOUNT_EMAIL']!;
  const region = process.env['AWS_REGION']!;
  const controlTowerEnabled = (process.env['CONTROL_TOWER_ENABLED'] ?? 'yes').toLowerCase();
  const singleAccountMode = (process.env['SINGLE_ACCOUNT_MODE'] ?? 'false').toLowerCase();

  return {
    configS3Path,
    managementEmail,
    logArchiveEmail,
    auditEmail,
    region,
    controlTowerEnabled: controlTowerEnabled === 'yes' || controlTowerEnabled === 'true',
    singleAccountMode: singleAccountMode === 'true' || singleAccountMode === 'yes',
  };
}

/**
 * Main entry point with comprehensive error handling
 */
async function main(): Promise<void> {
  logger.info('LZA Config Initializer');
  logger.info('======================');

  let config: CLIConfig;

  // Parse and validate environment with detailed error handling
  try {
    config = parseEnvironment();
  } catch (error) {
    // parseEnvironment already logs detailed error messages and exits
    // This catch block is for any unexpected errors during parsing
    logger.error(
      `Unexpected error during environment parsing: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  logger.info(`Config S3 Path: ${config.configS3Path}`);
  logger.info(`Region: ${config.region}`);
  logger.info(`Control Tower Enabled: ${config.controlTowerEnabled}`);
  logger.info(`Single Account Mode: ${config.singleAccountMode}`);

  let s3Manager: S3ConfigManager;

  // Initialize S3 manager with error handling
  try {
    s3Manager = new S3ConfigManager({
      s3Path: config.configS3Path,
      region: config.region,
    });
  } catch (error) {
    logger.error('Failed to initialize S3 configuration manager');
    logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error('');
    logger.error('This may indicate:');
    logger.error('  - Invalid S3 path format');
    logger.error('  - Invalid AWS region');
    logger.error('  - AWS SDK initialization issues');
    process.exit(1);
  }

  // Check if config already exists with enhanced error handling
  logger.info('Checking if configuration already exists...');
  let exists: boolean;

  try {
    exists = await s3Manager.configExists();
  } catch (error) {
    logger.error('Failed to check if configuration exists in S3');
    logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error('');
    logger.error('This may indicate:');
    logger.error('  - Network connectivity issues');
    logger.error('  - Invalid AWS credentials');
    logger.error('  - Insufficient S3 permissions');
    logger.error('  - S3 bucket does not exist');
    logger.error('  - AWS service availability issues');
    logger.error('');
    logger.error('Required S3 permissions:');
    logger.error('  - s3:GetObject or s3:GetObjectVersion (for HeadObject)');
    logger.error('  - s3:PutObject (for uploading configuration)');
    process.exit(1);
  }

  if (exists) {
    logger.info('Configuration already exists at S3 path. Skipping generation.');
    logger.info('SUCCESS: Config initialization complete (existing config preserved).');
    process.exit(0);
  }

  logger.info('No existing configuration found. Generating new configuration...');

  // Generate configuration files with enhanced error handling
  let tempDirPath: string;
  let configFiles: string[];
  let zipPath: string;

  try {
    // Get installer stack name from environment variable for error reporting
    const installerStackName = process.env['INSTALLER_STACK_NAME'] || 'AWSAccelerator-InstallerStack';

    logger.info(`Using installer stack name for error reporting: ${installerStackName}`);

    // Generate configs using shared function
    const result = generateConfigFiles({
      managementAccountEmail: config.managementEmail,
      logArchiveAccountEmail: config.logArchiveEmail,
      auditAccountEmail: config.auditEmail,
      homeRegion: config.region,
      controlTowerEnabled: config.controlTowerEnabled,
      controlTowerLandingZoneConfig: config.controlTowerEnabled ? new ControlTowerLandingZoneConfig() : undefined,
      enableSingleAccountMode: config.singleAccountMode,
      installerStackName: installerStackName,
    });

    tempDirPath = result.tempDirPath;
    configFiles = result.configFiles;

    logger.info(`Generated ${configFiles.length} configuration files:`);
    configFiles.forEach(file => logger.info(`  - ${file}`));
  } catch (error) {
    logger.error('Failed to generate configuration files');
    logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error('');
    logger.error('This may indicate:');
    logger.error('  - Invalid account email addresses');
    logger.error('  - Invalid AWS region');
    logger.error('  - Insufficient disk space');
    logger.error('  - File system permission issues');
    logger.error('  - Missing configuration templates');
    process.exit(1);
  }

  // Create zip archive with error handling
  try {
    logger.info('Creating zip archive...');
    zipPath = createConfigZipArchive(tempDirPath);
    logger.info(`Zip archive created: ${zipPath}`);
  } catch (error) {
    logger.error('Failed to create configuration zip archive');
    logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error('');
    logger.error('This may indicate:');
    logger.error('  - Insufficient disk space');
    logger.error('  - File system permission issues');
    logger.error('  - Corrupted configuration files');
    logger.error('  - Missing zip utility or dependencies');
    process.exit(1);
  }

  // Upload to S3 with error handling
  try {
    logger.info('Uploading to S3...');
    await s3Manager.upload(zipPath);
    logger.info(`Successfully uploaded to: ${config.configS3Path}`);
  } catch (error) {
    logger.error('Failed to upload configuration to S3');
    logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error('');
    logger.error('This may indicate:');
    logger.error('  - Insufficient S3 permissions (s3:PutObject required)');
    logger.error('  - Network connectivity issues');
    logger.error('  - S3 bucket does not exist or is in different region');
    logger.error('  - AWS service availability issues');
    logger.error('  - S3 bucket policy restrictions');
    logger.error('');
    logger.error('Troubleshooting steps:');
    logger.error('  1. Verify the S3 bucket exists and is in the correct region');
    logger.error('  2. Check IAM permissions for s3:PutObject on the target bucket');
    logger.error('  3. Verify bucket policy allows uploads from your account/role');
    logger.error('  4. Test network connectivity to AWS S3 service');
    process.exit(1);
  }

  logger.info('SUCCESS: Config initialization complete.');
}

// Run main
main().catch(error => {
  logger.error(`Unexpected error: ${error}`);
  process.exit(1);
});
