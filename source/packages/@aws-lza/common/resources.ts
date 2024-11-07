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

import path from 'path';
import { createLogger } from './logger';

export const AcceleratorLogger = (fileName: string) => createLogger([path.parse(path.basename(fileName)).name]);
/**
 * Accelerator solution supported module names
 */
export enum AcceleratorModuleName {
  /**
   * AWS Organizations module
   */
  ORGANIZATIONS = 'organizations',
  /**
   * ControlTower module
   */
  CONTROL_TOWER = 'control-tower',
}

/**
 * Cross Account assume role credential
 */
export interface IAssumeRoleCredential {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
}

/**
 * List of Operations
 */
export const Operations = {
  /**
   * Deploy the changes
   */
  DEPLOY: 'deploy',
  /**
   * Generate information about the changes but doesn't deploy
   */
  DIFF: 'diff',
};

/**
 * Accelerator module common parameter
 *
 * @description
 * Each LZA module will require these parameters
 */
export interface IModuleCommonParameter {
  /**
   * Operation to be performed on the component or module
   *
   */
  operation: string;
  /**
   * Name of the accelerator module.
   *
   * @see {@link AcceleratorModules}
   */
  moduleName?: string;
  /**
   * AWS partition
   *
   */
  partition: string;
  /**
   * Accelerator home region
   *
   */
  homeRegion: string;
  /**
   * Accelerator global region, when not present home region is considered as global region
   *
   */
  globalRegion?: string;
  /**
   * Flag indicating existing role
   */
  readonly useExistingRole?: boolean;
  /**
   * Solution Id
   */
  readonly solutionId?: string;
  /**
   * Management account credentials, required for external deployment
   */
  managementAccountCredentials?: IAssumeRoleCredential;
  /**
   * Flag indicating if the module should wait till operation completes
   *
   * @default
   * false
   */
  waitTillOperationCompletes?: boolean;
}

/**
 * AWS Control Tower shared account details
 */
export interface IControlTowerSharedAccountDetails {
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

/**
 * AWS Control Tower Landing Zone latest version.
 *
 * @remarks
 * Once Control Tower API support available for landing zone version, this hard coded constant will be removed.
 * When Control Tower Landing Zone gets new version, we need to update this constant.
 */
export const CONTROL_TOWER_LANDING_ZONE_VERSION = '3.3';
