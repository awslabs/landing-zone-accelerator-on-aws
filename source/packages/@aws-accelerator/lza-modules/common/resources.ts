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
 * Accelerator solution supported module names
 */
export enum AcceleratorModuleName {
  /**
   * AWS Organizations module
   */
  AWS_ORGANIZATIONS = 'aws-organizations',
  /**
   * ControlTower module
   */
  CONTROL_TOWER = 'control-tower',
  /**
   * Account Alias module
   */
  ACCOUNT_ALIAS = 'account-alias',
}

/**
 * Accelerator Module runner parameter type
 */
export type ModuleRunnerParametersType = {
  /**
   * Name of the accelerator module.
   *
   * @see {@link AcceleratorModules}
   */
  module: string;
  /**
   * Accelerator module runner options
   *
   * @see {@link ModuleOptionsType}
   *
   */
  options: ModuleOptionsType;
};

/**
 * Accelerator module option type
 */
export type ModuleOptionsType = {
  /**
   * LandingZone Accelerator configuration directly path
   */
  configDirPath: string;
  /**
   * AWS partition
   *
   */
  partition: string;
  /**
   * Flag indicating existing role
   */
  readonly useExistingRole: boolean;
  /**
   * Solution Id
   */
  readonly solutionId: string;
};

/**
 * Type for organizational unit details
 */
export type OrganizationalUnitDetailsType = {
  name: string;
  id: string;
  arn: string;
  level: number;
  parentName?: string | undefined;
  parentId?: string | undefined;
  parentPath?: string | undefined;
};

/**
 * Type for organizational unit keys
 */
export type OrganizationalUnitKeysType = {
  acceleratorKey: string;
  awsKey: string;
  arn: string;
  parentId: string;
  parentPath: string;
  level: number;
}[];

/**
 * Cross Account assume role credential type
 */
export type AssumeRoleCredentialType = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
};

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
