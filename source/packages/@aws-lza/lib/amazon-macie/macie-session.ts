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
 * @fileoverview Amazon Macie Session Configuration - Account-level Macie settings management
 *
 * Provides comprehensive session-level configuration management for Amazon Macie including
 * findings publication settings, classification export configuration, and Security Hub integration.
 * Handles account-specific Macie settings with proper validation and error handling.
 *
 * Key capabilities:
 * - Macie session configuration and updates
 * - Findings publication to Security Hub configuration
 * - Classification export to S3 setup
 * - Finding frequency and publication settings
 * - Account-specific S3 destination management
 */

import path from 'path';
import {
  Macie2Client,
  UpdateMacieSessionCommand,
  PutFindingsPublicationConfigurationCommand,
  PutClassificationExportConfigurationCommand,
  FindingPublishingFrequency,
  MacieStatus,
} from '@aws-sdk/client-macie2';
import { createLogger } from '../common/logger';
import { executeApi } from '../common/utility';
import { IMacieS3Destination } from './interfaces';
import { IAcceleratorEnvironment } from '../common/interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Abstract class for managing Amazon Macie session configurations
 */
export abstract class MacieSession {
  /**
   * Configures comprehensive Macie session settings for an account
   * @param env - Accelerator environment (account and region)
   * @param client - Macie2 client instance
   * @param s3Destination - S3 destination configuration for findings export
   * @param policyFindingsPublishingFrequency - Frequency for publishing policy findings
   * @param publishSensitiveDataFindings - Whether to publish sensitive data findings
   * @param publishPolicyFindings - Whether to publish policy findings
   * @param dryRun - Whether to perform dry run without making changes
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when session is configured
   */
  public static async configure(
    env: IAcceleratorEnvironment,
    client: Macie2Client,
    s3Destination: IMacieS3Destination,
    policyFindingsPublishingFrequency: FindingPublishingFrequency,
    publishSensitiveDataFindings: boolean,
    publishPolicyFindings: boolean,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<void> {
    // Update Macie session with findings frequency
    if (dryRun) {
      logger.dryRun(
        'UpdateMacieSessionCommand',
        { findingPublishingFrequency: policyFindingsPublishingFrequency },
        logPrefix,
      );
    } else {
      await executeApi(
        'UpdateMacieSessionCommand',
        { findingPublishingFrequency: policyFindingsPublishingFrequency },
        () =>
          client.send(
            new UpdateMacieSessionCommand({
              findingPublishingFrequency: policyFindingsPublishingFrequency,
              status: MacieStatus.ENABLED,
            }),
          ),
        logger,
        logPrefix,
      );
    }

    // Configure findings publication to Security Hub
    if (dryRun) {
      logger.dryRun(
        'PutFindingsPublicationConfigurationCommand',
        { publishSensitiveDataFindings, publishPolicyFindings },
        logPrefix,
      );
    } else {
      await executeApi(
        'PutFindingsPublicationConfigurationCommand',
        { publishSensitiveDataFindings, publishPolicyFindings },
        () =>
          client.send(
            new PutFindingsPublicationConfigurationCommand({
              securityHubConfiguration: {
                publishClassificationFindings: publishSensitiveDataFindings,
                publishPolicyFindings: publishPolicyFindings,
              },
            }),
          ),
        logger,
        logPrefix,
      );
    }

    // Configure classification export to S3
    const destination: IMacieS3Destination = {
      bucketName: s3Destination.bucketName,
      kmsKeyArn: s3Destination.kmsKeyArn,
      keyPrefix: s3Destination.keyPrefix ?? 'macie' + env.accountId,
    };
    if (dryRun) {
      logger.dryRun(
        'PutClassificationExportConfigurationCommand',
        {
          configuration: {
            destination,
          },
        },
        logPrefix,
      );
    } else {
      await executeApi(
        'PutClassificationExportConfigurationCommand',
        {
          configuration: {
            destination,
          },
        },
        () =>
          client.send(
            new PutClassificationExportConfigurationCommand({
              configuration: {
                s3Destination: destination,
              },
            }),
          ),
        logger,
        logPrefix,
      );
    }
  }
}
