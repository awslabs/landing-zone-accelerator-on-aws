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

import { setupControlTowerLandingZone } from '../../../executors/accelerator-control-tower';
import {
  ISetupLandingZoneConfiguration,
  ISetupLandingZoneHandlerParameter,
} from '../../../interfaces/control-tower/setup-landing-zone';
import {
  CliCommandDetailsType,
  CliCommonOptions,
  CliExecutionParameterType,
  CommandOptionsType,
  ConfigurationObjectType,
  getConfig,
  ModuleDetailsType,
} from './root';

/**
 * Common options for each control-tower module commands
 */
const ControlTowerCommonOptions: CommandOptionsType[] = [
  ...CliCommonOptions,
  {
    configuration: {
      alias: 'c',
      type: 'string',
      description: 'Path to configuration file (file://configuration.json) or configuration as a JSON string',
      required: true,
    },
  },
  {
    partition: {
      alias: 'p',
      type: 'string',
      description: 'AWS Partition',
      required: true,
    },
  },
  {
    region: {
      alias: 'r',
      type: 'string',
      description: 'AWS Region',
      required: true,
    },
  },
];

const execute = async (param: CliExecutionParameterType) => ControlTowerCommand.executeCommand(param);
/**
 * List of control-tower module commands that are supported by the LZA CLI
 */
const ControlTowerCommands: Record<string, CliCommandDetailsType> = {
  'create-landing-zone': {
    description: 'Deploy AWS Control Tower Landing zone',
    options: ControlTowerCommonOptions,
    execute,
  },
  'update-landing-zone': {
    description: 'Update existing Landing zone configuration',
    options: ControlTowerCommonOptions,
    execute,
  },
  'reset-landing-zone': {
    description: 'Reset Landing zone to initial state',
    options: ControlTowerCommonOptions,
    execute,
  },
};

/**
 * control-tower module details
 */
export const LZA_CONTROL_TOWER_MODULE: ModuleDetailsType = {
  name: 'control-tower',
  description: 'Manage AWS Control Tower Landing zone operations',
  commands: ControlTowerCommands,
};

export class ControlTowerCommand {
  /**
   * Runs control tower commands
   *
   * @param param {@link CliExecutionParameterType}
   * @returns
   */
  public static async executeCommand(param: CliExecutionParameterType): Promise<string> {
    return setupControlTowerLandingZone(ControlTowerCommand.getParams(param));
  }

  /**
   * Parses arguments and extracts necessary data into Setup Landing Zone Handler Parameter
   *
   * @param param {@link CliExecutionParameterType}
   * @returns {@link ISetupLandingZoneHandlerParameter}
   */
  public static getParams(param: CliExecutionParameterType): ISetupLandingZoneHandlerParameter {
    if (typeof param.args['configuration'] !== 'string') {
      console.error('An error occurred (MissingRequiredParameters): The configuration parameter is a required string');
      process.exit(1);
    }
    if (typeof param.args['partition'] !== 'string') {
      console.error('An error occurred (MissingRequiredParameters): The partition parameter is a required string');
      process.exit(1);
    }
    if (typeof param.args['region'] !== 'string') {
      console.error('An error occurred (MissingRequiredParameters): The region parameter is a required string');
      process.exit(1);
    }

    const config = getConfig(param.args['configuration']);
    if (!ControlTowerCommand.validConfig(config)) {
      process.exit(1);
    }

    return {
      operation: param.commandName,
      partition: param.args['partition'] as string,
      region: param.args['region'] as string,
      dryRun: param.args['dryRun'] as boolean,
      configuration: config,
    };
  }

  /**
   * Validates if a mapping matches the Setup Landing Zone Configuration interface
   *
   * @param config {@link ConfigurationObjectType}
   * @returns {@link IMacieManageOrganizationAdminConfiguration}
   */
  public static validConfig(config: ConfigurationObjectType): config is ISetupLandingZoneConfiguration {
    if (typeof config['version'] !== 'string') {
      console.error('Error (ConfigValidation): config.version must be a string');
      return false;
    }

    if (!Array.isArray(config['enabledRegions'])) {
      console.error('Error (ConfigValidation): config.enabledRegions must be an array');
      return false;
    }

    // Validate logging
    if (typeof config['logging'] !== 'object') {
      console.error('Error (ConfigValidation): config.logging must be an object');
      return false;
    }

    if (typeof config['logging']['organizationTrail'] !== 'boolean') {
      console.error('Error (ConfigValidation): config.logging.organizationTrail must be a boolean');
      return false;
    }

    if (typeof config['logging']['retention'] !== 'object') {
      console.error('Error (ConfigValidation): config.logging.retention must be an object');
      return false;
    }

    if (typeof config['logging']['retention']['loggingBucket'] !== 'number') {
      console.error('Error (ConfigValidation): config.logging.retention.loggingBucket must be a number');
      return false;
    }

    if (typeof config['logging']['retention']['accessLoggingBucket'] !== 'number') {
      console.error('Error (ConfigValidation): config.logging.retention.accessLoggingBucket must be a number');
      return false;
    }

    // Validate security
    if (typeof config['security'] !== 'object') {
      console.error('Error (ConfigValidation): config.security must be an object');
      return false;
    }

    if (typeof config['security']['enableIdentityCenterAccess'] !== 'boolean') {
      console.error('Error (ConfigValidation): config.security.enableIdentityCenterAccess must be a boolean');
      return false;
    }

    // Validate sharedAccounts
    if (typeof config['sharedAccounts'] !== 'object') {
      console.error('Error (ConfigValidation): config.sharedAccounts must be an object');
      return false;
    }

    for (const account of ['management', 'logging', 'audit']) {
      if (typeof config['sharedAccounts'][account] !== 'object') {
        console.error(`Error (ConfigValidation): config.sharedAccounts.${account} must be an object`);
        return false;
      }

      if (typeof config['sharedAccounts'][account]['name'] !== 'string') {
        console.error(`Error (ConfigValidation): config.sharedAccounts.${account}.name must be a string`);
        return false;
      }

      if (typeof config['sharedAccounts'][account]['email'] !== 'string') {
        console.error(`Error (ConfigValidation): config.sharedAccounts.${account}.email must be a string`);
        return false;
      }
    }
    return true;
  }
}
