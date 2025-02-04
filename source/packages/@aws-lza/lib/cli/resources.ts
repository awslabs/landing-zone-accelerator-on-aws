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

import { ISetupLandingZoneConfiguration } from '../../interfaces/control-tower/setup-landing-zone';
import { ConfigurationObjectType } from './libraries/root';

/**
 * Abstract class to define various resources for CLI
 */
export abstract class CliResources {
  /**
   * Validate the configuration for Control Tower
   * @param input {@link ISetupLandingZoneConfiguration}
   * @returns boolean
   */
  public static validControlTowerConfig(input: ConfigurationObjectType): input is ISetupLandingZoneConfiguration {
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
    for (const account of ['management', 'logging', 'audit']) {
      if (
        typeof input['sharedAccounts'][account] !== 'object' ||
        typeof input['sharedAccounts'][account]['name'] !== 'string' ||
        typeof input['sharedAccounts'][account]['email'] !== 'string'
      ) {
        return false;
      }
    }

    return true;
  }
}
