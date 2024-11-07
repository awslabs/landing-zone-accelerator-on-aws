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

import { IControlTowerSharedAccountDetails, IModuleCommonParameter } from '../common/resources';

/**
 * AWS Control Tower Landing Zone configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 *
 * ```
 * {
 *   version: '1.3.0',
 *   enabledRegions: ['us-east-1', 'us-west-2'],
 *   logging: {
 *     organizationTrail: true,
 *     retention: {
 *       loggingBucket: 30,
 *       accessLoggingBucket: 30,
 *     },
 *   },
 *   security: {
 *     enableIdentityCenterAccess: true,
 *   },
 *   sharedAccounts: {
 *     management: {
 *       name: 'Management',
 *       email: 'management@example.com',
 *     },
 *     logging: {
 *       name: 'Logging',
 *       email: 'logging@example.com',
 *     },
 *     audit: {
 *       name: 'Audit',
 *       email: 'audit@example.com',
 *     },
 *   },
 * }
 * ```
 */
export interface IControlTowerLandingZoneConfiguration {
  /**
   * AWS Control Tower Landing Zone version
   */
  version: string;
  /**
   * List of AWS Regions to be governed by the Control Tower
   */
  enabledRegions: string[];
  /**
   * Logging configuration
   */
  logging: {
    /**
     * Flag indicating weather organization trail should be enabled or not.
     */
    organizationTrail: boolean;
    /**
     * AWS Control Tower buckets retention
     */
    retention: {
      /**
       * Logging bucket retention in days
       */
      loggingBucket: number;
      /**
       * Access logging bucket retention in days
       */
      accessLoggingBucket: number;
    };
  };
  /**
   * Security configuration
   */
  security: {
    /**
     * Flag indicating weather IAM Identity Center will be enabled or not
     */
    enableIdentityCenterAccess: boolean;
  };
  /**
   * Shared account details
   */
  sharedAccounts: {
    /**
     * Management account details
     *
     * @example
     *
     * ```
     * {
     *   name: 'Management',
     *   email: 'management@example.com',
     * }
     * ```
     */
    management: IControlTowerSharedAccountDetails;
    /**
     * Logging account details
     *
     * @example
     *
     * ```
     * {
     *   name: 'Logging',
     *   email: 'logging@example.com',
     * }
     * ```
     */
    logging: IControlTowerSharedAccountDetails;
    /**
     * Audit account details
     *
     * @example
     *
     * ```
     * {
     *   name: 'Audit',
     *   email: 'audit@example.com',
     * }
     * ```
     */
    audit: IControlTowerSharedAccountDetails;
  };
}

/**
 * AWS Control Tower module handler parameter
 */
export interface IControlTowerLandingZoneHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @example
   *
   * ```
   * {
   *   version: '1.3.0',
   *   enabledRegions: ['us-east-1', 'us-west-2'],
   *   logging: {
   *     organizationTrail: true,
   *     retention: {
   *       loggingBucket: 30,
   *       accessLoggingBucket: 30,
   *     },
   *   },
   *   security: {
   *     enableIdentityCenterAccess: true,
   *   },
   *   sharedAccounts: {
   *     management: {
   *       name: 'Management',
   *       email: 'management@example.com',
   *     },
   *     logging: {
   *       name: 'Logging',
   *       email: 'logging@example.com',
   *     },
   *     audit: {
   *       name: 'Audit',
   *       email: 'audit@example.com',
   *     },
   *   },
   * }
   * ```
   */
  configuration: IControlTowerLandingZoneConfiguration;
}

/**
 * Accelerator Control Tower Landing Zone Module interface
 */
export interface IAcceleratorControlTowerLandingZoneModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IControlTowerLandingZoneHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IControlTowerLandingZoneHandlerParameter): Promise<string>;
}
