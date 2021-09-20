/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AWS Organizations configuration items.
 */
export class OrganizationTypes {
  /**
   *
   */
  static readonly Account = t.interface({
    'account-name': t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    email: t.nonEmptyString,
    'organizational-unit': t.nonEmptyString,
  });
  static readonly Accounts = t.record(t.nonEmptyString, this.Account);

  /**
   * Defines Organizational Unit (OU) information, utilized in organization.config.
   *
   * - description: (optional) Describes the purpose of the OU
   * - service-control-policies: A list of SCPs to apply to the OU
   *
   * Example usage in organization.config:
   * ```
   * organizational-units:
   *   core-ou:
   *     description: Contains the core accelerator accounts
   *     service-control-policies:
   *       - "Accelerator-Common-SCP"
   * ```
   */
  static readonly OrganizationalUnit = t.interface({
    description: t.optional(t.nonEmptyString),
    'service-control-policies': t.array(t.nonEmptyString),
  });

  /**
   *  A Record of `OrganizationTypes.OrganizationalUnit`.
   *
   * @see OrganizationTypes.OrganizationalUnit
   */
  static readonly OrganizationalUnits = t.record(t.nonEmptyString, this.OrganizationalUnit);

  /**
   * Defines Service Control Policy (SCP) information, utilized in
   * organization.config.
   *
   * - description: Describes the purpose of the SCP
   * - name: Name to apply to the SCP object in AWS Organizations
   * - policy: Name of the policy file to associate with the SCP. Policy files
   * are located in the accelerator-config repository.
   *
   * Example usage in organization.config:
   *
   * ```
   * service-control-policies:
   *   accelerator-common-scp:
   *     description: Common SCP to apply to all OUs
   *     name: Accelerator-Common-SCP
   *     policy: Accelerator-Common-SCP.json
   * ```
   */
  static readonly ServiceControlPolicy = t.interface({
    description: t.nonEmptyString,
    name: t.nonEmptyString,
    policy: t.nonEmptyString,
  });

  /**
   * A Record of `OrganizationTypes.ServiceControlPolicy`.
   *
   * @see OrganizationTypes.ServiceControlPolicy
   */
  static readonly ServiceControlPolicies = t.record(t.nonEmptyString, this.ServiceControlPolicy);
}

export const ORGANIZATION_CONFIG_FILE = 'organization.config';

/**
 * @see OrganizationConfig
 */
export const OrganizationConfigType = t.interface({
  accounts: OrganizationTypes.Accounts,
  'enabled-regions': t.array(t.nonEmptyString),
  'organizational-units': OrganizationTypes.OrganizationalUnits,
  'service-control-policies': OrganizationTypes.ServiceControlPolicies,
});

/**
 * Defines the organizations.config
 *
 *
 * Example usage in organization.config:
 *
 * ```
 * service-control-policies:
 *   accelerator-common-scp:
 *     description: Common SCP to apply to all OUs
 *     name: Accelerator-Common-SCP
 *     policy: Accelerator-Common-SCP.json
 * organizational-units:
 *   core-ou:
 *     description: Contains the core accelerator accounts
 *     service-control-policies:
 *       - "Accelerator-Common-SCP"
 * ```
 */
export class OrganizationConfig implements t.TypeOf<typeof OrganizationConfigType> {
  readonly 'accounts': t.TypeOf<typeof OrganizationTypes.Accounts> = {};

  readonly 'enabled-regions' = [];

  /**
   * A Record of Organizational Unit configurations
   *
   * @see OrganizationTypes.OrganizationalUnits
   */
  readonly 'organizational-units': t.TypeOf<typeof OrganizationTypes.OrganizationalUnits> = {};
  /**
   * A Record of Service Control Policy configurations
   *
   * @see OrganizationTypes.ServiceControlPolicies
   */
  readonly 'service-control-policies': t.TypeOf<typeof OrganizationTypes.ServiceControlPolicies> = {};

  constructor(values?: t.TypeOf<typeof OrganizationConfigType>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  static fromBuffer(content: Buffer): OrganizationConfig {
    return this.fromString(content.toString());
  }

  static fromString(content: string): OrganizationConfig {
    return this.fromObject(JSON.parse(content));
  }

  static fromObject<S>(content: S): OrganizationConfig {
    const values = t.parse(OrganizationConfigType, content);
    return new OrganizationConfig(values);
  }
}

export async function loadOrganizationConfig(dir: string): Promise<OrganizationConfig> {
  const buffer = fs.readFileSync(path.join(dir, ORGANIZATION_CONFIG_FILE), 'utf8');
  return OrganizationConfig.fromString(buffer);
}

// export async function loadConfigurationFile(path: string): OrganizationConfig
