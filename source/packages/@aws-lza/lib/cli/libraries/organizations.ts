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

import { CliCommandDetailsType, CommandOptionsType, ModuleDetailsType } from './root';

/**
 * organizations module details
 */
export const LZA_ORGANIZATIONS_MODULE: ModuleDetailsType = {
  name: 'organizations',
  description: 'Manage AWS Organizations operations',
};

/**
 * Common options for each organizations module commands
 */
const OrganizationsCommonOptions: CommandOptionsType[] = [
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
 * List of organizations module commands that are supported by the LZA CLI
 */
export const OrganizationsCommands: CliCommandDetailsType[] = [
  {
    name: 'create-scp',
    description: 'Create Service Control Policy',
    options: [
      ...OrganizationsCommonOptions,
      {
        configuration: {
          alias: 'c',
          type: 'string',
          description: 'Path to configuration file (file://configuration.json) or configuration as a JSON string',
          required: true,
        },
      },
      {
        name: {
          alias: 'n',
          type: 'string',
          description: 'Name of the SCP',
          required: true,
        },
      },
    ],
  },
  {
    name: 'create-ou',
    description: 'Create Organizational Unit',
    options: [
      ...OrganizationsCommonOptions,
      {
        name: {
          alias: 'n',
          type: 'string',
          description: 'Name of the OU',
          required: true,
        },
      },
      {
        parent: {
          type: 'string',
          description: 'Name of the parent OU',
          required: true,
        },
      },
    ],
  },
];
