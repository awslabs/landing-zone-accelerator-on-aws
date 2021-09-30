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
import * as yaml from 'js-yaml';

/**
 * AWS Organizations configuration items.
 */
export abstract class OrganizationConfigTypes {
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
    name: t.nonEmptyString,
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
    type: t.enums('Type', ['aws-managed', 'customer-managed'], 'Value should be a Service Control Policy Type'),
  });

  /**
   * A Record of `OrganizationTypes.ServiceControlPolicy`.
   *
   * @see OrganizationTypes.ServiceControlPolicy
   */
  static readonly ServiceControlPolicies = t.record(t.nonEmptyString, this.ServiceControlPolicy);
}

/**
 * @see OrganizationConfig
 */
export const OrganizationConfigType = t.interface({
  'organizational-units': OrganizationConfigTypes.OrganizationalUnits,
  'service-control-policies': OrganizationConfigTypes.ServiceControlPolicies,
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
  static readonly FILENAME = 'organization-config.yaml';

  /**
   * A Record of Organizational Unit configurations
   *
   * @see OrganizationTypes.OrganizationalUnits
   */
  readonly 'organizational-units': t.TypeOf<typeof OrganizationConfigTypes.OrganizationalUnits> = {};
  /**
   * A Record of Service Control Policy configurations
   *
   * @see OrganizationTypes.ServiceControlPolicies
   */
  readonly 'service-control-policies': t.TypeOf<typeof OrganizationConfigTypes.ServiceControlPolicies> = {};

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof OrganizationConfigType>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): OrganizationConfig {
    const buffer = fs.readFileSync(path.join(dir, OrganizationConfig.FILENAME), 'utf8');
    const values = t.parse(OrganizationConfigType, yaml.load(buffer));
    return new OrganizationConfig(values);
  }
}
