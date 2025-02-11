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

import { SetupControlTowerLandingZoneModule } from '../lib/actions/setup-control-tower-landing-zone';
import { ExampleModule } from '../lib/actions/example-module';
import { AcceleratorModules, AcceleratorModuleStages } from './enums';
import { AcceleratorModuleStageDetailsType, AcceleratorModuleStageOrdersType, ModuleParams } from './types';

/**
 * Execution order for the Accelerator module stages
 * @description
 * This is the execution order for the Accelerator module stages. It is used to determine the order in which the modules of the stages are executed.
 *
 * @see AcceleratorModuleStageOrdersType
 */
export const AcceleratorModuleStageOrders: AcceleratorModuleStageOrdersType = {
  [AcceleratorModuleStages.ACCELERATOR_BOOTSTRAP]: { name: AcceleratorModuleStages.ACCELERATOR_BOOTSTRAP, runOrder: 1 },

  [AcceleratorModuleStages.PREPARE]: { name: AcceleratorModuleStages.PREPARE, runOrder: 2 },

  [AcceleratorModuleStages.ACCOUNTS]: { name: AcceleratorModuleStages.ACCOUNTS, runOrder: 3 },

  [AcceleratorModuleStages.BOOTSTRAP]: { name: AcceleratorModuleStages.BOOTSTRAP, runOrder: 4 },

  [AcceleratorModuleStages.KEY]: { name: AcceleratorModuleStages.KEY, runOrder: 5 },

  [AcceleratorModuleStages.LOGGING]: { name: AcceleratorModuleStages.LOGGING, runOrder: 6 },

  [AcceleratorModuleStages.ORGANIZATIONS]: { name: AcceleratorModuleStages.ORGANIZATIONS, runOrder: 7 },

  [AcceleratorModuleStages.SECURITY_AUDIT]: { name: AcceleratorModuleStages.SECURITY_AUDIT, runOrder: 8 },

  [AcceleratorModuleStages.NETWORK_PREP]: { name: AcceleratorModuleStages.NETWORK_PREP, runOrder: 9 },
  [AcceleratorModuleStages.SECURITY]: { name: AcceleratorModuleStages.SECURITY, runOrder: 9 },
  [AcceleratorModuleStages.OPERATIONS]: { name: AcceleratorModuleStages.OPERATIONS, runOrder: 9 },

  [AcceleratorModuleStages.NETWORK_VPC]: { name: AcceleratorModuleStages.NETWORK_VPC, runOrder: 10 },
  [AcceleratorModuleStages.SECURITY_RESOURCES]: { name: AcceleratorModuleStages.SECURITY_RESOURCES, runOrder: 10 },
  [AcceleratorModuleStages.IDENTITY_CENTER]: { name: AcceleratorModuleStages.IDENTITY_CENTER, runOrder: 10 },

  [AcceleratorModuleStages.NETWORK_ASSOCIATIONS]: { name: AcceleratorModuleStages.NETWORK_ASSOCIATIONS, runOrder: 11 },

  [AcceleratorModuleStages.CUSTOMIZATIONS]: { name: AcceleratorModuleStages.CUSTOMIZATIONS, runOrder: 12 },

  [AcceleratorModuleStages.FINALIZE]: { name: AcceleratorModuleStages.FINALIZE, runOrder: 13 },
};

/**
 * Accelerator Module details
 *
 * @description
 * This is the list of all the accelerator module stages. This data structure holds various module stages and respective modules for each stages to be executed by the runner
 * @see AcceleratorModuleStageDetailsType
 */
export const AcceleratorModuleStageDetails: AcceleratorModuleStageDetailsType[] = [
  {
    stage: {
      name: AcceleratorModuleStages.PREPARE,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.PREPARE].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
        description: 'Manage AWS Control Tower Landing Zone',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await SetupControlTowerLandingZoneModule.execute(params);
        },
      },
      {
        name: AcceleratorModules.EXAMPLE_MODULE,
        runOrder: 2,
        description:
          'An Example module which is executed in PREPARE stage. This module is used to demonstrate the usage of the AWS Security Hub module to configure the service across the organization',
        handler: async (params: ModuleParams) => {
          return await ExampleModule.execute(params, AcceleratorModuleStages.PREPARE);
        },
      },
    ],
  },
  {
    stage: {
      name: AcceleratorModuleStages.ACCOUNTS,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.ACCOUNTS].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.BOOTSTRAP,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.BOOTSTRAP].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.KEY,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.KEY].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.LOGGING,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.LOGGING].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.ORGANIZATIONS,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.ORGANIZATIONS].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.SECURITY_AUDIT,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.SECURITY_AUDIT].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.NETWORK_PREP,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.NETWORK_PREP].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.SECURITY,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.SECURITY].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.OPERATIONS,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.OPERATIONS].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.NETWORK_VPC,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.NETWORK_VPC].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.SECURITY_RESOURCES,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.SECURITY_RESOURCES].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.IDENTITY_CENTER,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.IDENTITY_CENTER].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.NETWORK_ASSOCIATIONS,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.NETWORK_ASSOCIATIONS].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.CUSTOMIZATIONS,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.CUSTOMIZATIONS].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.FINALIZE,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.FINALIZE].runOrder,
    },
    modules: [],
  },
  {
    stage: {
      name: AcceleratorModuleStages.ACCELERATOR_BOOTSTRAP,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.ACCELERATOR_BOOTSTRAP].runOrder,
    },
    modules: [],
  },
];
