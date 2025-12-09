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
 * @fileoverview Amazon Macie CLI Command Handler - Processes Macie CLI commands and configuration
 *
 * Provides command handling and configuration validation for Amazon Macie CLI operations.
 * Handles parameter parsing, configuration validation, and execution coordination for
 * Macie setup and management across AWS Organizations.
 *
 * Key capabilities:
 * - CLI parameter parsing and validation
 * - Macie configuration schema validation
 * - Session context management
 * - Error handling and user feedback
 * - Integration with Macie module operations
 */

import { configureMacie } from '../../../lib/amazon-macie/macie';

import { IMacieConfiguration, IMacieModuleRequest, IMacieModuleResponse } from '../../../lib/amazon-macie/interfaces';
import {
  CliExecutionParameterType,
  ConfigurationObjectType,
  getConfig,
  getSessionDetailsFromArgs,
  logError,
  logErrorAndExit,
} from './root';
import { IModuleResponse } from '../../common/interfaces';

/**
 * Abstract command handler class for Amazon Macie CLI operations
 */
export abstract class MacieCommand {
  /**
   * Executes the Macie configuration command with validated parameters
   * @param param - CLI execution parameters
   * @returns Promise resolving to Macie module response
   */
  public static async execute(param: CliExecutionParameterType): Promise<IModuleResponse<IMacieModuleResponse>> {
    return configureMacie(await MacieCommand.getParams(param));
  }

  /**
   * Parses and validates CLI parameters to create Macie module request
   * @param param - CLI execution parameters
   * @returns Promise resolving to validated Macie module request
   */
  public static async getParams(param: CliExecutionParameterType): Promise<IMacieModuleRequest> {
    if (typeof param.args['configuration'] !== 'string') {
      logErrorAndExit(
        'An error occurred (MissingRequiredParameters): The configuration parameter is a required string',
      );
    }

    const config = getConfig(param.args['configuration']);
    if (!MacieCommand.validConfig(config)) {
      process.exit(1);
    }

    // Get current session details
    const currentSessionDetails = await getSessionDetailsFromArgs(param);

    return {
      ...currentSessionDetails,
      moduleName: param.moduleName,
      operation: param.commandName,
      dryRun: param.args['dry-run'] as boolean,
      configuration: {
        accountAccessRoleName: config['accountAccessRoleName'],
        enable: config['enable'],
        delegatedAdminAccountId: config['delegatedAdminAccountId'],
        policyFindingsPublishingFrequency: config['policyFindingsPublishingFrequency'],
        publishSensitiveDataFindings: config['publishSensitiveDataFindings'],
        publishPolicyFindings: config['publishPolicyFindings'],
        s3Destination: config['s3Destination'],
        ...(config['regionFilters'] && { regionFilters: config['regionFilters'] }),
        ...(config['boundary'] && { boundary: config['boundary'] }),
        ...(config['dataSources'] && { dataSources: config['dataSources'] }),
      },
    };
  }

  /**
   * Validates Macie configuration object against required schema
   * @param config - Configuration object to validate
   * @returns Type guard indicating if config is valid IMacieConfiguration
   */
  public static validConfig(config: ConfigurationObjectType): config is IMacieConfiguration {
    if (typeof config['enable'] !== 'boolean') {
      logError('(ConfigValidation): config.enable must be a boolean');
      return false;
    }
    if (typeof config['accountAccessRoleName'] !== 'string') {
      logError('(ConfigValidation): config.accountAccessRoleName must be a string');
      return false;
    }
    if (typeof config['delegatedAdminAccountId'] !== 'string') {
      logError('(ConfigValidation): config.delegatedAdminAccountId must be a string');
      return false;
    }
    if (!MacieCommand.validateRegionFilterConfig(config)) {
      return false;
    }
    if (typeof config['policyFindingsPublishingFrequency'] !== 'string') {
      logError('(ConfigValidation): config.policyFindingsPublishingFrequency must be a string');
      return false;
    }
    if (typeof config['publishSensitiveDataFindings'] !== 'boolean') {
      logError('(ConfigValidation): config.publishSensitiveDataFindings must be a boolean');
      return false;
    }
    if (typeof config['publishPolicyFindings'] !== 'boolean') {
      logError('(ConfigValidation): config.publishPolicyFindings must be a boolean');
      return false;
    }
    if (typeof config['s3Destination'] !== 'object') {
      logError('(ConfigValidation): config.s3Destination must be an object');
      return false;
    }
    if (typeof config['s3Destination']['bucketName'] !== 'string') {
      logError('(ConfigValidation): config.s3Destination.bucketName must be a string');
      return false;
    }
    if (typeof config['s3Destination']['keyPrefix'] !== 'string') {
      logError('(ConfigValidation): config.s3Destination.keyPrefix must be a string');
      return false;
    }
    if (typeof config['s3Destination']['kmsKeyArn'] !== 'string') {
      logError('(ConfigValidation): config.s3Destination.kmsKeyArn must be a string');
      return false;
    }

    if (!MacieCommand.validateBoundaryConfig(config)) {
      return false;
    }
    if (!MacieCommand.validateDataSourcesConfig(config)) {
      return false;
    }
    return true;
  }

  /**
   * Validates boundary configuration section
   * @param config - Configuration object containing boundary settings
   * @returns Boolean indicating if boundary configuration is valid
   */
  private static validateBoundaryConfig(config: ConfigurationObjectType): boolean {
    if (config['boundary']) {
      if (typeof config['boundary'] !== 'object') {
        logError('(ConfigValidation): config.boundary must be an object');
        return false;
      }
      if (config['boundary']['regions'] && !Array.isArray(config['boundary']['regions'])) {
        logError('(ConfigValidation): config.boundary.regions must be an array');
        return false;
      }
    }
    return true;
  }

  /**
   * Validates data sources configuration section
   * @param config - Configuration object containing data sources settings
   * @returns Boolean indicating if data sources configuration is valid
   */
  private static validateDataSourcesConfig(config: ConfigurationObjectType): boolean {
    if (config['dataSources']) {
      if (typeof config['dataSources'] !== 'object') {
        logError('(ConfigValidation): config.dataSources must be an object');
        return false;
      }
      if (config['dataSources']['organizations']) {
        if (typeof config['dataSources']['organizations'] !== 'object') {
          logError('(ConfigValidation): config.dataSources.organizations must be an object');
          return false;
        }
        if (typeof config['dataSources']['organizations']['tableName'] !== 'string') {
          logError('(ConfigValidation): config.dataSources.organizations.tableName must be a string');
          return false;
        }
        if (
          config['dataSources']['organizations']['filters'] &&
          !Array.isArray(config['dataSources']['organizations']['filters'])
        ) {
          logError('(ConfigValidation): config.dataSources.organizations.filters must be an array');
          return false;
        }
        if (
          config['dataSources']['organizations']['filterOperator'] &&
          typeof config['dataSources']['organizations']['filterOperator'] !== 'string'
        ) {
          logError('(ConfigValidation): config.dataSources.organizations.filterOperator must be a string');
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Validates region filter configuration section
   * @param config - Configuration object containing region filter settings
   * @returns Boolean indicating if region filter configuration is valid
   */
  private static validateRegionFilterConfig(config: ConfigurationObjectType): boolean {
    if (config['regionFilters']) {
      if (typeof config['regionFilters'] !== 'object') {
        logError('(ConfigValidation): config.regionFilters must be an object');
        return false;
      }
      if (config['regionFilters']['ignoredRegions'] && !Array.isArray(config['regionFilters']['ignoredRegions'])) {
        logError('(ConfigValidation): config.regionFilters.ignoredRegions must be an array');
        return false;
      }
      if (config['regionFilters']['disabledRegions'] && !Array.isArray(config['regionFilters']['disabledRegions'])) {
        logError('(ConfigValidation): config.regionFilters.disabledRegions must be an array');
        return false;
      }
    }
    return true;
  }
}
