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
import { Account } from '@aws-sdk/client-organizations';

import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';

import { version } from '../../../../../package.json';
import { AcceleratorConfigLoader } from './accelerator-config-loader';

import {
  getManagementAccountCredentials,
  getOrganizationAccounts,
  getOrganizationDetails,
  validateConfigDirPath,
} from './functions';
import { RunnerParametersType } from './resources';

export interface LzaConfigurationProps {
  /**
   * AWS Partition
   */
  readonly partition: string;
  /**
   * Aws Region
   */
  readonly region: string;
  /**
   * Accelerator prefix
   */
  readonly prefix: string;
  /**
   * Accelerator configuration directory path
   */
  readonly configDirPath: string;
  /**
   * Flag indicating weather existing role to be used or not
   */
  readonly useExistingRole?: boolean;
}

/**
 * LzaConfig abstract class to parse and load LZA configuration.
 */
export abstract class LzaConfiguration {
  /**
   * Function to load accelerator configuration and other metadata
   * @param props {@link LzaConfigurationProps}
   */
  public static async getConfiguration(props: LzaConfigurationProps): Promise<RunnerParametersType> {
    //
    // Validate config directory path and presence of required files
    //
    validateConfigDirPath(props.configDirPath);

    //
    // Set Solution Id
    //
    const solutionId = `AwsSolution/SO0199/${version}`;

    //
    // Get Management account credentials
    //
    const managementAccountCredentials = await getManagementAccountCredentials(
      props.partition,
      props.region,
      solutionId,
    );

    //
    // Load all configuration
    //
    const allConfigs = await AcceleratorConfigLoader.getAllConfig(
      props.configDirPath,
      props.partition,
      props.prefix,
      solutionId,
      managementAccountCredentials,
    );

    //
    // Get Global Region
    //
    const globalRegion = getGlobalRegion(props.partition);

    //
    // Get Organization accounts
    //
    const organizationAccounts: Account[] = [];
    if (allConfigs.organizationConfig.enable) {
      organizationAccounts.push(
        ...(await getOrganizationAccounts(globalRegion, solutionId, managementAccountCredentials)),
      );
    }
    const organizationDetails = await getOrganizationDetails(globalRegion, solutionId, managementAccountCredentials);

    if (allConfigs.organizationConfig.enable && !organizationDetails) {
      throw new Error(
        `AWS Organizations not configured but organization is enabled in organization-config.yaml file !!!`,
      );
    }

    return {
      configDirPath: props.configDirPath,
      partition: props.partition,
      region: props.region,
      acceleratorPrefix: props.prefix,
      useExistingRole: props.useExistingRole ?? false,
      solutionId,
      allConfigs,
      organizationAccounts,
      awsOrganization: organizationDetails,
      managementAccountCredentials,
    };
  }
}
