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

import { manageOrganizationAdmin } from '../../../executors/accelerator-macie';
import {
  IMacieManageOrganizationAdminConfiguration,
  IMacieManageOrganizationAdminParameter,
} from '../../../interfaces/macie/manage-organization-admin';
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
 * Common options for each macie module commands
 */
const MacieCommonOptions: CommandOptionsType[] = [
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

/**
 * List of macie module commands that are supported by the LZA CLI
 */
export const MacieCommands: Record<string, CliCommandDetailsType> = {
  'manage-organization-admin': {
    description: 'Manage Macie organization delegated admin',
    options: MacieCommonOptions,
    execute: async (param: CliExecutionParameterType) => ManageOrganizationAdminCommand.execute(param),
  },
};

/**
 * control-tower module details
 */
export const LZA_MACIE_MODULE: ModuleDetailsType = {
  name: 'macie',
  description: 'Manage AWS Macie operations',
  commands: MacieCommands,
};

export class ManageOrganizationAdminCommand {
  /**
   * Runs the manage organization admin command given arguments `param`
   *
   * @param param {@link CliExecutionParameterType}
   * @returns
   */
  public static async execute(param: CliExecutionParameterType): Promise<string> {
    return manageOrganizationAdmin(this.getParams(param));
  }

  /**
   * Parses arguments and extracts necessary data into Manage Organization Admin Parameter
   *
   * @param param {@link CliExecutionParameterType}
   * @returns {@link IMacieManageOrganizationAdminParameter}
   */
  public static getParams(param: CliExecutionParameterType): IMacieManageOrganizationAdminParameter {
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
    if (!this.validConfig(config)) {
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
   * Validates if a mapping matches the Manage Organization Admin Configuration interface
   *
   * @param config {@link ConfigurationObjectType}
   * @returns {@link IMacieManageOrganizationAdminConfiguration}
   */
  public static validConfig(config: ConfigurationObjectType): config is IMacieManageOrganizationAdminConfiguration {
    if (typeof config['enable'] !== 'boolean') {
      console.error('Error (ConfigValidation): config.enable must be a boolean');
      return false;
    }
    if (typeof config['accountId'] !== 'string') {
      console.error('Error (ConfigValidation): config.accountId must be a string');
      return false;
    }
    return true;
  }
}
