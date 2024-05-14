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

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import {
  ParameterReplacementConfigV2,
  ReplacementsConfig,
  ParameterReplacementConfig,
} from '../lib/replacements-config';
import { CustomizationsConfig } from '../lib/customizations-config';
import { AccountsConfig } from '../lib/accounts-config';
import { GlobalConfig } from '../lib/global-config';
import { SecurityConfig } from '../lib/security-config';
import { OrganizationConfig } from '../lib/organization-config';
import { NetworkConfig } from '../lib/network-config';
import { IamConfig } from '../lib/iam-config';

const fileNameList = [
  AccountsConfig.FILENAME,
  CustomizationsConfig.FILENAME,
  GlobalConfig.FILENAME,
  IamConfig.FILENAME,
  NetworkConfig.FILENAME,
  OrganizationConfig.FILENAME,
  SecurityConfig.FILENAME,
];
export class ReplacementsConfigValidator {
  constructor(values: ReplacementsConfig, configDir: string) {
    const errors: string[] = [];

    const logger = createLogger(['replacement-config-validator']);

    logger.info(`${ReplacementsConfig.FILENAME} file validation started`);

    //
    // Validate global replacements
    //
    this.validateGlobalReplacement(values, errors);

    //
    // Validate any instances of double-curly brackets in config files are deliberate
    //
    this.validateNoUnusedReplacements(values, configDir, errors);

    if (errors.length) {
      throw new Error(`${ReplacementsConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
  }

  /**
   * Function to validate global replacement
   * @param values
   */
  private validateGlobalReplacement(values: ReplacementsConfig, errors: string[]) {
    if (!values || !values.globalReplacements || values.globalReplacements.length === 0) {
      return;
    }

    for (const replacement of values.globalReplacements) {
      if ((replacement as ParameterReplacementConfigV2).type) {
        this.validateParameterReplacementConfigV2(replacement as ParameterReplacementConfigV2, errors);
      } else {
        this.validateParameterReplacementConfig(replacement, errors);
      }

      this.validateReplacementForKeywords(replacement, errors);
    }
  }

  private validateParameterReplacementConfig(replacement: ParameterReplacementConfig, errors: string[]) {
    if (!replacement.path) {
      errors.push(`Invalid replacement - no path specified for ${replacement.key}.`);
    }
  }

  private validateParameterReplacementConfigV2(replacementV2: ParameterReplacementConfigV2, errors: string[]) {
    if (replacementV2.type === 'SSM') {
      if (!replacementV2.path) {
        errors.push(`Invalid replacement - no path specified for SSM replacement: ${replacementV2.key}.`);
      }
      if (replacementV2.value) {
        errors.push(`Invalid replacement - value are not allowed for SSM replacement: ${replacementV2.key}.`);
      }
    } else if (replacementV2.type === 'String') {
      if (replacementV2.path) {
        errors.push(`Invalid replacement - path is not allowed for String replacement: ${replacementV2.key}.`);
      } else if (!replacementV2.value) {
        errors.push(`Invalid replacement - no String value specified for String replacement: ${replacementV2.key}.`);
      } else if (typeof replacementV2.value !== 'string') {
        errors.push(`Invalid replacement - value type is correct for String replacement: ${replacementV2.key}.`);
      }
    } else if (replacementV2.type === 'StringList') {
      if (replacementV2.path) {
        errors.push(`Invalid replacement - path is not allowed for StringList replacement: ${replacementV2.key}.`);
      } else if (!replacementV2.value || replacementV2.value.length === 0) {
        errors.push(
          `Invalid replacement - no StringList value specified for StringList replacement: ${replacementV2.key}.`,
        );
      }
    }
  }

  private validateReplacementForKeywords(replacement: ParameterReplacementConfig, errors: string[]) {
    if (replacement.key.toLowerCase().startsWith('resolve')) {
      errors.push(
        `Invalid replacement ${replacement.key} , replacement key cannot start with keyword "resolve". The keyword "resolve" is reserved for CloudFormation dynamic references.`,
      );
    }
  }

  /**
   * Function to validate all strings in the config files surrounded by double curly braces are using LZA lookups or SSM Dynamic references
   * @param values
   * @param configDir
   * @param errors
   */
  private validateNoUnusedReplacements(values: ReplacementsConfig, configDir: string, errors: string[]) {
    // Retrieve replacement keys defined explicitly in replacements-config.yaml
    const definedReplacementKeys = values.globalReplacements.map(replacement => replacement.key);

    for (const fileName of fileNameList) {
      if (
        fileName === CustomizationsConfig.FILENAME &&
        !fs.existsSync(path.join(configDir, CustomizationsConfig.FILENAME))
      ) {
        continue;
      } else {
        const replacementKeys = this.getReplacementKeysInFile(configDir, fileName);
        this.evaluateReplacementKeys(replacementKeys, definedReplacementKeys, errors);
      }
    }
  }

  /**
   * Function to evaluate that a replacement key meets one of the 3 criteria to be determined intentional
   * @param replacementKeys
   * @param definedReplacementKeys
   * @param errors
   */
  private evaluateReplacementKeys(replacementKeys: string[], definedReplacementKeys: string[], errors: string[]) {
    for (const key of replacementKeys) {
      if (definedReplacementKeys.includes(key)) {
        continue;
      } else if (key.startsWith('account')) {
        continue;
      } else if (key.startsWith('resolve:')) {
        continue;
      } else {
        errors.push(
          `Undefined replacement {{${key}}} found. Double-curly brackets are reserved for LZA lookups and SSM dynamic reference parameters.`,
        );
      }
    }
  }

  /**
   * Function to find instances of double curly braces in each config file
   * @param configDir
   * @param fileName
   */
  private getReplacementKeysInFile(configDir: string, fileName: string): string[] {
    const data = fs.readFileSync(path.join(configDir, fileName), 'utf-8');
    const replacements = data.match(/{{[\w\s\d]*}}/g) ?? [];
    const replacementKeys = replacements.map(key => this.trimCurlyBraces(key));
    return replacementKeys;
  }

  /**
   * Function to remove double curly braces from a string
   * @param replacementString
   */
  private trimCurlyBraces(replacementString: string) {
    return replacementString.replace('{{', '').replace('}}', '').trim();
  }
}
