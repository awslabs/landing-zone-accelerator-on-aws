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
   * AWS Control Tower Landing zone module
   */
  CONTROL_TOWER_LANDING_ZONE = 'control-tower-landing-zone',
  /**
   * Amazon EC2 module
   */
  AMAZON_EC2 = 'amazon-ec2',
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
   * AWS Region
   *
   */
  region: string;
  /**
   * Accelerator global region, when not present executing region is considered as global region
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
   * Target account credentials where Module will be executed
   *
   * @description
   * When target AWS Account is same as the module invocation account this property will be undefined.
   *
   * @default
   * undefined
   */
  credentials?: IAssumeRoleCredential;
  /**
   *  Flag indicating if the module should perform a dry run
   *
   * @default
   * false
   */
  dryRun?: boolean;
}

/**
 * Accelerator module default parameter
 *
 * @description
 * Each LZA module will set these parameters
 */
export interface IModuleDefaultParameter {
  /**
   * Name of the accelerator module.
   *
   * @see {@link AcceleratorModules}
   */
  readonly moduleName: string;
  /**
   * Global region
   */
  readonly globalRegion: string;
  /**
   * Flag indicating existing role
   */
  readonly useExistingRole: boolean;
  /**
   * Flag indicating if the module should perform a dry run
   */
  readonly dryRun: boolean;
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
 * Principal Org id condition for policy
 */
export type PrincipalOrgIdConditionType = {
  [key: string]: string | string[];
};

/**
 * IAM policy statement type used in custom resource to update policy of existing resources
 */
export type PolicyStatementType = {
  /**
   * The Sid (statement ID) is an optional identifier that you provide for the
   * policy statement. You can assign a Sid value to each statement in a
   * statement array. In services that let you specify an ID element, such as
   * SQS and SNS, the Sid value is just a sub-ID of the policy document's ID. In
   * IAM, the Sid value must be unique within a JSON policy.
   *
   * @default - no sid
   */
  readonly Sid?: string;
  /**
   * List of actions to add to the statement
   *
   * @default - no actions
   */
  readonly Action: string | string[];
  /**
   * List of not actions to add to the statement
   *
   * @default - no not-actions
   */
  readonly NotActions?: string[];
  /**
   * Principal to add to the statement
   *
   * @default - no principal
   */
  readonly Principal?: PrincipalOrgIdConditionType;
  /**
   * Principal to add to the statement
   *
   * @default - no not principal
   */
  readonly NotPrincipal?: PrincipalOrgIdConditionType;
  /**
   * Resource ARNs to add to the statement
   *
   * @default - no resource
   */
  readonly Resource?: string | string[];
  /**
   * NotResource ARNs to add to the statement
   *
   * @default - no not-resources
   */
  readonly NotResource?: string[];
  /**
   * Condition to add to the statement
   *
   * @default - no condition
   */
  readonly Condition?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  /**
   * Whether to allow or deny the actions in this statement
   *
   * @default Effect.ALLOW
   */
  readonly Effect?: 'Allow' | 'Deny';
};

/**
 * AWS Organization Root config type
 */
export type OrganizationRootType = {
  Name: string;
  Id: string;
};

/**
 * Policy Document
 */
export type PolicyDocument = {
  Version: string;
  Id?: string;
  Statement: PolicyStatementType[];
};
