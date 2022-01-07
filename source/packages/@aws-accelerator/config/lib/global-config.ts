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
 * Global configuration items.
 */
export abstract class GlobalConfigTypes {
  static readonly controlTowerConfig = t.interface({
    enable: t.boolean,
  });

  static readonly cloudtrailConfig = t.interface({
    enable: t.boolean,
    organizationTrail: t.boolean,
  });

  static readonly loggingConfig = t.interface({
    account: t.nonEmptyString,
    cloudtrail: GlobalConfigTypes.cloudtrailConfig,
  });

  static readonly globalConfig = t.interface({
    homeRegion: t.nonEmptyString,
    enabledRegions: t.array(t.region),
    managementAccountAccessRole: t.nonEmptyString,
    controlTower: GlobalConfigTypes.controlTowerConfig,
    logging: GlobalConfigTypes.loggingConfig,
  });
}

export class ControlTowerConfig implements t.TypeOf<typeof GlobalConfigTypes.controlTowerConfig> {
  readonly enable = true;
}

export class CloudtrailConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudtrailConfig> {
  readonly enable = false;
  readonly organizationTrail = false;
}

export class LoggingConfig implements t.TypeOf<typeof GlobalConfigTypes.loggingConfig> {
  readonly account = 'Log Archive';
  readonly cloudtrail: CloudtrailConfig = new CloudtrailConfig();
}

export class GlobalConfig implements t.TypeOf<typeof GlobalConfigTypes.globalConfig> {
  static readonly FILENAME = 'global-config.yaml';

  readonly homeRegion = '';
  readonly enabledRegions = [];

  /**
   * This role trusts the management account, allowing users in the management
   * account to assume the role, as permitted by the management account
   * administrator. The role has administrator permissions in the new member
   * account.
   *
   * Examples:
   * - AWSControlTowerExecution
   * - OrganizationAccountAccessRole
   */
  readonly managementAccountAccessRole = 'AWSControlTowerExecution';

  readonly controlTower: ControlTowerConfig = new ControlTowerConfig();
  readonly logging: LoggingConfig = new LoggingConfig();

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof GlobalConfigTypes.globalConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): GlobalConfig {
    const buffer = fs.readFileSync(path.join(dir, GlobalConfig.FILENAME), 'utf8');
    const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(buffer));
    return new GlobalConfig(values);
  }
}
