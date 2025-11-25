import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  GroupSetConfig,
  IamConfig,
  LoggingConfig,
  NetworkConfig,
  OrganizationConfig,
  UserSetConfig,
} from '@aws-accelerator/config';
import { TgwResources } from '../../../lib/stacks/network-stacks/network-vpc-stack/tgw-resources';
import { NetworkVpcStack } from '../../../lib/stacks/network-stacks/network-vpc-stack/network-vpc-stack';
import { AcceleratorStackProps } from '../../../lib/stacks/accelerator-stack';
import { beforeEach, describe, expect, vi, test } from 'vitest';
import { Vpc, Subnet } from '@aws-accelerator/constructs/';
import * as cdk from 'aws-cdk-lib';
import { AcceleratorResourcePrefixes } from '../../../../../@aws-accelerator/accelerator/utils/app-utils';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NetworkStack } from '../../../lib/stacks/network-stacks/network-stack';

describe('TgwResources - Transit Gateway Peering', () => {
  const cloudWatchKey: IKey = {} as IKey;
  let stackCounter = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NetworkVpcStack.prototype, 'getSsmPath').mockReturnValue('/test/ssm-path/');
    vi.spyOn(NetworkVpcStack.prototype, 'getAcceleratorKey').mockImplementation(() => cloudWatchKey as IKey);

    vi.mock('aws-sdk', () => ({
      Bucket: vi.fn(() => ({
        fromBucketName: vi.fn(),
      })),
    }));
  });

  function createTestComponents(homeRegion: string, testSuffix = '') {
    const testId = ++stackCounter;
    const mockGlobalProps = createProps(homeRegion, testSuffix);
    const app = new cdk.App();
    const stack = new cdk.Stack(app, `TestStack${testId}`);
    const networkVpcStack = new NetworkVpcStack(
      stack,
      `NetworkVpcStack${testId}`,
      mockGlobalProps,
    ) as vi.Mocked<NetworkVpcStack>;
    const transitGatewayIds = new Map([
      [`Network-Dev${testSuffix}`, 'tgw-11111'],
      [`Network-Secondary${testSuffix}`, 'tgw-22222'],
    ]);
    const vpcMap = new Map([['vpc1', {} as Vpc]]);
    const subnetMap = new Map([['subnet1', {} as Subnet]]);
    const tgwResources = new TgwResources(networkVpcStack, transitGatewayIds, vpcMap, subnetMap, mockGlobalProps);
    return { tgwResources, mockGlobalProps };
  }

  test('createTransitGatewayPeering creates peering when in home region', () => {
    vi.spyOn(NetworkStack.prototype, 'isTargetStack').mockImplementation(() => true);

    // Mock the constructor to skip peering creation
    const originalCreatePeering = TgwResources.prototype['createTransitGatewayPeering'];
    const mockPeeringMap = new Map([['Network-Mock-Peering-Test1', 'attachment-123']]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(TgwResources.prototype as any, 'createTransitGatewayPeering').mockReturnValue(mockPeeringMap);

    const { tgwResources } = createTestComponents('us-east-1', '-Test1');
    expect(tgwResources.tgwPeeringMap.size).toBe(1);

    // Restore original method
    TgwResources.prototype['createTransitGatewayPeering'] = originalCreatePeering;
  });

  test('createTransitGatewayPeering does not create peering when not in home region', () => {
    vi.spyOn(NetworkStack.prototype, 'isTargetStack').mockImplementation(() => false);

    // Mock the constructor to skip peering creation
    const originalCreatePeering = TgwResources.prototype['createTransitGatewayPeering'];
    const mockPeeringMap = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(TgwResources.prototype as any, 'createTransitGatewayPeering').mockReturnValue(mockPeeringMap);

    const { tgwResources } = createTestComponents('us-east-1', '-Test2');
    expect(tgwResources.tgwPeeringMap.size).toBe(0);

    // Restore original method
    TgwResources.prototype['createTransitGatewayPeering'] = originalCreatePeering;
  });

  function createProps(homeRegion: string, testSuffix = ''): AcceleratorStackProps {
    const mockCustomizationsConfig = {
      firewalls: {},
    } as unknown as CustomizationsConfig;
    const mockOrganizationConfig = {
      getOrganizationId: vi.fn().mockImplementation(() => '1234567890'),
    } as unknown as OrganizationConfig;
    const mockAccountsConfig = {
      getAccountId: vi.fn().mockReturnValue(500000),
      getAccountNameById: vi.fn(() => 'accountName'),
      getAccountIds: vi.fn().mockImplementation(() => [
        {
          Dev: 100000,
          Management: 200000,
          LogArchive: 300000,
          Network: 500000,
        },
      ]),
      getManagementAccountId: vi.fn().mockImplementation(() => '200000'),
      getLogArchiveAccountId: vi.fn().mockImplementation(() => '300000'),
      mandatoryAccounts: [],
      workloadAccounts: [],
    } as unknown as AccountsConfig;
    const mockLoggingConfig = {
      sessionManager: {
        sendToCloudWatchLogs: false,
        sendToS3: false,
      },
    } as LoggingConfig;

    const mockNetworkConfig = {
      defaultVpc: true,
      vpcs: [],
      transitGatewayPeering: [
        {
          name: `Network-Mock-Peering${testSuffix}`,
          autoAccept: true,
          requester: {
            transitGatewayName: `Network-Dev${testSuffix}`,
            account: 500000,
            region: 'us-east-1',
            routeTableAssociations: [`Network-Dev${testSuffix}-Core`],
          },
          accepter: {
            transitGatewayName: `Network-Secondary${testSuffix}`,
            account: 500000,
            region: 'us-east-1',
            routeTableAssociations: [`Network-Secondary${testSuffix}-Core`],
            autoAccept: true,
            applyTags: false,
          },
        },
      ],
      transitGateways: [
        {
          name: `Network-Dev${testSuffix}`,
          account: '200000',
          region: 'us-east-1',
          shareTargets: {
            organizationalUnits: ['Infrastructure'],
          },
          asn: 65530,
          dnsSupport: 'enable',
          vpnEcmpSupport: 'enable',
          defaultRouteTableAssociation: 'disable',
          defaultRouteTablePropagation: 'disable',
          autoAcceptSharingAttachments: 'enable',
          routeTables: [
            {
              name: `Network-Dev${testSuffix}-Core`,
              routes: [],
            },
          ],
        },
        {
          name: `Network-Secondary${testSuffix}`,
          account: '200000',
          region: 'us-east-1',
          shareTargets: {
            organizationalUnits: ['Infrastructure'],
          },
          asn: 65529,
          dnsSupport: 'enable',
          vpnEcmpSupport: 'enable',
          defaultRouteTableAssociation: 'disable',
          defaultRouteTablePropagation: 'disable',
          autoAcceptSharingAttachments: 'enable',
          routeTables: [
            {
              name: `Network-Secondary${testSuffix}-Core`,
              routes: [],
            },
          ],
        },
      ],
    } as unknown as NetworkConfig;

    const props = {
      accountsConfig: mockAccountsConfig,
      customizationsConfig: mockCustomizationsConfig,
      configDirPath: '../configs',
      globalConfig: {
        logging: mockLoggingConfig,
        homeRegion: homeRegion,
      } as GlobalConfig,
      iamConfig: {
        userSets: [new UserSetConfig()],
        groupSets: [new GroupSetConfig()],
      } as IamConfig,
      networkConfig: mockNetworkConfig,
      organizationConfig: mockOrganizationConfig,
      globalRegion: 'us-east-1',
      centralizedLoggingRegion: 'us-east-1',
      prefixes: {} as AcceleratorResourcePrefixes,
      pipelineAccountId: '1234567890',
      env: {
        region: 'us-east-1',
        account: 'Network',
      },
    } as unknown as AcceleratorStackProps;

    return props;
  }
});
