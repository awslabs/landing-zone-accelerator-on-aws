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
  readonly allocatedCidrs: IPv4CidrRange[];
  /**
   * The friendly name of the VPC
   */
  readonly name: string;
  /**
   * The existing subnets in the VPC
   */
  readonly subnets: Subnet[];
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
  public allocatedCidrs: IPv4CidrRange[] = [];
  public name = '';
  public subnets: Subnet[] = [];
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

  private async vpcDetails(): Promise<void> {
    // Get VPC details
    const vpcDetails = await throttlingBackOff(() => this.ec2.describeVpcs({ VpcIds: [this.vpcId] }).promise());

    if (!vpcDetails.Vpcs || !vpcDetails.Vpcs[0].CidrBlockAssociationSet) {
      throw new Error(`Unable to retrieve CIDR block details for VPC ${this.vpcId}`);
    }

    // Determine CIDRs allocated by IPAM
    const allocations: IPv4CidrRange[] = [];
    for (const baseRange of this.baseRanges) {
      for (const item of vpcDetails.Vpcs[0].CidrBlockAssociationSet ?? []) {
        if (!item.CidrBlock) {
          throw new Error(`Unable to retrieve CIDR block for VPC ${this.vpcId}`);
        }

        // Compare VPC CIDR to base CIDR range
        const vpcRange = IPv4CidrRange.fromCidr(item.CidrBlock);
        if (vpcRange.inside(baseRange) || vpcRange.isEquals(baseRange)) {
          allocations.push(vpcRange);
        }
      }
    }
    if (allocations.length === 0) {
      throw new Error(`Unable to determine VPC CIDRs allocated by IPAM for VPC ${this.vpcId}`);
    }

    // Get name tag
    const nameTag = vpcDetails.Vpcs[0].Tags?.filter(item => item.Key === 'Name')[0].Value;
    if (!nameTag) {
      throw new Error(`Unable to retrieve name tag for VPC ${this.vpcId}`);
    }

    // Set property values
    this.allocatedCidrs = allocations;
    this.name = nameTag;
  }

  private validateSubnet(subnet: AWS.EC2.Subnet) {
    if (!subnet.SubnetId) {
      throw new Error(`Unable to retrieve subnet ID`);
    }
    if (!subnet.CidrBlock) {
      throw new Error(`Unable to retrieve CIDR block for subnet ${subnet.SubnetId}`);
    }
  }

  private getSubnets(subnetLists: AWS.EC2.SubnetList | undefined): Subnet[] {
    const subnets: Subnet[] = [];

    for (const subnet of subnetLists ?? []) {
      this.validateSubnet(subnet);

      // Determine if subnet is in scope of IPAM
      const subnetCidr = IPv4CidrRange.fromCidr(subnet.CidrBlock!);
      for (const vpcRange of this.allocatedCidrs) {
        if (subnetCidr.inside(vpcRange) || subnetCidr.isEquals(vpcRange)) {
          // Get name tag
          const nameTag = subnet.Tags?.filter(item => item.Key === 'Name')[0].Value;

          // Push object to array
          subnets.push(
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

    return subnets;
  }

  private async subnetDetails(): Promise<void> {
    let nextToken: string | undefined = undefined;
    const subnets: Subnet[] = [];
    do {
      // Get subnet details
      const page = await throttlingBackOff(() =>
        this.ec2
          .describeSubnets({ Filters: [{ Name: 'vpc-id', Values: [this.vpcId] }], NextToken: nextToken })
          .promise(),
      );

      // Iterate through subnets
      subnets.push(...this.getSubnets(page.Subnets));

      nextToken = page.NextToken;
    } while (nextToken);

    // Set property value
    this.subnets = subnets;
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
