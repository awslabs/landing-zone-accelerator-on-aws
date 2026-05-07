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
 * Enroll Accounts configuration
 */
export interface IEnrollAccountsConfiguration {
  /**
   * AWS Organizations OU ARNs that are explicitly marked to be ignored by enroll-accounts.
   *
   * @description
   * Skipping is not inherited:
   * - A baseline whose `targetIdentifier` matches an ARN in this list is skipped.
   * - An account baseline whose `parentIdentifier` points to the baseline ARN of an explicitly
   *   ignored OU is skipped (accounts directly under an ignored OU).
   * - Child OU baselines under an ignored OU are NOT skipped unless that child OU is itself
   *   explicitly ignored (i.e. its ARN also appears in this list).
   *
   * Provide an empty array when there are no OUs to ignore.
   *
   * @example
   * ```
   * ['arn:aws:organizations::123456789012:ou/o-abc123/ou-abcd-12345678']
   * ```
   */
  readonly ignoredOuArns: string[];
}

/**
 * Enroll Accounts handler parameter
 */
export interface IEnrollAccountsHandlerParameter extends IModuleCommonParameter {
  /**
   * Enroll Accounts configuration
   */
  configuration: IEnrollAccountsConfiguration;
}

/**
 * Enroll Accounts Module interface
 */
export interface IEnrollAccountsModule {
  /**
   * Handler function to enroll accounts across the entire Control Tower organization.
   * Resets drifted OU baselines and waits for all account enrollments to complete.
   *
   * @param props {@link IEnrollAccountsHandlerParameter}
   * @returns status string
   */
  handler(props: IEnrollAccountsHandlerParameter): Promise<string>;
}
