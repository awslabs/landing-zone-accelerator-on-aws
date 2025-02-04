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

import { IModuleCommonParameter } from '../../common/resources';
import { ISharedAccountDetails } from '../../lib/control-tower/setup-landing-zone/resources';

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
export interface ISetupLandingZoneConfiguration {
  /**
   * AWS Control Tower Landing Zone version
   */
  readonly version: string;
  /**
   * List of AWS Regions to be governed by the Control Tower
   */
  readonly enabledRegions: string[];
  /**
   * Logging configuration
   */
  readonly logging: {
    /**
     * Flag indicating weather organization trail should be enabled or not.
     */
    readonly organizationTrail: boolean;
    /**
     * AWS Control Tower buckets retention
     */
    readonly retention: {
      /**
       * Logging bucket retention in days
       */
      readonly loggingBucket: number;
      /**
       * Access logging bucket retention in days
       */
      readonly accessLoggingBucket: number;
    };
  };
  /**
   * Security configuration
   */
  readonly security: {
    /**
     * Flag indicating weather IAM Identity Center will be enabled or not
     */
    readonly enableIdentityCenterAccess: boolean;
  };
  /**
   * Shared account details
   */
  readonly sharedAccounts: {
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
    readonly management: ISharedAccountDetails;
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
    readonly logging: ISharedAccountDetails;
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
    readonly audit: ISharedAccountDetails;
  };
}

/**
 * AWS Control Tower module handler parameter
 */
export interface ISetupLandingZoneHandlerParameter extends IModuleCommonParameter {
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
  readonly configuration: ISetupLandingZoneConfiguration;
}

/**
 * Accelerator Control Tower Landing Zone Module interface
 */
export interface ISetupLandingZoneModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link ISetupLandingZoneHandlerParameter}
   * @returns status string
   *
   */
  handler(props: ISetupLandingZoneHandlerParameter): Promise<string>;
}
