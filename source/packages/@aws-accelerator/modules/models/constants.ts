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

import { CreateStackPolicyModule } from '../lib/actions/aws-cloudformation/create-stack-policy-module';
import { GetCloudFormationTemplatesModule } from '../lib/actions/aws-cloudformation/get-cloudformation-templates';
import { CreateOrganizationalUnitModule } from '../lib/actions/aws-organizations/create-organizational-unit';
import { InviteAccountsToOrganizationsModule } from '../lib/actions/aws-organizations/invite-accounts-to-organizations';
import { MoveAccountModule } from '../lib/actions/aws-organizations/move-accounts';
import { RegisterOrganizationalUnitModule } from '../lib/actions/control-tower/register-organizational-unit';
import { SetupControlTowerLandingZoneModule } from '../lib/actions/control-tower/setup-control-tower-landing-zone';
import { ConfigureRootUserManagementModule } from '../lib/actions/aws-iam/root-user-management';
import { SsmBlockPublicDocumentSharingModule } from '../lib/actions/aws-ssm/ssm-block-public-document-sharing';
import { AcceleratorModules, AcceleratorModuleStages, ModuleExecutionPhase } from './enums';
import { AcceleratorModuleStageDetailsType, AcceleratorModuleStageOrdersType, ModuleParams } from './types';
import { ManageAccountsAliasModule } from '../lib/actions/aws-organizations/manage-accounts-alias';

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
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.CREATE_STACK_POLICY,
        description: 'Setup Stack Policy in accounts',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await CreateStackPolicyModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.CREATE_ORGANIZATIONAL_UNIT,
        description: 'Create AWS Organizations Organizational Unit (OU)',
        runOrder: 2,
        handler: async (params: ModuleParams) => {
          return await CreateOrganizationalUnitModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
        description: 'Register AWS Organizations Organizational Unit (OU) with AWS Control Tower',
        runOrder: 3,
        handler: async (params: ModuleParams) => {
          return await RegisterOrganizationalUnitModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.INVITE_ACCOUNTS_TO_ORGANIZATIONS,
        description: 'Invite AWS Accounts to AWS Organizations',
        runOrder: 4,
        handler: async (params: ModuleParams) => {
          return await InviteAccountsToOrganizationsModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.MOVE_ACCOUNTS,
        description: 'Move AWS Accounts to destination AWS Organizations Organizational Unit (OU)',
        runOrder: 5,
        handler: async (params: ModuleParams) => {
          return await MoveAccountModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      {
        name: AcceleratorModules.ROOT_USER_MANAGEMENT,
        description: 'Configure IAM Root User Management',
        runOrder: 6,
        handler: async (params: ModuleParams) => {
          return await ConfigureRootUserManagementModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: AcceleratorModuleStages.ACCOUNTS,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.ACCOUNTS].runOrder,
    },
    modules: [
      {
        name: AcceleratorModules.MANAGE_ACCOUNTS_ALIAS,
        description: 'Manage the alias of accounts',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await ManageAccountsAliasModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
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
    modules: [
      {
        name: AcceleratorModules.SSM_BLOCK_PUBLIC_DOCUMENT_SHARING,
        description: 'Manage SSM Block Public Document Sharing across organization accounts',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await SsmBlockPublicDocumentSharingModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
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
    modules: [
      {
        name: AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES,
        description: 'Get Cloudformation Templates Cross Account',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await GetCloudFormationTemplatesModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.SYNTH,
      },
    ],
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
    modules: [
      {
        name: AcceleratorModules.CREATE_STACK_POLICY,
        description: 'Setup Stack Policy in accounts',
        runOrder: 1,
        handler: async (params: ModuleParams) => {
          return await CreateStackPolicyModule.execute(params);
        },
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
    ],
  },
  {
    stage: {
      name: AcceleratorModuleStages.ACCELERATOR_BOOTSTRAP,
      runOrder: AcceleratorModuleStageOrders[AcceleratorModuleStages.ACCELERATOR_BOOTSTRAP].runOrder,
    },
    modules: [],
  },
];

/**
 * List of module name which execution can be controlled by environment variable settings
 *
 */
export const EXECUTION_CONTROLLABLE_MODULES: string[] = [
  AcceleratorModules.CREATE_ORGANIZATIONAL_UNIT,
  AcceleratorModules.REGISTER_ORGANIZATIONAL_UNIT,
  AcceleratorModules.INVITE_ACCOUNTS_TO_ORGANIZATIONS,
  AcceleratorModules.MOVE_ACCOUNTS,
  AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
];

/**
 * Maximum number of parallel module execution
 *
 * @description
 * This is the maximum number of parallel module execution. This is used to limit the number of parallel module execution.
 */
export const MaxConcurrentModuleExecutionLimit = 50;
