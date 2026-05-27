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
 * EC2 Image Block Public Access configuration
 */
export interface IManageImageBlockPublicAccessConfiguration {
  /**
   * Flag indicating if public AMI sharing should be blocked
   */
  readonly enable: boolean;
}

/**
 * EC2 Image Block Public Access module handler parameter
 */
export interface IManageImageBlockPublicAccessHandlerParameter extends IModuleCommonParameter {
  configuration: IManageImageBlockPublicAccessConfiguration;
}

/**
 * EC2 Image Block Public Access Module interface
 */
export interface IManageImageBlockPublicAccessModule {
  handler(props: IManageImageBlockPublicAccessHandlerParameter): Promise<string>;
}
