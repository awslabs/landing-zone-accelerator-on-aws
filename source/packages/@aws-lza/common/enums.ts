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

/**
 * Accelerator module exception name lists
 */
export enum MODULE_EXCEPTIONS {
  /**
   * Service error - Throws when the API returns an unexpected response structure.
   */
  SERVICE_EXCEPTION = 'ServiceException',
  /**
   * Invalid Inout error - Throws when the module input is invalid.
   */
  INVALID_INPUT = 'InvalidInputException',
}
