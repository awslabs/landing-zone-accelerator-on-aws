/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import AWS from 'aws-sdk';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import * as Handlebars from 'handlebars';
import { AccountsConfig } from './accounts-config';

import { createLogger, throttlingBackOff } from '@aws-accelerator/utils';

import * as t from './common-types';

const logger = createLogger(['replacements-config']);

/**
 * Replacements configuration items.
 */
export class ReplacementsConfigTypes {
  static readonly parameterReplacement = t.interface({
    key: t.nonEmptyString,
    path: t.nonEmptyString,
  });

  static readonly replacementsConfig = t.interface({
    globalReplacements: t.optional(t.array(this.parameterReplacement)),
  });
}

/**
 * *{@link ReplacementsConfig} / {@link ParameterReplacementConfig}*
 *
 * Fixed replacement value to apply throughout config files. Loaded from SSM
 * parameters in the management account in the HOME_REGION.
 *
 * @remarks These SSM Parameters must exist with non-null values before they are added to the replacements-config.yaml file.
 *
 * @example
 * ```
 * globalReplacements:
 *   - key: FndPrefix
 *     path: /accelerator/replacements/FndPrefix
 *   - key: BudgetEmail
 *     value: /accelerator/replacements/BudgetEmail
 *   - key: ProtectTagKey
 *     value: /accelerator/replacements/ProtectTagKey
 *   - key: ProtectTagValue
 *     value: /accelerator/replacements/ProtectTagValue
 * ```
 */
export abstract class ParameterReplacementConfig
  implements t.TypeOf<typeof ReplacementsConfigTypes.parameterReplacement>
{
  /**
   * Key of the replacement placeholder
   */
  readonly key: string = '';
  /**
   * Path of the SSM Parameter containing the value to replace
   */
  readonly path: string = '';
}

export interface ReplacementsConfigProps {
  readonly region?: string;
}

/**
 * Accelerator replacements configuration
 */
export class ReplacementsConfig implements t.TypeOf<typeof ReplacementsConfigTypes.replacementsConfig> {
  /**
   * Replacements configuration file name, this file must be present in accelerator config repository
   */
  public static readonly FILENAME = 'replacements-config.yaml';

  /**
   * The set of placeholder parameters (key/path pairs) that will be merged with yaml configuration files.
   */
  readonly globalReplacements: ParameterReplacementConfig[] = [];

  readonly accountsConfig: AccountsConfig | undefined = undefined;

  placeholders: { [key: string]: string } = {};
  validateOnly = false;

  /**
   *
   * @param props
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(
    values?: t.TypeOf<typeof ReplacementsConfigTypes.replacementsConfig>,
    accountsConfig?: AccountsConfig,
    validateOnly = false,
  ) {
    this.accountsConfig = accountsConfig;
    this.validateOnly = validateOnly;

    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Load from config file content
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string, accountsConfig: AccountsConfig, validateOnly = false): ReplacementsConfig {
    const buffer = fs.readFileSync(path.join(dir, ReplacementsConfig.FILENAME), 'utf8');
    const values = t.parse(ReplacementsConfigTypes.replacementsConfig, yaml.load(buffer));
    return new ReplacementsConfig(values, accountsConfig, validateOnly);
  }

  /**
   * Loads replacement values by utilizing the systems manager client
   */
  public async loadReplacementValues(props: ReplacementsConfigProps): Promise<void> {
    const errors: string[] = [];

    if (!this.validateOnly) {
      logger.info('Loading replacements config substitution values');
      const ssmClient = new AWS.SSM({ region: props.region });

      for (const item of this.globalReplacements) {
        try {
          logger.info(`Loading parameter at path ${item.path}`);
          const t = await throttlingBackOff(() => ssmClient.getParameter({ Name: item.path }).promise());
          const parameterValue = t.Parameter!.Value;
          if (parameterValue === undefined) {
            logger.error(`Invalid parameter value for ${item.path}`);
            errors.push(`Invalid parameter value for ${item.path}`);
          } else {
            this.placeholders[item.key] = parameterValue;
          }
        } catch (e) {
          logger.error(`Message [${e}] for path [${item.path}]`);
          errors.push(`Message [${e}] for path [${item.path}]`);
        }
      }

      if (errors.length) {
        throw new Error(`${ReplacementsConfig.FILENAME} has has ${errors.length} issues: ${errors.join(' ')}`);
      }
    } else {
      for (const item of this.globalReplacements) {
        logger.debug(`Loading replacement for validation purposes => ${item.key} - ${item.path} `);
        this.placeholders[item.key] = item.key;
      }
    }

    if (this.accountsConfig) {
      [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts].forEach(item => {
        logger.debug(`Adding account ${item.name}`);
        this.placeholders[item.name] = item.name;
      });
    }
  }

  public preProcessBuffer(initialBuffer: string): string {
    if (!this.validateOnly) {
      if (this.accountsConfig) {
        Handlebars.registerHelper('account', accountName => {
          return this.accountsConfig?.getAccountId(accountName);
        });
      }
    } else {
      Handlebars.registerHelper('account', accountName => {
        logger.info(`Validating received account name ${accountName}, responding with generic account Id`);
        return '111122223333';
      });
    }

    const template = Handlebars.compile(initialBuffer);
    const output = template(this.placeholders);
    return output;
  }
}
