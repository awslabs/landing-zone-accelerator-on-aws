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

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MODULE_EXCEPTIONS } from './enums';
import { throttlingBackOff } from './throttle';
import { createLogger } from './logger';
import path from 'path';
import { createHash } from 'crypto';

interface ValidationResult {
  isValid: boolean;
  message?: string;
}

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Retrieves content from S3 bucket
 *
 * @param s3Client - Configured S3 client
 * @param bucketName - S3 bucket name
 * @param objectPath - S3 object key
 * @returns S3 content as string
 * @throws Error for S3 access failures
 */
export async function getS3ObjectContent(s3Client: S3Client, bucketName: string, objectPath: string): Promise<string> {
  try {
    const s3Object = await throttlingBackOff(() =>
      s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: objectPath })),
    );

    if (!s3Object.Body) {
      const errorMessage = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: S3 object at s3://${bucketName}/${objectPath} has no body content`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    return await s3Object.Body.transformToString();
  } catch (error) {
    logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to retrieve content from S3: ${error}`);
    throw error;
  }
}

/**
 * Function to upload file to S3
 * @param s3Client {@link S3Client}
 * @param bucketName string
 * @param objectPath string
 * @param fileContent string
 */
export async function uploadFileToS3(
  s3Client: S3Client,
  bucketName: string,
  objectPath: string,
  fileContent: string,
): Promise<void> {
  try {
    logger.info(`Calculating file hashes`);
    // MD5 is required by S3 API for ContentMD5 header and ETag comparison
    // This is used for data integrity verification, not cryptographic security
    const md5Hash = createHash('md5').update(fileContent);

    const localFileMD5 = md5Hash.digest('hex');
    const contentMD5 = Buffer.from(localFileMD5, 'hex').toString('base64');

    // Upload file with MD5 metadata
    await throttlingBackOff(() =>
      s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectPath,
          Body: fileContent,
          ContentMD5: contentMD5,
          Metadata: {
            md5: localFileMD5,
          },
        }),
      ),
    );

    // Verify upload
    logger.info(`Verifying upload`);
    const validationResultAfterUpload: ValidationResult = await verifyS3Upload(
      s3Client,
      bucketName,
      objectPath,
      localFileMD5,
    );
    if (!validationResultAfterUpload.isValid) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Upload verification failed: ${validationResultAfterUpload.message} for  s3://${bucketName}/${objectPath} file.`,
      );
    }
    logger.info(`Successfully uploaded file to S3: s3://${bucketName}/${objectPath}`);
  } catch (error) {
    logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to upload file to S3: ${error}`);
    throw error;
  }
}

/**
 * Function to verify S3 upload
 * @param s3Client {@link S3Client}
 * @param bucketName string
 * @param s3Key string
 * @param localFileMD5 string
 * @returns {@link ValidationResult}
 */
async function verifyS3Upload(
  s3Client: S3Client,
  bucketName: string,
  s3Key: string,
  localFileMD5: string,
): Promise<ValidationResult> {
  const headResponse = await s3Client.send(
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    }),
  );

  const s3MD5 = headResponse.ETag?.replace(/"/g, '');
  if (s3MD5 !== localFileMD5) {
    return {
      isValid: false,
      message: `MD5 mismatch. Local: ${localFileMD5}, S3: ${s3MD5}`,
    };
  }

  return { isValid: true };
}
