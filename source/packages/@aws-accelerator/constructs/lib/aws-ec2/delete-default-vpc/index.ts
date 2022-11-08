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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

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
  const solutionId = process.env['SOLUTION_ID'];
  const ec2Client = new AWS.EC2({ region: region, customUserAgent: solutionId });
  const defaultVpcIds: string[] = [];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`Starting - Deletion of default VPC and associated resources in ${region}`);

      // Retrieve default VPC(s)
      let describeVpcsNextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          ec2Client
            .describeVpcs({
              Filters: [{ Name: 'is-default', Values: [`true`] }],
              NextToken: describeVpcsNextToken,
            })
            .promise(),
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
            ec2Client
              .describeInternetGateways({
                Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              })
              .promise(),
          );

          for (const igw of page.InternetGateways ?? []) {
            for (const attachment of igw.Attachments ?? []) {
              if (attachment.State == 'available') {
                console.log(`Detaching ${igw.InternetGatewayId}`);
                await throttlingBackOff(() =>
                  ec2Client
                    .detachInternetGateway({ InternetGatewayId: igw.InternetGatewayId!, VpcId: vpcId })
                    .promise(),
                );
              }
              console.warn(`${igw.InternetGatewayId} is not attached. Proceeding to delete.`);
              await throttlingBackOff(() =>
                ec2Client
                  .deleteInternetGateway({
                    InternetGatewayId: igw.InternetGatewayId!,
                  })
                  .promise(),
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
            ec2Client
              .describeSubnets({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              })
              .promise(),
          );
          for (const subnet of page.Subnets ?? []) {
            console.log(`Delete Subnet ${subnet.SubnetId}`);
            await throttlingBackOff(() =>
              ec2Client
                .deleteSubnet({
                  SubnetId: subnet.SubnetId!,
                })
                .promise(),
            );
          }
          nextToken = page.NextToken;
        } while (nextToken);

        // Delete Routes
        console.log(`Gathering list of Route Tables for VPC ${vpcId}`);
        nextToken = undefined;
        do {
          const page = await throttlingBackOff(() =>
            ec2Client
              .describeRouteTables({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              })
              .promise(),
          );
          for (const routeTableObject of page.RouteTables ?? []) {
            for (const routes of routeTableObject.Routes ?? []) {
              if (routes.GatewayId !== 'local') {
                console.log(`Removing route ${routes.DestinationCidrBlock} from ${routeTableObject.RouteTableId}`);
                await throttlingBackOff(() =>
                  ec2Client
                    .deleteRoute({
                      RouteTableId: routeTableObject.RouteTableId!,
                      DestinationCidrBlock: routes.DestinationCidrBlock,
                    })
                    .promise(),
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
            ec2Client
              .describeNetworkAcls({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              })
              .promise(),
          );
          for (const networkAclObject of page.NetworkAcls ?? []) {
            if (networkAclObject.IsDefault !== true) {
              console.log(`Deleting Network ACL ID ${networkAclObject.NetworkAclId}`);
              await throttlingBackOff(() =>
                ec2Client
                  .deleteNetworkAcl({
                    NetworkAclId: networkAclObject.NetworkAclId!,
                  })
                  .promise(),
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
            ec2Client
              .describeSecurityGroups({
                Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                NextToken: nextToken,
              })
              .promise(),
          );
          for (const securityGroupObject of page.SecurityGroups ?? []) {
            if (securityGroupObject.GroupName == 'default') {
              console.warn(`${securityGroupObject.GroupId} is the default SG. Ignoring`);
            } else {
              console.log(`Deleting Security Group Id ${securityGroupObject.GroupId}`);
              await throttlingBackOff(() =>
                ec2Client
                  .deleteSecurityGroup({
                    GroupId: securityGroupObject.GroupId,
                  })
                  .promise(),
              );
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);

        // Once all resources are deleted, delete the VPC.
        console.log(`Deleting VPC ${vpcId}`);
        await throttlingBackOff(() => ec2Client.deleteVpc({ VpcId: vpcId }).promise());
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
