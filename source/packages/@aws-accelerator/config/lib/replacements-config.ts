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

import AWS from 'aws-sdk';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import * as Handlebars from 'handlebars';
import { AccountsConfig } from './accounts-config';

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import * as t from './common';
import * as i from './models/replacements-config';

const logger = createLogger(['replacements-config']);

export abstract class ParameterReplacementConfig implements i.IParameterReplacement {
  readonly key: string = '';
  readonly path: string = '';
}

export abstract class ParameterReplacementConfigV2 implements i.IParameterReplacementV2 {
  readonly key: string = '';
  readonly path: string = '';
  readonly type: t.ParameterReplacementType = 'SSM';
  readonly value: string | string[] | undefined = undefined;
}

export interface ReplacementsConfigProps {
  readonly region?: string;
}

export class ReplacementsConfig implements i.IReplacementsConfig {
  /**
   * Replacements configuration file name, this file must be present in accelerator config repository
   */
  public static readonly FILENAME = 'replacements-config.yaml';
  /**
   * The prefix that needs to be appended in the parameters used in policy files.
   *
   * For example, ${POLICY_PARAMETER_PREFIX}:ALLOWED_CORPORATE_CIDRS should be used in policy file
   * if ALLOWED_CORPORATE_CIDRS is defined in replacement-config.yaml
   */
  public static readonly POLICY_PARAMETER_PREFIX = 'ACCEL_LOOKUP::CUSTOM';

  readonly globalReplacements: (ParameterReplacementConfig | ParameterReplacementConfigV2)[] = [];

  readonly accountsConfig: AccountsConfig | undefined = undefined;

  placeholders: { [key: string]: string | string[] } = {};
  validateOnly = false;

  /**
   *
   * @param props
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(values?: i.IReplacementsConfig, accountsConfig?: AccountsConfig, validateOnly = false) {
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
    if (!fs.existsSync(path.join(dir, ReplacementsConfig.FILENAME))) return new ReplacementsConfig();

    const buffer = fs.readFileSync(path.join(dir, ReplacementsConfig.FILENAME), 'utf8');
    if (!yaml.load(buffer)) return new ReplacementsConfig();
    const values = t.parseReplacementsConfig(yaml.load(buffer));
    return new ReplacementsConfig(values, accountsConfig, validateOnly);
  }

  /**
   * Loads replacement values by utilizing the systems manager client
   * @param props {@link ReplacementsConfigProps}
   * @param orgsEnabled boolean
   * @param managementAccountCredentials {@link AWS.Credentials}
   */
  public async loadReplacementValues(
    props: ReplacementsConfigProps,
    orgsEnabled: boolean,
    managementAccountCredentials?: AWS.Credentials,
  ): Promise<void> {
    const errors: string[] = [];

    if (!this.validateOnly && orgsEnabled) {
      logger.info('Loading replacements config substitution values');
      const ssmClient = new AWS.SSM({ region: props.region, credentials: managementAccountCredentials });

      for (const item of this.globalReplacements) {
        if (item.path || (item as ParameterReplacementConfigV2).type === 'SSM') {
          try {
            logger.info(`Loading parameter at path ${item.path}`);
            const t = await throttlingBackOff(() => ssmClient.getParameter({ Name: item.path! }).promise());
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
        } else if ((item as ParameterReplacementConfigV2).value) {
          this.placeholders[item.key] = (item as ParameterReplacementConfigV2).value!;
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
    if (!this.validateOnly && this.accountsConfig) {
      // Register the 'account' helper function with Handlebars
      // only if 'validateOnly' is falsy and 'accountsConfig' is truthy
      Handlebars.registerHelper('account', accountName => {
        logger.debug(`Handlebars looking up account id for ${accountName}`);
        // Get the account ID by calling the 'getAccountId' method on 'accountsConfig'
        // with the provided 'accountName' if 'accountName' is truthy
        // Otherwise, 'accountId' will be falsy (undefined)
        const accountId = accountName && this.accountsConfig?.getAccountId(accountName);
        logger.debug(
          `Handlebars ${
            accountId
              ? `looking up account id for ${accountName}`
              : 'account helper triggered by an undefined accountName'
          }`,
        );
        // If 'accountId' is falsy, the function will implicitly return 'undefined'
        return accountId;
      });
    } else {
      Handlebars.registerHelper('account', accountName => {
        logger.debug(`Validating received account name ${accountName}, responding with generic account Id`);
        return '111122223333';
      });
    }

    Handlebars.registerHelper('helperMissing', function (context, options) {
      const tokenName = options?.name ?? context?.name;
      if (tokenName && tokenName !== 'account') {
        logger.warn(`Ignoring replacement ${tokenName} because it is not present in replacements-config.yaml`);
        return new Handlebars.SafeString(`{{${tokenName}}}`);
      }
      return;
    });

    // Replace instances of "{{resolve:" with "\{{resolve:" to ignore replacement behavior
    const dynamicRefRegex = /"{{resolve:/g;
    const escapedBuffer = initialBuffer.replace(dynamicRefRegex, '"\\{{resolve:');
    const template = Handlebars.compile(escapedBuffer);
    const output = template(this.placeholders);
    return output;
  }
}
