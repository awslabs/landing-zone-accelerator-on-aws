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
 * SSM Block Public Document Sharing configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 *
 * ```
 * {
 *   enable: true,
 * }
 * ```
 */
export interface IBlockPublicDocumentSharingConfiguration {
  /**
   * Flag indicating if public document sharing should be blocked
   */
  readonly enable: boolean;
}

/**
 * SSM Block Public Document Sharing module handler parameter
 */
export interface IBlockPublicDocumentSharingHandlerParameter extends IModuleCommonParameter {
  /**
   * SSM Block Public Document Sharing configuration
   *
   * @example
   * ```
   * {
   *   enable: true,
   * }
   * ```
   */
  configuration: IBlockPublicDocumentSharingConfiguration;
}

/**
 * SSM Block Public Document Sharing Module interface
 */
export interface IBlockPublicDocumentSharingModule {
  /**
   * Handler function to manage SSM Block Public Document Sharing
   *
   * @param props {@link IBlockPublicDocumentSharingHandlerParameter}
   * @returns status string
   */
  handler(props: IBlockPublicDocumentSharingHandlerParameter): Promise<string>;
}
