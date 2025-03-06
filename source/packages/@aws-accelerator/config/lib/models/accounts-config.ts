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

export interface IAccountsConfig {
  mandatoryAccounts: IAccountConfig[] | IGovCloudAccountConfig[];
  workloadAccounts: IAccountConfig[] | IGovCloudAccountConfig[];
  accountIds?: IAccountIdConfig[];
}

export interface IBaseAccountConfig {
  /**
   * The friendly name that is assigned to the account for reference within the Accelerator. The name will be used to reference
   * this account in other configuration files and not to lookup the account in AWS.
   *
   * For pre-existing accounts this does not need to match the AWS account name.
   *
   * When creating new accounts with the Accelerator, this name will be used as the AWS account name.
   *
   * The name should not contain any spaces as this isn't supported by the Accelerator.
   */
  name: t.NonEmptyNoSpaceString;
  /**
   * The description is to used to provide more information about the account.
   * This value is not used when creating accounts.
   */
  description?: t.NonEmptyString;
  /**
   * The email address of the owner to assign to the account. The email address
   * must not already be associated with another AWS account. You must use a
   * valid email address.
   * The address must be a minimum of 6 and a maximum of 64 characters long.
   * All characters must be 7-bit ASCII characters
   * There must be one and only one @ symbol, which separates the local name from the domain name.
   * The local name can’t contain any of the following characters: whitespace, ” ‘ ( ) < > [ ] : ; , | % &
   * The local name can’t begin with a dot (.)
   * The domain name can consist of only the characters [a-z],[A-Z],[0-9], hyphen (-), or dot (.)
   * The domain name can’t begin or end with a hyphen (-) or dot (.)
   * The domain name must contain at least one dot
   */
  email: t.EmailAddress;
  /**
   * The friendly name for the Organizational Unit that this account
   * is a member of.
   * This Organizational Unit must exist in the organization-config.yaml file.
   */
  organizationalUnit?: t.NonEmptyString;
  /**
   * Account alias used for sign-in page URL in place of 12-digit number. This must be unique within the AWS partition and be
   * only digits, lowercase letters, and hyphens. It will be validated againt the Regular Expression ^[a-z0-9]([a-z0-9]|-(?!-)){1,61}[a-z0-9]$
   */
  accountAlias?: t.NonEmptyNoSpaceString;
}

/**
 * {@link AccountsConfig} / {@link AccountConfig}
 *
 * @description
 * Account configuration
 *
 * @example
 * ```
 * - name: Workload01
 *   description: Workload account 01
 *   email: example-email+workload01@example.com
 *   organizationalUnit: Workloads
 *   warm: true
 *   accountAlias: workload1
 * ```
 */
export interface IAccountConfig extends IBaseAccountConfig {
  /**
   * 'Warm' the account by creating an EC2 instance
   * that runs for 15 minutes
   * Use for new accounts that will need to have
   * ec2 instance provisioned as part of the solution
   * The 'warming' will take place in the operations stack
   * This property may be removed after the account has
   * been provisioned
   */
  warm?: boolean;
}

/**
 * *{@link AccountsConfig} / {@link GovCloudAccountConfig}
 *
 * @description
 * GovCloud Account configuration
 * Used instead of the account configuration in the commercial
 * partition when creating GovCloud partition linked accounts.
 *
 * @example
 * ```
 * - name: Workload01
 *   description: Workload account 01
 *   email: example-email+workload01@example.com
 *   organizationalUnit: Workloads
 *   enableGovCloud: true
 * ```
 */
export interface IGovCloudAccountConfig extends IBaseAccountConfig {
  /**
   * Indicates whether or not a GovCloud partition account
   * should be created.
   */
  enableGovCloud?: boolean;
}

export interface IAccountIdConfig {
  email: t.EmailAddress;
  accountId: t.AwsAccountId;
}
