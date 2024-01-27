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
import { IPv4CidrRange, IPv4Prefix, Pool } from 'ip-num';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  DescribeSubnetsCommand,
  DescribeSubnetsResult,
  DescribeVpcsCommand,
  EC2Client,
  Subnet,
  Tag,
  VpcCidrBlockAssociation,
} from '@aws-sdk/client-ec2';

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

  constructor(props: VpcProps) {
    this.vpcId = props.vpcId;
    this.baseRanges = props.basePool.map(item => {
      return IPv4CidrRange.fromCidr(item);
    });
  }

  /**
   * Initialize the VPC object
   * @param ec2Client EC2Client
   * @returns Vpc
   */
  public async init(ec2Client: EC2Client): Promise<Vpc> {
    await this.vpcDetails(ec2Client);
    await this.subnetDetails(ec2Client);
    return this;
  }

  /**
   * Retrieve VPC details
   * @param ec2Client EC2Client
   */
  private async vpcDetails(ec2Client: EC2Client): Promise<void> {
    //
    // Get VPC details
    console.log(`Retrieving VPC details for VPC ${this.vpcId}...`);
    try {
      const vpcDetails = await throttlingBackOff(() =>
        ec2Client.send(new DescribeVpcsCommand({ VpcIds: [this.vpcId] })),
      );

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
    } catch (e) {
      throw new Error(`Error retrieving VPC details: ${e}`);
    }
  }

  /**
   * Validate CIDR block state and return CIDR range object
   * @param cidrItem
   * @returns IPv4CidrRange | undefined
   */
  private validateVpcCidr(cidrItem: VpcCidrBlockAssociation): IPv4CidrRange | undefined {
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
  private validateSubnet(subnet: Subnet) {
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
  private setSubnets(subnetList: DescribeSubnetsResult | undefined): void {
    for (const subnet of subnetList?.Subnets ?? []) {
      this.validateSubnet(subnet);

      // Determine if subnet is in scope of IPAM
      const subnetCidr = IPv4CidrRange.fromCidr(subnet.CidrBlock!);
      for (const vpcRange of this.allocatedCidrs) {
        if (subnetCidr.inside(vpcRange.cidr) || subnetCidr.isEquals(vpcRange.cidr)) {
          // Get name tag
          const nameTag = subnet.Tags?.filter(item => item.Key === 'Name')[0].Value;

          // Push object to array
          vpcRange.addSubnet(
            new VpcSubnet({
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
   * @param ec2Client EC2Client
   */
  private async subnetDetails(ec2Client: EC2Client): Promise<void> {
    let nextToken: string | undefined = undefined;
    console.log(`Retrieving subnet details for VPC ${this.vpcId}...`);
    try {
      do {
        //
        // Get subnet details
        const page = await throttlingBackOff(() =>
          ec2Client.send(
            new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [this.vpcId] }], NextToken: nextToken }),
          ),
        );

        this.setSubnets(page);

        nextToken = page.NextToken;
      } while (nextToken);
    } catch (e) {
      throw new Error(`Error retrieving subnet details: ${e}`);
    }
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
   * @returns VpcSubnet
   */
  public getSubnetByName(name: string): VpcSubnet {
    let subnet: VpcSubnet | undefined = undefined;

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

  /**
   * Returns the next CIDR range available in the VPC
   * @param netmaskLength bigint
   * @param vpc Vpc
   * @returns string | undefined
   */
  public allocateCidr(netmaskLength: bigint): string | undefined {
    //
    // Convert netmask to prefix
    const requestedPrefix = IPv4Prefix.fromNumber(netmaskLength);

    for (const [index, item] of this.allocatedCidrs.entries()) {
      try {
        //
        // Get next subnet CIDR range from the pool.
        // If it doesn't exist, try the next VPC CIDR range.
        const nextRange = this.getNextRangeFromPool(item.cidr, requestedPrefix);
        if (!nextRange) {
          continue;
        }
        //
        // Get next available subnet CIDR for the VPC CIDR range
        const subnetCidr = this.getNextAvailableCidr(item, nextRange);
        //
        // Determine if next CIDR is available.
        // If it is, break out of the loop.
        if (subnetCidr) {
          return subnetCidr;
        } else {
          if (index + 1 === this.allocatedCidrs.length) {
            throw new Error(
              `VPC is exhausted of address space. Cannot allocate a CIDR with /${netmaskLength.toString()} prefix.`,
            );
          }
        }
      } catch (e) {
        throw new Error(`Error while calculating next subnet CIDR: ${e}`);
      }
    }
    return;
  }

  /**
   * Creates a pool of CIDR ranges from the given VPC CIDR and returns
   * the next CIDR range from the pool, if available
   * @param vpcCidr IPv4CidrRange
   * @param requestedPrefix IPv4Prefix
   * @returns IPv4CidrRange | undefined
   */
  private getNextRangeFromPool(vpcCidr: IPv4CidrRange, requestedPrefix: IPv4Prefix): IPv4CidrRange | undefined {
    try {
      const pool = Pool.fromCidrRanges([vpcCidr]);
      return pool.getCidrRange(requestedPrefix);
    } catch (e) {
      // If the above operation fails, it's due to the requested prefix being too large.
      // Return undefined to indicate that no CIDR range could be found.
      return;
    }
  }

  /**
   * Returns the next valid CIDR range from the given VPC CIDR if it exists
   * @param vpcCidr AllocatedCidr
   * @param nextRange IPv4CidrRange
   * @returns string | undefined
   */
  private getNextAvailableCidr(vpcCidr: AllocatedCidr, nextRange: IPv4CidrRange): string | undefined {
    // Determine if the next range is overlapping.
    // If it is, try to find one that doesn't overlap.
    if (!this.isOverlapping(vpcCidr, nextRange)) {
      return nextRange.toCidrString();
    } else {
      return this.tryFindNextCidr(vpcCidr, nextRange);
    }
  }

  /**
   * Returns true if the next CIDR range is overlapping with subnets associated with the given VPC CIDR
   * @param vpcCidr AllocatedCidr
   * @param nextCidr IPv4CidrRange
   * @returns boolean
   */
  private isOverlapping(vpcCidr: AllocatedCidr, nextCidr: IPv4CidrRange): boolean {
    for (const subnet of vpcCidr.subnets) {
      if (
        subnet.allocatedCidr.contains(nextCidr) ||
        subnet.allocatedCidr.isEquals(nextCidr) ||
        nextCidr.contains(subnet.allocatedCidr)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Tries to find the next CIDR range that is not overlapping with the given VPC CIDR
   * @param vpcCidr AllocatedCidr
   * @param range IPv4CidrRange
   * @returns string | undefined
   */
  private tryFindNextCidr(vpcCidr: AllocatedCidr, range: IPv4CidrRange): string | undefined {
    let nextCidr = range.nextRange();
    let overlappingCidr = false;
    if (!nextCidr) {
      return;
    }

    do {
      if (!this.isOverlapping(vpcCidr, nextCidr) && vpcCidr.cidr.getLast().isGreaterThan(nextCidr.getFirst())) {
        return nextCidr.toCidrString();
      } else {
        overlappingCidr = true;
        nextCidr = nextCidr.nextRange();
        if (!nextCidr || vpcCidr.cidr.getLast().isLessThanOrEquals(nextCidr.getFirst())) {
          return;
        }
      }
    } while (overlappingCidr);
    return;
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
  readonly subnets: VpcSubnet[];
}

export class AllocatedCidr implements IAllocatedCidr {
  public readonly cidr: IPv4CidrRange;
  public readonly subnets: VpcSubnet[];

  constructor(cidr: IPv4CidrRange) {
    this.cidr = cidr;
    this.subnets = [];
  }

  /**
   * Mutator method to add a subnet to the allocated CIDR
   * @param subnet
   */
  public addSubnet(subnet: VpcSubnet) {
    this.subnets.push(subnet);
  }
}

interface IVpcSubnet {
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
  readonly tags?: Tag[];
}

interface VpcSubnetProps {
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
  readonly tags?: Tag[];
}

export class VpcSubnet implements IVpcSubnet {
  public readonly allocatedCidr: IPv4CidrRange;
  public readonly subnetId: string;
  public readonly mapPublicIpOnLaunch: boolean | undefined;
  public readonly name: string | undefined;
  public readonly tags: Tag[] | undefined;

  constructor(props: VpcSubnetProps) {
    this.allocatedCidr = props.allocatedCidr;
    this.mapPublicIpOnLaunch = props.mapPublicIpOnLaunch;
    this.name = props.name;
    this.subnetId = props.subnetId;
    this.tags = props.tags;
  }
}

export async function vpcInit(props: VpcProps, ec2Client: EC2Client): Promise<Vpc> {
  // Set static properties
  const vpc = new Vpc(props);

  // Set VPC and subnet properties
  await vpc.init(ec2Client);
  return vpc;
}
