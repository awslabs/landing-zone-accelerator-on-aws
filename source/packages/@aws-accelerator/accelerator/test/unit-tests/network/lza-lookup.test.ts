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
        lookupValues: { vpcName: 'test-vpc', dhcpOptionName: 'test-dhcp-option' },
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
        lookupValues: { vpcName: 'new-vpc', dhcpOptionName: 'test-dhcp-option' },
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
