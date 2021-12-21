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
export class IamConfigTypes {
  static readonly userConfig = t.interface({
    username: t.nonEmptyString,
    group: t.nonEmptyString,
    boundaryPolicy: t.optional(t.nonEmptyString),
  });

  static readonly userSetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    users: t.array(IamConfigTypes.userConfig),
  });

  static readonly policiesConfig = t.interface({
    awsManaged: t.optional(t.array(t.nonEmptyString)),
    customerManaged: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly groupConfig = t.interface({
    name: t.nonEmptyString,
    policies: t.optional(IamConfigTypes.policiesConfig),
  });

  static readonly groupSetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    groups: t.array(IamConfigTypes.groupConfig),
  });

  static readonly assumedByTypeEnum = t.enums('AssumedByConfigType', ['service', 'account']);

  static readonly assumedByConfig = t.interface({
    type: this.assumedByTypeEnum,
    principal: t.optional(t.nonEmptyString),
  });

  static readonly roleConfig = t.interface({
    name: t.nonEmptyString,
    assumedBy: IamConfigTypes.assumedByConfig,
    policies: t.optional(IamConfigTypes.policiesConfig),
    boundaryPolicy: t.optional(t.nonEmptyString),
  });

  static readonly roleSetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    roles: t.array(IamConfigTypes.roleConfig),
  });

  static readonly policyConfig = t.interface({
    name: t.nonEmptyString,
    policy: t.nonEmptyString,
  });

  static readonly policySetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    policies: t.array(IamConfigTypes.policyConfig),
  });

  static readonly iamConfig = t.interface({
    policySets: t.optional(t.array(IamConfigTypes.policySetConfig || [])),
    roleSets: t.optional(t.array(IamConfigTypes.roleSetConfig)),
    groupSets: t.optional(t.array(IamConfigTypes.groupSetConfig)),
    userSets: t.optional(t.array(IamConfigTypes.userSetConfig)),
  });
}

export class UserConfig implements t.TypeOf<typeof IamConfigTypes.userConfig> {
  readonly username: string = '';
  readonly boundaryPolicy: string = '';
  readonly group: string = '';
}

export class UserSetConfig implements t.TypeOf<typeof IamConfigTypes.userSetConfig> {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly users: UserConfig[] = [];
}

export class PoliciesConfig implements t.TypeOf<typeof IamConfigTypes.policiesConfig> {
  readonly awsManaged: string[] = [];
  readonly customerManaged: string[] = [];
}

export class GroupConfig implements t.TypeOf<typeof IamConfigTypes.groupConfig> {
  readonly name: string = '';
  readonly policies: PoliciesConfig | undefined = undefined;
}

export class GroupSetConfig implements t.TypeOf<typeof IamConfigTypes.groupSetConfig> {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly groups: GroupConfig[] = [];
}

export class AssumedByConfig implements t.TypeOf<typeof IamConfigTypes.assumedByConfig> {
  readonly principal: string = '';
  readonly type!: t.TypeOf<typeof IamConfigTypes.assumedByTypeEnum>;
}

export class RoleConfig implements t.TypeOf<typeof IamConfigTypes.roleConfig> {
  readonly assumedBy!: AssumedByConfig;
  readonly boundaryPolicy: string = '';
  readonly name: string = '';
  readonly policies: PoliciesConfig | undefined = undefined;
}

export class RoleSetConfig implements t.TypeOf<typeof IamConfigTypes.roleSetConfig> {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly roles: RoleConfig[] = [];
}

export class PolicyConfig implements t.TypeOf<typeof IamConfigTypes.policyConfig> {
  readonly name: string = '';
  readonly policy: string = '';
}

export class PolicySetConfig implements t.TypeOf<typeof IamConfigTypes.policySetConfig> {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly policies: PolicyConfig[] = [];
}

export class IamConfig implements t.TypeOf<typeof IamConfigTypes.iamConfig> {
  static readonly FILENAME = 'iam-config.yaml';

  /**
   *
   */

  readonly policySets: PolicySetConfig[] = [];

  /**
   *
   */

  readonly roleSets: RoleSetConfig[] = [];

  /**
   *
   */

  readonly groupSets: GroupSetConfig[] = [];

  /**
   *
   */
  readonly userSets: UserSetConfig[] = [];
  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof IamConfigTypes.iamConfig>) {
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
    const values = t.parse(IamConfigTypes.iamConfig, yaml.load(buffer));
    return new IamConfig(values);
  }
}
