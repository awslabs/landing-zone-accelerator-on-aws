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
 * @fileoverview CLI Command Registry - Central registry for all available CLI commands
 *
 * Provides centralized registration and organization of all available CLI commands
 * across different AWS services and modules. Defines the command structure hierarchy
 * and maps command verbs to their respective resource handlers.
 *
 * Key features:
 * - Hierarchical command organization (verb -> resource -> handler)
 * - Type-safe command structure definitions
 * - Centralized command discovery and routing
 * - Extensible architecture for new modules
 */

import { MacieCommands } from './amazon-macie';
import { ControlTowerCommands } from './aws-control-tower';
import { CliExecutionParameterType, CommandOptionsType } from '../handlers/root';
import { IModuleResponse } from '../../common/interfaces';

/**
 * Type definition for command structure hierarchy
 * @template T - Type of the command response data
 */
type CommandStructure<T = unknown> = {
  /** Description of the command verb */
  description: string;
  /** Map of resource names to their command definitions */
  resources: Record<
    string,
    {
      /** Description of the resource operation */
      description: string;
      /** Command-line options for the resource */
      options: CommandOptionsType[];
      /** Execution handler for the resource operation */
      execute: (param: CliExecutionParameterType) => Promise<string | IModuleResponse<T>>;
    }
  >;
};

/**
 * Central registry of all available CLI commands organized by verb and resource
 */
export const Commands: Record<string, CommandStructure> = {
  setup: {
    description: 'Setup and configure AWS services across organizations',
    resources: {
      macie: MacieCommands.setup,
      'control-tower': ControlTowerCommands.setup,
    },
  },
};
