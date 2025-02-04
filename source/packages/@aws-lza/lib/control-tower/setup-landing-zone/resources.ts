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
 * AWS Control Tower shared account details
 */
export interface ISharedAccountDetails {
  /**
   * Name of the account
   */
  name: string;
  /**
   * Account email
   */
  email: string;
}

/**
 * Landing zone update or reset required type
 */
export type LandingZoneUpdateOrResetRequiredType = {
  updateRequired: boolean;
  targetVersion: string;
  resetRequired: boolean;
  reason: string;
};

/**
 * ControlTowerLandingZoneProps
 */
export interface ControlTowerLandingZoneConfigType {
  /**
   * AWS Control Tower Landing Zone version, this must be latest version for creating any new AWS Control Tower Landing Zone
   *
   * @remarks
   * AWS Control Tower Landing Zone version value must be latest version of the AWS Control Tower Landing Zone.
   * You can refer [AWS Control Tower release notes](https://docs.aws.amazon.com/controltower/latest/userguide/release-notes.html) for more information.
   */
  readonly version: string;
  /**
   * List of AWS Regions governed by the AWS Control Tower Landing Zone
   */
  readonly governedRegions: string[];
  /**
   * Log archive AWS account ID
   */
  readonly logArchiveAccountId: string;
  /**
   * Audit AWS account ID
   */
  readonly auditAccountId: string;
  /**
   * Flag indicating weather AWS Control Tower sets up AWS account access with IAM Identity Center or not
   */
  readonly enableIdentityCenterAccess: boolean;
  /**
   * AWS Control Tower Landing Zone central logging bucket retention in days
   */
  readonly loggingBucketRetentionDays: number;
  /**
   * AWS Control Tower Landing Zone access logging bucket retention in days
   */
  readonly accessLoggingBucketRetentionDays: number;
  /**
   * Flag indicating Organization level CloudTrail is enable or not.
   */
  readonly enableOrganizationTrail: boolean;
}

/**
 * AWS Control Tower Landing Zone details type.
 */
export type ControlTowerLandingZoneDetailsType = {
  /**
   * AWS Control Tower Landing Zone identifier
   *
   * @remarks
   * AWS Control Tower Landing Zone arn
   *
   * @remarks
   * AWS Control Tower Landing Zone arn
   */
  landingZoneIdentifier: string;
  /**
   *  AWS Control Tower Landing Zone deployment status.
   *
   * @remarks
   * ACTIVE or FAILED or PROCESSING
   */
  status?: string;
  /**
   *  AWS Control Tower Landing Zone version
   */
  version?: string;
  /**
   *  The latest available version of AWS Control Tower Landing Zone.
   */
  latestAvailableVersion?: string;
  /**
   * The drift status of AWS Control Tower Landing Zone.
   *
   * @remarks
   * DRIFTED or IN_SYNC
   */
  driftStatus?: string;
  /**
   * List of AWS Regions governed by AWS Control Tower Landing Zone
   */
  governedRegions?: string[];
  /**
   * The name of Security organization unit (OU)
   */
  securityOuName?: string;
  /**
   * The name of Sandbox organization unit (OU)
   */
  sandboxOuName?: string;
  /**
   * Flag indicating weather AWS Control Tower sets up AWS account access with IAM Identity Center or not
   */
  enableIdentityCenterAccess?: boolean;
  /**
   * AWS Control Tower Landing Zone central logging bucket retention in days
   */
  loggingBucketRetentionDays?: number;
  /**
   * AWS Control Tower Landing Zone access logging bucket retention in days
   */
  accessLoggingBucketRetentionDays?: number;
  /**
   * AWS KMS CMK arn to encrypt AWS Control Tower Landing Zone resources
   */
  kmsKeyArn?: string;
};
