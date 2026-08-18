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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi } from 'vitest';
import type { ModuleParams } from '../../lib/types';

const mockExecuteFns = vi.hoisted(() => ({
  PipelinePrerequisites: vi.fn().mockResolvedValue('ok'),
  CreateOrganizationalUnitModule: vi.fn().mockResolvedValue('ok'),
  InviteAccountsToOrganizationsModule: vi.fn().mockResolvedValue('ok'),
  MoveAccountModule: vi.fn().mockResolvedValue('ok'),
  SetupControlTowerLandingZoneModule: vi.fn().mockResolvedValue('ok'),
  RegisterOrganizationalUnitModule: vi.fn().mockResolvedValue('ok'),
  ConfigureRootUserManagementModule: vi.fn().mockResolvedValue('ok'),
  CreateStackPolicyModule: vi.fn().mockResolvedValue('ok'),
  EnrollAccountsModule: vi.fn().mockResolvedValue('ok'),
  ManageAccountsAliasModule: vi.fn().mockResolvedValue('ok'),
  AcceleratorPrerequisites: vi.fn().mockResolvedValue('ok'),
  SsmBlockPublicDocumentSharingModule: vi.fn().mockResolvedValue('ok'),
  ManageAutomationRulesModule: vi.fn().mockResolvedValue('ok'),
  GetCloudFormationTemplatesModule: vi.fn().mockResolvedValue('ok'),
}));

vi.mock('../../../modules/lib/actions/prerequisites/pipeline-prerequisites', () => ({
  PipelinePrerequisites: { execute: mockExecuteFns.PipelinePrerequisites },
}));
vi.mock('../../../modules/lib/actions/aws-organizations/create-organizational-unit', () => ({
  CreateOrganizationalUnitModule: { execute: mockExecuteFns.CreateOrganizationalUnitModule },
}));
vi.mock('../../../modules/lib/actions/aws-organizations/invite-accounts-to-organizations', () => ({
  InviteAccountsToOrganizationsModule: { execute: mockExecuteFns.InviteAccountsToOrganizationsModule },
}));
vi.mock('../../../modules/lib/actions/aws-organizations/move-accounts', () => ({
  MoveAccountModule: { execute: mockExecuteFns.MoveAccountModule },
}));
vi.mock('../../../modules/lib/actions/control-tower/setup-control-tower-landing-zone', () => ({
  SetupControlTowerLandingZoneModule: { execute: mockExecuteFns.SetupControlTowerLandingZoneModule },
}));
vi.mock('../../../modules/lib/actions/control-tower/register-organizational-unit', () => ({
  RegisterOrganizationalUnitModule: { execute: mockExecuteFns.RegisterOrganizationalUnitModule },
}));
vi.mock('../../../modules/lib/actions/aws-iam/root-user-management', () => ({
  ConfigureRootUserManagementModule: { execute: mockExecuteFns.ConfigureRootUserManagementModule },
}));
vi.mock('../../../modules/lib/actions/aws-cloudformation/create-stack-policy-module', () => ({
  CreateStackPolicyModule: { execute: mockExecuteFns.CreateStackPolicyModule },
}));
vi.mock('../../../modules/lib/actions/control-tower/enroll-accounts', () => ({
  EnrollAccountsModule: { execute: mockExecuteFns.EnrollAccountsModule },
}));
vi.mock('../../../modules/lib/actions/aws-organizations/manage-accounts-alias', () => ({
  ManageAccountsAliasModule: { execute: mockExecuteFns.ManageAccountsAliasModule },
}));
vi.mock('../../../modules/lib/actions/prerequisites/accelerator-prerequisites', () => ({
  AcceleratorPrerequisites: { execute: mockExecuteFns.AcceleratorPrerequisites },
}));
vi.mock('../../../modules/lib/actions/aws-ssm/ssm-block-public-document-sharing', () => ({
  SsmBlockPublicDocumentSharingModule: { execute: mockExecuteFns.SsmBlockPublicDocumentSharingModule },
}));
vi.mock('../../../modules/lib/actions/aws-security-hub/manage-automation-rules', () => ({
  ManageAutomationRulesModule: { execute: mockExecuteFns.ManageAutomationRulesModule },
}));
vi.mock('../../../modules/lib/actions/aws-cloudformation/get-cloudformation-templates', () => ({
  GetCloudFormationTemplatesModule: { execute: mockExecuteFns.GetCloudFormationTemplatesModule },
}));
vi.mock('../../lib/actions/security/amazon-macie', () => ({
  AmazonMacie: { configure: vi.fn() },
}));
vi.mock('../../lib/actions/resource-retention/stack-resources', () => ({
  StackResources: {
    retain: vi.fn().mockResolvedValue({
      status: 'success',
      summary: 'ok',
      moduleName: 'stack-resources-retention',
      dryRun: false,
      timestamp: new Date().toISOString(),
    }),
  },
}));
vi.mock('../../lib/actions/aws-organizations/tag-and-backup-policy-account-attachments', () => ({
  TagAndBackupPolicyAccountAttachments: { configure: vi.fn() },
}));

import {
  AcceleratorModuleStageDetails,
  AcceleratorModuleStageOrders,
  EXECUTION_CONTROLLABLE_MODULES,
} from '../../lib/module-orchestration';
import { AcceleratorModules, MODULE_SUPPORTED_STAGES, ModuleExecutionPhase } from '../../lib/types';

function createMockModuleParams(): ModuleParams {
  return {
    moduleItem: {
      name: AcceleratorModules.PIPELINE_PREREQUISITES,
      description: 'test',
      runOrder: 1,
      handler: vi.fn(),
      executionPhase: ModuleExecutionPhase.DEPLOY,
    },
    runnerParameters: {
      sessionContext: {
        invokingAccountId: '123456789012',
        region: 'us-west-2',
        globalRegion: 'us-east-1',
        partition: 'aws',
      },
      configDirPath: '/tmp/config',
      prefix: 'AWSAccelerator',
      solutionId: 'AwsSolution/SO0199/v1.0.0',
      dryRun: false,
      stage: 'prepare',
      loadOrganizationsFromDynamoDbTable: false,
    },
    moduleRunnerParameters: {
      configs: {} as any,
      resourcePrefixes: { accelerator: 'AWSAccelerator' } as any,
      acceleratorResourceNames: {} as any,
      logging: { centralizedRegion: 'us-east-1' },
      organizationAccounts: [],
    },
    stage: 'prepare',
  } as ModuleParams;
}

describe('module-orchestration', () => {
  describe('legacyHandler adapter (tested via stage handlers)', () => {
    function findPipelinePrerequisitesModule() {
      const prepare = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.PREPARE)!;
      return prepare.modules.find(m => m.name === AcceleratorModules.PIPELINE_PREREQUISITES)!;
    }

    it('should convert sessionContext fields to legacy runnerParameters', async () => {
      const module = findPipelinePrerequisitesModule();
      const params = createMockModuleParams();

      await module.handler(params);

      const legacyParams = mockExecuteFns.PipelinePrerequisites.mock.calls[0][0];
      expect(legacyParams.runnerParameters.partition).toBe('aws');
      expect(legacyParams.runnerParameters.region).toBe('us-west-2');
      expect(legacyParams.runnerParameters.configDirPath).toBe('/tmp/config');
      expect(legacyParams.runnerParameters.prefix).toBe('AWSAccelerator');
      expect(legacyParams.runnerParameters.solutionId).toBe('AwsSolution/SO0199/v1.0.0');
      expect(legacyParams.runnerParameters.dryRun).toBe(false);
      expect(legacyParams.runnerParameters.stage).toBe('prepare');
    });

    it('should default useExistingRoles to false', async () => {
      const module = findPipelinePrerequisitesModule();
      await module.handler(createMockModuleParams());

      const legacyParams = mockExecuteFns.PipelinePrerequisites.mock.calls[0][0];
      expect(legacyParams.runnerParameters.useExistingRoles).toBe(false);
    });

    it('should default maxConcurrentExecution to 50', async () => {
      const module = findPipelinePrerequisitesModule();
      await module.handler(createMockModuleParams());

      const legacyParams = mockExecuteFns.PipelinePrerequisites.mock.calls[0][0];
      expect(legacyParams.runnerParameters.maxConcurrentExecution).toBe(50);
    });

    it('should map globalRegion from sessionContext', async () => {
      const module = findPipelinePrerequisitesModule();
      await module.handler(createMockModuleParams());

      const legacyParams = mockExecuteFns.PipelinePrerequisites.mock.calls[0][0];
      expect(legacyParams.moduleRunnerParameters.globalRegion).toBe('us-east-1');
    });

    it('should pass through moduleRunnerParameters fields', async () => {
      const module = findPipelinePrerequisitesModule();
      await module.handler(createMockModuleParams());

      const legacyParams = mockExecuteFns.PipelinePrerequisites.mock.calls[0][0];
      expect(legacyParams.moduleRunnerParameters.logging.centralizedRegion).toBe('us-east-1');
      expect(legacyParams.moduleRunnerParameters.organizationAccounts).toEqual([]);
    });

    it('should pass through stage', async () => {
      const module = findPipelinePrerequisitesModule();
      const params = createMockModuleParams();
      params.stage = 'security';
      mockExecuteFns.PipelinePrerequisites.mockClear();
      await module.handler(params);

      const legacyParams = mockExecuteFns.PipelinePrerequisites.mock.calls[0][0];
      expect(legacyParams.stage).toBe('security');
    });

    it('should return the handler result wrapped in IModuleResponse', async () => {
      mockExecuteFns.PipelinePrerequisites.mockResolvedValueOnce('pipeline done');
      const module = findPipelinePrerequisitesModule();

      const result = await module.handler(createMockModuleParams());
      expect((result as any).status).toBe('success');
      expect((result as any).summary).toBe('pipeline done');
      expect((result as any).moduleName).toBe('pipeline-prerequisites');
      expect((result as any).dryRun).toBe(false);
      expect((result as any).timestamp).toBeDefined();
    });

    it('should propagate handler errors', async () => {
      mockExecuteFns.PipelinePrerequisites.mockRejectedValueOnce(new Error('boom'));
      const module = findPipelinePrerequisitesModule();

      await expect(module.handler(createMockModuleParams())).rejects.toThrow('boom');
    });
  });

  describe('AcceleratorModuleStageOrders', () => {
    it('should define orders for all supported stages', () => {
      for (const stage of Object.values(MODULE_SUPPORTED_STAGES)) {
        expect(AcceleratorModuleStageOrders[stage]).toBeDefined();
        expect(AcceleratorModuleStageOrders[stage].runOrder).toBeGreaterThan(0);
      }
    });

    it('should have PREPARE as the first stage', () => {
      expect(AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.PREPARE].runOrder).toBe(1);
    });

    it('should have FINALIZE as the last stage', () => {
      const maxOrder = Math.max(...Object.values(AcceleratorModuleStageOrders).map(s => s.runOrder));
      expect(AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.FINALIZE].runOrder).toBe(maxOrder);
    });

    it('should run SECURITY_AUDIT after the Organizations deployment stage', () => {
      expect(AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.SECURITY_AUDIT].runOrder).toBeGreaterThan(
        AcceleratorModuleStageOrders[MODULE_SUPPORTED_STAGES.ORGANIZATIONS].runOrder,
      );
    });
  });

  describe('AcceleratorModuleStageDetails', () => {
    it('should have an entry for each supported stage', () => {
      const stageNames = AcceleratorModuleStageDetails.map(d => d.stage.name);
      for (const stage of Object.values(MODULE_SUPPORTED_STAGES)) {
        expect(stageNames).toContain(stage);
      }
    });

    it('should have modules registered in PREPARE stage', () => {
      const prepare = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.PREPARE);
      expect(prepare?.modules.length).toBeGreaterThan(0);
    });

    it('should have modules registered in ACCOUNTS stage', () => {
      const accounts = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.ACCOUNTS);
      expect(accounts?.modules.length).toBeGreaterThan(0);
    });

    it('should have modules registered in LOGGING stage', () => {
      const logging = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.LOGGING);
      expect(logging?.modules.length).toBeGreaterThan(0);
    });

    it('should have modules registered in SECURITY stage', () => {
      const security = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.SECURITY);
      expect(security?.modules.length).toBeGreaterThan(0);
    });

    it('should register tag and backup policy account attachments in SECURITY_AUDIT deploy phase', () => {
      const securityAudit = AcceleratorModuleStageDetails.find(
        detail => detail.stage.name === MODULE_SUPPORTED_STAGES.SECURITY_AUDIT,
      );
      const module = securityAudit?.modules.find(
        item => item.name === AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
      );

      expect(module?.executionPhase).toBe(ModuleExecutionPhase.DEPLOY);
    });

    it('should have modules registered in NETWORK_VPC stage', () => {
      const networkVpc = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.NETWORK_VPC);
      expect(networkVpc?.modules.length).toBeGreaterThan(0);
    });

    it('should have modules registered in FINALIZE stage', () => {
      const finalize = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.FINALIZE);
      expect(finalize?.modules.length).toBeGreaterThan(0);
    });

    it('should have GET_CLOUDFORMATION_TEMPLATES in SYNTH phase', () => {
      const networkVpc = AcceleratorModuleStageDetails.find(d => d.stage.name === MODULE_SUPPORTED_STAGES.NETWORK_VPC);
      const cfnModule = networkVpc?.modules.find(m => m.name === AcceleratorModules.GET_CLOUDFORMATION_TEMPLATES);
      expect(cfnModule?.executionPhase).toBe(ModuleExecutionPhase.SYNTH);
    });

    it('should have consistent runOrder with AcceleratorModuleStageOrders', () => {
      for (const detail of AcceleratorModuleStageDetails) {
        const expectedOrder = AcceleratorModuleStageOrders[detail.stage.name].runOrder;
        expect(detail.stage.runOrder).toBe(expectedOrder);
      }
    });
  });

  describe('EXECUTION_CONTROLLABLE_MODULES', () => {
    it('should contain all AcceleratorModules values', () => {
      for (const moduleName of Object.values(AcceleratorModules)) {
        expect(EXECUTION_CONTROLLABLE_MODULES).toContain(moduleName);
      }
    });
  });
});
