/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/**
 * Defines the stages the accelerator supports. Each of the defined stages
 * correspond to a specific stack
 */
export enum Stage {
  /**
   * Validate Stage - Verify the configuration files and environment
   */
  VALIDATE = 'validate',
  /**
   * Accounts Stage - Handle all Organization and Accounts actions
   */
  ACCOUNTS = 'accounts',
  DEPENDENCIES = 'dependencies',
  SECURITY = 'security',
  OPERATIONS = 'operations',
  NETWORKING = 'networking',
}
