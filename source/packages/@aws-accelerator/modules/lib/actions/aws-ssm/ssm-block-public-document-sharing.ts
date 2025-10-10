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
import { createStatusLogger } from '../../../../../@aws-lza/common/logger';
import { ModuleParams } from '../../../models/types';
import { Account } from '@aws-sdk/client-organizations';
import { IAssumeRoleCredential } from '../../../../../@aws-lza/common/resources';
import { getCredentials } from '../../../../../@aws-lza/common/functions';

/**
 * Abstract class to manage SSM Block Public Document Sharing feature across organization accounts
 *
 * @description
 * This module manages the SSM Block Public Document Sharing feature across all organization accounts
 * in all enabled regions. It enables or disables the feature based on the security configuration,
 * handles account exclusions, and provides complete lifecycle management of the security setting.
 * The feature operates on a per-region basis, requiring execution in each enabled region.
 */
export abstract class SsmBlockPublicDocumentSharingModule {
  private static statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to execute SSM Block Public Document Sharing module across all enabled regions
   *
   * @description
   * This function manages SSM Block Public Document Sharing settings across all organization accounts
   * in all enabled regions based on the security configuration. It handles enabling/disabling the feature,
   * account exclusions, and executes independently in each enabled region.
   * The function provides complete lifecycle management of the SSM Block Public Document Sharing setting.
   *
   * @param params {@link ModuleParams} Module execution parameters including configuration and region context
   * @param stage Optional stage identifier for logging and tracking purposes
   * @returns Promise<string> Status string indicating execution results across all enabled regions
   */
  public static async execute(params: ModuleParams): Promise<string> {
    SsmBlockPublicDocumentSharingModule.statusLogger.info(
      `Module ${params.moduleItem.name} execution started on ${SsmBlockPublicDocumentSharingModule.formatDate(
        new Date(),
      )}`,
    );

    // Check if configuration is present
    const config =
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.ssmSettings
        ?.blockPublicDocumentSharing;
    if (!SsmBlockPublicDocumentSharingModule.isConfigurationPresent(config)) {
      const status = 'SSM Block Public Document Sharing configuration not present, skipping execution';
      SsmBlockPublicDocumentSharingModule.statusLogger.info(status);
      return status;
    }

    // Get all enabled regions from global configuration
    const enabledRegions = params.moduleRunnerParameters.configs.globalConfig.enabledRegions || [];
    if (enabledRegions.length === 0) {
      const status =
        'No enabled regions found in global configuration, skipping SSM Block Public Document Sharing execution';
      SsmBlockPublicDocumentSharingModule.statusLogger.info(status);
      return status;
    }

    SsmBlockPublicDocumentSharingModule.statusLogger.info(
      `Executing SSM Block Public Document Sharing across ${
        enabledRegions.length
      } enabled regions: ${enabledRegions.join(', ')}`,
    );

    SsmBlockPublicDocumentSharingModule.statusLogger.info(
      `SSM Block Public Document Sharing is configured. Feature enabled: ${config!.enable}`,
    );

    // Execute in all enabled regions
    const regionResults: string[] = [];
    let successfulRegions = 0;
    let failedRegions = 0;

    for (const region of enabledRegions) {
      try {
        SsmBlockPublicDocumentSharingModule.statusLogger.info(
          `Starting SSM Block Public Document Sharing execution in region: ${region}`,
        );

        // Create region-specific parameters
        const regionParams = {
          ...params,
          runnerParameters: {
            ...params.runnerParameters,
            region,
          },
        };

        const regionResult = await SsmBlockPublicDocumentSharingModule.executeAccountActions(regionParams);
        regionResults.push(`Region ${region}: ${regionResult}`);
        successfulRegions++;

        SsmBlockPublicDocumentSharingModule.statusLogger.info(
          `Completed SSM Block Public Document Sharing execution in region: ${region}`,
        );
      } catch (error) {
        const errorMessage = `Failed to execute SSM Block Public Document Sharing in region ${region}: ${error}`;
        SsmBlockPublicDocumentSharingModule.statusLogger.error(errorMessage);
        regionResults.push(`Region ${region}: ERROR - ${error}`);
        failedRegions++;
      }
    }

    // Log summary
    SsmBlockPublicDocumentSharingModule.statusLogger.info(
      `SSM Block Public Document Sharing execution completed across all regions: ${successfulRegions} successful, ${failedRegions} failed`,
    );

    SsmBlockPublicDocumentSharingModule.statusLogger.info(
      `Module ${params.moduleItem.name} execution completed on ${SsmBlockPublicDocumentSharingModule.formatDate(
        new Date(),
      )}`,
    );

    return regionResults.join('\n');
  }

  /**
   * Function to check if SSM Block Public Document Sharing configuration is present and valid
   *
   * @description
   * Validates that the SSM Block Public Document Sharing configuration is present in the security
   * configuration and contains the required 'enable' boolean property. Returns false if the
   * configuration is undefined, null, or missing required properties.
   *
   * @param config SSM Block Public Document Sharing configuration object or undefined
   * @returns boolean indicating if configuration is present and contains valid structure
   */
  private static isConfigurationPresent(config: unknown): boolean {
    // Check if configuration is present and has the required enable property
    return config !== undefined && config !== null && typeof (config as { enable?: unknown }).enable === 'boolean';
  }

  /**
   * Function to execute account actions for SSM Block Public Document Sharing in the specified region
   *
   * @description
   * Orchestrates the execution of SSM Block Public Document Sharing operations across all
   * organization accounts in the specified region. Determines which accounts need the feature
   * enabled or disabled, executes operations in parallel, and provides comprehensive error
   * handling to continue processing even if individual accounts fail.
   *
   * @param params {@link ModuleParams} Module execution parameters including configuration and account list
   * @param stage Optional stage identifier for logging and tracking purposes
   * @returns Promise<string> Consolidated status string with results from all account operations in the specified region
   */
  private static async executeAccountActions(params: ModuleParams): Promise<string> {
    const config =
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.ssmSettings!
        .blockPublicDocumentSharing!;
    const allAccounts = params.moduleRunnerParameters.organizationAccounts;
    const excludeAccounts = config.excludeAccounts || [];
    const managementAccountAccessRole = params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole;

    // Determine which accounts need to be enabled or disabled
    const { enableAccounts, disableAccounts } = SsmBlockPublicDocumentSharingModule.determineAccountActions(
      allAccounts,
      excludeAccounts,
      config.enable,
    );

    const promises: Promise<string>[] = [];

    // Log the action plan
    if (enableAccounts.length > 0) {
      SsmBlockPublicDocumentSharingModule.statusLogger.info(
        `Accounts to enable SSM Block Public Document Sharing in region ${
          params.runnerParameters.region
        }: ${enableAccounts.map(acc => acc.Name).join(', ')}`,
      );
    }

    if (disableAccounts.length > 0) {
      SsmBlockPublicDocumentSharingModule.statusLogger.info(
        `Accounts to disable SSM Block Public Document Sharing in region ${
          params.runnerParameters.region
        }: ${disableAccounts.map(acc => acc.Name).join(', ')}`,
      );
    }

    // Create promises for accounts to enable
    for (const account of enableAccounts) {
      promises.push(
        SsmBlockPublicDocumentSharingModule.blockPublicDocumentSharing(
          account.Id!,
          account.Name!,
          params.runnerParameters.region,
          params.moduleRunnerParameters.managementAccountCredentials!,
          true,
          params.runnerParameters.solutionId,
          managementAccountAccessRole,
        ),
      );
    }

    // Create promises for accounts to disable
    for (const account of disableAccounts) {
      promises.push(
        SsmBlockPublicDocumentSharingModule.blockPublicDocumentSharing(
          account.Id!,
          account.Name!,
          params.runnerParameters.region,
          params.moduleRunnerParameters.managementAccountCredentials!,
          false,
          params.runnerParameters.solutionId,
          managementAccountAccessRole,
        ),
      );
    }

    // Execute all promises in parallel with error handling
    // Using Promise.allSettled to continue processing even if some accounts fail
    const results = await Promise.allSettled(promises);

    const statuses: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        statuses.push(result.value);
        if (!result.value.includes('ERROR')) {
          successCount++;
        } else {
          errorCount++;
        }
      } else {
        const errorMessage = `Promise rejected: ${result.reason}`;
        statuses.push(errorMessage);
        errorCount++;
        SsmBlockPublicDocumentSharingModule.statusLogger.error(errorMessage);
      }
    }

    // Log summary
    SsmBlockPublicDocumentSharingModule.statusLogger.info(
      `SSM Block Public Document Sharing management completed in region ${params.runnerParameters.region}: ${successCount} successful, ${errorCount} failed`,
    );

    return statuses.join('\n');
  }

  /**
   * Function to determine which accounts should have SSM Block Public Document Sharing enabled or disabled
   *
   * @description
   * Analyzes the organization accounts and configuration to determine which accounts need
   * SSM Block Public Document Sharing enabled or disabled. Handles account exclusions gracefully
   * and provides complete lifecycle management logic for the security feature.
   *
   * @param allAccounts All organization accounts to be processed
   * @param excludeAccounts Array of account names to exclude from SSM Block Public Document Sharing
   * @param featureEnabled Whether SSM Block Public Document Sharing is enabled in the security configuration
   * @returns Object containing separate arrays of accounts to enable and accounts to disable
   */
  private static determineAccountActions(
    allAccounts: Account[],
    excludeAccounts: string[],
    featureEnabled: boolean,
  ): { enableAccounts: Account[]; disableAccounts: Account[] } {
    const enableAccounts: Account[] = [];
    const disableAccounts: Account[] = [];

    // Create a set of excluded account names for efficient lookup
    // Handle duplicates gracefully by using Set
    const excludedAccountNamesSet = new Set(excludeAccounts || []);

    for (const account of allAccounts) {
      const accountName = account.Name || '';
      const isExcluded = excludedAccountNamesSet.has(accountName);

      if (featureEnabled && !isExcluded) {
        // Feature is enabled and account is not excluded -> enable
        enableAccounts.push(account);
      } else {
        // Feature is disabled OR account is excluded -> disable
        disableAccounts.push(account);
      }
    }

    SsmBlockPublicDocumentSharingModule.statusLogger.info(
      `Account action determination for SSM Block Public Document Sharing: ${enableAccounts.length} accounts to enable, ${disableAccounts.length} accounts to disable`,
    );

    return { enableAccounts, disableAccounts };
  }

  /**
   * Wrapper function for dynamic import to enable easier testing of SSM Block Public Document Sharing module
   *
   * @description
   * Provides a dynamic import wrapper for the SSM Block Public Document Sharing executor module
   * to enable easier unit testing through dependency injection and mocking.
   *
   * @returns Promise resolving to the imported SSM Block Public Document Sharing executor module
   */
  private static async importBlockPublicDocumentSharing(): Promise<{
    manageBlockPublicDocumentSharing: (params: {
      accountId: string;
      region: string;
      credentials: IAssumeRoleCredential;
      enable: boolean;
      solutionId: string;
    }) => Promise<string>;
  }> {
    return import('../../../../../@aws-lza/dist/executors/accelerator-aws-ssm.js');
  }

  /**
   * Function to manage SSM Block Public Document Sharing for a specific account in a specific region
   *
   * @description
   * Manages SSM Block Public Document Sharing for a single account in the specified region.
   * Handles credential management, cross-account access, and provides detailed error handling
   * with region-specific context. Returns success or error status without throwing exceptions
   * to allow continued processing of other accounts.
   *
   * @param accountId AWS Account ID where SSM Block Public Document Sharing will be managed
   * @param accountName AWS Account Name for logging and identification purposes
   * @param region AWS Region where the SSM Block Public Document Sharing operation will be performed
   * @param managementCredentials Management account credentials for cross-account access (unused in current implementation)
   * @param enable Whether to enable SSM Block Public Document Sharing (true) or disable it (false)
   * @param solutionId Solution ID for AWS SDK user agent identification
   * @param managementAccountAccessRole Role name for cross-account access to the target account
   * @param stage Optional stage identifier for logging and tracking purposes
   * @returns Promise<string> Status string indicating success or failure with region-specific context
   */
  private static async blockPublicDocumentSharing(
    accountId: string,
    accountName: string,
    region: string,
    _managementCredentials: IAssumeRoleCredential,
    enable: boolean,
    solutionId: string,
    managementAccountAccessRole: string,
  ): Promise<string> {
    try {
      SsmBlockPublicDocumentSharingModule.statusLogger.info(
        `${
          enable ? 'Enabling' : 'Disabling'
        } SSM Block Public Document Sharing for account ${accountName} (${accountId}) in region ${region}`,
      );

      // Get credentials for the target account
      const targetAccountCredentials = await getCredentials({
        accountId,
        region,
        solutionId,
        partition: 'aws', // Default partition
        assumeRoleName: managementAccountAccessRole,
      });

      if (!targetAccountCredentials) {
        throw new Error(`Failed to get credentials for account ${accountId}`);
      }

      // Use the executor implementation
      const { manageBlockPublicDocumentSharing } =
        await SsmBlockPublicDocumentSharingModule.importBlockPublicDocumentSharing();
      const result = await manageBlockPublicDocumentSharing({
        accountId,
        region,
        credentials: targetAccountCredentials,
        enable,
        solutionId,
      });

      SsmBlockPublicDocumentSharingModule.statusLogger.info(
        `Successfully managed SSM Block Public Document Sharing for account ${accountName} in region ${region}: ${result}`,
      );

      return `Account ${accountName} (${accountId}) in region ${region}: ${result}`;
    } catch (error) {
      const errorMessage = `Failed to manage SSM Block Public Document Sharing for account ${accountName} (${accountId}) in region ${region}: ${error}`;
      SsmBlockPublicDocumentSharingModule.statusLogger.error(errorMessage);

      // Return error message instead of throwing to allow other accounts to continue processing
      return `Account ${accountName} (${accountId}) in region ${region}: ERROR - ${error}`;
    }
  }

  /**
   * Function to format date for logging purposes
   *
   * @description
   * Formats a Date object into a standardized string format for consistent logging
   * throughout the SSM Block Public Document Sharing module execution.
   *
   * @param date {@link Date} Date object to be formatted
   * @returns string Formatted date string in ISO format without timezone suffix
   */
  private static formatDate(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, 23);
  }
}
