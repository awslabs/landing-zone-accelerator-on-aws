import path from 'path';
import { LookupProperties, LZAResourceLookup, LZAResourceLookupType } from '../../../utils/lza-resource-lookup';
import { AseaResourceMapping } from '@aws-accelerator/config/lib/common/types';

describe('LZAResourceLookup tests', () => {
  let originalCwd: string;
  let testDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = path.join(process.cwd(), 'test');
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  test('template is loaded from directory', () => {
    console.log(`testDir: ${testDir}`);
    const lzaLookupV2StacksEnabled = new LZAResourceLookup({
      accountId: '111111111111',
      region: 'us-east-1',
      stackName: 'lza-resource-lookup-test',
      enableV2Stacks: true,
      aseaResourceList: [],
      externalLandingZoneResources: false,
    });
    expect(lzaLookupV2StacksEnabled.templateExists(lzaLookupV2StacksEnabled.cfnTemplate)).toBeTruthy();
  });

  test('constructor with v2 stacks disabled', () => {
    const mockResourceLookup = {
      resourceType: LZAResourceLookupType.VPC,
      lookupValues: {
        vpcName: 'test-vpc',
      },
    } as LookupProperties;
    const lzaLookup = new LZAResourceLookup({
      accountId: '222222222222',
      region: 'us-west-2',
      stackName: 'lza-resource-lookup-test',
      enableV2Stacks: false,
      aseaResourceList: [],
      externalLandingZoneResources: false,
    });
    expect(lzaLookup).toBeDefined();
    expect(JSON.stringify(lzaLookup.cfnTemplate)).toEqual('{}');
    expect(lzaLookup.resourceExists(mockResourceLookup)).toBeTruthy();
    expect(
      lzaLookup.metadataValidation({
        cfnTemplate: lzaLookup.cfnTemplate,
        account: lzaLookup.accountId,
        region: lzaLookup.region,
        stackName: lzaLookup.stackName,
      }),
    ).toBeUndefined();
  });

  test('LZA resource metadata lookups', () => {
    const lzaLookup = new LZAResourceLookup({
      accountId: '444444444444',
      region: 'ap-northeast-1',
      stackName: 'lza-resource-lookup-test',
      enableV2Stacks: true,
      aseaResourceList: [],
      externalLandingZoneResources: false,
    });

    expect(lzaLookup).toBeDefined();
    expect(lzaLookup.templateExists(lzaLookup.cfnTemplate)).toBeTruthy();
    expect(
      lzaLookup.resourceExists({ resourceType: LZAResourceLookupType.VPC, lookupValues: { vpcName: 'test-vpc' } }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.FLOW_LOG,
        lookupValues: { vpcName: 'test-vpc', flowLogDestinationType: 'cloud-watch-logs' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.INTERNET_GATEWAY,
        lookupValues: { vpcName: 'test-vpc' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VIRTUAL_PRIVATE_GATEWAY,
        lookupValues: { vpcName: 'test-vpc' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
        lookupValues: { vpcName: 'test-vpc', cidrBlock: '10.1.0.0/16' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.EGRESS_ONLY_INTERNET_GATEWAY,
        lookupValues: { vpcName: 'test-vpc' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC_DHCP_OPTIONS_ASSOCIATION,
        lookupValues: { vpcName: 'test-vpc', dhcpOptionsName: 'test-dhcp-option' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({ resourceType: LZAResourceLookupType.VPC, lookupValues: { vpcName: 'new-vpc' } }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.FLOW_LOG,
        lookupValues: { vpcName: 'new-vpc', flowLogDestinationType: 'cloud-watch-logs' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.INTERNET_GATEWAY,
        lookupValues: { vpcName: 'new-vpc' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VIRTUAL_PRIVATE_GATEWAY,
        lookupValues: { vpcName: 'new-vpc' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
        lookupValues: { vpcName: 'new-vpc', cidrBlock: '10.1.0.0/16' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.EGRESS_ONLY_INTERNET_GATEWAY,
        lookupValues: { vpcName: 'new-vpc' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC_DHCP_OPTIONS_ASSOCIATION,
        lookupValues: { vpcName: 'new-vpc', dhcpOptionsName: 'test-dhcp-option' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION,
        lookupValues: { routeTableName: 'test-route-table', vpcName: 'test-vpc', vpcAccount: 'test-account' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROUTE_TABLE,
        lookupValues: { vpcName: 'test-vpc', routeTableName: 'test-route-table' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.GATEWAY_ROUTE_TABLE_ASSOCIATION,
        lookupValues: { vpcName: 'test-vpc', routeTableName: 'test-route-table', associationType: 'internet-gateway' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROUTE,
        lookupValues: {
          vpcName: 'test-vpc',
          routeTableName: 'test-route-table',
          routeTableEntryName: 'test-route',
          type: 'gateway',
        },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.PREFIX_LIST_ROUTE,
        lookupValues: {
          vpcName: 'test-vpc',
          routeTableName: 'test-route-table',
          routeTableEntryName: 'test-prefix-route',
          type: 'prefix-list',
        },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET,
        lookupValues: { vpcName: 'test-vpc', subnetName: 'test-subnet' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.IPAM_SUBNET,
        lookupValues: { vpcName: 'test-vpc', subnetName: 'test-ipam-subnet' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROUTE_TABLE_ASSOCIATION,
        lookupValues: { subnetName: 'test-subnet', routeTableName: 'test-route-table' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NAT_GATEWAY,
        lookupValues: { vpcName: 'test-vpc', natGatewayName: 'test-nat-gateway' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.TRANSIT_GATEWAY_VPC_ATTACHMENT,
        lookupValues: {
          vpcName: 'test-vpc',
          transitGatewayName: 'test-tgw',
          transitGatewayAttachmentName: 'test-tgw-attachment',
        },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.TRANSIT_GATEWAY_VPC_ATTACHMENT_ROLE,
        lookupValues: { roleName: 'test-tgw-role' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET_SHARE,
        lookupValues: { subnetName: 'test-subnet' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SECURITY_GROUP,
        lookupValues: { vpcName: 'test-vpc', securityGroupName: 'test-sg' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SECURITY_GROUP_INGRESS,
        lookupValues: { securityGroupName: 'test-sg', ruleIndex: 0 },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SECURITY_GROUP_EGRESS,
        lookupValues: { securityGroupName: 'test-sg', ruleIndex: 0 },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NETWORK_ACL,
        lookupValues: { vpcName: 'test-vpc', naclName: 'test-nacl' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NETWORK_ACL_ENTRY,
        lookupValues: { vpcName: 'test-vpc', naclName: 'test-nacl', ruleNumber: 100, type: 'ingress' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NETWORK_ACL_ENTRY,
        lookupValues: { vpcName: 'test-vpc', naclName: 'test-nacl', ruleNumber: 100, type: 'egress' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET_NETWORK_ACL_ASSOCIATION,
        lookupValues: { vpcName: 'test-vpc', naclName: 'test-nacl', subnetName: 'test-subnet' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOAD_BALANCER,
        lookupValues: { vpcName: 'test-vpc', gwlbName: 'test-gwlb' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOAD_BALANCER,
        lookupValues: { vpcName: 'test-vpc', albName: 'test-alb' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOAD_BALANCER,
        lookupValues: { vpcName: 'test-vpc', nlbName: 'test-nlb' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROUTE_TABLE,
        lookupValues: { vpcName: 'non-existent-vpc', routeTableName: 'non-existent-route-table' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET,
        lookupValues: { vpcName: 'non-existent-vpc', subnetName: 'non-existent-subnet' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SECURITY_GROUP,
        lookupValues: { vpcName: 'non-existent-vpc', securityGroupName: 'non-existent-sg' },
      }),
    ).toBeFalsy();
  });

  test('constructor with external landing zone resources', () => {
    const lzaLookup = new LZAResourceLookup({
      accountId: '333333333333',
      region: 'eu-west-1',
      stackName: 'lza-resource-lookup-test',
      enableV2Stacks: true,
      aseaResourceList: [],
      externalLandingZoneResources: true,
    });
    expect(lzaLookup).toBeDefined();
    expect(lzaLookup.cfnTemplate).toBeDefined();
  });

  test('LZA Lookup with ASEA resources', () => {
    const mockResourceList = [
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'EC2_VPC',
        resourceIdentifier: 'Endpoint_vpc',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'EC2_VPC_CIDR',
        resourceIdentifier: 'Central_vpc-100.96.90.0/23',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'EC2_VPC_IGW',
        resourceIdentifier: 'Sandbox2_vpc',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'APPLICATION_LOAD_BALANCER',
        resourceIdentifier: 'asea-test-alb',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'EC2_NACL_SUBNET_ASSOCIATION',
        resourceIdentifier: 'asea-vpc/asea-subnet',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'NAT_GATEWAY',
        resourceIdentifier: 'asea-vpc/asea-nat',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'ROUTE_TABLE',
        resourceIdentifier: 'asea-vpc/asea-rt',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'EC2_SUBNET',
        resourceIdentifier: 'asea-vpc/asea-subnet',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'TRANSIT_GATEWAY_ATTACHMENT',
        resourceIdentifier: 'asea-vpc/asea-tgw-attachment',
      },
      {
        accountId: '444444444444',
        region: 'ap-northeast-1',
        resourceType: 'EC2_SECURITY_GROUP',
        resourceIdentifier: 'asea-vpc/asea-sg',
      },
    ] as AseaResourceMapping[];

    const lzaLookup = new LZAResourceLookup({
      accountId: '444444444444',
      region: 'ap-northeast-1',
      stackName: 'lza-resource-lookup-test',
      enableV2Stacks: true,
      aseaResourceList: mockResourceList,
      externalLandingZoneResources: true,
    });

    expect(lzaLookup).toBeDefined();
    expect(lzaLookup.cfnTemplate).toBeDefined();

    expect(
      lzaLookup.resourceExists({ resourceType: LZAResourceLookupType.VPC, lookupValues: { vpcName: 'Endpoint_vpc' } }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
        lookupValues: { vpcName: 'Central_vpc', cidrBlock: '100.96.90.0/23' },
      }),
    ).toBeTruthy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.INTERNET_GATEWAY,
        lookupValues: { vpcName: 'Sandbox2_vpc' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC,
        lookupValues: { vpcName: 'NonExistent_vpc' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
        lookupValues: { vpcName: 'Central_vpc', cidrBlock: '00000000000/24' },
      }),
    ).toBeFalsy();
    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.INTERNET_GATEWAY,
        lookupValues: { vpcName: 'NonExistent_vpc' },
      }),
    ).toBeFalsy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.LOAD_BALANCER,
        lookupValues: { vpcName: 'asea-vpc', albName: 'asea-test-alb' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET_NETWORK_ACL_ASSOCIATION,
        lookupValues: { vpcName: 'asea-vpc', subnetName: 'asea-subnet' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.NAT_GATEWAY,
        lookupValues: { vpcName: 'asea-vpc', natGatewayName: 'asea-nat' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.ROUTE_TABLE,
        lookupValues: { vpcName: 'asea-vpc', routeTableName: 'asea-rt' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SUBNET,
        lookupValues: { vpcName: 'asea-vpc', subnetName: 'asea-subnet' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.TRANSIT_GATEWAY_VPC_ATTACHMENT,
        lookupValues: { vpcName: 'asea-vpc', transitGatewayAttachmentName: 'asea-tgw-attachment' },
      }),
    ).toBeTruthy();

    expect(
      lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.SECURITY_GROUP,
        lookupValues: { vpcName: 'asea-vpc', securityGroupName: 'asea-sg' },
      }),
    ).toBeTruthy();
  });

  test('error handling when template cannot be loaded', () => {
    // Move to a directory that doesn't have the template
    process.chdir(originalCwd);

    expect(() => {
      new LZAResourceLookup({
        accountId: '555555555555',
        region: 'us-east-2',
        stackName: 'non-existent-stack',
        enableV2Stacks: true,
        aseaResourceList: [],
        externalLandingZoneResources: false,
      });
    }).not.toThrow();

    // Even if the template can't be loaded, the class should initialize with an empty template
    const lzaLookup = new LZAResourceLookup({
      accountId: '555555555555',
      region: 'us-east-2',
      stackName: 'non-existent-stack',
      enableV2Stacks: true,
      aseaResourceList: [],
      externalLandingZoneResources: false,
    });

    // The template might be empty or have default values
    expect(lzaLookup).toBeDefined();
  });
});
