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

import { IDeleteDefaultVpcModule, IDeleteDefaultVpcParameter } from '../../interfaces/amazon-ec2/delete-default-vpc';
import {
  DeleteInternetGatewayCommand,
  DeleteNetworkAclCommand,
  DeleteRouteCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DetachInternetGatewayCommand,
  DescribeInternetGatewaysCommand,
  DescribeNetworkAclsCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  Vpc,
  paginateDescribeVpcs,
  paginateDescribeInternetGateways,
  paginateDescribeSubnets,
  paginateDescribeRouteTables,
  paginateDescribeNetworkAcls,
  paginateDescribeSecurityGroups,
  RouteOrigin,
} from '@aws-sdk/client-ec2';
import { generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../common/functions';
import { AcceleratorModuleName } from '../../common/resources';
import { throttlingBackOff } from '../../common/throttle';
import { MODULE_EXCEPTIONS } from '../../common/enums';
import { createLogger } from '../../common/logger';
import path from 'path';

/**
 * DeleteDefaultVpcModule class to manage deletion of default VPCs and associated resources
 */
export class DeleteDefaultVpcModule implements IDeleteDefaultVpcModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to delete default VPCs
   *
   * @param props {@link IDeleteDefaultVpcParameter}
   * @returns status string
   */
  public async handler(props: IDeleteDefaultVpcParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AMAZON_EC2, props);

    const client = new EC2Client({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const defaultVpcs = await this.getDefaultVpcs(client);

    if (defaultProps.dryRun) {
      return await this.getDryRunResponse(defaultProps.moduleName, props.operation, defaultVpcs);
    }

    return this.deleteDefaultVpcs(client, defaultVpcs);
  }

  /**
   * Function to get display for dry run
   * @param moduleName string
   * @param operation string
   * @param defaultVpcs Vpc[]
   * @returns status string
   */
  async getDryRunResponse(moduleName: string, operation: string, defaultVpcs: Vpc[]): Promise<string> {
    if (defaultVpcs.length === 0) {
      return generateDryRunResponse(moduleName, operation, 'Will skip deletion - no default VPC found');
    }

    return generateDryRunResponse(moduleName, operation, 'Will delete default VPC');
  }

  /**
   * Function to get all default VPCs in the region
   * @param client {@link EC2Client}
   * @returns array of default VPCs
   */
  private async getDefaultVpcs(client: EC2Client): Promise<Vpc[]> {
    const defaultVpcs: Vpc[] = [];

    try {
      const paginator = paginateDescribeVpcs(
        { client },
        {
          Filters: [{ Name: 'is-default', Values: ['true'] }],
        },
      );

      for await (const page of paginator) {
        for (const vpc of page.Vpcs ?? []) {
          if (vpc.VpcId) {
            defaultVpcs.push(vpc);
          }
        }
      }

      return defaultVpcs;
    } catch (error) {
      this.logger.error('Error retrieving default VPCs:', error);
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to retrieve default VPCs`);
    }
  }

  /**
   * Wait for resource deletion to complete with retries
   * @param checkFunction Function that returns true when resource is deleted
   * @param resourceName Name of the resource for logging
   * @param maxRetries Maximum number of retries
   * @param delayMs Delay between retries in milliseconds
   */
  private async waitForDeletion(
    checkFunction: () => Promise<boolean>,
    resourceName: string,
    maxRetries = 30,
    delayMs = process.env['NODE_ENV'] === 'test' ? 10 : 2000,
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      const isDeleted = await checkFunction();
      if (isDeleted) {
        return;
      }

      if (i < maxRetries - 1) {
        this.logger.info(`Waiting for ${resourceName} deletion to complete... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for ${resourceName} deletion`);
  }

  /**
   * Function to delete default VPCs and all associated resources
   * @param client {@link EC2Client}
   * @param defaultVpcs array of default VPCs
   * @returns status string
   */
  private async deleteDefaultVpcs(client: EC2Client, defaultVpcs: Vpc[]): Promise<string> {
    if (defaultVpcs.length === 0) {
      return 'No default VPCs found in the region';
    }

    this.logger.info(`Starting default VPC deletion process for ${defaultVpcs.length} VPCs`);
    const deletedVpcIds: string[] = [];

    for (const vpc of defaultVpcs) {
      const vpcId = vpc.VpcId!;
      this.logger.info(`Starting deletion of default VPC: ${vpcId}`);

      try {
        // Delete resources in the correct order
        await this.deleteInternetGateways(client, vpcId);
        await this.deleteSubnets(client, vpcId);
        await this.deleteRouteTables(client, vpcId);
        await this.deleteNetworkAcls(client, vpcId);
        await this.deleteSecurityGroups(client, vpcId);
        await this.deleteVpc(client, vpcId);

        deletedVpcIds.push(vpcId);
        this.logger.info(`Successfully deleted default VPC: ${vpcId}`);
      } catch (error) {
        this.logger.error(`Failed to delete VPC ${vpcId}:`, error);
        throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC ${vpcId}: ${error}`);
      }
    }

    this.logger.info(`Completed default VPC deletion process. Deleted ${deletedVpcIds.length} VPCs`);
    return `Successfully deleted ${deletedVpcIds.length} default VPC(s): ${deletedVpcIds.join(', ')}`;
  }

  /**
   * Delete Internet Gateways attached to the VPC
   * @param client {@link EC2Client}
   * @param vpcId string
   */
  private async deleteInternetGateways(client: EC2Client, vpcId: string): Promise<void> {
    const igwsToDelete: string[] = [];

    const paginator = paginateDescribeInternetGateways(
      { client },
      {
        Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
      },
    );

    // Phase 1: Detach all IGWs
    for await (const page of paginator) {
      const internetGateways = page.InternetGateways ?? [];
      for (const igw of internetGateways) {
        if (!igw.InternetGatewayId) {
          throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Internet Gateway missing InternetGatewayId`);
        }

        igwsToDelete.push(igw.InternetGatewayId);

        // Detach IGW from VPC if attached
        const attachments = igw.Attachments ?? [];
        for (const attachment of attachments) {
          if (attachment.State && attachment.VpcId) {
            await throttlingBackOff(() =>
              client.send(
                new DetachInternetGatewayCommand({
                  InternetGatewayId: igw.InternetGatewayId,
                  VpcId: attachment.VpcId,
                }),
              ),
            );
          }
        }
      }
    }

    // Phase 2: Delete all detached IGWs
    for (const igwId of igwsToDelete) {
      this.logger.info(`Deleting Internet Gateway: ${igwId}`);
      await throttlingBackOff(() =>
        client.send(
          new DeleteInternetGatewayCommand({
            InternetGatewayId: igwId,
          }),
        ),
      );

      // Wait for deletion to complete
      await this.waitForDeletion(async () => {
        try {
          await client.send(new DescribeInternetGatewaysCommand({ InternetGatewayIds: [igwId] }));
          return false; // Still exists
        } catch {
          return true; // Deleted
        }
      }, `Internet Gateway ${igwId}`);
    }
  }

  /**
   * Delete all subnets in the VPC
   * @param client {@link EC2Client}
   * @param vpcId string
   */
  private async deleteSubnets(client: EC2Client, vpcId: string): Promise<void> {
    const paginator = paginateDescribeSubnets(
      { client },
      {
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      },
    );

    for await (const page of paginator) {
      for (const subnet of page.Subnets ?? []) {
        if (!subnet.SubnetId) {
          throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Subnet missing SubnetId`);
        }

        this.logger.info(`Deleting subnet: ${subnet.SubnetId}`);
        await throttlingBackOff(() =>
          client.send(
            new DeleteSubnetCommand({
              SubnetId: subnet.SubnetId,
            }),
          ),
        );

        // Wait for deletion to complete
        await this.waitForDeletion(async () => {
          try {
            await client.send(new DescribeSubnetsCommand({ SubnetIds: [subnet.SubnetId!] }));
            return false; // Still exists
          } catch {
            return true; // Deleted
          }
        }, `Subnet ${subnet.SubnetId}`);
      }
    }
  }

  /**
   * Delete non-local routes from route tables
   * @param client {@link EC2Client}
   * @param vpcId string
   */
  private async deleteRouteTables(client: EC2Client, vpcId: string): Promise<void> {
    const paginator = paginateDescribeRouteTables(
      { client },
      {
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      },
    );

    for await (const page of paginator) {
      for (const routeTable of page.RouteTables ?? []) {
        if (!routeTable.RouteTableId) {
          throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Route table missing RouteTableId`);
        }

        for (const route of routeTable.Routes ?? []) {
          // Skip system-created routes (including local routes) - only delete user-created routes
          if (route.Origin === RouteOrigin.CreateRoute && route.DestinationCidrBlock && route.GatewayId !== 'local') {
            this.logger.info(
              `Deleting route: ${route.DestinationCidrBlock} from route table ${routeTable.RouteTableId}`,
            );
            await throttlingBackOff(() =>
              client.send(
                new DeleteRouteCommand({
                  RouteTableId: routeTable.RouteTableId,
                  DestinationCidrBlock: route.DestinationCidrBlock,
                }),
              ),
            );

            // Wait for deletion to complete
            await this.waitForDeletion(async () => {
              try {
                const response = await client.send(
                  new DescribeRouteTablesCommand({ RouteTableIds: [routeTable.RouteTableId!] }),
                );
                const currentRoutes = response.RouteTables?.[0]?.Routes ?? [];
                const routeExists = currentRoutes.some(r => r.DestinationCidrBlock === route.DestinationCidrBlock);
                return !routeExists; // Return true if route is deleted
              } catch {
                return true; // Route table deleted or route deleted
              }
            }, `Route ${route.DestinationCidrBlock}`);
          }
        }
      }
    }
  }

  /**
   * Delete custom Network ACLs (skip default ones)
   * @param client {@link EC2Client}
   * @param vpcId string
   */
  private async deleteNetworkAcls(client: EC2Client, vpcId: string): Promise<void> {
    const paginator = paginateDescribeNetworkAcls(
      { client },
      {
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      },
    );

    for await (const page of paginator) {
      for (const nacl of page.NetworkAcls ?? []) {
        if (!nacl.NetworkAclId) {
          throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Network ACL missing NetworkAclId`);
        }

        // Skip default NACLs as they cannot be deleted
        if (nacl.IsDefault !== true) {
          this.logger.info(`Deleting Network ACL: ${nacl.NetworkAclId}`);
          await throttlingBackOff(() =>
            client.send(
              new DeleteNetworkAclCommand({
                NetworkAclId: nacl.NetworkAclId,
              }),
            ),
          );

          // Wait for deletion to complete
          await this.waitForDeletion(async () => {
            try {
              await client.send(new DescribeNetworkAclsCommand({ NetworkAclIds: [nacl.NetworkAclId!] }));
              return false; // Still exists
            } catch {
              return true; // Deleted
            }
          }, `Network ACL ${nacl.NetworkAclId}`);
        } else {
          this.logger.info(`Skipping default Network ACL: ${nacl.NetworkAclId}`);
        }
      }
    }
  }

  /**
   * Delete custom Security Groups (skip default ones)
   * @param client {@link EC2Client}
   * @param vpcId string
   */
  private async deleteSecurityGroups(client: EC2Client, vpcId: string): Promise<void> {
    const paginator = paginateDescribeSecurityGroups(
      { client },
      {
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      },
    );

    for await (const page of paginator) {
      for (const sg of page.SecurityGroups ?? []) {
        if (!sg.GroupId) {
          throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Security Group missing GroupId`);
        }

        // Skip default security groups as they cannot be deleted
        if (sg.GroupName !== 'default') {
          this.logger.info(`Deleting Security Group: ${sg.GroupId}`);
          await throttlingBackOff(() =>
            client.send(
              new DeleteSecurityGroupCommand({
                GroupId: sg.GroupId,
              }),
            ),
          );

          // Wait for deletion to complete
          await this.waitForDeletion(async () => {
            try {
              await client.send(new DescribeSecurityGroupsCommand({ GroupIds: [sg.GroupId!] }));
              return false; // Still exists
            } catch {
              return true; // Deleted
            }
          }, `Security Group ${sg.GroupId}`);
        } else {
          this.logger.info(`Skipping default Security Group: ${sg.GroupId}`);
        }
      }
    }
  }

  /**
   * Delete the VPC itself
   * @param client {@link EC2Client}
   * @param vpcId string
   */
  private async deleteVpc(client: EC2Client, vpcId: string): Promise<void> {
    this.logger.info(`Deleting VPC: ${vpcId}`);
    await throttlingBackOff(() =>
      client.send(
        new DeleteVpcCommand({
          VpcId: vpcId,
        }),
      ),
    );

    // Wait for deletion to complete
    await this.waitForDeletion(async () => {
      try {
        await client.send(new DescribeVpcsCommand({ VpcIds: [vpcId] }));
        return false; // Still exists
      } catch {
        return true; // Deleted
      }
    }, `VPC ${vpcId}`);
  }
}
