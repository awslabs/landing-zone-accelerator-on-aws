/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as console from 'console';
import {
  DeleteInternetGatewayCommand,
  DetachInternetGatewayCommand,
  DeleteNetworkAclCommand,
  DeleteRouteCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  EC2Client,
  paginateDescribeInternetGateways,
  paginateDescribeNetworkAcls,
  paginateDescribeRouteTables,
  paginateDescribeSecurityGroups,
  paginateDescribeSubnets,
  paginateDescribeVpcs,
} from '@aws-sdk/client-ec2';

/**
 * delete-default-vpc - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
    PhysicalResourceId: string | undefined;
    Status: string;
  }
  | undefined
> {
  // Retrieve operating region that stack is ran
  const region = event.ResourceProperties['region'];
  const ec2Client = new EC2Client({ region: region });
  const defaultVpcIds: string[] = [];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`Starting - Deletion of default VPC and associated resources in ${region}`);

      // Retrieve default VPC(s)
      for await (const page of paginateDescribeVpcs(
        { client: ec2Client },
        { Filters: [{ Name: 'is-default', Values: [`true`] }] },
      )) {
        for (const vpc of page.Vpcs ?? []) {
          if (vpc.VpcId) {
            defaultVpcIds.push(vpc.VpcId);
          }
        }
      }
      console.log(`List of VPCs: `, defaultVpcIds);
      if (defaultVpcIds.length == 0) {
        console.warn('No default VPCs detected');
        return {
          PhysicalResourceId: `delete-default-vpc`,
          Status: 'SUCCESS',
        };
      } else {
        console.warn('Default VPC Detected');
      }

      // Retrieve and detach, delete IGWs
      for (const vpcId of defaultVpcIds) {
        for await (const page of paginateDescribeInternetGateways(
          { client: ec2Client },
          { Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }] },
        )) {
          for (const igw of page.InternetGateways ?? []) {
            for (const attachment of igw.Attachments ?? []) {
              if (attachment.State == 'available') {
                console.log(`Detaching ${igw.InternetGatewayId}`);
                await throttlingBackOff(() =>
                  ec2Client.send(
                    new DetachInternetGatewayCommand({ InternetGatewayId: igw.InternetGatewayId, VpcId: vpcId }),
                  ),
                );
              }
              console.warn(`${igw.InternetGatewayId} is not attached. Proceeding to delete.`);
              await throttlingBackOff(() =>
                ec2Client.send(
                  new DeleteInternetGatewayCommand({
                    InternetGatewayId: igw.InternetGatewayId,
                  }),
                ),
              );
            }
          }
        }

        // Retrieve Default VPC Subnets
        console.log(`Gathering Subnets for VPC ${vpcId}`);
        for await (const page of paginateDescribeSubnets(
          { client: ec2Client },
          { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] },
        )) {
          for (const subnet of page.Subnets ?? []) {
            console.log(`Delete Subnet ${subnet.SubnetId}`);
            await throttlingBackOff(() =>
              ec2Client.send(
                new DeleteSubnetCommand({
                  SubnetId: subnet.SubnetId,
                }),
              ),
            );
          }
        }

        // Delete Routes
        console.log(`Gathering list of Route Tables for VPC ${vpcId}`);
        for await (const page of paginateDescribeRouteTables(
          { client: ec2Client },
          { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] },
        )) {
          for (const routeTableObject of page.RouteTables ?? []) {
            for (const routes of routeTableObject.Routes ?? []) {
              if (routes.GatewayId !== 'local') {
                console.log(`Removing route ${routes.DestinationCidrBlock} from ${routeTableObject.RouteTableId}`);
                await throttlingBackOff(() =>
                  ec2Client.send(
                    new DeleteRouteCommand({
                      RouteTableId: routeTableObject.RouteTableId,
                      DestinationCidrBlock: routes.DestinationCidrBlock,
                    }),
                  ),
                );
              }
            }
          }
        }

        // List and Delete NACLs
        console.log(`Gathering list of NACLs for VPC ${vpcId}`);
        for await (const page of paginateDescribeNetworkAcls(
          { client: ec2Client },
          { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] },
        )) {
          for (const networkAclObject of page.NetworkAcls ?? []) {
            if (networkAclObject.IsDefault !== true) {
              console.log(`Deleting Network ACL ID ${networkAclObject.NetworkAclId}`);
              await throttlingBackOff(() =>
                ec2Client.send(
                  new DeleteNetworkAclCommand({
                    NetworkAclId: networkAclObject.NetworkAclId,
                  }),
                ),
              );
            } else {
              console.warn(`${networkAclObject.NetworkAclId} is the default NACL. Ignoring`);
            }
          }
        }

        // List and Delete Security Groups
        console.log(`Gathering list of Security Groups for VPC ${vpcId}`);
        for await (const page of paginateDescribeSecurityGroups(
          { client: ec2Client },
          { Filters: [{ Name: 'vpc-id', Values: [vpcId] }] },
        )) {
          for (const securityGroupObject of page.SecurityGroups ?? []) {
            if (securityGroupObject.GroupName == 'default') {
              console.warn(`${securityGroupObject.GroupId} is the default SG. Ignoring`);
            } else {
              console.log(`Deleting Security Group Id ${securityGroupObject.GroupId}`);
              await throttlingBackOff(() =>
                ec2Client.send(
                  new DeleteSecurityGroupCommand({
                    GroupId: securityGroupObject.GroupId,
                  }),
                ),
              );
            }
          }
        }
        // Once all resources are deleted, delete the VPC.
        console.log(`Deleting VPC ${vpcId}`);
        await throttlingBackOff(() => ec2Client.send(new DeleteVpcCommand({ VpcId: vpcId })));
      }

      return {
        PhysicalResourceId: `delete-default-vpc`,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
