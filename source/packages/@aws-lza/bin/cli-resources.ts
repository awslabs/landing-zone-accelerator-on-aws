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
  IControlTowerLandingZoneConfiguration,
  IControlTowerLandingZoneHandlerParameter,
} from '../interfaces/control-tower';
import { setupControlTowerLandingZone } from '../executors/accelerator-control-tower';

/**
 * aws-Lza parameter
 */
export interface IAwsLzaParameter {
  operation: string;
  moduleName: string;
  command?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configuration: Record<string, any>;
  partition?: string;
  region?: string;
  account?: string;
  verbose?: boolean;
  wait?: boolean;
}

/**
 * Abstract class to define various resources for CLI
 */
export abstract class CliResources {
  /**
   * Validate the configuration for Control Tower
   * @param input {@link IControlTowerLandingZoneConfiguration}
   * @returns boolean
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static validControlTowerConfig(input: Record<string, any>): input is IControlTowerLandingZoneConfiguration {
    // Check for required properties
    if (
      typeof input['version'] !== 'string' ||
      !Array.isArray(input['enabledRegions']) ||
      typeof input['logging'] !== 'object' ||
      typeof input['security'] !== 'object' ||
      typeof input['sharedAccounts'] !== 'object'
    ) {
      return false;
    }

    // Validate logging
    if (
      typeof input['logging']['organizationTrail'] !== 'boolean' ||
      typeof input['logging']['retention'] !== 'object' ||
      typeof input['logging']['retention']['loggingBucket'] !== 'number' ||
      typeof input['logging']['retention']['accessLoggingBucket'] !== 'number'
    ) {
      return false;
    }

    // Validate security
    if (typeof input['security']['enableIdentityCenterAccess'] !== 'boolean') {
      return false;
    }

    // Validate sharedAccounts
    const requiredAccounts = ['Management', 'LogArchive', 'Audit'];
    for (const account of requiredAccounts) {
      if (
        typeof input['sharedAccounts'][account] !== 'object' ||
        typeof input['sharedAccounts'][account].name !== 'string' ||
        typeof input['sharedAccounts'][account].email !== 'string'
      ) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Abstract class to define various activities for CLI
 */
export abstract class CliActivity {
  public static async executeControlTowerLandingZoneModule(params: IAwsLzaParameter): Promise<string> {
    if (!params.partition || !params.region) {
      console.error(
        `An error occurred (MissingRequiredParameters) when calling the ${params.operation} for ${params.moduleName} module: This partition and region parameters are required`,
      );
      process.exit(1);
    }

    const moduleConfig = params.configuration as IControlTowerLandingZoneConfiguration;
    const input: IControlTowerLandingZoneHandlerParameter = {
      operation: params.operation,
      partition: params.partition,
      homeRegion: params.region,
      configuration: moduleConfig,
      waitTillOperationCompletes: params.wait,
    };

    return await setupControlTowerLandingZone(input);
  }
}
