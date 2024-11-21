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

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { Account, Organization } from '@aws-sdk/client-organizations';
import { AcceleratorResourcePrefixes } from '../../../accelerator/utils/app-utils';
import { AcceleratorResourceNames } from '../../../accelerator/lib/accelerator-resource-names';

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
 * Accelerator all configuration types
 */
export type AllConfigType = {
  /**
   * Accounts configuration
   */
  accountsConfig: AccountsConfig;
  /**
   * Customization configuration
   */
  customizationsConfig: CustomizationsConfig;
  /**
   * Global configuration
   */
  globalConfig: GlobalConfig;
  /**
   * IAM configuration
   */
  iamConfig: IamConfig;
  /**
   * Network configuration
   */
  networkConfig: NetworkConfig;
  /**
   * Organization configuration
   */
  organizationConfig: OrganizationConfig;
  /**
   * Replacement configuration
   */
  replacementsConfig: ReplacementsConfig;
  /**
   * Security configuration
   */
  securityConfig: SecurityConfig;
  /**
   * Accelerator resource name prefixes
   */
  readonly resourcePrefixes: AcceleratorResourcePrefixes;
  /**
   * Accelerator resource names
   */
  readonly acceleratorResourceNames: AcceleratorResourceNames;
  /**
   * Accelerator Logging properties
   */
  readonly logging: {
    /**
     * Central logging AWS Region name
     */
    readonly centralizedRegion: string;
    /**
     * Central Log bucket name
     */
    readonly bucketName?: string;
    /**
     *  Central log bucket key arn
     */
    bucketKeyArn?: string;
  };
};

/**
 * Accelerator resource environment details type
 */
export type AcceleratorEnvironmentDetailsType = { accountId: string; accountName: string; region: string };

/**
 * LZA config runner parameters type
 */
export type RunnerParametersType = {
  /**
   * LandingZone Accelerator configuration directly path
   */
  readonly configDirPath: string;
  /**
   * AWS partition
   *
   */
  readonly partition: string;
  /**
   * AWS Region
   *
   */
  readonly region: string;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * Flag indicating existing role
   */
  readonly useExistingRole: boolean;
  /**
   * Solution Id
   */
  readonly solutionId: string;
  /**
   * All accelerator loaded config
   */
  readonly allConfigs: AllConfigType;
  /**
   * AWS Organizations account details
   */
  readonly organizationAccounts: Account[];
  /**
   * AWS Organization details
   */
  readonly awsOrganization?: Organization;
  /**
   * Management account credential, only available when solution deployed from external account
   */
  readonly managementAccountCredentials?: AssumeRoleCredentialType;
};
