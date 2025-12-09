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

import { ControlTowerLandingZoneConfig } from '@aws-accelerator/config';
import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';
import * as cdk from 'aws-cdk-lib';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import { ConfigGenerator } from './config-generator';

/**
 * Props for generating config files without CDK context
 */
export interface GenerateConfigFilesProps {
  readonly managementAccountEmail: string;
  readonly logArchiveAccountEmail: string;
  readonly auditAccountEmail: string;
  readonly homeRegion: string;
  readonly controlTowerEnabled: boolean;
  readonly enableSingleAccountMode: boolean;
  readonly controlTowerLandingZoneConfig?: ControlTowerLandingZoneConfig;
  readonly installerStackName?: string;
}

/**
 * Result of config file generation
 */
export interface GenerateConfigFilesResult {
  readonly tempDirPath: string;
  readonly configFiles: string[];
}

/**
 * Standalone function to generate LZA config files.
 * Used by both ConfigRepository (CDK) and CLI utility.
 * This is the SINGLE SOURCE OF TRUTH for config generation.
 *
 * @param props - Configuration options for generating config files
 * @returns Object containing tempDirPath and list of generated config files
 */
export function generateConfigFiles(props: GenerateConfigFilesProps): GenerateConfigFilesResult {
  let configGenerator: ConfigGenerator;
  let configFiles: string[];
  let tempDirPath: string;

  try {
    configGenerator = new ConfigGenerator({
      managementAccountEmail: props.managementAccountEmail,
      logArchiveAccountEmail: props.logArchiveAccountEmail,
      auditAccountEmail: props.auditAccountEmail,
      homeRegion: props.homeRegion,
      controlTowerEnabled: props.controlTowerEnabled,
      enableSingleAccountMode: props.enableSingleAccountMode,
      controlTowerLandingZoneConfig: props.controlTowerLandingZoneConfig,
    });
  } catch (error) {
    throw new Error(
      `Failed to initialize configuration generator: ${error instanceof Error ? error.message : String(error)}\n` +
        `This may indicate:\n` +
        `- Invalid configuration parameters\n` +
        `- Missing required dependencies\n` +
        `- Insufficient disk space for temporary files\n` +
        `- File system permission issues`,
    );
  }

  try {
    configFiles = configGenerator.generateConfigs();
    tempDirPath = configGenerator.getTempDirPath()!;
  } catch (error) {
    throw new Error(
      `Failed to generate configuration files: ${error instanceof Error ? error.message : String(error)}\n` +
        `This may indicate:\n` +
        `- Insufficient disk space in temporary directory\n` +
        `- File system permission issues\n` +
        `- Invalid template files or configuration logic\n` +
        `- Missing required configuration templates`,
    );
  }

  // Validate that files were actually generated
  if (!configFiles || configFiles.length === 0) {
    throw new Error(
      `No configuration files were generated. This indicates a problem with the configuration generation process.\n` +
        `Expected files: accounts-config.yaml, global-config.yaml, iam-config.yaml, network-config.yaml, organization-config.yaml, security-config.yaml`,
    );
  }

  if (!tempDirPath) {
    throw new Error(
      `Temporary directory path is not available. This indicates a problem with the configuration generation process.`,
    );
  }

  return {
    tempDirPath,
    configFiles,
  };
}

/**
 * Creates a zip archive from generated config files.
 * Extracted from S3ConfigRepository for reuse.
 *
 * @param tempDirPath - Path to the directory containing config files
 * @returns Path to the created zip file
 */
export function createConfigZipArchive(tempDirPath: string): string {
  const configGenerator = new ConfigGenerator({
    managementAccountEmail: 'placeholder@example.com',
    logArchiveAccountEmail: 'placeholder@example.com',
    auditAccountEmail: 'placeholder@example.com',
    homeRegion: 'us-east-1',
    controlTowerEnabled: false,
    enableSingleAccountMode: false,
  });

  // Set the temp dir path directly and create the zip
  // We need to use the ConfigGenerator's createZipArchive method
  // but with an existing directory
  return configGenerator.createZipArchiveFromPath(tempDirPath);
}

export interface ConfigRepositoryProps {
  readonly description?: string;
  readonly managementAccountEmail: string;
  readonly logArchiveAccountEmail: string;
  readonly auditAccountEmail: string;
  readonly controlTowerEnabled: string;
  readonly enableSingleAccountMode: boolean;
  /**
   * AWS Control Tower Landing Zone configuration
   */
  readonly controlTowerLandingZoneConfig?: ControlTowerLandingZoneConfig;
  /**
   * Installer stack name for error reporting
   */
  readonly installerStackName?: string;
}

export interface CodeCommitConfigRepositoryProps extends ConfigRepositoryProps {
  readonly repositoryName: string;
  readonly repositoryBranchName?: string;
}
export interface S3ConfigRepositoryProps extends ConfigRepositoryProps {
  readonly configBucketName: string;
  readonly installerKey: cdk.aws_kms.Key;
  readonly serverAccessLogsBucketName: string;
  readonly autoDeleteObjects?: boolean;
}

/**
 * Class to create AWS accelerator configuration repository and initialize the repository with default configuration.
 * Delegates config generation to ConfigGenerator for reusability outside CDK context.
 */
export class ConfigRepository extends Construct {
  readonly tempDirPath: string;
  protected readonly configGenerator: ConfigGenerator;

  constructor(scope: Construct, id: string, props: ConfigRepositoryProps) {
    super(scope, id);

    const homeRegion = cdk.Stack.of(this).region;
    const installerStackName = props.installerStackName || cdk.Stack.of(this).stackName;

    // Validate homeRegion is properly set
    if (!homeRegion || homeRegion.trim() === '') {
      throw new Error(
        `homeRegion is required and cannot be empty. Ensure AWS_REGION environment variable is properly set. ` +
          `Current homeRegion value: '${homeRegion}'. ` +
          `Installer stack: ${installerStackName}`,
      );
    }

    // Use ConfigGenerator for the actual config file generation
    this.configGenerator = new ConfigGenerator({
      managementAccountEmail: props.managementAccountEmail,
      logArchiveAccountEmail: props.logArchiveAccountEmail,
      auditAccountEmail: props.auditAccountEmail,
      homeRegion: homeRegion,
      controlTowerEnabled: props.controlTowerEnabled.toLowerCase() !== 'no',
      enableSingleAccountMode: props.enableSingleAccountMode,
      controlTowerLandingZoneConfig: props.controlTowerLandingZoneConfig,
    });

    // Generate the config files
    this.configGenerator.generateConfigs();
    this.tempDirPath = this.configGenerator.getTempDirPath()!;
  }
}

export class CodeCommitConfigRepository extends ConfigRepository {
  readonly configRepo: cdk_extensions.Repository;
  readonly s3AssetBucket: cdk.aws_s3_assets.Asset;
  constructor(scope: Construct, id: string, props: CodeCommitConfigRepositoryProps) {
    super(scope, id, props);

    this.s3AssetBucket = new s3_assets.Asset(this, 'ConfigurationDefaultsAssets', {
      path: this.tempDirPath,
    });
    this.configRepo = new cdk_extensions.Repository(this, 'Resource', {
      repositoryName: props.repositoryName,
      repositoryBranchName: props.repositoryBranchName!,
      s3BucketName: this.s3AssetBucket.bucket.bucketName,
      s3key: this.s3AssetBucket.s3ObjectKey,
    });
  }
  /**
   * Method to get initialized CodeCommit repository object
   * @return Returns Initialized CodeCommit repository object.
   */
  public getRepository(): cdk_extensions.Repository {
    return this.configRepo;
  }
}

export class S3ConfigRepository extends ConfigRepository {
  readonly configRepo: Bucket;
  constructor(scope: Construct, id: string, props: S3ConfigRepositoryProps) {
    super(scope, id, props);

    this.configRepo = new Bucket(this, 'SecureBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: props.configBucketName,
      kmsKey: props.installerKey,
      serverAccessLogsBucketName: props.serverAccessLogsBucketName,
      autoDeleteObjects: props.autoDeleteObjects,
      s3LifeCycleRules: [],
    });

    this.getZippedConfigFiles();
  }

  /**
   * Method to create a zip file of LZA config files
   * Uses the shared createConfigZipArchive function for consistency.
   *
   * @return Returns the path to the zip file
   */
  public getZippedConfigFiles(): string {
    return createConfigZipArchive(this.tempDirPath);
  }

  /**
   * Method to get initialized S3 repository object
   *
   * @return Returns Initialized S3 repository object.
   */
  public getRepository(): cdk.aws_s3.IBucket {
    return this.configRepo.getS3Bucket();
  }
}
