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
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { Vpc, Subnet } from '@aws-accelerator/constructs/';
import * as cdk from 'aws-cdk-lib';
import { AcceleratorResourcePrefixes } from '../../../../../@aws-accelerator/accelerator/utils/app-utils';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { NetworkStack } from '../../../lib/stacks/network-stacks/network-stack';

describe('TgwResources - Transit Gateway Peering', () => {
  let stack: cdk.Stack;
  let networkVpcStack: NetworkVpcStack;
  let transitGatewayIds: Map<string, string>;
  let vpcMap: Map<string, Vpc>;
  let subnetMap: Map<string, Subnet>;
  let tgwResources: TgwResources;
  let mockGlobalProps: AcceleratorStackProps;
  let cloudWatchKey: IKey;

  beforeEach(() => {
    jest.spyOn(NetworkVpcStack.prototype, 'getSsmPath').mockReturnValue('/test/ssm-path/');
    jest.spyOn(NetworkVpcStack.prototype, 'getAcceleratorKey').mockImplementation(() => cloudWatchKey as IKey);

    jest.mock('aws-sdk', () => ({
      Bucket: jest.fn(() => ({
        fromBucketName: jest.fn(),
      })),
    }));
    mockGlobalProps = createProps('us-east-1');
    stack = new cdk.Stack();
    networkVpcStack = new NetworkVpcStack(stack, 'NetworkVpcStack', mockGlobalProps) as jest.Mocked<NetworkVpcStack>;
    transitGatewayIds = new Map([
      ['Network-Dev', 'tgw-11111'],
      ['Network-Secondary', 'tgw-22222'],
    ]);
    vpcMap = new Map([['vpc1', {} as Vpc]]);
    subnetMap = new Map([['subnet1', {} as Subnet]]);
    tgwResources = new TgwResources(networkVpcStack, transitGatewayIds, vpcMap, subnetMap, mockGlobalProps);
  });

  test('createTransitGatewayPeering creates peering when in home region', () => {
    jest.spyOn(NetworkStack.prototype, 'isTargetStack').mockImplementation(() => true);
    const result = tgwResources['createTransitGatewayPeering'](mockGlobalProps);
    expect(result.size).toBe(1);
  });

  test('createTransitGatewayPeering does not create peering when not in home region', () => {
    jest.spyOn(NetworkStack.prototype, 'isTargetStack').mockImplementation(() => false);
    const result = tgwResources['createTransitGatewayPeering'](mockGlobalProps);
    expect(result.size).toBe(0);
  });

  function createProps(homeRegion: string): AcceleratorStackProps {
    const mockCustomizationsConfig = {
      firewalls: {},
    } as unknown as CustomizationsConfig;
    const mockOrganizationConfig = {
      getOrganizationId: jest.fn().mockImplementation(() => '1234567890'),
    } as unknown as OrganizationConfig;
    const mockAccountsConfig = {
      getAccountId: jest.fn().mockReturnValue(500000),
      getAccountIds: jest.fn().mockImplementation(() => [
        {
          Dev: 100000,
          Management: 200000,
          LogArchive: 300000,
          Network: 500000,
        },
      ]),
      getManagementAccountId: jest.fn().mockImplementation(() => '200000'),
      getLogArchiveAccountId: jest.fn().mockImplementation(() => '300000'),
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
          name: 'Network-Mock-Peering',
          autoAccept: true,
          requester: {
            transitGatewayName: 'Network-Dev',
            account: 500000,
            region: 'us-east-1',
            routeTableAssociations: ['Network-Dev-Core'],
          },
          accepter: {
            transitGatewayName: 'Network-Secondary',
            account: 500000,
            region: 'us-east-1',
            routeTableAssociations: ['Network-Secondary-Core'],
            autoAccept: true,
            applyTags: false,
          },
        },
      ],
      transitGateways: [
        {
          name: 'Network-Dev',
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
              name: 'Network-Dev-Core',
              routes: [],
            },
          ],
        },
        {
          name: 'Network-Secondary',
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
              name: 'Network-Secondary-Core',
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
