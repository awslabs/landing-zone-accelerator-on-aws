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
 * @fileoverview AWS Control Tower CLI Command Handler - Processes Control Tower CLI commands and configuration
 *
 * Provides command handling and configuration validation for AWS Control Tower CLI operations.
 * Handles parameter parsing, landing zone configuration validation, and execution coordination
 * for Control Tower setup and management.
 *
 * Key capabilities:
 * - CLI parameter parsing and validation
 * - Control Tower configuration schema validation
 * - Landing zone setup parameter management
 * - Error handling and user feedback
 * - Integration with Control Tower executor operations
 */

import { setupControlTowerLandingZone } from '../../../executors/accelerator-control-tower';

import {
  ISetupLandingZoneConfiguration,
  ISetupLandingZoneHandlerParameter,
} from '../../../interfaces/control-tower/setup-landing-zone';
import {
  CliExecutionParameterType,
  ConfigurationObjectType,
  getConfig,
  getSessionDetailsFromArgs,
  logError,
  logErrorAndExit,
} from './root';

/**
 * Abstract command handler class for AWS Control Tower CLI operations
 */
export abstract class ControlTowerCommand {
  /**
   * Executes the Control Tower setup command with validated parameters
   * @param param - CLI execution parameters
   * @returns Promise resolving to execution result string
   */
  public static async execute(param: CliExecutionParameterType): Promise<string> {
    const input = await ControlTowerCommand.getParams(param);
    return await setupControlTowerLandingZone(input);
  }

  /**
   * Parses and validates CLI parameters to create Control Tower setup request
   * @param param - CLI execution parameters
   * @returns Promise resolving to validated Control Tower setup parameters
   */
  public static async getParams(param: CliExecutionParameterType): Promise<ISetupLandingZoneHandlerParameter> {
    if (typeof param.args['configuration'] !== 'string') {
      logErrorAndExit(
        'An error occurred (MissingRequiredParameters): The configuration parameter is a required string',
      );
      process.exit(1);
    }

    const config = getConfig(param.args['configuration']);
    if (!ControlTowerCommand.validConfig(config)) {
      process.exit(1);
    }

    // Get current session details
    const currentSessionDetails = await getSessionDetailsFromArgs(param);

    return {
      ...currentSessionDetails,
      moduleName: param.moduleName,
      operation: param.commandName,
      dryRun: param.args['dry-run'] as boolean,
      configuration: config,
      ssmParamPrefix: '/accelerator/control-tower',
    };
  }

  /**
   * Validates Control Tower configuration object against required schema
   * @param config - Configuration object to validate
   * @returns Type guard indicating if config is valid ISetupLandingZoneConfiguration
   */
  public static validConfig(config: ConfigurationObjectType): config is ISetupLandingZoneConfiguration {
    if (typeof config['version'] !== 'string') {
      logError('(ConfigValidation): config.version must be a string');
      return false;
    }

    if (!Array.isArray(config['enabledRegions'])) {
      logError('(ConfigValidation): config.enabledRegions must be an array');
      return false;
    }

    // Validate logging configuration
    if (typeof config['logging'] !== 'object') {
      logError('(ConfigValidation): config.logging must be an object');
      return false;
    }

    if (typeof config['logging']['organizationTrail'] !== 'boolean') {
      logError('(ConfigValidation): config.logging.organizationTrail must be a boolean');
      return false;
    }

    if (typeof config['logging']['retention'] !== 'object') {
      logError('(ConfigValidation): config.logging.retention must be an object');
      return false;
    }

    if (typeof config['logging']['retention']['loggingBucket'] !== 'number') {
      logError('(ConfigValidation): config.logging.retention.loggingBucket must be a number');
      return false;
    }

    if (typeof config['logging']['retention']['accessLoggingBucket'] !== 'number') {
      logError('(ConfigValidation): config.logging.retention.accessLoggingBucket must be a number');
      return false;
    }

    // Validate security configuration
    if (typeof config['security'] !== 'object') {
      logError('(ConfigValidation): config.security must be an object');
      return false;
    }

    if (typeof config['security']['enableIdentityCenterAccess'] !== 'boolean') {
      logError('(ConfigValidation): config.security.enableIdentityCenterAccess must be a boolean');
      return false;
    }

    // Validate shared accounts configuration
    if (typeof config['sharedAccounts'] !== 'object') {
      logError('(ConfigValidation): config.sharedAccounts must be an object');
      return false;
    }

    for (const account of ['management', 'logging', 'audit']) {
      if (typeof config['sharedAccounts'][account] !== 'object') {
        logError(`(ConfigValidation): config.sharedAccounts.${account} must be an object`);
        return false;
      }

      if (typeof config['sharedAccounts'][account]['name'] !== 'string') {
        logError(`(ConfigValidation): config.sharedAccounts.${account}.name must be a string`);
        return false;
      }

      if (typeof config['sharedAccounts'][account]['email'] !== 'string') {
        logError(`(ConfigValidation): config.sharedAccounts.${account}.email must be a string`);
        return false;
      }
    }
    return true;
  }
}
