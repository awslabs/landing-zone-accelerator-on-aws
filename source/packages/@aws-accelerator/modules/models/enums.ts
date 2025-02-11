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
 * List of stage names to be used to execute Accelerator modules.
 *
 * @description
 * This is the subset list of stage names used by Accelerator pipeline
 */
export enum AcceleratorModuleStages {
  ACCELERATOR_BOOTSTRAP = 'accelerator-bootstrap',
  PREPARE = 'prepare',
  ACCOUNTS = 'accounts',
  BOOTSTRAP = 'bootstrap',
  KEY = 'key',
  LOGGING = 'logging',
  ORGANIZATIONS = 'organizations',
  SECURITY_AUDIT = 'security-audit',

  NETWORK_PREP = 'network-prep',
  SECURITY = 'security',
  OPERATIONS = 'operations',

  NETWORK_VPC = 'network-vpc',
  SECURITY_RESOURCES = 'security-resources',
  IDENTITY_CENTER = 'identity-center',

  NETWORK_ASSOCIATIONS = 'network-associations',
  CUSTOMIZATIONS = 'customizations',
  FINALIZE = 'finalize',
}

/**
 * Accelerator module names
 *
 * @description
 * This is the list of module names for the accelerator provided by the aws-lza package
 */
export enum AcceleratorModules {
  /**
   * AWS Control Tower Landing Zone module setup module
   *
   * @description
   * For more information on WS Service control policies, please refer the [document](https://docs.aws.amazon.com/controltower/latest/userguide/what-is-control-tower.html)
   */
  SETUP_CONTROL_TOWER_LANDING_ZONE = 'control-tower-landing-zone',

  /**
   * An Example module which is executed in `PREPARE` stage
   */
  EXAMPLE_MODULE = 'example-module',
}
