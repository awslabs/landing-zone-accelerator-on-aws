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

import * as t from '../common/types';

/**
 * *{@link ReplacementsConfig} / {@link ParameterReplacementConfig}*
 *
 * @description
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
export interface IParameterReplacement {
  /**
   * Key of the replacement placeholder
   */
  readonly key: t.NonEmptyString;
  /**
   * Path of the SSM Parameter containing the value to replace
   */
  readonly path: t.NonEmptyString;
}

/**
 * *{@link ReplacementsConfig} / {@link ParameterReplacementConfig}*
 *
 * @description
 * Fixed replacement value to apply throughout config files. Loaded from SSM
 * parameters in the management account in the HOME_REGION.
 *
 * @remarks These SSM Parameters must exist with non-null values before they are added to the replacements-config.yaml file.
 *
 * @example
 * ```
 * globalReplacements:
 *   - key: FndPrefix
 *     type: 'SSM'
 *     path: /accelerator/replacements/FndPrefix
 *   - key: BudgetEmail
 *     type: 'SSM'
 *     path: /accelerator/replacements/BudgetEmail
 *   - key: ProtectTagKey
 *     type: 'SSM'
 *     path: /accelerator/replacements/ProtectTagKey
 *   - key: ProtectTagValue
 *     type: 'SSM'
 *     path: /accelerator/replacements/ProtectTagValue
 *  -  key: ALLOWED_CORPORATE_CIDRS
 *     type: 'StringList'
 *     value:
 *       - 10.0.1.0/24
 *       - 10.0.2.0/24
 *  -  key: ALLOWED_PRINCIPAL_ARN
 *     type: 'String'
 *     value: arn:aws:iam::*:role/AWSA*
 * ```
 */
export interface IParameterReplacementV2 {
  /**
   * Key of the replacement placeholder
   */
  readonly key: t.NonEmptyString;
  /**
   * Path of the SSM Parameter containing the value to replace
   */
  readonly path?: t.NonEmptyString;
  /**
   * Type of the global parameters
   * */
  readonly type: t.ParameterReplacementType;
  /**
   * Value of the parameter if type is string or array
   */
  readonly value?: t.NonEmptyString | t.NonEmptyString[];
}

/**
 * Accelerator replacements configuration
 */
export interface IReplacementsConfig {
  /**
   * The set of placeholder parameters (key/path pairs) that will be merged with yaml configuration files.
   */
  readonly globalReplacements?: (IParameterReplacement | IParameterReplacementV2)[];
}
