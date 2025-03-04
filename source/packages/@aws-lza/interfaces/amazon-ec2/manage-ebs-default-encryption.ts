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

import { IModuleCommonParameter } from '../../common/resources';

/**
 * Amazon Elastic Block Store default encryption configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 *
 * ```
 * {
 *   enableDefaultEncryption: true,
 *   kmsKeyId: 'XXXXXXXXXXXXXX',
 * }
 * ```
 */
export interface IManageEbsDefaultEncryptionConfiguration {
  /**
   * Flag indicating if default encryption should be enabled
   */
  readonly enableDefaultEncryption: boolean;
  /**
   * The identifier of the KMS key to use for Amazon EBS encryption
   */
  readonly kmsKeyId?: string;
}

/**
 * Amazon Elastic Block Store default encryption module handler parameter
 */
export interface IManageEbsDefaultEncryptionHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @example
   * ```
   * {
   *   enableDefaultEncryption: true,
   *   kmsKeyId: 'XXXXXXXXXXXXXX',
   * }
   * ```
   */
  configuration: IManageEbsDefaultEncryptionConfiguration;
}
/**
 * Amazon Elastic Block Store default encryption Module interface
 *
 */
export interface IManageEbsDefaultEncryptionModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IManageEbsDefaultEncryptionHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IManageEbsDefaultEncryptionHandlerParameter): Promise<string>;
}
