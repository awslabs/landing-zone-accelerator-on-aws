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

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import {
  ParameterReplacementConfigV2,
  ReplacementsConfig,
  ParameterReplacementConfig,
} from '../lib/replacements-config';

export class ReplacementsConfigValidator {
  constructor(values: ReplacementsConfig) {
    const errors: string[] = [];

    const logger = createLogger(['replacement-config-validator']);

    logger.info(`${ReplacementsConfig.FILENAME} file validation started`);

    //
    // Validate global replacements
    //
    this.validateGlobalReplacement(values, errors);

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
}
