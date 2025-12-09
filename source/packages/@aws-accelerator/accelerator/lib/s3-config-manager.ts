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

import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '@aws-accelerator/utils';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

export interface S3ConfigManagerOptions {
  s3Path: string;
  region: string;
}

export interface S3PathComponents {
  bucket: string;
  key: string;
}

/**
 * Manages S3 operations for LZA configuration files
 */
export class S3ConfigManager {
  private readonly s3Client: S3Client;
  private readonly s3Path: string;
  private readonly region: string;
  private readonly pathComponents: S3PathComponents;

  constructor(options: S3ConfigManagerOptions) {
    this.s3Path = options.s3Path;
    this.region = options.region;
    this.s3Client = new S3Client({ region: this.region });
    this.pathComponents = this.parseS3Path(options.s3Path);
  }

  /**
   * Parse S3 path into bucket and key components
   */
  private parseS3Path(s3Path: string): S3PathComponents {
    if (!s3Path.startsWith('s3://')) {
      throw new Error('Invalid S3 path: must start with s3://');
    }

    const pathWithoutProtocol = s3Path.substring(5); // Remove 's3://'
    const firstSlashIndex = pathWithoutProtocol.indexOf('/');

    if (firstSlashIndex === -1) {
      throw new Error('Invalid S3 path: must include bucket and key');
    }

    const bucket = pathWithoutProtocol.substring(0, firstSlashIndex);
    const key = pathWithoutProtocol.substring(firstSlashIndex + 1);

    if (!bucket || !key) {
      throw new Error('Invalid S3 path: bucket and key must not be empty');
    }

    return { bucket, key };
  }

  /**
   * Get the parsed S3 path components
   */
  public getPathComponents(): S3PathComponents {
    return { ...this.pathComponents };
  }

  /**
   * Check if configuration already exists at the S3 path
   */
  public async configExists(): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.pathComponents.bucket,
        Key: this.pathComponents.key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: unknown) {
      const err = error as Error & { name?: string; $metadata?: { httpStatusCode?: number }; message: string };

      // Handle specific error cases
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }

      // Treat 403 Forbidden as "does not exist" to allow proceeding with config generation
      if (err.name === 'Forbidden' || err.$metadata?.httpStatusCode === 403) {
        logger.warn(`Access denied when checking config existence at ${this.s3Path}. Treating as "does not exist".`);
        return false;
      }

      // Re-throw other errors (500, network errors, etc.)
      logger.error(`Failed to check if configuration exists at ${this.s3Path}: ${err.message}`);
      throw new Error(`Failed to check if configuration exists: ${err.message}`);
    }
  }

  /**
   * Upload a file to the S3 path
   */
  public async upload(filePath: string): Promise<void> {
    try {
      const fileContent = fs.readFileSync(filePath);

      const command = new PutObjectCommand({
        Bucket: this.pathComponents.bucket,
        Key: this.pathComponents.key,
        Body: fileContent,
        ContentType: 'application/zip',
      });

      await this.s3Client.send(command);
      logger.info(`Successfully uploaded configuration to ${this.s3Path}`);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Failed to upload configuration to ${this.s3Path}: ${err.message}`);
      throw new Error(`Failed to upload configuration: ${err.message}`);
    }
  }
}
