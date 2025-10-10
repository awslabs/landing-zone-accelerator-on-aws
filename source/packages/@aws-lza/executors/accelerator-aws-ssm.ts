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

import path from 'path';
import { createLogger } from '../common/logger';
import { IAssumeRoleCredential } from '../common/resources';
import { IBlockPublicDocumentSharingHandlerParameter } from '../interfaces/aws-ssm/manage-document-public-access-block';
import { BlockPublicDocumentSharingModule } from '../lib/aws-ssm/manage-document-public-access-block';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to manage SSM Block Public Document Sharing
 * @param input {@link IBlockPublicDocumentSharingHandlerParameter}
 * @returns string
 *
 * @description
 * Use this function to manage SSM Block Public Document Sharing for an AWS account.
 * This function enables or disables the ability to share SSM documents publicly.
 *
 * @example
 * ```
 * const input: IBlockPublicDocumentSharingHandlerParameter = {
 *   operation: 'manage-block-public-document-sharing',
 *   configuration: {
 *     enable: true,
 *   },
 *   partition: 'aws',
 *   region: 'us-east-1',
 * };
 *
 * const status = await manageBlockPublicDocumentSharing(input);
 * ```
 */
export async function manageBlockPublicDocumentSharing(params: {
  accountId: string;
  region: string;
  credentials: IAssumeRoleCredential;
  enable: boolean;
  solutionId: string;
}): Promise<string> {
  try {
    const input: IBlockPublicDocumentSharingHandlerParameter = {
      operation: 'manage-block-public-document-sharing',
      configuration: {
        enable: params.enable,
      },
      partition: 'aws',
      region: params.region,
      credentials: params.credentials,
      solutionId: params.solutionId,
    };
    return await new BlockPublicDocumentSharingModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}
