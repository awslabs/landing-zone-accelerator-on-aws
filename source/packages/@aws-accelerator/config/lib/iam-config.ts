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
 * Configuration items.
 */
export abstract class IamConfigTypes {
  static readonly User = t.interface({
    username: t.nonEmptyString,
    group: t.nonEmptyString,
    'boundary-policy': t.optional(t.nonEmptyString),
  });

  static readonly UserSet = t.interface({
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'exclude-accounts': t.optional(t.array(t.nonEmptyString)),
    'organizational-units': t.optional(t.array(t.nonEmptyString)),
    accounts: t.optional(t.array(t.nonEmptyString)),
    users: t.array(IamConfigTypes.User),
  });

  static readonly Policies = t.interface({
    'aws-managed': t.optional(t.array(t.nonEmptyString)),
    'customer-managed': t.optional(t.array(t.nonEmptyString)),
  });

  static readonly Group = t.interface({
    name: t.nonEmptyString,
    policies: t.optional(IamConfigTypes.Policies),
  });

  static readonly GroupSet = t.interface({
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'exclude-accounts': t.optional(t.array(t.nonEmptyString)),
    'organizational-units': t.optional(t.array(t.nonEmptyString)),
    accounts: t.optional(t.array(t.nonEmptyString)),
    groups: t.array(IamConfigTypes.Group),
  });

  static readonly AssumedBy = t.interface({
    type: t.enums('AssumedByType', ['service', 'account']),
    principal: t.optional(t.nonEmptyString),
  });

  static readonly Role = t.interface({
    name: t.nonEmptyString,
    'assumed-by': IamConfigTypes.AssumedBy,
    policies: t.optional(IamConfigTypes.Policies),
    'boundary-policy': t.optional(t.nonEmptyString),
  });

  static readonly RoleSet = t.interface({
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'exclude-accounts': t.optional(t.array(t.nonEmptyString)),
    'organizational-units': t.optional(t.array(t.nonEmptyString)),
    accounts: t.optional(t.array(t.nonEmptyString)),
    roles: t.array(IamConfigTypes.Role),
  });

  static readonly Policy = t.interface({
    name: t.nonEmptyString,
    policy: t.nonEmptyString,
  });

  static readonly PolicySet = t.interface({
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'exclude-accounts': t.optional(t.array(t.nonEmptyString)),
    'organizational-units': t.optional(t.array(t.nonEmptyString)),
    accounts: t.optional(t.array(t.nonEmptyString)),
    policies: t.array(IamConfigTypes.Policy),
  });
}

export const IamConfigType = t.interface({
  'policy-sets': t.array(IamConfigTypes.PolicySet),
  'role-sets': t.array(IamConfigTypes.RoleSet),
  'group-sets': t.array(IamConfigTypes.GroupSet),
  'user-sets': t.array(IamConfigTypes.UserSet),
});

export class IamConfig implements t.TypeOf<typeof IamConfigType> {
  static readonly FILENAME = 'iam-config.yaml';

  /**
   *
   */
  readonly 'policy-sets': [];

  /**
   *
   */
  readonly 'role-sets': [];

  /**
   *
   */
  readonly 'group-sets': [];

  /**
   *
   */
  readonly 'user-sets': [];

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof IamConfigType>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): IamConfig {
    const buffer = fs.readFileSync(path.join(dir, IamConfig.FILENAME), 'utf8');
    const values = t.parse(IamConfigType, yaml.load(buffer));
    return new IamConfig(values);
  }
}
