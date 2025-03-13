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
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  AttachmentStatus,
  DeleteInternetGatewayCommand,
  DeleteNetworkAclCommand,
  DeleteRouteCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DescribeInternetGatewaysCommand,
  DescribeNetworkAclsCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  DetachInternetGatewayCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
/**
 * delete-default-vpc - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  // Retrieve operating region that stack is ran
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const ec2Client = new EC2Client({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const defaultVpcIds: string[] = [];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`Starting - Deletion of default VPC and associated resources in ${region}`);

      // Retrieve default VPC(s)
      let describeVpcsNextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          ec2Client.send(
            new DescribeVpcsCommand({
              Filters: [{ Name: 'is-default', Values: [`true`] }],
              NextToken: describeVpcsNextToken,
            }),
          ),
        );
        for (const vpc of page.Vpcs ?? []) {
          if (vpc.VpcId) {
            defaultVpcIds.push(vpc.VpcId);
          }
        }
        describeVpcsNextToken = page.NextToken;
      } while (describeVpcsNextToken);

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
        let nextToken: string | undefined = undefined;
        do {
          const page = await throttlingBackOff(() =>
            ec2Client.send(
              new DescribeInternetGatewaysCommand({
                Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              }),
            ),
          );
          for (const igw of page.InternetGateways ?? []) {
            for (const attachment of igw.Attachments ?? []) {
              if (attachment.State == AttachmentStatus.attached) {
                console.log(`Detaching ${igw.InternetGatewayId}`);
                await throttlingBackOff(() =>
                  ec2Client.send(
                    new DetachInternetGatewayCommand({ InternetGatewayId: igw.InternetGatewayId!, VpcId: vpcId }),
                  ),
                );
              }
              console.warn(`${igw.InternetGatewayId} is not attached. Proceeding to delete.`);
              await throttlingBackOff(() =>
                ec2Client.send(
                  new DeleteInternetGatewayCommand({
                    InternetGatewayId: igw.InternetGatewayId!,
                  }),
                ),
              );
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);

        // Retrieve Default VPC Subnets
        console.log(`Gathering Subnets for VPC ${vpcId}`);
        nextToken = undefined;
        do {
          const page = await throttlingBackOff(() =>
            ec2Client.send(
              new DescribeSubnetsCommand({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              }),
            ),
          );
          for (const subnet of page.Subnets ?? []) {
            console.log(`Delete Subnet ${subnet.SubnetId}`);
            await throttlingBackOff(() =>
              ec2Client.send(
                new DeleteSubnetCommand({
                  SubnetId: subnet.SubnetId!,
                }),
              ),
            );
          }
          nextToken = page.NextToken;
        } while (nextToken);

        // Delete Routes
        console.log(`Gathering list of Route Tables for VPC ${vpcId}`);
        nextToken = undefined;
        do {
          const page = await throttlingBackOff(() =>
            ec2Client.send(
              new DescribeRouteTablesCommand({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              }),
            ),
          );
          for (const routeTableObject of page.RouteTables ?? []) {
            for (const routes of routeTableObject.Routes ?? []) {
              if (routes.GatewayId !== 'local') {
                console.log(`Removing route ${routes.DestinationCidrBlock} from ${routeTableObject.RouteTableId}`);
                await throttlingBackOff(() =>
                  ec2Client.send(
                    new DeleteRouteCommand({
                      RouteTableId: routeTableObject.RouteTableId!,
                      DestinationCidrBlock: routes.DestinationCidrBlock,
                    }),
                  ),
                );
              }
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);

        // List and Delete NACLs
        console.log(`Gathering list of NACLs for VPC ${vpcId}`);
        nextToken = undefined;
        do {
          const page = await throttlingBackOff(() =>
            ec2Client.send(
              new DescribeNetworkAclsCommand({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              }),
            ),
          );
          for (const networkAclObject of page.NetworkAcls ?? []) {
            if (networkAclObject.IsDefault !== true) {
              console.log(`Deleting Network ACL ID ${networkAclObject.NetworkAclId}`);
              await throttlingBackOff(() =>
                ec2Client.send(
                  new DeleteNetworkAclCommand({
                    NetworkAclId: networkAclObject.NetworkAclId!,
                  }),
                ),
              );
            } else {
              console.warn(`${networkAclObject.NetworkAclId} is the default NACL. Ignoring`);
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);

        // List and Delete Security Groups
        console.log(`Gathering list of Security Groups for VPC ${vpcId}`);
        nextToken = undefined;
        do {
          const page = await throttlingBackOff(() =>
            ec2Client.send(
              new DescribeSecurityGroupsCommand({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              }),
            ),
          );
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
          nextToken = page.NextToken;
        } while (nextToken);

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
