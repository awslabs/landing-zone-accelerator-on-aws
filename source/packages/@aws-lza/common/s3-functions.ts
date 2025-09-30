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

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MODULE_EXCEPTIONS } from './enums';
import { throttlingBackOff } from './throttle';
import { createLogger } from './logger';
import path from 'path';

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
