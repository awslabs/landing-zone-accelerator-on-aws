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
 * @fileoverview Configuration loader module for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module provides comprehensive configuration loading capabilities for LZA including:
 * - Configuration directory validation and mandatory file checking
 * - Multi-configuration type loading (accounts, global, network, security, etc.)
 * - Account ID resolution and organizational unit mapping
 * - Dynamic replacement processing and external resource mapping
 * - Credential management for cross-account operations
 * - Integration with AWS Organizations for account discovery
 *
 * The ConfigLoader serves as the central orchestrator for loading and validating all
 * LZA configuration files, ensuring they are properly structured and contain all
 * required information for successful accelerator deployment.
 *
 * @example
 * ```typescript
 * // Load all accelerator configurations
 * const configs = await ConfigLoader.getAcceleratorConfigurations(
 *   'aws',
 *   './config',
 *   resourcePrefixes,
 *   false,
 *   managementCredentials
 * );
 *
 * // Access specific configurations
 * const accountsConfig = configs.accountsConfig;
 * const globalConfig = configs.globalConfig;
 * const securityConfig = configs.securityConfig;
 * ```
 *
 * @example
 * ```typescript
 * // Validate configuration directory
 * try {
 *   ConfigLoader.validateConfigDirPath('./config');
 *   // Directory is valid, proceed with loading
 * } catch (error) {
 *   // Handle missing directory or files
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Load accounts configuration with resolved account IDs
 * const accountsConfig = await ConfigLoader.getAccountsConfigWithAccountIds(
 *   './config',
 *   'aws',
 *   true, // Organizations enabled
 *   false, // Don't load from DynamoDB
 *   managementCredentials
 * );
 * ```
 *
 * @see {@link https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/ | LZA Configuration Reference}
 */

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
  setConfigValidationMode,
} from '@aws-accelerator/config';

import { IAssumeRoleCredential } from 'aws-lza';
import * as fs from 'fs';
import { AcceleratorResourcePrefixes } from '../utils/app-utils';
import { AcceleratorConfigurationsType } from './types';

/**
 * Configuration loader class for Landing Zone Accelerator on AWS.
 *
 * @description
 * This abstract class provides static methods for loading, validating, and processing
 * all LZA configuration files. It serves as the central orchestrator for configuration
 * management, handling complex interdependencies between different configuration types
 * and ensuring all required data is properly loaded and validated.
 *
 * The class handles:
 * - Directory and file validation
 * - Account ID resolution through AWS Organizations
 * - Dynamic replacement processing
 * - External resource mapping
 * - Cross-account credential management
 * - Configuration interdependency resolution
 *
 * @abstract
 * @class ConfigLoader
 *
 * @example
 * ```typescript
 * // Complete configuration loading workflow
 * try {
 *   // First validate the configuration directory
 *   ConfigLoader.validateConfigDirPath('./accelerator-config');
 *
 *   // Load all configurations with account resolution
 *   const configs = await ConfigLoader.getAcceleratorConfigurations(
 *     'aws',
 *     './accelerator-config',
 *     resourcePrefixes,
 *     false, // loadOrganizationsFromDynamoDbTable
 *     managementAccountCredentials
 *   );
 *
 *   // Use the loaded configurations
 *   const enabledRegions = configs.globalConfig.enabledRegions;
 *   const securityServices = configs.securityConfig.centralSecurityServices;
 *   const networkConfig = configs.networkConfig;
 * } catch (error) {
 *   // Handle configuration loading errors
 * }
 * ```
 */
export abstract class ConfigLoader {
  /**
   * Validates the configuration directory path and ensures all mandatory configuration files are present.
   *
   * @description
   * This method performs comprehensive validation of the LZA configuration directory including:
   * - Directory existence verification
   * - Mandatory configuration file presence checking
   * - File accessibility validation
   *
   * The method checks for all required LZA configuration files that must be present
   * for successful accelerator deployment. Missing any mandatory file will result
   * in an error being thrown with details about which files are missing.
   *
   * @static
   * @method validateConfigDirPath
   *
   * @param {string} configDirPath - Absolute or relative path to the configuration directory
   *
   * @throws {Error} When the configuration directory path does not exist
   * @throws {Error} When one or more mandatory configuration files are missing
   *
   * @example
   * ```typescript
   * // Validate configuration directory before loading
   * try {
   *   ConfigLoader.validateConfigDirPath('./config');
   *   // Directory is valid, proceed with configuration loading
   * } catch (error) {
   *   if (error.message.includes('not found')) {
   *     // Handle missing directory
   *   } else if (error.message.includes('Missing mandatory')) {
   *     // Handle missing configuration files
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Validate different directory paths
   * const configPaths = [
   *   './environments/dev/config',
   *   './environments/prod/config',
   *   '/absolute/path/to/config'
   * ];
   *
   * for (const path of configPaths) {
   *   try {
   *     ConfigLoader.validateConfigDirPath(path);
   *   } catch (error) {
   *     // Log validation errors for each environment
   *   }
   * }
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/configuration-file-reference.html | LZA Configuration Files}
   */
  public static validateConfigDirPath(configDirPath: string): void {
    // Check if the configuration directory exists
    if (!fs.existsSync(configDirPath)) {
      throw new Error(`Invalid config directory path !!! "${configDirPath}" not found`);
    }

    /**
     * List of mandatory configuration files that must be present in the config directory.
     * These files are essential for LZA operation and deployment.
     */
    const mandatoryConfigFiles: string[] = [
      'accounts-config.yaml',
      'global-config.yaml',
      'iam-config.yaml',
      'network-config.yaml',
      'organization-config.yaml',
      'security-config.yaml',
    ];

    // Read directory contents and check for missing mandatory files
    const files = fs.readdirSync(configDirPath);
    const missingFiles = mandatoryConfigFiles.filter(item => !files.includes(item));

    if (missingFiles.length > 0) {
      throw new Error(
        `Missing mandatory configuration files in ${configDirPath}. \n Missing files are ${missingFiles.join(',')}`,
      );
    }
  }

  /**
   * Loads the accounts configuration with resolved account IDs from AWS Organizations.
   *
   * @description
   * This method loads the accounts configuration and resolves actual AWS account IDs
   * by integrating with AWS Organizations (when enabled) or using configured account IDs.
   * It handles both organizational and standalone account configurations, ensuring
   * all account references are properly resolved for deployment operations.
   *
   * The method supports loading account information from multiple sources:
   * - AWS Organizations API (when orgsEnabled is true)
   * - DynamoDB table (when loadOrganizationsFromDynamoDbTable is true)
   * - Static configuration files
   *
   * @static
   * @async
   * @method getAccountsConfigWithAccountIds
   *
   * @param {string} configDirPath - Path to the configuration directory containing accounts-config.yaml
   * @param {string} partition - AWS partition (aws, aws-cn, aws-us-gov)
   * @param {boolean} orgsEnabled - Whether AWS Organizations integration is enabled
   * @param {boolean} loadOrganizationsFromDynamoDbTable - Whether to load organization data from DynamoDB
   * @param {IAssumeRoleCredential} [managementAccountCredentials] - Optional credentials for cross-account operations
   *
   * @returns {Promise<AccountsConfig>} Promise resolving to the accounts configuration with resolved account IDs
   *
   * @throws {Error} When the accounts configuration file is invalid or missing
   * @throws {Error} When account ID resolution fails due to insufficient permissions
   * @throws {Error} When AWS Organizations integration fails
   *
   * @example
   * ```typescript
   * // Load accounts config with Organizations integration
   * const accountsConfig = await ConfigLoader.getAccountsConfigWithAccountIds(
   *   './config',
   *   'aws',
   *   true, // Organizations enabled
   *   false, // Don't load from DynamoDB
   *   {
   *     accessKeyId: 'AKIA...',
   *     secretAccessKey: '...',
   *     sessionToken: '...',
   *     region: 'us-east-1'
   *   }
   * );
   *
   * // Access resolved account information
   * const managementAccountId = accountsConfig.getManagementAccountId();
   * const auditAccountId = accountsConfig.getAuditAccountId();
   * const allAccounts = accountsConfig.accounts;
   * ```
   *
   * @example
   * ```typescript
   * // Load accounts config without Organizations (standalone accounts)
   * const accountsConfig = await ConfigLoader.getAccountsConfigWithAccountIds(
   *   './config',
   *   'aws',
   *   false, // Organizations disabled
   *   false, // Don't load from DynamoDB
   *   undefined // No cross-account credentials needed
   * );
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts.html | Managing AWS Organizations Accounts}
   */
  public static async getAccountsConfigWithAccountIds(
    configDirPath: string,
    partition: string,
    orgsEnabled: boolean,
    loadOrganizationsFromDynamoDbTable: boolean,
    managementAccountCredentials?: IAssumeRoleCredential,
  ): Promise<AccountsConfig> {
    // Load the base accounts configuration from the YAML file
    const accountsConfig = AccountsConfig.load(configDirPath);

    // Read the concurrent execution guard flag from the raw global config, which is available
    // before replacements are resolved
    const failOnConcurrentExecution =
      GlobalConfig.loadRawGlobalConfig(configDirPath).acceleratorSettings?.failOnConcurrentExecution ?? false;

    // Resolve account IDs through Organizations integration or static configuration
    await accountsConfig.loadAccountIds(
      partition,
      false,
      orgsEnabled,
      accountsConfig,
      managementAccountCredentials,
      loadOrganizationsFromDynamoDbTable,
      failOnConcurrentExecution,
    );

    return accountsConfig;
  }

  /**
   * Loads and processes all accelerator configurations with full dependency resolution.
   *
   * @description
   * This is the primary method for loading all LZA configurations in the correct order
   * with proper dependency resolution. It orchestrates the loading of all configuration
   * types while handling complex interdependencies, dynamic replacements, and external
   * resource mappings.
   *
   * The method performs the following operations in sequence:
   * 1. Validates the configuration directory structure
   * 2. Loads home region and organization settings
   * 3. Resolves account IDs through Organizations integration
   * 4. Processes dynamic replacements and variable substitutions
   * 5. Loads all configuration types with proper dependency order
   * 6. Handles external landing zone resource mappings
   * 7. Resolves organizational unit IDs and hierarchies
   *
   * Configuration Loading Order:
   * - Global Config (determines home region and basic settings)
   * - Organization Config (provides organizational structure)
   * - Accounts Config (with resolved account IDs)
   * - Replacements Config (for dynamic variable substitution)
   * - Network, Security, IAM, and Customizations Configs
   *
   * @static
   * @async
   * @method getAcceleratorConfigurations
   *
   * @param {string} partition - AWS partition identifier (aws, aws-cn, aws-us-gov)
   * @param {string} configDirPath - Path to the directory containing all configuration files
   * @param {AcceleratorResourcePrefixes} resourcePrefixes - Resource naming prefixes for the accelerator
   * @param {boolean} loadOrganizationsFromDynamoDbTable - Whether to load organization data from DynamoDB
   * @param {IAssumeRoleCredential} [managementAccountCredentials] - Optional credentials for cross-account operations
   *
   * @returns {Promise<AcceleratorConfigurationsType>} Promise resolving to all loaded and processed configurations
   * @returns {AccountsConfig} returns.accountsConfig - Accounts configuration with resolved IDs
   * @returns {CustomizationsConfig} returns.customizationsConfig - Custom resource configurations
   * @returns {GlobalConfig} returns.globalConfig - Global accelerator settings
   * @returns {IamConfig} returns.iamConfig - IAM policies, roles, and permissions
   * @returns {NetworkConfig} returns.networkConfig - VPC, subnet, and networking configurations
   * @returns {OrganizationConfig} returns.organizationConfig - AWS Organizations structure
   * @returns {ReplacementsConfig} returns.replacementsConfig - Dynamic variable replacements
   * @returns {SecurityConfig} returns.securityConfig - Security service configurations
   *
   * @throws {Error} When configuration directory validation fails
   * @throws {Error} When mandatory configuration files are missing or invalid
   * @throws {Error} When account ID resolution fails
   * @throws {Error} When organizational unit ID resolution fails
   * @throws {Error} When external resource mapping fails
   * @throws {Error} When dynamic replacement processing fails
   *
   * @example
   * ```typescript
   * // Complete configuration loading for production deployment
   * const resourcePrefixes = new AcceleratorResourcePrefixes({
   *   acceleratorName: 'LZA',
   *   acceleratorPrefix: 'AWSAccelerator'
   * });
   *
   * const managementCredentials = {
   *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
   *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
   *   sessionToken: process.env.AWS_SESSION_TOKEN,
   *   region: 'us-east-1'
   * };
   *
   * try {
   *   const configs = await ConfigLoader.getAcceleratorConfigurations(
   *     'aws',
   *     './accelerator-config',
   *     resourcePrefixes,
   *     false, // Load from Organizations API, not DynamoDB
   *     managementCredentials
   *   );
   *
   *   // Use the loaded configurations
   *   const enabledRegions = configs.globalConfig.enabledRegions;
   *   const managementAccountId = configs.accountsConfig.getManagementAccountId();
   *   const securityServices = configs.securityConfig.centralSecurityServices;
   *
   *   // Deploy resources using the configurations
   *   await deployAcceleratorResources(configs);
   * } catch (error) {
   *   // Handle configuration loading errors
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Configuration loading for development/testing
   * const configs = await ConfigLoader.getAcceleratorConfigurations(
   *   'aws',
   *   './test-config',
   *   resourcePrefixes,
   *   true, // Load from DynamoDB for testing
   *   undefined // No cross-account credentials for local testing
   * );
   *
   * // Validate configuration completeness
   * const requiredConfigs = [
   *   configs.accountsConfig,
   *   configs.globalConfig,
   *   configs.networkConfig,
   *   configs.securityConfig
   * ];
   *
   * for (const config of requiredConfigs) {
   *   if (!config) {
   *     throw new Error('Required configuration is missing');
   *   }
   * }
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/configuration-file-reference.html | LZA Configuration Reference}
   * @see {@link https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_org.html | Managing AWS Organizations}
   */
  public static async getAcceleratorConfigurations(
    partition: string,
    configDirPath: string,
    resourcePrefixes: AcceleratorResourcePrefixes,
    loadOrganizationsFromDynamoDbTable: boolean,
    managementAccountCredentials?: IAssumeRoleCredential,
  ): Promise<AcceleratorConfigurationsType> {
    //
    // Validate config directory path
    //
    ConfigLoader.validateConfigDirPath(configDirPath);

    //
    // Get home region
    //
    const rawGlobalConfig = GlobalConfig.loadRawGlobalConfig(configDirPath);
    const homeRegion = rawGlobalConfig.homeRegion;

    //
    // Apply the configuration validation mode (off | warn | strict) before
    // loading and validating the remaining configuration files.
    //
    setConfigValidationMode(rawGlobalConfig.configurationValidationMode ?? 'off');

    //
    // Get Org enable flag
    //
    const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(configDirPath).enable;

    //
    // Get accounts config
    //
    const accountsConfig = await ConfigLoader.getAccountsConfigWithAccountIds(
      configDirPath,
      partition,
      orgsEnabled,
      loadOrganizationsFromDynamoDbTable,
      managementAccountCredentials,
    );

    //
    // Get replacement config
    //
    const replacementsConfig = ReplacementsConfig.load(configDirPath, accountsConfig);
    await replacementsConfig.loadDynamicReplacements(homeRegion, managementAccountCredentials);

    //
    // Get Global config
    //
    const globalConfig = GlobalConfig.load(configDirPath, replacementsConfig);

    //
    // Get Organization config
    //
    const organizationConfig = OrganizationConfig.load(configDirPath, replacementsConfig);
    await organizationConfig.loadOrganizationalUnitIds(partition, managementAccountCredentials);

    //
    // Load global config external mapping details
    //
    if (globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources) {
      await globalConfig.loadExternalMapping(accountsConfig);
      await globalConfig.loadLzaResources(partition, resourcePrefixes.ssmParamName);
    }

    //
    // Get Network config
    //
    const networkConfig = NetworkConfig.load(configDirPath, replacementsConfig);

    //
    // Get Security config
    //
    const securityConfig = SecurityConfig.load(configDirPath, replacementsConfig);

    //
    // Get IAM config
    //
    const iamConfig = IamConfig.load(configDirPath, replacementsConfig);

    //
    // Get Customization config
    //
    let customizationsConfig = new CustomizationsConfig();

    if (fs.existsSync(`${configDirPath}/${CustomizationsConfig.FILENAME}`)) {
      customizationsConfig = CustomizationsConfig.load(configDirPath, replacementsConfig);
    }

    return {
      accountsConfig,
      customizationsConfig,
      globalConfig,
      iamConfig,
      networkConfig,
      organizationConfig,
      replacementsConfig,
      securityConfig,
    };
  }
}
