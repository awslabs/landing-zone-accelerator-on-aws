/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as AWS from 'aws-sdk';
import { IPv4CidrRange } from 'ip-num';

import { throttlingBackOff } from '@aws-accelerator/utils';

interface IVpc {
  /**
   * The CIDRs of the VPC allocated by IPAM
   */
  readonly allocatedCidrs: IAllocatedCidr[];
  /**
   * The friendly name of the VPC
   */
  readonly name: string;
  /**
   * The ID of the VPC
   */
  readonly vpcId: string;
}

interface VpcProps {
  /**
   * The base CIDR pool of the VPC
   */
  readonly basePool: string[];
  /**
   * The ID of the VPC
   */
  readonly vpcId: string;
}

export class Vpc implements IVpc {
  public allocatedCidrs: AllocatedCidr[] = [];
  public name = '';
  public readonly vpcId: string;
  private readonly baseRanges: IPv4CidrRange[];
  private readonly ec2 = new AWS.EC2();

  constructor(props: VpcProps) {
    this.vpcId = props.vpcId;
    this.baseRanges = props.basePool.map(item => {
      return IPv4CidrRange.fromCidr(item);
    });
  }

  public async init(): Promise<Vpc> {
    await this.vpcDetails();
    await this.subnetDetails();
    return this;
  }

  /**
   * Retrieve VPC details
   */
  private async vpcDetails(): Promise<void> {
    // Get VPC details
    const vpcDetails = await throttlingBackOff(() => this.ec2.describeVpcs({ VpcIds: [this.vpcId] }).promise());

    if (!vpcDetails.Vpcs || !vpcDetails.Vpcs[0].CidrBlockAssociationSet) {
      throw new Error(`Unable to retrieve CIDR block details for VPC ${this.vpcId}`);
    }

    // Determine CIDRs allocated by IPAM
    for (const baseRange of this.baseRanges) {
      for (const item of vpcDetails.Vpcs[0].CidrBlockAssociationSet ?? []) {
        // Compare VPC CIDR to base CIDR range
        const vpcRange = this.validateVpcCidr(item);
        if (vpcRange && (vpcRange.inside(baseRange) || vpcRange.isEquals(baseRange))) {
          this.setAllocatedCidr(vpcRange);
        }
      }
    }
    //
    // Get name tag
    const nameTag = vpcDetails.Vpcs[0].Tags?.filter(item => item.Key === 'Name')[0].Value;
    if (!nameTag) {
      throw new Error(`Unable to retrieve name tag for VPC ${this.vpcId}`);
    }
    //
    // Set property values
    this.name = nameTag;
  }

  /**
   * Validate CIDR block state and return CIDR range object
   * @param cidrItem
   * @returns IPv4CidrRange | undefined
   */
  private validateVpcCidr(cidrItem: AWS.EC2.VpcCidrBlockAssociation): IPv4CidrRange | undefined {
    if (!cidrItem.CidrBlock) {
      throw new Error(`Unable to retrieve CIDR block for VPC ${this.vpcId}`);
    }
    if (cidrItem.CidrBlockState?.State === 'associated') {
      return IPv4CidrRange.fromCidr(cidrItem.CidrBlock);
    }
    return;
  }

  /**
   * Validate API response subnet state
   * @param subnet
   */
  private validateSubnet(subnet: AWS.EC2.Subnet) {
    if (!subnet.SubnetId) {
      throw new Error(`Unable to retrieve subnet ID`);
    }
    if (!subnet.CidrBlock) {
      throw new Error(`Unable to retrieve CIDR block for subnet ${subnet.SubnetId}`);
    }
  }

  /**
   * Add subnets to the allocatedCidrs array
   * @param subnetList
   */
  private setSubnets(subnetList: AWS.EC2.SubnetList | undefined): void {
    for (const subnet of subnetList ?? []) {
      this.validateSubnet(subnet);

      // Determine if subnet is in scope of IPAM
      const subnetCidr = IPv4CidrRange.fromCidr(subnet.CidrBlock!);
      for (const vpcRange of this.allocatedCidrs) {
        if (subnetCidr.inside(vpcRange.cidr) || subnetCidr.isEquals(vpcRange.cidr)) {
          // Get name tag
          const nameTag = subnet.Tags?.filter(item => item.Key === 'Name')[0].Value;

          // Push object to array
          vpcRange.addSubnet(
            new Subnet({
              allocatedCidr: subnetCidr,
              mapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch ?? false,
              name: nameTag,
              subnetId: subnet.SubnetId!,
              tags: subnet.Tags,
            }),
          );
        }
      }
    }
  }

  /**
   * Retrieve subnet details for the VPC
   */
  private async subnetDetails(): Promise<void> {
    let nextToken: string | undefined = undefined;
    do {
      // Get subnet details
      const page = await throttlingBackOff(() =>
        this.ec2
          .describeSubnets({ Filters: [{ Name: 'vpc-id', Values: [this.vpcId] }], NextToken: nextToken })
          .promise(),
      );

      this.setSubnets(page.Subnets);

      nextToken = page.NextToken;
    } while (nextToken);
  }

  /**
   * Mutator method to set an allocated CIDR
   * @param cidr IPv4CidrRange
   */
  private setAllocatedCidr(cidr: IPv4CidrRange) {
    this.allocatedCidrs.push(new AllocatedCidr(cidr));
  }

  /**
   * Accessor method to return a subnet by name
   * @param name
   * @returns
   */
  public getSubnetByName(name: string): Subnet {
    let subnet: Subnet | undefined = undefined;

    for (const cidr of this.allocatedCidrs) {
      subnet = cidr.subnets.find(item => item.name === name);
      if (subnet) {
        break;
      }
    }
    if (!subnet) {
      throw new Error(`Subnet with Name tag "${name}" does not exist in ${this.vpcId}`);
    }
    return subnet;
  }
}

interface IAllocatedCidr {
  /**
   * The CIDR of the allocated CIDR block
   */
  readonly cidr: IPv4CidrRange;
  /**
   * The subnets associated with the CIDR
   */
  readonly subnets: Subnet[];
}

export class AllocatedCidr implements IAllocatedCidr {
  public readonly cidr: IPv4CidrRange;
  public readonly subnets: Subnet[];

  constructor(cidr: IPv4CidrRange) {
    this.cidr = cidr;
    this.subnets = [];
  }

  /**
   * Mutator method to add a subnet to the allocated CIDR
   * @param subnet
   */
  public addSubnet(subnet: Subnet) {
    this.subnets.push(subnet);
  }
}

interface ISubnet {
  /**
   * The CIDR of the subnet allocated by IPAM
   */
  readonly allocatedCidr: IPv4CidrRange;
  /**
   * The ID of the subnet
   */
  readonly subnetId: string;
  /**
   * The MapPublicIpOnLaunch subnet attribute
   */
  readonly mapPublicIpOnLaunch?: boolean;
  /**
   * The friendly name of the subnet
   */
  readonly name?: string;
  /**
   * Tags associated with the subnet
   */
  readonly tags?: AWS.EC2.TagList;
}

interface SubnetProps {
  /**
   * The CIDR of the subnet allocated by IPAM
   */
  readonly allocatedCidr: IPv4CidrRange;
  /**
   * The ID of the subnet
   */
  readonly subnetId: string;
  /**
   * The MapPublicIpOnLaunch subnet attribute
   */
  readonly mapPublicIpOnLaunch?: boolean;
  /**
   * The friendly name of the subnet
   */
  readonly name?: string;
  /**
   * Tags associated with the subnet
   */
  readonly tags?: AWS.EC2.TagList;
}

export class Subnet implements ISubnet {
  public readonly allocatedCidr: IPv4CidrRange;
  public readonly subnetId: string;
  public readonly mapPublicIpOnLaunch: boolean | undefined;
  public readonly name: string | undefined;
  public readonly tags: AWS.EC2.TagList | undefined;

  constructor(props: SubnetProps) {
    this.allocatedCidr = props.allocatedCidr;
    this.mapPublicIpOnLaunch = props.mapPublicIpOnLaunch;
    this.name = props.name;
    this.subnetId = props.subnetId;
    this.tags = props.tags;
  }
}

export async function vpcInit(props: VpcProps): Promise<Vpc> {
  // Set static properties
  const vpc = new Vpc({ basePool: props.basePool, vpcId: props.vpcId });

  // Set VPC and subnet properties
  await vpc.init();
  return vpc;
}
