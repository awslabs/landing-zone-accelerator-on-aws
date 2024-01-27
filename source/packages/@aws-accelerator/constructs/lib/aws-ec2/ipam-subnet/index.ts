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
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import {
  CreateSubnetCommand,
  CreateTagsCommand,
  DeleteSubnetCommand,
  DeleteTagsCommand,
  EC2Client,
  ModifySubnetAttributeCommand,
  Tag,
} from '@aws-sdk/client-ec2';
import { Vpc, VpcSubnet, vpcInit } from './vpc';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
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
  //
  // Set properties
  const az: string | undefined = event.ResourceProperties['availabilityZone'];
  const azId: string | undefined = event.ResourceProperties['availabilityZoneId'];
  const basePool: string[] = event.ResourceProperties['basePool'];
  const ipamAllocation: IpamAllocation = event.ResourceProperties['ipamAllocation'];
  let mapPublicIpOnLaunch: boolean | undefined = event.ResourceProperties['mapPublicIpOnLaunch'] ?? false;
  const subnetName: string = event.ResourceProperties['name'];
  const tags: Tag[] = event.ResourceProperties['tags'] ?? [];
  const vpcId: string = event.ResourceProperties['vpcId'];
  const outpostArn: string = event.ResourceProperties['outpostArn'] ?? undefined;
  const solutionId = process.env['SOLUTION_ID'];
  let vpc: Vpc;
  //
  // Initialize EC2 client
  const ec2Client = new EC2Client({ customUserAgent: solutionId });
  //
  // Set netmask length as BigInt
  const netmaskLength = BigInt(ipamAllocation.netmaskLength);
  //
  // Handle case where boolean is passed as string
  if (mapPublicIpOnLaunch) {
    mapPublicIpOnLaunch = returnBoolean(mapPublicIpOnLaunch.toString());
  }
  //
  // Handle the custom resource workflow
  switch (event.RequestType) {
    case 'Create':
      //
      // Initialize the VPC
      vpc = await vpcInit({ basePool, vpcId }, ec2Client);
      //
      // Get the subnet CIDR
      const subnetCidr = vpc.allocateCidr(netmaskLength);
      //
      // Create the subnet
      const subnetId = await createSubnet(vpc, ec2Client, {
        subnetName,
        tags,
        az,
        azId,
        mapPublicIpOnLaunch,
        outpostArn,
        subnetCidr,
      });

      return {
        PhysicalResourceId: subnetId,
        Status: 'SUCCESS',
        Data: {
          ipv4CidrBlock: subnetCidr,
        },
      };

    case 'Update':
      //
      // Initialize the VPC
      vpc = await vpcInit({ basePool, vpcId }, ec2Client);
      //
      // Get existing subnet from subnet array
      const subnet = vpc.getSubnetByName(subnetName);
      //
      // Update the subnet
      await updateSubnet(
        subnet,
        ec2Client,
        netmaskLength,
        tags,
        event.OldResourceProperties['tags'],
        mapPublicIpOnLaunch,
      );

      return {
        PhysicalResourceId: subnet.subnetId,
        Status: 'SUCCESS',
        Data: {
          ipv4CidrBlock: subnet.allocatedCidr.toCidrString(),
        },
      };

    case 'Delete':
      console.log(`Delete subnet ${subnetName} (${event.PhysicalResourceId})`);
      try {
        await throttlingBackOff(() => ec2Client.send(new DeleteSubnetCommand({ SubnetId: event.PhysicalResourceId })));

        return {
          PhysicalResourceId: event.PhysicalResourceId,
          Status: 'SUCCESS',
        };
      } catch (e) {
        throw new Error(`Error while deleting subnet: ${e}`);
      }
  }
}

/**
 * Create the subnet
 * @param vpc Vpc
 * @param ec2Client EC2Client
 * @param props
 * @returns Promise<string>
 */
async function createSubnet(
  vpc: Vpc,
  ec2Client: EC2Client,
  props: {
    subnetName: string;
    tags: Tag[];
    az?: string;
    azId?: string;
    mapPublicIpOnLaunch?: boolean;
    outpostArn?: string;
    subnetCidr?: string;
  },
): Promise<string> {
  //
  // Set name tag
  props.tags.push({ Key: 'Name', Value: props.subnetName });
  //
  // Create the subnet
  console.log(`Create subnet ${props.subnetName} with CIDR ${props.subnetCidr} in VPC ${vpc.name} (${vpc.vpcId})`);
  try {
    const response = await throttlingBackOff(() =>
      ec2Client.send(
        new CreateSubnetCommand({
          TagSpecifications: [{ ResourceType: 'subnet', Tags: props.tags }],
          AvailabilityZone: props.az,
          AvailabilityZoneId: props.azId,
          CidrBlock: props.subnetCidr,
          VpcId: vpc.vpcId,
          OutpostArn: props.outpostArn,
        }),
      ),
    );
    const subnetId = response.Subnet?.SubnetId;

    if (!subnetId) {
      throw new Error(`Unable to retrieve subnet ID for newly-created subnet`);
    }

    if (props.mapPublicIpOnLaunch) {
      await throttlingBackOff(() =>
        ec2Client.send(new ModifySubnetAttributeCommand({ MapPublicIpOnLaunch: { Value: true }, SubnetId: subnetId })),
      );
    }
    return subnetId;
  } catch (e) {
    throw new Error(`Error while creating subnet: ${e}`);
  }
}

/**
 * Update subnet tags and attributes
 * @param subnet VpcSubnet
 * @param ec2Client EC2Client
 * @param netmaskLength bigint
 * @param tags Tag[]
 * @param mapPublicIpOnLaunch boolean
 */
async function updateSubnet(
  subnet: VpcSubnet,
  ec2Client: EC2Client,
  netmaskLength: bigint,
  newTags: Tag[],
  oldTags: Tag[],
  mapPublicIpOnLaunch?: boolean,
): Promise<void> {
  try {
    //
    // Throw error if CIDR prefix value has changed
    if (subnet.allocatedCidr.cidrPrefix.getValue() !== netmaskLength) {
      throw new Error(`Cannot allocate new CIDR for existing subnet. Please delete and recreate the subnet instead.`);
    }
    //
    // Update subnet tags as needed
    await updateTags(subnet.subnetId, ec2Client, newTags, oldTags);
    //
    // Update subnet attributes as needed
    if (subnet.mapPublicIpOnLaunch !== mapPublicIpOnLaunch) {
      const value = mapPublicIpOnLaunch ?? false;

      console.log(`Update MapPublicIpOnLaunch property of subnet ${subnet.name} (${subnet.subnetId}) to ${value}`);
      await throttlingBackOff(() =>
        ec2Client.send(
          new ModifySubnetAttributeCommand({ MapPublicIpOnLaunch: { Value: value }, SubnetId: subnet.subnetId }),
        ),
      );
    }
  } catch (e) {
    throw new Error(`Error while updating subnet ${subnet.name} (${subnet.subnetId}): ${e}`);
  }
}

/**
 * Removes and/or modifies subnet tags as needed
 * @param subnetId string
 * @param ec2Client EC2Client
 * @param newTags Tag[]
 * @param oldTags Tag[]
 */
async function updateTags(subnetId: string, ec2Client: EC2Client, newTags: Tag[], oldTags: Tag[]) {
  const newTagKeys = newTags.map(newTag => newTag.Key);
  const removeTags = oldTags.filter(oldTag => !newTagKeys.includes(oldTag.Key));

  try {
    if (removeTags.length > 0) {
      console.log(`Removing tag keys [${removeTags.map(tag => tag.Key)}] from subnet ${subnetId}...`);
      await throttlingBackOff(() => ec2Client.send(new DeleteTagsCommand({ Resources: [subnetId], Tags: removeTags })));
    }
    if (newTags.length > 0) {
      console.log(`Creating/updating tag keys [${newTags.map(tag => tag.Key)}] on subnet ${subnetId}...`);
      await throttlingBackOff(() => ec2Client.send(new CreateTagsCommand({ Resources: [subnetId], Tags: newTags })));
    }
  } catch (e) {
    throw new Error(`Error while updating tags: ${e}`);
  }
}

/**
 * Returns a boolean value from a string
 * @param input
 * @returns boolean | undefined
 */
function returnBoolean(input: string): boolean | undefined {
  try {
    return JSON.parse(input.toLowerCase());
  } catch (e) {
    return undefined;
  }
}
