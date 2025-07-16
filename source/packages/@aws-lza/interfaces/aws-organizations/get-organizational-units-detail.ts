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

export interface IOrganizationalUnitDetailsType {
  /**
   * AWS Organization Id
   */
  organizationId: string;
  /**
   * Root id
   */
  rootId: string;
  /**
   * OU name
   */
  name: string;
  /**
   * OU Id
   */
  id: string;
  /**
   * OU Arn
   */
  arn: string;
  /**
   * Organizational unit hierarchy level
   */
  ouLevel: number;
  /**
   * Parent OU id
   */
  parentId: string;
  /**
   * Parent OU name
   */
  parentName: string;
  /**
   * OU complete path
   */
  completePath: string;
  /**
   * Parent OU complete path
   */
  parentCompletePath: string;
  /**
   * Flag indicating if the OU is registered with Control Tower
   */
  registeredwithControlTower: boolean;
}

/**
 * Get AWS Organizations organizational unit (OU) configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 * ```
 * {
 *   enableControlTower: true,
 * }
 * ```
 */
export interface IGetOrganizationalUnitsDetailConfiguration {
  /**
   * Flag indicating if Control Tower is enabled
   */
  enableControlTower: boolean;
}

/**
 * Get AWS Organizations organizational unit (OU) details handler parameter
 */
export interface IGetOrganizationalUnitsDetailHandlerParameter extends IModuleCommonParameter {
  /**
   * Get AWS Organizations organizational unit (OU) configuration
   *
   * @example
   * ```
   * {
   *   enableControlTower: true,
   * }
   * ```
   */
  configuration: IGetOrganizationalUnitsDetailConfiguration;
}

/**
 * AWS Organizations organizational unit (OU) details Module interface
 */
export interface IGetOrganizationalUnitsDetailModule {
  /**
   * Handler function to get AWS Organizational unit details
   *
   * @param props {@link IGetOrganizationalUnitsDetailHandlerParameter}
   * @returns status {@link IOrganizationalUnitDetailsType}[]
   *
   */
  handler(props: IGetOrganizationalUnitsDetailHandlerParameter): Promise<IOrganizationalUnitDetailsType[]>;
}
