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
import { IPv4CidrRange, IPv4Prefix, Pool } from 'ip-num';

import { throttlingBackOff } from '@aws-accelerator/utils';

import { AllocatedCidr, Vpc, vpcInit } from './vpc';

let ec2: AWS.EC2;
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
      Data: {
        ipv4CidrBlock: string | undefined;
      };
    }
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  // Create interfaces
  interface IpamAllocation {
    readonly ipamPoolName: string;
    readonly netmaskLength: number;
  }
  interface Tag {
    readonly Key: string;
    readonly Value: string;
  }

  // Set properties
  const az: string = event.ResourceProperties['availabilityZone'];
  const basePool: string[] = event.ResourceProperties['basePool'];
  const ipamAllocation: IpamAllocation = event.ResourceProperties['ipamAllocation'];
  let mapPublicIpOnLaunch: boolean | undefined = event.ResourceProperties['mapPublicIpOnLaunch'] ?? false;
  const subnetName: string = event.ResourceProperties['name'];
  const tags: Tag[] = event.ResourceProperties['tags'] ?? [];
  const vpcId: string = event.ResourceProperties['vpcId'];
  const outpostArn: string = event.ResourceProperties['outpostArn'] ?? undefined;
  const solutionId = process.env['SOLUTION_ID'];

  ec2 = new AWS.EC2({ customUserAgent: solutionId });

  // Set vpc variable
  let vpc: Vpc;

  // Set netmask length as BigInt
  const netmaskLength = BigInt(ipamAllocation.netmaskLength);

  // Handle case where boolean is passed as string
  if (mapPublicIpOnLaunch) {
    mapPublicIpOnLaunch = returnBoolean(mapPublicIpOnLaunch.toString());
  }

  // Handle the custom resource workflow
  switch (event.RequestType) {
    case 'Create':
      // Initialize the VPC
      vpc = await vpcInit({ basePool, vpcId });
      // Get the subnet CIDR
      const subnetCidr = getNextCidr(netmaskLength, vpc);

      // Set name tag
      tags.push({ Key: 'Name', Value: subnetName });

      // Create the subnet
      console.log(`Create subnet ${subnetName} with CIDR ${subnetCidr} in VPC ${vpc.name} (${vpc.vpcId})`);
      const response = await throttlingBackOff(() =>
        ec2
          .createSubnet({
            TagSpecifications: [{ ResourceType: 'subnet', Tags: tags }],
            AvailabilityZone: az,
            CidrBlock: subnetCidr,
            VpcId: vpc.vpcId,
            OutpostArn: outpostArn,
          })
          .promise(),
      );
      const subnetId = response.Subnet?.SubnetId;

      if (!subnetId) {
        throw new Error(`Unable to retrieve subnet ID for newly-created subnet`);
      }

      if (mapPublicIpOnLaunch) {
        await throttlingBackOff(() =>
          ec2.modifySubnetAttribute({ MapPublicIpOnLaunch: { Value: true }, SubnetId: subnetId }).promise(),
        );
      }

      return {
        PhysicalResourceId: subnetId,
        Status: 'SUCCESS',
        Data: {
          ipv4CidrBlock: subnetCidr,
        },
      };

    case 'Update':
      // Initialize the VPC
      vpc = await vpcInit({ basePool, vpcId });
      // Get existing subnet from subnet array
      const subnet = vpc.getSubnetByName(subnetName);

      // Throw error if CIDR prefix value has changed
      if (subnet.allocatedCidr.cidrPrefix.getValue() !== netmaskLength) {
        throw new Error(
          `Cannot allocate new CIDR for existing subnet ${subnetName} (${subnet.subnetId}). Please delete and recreate the subnet instead.`,
        );
      }

      // Update subnet tags and attributes as needed
      if (tags.length > 0) {
        console.log(`Update tags for subnet ${subnetName} (${subnet.subnetId})`);
        await throttlingBackOff(() => ec2.createTags({ Resources: [subnet.subnetId], Tags: tags }).promise());
      }

      if (subnet.mapPublicIpOnLaunch !== mapPublicIpOnLaunch) {
        const value = mapPublicIpOnLaunch ?? false;

        console.log(`Update MapPublicIpOnLaunch property of subnet ${subnetName} (${subnet.subnetId}) to ${value}`);
        await throttlingBackOff(() =>
          ec2.modifySubnetAttribute({ MapPublicIpOnLaunch: { Value: value }, SubnetId: subnet.subnetId }).promise(),
        );
      }

      return {
        PhysicalResourceId: subnet.subnetId,
        Status: 'SUCCESS',
        Data: {
          ipv4CidrBlock: subnet.allocatedCidr.toCidrString(),
        },
      };

    case 'Delete':
      console.log(`Delete subnet ${subnetName} (${event.PhysicalResourceId})`);
      await throttlingBackOff(() => ec2.deleteSubnet({ SubnetId: event.PhysicalResourceId }).promise());

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Returns the next CIDR range available in the VPC
 * @param netmaskLength bigint
 * @param vpc Vpc
 * @returns string
 */
function getNextCidr(netmaskLength: bigint, vpc: Vpc): string | undefined {
  //
  // Convert netmask to prefix
  const requestedPrefix = IPv4Prefix.fromNumber(netmaskLength);

  for (const [index, item] of vpc.allocatedCidrs.entries()) {
    try {
      //
      // Get next subnet CIDR range from the pool.
      // If it doesn't exist, try the next VPC CIDR range.
      const nextRange = getNextRangeFromPool(item.cidr, requestedPrefix);
      if (!nextRange) {
        continue;
      }
      //
      // Get next available subnet CIDR for the VPC CIDR range
      const subnetCidr = getNextAvailableCidr(item, nextRange);
      //
      // Determine if next CIDR is available.
      // If it is, break out of the loop.
      if (subnetCidr) {
        return subnetCidr;
      } else {
        if (index + 1 === vpc.allocatedCidrs.length) {
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
function getNextRangeFromPool(vpcCidr: IPv4CidrRange, requestedPrefix: IPv4Prefix): IPv4CidrRange | undefined {
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
function getNextAvailableCidr(vpcCidr: AllocatedCidr, nextRange: IPv4CidrRange): string | undefined {
  // Determine if the next range is overlapping.
  // If it is, try to find one that doesn't overlap.
  if (!isOverlapping(vpcCidr, nextRange)) {
    return nextRange.toCidrString();
  } else {
    return tryFindNextCidr(vpcCidr, nextRange);
  }
}

/**
 * Returns true if the next CIDR range is overlapping with subnets associated with the given VPC CIDR
 * @param vpcCidr AllocatedCidr
 * @param nextCidr IPv4CidrRange
 * @returns boolean
 */
function isOverlapping(vpcCidr: AllocatedCidr, nextCidr: IPv4CidrRange): boolean {
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
function tryFindNextCidr(vpcCidr: AllocatedCidr, range: IPv4CidrRange): string | undefined {
  let nextCidr = range.nextRange();
  let overlappingCidr = false;
  if (!nextCidr) {
    return;
  }

  do {
    if (!isOverlapping(vpcCidr, nextCidr) && vpcCidr.cidr.getLast().isGreaterThan(nextCidr.getFirst())) {
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

function returnBoolean(input: string): boolean | undefined {
  try {
    return JSON.parse(input.toLowerCase());
  } catch (e) {
    return undefined;
  }
}
