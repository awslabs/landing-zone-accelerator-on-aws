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

import { NetworkConfig } from '@aws-accelerator/config';
import { MODULE_STATE_CODE } from 'aws-lza';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcceleratorResourceNames } from '../../../../lib/accelerator-resource-names';
import { TgwAssociationsAndPropagations } from '../../../../lib/actions/network/tgw-associations-and-propagations';
import { AcceleratorModules, ModuleExecutionPhase, ModuleParams } from '../../../../lib/types';
import { AcceleratorResourcePrefixes } from '../../../../utils/app-utils';

vi.mock('path', () => ({
  default: {
    parse: vi.fn(function () {
      return { name: 'tgw-associations-and-propagations' };
    }),
    basename: vi.fn(() => 'tgw-associations-and-propagations.ts'),
  },
}));

vi.mock('aws-lza', () => {
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const mockStatusLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return {
    createLogger: vi.fn(() => mockLogger),
    createStatusLogger: vi.fn(() => mockStatusLogger),
    getParametersValue: vi.fn(() => Promise.resolve([])),
    setRetryStrategy: vi.fn(),
    configureTgw: vi.fn(() =>
      Promise.resolve({
        status: 'COMPLETED',
        summary: 'TGW associations and propagations configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: 'tgw-associations-and-propagations',
        dryRun: false,
        response: { associations: [], propagations: [], dxAssociations: [], connectAttachments: [] },
      }),
    ),
    MODULE_STATE_CODE: {
      SKIPPED: 'SKIPPED',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
    },
  };
});

vi.mock('../../../../lib/actions/utils/module-state', () => ({
  hasModuleConfigChanged: vi.fn(() => Promise.resolve(true)),
  saveModuleExecutionState: vi.fn(() => Promise.resolve()),
  getModuleExecutionState: vi.fn(() =>
    Promise.resolve({ lastResponse: JSON.stringify({ response: { ownedResources: 'gz:existing' } }) }),
  ),
}));

vi.mock('../../../../lib/actions/utils/module-logging', () => ({
  logModuleExecutionResult: vi.fn(),
}));

vi.mock('../../../../lib/actions/utils/common-config', () => ({
  loadOrganizationDataSources: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('../../../../lib/actions/utils/resource-ownership-state', () => ({
  loadOwnedResources: vi.fn(() => Promise.resolve([])),
  compressOwnedResources: vi.fn((resources: string[]) =>
    resources.length === 0 ? [] : `gz:compressed-${resources.length}`,
  ),
}));

describe('TgwAssociationsAndPropagations', () => {
  const mockSessionContext = {
    invokingAccountId: 'XXXXXXXXXXXX',
    region: 'us-east-1',
    partition: 'aws',
    globalRegion: 'us-east-1',
  };

  const mockModuleItem = {
    name: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
    description: 'Configure Transit Gateway route table associations and propagations',
    runOrder: 1,
    executionPhase: ModuleExecutionPhase.DEPLOY,
    handler: vi.fn(),
  };

  const mockRunnerParameters = {
    sessionContext: mockSessionContext,
    configDirPath: '/mock/config',
    prefix: 'AWSAccelerator',
    solutionId: 'AwsSolution/SO0199/1.0.0',
    dryRun: false,
    loadOrganizationsFromDynamoDbTable: false,
  };

  const mockResourcePrefixes: AcceleratorResourcePrefixes = {
    accelerator: 'AWSAccelerator',
    bucketName: 'aws-accelerator',
    databaseName: 'aws-accelerator',
    kmsAlias: 'alias/accelerator',
    repoName: 'aws-accelerator',
    secretName: '/accelerator',
    snsTopicName: 'aws-accelerator',
    ssmParamName: '/accelerator',
    importResourcesSsmParamName: '/accelerator/imported-resources',
    trailLogName: 'aws-accelerator',
    ssmLogName: 'aws-accelerator',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockParams = (networkConfigOverrides: any = {}, globalConfigOverrides: any = {}): ModuleParams => {
    const networkConfig = {
      transitGateways: [],
      vpcs: [],
      vpcTemplates: [],
      customerGateways: [],
      directConnectGateways: [],
      ...networkConfigOverrides,
    } as unknown as NetworkConfig;

    return {
      moduleItem: mockModuleItem,
      runnerParameters: mockRunnerParameters,
      moduleRunnerParameters: {
        configs: {
          networkConfig,
          accountsConfig: {
            getAccountId: vi.fn((accountName: string) => {
              const accountMap: Record<string, string> = { Network: 'XXXXXXXXXXXX', SharedServices: 'YYYYYYYYYYYY' };
              return accountMap[accountName] ?? 'ZZZZZZZZZZZZ';
            }),
            getAccountIdsFromDeploymentTarget: vi.fn(() => ['ZZZZZZZZZZZZ']),
          } as any,
          globalConfig: {
            managementAccountAccessRole: 'AWSControlTowerExecution',
            homeRegion: 'us-east-1',
            enabledRegions: ['us-east-1'],
            ...globalConfigOverrides,
          } as any,
          securityConfig: {} as any,
          iamConfig: {} as any,
          organizationConfig: {} as any,
          customizationsConfig: {} as any,
          replacementsConfig: {} as any,
        },
        resourcePrefixes: mockResourcePrefixes,
        acceleratorResourceNames: {} as AcceleratorResourceNames,
        logging: { centralizedRegion: 'us-east-1' },
        organizationAccounts: [],
        // Distinct from globalConfig.managementAccountAccessRole so the assertion proves the module
        // forwards the runner-resolved accountAccessRoleName (honoring customDeploymentRole).
        accountAccessRoleName: 'MyCustomDeploymentRole',
      },
    };
  };

  describe('configure - skip conditions', () => {
    it('should skip when no transit gateways are configured', async () => {
      const params = createMockParams({ transitGateways: [] });

      const result = await TgwAssociationsAndPropagations.configure(params);

      expect(result.status).toBe(MODULE_STATE_CODE.SKIPPED);
      expect(result.summary).toContain('no transit gateways are configured');
      expect(result.moduleName).toBe(AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS);
    });

    it('should skip when transitGateways is undefined', async () => {
      const params = createMockParams({ transitGateways: undefined });

      const result = await TgwAssociationsAndPropagations.configure(params);

      expect(result.status).toBe(MODULE_STATE_CODE.SKIPPED);
    });

    it('should skip when config has not changed since last execution', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(false);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
      });

      const result = await TgwAssociationsAndPropagations.configure(params);

      expect(result.status).toBe(MODULE_STATE_CODE.SKIPPED);
      expect(result.summary).toContain('configuration has not changed');
    });

    it('should force execution to seed owned state when config unchanged but no ownedResources in state (post-upgrade)', async () => {
      const { hasModuleConfigChanged, getModuleExecutionState } = await import(
        '../../../../lib/actions/utils/module-state.js'
      );
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(false);
      // State exists but has no ownedResources (pre-ownership 1.16.0 state)
      vi.mocked(getModuleExecutionState).mockResolvedValue({
        serviceName: 'tgw-associations-and-propagations',
        lastExecutionTime: '2026-08-01T00:00:00Z',
        lastConfig: '{}',
        configHash: 'abc',
        lastStatus: 'completed',
        lastResponse: JSON.stringify({ status: 'completed', response: { associations: [], propagations: [] } }),
      });

      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcs: [],
      });

      const result = await TgwAssociationsAndPropagations.configure(params);

      // Module should execute (not skip) to seed the owned state
      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
    });
  });

  describe('configure - successful execution', () => {
    it('should complete successfully when config has changed', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [
          {
            name: 'main-tgw',
            account: 'Network',
            region: 'us-east-1',
            routeTables: [{ name: 'core-rt' }, { name: 'shared-rt' }],
          },
        ],
        vpcs: [
          {
            name: 'shared-vpc',
            account: 'Network',
            transitGatewayAttachments: [
              {
                name: 'shared-vpc-tgw-attach',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: ['shared-rt'],
              },
            ],
          },
        ],
      });

      const result = await TgwAssociationsAndPropagations.configure(params);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.moduleName).toBe(AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS);
      expect(result.dryRun).toBe(false);
    });

    it('should save execution state after successful completion', async () => {
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(saveModuleExecutionState).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
          status: MODULE_STATE_CODE.COMPLETED,
          dryRun: false,
        }),
        params,
        'XXXXXXXXXXXX:us-east-1',
      );
    });

    it('should call configureTgw with built request', async () => {
      const { configureTgw } = await import('aws-lza');

      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcs: [
          {
            name: 'shared-vpc',
            account: 'Network',
            transitGatewayAttachments: [
              {
                name: 'shared-vpc-tgw-attach',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(configureTgw).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'setup',
          moduleName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
          configuration: expect.objectContaining({
            enable: true,
            // Must be the runner-resolved accountAccessRoleName (honors customDeploymentRole),
            // not globalConfig.managementAccountAccessRole.
            accountAccessRoleName: 'MyCustomDeploymentRole',
            homeRegion: 'us-east-1',
            transitGateways: [
              expect.objectContaining({ name: 'main-tgw', accountId: 'XXXXXXXXXXXX', region: 'us-east-1' }),
            ],
            attachments: [
              expect.objectContaining({
                type: 'vpc',
                name: 'shared-vpc',
                attachmentName: 'shared-vpc-tgw-attach',
                transitGateway: 'main-tgw',
              }),
            ],
          }),
        }),
      );
    });

    it('should inject previously owned resources into module request configuration', async () => {
      const { configureTgw } = await import('aws-lza');
      const { loadOwnedResources } = await import('../../../../lib/actions/utils/resource-ownership-state.js');
      vi.mocked(loadOwnedResources).mockResolvedValue([
        'assoc:tgw-rtb-core:tgw-attach-111',
        'prop:tgw-rtb-core:tgw-attach-222',
      ]);

      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcs: [],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(configureTgw).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            ownedResources: ['assoc:tgw-rtb-core:tgw-attach-111', 'prop:tgw-rtb-core:tgw-attach-222'],
          }),
        }),
      );
    });

    it('should compress ownedResources before saving to state', async () => {
      const { configureTgw } = await import('aws-lza');
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');
      const { compressOwnedResources } = await import('../../../../lib/actions/utils/resource-ownership-state.js');

      // Mock configureTgw to return a response WITH ownedResources
      vi.mocked(configureTgw).mockResolvedValue({
        status: 'completed',
        summary: 'Completed: associations(+1 -0 =0 !0), propagations(+0 -0 =0)',
        timestamp: '2026-08-07T00:00:00Z',
        moduleName: 'tgw-associations-and-propagations',
        dryRun: false,
        response: {
          associations: [],
          propagations: [],
          dxAssociations: [],
          connectAttachments: [],
          ownedResources: ['assoc:tgw-rtb-core:tgw-attach-aaa', 'prop:tgw-rtb-core:tgw-attach-bbb'],
        },
      });

      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcs: [],
      });

      await TgwAssociationsAndPropagations.configure(params);

      // Verify compressOwnedResources was called with the module's returned owned set
      expect(compressOwnedResources).toHaveBeenCalledWith([
        'assoc:tgw-rtb-core:tgw-attach-aaa',
        'prop:tgw-rtb-core:tgw-attach-bbb',
      ]);

      // Verify saveModuleExecutionState received the compressed value
      expect(saveModuleExecutionState).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            response: expect.objectContaining({
              ownedResources: 'gz:compressed-2',
            }),
          }),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should extract VPN attachment config correctly', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        customerGateways: [
          {
            account: 'Network',
            region: 'us-east-1',
            ipAddress: '1.2.3.4',
            vpnConnections: [
              {
                name: 'vpn-1',
                transitGateway: 'main-tgw',
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: ['shared-rt'],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentConfig: expect.objectContaining({
            vpnAttachments: [
              {
                vpnName: 'vpn-1',
                transitGatewayName: 'main-tgw',
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: ['shared-rt'],
              },
            ],
          }),
        }),
        params,
        'XXXXXXXXXXXX:us-east-1',
      );
    });
  });

  describe('configure - VPC templates (multi-account) config mapping', () => {
    it('should use getAccountIdsFromDeploymentTarget for VPC templates', async () => {
      const { configureTgw } = await import('aws-lza');

      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcTemplates: [
          {
            name: 'workload-vpc',
            deploymentTargets: { accounts: ['WorkloadA', 'WorkloadB'] },
            region: 'us-east-1',
            transitGatewayAttachments: [
              {
                name: 'workload-tgw-attach',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      const mockGetIds = vi.mocked(
        params.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget,
      );
      mockGetIds.mockReturnValue(['111111111111', '222222222222']);

      await TgwAssociationsAndPropagations.configure(params);

      expect(mockGetIds).toHaveBeenCalledWith({ accounts: ['WorkloadA', 'WorkloadB'] });
      expect(configureTgw).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            attachments: expect.arrayContaining([
              expect.objectContaining({ type: 'vpc', name: 'workload-vpc', accountId: '111111111111' }),
              expect.objectContaining({ type: 'vpc', name: 'workload-vpc', accountId: '222222222222' }),
            ]),
          }),
        }),
      );
    });

    it('should expand VPC template attachments per account in state config', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcTemplates: [
          {
            name: 'workload-vpc',
            deploymentTargets: { accounts: ['WorkloadA', 'WorkloadB'] },
            region: 'us-east-1',
            transitGatewayAttachments: [
              {
                name: 'workload-tgw-attach',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: ['shared-rt'],
              },
            ],
          },
        ],
      });

      vi.mocked(params.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget).mockReturnValue(
        ['222222222222', '111111111111'],
      );

      await TgwAssociationsAndPropagations.configure(params);

      const currentConfig = vi.mocked(hasModuleConfigChanged).mock.calls[0][0].currentConfig as any;
      expect(currentConfig.vpcAttachments).toEqual([
        {
          vpcName: 'workload-vpc',
          accountId: '111111111111',
          region: 'us-east-1',
          transitGatewayName: 'main-tgw',
          routeTableAssociations: ['core-rt'],
          routeTablePropagations: ['shared-rt'],
        },
        {
          vpcName: 'workload-vpc',
          accountId: '222222222222',
          region: 'us-east-1',
          transitGatewayName: 'main-tgw',
          routeTableAssociations: ['core-rt'],
          routeTablePropagations: ['shared-rt'],
        },
      ]);
    });

    it('should include VPC accountId changes in state config', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const baseNetworkConfig = {
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcTemplates: [
          {
            name: 'workload-vpc',
            deploymentTargets: { accounts: ['WorkloadA'] },
            transitGatewayAttachments: [
              {
                name: 'workload-tgw-attach',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      };

      const params1 = createMockParams(baseNetworkConfig);
      vi.mocked(
        params1.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget,
      ).mockReturnValue(['111111111111']);

      await TgwAssociationsAndPropagations.configure(params1);
      const config1 = vi.mocked(hasModuleConfigChanged).mock.calls[0][0].currentConfig as any;

      const params2 = createMockParams({
        ...baseNetworkConfig,
        vpcTemplates: [
          {
            ...baseNetworkConfig.vpcTemplates[0],
            deploymentTargets: { accounts: ['WorkloadA', 'WorkloadB'] },
          },
        ],
      });
      vi.mocked(
        params2.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget,
      ).mockReturnValue(['111111111111', '222222222222']);

      await TgwAssociationsAndPropagations.configure(params2);
      const config2 = vi.mocked(hasModuleConfigChanged).mock.calls[1][0].currentConfig as any;

      expect(config1).not.toEqual(config2);
      expect(config1.vpcAttachments.map((attachment: any) => attachment.accountId)).toEqual(['111111111111']);
      expect(config2.vpcAttachments.map((attachment: any) => attachment.accountId)).toEqual([
        '111111111111',
        '222222222222',
      ]);
    });

    it('should include VPC template region in state config', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const baseNetworkConfig = {
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcTemplates: [
          {
            name: 'workload-vpc',
            deploymentTargets: { accounts: ['WorkloadA'] },
            region: 'us-east-1',
            transitGatewayAttachments: [
              {
                name: 'workload-tgw-attach',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      };

      const params1 = createMockParams(baseNetworkConfig);
      vi.mocked(
        params1.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget,
      ).mockReturnValue(['111111111111']);

      await TgwAssociationsAndPropagations.configure(params1);
      const config1 = vi.mocked(hasModuleConfigChanged).mock.calls[0][0].currentConfig as any;

      const params2 = createMockParams({
        ...baseNetworkConfig,
        vpcTemplates: [
          {
            ...baseNetworkConfig.vpcTemplates[0],
            region: 'us-west-2',
          },
        ],
      });
      vi.mocked(
        params2.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget,
      ).mockReturnValue(['111111111111']);

      await TgwAssociationsAndPropagations.configure(params2);
      const config2 = vi.mocked(hasModuleConfigChanged).mock.calls[1][0].currentConfig as any;

      expect(config1).not.toEqual(config2);
      expect(config1.vpcAttachments[0].region).toBe('us-east-1');
      expect(config2.vpcAttachments[0].region).toBe('us-west-2');
    });
  });

  describe('configure - DX Gateway config mapping', () => {
    it('should map directConnectGateways to request', async () => {
      const { configureTgw } = await import('aws-lza');

      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        directConnectGateways: [
          {
            name: 'dx-gw-1',
            account: 'Network',
            transitGatewayAssociations: [
              {
                name: 'main-tgw',
                account: 'Network',
                allowedPrefixes: ['10.0.0.0/8'],
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(configureTgw).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            directConnectGateways: [
              {
                name: 'dx-gw-1',
                accountId: 'XXXXXXXXXXXX',
                transitGatewayAssociations: [
                  expect.objectContaining({
                    name: 'main-tgw',
                    accountId: 'XXXXXXXXXXXX',
                    allowedPrefixes: ['10.0.0.0/8'],
                    routeTableAssociations: ['core-rt'],
                    routeTablePropagations: [],
                  }),
                ],
              },
            ],
          }),
        }),
      );
    });

    it('should omit directConnectGateways when none reference configured TGWs', async () => {
      const { configureTgw } = await import('aws-lza');

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-1',
            account: 'Network',
            transitGatewayAssociations: [{ name: 'other-tgw', account: 'Network', allowedPrefixes: ['10.0.0.0/8'] }],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(configureTgw).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            directConnectGateways: undefined,
          }),
        }),
      );
    });
  });

  describe('configure - account name resolution', () => {
    it('should resolve account names via getAccountId', async () => {
      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        vpcs: [
          {
            name: 'shared-vpc',
            account: 'SharedServices',
            transitGatewayAttachments: [
              {
                name: 'att-1',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
        ],
        customerGateways: [
          {
            account: 'Network',
            vpnConnections: [
              { name: 'vpn-1', transitGateway: 'main-tgw', routeTableAssociations: [], routeTablePropagations: [] },
            ],
          },
        ],
      });

      const mockGetAccountId = vi.mocked(params.moduleRunnerParameters.configs.accountsConfig.getAccountId);

      await TgwAssociationsAndPropagations.configure(params);

      expect(mockGetAccountId).toHaveBeenCalledWith('Network');
      expect(mockGetAccountId).toHaveBeenCalledWith('SharedServices');
    });
  });

  describe('configure - error on unknown account name', () => {
    it('should propagate error when getAccountId throws for unknown account', async () => {
      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'NonExistentAccount', region: 'us-east-1', routeTables: [] }],
      });

      vi.mocked(params.moduleRunnerParameters.configs.accountsConfig.getAccountId).mockImplementation(
        (name: string) => {
          if (name === 'NonExistentAccount') throw new Error(`Account name NonExistentAccount not found`);
          return 'XXXXXXXXXXXX';
        },
      );

      await expect(TgwAssociationsAndPropagations.configure(params)).rejects.toThrow(
        'Account name NonExistentAccount not found',
      );
    });
  });

  describe('configure - error handling', () => {
    it('should return FAILED when state check fails', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockRejectedValue(new Error('DynamoDB table not found'));

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
      });

      const result = await TgwAssociationsAndPropagations.configure(params);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.summary).toContain('State management failure');
      expect(result.error).toEqual({
        name: 'StateManagementError',
        message: 'DynamoDB table not found',
      });
    });

    it('should return FAILED when state save fails', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(saveModuleExecutionState).mockRejectedValue(new Error('DynamoDB write failed'));

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
      });

      const result = await TgwAssociationsAndPropagations.configure(params);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.summary).toContain('Module execution state save failed');
      expect(result.error).toEqual({
        name: 'StateSaveError',
        message: 'DynamoDB write failed',
      });
    });
  });

  describe('Bug 1 — firewall VPN filter (isIP)', () => {
    it('should exclude non-IP customer gateways from extractConfig vpnAttachments', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        customerGateways: [
          {
            account: 'Network',
            ipAddress: '10.0.0.1',
            vpnConnections: [
              {
                name: 'static-vpn',
                transitGateway: 'main-tgw',
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
          {
            account: 'Network',
            ipAddress: 'firewall-instance-id',
            vpnConnections: [
              {
                name: 'firewall-vpn',
                transitGateway: 'main-tgw',
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentConfig: expect.objectContaining({
            vpnAttachments: [expect.objectContaining({ vpnName: 'static-vpn' })],
          }),
        }),
        params,
        expect.any(String),
      );
    });

    it('should exclude non-IP customer gateways from buildTgwRequest attachments', async () => {
      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        customerGateways: [
          {
            account: 'Network',
            ipAddress: '10.0.0.1',
            vpnConnections: [
              {
                name: 'static-vpn',
                transitGateway: 'main-tgw',
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
          {
            account: 'Network',
            ipAddress: 'i-0abc123def456',
            vpnConnections: [
              {
                name: 'firewall-vpn',
                transitGateway: 'main-tgw',
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      const vpnAttachments = callArgs.configuration.attachments.filter((a: any) => a.type === 'vpn');
      expect(vpnAttachments).toHaveLength(1);
      expect(vpnAttachments[0].name).toBe('static-vpn');
    });

    it('should include IPv6 customer gateways', async () => {
      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        customerGateways: [
          {
            account: 'Network',
            ipAddress: '2001:db8::1',
            vpnConnections: [
              { name: 'ipv6-vpn', transitGateway: 'main-tgw', routeTableAssociations: [], routeTablePropagations: [] },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      const vpnAttachments = callArgs.configuration.attachments.filter((a: any) => a.type === 'vpn');
      expect(vpnAttachments).toHaveLength(1);
      expect(vpnAttachments[0].name).toBe('ipv6-vpn');
    });
  });

  describe('DX gateway state comparison', () => {
    it('should include dxGatewayAttachments in extractConfig output', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-1',
            account: 'Network',
            transitGatewayAssociations: [
              {
                name: 'main-tgw',
                account: 'Network',
                allowedPrefixes: ['10.0.0.0/8'],
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: ['shared-rt'],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentConfig: expect.objectContaining({
            dxGatewayAssociations: [
              {
                dxGatewayName: 'dx-gw-1',
                transitGatewayName: 'main-tgw',
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: ['shared-rt'],
                allowedPrefixes: ['10.0.0.0/8'],
              },
            ],
          }),
        }),
        params,
        expect.any(String),
      );
    });

    it('should detect config change when only DX gateway RT associations change', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');

      const params1 = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-1',
            account: 'Network',
            transitGatewayAssociations: [
              { name: 'main-tgw', account: 'Network', routeTableAssociations: ['core-rt'], routeTablePropagations: [] },
            ],
          },
        ],
      });

      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);
      await TgwAssociationsAndPropagations.configure(params1);
      const config1 = vi.mocked(hasModuleConfigChanged).mock.calls[0][0].currentConfig as any;

      const params2 = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-1',
            account: 'Network',
            transitGatewayAssociations: [
              {
                name: 'main-tgw',
                account: 'Network',
                routeTableAssociations: ['core-rt', 'new-rt'],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);
      await TgwAssociationsAndPropagations.configure(params2);
      const config2 = vi.mocked(hasModuleConfigChanged).mock.calls[1][0].currentConfig as any;

      expect(config1).not.toEqual(config2);
      expect(config1.dxGatewayAssociations[0].routeTableAssociations).toEqual(['core-rt']);
      expect(config2.dxGatewayAssociations[0].routeTableAssociations).toEqual(['core-rt', 'new-rt']);
    });

    it('should produce empty dxGatewayAttachments when no DX gateways configured', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentConfig: expect.objectContaining({
            dxGatewayAssociations: [],
          }),
        }),
        params,
        expect.any(String),
      );
    });
  });

  describe('Bug 2 — ASEA exclusion', () => {
    const aseaGlobalConfig = {
      externalLandingZoneResources: {
        importExternalLandingZoneResources: true,
        resourceList: [
          {
            accountId: 'XXXXXXXXXXXX',
            region: 'us-east-1',
            resourceType: 'TRANSIT_GATEWAY_ATTACHMENT',
            resourceIdentifier: 'asea-vpc/asea-vpc-tgw-attach',
            isDeleted: false,
          },
          {
            accountId: 'XXXXXXXXXXXX',
            region: 'us-east-1',
            resourceType: 'TRANSIT_GATEWAY_ASSOCIATION',
            resourceIdentifier: 'Network/main-tgw/lza-vpc-tgw-attach/asea-rt',
            isDeleted: false,
          },
          {
            accountId: 'XXXXXXXXXXXX',
            region: 'us-east-1',
            resourceType: 'TRANSIT_GATEWAY_PROPAGATION',
            resourceIdentifier: 'Network/main-tgw/lza-vpc-tgw-attach/asea-prop-rt',
            isDeleted: false,
          },
        ],
      },
    };

    it('should skip entire VPC attachment when managed by ASEA (isManagedByAseaGlobal)', async () => {
      const params = createMockParams(
        {
          transitGateways: [
            { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
          ],
          vpcs: [
            {
              name: 'asea-vpc',
              account: 'Network',
              transitGatewayAttachments: [
                {
                  name: 'asea-vpc-tgw-attach',
                  transitGateway: { name: 'main-tgw' },
                  routeTableAssociations: ['core-rt'],
                  routeTablePropagations: [],
                },
              ],
            },
            {
              name: 'lza-vpc',
              account: 'Network',
              transitGatewayAttachments: [
                {
                  name: 'lza-vpc-tgw-attach',
                  transitGateway: { name: 'main-tgw' },
                  routeTableAssociations: ['core-rt'],
                  routeTablePropagations: [],
                },
              ],
            },
          ],
        },
        aseaGlobalConfig,
      );

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      const attachmentNames = callArgs.configuration.attachments.map((a: any) => a.attachmentName ?? a.name);
      expect(attachmentNames).toContain('lza-vpc-tgw-attach');
      expect(attachmentNames).not.toContain('asea-vpc-tgw-attach');
    });

    it('should filter individual ASEA-managed associations and propagations', async () => {
      const params = createMockParams(
        {
          transitGateways: [
            {
              name: 'main-tgw',
              account: 'Network',
              region: 'us-east-1',
              routeTables: [{ name: 'core-rt' }, { name: 'asea-rt' }, { name: 'asea-prop-rt' }],
            },
          ],
          vpcs: [
            {
              name: 'lza-vpc',
              account: 'Network',
              transitGatewayAttachments: [
                {
                  name: 'lza-vpc-tgw-attach',
                  transitGateway: { name: 'main-tgw' },
                  routeTableAssociations: ['core-rt', 'asea-rt'],
                  routeTablePropagations: ['core-rt', 'asea-prop-rt'],
                },
              ],
            },
          ],
        },
        aseaGlobalConfig,
      );

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      const attachment = callArgs.configuration.attachments[0];
      expect(attachment.routeTableAssociations).toEqual(['core-rt']);
      expect(attachment.routeTablePropagations).toEqual(['core-rt']);
    });

    it('should not filter when externalLandingZoneResources is undefined', async () => {
      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcs: [
          {
            name: 'asea-vpc',
            account: 'Network',
            transitGatewayAttachments: [
              {
                name: 'asea-vpc-tgw-attach',
                transitGateway: { name: 'main-tgw' },
                routeTableAssociations: ['core-rt'],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      expect(callArgs.configuration.attachments).toHaveLength(1);
      expect(callArgs.configuration.attachments[0].attachmentName).toBe('asea-vpc-tgw-attach');
    });

    it('should not filter deleted ASEA resources', async () => {
      const params = createMockParams(
        {
          transitGateways: [
            { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
          ],
          vpcs: [
            {
              name: 'asea-vpc',
              account: 'Network',
              transitGatewayAttachments: [
                {
                  name: 'asea-vpc-tgw-attach',
                  transitGateway: { name: 'main-tgw' },
                  routeTableAssociations: ['core-rt'],
                  routeTablePropagations: [],
                },
              ],
            },
          ],
        },
        {
          externalLandingZoneResources: {
            importExternalLandingZoneResources: true,
            resourceList: [
              {
                accountId: 'XXXXXXXXXXXX',
                region: 'us-east-1',
                resourceType: 'TRANSIT_GATEWAY_ATTACHMENT',
                resourceIdentifier: 'asea-vpc/asea-vpc-tgw-attach',
                isDeleted: true,
              },
            ],
          },
        },
      );

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      expect(callArgs.configuration.attachments).toHaveLength(1);
    });
  });

  describe('configure - allowedPrefixes in state config', () => {
    it('should include allowedPrefixes in state config', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-1',
            account: 'Network',
            transitGatewayAssociations: [
              {
                name: 'main-tgw',
                account: 'Network',
                allowedPrefixes: ['10.0.0.0/8'],
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentConfig: expect.objectContaining({
            dxGatewayAssociations: [
              expect.objectContaining({
                allowedPrefixes: ['10.0.0.0/8'],
              }),
            ],
          }),
        }),
        params,
        expect.any(String),
      );
    });

    it('should default allowedPrefixes to empty array in state config', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-1',
            account: 'Network',
            transitGatewayAssociations: [
              {
                name: 'main-tgw',
                account: 'Network',
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentConfig: expect.objectContaining({
            dxGatewayAssociations: [
              expect.objectContaining({
                allowedPrefixes: [],
              }),
            ],
          }),
        }),
        params,
        expect.any(String),
      );
    });
  });

  describe('configure - DX Gateway filter (undefined vs empty array)', () => {
    it('should exclude DX gateways with undefined transitGatewayAssociations', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);
      const { configureTgw } = await import('aws-lza');

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-no-assoc',
            account: 'Network',
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      expect(configureTgw).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            directConnectGateways: undefined,
          }),
        }),
      );
    });

    it('should include DX gateways with empty transitGatewayAssociations array', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-empty-assoc',
            account: 'Network',
            transitGatewayAssociations: [],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      expect(callArgs.configuration.directConnectGateways).toHaveLength(1);
    });

    it('should include only DX gateways with defined transitGatewayAssociations when mixed', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockParams({
        transitGateways: [{ name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [] }],
        directConnectGateways: [
          {
            name: 'dx-gw-undefined',
            account: 'Network',
          },
          {
            name: 'dx-gw-with-assoc',
            account: 'Network',
            transitGatewayAssociations: [
              {
                name: 'main-tgw',
                account: 'Network',
                allowedPrefixes: ['10.0.0.0/8'],
                routeTableAssociations: [],
                routeTablePropagations: [],
              },
            ],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      expect(callArgs.configuration.directConnectGateways).toHaveLength(1);
      expect(callArgs.configuration.directConnectGateways[0].name).toBe('dx-gw-with-assoc');
    });
  });

  describe('Connect attachment config mapping', () => {
    it('should map transitGatewayConnects with RT config to connectAttachments', async () => {
      const params = createMockParams({
        transitGateways: [
          {
            name: 'main-tgw',
            account: 'Network',
            region: 'us-east-1',
            routeTables: [{ name: 'core-rt' }, { name: 'segregated-rt' }],
          },
        ],
        vpcs: [{ name: 'network-vpc', account: 'Network', region: 'us-east-1', transitGatewayAttachments: [] }],
        transitGatewayConnects: [
          {
            name: 'my-connect',
            region: 'us-east-1',
            transitGateway: { name: 'main-tgw', account: 'Network' },
            vpc: { vpcName: 'network-vpc', vpcAttachment: 'network-attach' },
            options: { protocol: 'gre' },
            routeTableAssociations: ['core-rt'],
            routeTablePropagations: ['core-rt', 'segregated-rt'],
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      expect(callArgs.configuration.connectAttachments).toHaveLength(1);
      expect(callArgs.configuration.connectAttachments[0]).toMatchObject({
        name: 'my-connect',
        transitGateway: 'main-tgw',
        transportAttachmentType: 'vpc',
        transportName: 'network-vpc',
        routeTableAssociations: ['core-rt'],
        routeTablePropagations: ['core-rt', 'segregated-rt'],
      });
    });

    it('should omit connectAttachments when none configured', async () => {
      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      expect(callArgs.configuration.connectAttachments).toBeUndefined();
    });

    it('should pass empty RT arrays when Connect has no RT config', async () => {
      const params = createMockParams({
        transitGateways: [
          { name: 'main-tgw', account: 'Network', region: 'us-east-1', routeTables: [{ name: 'core-rt' }] },
        ],
        vpcs: [{ name: 'network-vpc', account: 'Network', region: 'us-east-1', transitGatewayAttachments: [] }],
        transitGatewayConnects: [
          {
            name: 'my-connect',
            region: 'us-east-1',
            transitGateway: { name: 'main-tgw', account: 'Network' },
            vpc: { vpcName: 'network-vpc', vpcAttachment: 'network-attach' },
            options: { protocol: 'gre' },
          },
        ],
      });

      await TgwAssociationsAndPropagations.configure(params);

      const { configureTgw: mockFn } = await import('aws-lza');
      const callArgs = vi.mocked(mockFn).mock.calls[0][0] as any;
      expect(callArgs.configuration.connectAttachments).toHaveLength(1);
      expect(callArgs.configuration.connectAttachments[0].routeTableAssociations).toEqual([]);
      expect(callArgs.configuration.connectAttachments[0].routeTablePropagations).toEqual([]);
    });
  });
});
