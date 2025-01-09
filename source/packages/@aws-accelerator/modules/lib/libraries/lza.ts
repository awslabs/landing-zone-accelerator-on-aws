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
import { IControlTowerLandingZoneHandlerParameter, setupControlTowerLandingZone } from '../../../../@aws-lza/index';
import { AcceleratorStage } from '../../../accelerator/lib/accelerator-stage';
import { CustomizationsConfig } from '@aws-accelerator/config/lib/customizations-config';
import { GlobalConfig } from '@aws-accelerator/config/lib/global-config';
import { IamConfig } from '@aws-accelerator/config/lib/iam-config';
import { NetworkConfig } from '@aws-accelerator/config/lib/network-config';
import { OrganizationConfig } from '@aws-accelerator/config/lib/organization-config';
import { ReplacementsConfig } from '@aws-accelerator/config/lib/replacements-config';
import { SecurityConfig } from '@aws-accelerator/config/lib/security-config';
import { AcceleratorResourcePrefixes } from '../../../accelerator/utils/app-utils';
import { AcceleratorResourceNames } from '../../../accelerator/lib/accelerator-resource-names';
import { Account, Organization } from '@aws-sdk/client-organizations';
import { IAssumeRoleCredential } from '../../../../@aws-lza/common/resources';

/**
 * Composite type for various accelerator module parameter
 */
type ModuleParams = IControlTowerLandingZoneHandlerParameter | string;

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
 * Accelerator resource environment details type
 */
export type AcceleratorEnvironmentDetailsType = { accountId: string; accountName: string; region: string };

/**
 * Accelerator module names
 */
export enum AcceleratorModuleNames {
  /**
   * AWS Control Tower Landing Zone module
   */
  CONTROL_TOWER = 'control-tower',
  /**
   * AWS Organizations module
   */
  AWS_ORGANIZATIONS = 'aws-organizations',
  /**
   * Accelerator Security module
   */
  SECURITY = 'security',
  /**
   * Accelerator Network module
   */
  NETWORK = 'network',
}

/**
 * Accelerator Module details type
 */
export type AcceleratorModuleDetailsType = {
  /**
   * Accelerator Module name
   */
  readonly name: AcceleratorModuleNames;
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
     * Accelerator pipeline stage names and root stage name
     */
    name: AcceleratorStage | 'root';
    /**
     * When should module be executed.
     *
     * - BEFORE: Before the stacks execution of the stage
     * - AFTER: After the stacks execution of the stage
     * - BOTH: Both before and after the stacks execution of the stage
     */
    when?: 'BEFORE' | 'AFTER' | 'BOTH';
  };
  readonly modules: AcceleratorModuleDetailsType[];
};

/**
 * Accelerator Module details
 *
 * @description
 * This is the list of all the accelerator modules with pipeline stage dependency. It will be used by the runner to execute the modules.
 * @see AcceleratorModuleStageDetailsType
 */
export const AcceleratorModuleStageDetails: AcceleratorModuleStageDetailsType[] = [
  {
    stage: {
      name: AcceleratorStage.PREPARE,
    },
    modules: [
      {
        name: AcceleratorModuleNames.CONTROL_TOWER,
        description: 'Manage AWS Control Tower Landing Zone',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await setupControlTowerLandingZone(params as IControlTowerLandingZoneHandlerParameter);
        },
      },
      {
        name: AcceleratorModuleNames.AWS_ORGANIZATIONS,
        description: 'Manage AWS Organizations operations',
        runOrder: 2,
        handler: async (moduleName: ModuleParams) => {
          return Promise.resolve(`Module "${moduleName}" needs development`);
        },
      },
    ],
  },
  {
    stage: {
      name: AcceleratorStage.SECURITY,
      when: 'BEFORE',
    },
    modules: [
      {
        name: AcceleratorModuleNames.SECURITY,
        runOrder: 1,
        description: 'Manage security operations',
        handler: async (moduleName: ModuleParams) => {
          return Promise.resolve(`Module "${moduleName}" needs development`);
        },
      },
    ],
  },
  {
    stage: {
      name: AcceleratorStage.NETWORK_PREP,
      when: 'BEFORE',
    },
    modules: [
      {
        name: AcceleratorModuleNames.NETWORK,
        runOrder: 1,
        description: 'Manage network operations',
        handler: async (moduleName: ModuleParams) => {
          return Promise.resolve(`Module "${moduleName}" needs development`);
        },
      },
    ],
  },
];

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
  readonly stage: string;
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

/**
 * Type for Promise items
 */
export type PromiseItemType = { order: number; promise: () => Promise<string> };
/**
 * Type for grouped promises
 */
export type GroupedPromisesType = {
  order: number;
  promises: (() => Promise<string>) | (() => Promise<string>)[];
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
 * Accelerator runner parameters type
 */
export type AcceleratorModuleRunnerParametersType = {
  /**
   * Accelerator configurations
   */
  configs: AcceleratorConfigurationsType;
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
