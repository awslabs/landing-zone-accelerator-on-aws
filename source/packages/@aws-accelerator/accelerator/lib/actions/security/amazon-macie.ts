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
 * @fileoverview Amazon Macie configuration module for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module provides Amazon Macie security service configuration capabilities for LZA including:
 * - Macie service enablement and configuration across AWS organization
 * - Delegated administrator account setup for centralized management
 * - S3 bucket classification and sensitive data discovery configuration
 * - Policy findings and sensitive data findings publishing configuration
 * - Regional deployment control and filtering
 *
 * Amazon Macie is a fully managed data security and data privacy service that uses machine learning
 * and pattern matching to discover and protect sensitive data in AWS. This module orchestrates
 * the deployment and configuration of Macie across multiple accounts and regions within an
 * AWS organization.
 *
 *
 * @example
 * ```typescript
 * // Configure Macie across the organization
 * const moduleParams: ModuleParams = {
 *   moduleItem: { name: 'amazon-macie' },
 *   runnerParameters: {
 *     sessionContext: { invokingAccountId: 'XXXXXXXXXXXX', region: 'us-east-1' },
 *     dryRun: false,
 *     solutionId: 'SO0199'
 *   },
 *   moduleRunnerParameters: {
 *     configs: {
 *       securityConfig: {
 *         centralSecurityServices: {
 *           macie: {
 *             enable: true,
 *             excludeRegions: ['us-west-1'],
 *             disabledRegions: [],
 *             policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
 *             publishSensitiveDataFindings: true,
 *             publishPolicyFindings: true
 *           }
 *         }
 *       }
 *     }
 *   }
 * };
 *
 * const result = await AmazonMacie.configure(moduleParams);
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/macie/latest/user/what-is-macie.html | Amazon Macie User Guide}
 * @see {@link https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/ | LZA Solution}
 */

import { IClassificationScopeExcludedBucketConfig } from '@aws-accelerator/config/lib/models/security-config';
import {
  configureMacie,
  createLogger,
  createStatusLogger,
  IMacieModuleRequest,
  IMacieModuleResponse,
  isMacieAvailableInPartition,
  IModuleResponse,
  MacieClassificationScopeUpdateOperation,
  MODULE_STATE_CODE,
} from 'aws-lza';
import path from 'node:path';
import { AcceleratorModules, ModuleParams } from '../../types';
import { extractSecurityServiceMetadata, loadOrganizationDataSources } from '../utils/common-config';
import { logModuleExecutionResult } from '../utils/module-logging';
import { hasModuleConfigChanged, saveModuleExecutionState } from '../utils/module-state';

/**
 * Macie configuration object for state comparison.
 * Contains only the fields relevant for detecting configuration changes.
 *
 * @interface IMacieConfigForState
 */
interface IMacieConfigForState {
  /** Whether Macie is enabled */
  readonly enable: boolean;
  /** Regions to exclude from Macie deployment */
  readonly excludedRegions: string[];
  /** Regions where Macie is explicitly disabled */
  readonly disabledRegions: string[];
  /** Frequency for publishing policy findings */
  readonly policyFindingsPublishingFrequency: string;
  /** Whether to publish sensitive data findings */
  readonly publishSensitiveDataFindings: boolean;
  /** Whether to publish policy findings */
  readonly publishPolicyFindings: boolean;
  /** Delegated administrator account ID */
  readonly delegatedAdminAccountId: string;
  /** Number of enabled regions */
  readonly enabledRegionsCount: number;
  /** Hash of sorted enabled regions for detecting region replacements */
  readonly enabledRegionsHash: string;
  /** Number of accounts */
  readonly accountsCount: number;
  /** Hash of sorted account IDs for detecting account replacements */
  readonly accountsHash: string;
  /** S3 destination configuration for findings */
  readonly s3Destination: {
    /** S3 bucket name for findings */
    readonly bucketName: string;
    /** KMS key ARN for encryption */
    readonly kmsKeyArn: string;
  };
  /** Whether automated sensitive data discovery is enabled */
  readonly automatedDiscoveryEnabled: boolean;
  /** S3 buckets excluded from classification scope */
  readonly classificationScopeExcludedBuckets: IClassificationScopeExcludedBucketConfig[];
}

/**
 * Amazon Macie configuration and management class for Landing Zone Accelerator.
 *
 * @description
 * This abstract class provides static methods for configuring Amazon Macie across an AWS organization.
 * It handles the orchestration of Macie deployment, including service enablement, delegated administrator
 * setup, and configuration of data classification and findings publishing.
 *
 * The class integrates with the LZA module system to provide centralized security service management
 * with support for:
 * - Multi-account and multi-region deployment
 * - Centralized logging and monitoring
 * - Configuration validation and error handling
 * - Dry-run capabilities for testing
 *
 * @abstract
 * @class AmazonMacie
 *
 * @example
 * ```typescript
 * // Basic Macie configuration
 * const params: ModuleParams = {
 *   moduleItem: { name: 'amazon-macie' },
 *   runnerParameters: {
 *     sessionContext: {
 *       invokingAccountId: 'XXXXXXXXXXXX',
 *       region: 'us-east-1'
 *     },
 *     dryRun: false
 *   },
 *   moduleRunnerParameters: {
 *     configs: {
 *       securityConfig: {
 *         centralSecurityServices: {
 *           macie: {
 *             enable: true,
 *             policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES'
 *           }
 *         }
 *       }
 *     },
 *     logging: {
 *       bucketName: 'security-logs-bucket',
 *       bucketKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/12345678-1234-1234-1234-123456789012'
 *     }
 *   }
 * };
 *
 * const response = await AmazonMacie.configure(params);
 * if (response.status === MODULE_STATE_CODE.COMPLETED) {
 *   // Macie configuration completed successfully
 * }
 * ```
 */
export abstract class AmazonMacie {
  /**
   * Status logger instance for tracking module execution status and progress.
   *
   * @private
   * @static
   * @readonly
   *
   * @description
   * Provides structured logging for module status updates, progress tracking,
   * and operational visibility. Uses the filename as the logger context for
   * easy identification in log aggregation systems.
   */
  private static readonly statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

  /**
   * General purpose logger instance for detailed operational logging.
   *
   * @private
   * @static
   * @readonly
   *
   * @description
   * Handles detailed logging of module operations, debug information,
   * and error details. Complements the status logger with more granular
   * operational information.
   */
  private static readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Validates required logging configuration parameters.
   *
   * @private
   * @static
   * @param {ModuleParams} params - Module configuration parameters
   * @param {string} logPrefix - Log prefix for consistent logging format
   * @throws {Error} When required logging bucket parameters are missing
   */
  private static validateConfiguration(params: ModuleParams, logPrefix: string): void {
    if (!params.moduleRunnerParameters.logging.bucketName || !params.moduleRunnerParameters.logging.bucketKeyArn) {
      const message = `Logging bucket name and key arn must be provided.`;
      AmazonMacie.statusLogger.error(message, logPrefix);
      throw new Error(message);
    }
  }

  /**
   * Extracts Macie configuration for state comparison.
   *
   * @description
   * Extracts relevant configuration fields from module parameters to create a normalized
   * configuration object for state comparison. This enables detection of configuration
   * changes between executions to avoid redundant operations.
   *
   * The extracted configuration includes:
   * - Service enablement status
   * - Regional filtering (excluded and disabled regions)
   * - Findings publishing configuration
   * - S3 destination configuration (Macie-specific)
   * - Common security service metadata (accounts, regions, delegated admin)
   *
   * Uses the extractSecurityServiceMetadata() utility to get common organizational
   * metadata (account/region counts and hashes, delegated admin) that all security
   * services need.
   *
   * @private
   * @static
   * @param {ModuleParams} params - Module configuration parameters
   * @returns {IMacieConfigForState} Normalized configuration object for state comparison
   *
   * @example
   * ```typescript
   * const config = AmazonMacie.extractMacieConfig(params);
   * // Returns:
   * // {
   * //   enable: true,
   * //   excludeRegions: ['us-west-1'],
   * //   disabledRegions: [],
   * //   policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
   * //   publishSensitiveDataFindings: true,
   * //   publishPolicyFindings: true,
   * //   s3Destination: {
   * //     bucketName: 'aws-accelerator-logs-XXXXXXXXXXXX-us-east-1',
   * //     kmsKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/...'
   * //   },
   * //   accountsCount: 5,
   * //   accountsHash: 'a1b2c3d4e5f6',
   * //   enabledRegionsCount: 3,
   * //   enabledRegionsHash: 'f6e5d4c3b2a1',
   * //   delegatedAdminAccountId: 'XXXXXXXXXXXX'
   * // }
   * ```
   */
  private static extractMacieConfig(params: ModuleParams): IMacieConfigForState {
    const macieConfig = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.macie!;

    // Extract common security service metadata (accounts, regions, delegated admin)
    const securityMetadata = extractSecurityServiceMetadata(params);

    const config: IMacieConfigForState = {
      enable: macieConfig.enable,
      excludedRegions: macieConfig.excludeRegions ?? [],
      disabledRegions: macieConfig.disabledRegions ?? [],
      policyFindingsPublishingFrequency: macieConfig.policyFindingsPublishingFrequency,
      publishSensitiveDataFindings: macieConfig.publishSensitiveDataFindings,
      publishPolicyFindings: macieConfig.publishPolicyFindings,
      s3Destination: {
        bucketName: params.moduleRunnerParameters.logging.bucketName!,
        kmsKeyArn: params.moduleRunnerParameters.logging.bucketKeyArn!,
      },
      automatedDiscoveryEnabled: macieConfig.automatedDiscoveryEnabled ?? true,
      classificationScopeExcludedBuckets: macieConfig.classificationScopeExcludedBuckets ?? [],
      ...securityMetadata,
    };
    AmazonMacie.logger.info(`Current macie config: ${JSON.stringify(config)}`);
    return config;
  }

  /**
   * Builds Macie module request for configuration.
   *
   * @private
   * @static
   * @async
   * @param {ModuleParams} params - Module configuration parameters
   * @param {string} logPrefix - Log prefix for consistent logging format
   * @returns {Promise<IMacieModuleRequest>} Macie module request object
   */
  private static async buildMacieRequest(params: ModuleParams, logPrefix: string): Promise<IMacieModuleRequest> {
    const macieConfig = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.macie!;

    // Load organizational data sources if enabled (uses common utility)
    const dataSources = await loadOrganizationDataSources(params, logPrefix);

    // Log loaded data sources summary
    AmazonMacie.logger.info(
      `Organization data sources loaded from ${dataSources?.organizations.tableName} table`,
      logPrefix,
    );

    return {
      ...params.runnerParameters.sessionContext,
      // Override invokingAccountId with the management account. In external deployments,
      // sessionContext.invokingAccountId is the pipeline account, but Macie operations
      // require the management account for Organizations API calls.
      invokingAccountId: params.moduleRunnerParameters.configs.accountsConfig.getManagementAccountId(),
      operation: 'setup',
      moduleName: params.moduleItem.name,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      sessionPolicy: params.moduleRunnerParameters.sessionPolicy,
      configuration: {
        accountAccessRoleName: params.moduleRunnerParameters.accountAccessRoleName,
        enable: macieConfig.enable,
        delegatedAdminAccountId: params.moduleRunnerParameters.configs.accountsConfig.getAccountId(
          params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.delegatedAdminAccount,
        ),
        policyFindingsPublishingFrequency: macieConfig.policyFindingsPublishingFrequency,
        publishSensitiveDataFindings: macieConfig.publishSensitiveDataFindings ?? false,
        publishPolicyFindings: macieConfig.publishPolicyFindings ?? true,
        s3Destination: {
          bucketName: params.moduleRunnerParameters.logging.bucketName!,
          kmsKeyArn: params.moduleRunnerParameters.logging.bucketKeyArn!,
          keyPrefix: 'macie',
        },
        automatedDiscoveryEnabled: macieConfig.automatedDiscoveryEnabled ?? true,
        classificationScopeExclusion: macieConfig.classificationScopeExcludedBuckets?.length
          ? {
              buckets: macieConfig.classificationScopeExcludedBuckets.flatMap(entry =>
                entry.names.map(name => ({ name, region: entry.region })),
              ),
              operation: MacieClassificationScopeUpdateOperation.REPLACE,
            }
          : undefined,
        regionFilters: {
          ignoredRegions: macieConfig.excludeRegions,
          disabledRegions: macieConfig.disabledRegions,
        },
        boundary: {
          regions: params.moduleRunnerParameters.configs.globalConfig.enabledRegions,
        },
        batchOperationSettings: process.env['MACIE_OPERATION_TIMEOUT']
          ? { operationTimeoutMs: Number(process.env['MACIE_OPERATION_TIMEOUT']) }
          : undefined,
        dataSources,
      },
    };
  }

  /**
   * Configures Amazon Macie across the AWS organization according to the provided parameters.
   *
   * @description
   * This method orchestrates the complete setup and configuration of Amazon Macie including:
   * - Service enablement validation and regional filtering
   * - Delegated administrator account configuration
   * - S3 destination setup for findings and logs
   * - Data source configuration for organizational context
   * - Policy and sensitive data findings publishing configuration
   *
   * The method performs comprehensive validation of input parameters and configuration
   * consistency before proceeding with the actual Macie setup. It supports both
   * dry-run mode for testing and full deployment mode for production use.
   *
   * @static
   * @async
   * @method configure
   *
   * @param {ModuleParams} params - Complete module configuration parameters
   * @param {Object} params.moduleItem - Module identification and metadata
   * @param {string} params.moduleItem.name - Name of the module being executed
   * @param {Object} params.runnerParameters - Runtime execution parameters
   * @param {Object} params.runnerParameters.sessionContext - AWS session context
   * @param {string} params.runnerParameters.sessionContext.invokingAccountId - Account ID initiating the operation
   * @param {string} params.runnerParameters.sessionContext.region - AWS region for the operation
   * @param {boolean} params.runnerParameters.dryRun - Whether to perform a dry run without actual changes
   * @param {string} params.runnerParameters.solutionId - Solution identifier for tracking and tagging
   * @param {Object} params.moduleRunnerParameters - Module-specific configuration parameters
   * @param {Object} params.moduleRunnerParameters.configs - Configuration objects
   * @param {Object} params.moduleRunnerParameters.configs.securityConfig - Security service configurations
   * @param {Object} params.moduleRunnerParameters.configs.accountsConfig - Account management configurations
   * @param {Object} params.moduleRunnerParameters.configs.globalConfig - Global LZA configurations
   * @param {Object} params.moduleRunnerParameters.logging - Logging configuration
   * @param {string} params.moduleRunnerParameters.logging.bucketName - S3 bucket name for logs and findings
   * @param {string} params.moduleRunnerParameters.logging.bucketKeyArn - KMS key ARN for log encryption
   *
   * @returns {Promise<IModuleResponse<IMacieModuleResponse>>} Module execution response with status and details
   * @returns {MODULE_STATE_CODE} returns.status - Execution status (COMPLETED, SKIPPED, FAILED)
   * @returns {string} returns.summary - Human-readable summary of the operation
   * @returns {string} returns.timestamp - ISO timestamp of completion
   * @returns {string} returns.moduleName - Name of the executed module
   * @returns {boolean} returns.dryRun - Whether this was a dry run execution
   *
   * @throws {Error} When required logging bucket parameters are missing
   * @throws {Error} When Macie is disabled but disabledRegions contains regions
   * @throws {Error} When required SSM parameters are not found
   * @throws {Error} When DynamoDB table configuration is invalid
   *
   * @example
   * ```typescript
   * // Configure Macie with full settings
   * const params: ModuleParams = {
   *   moduleItem: { name: 'amazon-macie' },
   *   runnerParameters: {
   *     sessionContext: {
   *       invokingAccountId: 'XXXXXXXXXXXX',
   *       region: 'us-east-1'
   *     },
   *     dryRun: false,
   *     solutionId: 'SO0199'
   *   },
   *   moduleRunnerParameters: {
   *     configs: {
   *       securityConfig: {
   *         centralSecurityServices: {
   *           macie: {
   *             enable: true,
   *             excludeRegions: ['us-west-1'],
   *             disabledRegions: [],
   *             policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
   *             publishSensitiveDataFindings: true,
   *             publishPolicyFindings: true
   *           }
   *         }
   *       },
   *       accountsConfig: {
   *         getAuditAccountId: () => 'XXXXXXXXXXXX',
   *         getManagementAccountId: () => 'XXXXXXXXXXXX'
   *       },
   *       globalConfig: {
   *         managementAccountAccessRole: 'AWSControlTowerExecution',
   *         enabledRegions: ['us-east-1', 'us-west-2']
   *       }
   *     },
   *     logging: {
   *       bucketName: 'aws-accelerator-logs-XXXXXXXXXXXX-us-east-1',
   *       bucketKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/12345678-1234-1234-1234-123456789012'
   *     },
   *     managementAccountCredentials: {
   *       accessKeyId: 'AKIA...',
   *       secretAccessKey: '...',
   *       sessionToken: '...'
   *     }
   *   }
   * };
   *
   * try {
   *   const result = await AmazonMacie.configure(params);
   *
   *   switch (result.status) {
   *     case MODULE_STATE_CODE.COMPLETED:
   *       // Macie successfully configured
   *       break;
   *     case MODULE_STATE_CODE.SKIPPED:
   *       // Macie not enabled in configuration
   *       break;
   *     case MODULE_STATE_CODE.FAILED:
   *       // Configuration failed, check logs
   *       break;
   *   }
   * } catch (error) {
   *   // Handle configuration errors
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Dry run example for testing configuration
   * const dryRunParams: ModuleParams = {
   *   ...params,
   *   runnerParameters: {
   *     ...params.runnerParameters,
   *     dryRun: true
   *   }
   * };
   *
   * const dryRunResult = await AmazonMacie.configure(dryRunParams);
   * // Review the dry run results before actual deployment
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/macie/latest/user/macie-organizations.html | Macie Organizations Integration}
   * @see {@link https://docs.aws.amazon.com/macie/latest/user/findings-publish-policy.html | Publishing Policy Findings}
   * @see {@link https://docs.aws.amazon.com/macie/latest/user/discovery-sensitive-data-findings.html | Sensitive Data Findings}
   */
  public static async configure(params: ModuleParams): Promise<IModuleResponse<IMacieModuleResponse>> {
    /**
     * Log prefix for consistent logging format across all operations.
     * Format: {invokingAccountId}:{region}
     */
    const logPrefix = `${params.runnerParameters.sessionContext.invokingAccountId}:${params.runnerParameters.sessionContext.region}`;

    // Log execution context
    AmazonMacie.logger.processStart(
      `Starting Macie module execution - dryRun: ${params.runnerParameters.dryRun}`,
      logPrefix,
    );

    // Early exit if retention module was skipped — custom resources are still managing Macie
    if (process.env['SKIP_STACK_RESOURCES_RETENTION_MODULE']?.toLowerCase() === 'true') {
      const message = `Skipping module ${params.moduleItem.name} as stack resources retention module is skipped. Macie custom resources remain active.`;
      AmazonMacie.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // Early exit if Macie is not enabled in the security configuration
    if (!params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.macie) {
      const message = `Skipping module ${params.moduleItem.name} as Macie is not enabled.`;
      AmazonMacie.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // Validate required logging configuration parameters
    this.validateConfiguration(params, logPrefix);

    const macieConfig = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.macie;

    // Extract current configuration for state comparison
    const currentConfig = this.extractMacieConfig(params);

    // Check if configuration has changed since last execution
    // NOTE: This throws on ANY state management error (table not found, permission denied, network errors, etc.)
    let configChanged: boolean;
    try {
      configChanged = await hasModuleConfigChanged(
        {
          serviceName: AcceleratorModules.MACIE,
          currentConfig,
          overrideExisting: macieConfig.overrideExisting,
        },
        params,
        logPrefix,
      );
    } catch (error: unknown) {
      // State management failure - fail-fast
      // ANY failure in state management (read/write/query) should stop the process
      const errorMessage = error instanceof Error ? error.message : 'Unknown state check error';
      AmazonMacie.statusLogger.error(`State management failure: ${errorMessage}`, logPrefix);

      const failedStatus = {
        status: MODULE_STATE_CODE.FAILED,
        summary: `State management failure: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
        error: {
          name: 'StateManagementError',
          message: errorMessage,
        },
      };

      logModuleExecutionResult(
        failedStatus,
        params.moduleItem.name,
        logPrefix,
        AmazonMacie.logger,
        AmazonMacie.statusLogger,
      );

      return failedStatus;
    }

    // Log configuration change detection result
    AmazonMacie.logger.info(
      `Config change check result: changed=${configChanged}, overrideExisting=${macieConfig.overrideExisting ?? false}`,
      logPrefix,
    );

    // Skip execution if configuration hasn't changed and not forcing run
    if (!configChanged) {
      const message = `Skipping module ${params.moduleItem.name} as configuration has not changed since last execution.`;
      AmazonMacie.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // ========================================
    // PARTITION AVAILABILITY CHECK
    // ========================================
    // In partitions where Macie is not available (e.g., GovCloud), skip the module
    const macieAvailable = await isMacieAvailableInPartition(
      {
        region: params.runnerParameters.sessionContext.globalRegion,
        solutionId: params.runnerParameters.solutionId,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
      },
      logPrefix,
    );

    if (!macieAvailable) {
      const message = `Skipping module ${params.moduleItem.name} as Amazon Macie is not available in this partition.`;
      AmazonMacie.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // ========================================
    // PHASE 1: Macie Configuration
    // ========================================
    AmazonMacie.statusLogger.processStart('Starting Macie configuration phase', logPrefix);

    // Build Macie module request
    const input = await this.buildMacieRequest(params, logPrefix);

    // Execute the Macie configuration operation
    const status = await configureMacie(input);

    AmazonMacie.statusLogger.processEnd('Macie configuration phase completed', logPrefix);

    // ========================================
    // PHASE 2: Save Execution State
    // ========================================
    // Save module execution state for future config change detection
    // State save failure is critical - without it, future config change detection will be broken
    try {
      AmazonMacie.statusLogger.processStart('Module execution state saved started', logPrefix);
      await saveModuleExecutionState(
        {
          serviceName: AcceleratorModules.MACIE,
          config: currentConfig,
          status: status.status,
          response: status,
          dryRun: params.runnerParameters.dryRun,
        },
        params,
        logPrefix,
      );
      AmazonMacie.logger.info(`Module response: ${JSON.stringify(status)}`, logPrefix);
      AmazonMacie.statusLogger.processEnd('Module execution state saved successfully', logPrefix);
    } catch (error: unknown) {
      // State save failed - this is a critical error for future executions
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AmazonMacie.statusLogger.error(`Module execution state save failed: ${errorMessage}`, logPrefix);

      const failedStatus = {
        status: MODULE_STATE_CODE.FAILED,
        summary: `Module execution state save failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
        error: {
          name: 'StateSaveError',
          message: errorMessage,
        },
      };

      logModuleExecutionResult(
        failedStatus,
        params.moduleItem.name,
        logPrefix,
        AmazonMacie.logger,
        AmazonMacie.statusLogger,
      );

      return failedStatus;
    }

    logModuleExecutionResult(status, params.moduleItem.name, logPrefix, AmazonMacie.logger, AmazonMacie.statusLogger);

    return status;
  }
}
