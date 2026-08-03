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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TransitGatewayAttachmentLookup } from '../../../lib/transit-gateway/transit-gateway-attachment-lookup';
import { ITgwModuleRequest, ITgwModuleConfiguration } from '../../../lib/transit-gateway/interfaces';
import { IAssumeRoleCredential } from '../../../lib/common/interfaces';
import { IGetSsmParametersValueHandlerParameter, ISsmParameterValue } from '../../../interfaces/aws-ssm/get-parameters';

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: vi.fn(),
  DescribeTransitGatewayAttachmentsCommand: vi.fn(),
  DescribeVpnConnectionsCommand: vi.fn(),
}));

const mockSsmHandler = vi.fn();
vi.mock('../../../lib/aws-ssm/get-parameters', () => ({
  GetSsmParametersValueModule: vi.fn().mockImplementation(function () {
    return { handler: mockSsmHandler };
  }),
}));

vi.mock('../../../lib/common/sts-functions', () => ({ getCredentials: vi.fn() }));
vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  setRetryStrategy: vi.fn(function () {
    return {};
  }),
}));
vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(function () {
    return { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  }),
}));

const MOCK_CONSTANTS = {
  invokingAccountId: '111111111111',
  region: 'us-east-1',
  partition: 'aws',
  ssmPrefix: '/accelerator',
  logPrefix: '111111111111:us-east-1',
  solutionId: 'test-solution',
  credentials: {
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'secretTest',
    sessionToken: 'tokenTest',
  } as IAssumeRoleCredential,
};

function ssmResults(entries: Record<string, string>): ISsmParameterValue[] {
  return Object.entries(entries).map(([name, value]) => ({ name, value, exists: true }));
}

function buildProps(configOverrides?: Partial<ITgwModuleConfiguration>): ITgwModuleRequest {
  return {
    operation: 'configure',
    invokingAccountId: MOCK_CONSTANTS.invokingAccountId,
    region: MOCK_CONSTANTS.region,
    globalRegion: MOCK_CONSTANTS.region,
    partition: MOCK_CONSTANTS.partition,
    solutionId: MOCK_CONSTANTS.solutionId,
    credentials: MOCK_CONSTANTS.credentials,
    configuration: {
      enable: true,
      accountAccessRoleName: 'AWSControlTowerExecution',
      transitGateways: [],
      attachments: [],
      dataSources: { ssmParameterPrefix: MOCK_CONSTANTS.ssmPrefix },
      ...configOverrides,
    },
  };
}

describe('TransitGatewayAttachmentLookup', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockGetCredentials: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecuteApi = vi.mocked((await import('../../../lib/common/utility')).executeApi);
    mockGetCredentials = vi.mocked((await import('../../../lib/common/sts-functions')).getCredentials);
  });

  /** Helper: mock the two-step VPN lookup (DescribeVpnConnections + DescribeTransitGatewayAttachments) */
  function mockVpnLookup(vpnConnectionId: string, tgwAttachmentId: string, tgwId: string, vpnName = 'vpn-to-dc') {
    mockExecuteApi
      .mockResolvedValueOnce({
        VpnConnections: [
          { VpnConnectionId: vpnConnectionId, TransitGatewayId: tgwId, Tags: [{ Key: 'Name', Value: vpnName }] },
        ],
      })
      .mockResolvedValueOnce({
        TransitGatewayAttachments: [
          {
            TransitGatewayAttachmentId: tgwAttachmentId,
            TransitGatewayId: tgwId,
            ResourceId: vpnConnectionId,
            State: 'available',
          },
        ],
      });
  }

  describe('resolveAttachments', () => {
    test('should return empty context when no transit gateways configured', async () => {
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(
        buildProps({ transitGateways: [] }),
        MOCK_CONSTANTS.logPrefix,
      );
      expect(result.transitGatewayIds.size).toBe(0);
      expect(mockSsmHandler).not.toHaveBeenCalled();
    });

    test('should resolve TGW IDs via SSM', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.transitGatewayIds.get('main')).toBe('tgw-111');
    });

    test('should resolve route table IDs via SSM', async () => {
      const props = buildProps({
        transitGateways: [
          {
            name: 'main',
            accountId: MOCK_CONSTANTS.invokingAccountId,
            region: MOCK_CONSTANTS.region,
            routeTables: [{ name: 'core' }, { name: 'shared' }],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(
        ssmResults({
          '/accelerator/network/transitGateways/main/id': 'tgw-111',
          '/accelerator/network/transitGateways/main/routeTables/core/id': 'rtb-aaa',
          '/accelerator/network/transitGateways/main/routeTables/shared/id': 'rtb-bbb',
        }),
      );
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.routeTableIds.get('main_core')).toBe('rtb-aaa');
      expect(result.routeTableIds.get('main_shared')).toBe('rtb-bbb');
    });

    test('should resolve VPC attachment IDs via SSM with fallback name', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'SharedVpc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(
        ssmResults({
          '/accelerator/network/transitGateways/main/id': 'tgw-111',
          '/accelerator/network/vpc/SharedVpc/transitGatewayAttachment/SharedVpc/id': 'tgw-attach-vpc-1',
        }),
      );
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.attachmentIds.get('main_222222222222_SharedVpc')).toBe('tgw-attach-vpc-1');
    });

    test('should use attachmentName for SSM path when provided', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'SharedVpc',
            attachmentName: 'CustomAttachName',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(
        ssmResults({
          '/accelerator/network/transitGateways/main/id': 'tgw-111',
          '/accelerator/network/vpc/SharedVpc/transitGatewayAttachment/CustomAttachName/id': 'tgw-attach-1',
        }),
      );
      await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(mockSsmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.arrayContaining([
            expect.objectContaining({
              name: '/accelerator/network/vpc/SharedVpc/transitGatewayAttachment/CustomAttachName/id',
            }),
          ]),
        }),
      );
    });

    test('should pass assumeRoleArn for cross-account SSM parameters', async () => {
      const props = buildProps({
        transitGateways: [{ name: 'main', accountId: '333333333333', region: MOCK_CONSTANTS.region, routeTables: [] }],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(mockSsmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.arrayContaining([
            expect.objectContaining({ assumeRoleArn: 'arn:aws:iam::333333333333:role/AWSControlTowerExecution' }),
          ]),
        }),
      );
    });

    test('should not pass assumeRoleArn for same-account SSM parameters', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(mockSsmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.arrayContaining([expect.objectContaining({ assumeRoleArn: undefined })]),
        }),
      );
    });

    test('should throw when SSM parameter not found', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
      });
      mockSsmHandler.mockResolvedValue([{ name: '/accelerator/network/transitGateways/main/id', exists: false }]);
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        'SSM parameter not found',
      );
    });

    test('should throw when VPC attachment references unknown TGW', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'SharedVpc',
            accountId: '222222222222',
            transitGateway: 'nonexistent',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        "TGW 'nonexistent' not found in config",
      );
    });
  });

  describe('VPN attachment resolution', () => {
    test('should skip VPN resolution when no VPN attachments configured', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should resolve VPN attachment via two-step lookup (DescribeVpnConnections + DescribeTransitGatewayAttachments)', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockVpnLookup('vpn-conn-111', 'tgw-attach-vpn-1', 'tgw-111');
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.attachmentIds.get('main_222222222222_vpn-to-dc')).toBe('tgw-attach-vpn-1');
    });

    test('should skip non-available VPN TGW attachments', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockExecuteApi
        .mockResolvedValueOnce({
          VpnConnections: [
            {
              VpnConnectionId: 'vpn-conn-111',
              TransitGatewayId: 'tgw-111',
              Tags: [{ Key: 'Name', Value: 'vpn-to-dc' }],
            },
          ],
        })
        .mockResolvedValueOnce({
          TransitGatewayAttachments: [
            {
              TransitGatewayAttachmentId: 'tgw-attach-vpn-1',
              TransitGatewayId: 'tgw-111',
              ResourceId: 'vpn-conn-111',
              State: 'deleting',
            },
          ],
        });
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        'VPN TGW attachments not found',
      );
    });

    test('should throw when VPN attachment references unknown TGW', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'nonexistent',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        "TGW 'nonexistent' not found in config",
      );
    });

    test('should throw when no VPN connection found with matching name', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockExecuteApi.mockResolvedValueOnce({ VpnConnections: [] });
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        "No VPN connection found with name 'vpn-to-dc'",
      );
    });

    test('should throw when multiple VPN connections found with same name', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockExecuteApi.mockResolvedValueOnce({
        VpnConnections: [
          { VpnConnectionId: 'vpn-1', TransitGatewayId: 'tgw-111', Tags: [{ Key: 'Name', Value: 'vpn-to-dc' }] },
          { VpnConnectionId: 'vpn-2', TransitGatewayId: 'tgw-111', Tags: [{ Key: 'Name', Value: 'vpn-to-dc' }] },
        ],
      });
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        "Multiple VPN connections found with name 'vpn-to-dc'",
      );
    });

    test('should assume credentials for cross-account VPN lookups', async () => {
      const props = buildProps({
        transitGateways: [{ name: 'main', accountId: '333333333333', region: 'eu-west-1', routeTables: [] }],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);
      mockVpnLookup('vpn-conn-111', 'tgw-attach-vpn-1', 'tgw-111');
      await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(mockGetCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: '333333333333', region: 'eu-west-1' }),
      );
    });

    test('should paginate through TGW attachment describe results', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockExecuteApi
        .mockResolvedValueOnce({
          VpnConnections: [
            {
              VpnConnectionId: 'vpn-conn-111',
              TransitGatewayId: 'tgw-111',
              Tags: [{ Key: 'Name', Value: 'vpn-to-dc' }],
            },
          ],
        })
        .mockResolvedValueOnce({ TransitGatewayAttachments: [], NextToken: 'page-2' })
        .mockResolvedValueOnce({
          TransitGatewayAttachments: [
            {
              TransitGatewayAttachmentId: 'tgw-attach-vpn-1',
              TransitGatewayId: 'tgw-111',
              ResourceId: 'vpn-conn-111',
              State: 'available',
            },
          ],
        });
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.attachmentIds.get('main_222222222222_vpn-to-dc')).toBe('tgw-attach-vpn-1');
      expect(mockExecuteApi).toHaveBeenCalledTimes(3);
    });

    test('should throw when VPN TGW attachment not found after pagination', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockExecuteApi
        .mockResolvedValueOnce({
          VpnConnections: [
            {
              VpnConnectionId: 'vpn-conn-111',
              TransitGatewayId: 'tgw-111',
              Tags: [{ Key: 'Name', Value: 'vpn-to-dc' }],
            },
          ],
        })
        .mockResolvedValueOnce({ TransitGatewayAttachments: [] });
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        'VPN TGW attachments not found in us-east-1: vpn-to-dc on main',
      );
    });

    test('should use original credentials when getCredentials returns undefined', async () => {
      const props = buildProps({
        transitGateways: [{ name: 'main', accountId: '333333333333', region: 'eu-west-1', routeTables: [] }],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-to-dc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockGetCredentials.mockResolvedValue(undefined);
      mockVpnLookup('vpn-conn-111', 'tgw-attach-vpn-1', 'tgw-111');
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.attachmentIds.get('main_222222222222_vpn-to-dc')).toBe('tgw-attach-vpn-1');
    });

    test('should use CGW account creds for DescribeVpnConnections and TGW account creds for DescribeTransitGatewayAttachments', async () => {
      const cgwAccountId = '222222222222';
      const tgwAccountId = '333333333333';
      const props = buildProps({
        transitGateways: [{ name: 'main', accountId: tgwAccountId, region: MOCK_CONSTANTS.region, routeTables: [] }],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-cross',
            accountId: cgwAccountId,
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      const cgwCreds = { accessKeyId: 'CGW_KEY', secretAccessKey: 'cgw', sessionToken: 'cgw' };
      const tgwCreds = { accessKeyId: 'TGW_KEY', secretAccessKey: 'tgw', sessionToken: 'tgw' };
      mockGetCredentials.mockImplementation(async (params: { accountId: string }) => {
        if (params.accountId === cgwAccountId) return cgwCreds;
        if (params.accountId === tgwAccountId) return tgwCreds;
        return undefined;
      });
      mockVpnLookup('vpn-conn-111', 'tgw-attach-vpn-1', 'tgw-111', 'vpn-cross');

      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);

      expect(result.attachmentIds.get('main_222222222222_vpn-cross')).toBe('tgw-attach-vpn-1');
      expect(mockGetCredentials).toHaveBeenCalledWith(expect.objectContaining({ accountId: cgwAccountId }));
      expect(mockGetCredentials).toHaveBeenCalledWith(expect.objectContaining({ accountId: tgwAccountId }));
    });

    test('should resolve cross-account VPN when CGW and TGW are in different accounts', async () => {
      const props = buildProps({
        transitGateways: [{ name: 'main', accountId: '333333333333', region: MOCK_CONSTANTS.region, routeTables: [] }],
        attachments: [
          {
            type: 'vpn',
            name: 'vpn-cross',
            accountId: '444444444444',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(ssmResults({ '/accelerator/network/transitGateways/main/id': 'tgw-111' }));
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);
      mockVpnLookup('vpn-conn-cross', 'tgw-attach-cross', 'tgw-111', 'vpn-cross');

      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);

      expect(result.attachmentIds.get('main_444444444444_vpn-cross')).toBe('tgw-attach-cross');
      const calledAccountIds = mockGetCredentials.mock.calls.map(
        (c: unknown[]) => (c[0] as { accountId: string }).accountId,
      );
      expect(calledAccountIds).toContain('444444444444');
      expect(calledAccountIds).toContain('333333333333');
    });
  });

  describe('SSM entry edge cases', () => {
    test('should return early when no transit gateways configured', async () => {
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(
        buildProps({ transitGateways: [], attachments: [] }),
        MOCK_CONSTANTS.logPrefix,
      );
      expect(result.transitGatewayIds.size).toBe(0);
      expect(mockSsmHandler).not.toHaveBeenCalled();
    });
  });

  describe('Describe API fallback path', () => {
    test('should throw not-implemented error when ssmParameterPrefix is not provided', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        dataSources: {},
      });
      await expect(TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        'Describe API resolution path not yet implemented',
      );
    });
  });

  describe('batch SSM resolution', () => {
    test('should resolve multiple VPC attachments in a single SSM batch call', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'VpcA',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
          {
            type: 'vpc',
            name: 'VpcB',
            accountId: '333333333333',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });
      mockSsmHandler.mockResolvedValue(
        ssmResults({
          '/accelerator/network/transitGateways/main/id': 'tgw-111',
          '/accelerator/network/vpc/VpcA/transitGatewayAttachment/VpcA/id': 'tgw-attach-a',
          '/accelerator/network/vpc/VpcB/transitGatewayAttachment/VpcB/id': 'tgw-attach-b',
        }),
      );
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.attachmentIds.get('main_222222222222_VpcA')).toBe('tgw-attach-a');
      expect(result.attachmentIds.get('main_333333333333_VpcB')).toBe('tgw-attach-b');
      expect(mockSsmHandler).toHaveBeenCalledTimes(1);
    });

    test('should resolve multiple TGWs in different accounts in one batch', async () => {
      const props = buildProps({
        transitGateways: [
          {
            name: 'tgw-east',
            accountId: MOCK_CONSTANTS.invokingAccountId,
            region: MOCK_CONSTANTS.region,
            routeTables: [],
          },
          { name: 'tgw-west', accountId: '999999999999', region: 'us-west-2', routeTables: [] },
        ],
      });
      mockSsmHandler.mockResolvedValue(
        ssmResults({
          '/accelerator/network/transitGateways/tgw-east/id': 'tgw-111',
          '/accelerator/network/transitGateways/tgw-west/id': 'tgw-222',
        }),
      );
      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);
      expect(result.transitGatewayIds.get('tgw-east')).toBe('tgw-111');
      expect(result.transitGatewayIds.get('tgw-west')).toBe('tgw-222');
      expect(mockSsmHandler).toHaveBeenCalledTimes(1);

      const config = mockSsmHandler.mock.calls[0][0].configuration;
      const westEntry = config.find((c: { name: string }) => c.name.includes('tgw-west'));
      expect(westEntry.assumeRoleArn).toContain('999999999999');
    });

    test('should resolve duplicate VPC attachment parameter names by logical key', async () => {
      const props = buildProps({
        transitGateways: [
          { name: 'main', accountId: MOCK_CONSTANTS.invokingAccountId, region: MOCK_CONSTANTS.region, routeTables: [] },
        ],
        attachments: [
          {
            type: 'vpc',
            name: 'SharedVpc',
            accountId: '222222222222',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
          {
            type: 'vpc',
            name: 'SharedVpc',
            accountId: '333333333333',
            transitGateway: 'main',
            routeTableAssociations: [],
            routeTablePropagations: [],
          },
        ],
      });

      mockSsmHandler.mockImplementation(async (input: IGetSsmParametersValueHandlerParameter) =>
        input.configuration.map(entry => {
          if (entry.name.includes('/transitGateways/main/id')) {
            return { name: entry.key ?? entry.name, value: 'tgw-111', exists: true };
          }
          if (entry.assumeRoleArn?.includes('222222222222')) {
            return { name: entry.key ?? entry.name, value: 'tgw-attach-acct222', exists: true };
          }
          return { name: entry.key ?? entry.name, value: 'tgw-attach-acct333', exists: true };
        }),
      );

      const result = await TransitGatewayAttachmentLookup.resolveAttachments(props, MOCK_CONSTANTS.logPrefix);

      expect(result.attachmentIds.get('main_222222222222_SharedVpc')).toBe('tgw-attach-acct222');
      expect(result.attachmentIds.get('main_333333333333_SharedVpc')).toBe('tgw-attach-acct333');
    });
  });
});
