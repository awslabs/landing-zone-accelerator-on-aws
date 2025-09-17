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
import { describe, beforeEach, expect, test } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeInternetGatewaysCommand,
  DescribeSubnetsCommand,
  DescribeRouteTablesCommand,
  DescribeNetworkAclsCommand,
  DescribeSecurityGroupsCommand,
  DetachInternetGatewayCommand,
  DeleteInternetGatewayCommand,
  DeleteSubnetCommand,
  DeleteRouteCommand,
  DeleteNetworkAclCommand,
  DeleteSecurityGroupCommand,
  DeleteVpcCommand,
  RouteOrigin,
  VpcState,
  AttachmentStatus,
  RouteState,
} from '@aws-sdk/client-ec2';

import { DeleteDefaultVpcModule } from '../../../../lib/amazon-ec2/delete-default-vpc';
import { IDeleteDefaultVpcParameter } from '../../../../interfaces/amazon-ec2/delete-default-vpc';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

const ec2MockClient = mockClient(EC2Client);

const mockParameters: IDeleteDefaultVpcParameter = {
  ...MOCK_CONSTANTS.runnerParameters,
  configuration: {},
};

const mockVpc = {
  VpcId: 'vpc-12345678',
  CidrBlock: '172.31.0.0/16',
  IsDefault: true,
  State: VpcState.available,
};

const mockInternetGateway = {
  InternetGatewayId: 'igw-12345678',
  Attachments: [{ VpcId: 'vpc-12345678', State: AttachmentStatus.attached }],
};

const mockSubnet = {
  SubnetId: 'subnet-12345678',
  VpcId: 'vpc-12345678',
  CidrBlock: '172.31.0.0/20',
};

const mockRouteTable = {
  RouteTableId: 'rtb-12345678',
  VpcId: 'vpc-12345678',
  Routes: [
    {
      DestinationCidrBlock: '172.31.0.0/16',
      GatewayId: 'local',
      Origin: RouteOrigin.CreateRouteTable,
      State: RouteState.active,
    },
    {
      DestinationCidrBlock: '0.0.0.0/0',
      GatewayId: 'igw-12345678',
      Origin: RouteOrigin.CreateRoute,
      State: RouteState.active,
    },
  ],
};

const mockNetworkAcl = {
  NetworkAclId: 'acl-12345678',
  VpcId: 'vpc-12345678',
  IsDefault: false,
};

const mockDefaultNetworkAcl = {
  NetworkAclId: 'acl-default',
  VpcId: 'vpc-12345678',
  IsDefault: true,
};

const mockSecurityGroup = {
  GroupId: 'sg-12345678',
  GroupName: 'custom-sg',
  VpcId: 'vpc-12345678',
};

const mockDefaultSecurityGroup = {
  GroupId: 'sg-default',
  GroupName: 'default',
  VpcId: 'vpc-12345678',
};

describe('DeleteDefaultVpcModule', () => {
  let deleteDefaultVpcModule: DeleteDefaultVpcModule;

  beforeEach(() => {
    ec2MockClient.reset();
    deleteDefaultVpcModule = new DeleteDefaultVpcModule();
    process.env['NODE_ENV'] = 'test';
  });

  describe('Success Cases', () => {
    test('should return success message when no default VPCs found', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [] });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('No default VPCs found in the region');
    });

    test('should successfully delete default VPC with all resources', async () => {
      // Mock VPC discovery
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });

      // Mock resource discovery
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [mockSubnet] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [mockRouteTable] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [mockNetworkAcl] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockSecurityGroup] });

      // Mock deletion commands
      ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteSubnetCommand).resolves({});
      ec2MockClient.on(DeleteRouteCommand).resolves({});
      ec2MockClient.on(DeleteNetworkAclCommand).resolves({});
      ec2MockClient.on(DeleteSecurityGroupCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock resource not found for deletion verification
      ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });
      ec2MockClient.on(DescribeSubnetsCommand, { SubnetIds: ['subnet-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });
      ec2MockClient.on(DescribeNetworkAclsCommand, { NetworkAclIds: ['acl-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });
      ec2MockClient.on(DescribeSecurityGroupsCommand, { GroupIds: ['sg-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      // Mock route table check for route deletion verification - route should be gone
      ec2MockClient.on(DescribeRouteTablesCommand, { RouteTableIds: ['rtb-12345678'] }).resolves({
        RouteTables: [
          {
            RouteTableId: 'rtb-12345678',
            VpcId: 'vpc-12345678',
            Routes: [
              {
                DestinationCidrBlock: '172.31.0.0/16',
                GatewayId: 'local',
                Origin: RouteOrigin.CreateRouteTable,
                State: RouteState.active,
              },
            ],
          },
        ],
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should skip default network ACLs and security groups', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [mockDefaultNetworkAcl] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
      expect(ec2MockClient.commandCalls(DeleteNetworkAclCommand)).toHaveLength(0);
      expect(ec2MockClient.commandCalls(DeleteSecurityGroupCommand)).toHaveLength(0);
    });

    test('should only delete user-created routes', async () => {
      const routeTableWithLocalRoute = {
        RouteTableId: 'rtb-12345678',
        VpcId: 'vpc-12345678',
        Routes: [
          {
            DestinationCidrBlock: '172.31.0.0/16',
            GatewayId: 'local',
            Origin: RouteOrigin.CreateRouteTable,
            State: RouteState.active,
          },
        ],
      };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [routeTableWithLocalRoute] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
      expect(ec2MockClient.commandCalls(DeleteRouteCommand)).toHaveLength(0);
    });

    test('should handle multiple default VPCs', async () => {
      const mockVpc2 = { ...mockVpc, VpcId: 'vpc-87654321' };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc, mockVpc2] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-87654321'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 2 default VPC(s): vpc-12345678, vpc-87654321');
    });
  });

  describe('Dry Run Cases', () => {
    test('should return dry run message when no default VPCs found', async () => {
      const dryRunParams = { ...mockParameters, dryRun: true };
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [] });

      const result = await deleteDefaultVpcModule.handler(dryRunParams);

      expect(result).toContain('Will skip deletion - no default VPC found');
    });

    test('should return dry run message when default VPCs found', async () => {
      const dryRunParams = { ...mockParameters, dryRun: true };
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });

      const result = await deleteDefaultVpcModule.handler(dryRunParams);

      expect(result).toContain('Will delete default VPC');
    });
  });

  describe('Error Cases', () => {
    test('should throw error when VPC discovery fails', async () => {
      ec2MockClient.on(DescribeVpcsCommand).rejects(new Error('Access denied'));

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to retrieve default VPCs`,
      );
    });

    test('should throw error when VPC has missing VpcId', async () => {
      const vpcWithoutId = { ...mockVpc, VpcId: undefined };
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [vpcWithoutId] });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('No default VPCs found in the region');
    });

    test('should throw error when Internet Gateway deletion fails', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
      ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteInternetGatewayCommand).rejects(new Error('Deletion failed'));

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should throw error when subnet deletion fails', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [mockSubnet] });
      ec2MockClient.on(DeleteSubnetCommand).rejects(new Error('Deletion failed'));

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should throw error when route deletion fails', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [mockRouteTable] });
      ec2MockClient.on(DeleteRouteCommand).rejects(new Error('Deletion failed'));

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should throw error when network ACL deletion fails', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [mockNetworkAcl] });
      ec2MockClient.on(DeleteNetworkAclCommand).rejects(new Error('Deletion failed'));

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should throw error when security group deletion fails', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockSecurityGroup] });
      ec2MockClient.on(DeleteSecurityGroupCommand).rejects(new Error('Deletion failed'));

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should throw error when VPC deletion fails', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).rejects(new Error('Deletion failed'));

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should throw error when resource has missing ID', async () => {
      const igwWithoutId = { ...mockInternetGateway, InternetGatewayId: undefined };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [igwWithoutId] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Internet Gateway missing InternetGatewayId`,
      );
    });

    test('should throw error when subnet has missing ID', async () => {
      const subnetWithoutId = { ...mockSubnet, SubnetId: undefined };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [subnetWithoutId] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Subnet missing SubnetId`,
      );
    });

    test('should throw error when route table has missing ID', async () => {
      const routeTableWithoutId = { ...mockRouteTable, RouteTableId: undefined };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [routeTableWithoutId] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Route table missing RouteTableId`,
      );
    });

    test('should throw error when network ACL has missing ID', async () => {
      const naclWithoutId = { ...mockNetworkAcl, NetworkAclId: undefined };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [naclWithoutId] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Network ACL missing NetworkAclId`,
      );
    });

    test('should throw error when security group has missing ID', async () => {
      const sgWithoutId = { ...mockSecurityGroup, GroupId: undefined };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [sgWithoutId] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Security Group missing GroupId`,
      );
    });

    test('should throw timeout error when resource deletion takes too long', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
      ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});

      // Mock resource still exists after deletion attempts
      ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).resolves({
        InternetGateways: [mockInternetGateway],
      });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for Internet Gateway igw-12345678 deletion`,
      );
    });

    test('should handle InvalidResourceID NotFound error during resource deletion verification', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock InvalidResourceID.NotFound error for deletion verification
      const notFoundError = new Error('Resource not found');
      notFoundError.name = 'InvalidResourceID.NotFound';
      ec2MockClient
        .on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] })
        .rejects(notFoundError);
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects(notFoundError);

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle non InvalidResourceID error during resource deletion verification', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock non-InvalidResourceID error that should cause timeout
      ec2MockClient
        .on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] })
        .rejects(new Error('Some other error'));
      // Mock VPC still exists to cause timeout
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).resolves({ Vpcs: [mockVpc] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should handle route deletion verification when route table check throws error', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [mockRouteTable] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteRouteCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock route table check throwing error (should be treated as route deleted)
      ec2MockClient
        .on(DescribeRouteTablesCommand, { RouteTableIds: ['rtb-12345678'] })
        .rejects(new Error('Route table error'));
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle route deletion verification when route still exists in route table', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [mockRouteTable] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteRouteCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock route table check showing route still exists (should timeout)
      ec2MockClient.on(DescribeRouteTablesCommand, { RouteTableIds: ['rtb-12345678'] }).resolves({
        RouteTables: [
          {
            RouteTableId: 'rtb-12345678',
            VpcId: 'vpc-12345678',
            Routes: [
              {
                DestinationCidrBlock: '0.0.0.0/0',
                GatewayId: 'igw-12345678',
                Origin: RouteOrigin.CreateRoute,
                State: RouteState.active,
              },
            ],
          },
        ],
      });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for Route 0.0.0.0/0 deletion`,
      );
    });

    test('should handle internet gateway with no attachments', async () => {
      const igwWithoutAttachments = {
        InternetGatewayId: 'igw-12345678',
        Attachments: [],
      };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [igwWithoutAttachments] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle internet gateway attachment without state or vpcId', async () => {
      const igwWithIncompleteAttachment = {
        InternetGatewayId: 'igw-12345678',
        Attachments: [{}],
      };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [igwWithIncompleteAttachment] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle route with no destination CIDR block', async () => {
      const routeTableWithIncompleteRoute = {
        RouteTableId: 'rtb-12345678',
        VpcId: 'vpc-12345678',
        Routes: [
          {
            GatewayId: 'igw-12345678',
            Origin: RouteOrigin.CreateRoute,
            State: RouteState.active,
          },
        ],
      };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [routeTableWithIncompleteRoute] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle route with local gateway', async () => {
      const routeTableWithLocalGateway = {
        RouteTableId: 'rtb-12345678',
        VpcId: 'vpc-12345678',
        Routes: [
          {
            DestinationCidrBlock: '0.0.0.0/0',
            GatewayId: 'local',
            Origin: RouteOrigin.CreateRoute,
            State: RouteState.active,
          },
        ],
      };

      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [routeTableWithLocalGateway] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle subnet deletion verification error', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [mockSubnet] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteSubnetCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock subnet check throwing error (should be treated as subnet deleted)
      ec2MockClient.on(DescribeSubnetsCommand, { SubnetIds: ['subnet-12345678'] }).rejects(new Error('Subnet error'));
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle network ACL deletion verification error', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [mockNetworkAcl] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteNetworkAclCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock network ACL check throwing error (should be treated as deleted)
      ec2MockClient
        .on(DescribeNetworkAclsCommand, { NetworkAclIds: ['acl-12345678'] })
        .rejects(new Error('Network ACL error'));
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle security group deletion verification error', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockSecurityGroup] });
      ec2MockClient.on(DeleteSecurityGroupCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock security group check throwing error (should be treated as deleted)
      ec2MockClient
        .on(DescribeSecurityGroupsCommand, { GroupIds: ['sg-12345678'] })
        .rejects(new Error('Security group error'));
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle VPC deletion verification error', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock VPC check throwing error (should be treated as deleted)
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects(new Error('VPC error'));

      const result = await deleteDefaultVpcModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });

    test('should handle waitForDeletion with non Error instance', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock non-Error instance being thrown
      const nonErrorInstance = 'string error';
      ec2MockClient
        .on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] })
        .rejects(nonErrorInstance);
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).resolves({ Vpcs: [mockVpc] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should handle subnet deletion with still existing subnet', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [mockSubnet] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteSubnetCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock subnet still exists after deletion attempts
      ec2MockClient.on(DescribeSubnetsCommand, { SubnetIds: ['subnet-12345678'] }).resolves({
        Subnets: [mockSubnet],
      });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for Subnet subnet-12345678 deletion`,
      );
    });

    test('should handle network ACL deletion with still existing network ACL', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [mockNetworkAcl] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteNetworkAclCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock network ACL still exists after deletion attempts
      ec2MockClient.on(DescribeNetworkAclsCommand, { NetworkAclIds: ['acl-12345678'] }).resolves({
        NetworkAcls: [mockNetworkAcl],
      });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for Network ACL acl-12345678 deletion`,
      );
    });

    test('should handle security group deletion with still existing security group', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockSecurityGroup] });
      ec2MockClient.on(DeleteSecurityGroupCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock security group still exists after deletion attempts
      ec2MockClient.on(DescribeSecurityGroupsCommand, { GroupIds: ['sg-12345678'] }).resolves({
        SecurityGroups: [mockSecurityGroup],
      });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for Security Group sg-12345678 deletion`,
      );
    });

    test('should handle VPC deletion with still existing VPC', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock VPC still exists after deletion attempts
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).resolves({ Vpcs: [mockVpc] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for VPC vpc-12345678 deletion`,
      );
    });

    test('should handle waitForDeletion with error that is not InvalidResourceID NotFound', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Mock error that is an Error instance but not InvalidResourceID.NotFound
      const otherError = new Error('Some other error');
      otherError.name = 'SomeOtherError';
      ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).rejects(otherError);
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).resolves({ Vpcs: [mockVpc] });

      await expect(deleteDefaultVpcModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete VPC vpc-12345678`,
      );
    });

    test('should handle non-InvalidResourceID error and continue retry loop', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      const tempError = new Error('Temporary error');
      tempError.name = 'TemporaryError';

      ec2MockClient
        .on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] })
        .rejectsOnce(tempError)
        .resolves({ Vpcs: [] });

      await deleteDefaultVpcModule.handler(mockParameters);
    });

    test('should handle InvalidResourceID NotFound error in waitForDeletion', async () => {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});

      // Create error with exact name that matches the condition
      const notFoundError = new Error('Resource not found');
      notFoundError.name = 'InvalidResourceID.NotFound';

      // Mock the VPC check to throw the specific error on first call
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejectsOnce(notFoundError);

      const result = await deleteDefaultVpcModule.handler(mockParameters);
      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    });
  });

  test('should cover nested error handling lines', async () => {
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteVpcCommand).resolves({});

    const notFoundError = new Error('Resource not found');
    notFoundError.name = 'InvalidResourceID.NotFound';

    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejectsOnce(notFoundError);

    await deleteDefaultVpcModule.handler(mockParameters);
  });

  test('should handle empty arrays and undefined responses for 100% branch coverage', async () => {
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: undefined });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: undefined });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: undefined });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: undefined });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: undefined });
    ec2MockClient.on(DeleteVpcCommand).resolves({});
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle route with undefined DestinationCidrBlock', async () => {
    const routeTableWithUndefinedRoute = {
      RouteTableId: 'rtb-12345678',
      VpcId: 'vpc-12345678',
      Routes: [
        {
          DestinationCidrBlock: undefined,
          GatewayId: 'igw-12345678',
          Origin: RouteOrigin.CreateRoute,
          State: RouteState.active,
        },
      ],
    };

    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [routeTableWithUndefinedRoute] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteVpcCommand).resolves({});
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle attachment without State', async () => {
    const igwWithoutState = {
      InternetGatewayId: 'igw-12345678',
      Attachments: [{ VpcId: 'vpc-12345678' }],
    };

    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [igwWithoutState] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
    ec2MockClient.on(DeleteVpcCommand).resolves({});
    ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle attachment without VpcId', async () => {
    const igwWithoutVpcId = {
      InternetGatewayId: 'igw-12345678',
      Attachments: [{ State: AttachmentStatus.attached }],
    };

    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [igwWithoutVpcId] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
    ec2MockClient.on(DeleteVpcCommand).resolves({});
    ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should cover null coalescing branches', async () => {
    // Test with undefined Vpcs array
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: undefined });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('No default VPCs found in the region');
  });

  test('should handle IGW with undefined Attachments', async () => {
    const igwWithUndefinedAttachments = {
      InternetGatewayId: 'igw-12345678',
      Attachments: undefined,
    };

    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [igwWithUndefinedAttachments] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
    ec2MockClient.on(DeleteVpcCommand).resolves({});
    ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle route table with undefined Routes', async () => {
    const routeTableWithUndefinedRoutes = {
      RouteTableId: 'rtb-12345678',
      VpcId: 'vpc-12345678',
      Routes: undefined,
    };

    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [routeTableWithUndefinedRoutes] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteVpcCommand).resolves({});
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle route table check with undefined RouteTables', async () => {
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [mockRouteTable] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteRouteCommand).resolves({});
    ec2MockClient.on(DeleteVpcCommand).resolves({});

    // Mock route table check with undefined RouteTables
    ec2MockClient.on(DescribeRouteTablesCommand, { RouteTableIds: ['rtb-12345678'] }).resolves({
      RouteTables: undefined,
    });
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle route table check with undefined Routes in first table', async () => {
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [mockRouteTable] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DeleteRouteCommand).resolves({});
    ec2MockClient.on(DeleteVpcCommand).resolves({});

    // Mock route table check with undefined Routes in first table
    ec2MockClient.on(DescribeRouteTablesCommand, { RouteTableIds: ['rtb-12345678'] }).resolves({
      RouteTables: [{ RouteTableId: 'rtb-12345678', Routes: undefined }],
    });
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle waitForDeletion in non-test environment', async () => {
    // Temporarily change NODE_ENV to trigger the other branch
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    try {
      ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
      ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [] });
      ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
      ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
      ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
      ec2MockClient.on(DeleteVpcCommand).resolves({});
      ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
        name: 'InvalidResourceID.NotFound',
      });

      const result = await deleteDefaultVpcModule.handler(mockParameters);
      expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
  });

  test('should handle paginator with empty pages', async () => {
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [] });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('No default VPCs found in the region');
  });

  test('should handle error in waitForDeletion catch block', async () => {
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
    ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
    ec2MockClient.on(DeleteVpcCommand).resolves({});

    // Mock error in checkFunction that gets caught
    let callCount = 0;
    ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).callsFake(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Temporary error');
      }
      throw { name: 'InvalidResourceID.NotFound' };
    });
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });

  test('should handle catch block with non-Error exception', async () => {
    ec2MockClient.on(DescribeVpcsCommand).resolves({ Vpcs: [mockVpc] });
    ec2MockClient.on(DescribeInternetGatewaysCommand).resolves({ InternetGateways: [mockInternetGateway] });
    ec2MockClient.on(DescribeSubnetsCommand).resolves({ Subnets: [] });
    ec2MockClient.on(DescribeRouteTablesCommand).resolves({ RouteTables: [] });
    ec2MockClient.on(DescribeNetworkAclsCommand).resolves({ NetworkAcls: [] });
    ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });
    ec2MockClient.on(DetachInternetGatewayCommand).resolves({});
    ec2MockClient.on(DeleteInternetGatewayCommand).resolves({});
    ec2MockClient.on(DeleteVpcCommand).resolves({});

    // Mock non-Error exception in checkFunction that gets caught
    let callCount = 0;
    ec2MockClient.on(DescribeInternetGatewaysCommand, { InternetGatewayIds: ['igw-12345678'] }).callsFake(() => {
      callCount++;
      if (callCount === 1) {
        throw 'string error'; // Non-Error exception
      }
      throw { name: 'InvalidResourceID.NotFound' };
    });
    ec2MockClient.on(DescribeVpcsCommand, { VpcIds: ['vpc-12345678'] }).rejects({
      name: 'InvalidResourceID.NotFound',
    });

    const result = await deleteDefaultVpcModule.handler(mockParameters);
    expect(result).toBe('Successfully deleted 1 default VPC(s): vpc-12345678');
  });
});
