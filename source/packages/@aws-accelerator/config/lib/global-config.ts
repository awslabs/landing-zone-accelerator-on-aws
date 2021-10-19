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
  static readonly ControlTowerConfig = t.interface({
    enable: t.boolean,
  });

  static readonly CloudtrailConfig = t.interface({
    enable: t.boolean,
    'organization-trail': t.boolean,
  });

  static readonly LoggingConfig = t.interface({
    account: t.nonEmptyString,
    cloudtrail: GlobalConfigTypes.CloudtrailConfig,
  });
}

/**
 * @see GlobalConfig
 */
export const GlobalConfigType = t.interface({
  'home-region': t.nonEmptyString,
  'enabled-regions': t.array(t.region),
  'control-tower': GlobalConfigTypes.ControlTowerConfig,
  logging: GlobalConfigTypes.LoggingConfig,
});

export class GlobalConfig implements t.TypeOf<typeof GlobalConfigType> {
  static readonly FILENAME = 'global-config.yaml';

  /**
   *
   */
  readonly 'home-region' = '';

  /**
   *
   */
  readonly 'enabled-regions' = [];

  readonly 'control-tower' = {
    enable: true,
  };

  readonly logging: t.TypeOf<typeof GlobalConfigTypes.LoggingConfig> = {
    account: 'log-archive',
    cloudtrail: {
      enable: true,
      'organization-trail': true,
    },
  };

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof GlobalConfigType>) {
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
    const values = t.parse(GlobalConfigType, yaml.load(buffer));
    return new GlobalConfig(values);
  }
}
