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
import { IPv4Prefix, Pool } from 'ip-num';

import { throttlingBackOff } from '@aws-accelerator/utils';

import { Vpc, vpcInit } from './vpc';

const ec2 = new AWS.EC2();
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
  const tags: Tag[] = event.ResourceProperties['tags'];
  const vpcId: string = event.ResourceProperties['vpcId'];

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
      const subnetCidr = nextCidr(netmaskLength, vpc);

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
      const subnet = vpc.subnets.find(item => item.name === subnetName);

      if (!subnet) {
        throw new Error(`Unable to locate existing subnet ${subnetName}`);
      }

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

function nextCidr(netmaskLength: bigint, vpc: Vpc): string {
  // Instantiate the pool
  const pool = Pool.fromCidrRanges(vpc.allocatedCidrs);

  // Remove existing CIDRs from pool
  for (const subnet of vpc.subnets) {
    const removeCidr = pool.removeOverlapping(subnet.allocatedCidr.toRangeSet());

    if (!removeCidr) {
      throw new Error(
        `Unable to remove existing subnet CIDR ${subnet.allocatedCidr.toCidrString()} from available CIDR pool`,
      );
    }
  }

  // Return next CIDR
  const prefix = IPv4Prefix.fromNumber(netmaskLength);
  return pool.getCidrRange(prefix).toCidrString();
}

function returnBoolean(input: string): boolean | undefined {
  try {
    return JSON.parse(input.toLowerCase());
  } catch (e) {
    return undefined;
  }
}
