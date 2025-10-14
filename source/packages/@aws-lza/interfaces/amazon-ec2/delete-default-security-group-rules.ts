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
 * Configuration for deleting default security group rules
 */
export interface IDeleteDefaultSecurityGroupRulesConfiguration {
  /**
   * VPC ID containing the default security group
   */
  vpcId: string;
}

/**
 * Parameter to handle deleting default security group rules
 */
export interface IDeleteDefaultSecurityGroupRulesParameter extends IModuleCommonParameter {
  /**
   * Parameter Configuration for deleting default security group rules
   */
  configuration: IDeleteDefaultSecurityGroupRulesConfiguration;
}

/**
 * Default security group rules deletion interface
 */
export interface IDeleteDefaultSecurityGroupRulesModule {
  /**
   * Handler function for deleting default security group rules
   *
   * @param props {@link IDeleteDefaultSecurityGroupModule}
   * @returns status string
   *
   */
  handler(props: IDeleteDefaultSecurityGroupRulesParameter): Promise<string>;
}
