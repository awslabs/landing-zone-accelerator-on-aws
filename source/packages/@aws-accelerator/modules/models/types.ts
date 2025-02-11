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

import { AccountsConfig } from '@aws-accelerator/config/lib/accounts-config';
import { CustomizationsConfig } from '@aws-accelerator/config/lib/customizations-config';
import { GlobalConfig } from '@aws-accelerator/config/lib/global-config';
import { IamConfig } from '@aws-accelerator/config/lib/iam-config';
import { NetworkConfig } from '@aws-accelerator/config/lib/network-config';
import { OrganizationConfig } from '@aws-accelerator/config/lib/organization-config';
import { ReplacementsConfig } from '@aws-accelerator/config/lib/replacements-config';
import { SecurityConfig } from '@aws-accelerator/config/lib/security-config';
import { AcceleratorResourcePrefixes } from '../../accelerator/utils/app-utils';
import { AcceleratorResourceNames } from '../../accelerator/lib/accelerator-resource-names';
import { Account, Organization } from '@aws-sdk/client-organizations';
import { IAssumeRoleCredential } from '../../../@aws-lza/common/resources';
import { AcceleratorModules, AcceleratorModuleStages } from './enums';

/**
 * Accelerator logging details type
 */
type AcceleratorLoggingType = {
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

/**
 * Accelerator configurations types
 */
export type AcceleratorConfigurationsType = {
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
};

/**
 * Accelerator runner parameter type
 */
export type RunnerParametersType = {
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
   * LandingZone Accelerator configuration directly path
   */
  readonly configDirPath: string;
  /**
   * Accelerator prefix
   */
  readonly prefix: string;
  /**
   * Flag indicating existing role
   */
  readonly useExistingRole: boolean;
  /**
   * Solution Id
   */
  readonly solutionId: string;
  /**
   * Flag indicating dry run mode
   */
  readonly dryRun: boolean;
  /**
   * Accelerator pipeline stage name
   */
  readonly stage?: string;
};

/**
 * Accelerator Module details type
 */
export type AcceleratorModuleDetailsType = {
  /**
   * Accelerator Module name
   */
  readonly name: AcceleratorModules;
  /**
   * Accelerator Module description
   */
  readonly description: string;
  /**
   * Accelerator Module run order
   */
  readonly runOrder: number;
  /**
   * Accelerator Module handler
   * @description
   * This is the handler function for the module. It will be called by the runner.
   * @param params {@link ModuleParams} - This is the parameter for the module. It will be different for each module.
   * @returns Promise<string> - This is the return value for the module. It will be different for each module.
   */
  readonly handler: (params: ModuleParams) => Promise<string>;
};

/**
 * Accelerator runner parameters type
 */
export type AcceleratorModuleRunnerParametersType = {
  /**
   * Accelerator configurations
   */
  readonly configs: AcceleratorConfigurationsType;
  /**
   * Accelerator global region
   */
  readonly globalRegion: string;
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
  readonly logging: AcceleratorLoggingType;
  /**
   * AWS Organizations account details
   */
  readonly organizationAccounts: Account[];
  /**
   * AWS Organization details
   */
  readonly organizationDetails?: Organization;
  /**
   * Management account credential, only available when solution deployed from external account
   */
  readonly managementAccountCredentials?: IAssumeRoleCredential;
};

/**
 * Composite type for various accelerator module parameter
 */
export type ModuleParams = {
  moduleItem: AcceleratorModuleDetailsType;
  runnerParameters: RunnerParametersType;
  moduleRunnerParameters: AcceleratorModuleRunnerParametersType;
  stage?: string;
};

/**
 * Accelerator module stage orders type
 */
export type AcceleratorModuleStageOrdersType = Record<
  AcceleratorModuleStages,
  {
    /**
     * Accelerator pipeline stage names and root stage name
     */
    name: string;
    /**
     * Accelerator Module stage run order
     */
    runOrder: number;
  }
>;

/**
 * Accelerator Module and stage details type
 */
export type AcceleratorModuleStageDetailsType = {
  /**
   * Accelerator Module pipeline stage dependency
   * @description
   * This is the stage name for the module to be executed. It can be either a pipeline stage name or root.
   * @see AcceleratorStage
   */
  readonly stage: {
    /**
     * Accelerator pipeline stage names
     */
    name: AcceleratorModuleStages;
    /**
     * Accelerator Module stage run order
     */
    runOrder: number;
  };
  /**
   * Accelerator Module details
   * @description
   * This is the list of all the accelerator module for the stage.
   * @see AcceleratorModuleDetailsType
   */
  readonly modules: AcceleratorModuleDetailsType[];
};

/**
 * Type for Promise items
 */
export type PromiseItemType = { runOrder: number; promise: () => Promise<string> };

/**
 * Type for grouped stages by run order
 */
export type GroupedStagesByRunOrderType = {
  order: number;
  stages: AcceleratorModuleStageDetailsType[];
};

/**
 * Type for grouped promises by run order
 */
export type GroupedPromisesByRunOrderType = {
  order: number;
  promises: (() => Promise<string>) | (() => Promise<string>)[];
};

/**
 * Accelerator resource environment details type
 */
export type AcceleratorEnvironmentDetailsType = { accountId: string; accountName: string; region: string };
