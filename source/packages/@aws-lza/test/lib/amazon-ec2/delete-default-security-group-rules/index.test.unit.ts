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
  DescribeSecurityGroupsCommand,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  EC2ServiceException,
} from '@aws-sdk/client-ec2';

import { DeleteDefaultSecurityGroupRulesModule } from '../../../../lib/amazon-ec2/delete-default-security-group-rules';
import { IDeleteDefaultSecurityGroupRulesParameter } from '../../../../interfaces/amazon-ec2/delete-default-security-group-rules';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

const ec2MockClient = mockClient(EC2Client);

const mockParameters: IDeleteDefaultSecurityGroupRulesParameter = {
  ...MOCK_CONSTANTS.runnerParameters,
  configuration: {
    vpcId: 'vpc-12345678',
  },
};

const mockDefaultSecurityGroup = {
  GroupId: 'sg-12345678',
  GroupName: 'default',
  VpcId: 'vpc-12345678',
};

describe('DeleteDefaultSecurityGroupRulesModule', () => {
  let deleteDefaultSecurityGroupRulesModule: DeleteDefaultSecurityGroupRulesModule;

  beforeEach(() => {
    ec2MockClient.reset();
    deleteDefaultSecurityGroupRulesModule = new DeleteDefaultSecurityGroupRulesModule();
  });

  describe('Success Cases', () => {
    test('should successfully delete default security group rules', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).resolves({});

      const result = await deleteDefaultSecurityGroupRulesModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted default security group rules for VPC: vpc-12345678');
      expect(ec2MockClient.commandCalls(RevokeSecurityGroupEgressCommand)).toHaveLength(1);
      expect(ec2MockClient.commandCalls(RevokeSecurityGroupIngressCommand)).toHaveLength(1);
    });

    test('should handle egress rules already deleted (InvalidPermission.NotFound)', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });

      const notFoundError = new EC2ServiceException({
        name: 'InvalidPermission.NotFound',
        message: 'Rule not found',
        $fault: 'client',
        $metadata: {},
      });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).rejects(notFoundError);
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).resolves({});

      const result = await deleteDefaultSecurityGroupRulesModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted default security group rules for VPC: vpc-12345678');
    });

    test('should handle ingress rules already deleted (InvalidPermission.NotFound)', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});

      const notFoundError = new EC2ServiceException({
        name: 'InvalidPermission.NotFound',
        message: 'Rule not found',
        $fault: 'client',
        $metadata: {},
      });
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).rejects(notFoundError);

      const result = await deleteDefaultSecurityGroupRulesModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted default security group rules for VPC: vpc-12345678');
    });

    test('should handle both rules already deleted (InvalidPermission.NotFound)', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });

      const notFoundError = new EC2ServiceException({
        name: 'InvalidPermission.NotFound',
        message: 'Rule not found',
        $fault: 'client',
        $metadata: {},
      });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).rejects(notFoundError);
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).rejects(notFoundError);

      const result = await deleteDefaultSecurityGroupRulesModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted default security group rules for VPC: vpc-12345678');
    });

    test('should handle multiple security groups with default name (uses first one)', async () => {
      const secondSecurityGroup = { ...mockDefaultSecurityGroup, GroupId: 'sg-87654321' };
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({
        SecurityGroups: [mockDefaultSecurityGroup, secondSecurityGroup],
      });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).resolves({});

      const result = await deleteDefaultSecurityGroupRulesModule.handler(mockParameters);

      expect(result).toBe('Successfully deleted default security group rules for VPC: vpc-12345678');
      // Verify it used the first security group's ID
      const egressCall = ec2MockClient.commandCalls(RevokeSecurityGroupEgressCommand)[0];
      expect(egressCall.args[0].input.GroupId).toBe('sg-12345678');
    });

    test('should handle empty SecurityGroups array', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Default security group not found for VPC: vpc-12345678`,
      );
    });

    test('should handle undefined SecurityGroups array', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: undefined });

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Default security group not found for VPC: vpc-12345678`,
      );
    });

    test('should handle security group without GroupId', async () => {
      const sgWithoutId = { ...mockDefaultSecurityGroup, GroupId: undefined };
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [sgWithoutId] });

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Default security group not found for VPC: vpc-12345678`,
      );
    });
  });

  describe('Dry Run Cases', () => {
    test('should return dry run message', async () => {
      const dryRunParams = { ...mockParameters, dryRun: true };

      const result = await deleteDefaultSecurityGroupRulesModule.handler(dryRunParams);

      expect(result).toContain('Will delete default security group rules for VPC: vpc-12345678');
    });
  });

  describe('Error Cases', () => {
    test('should throw error when security group discovery fails', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).rejects(
        new EC2ServiceException({
          name: 'AccessDenied',
          message: 'Access denied',
          $fault: 'client',
          $metadata: {},
        }),
      );

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC vpc-12345678`,
      );
    });

    test('should throw error when default security group not found', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [] });

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Default security group not found for VPC: vpc-12345678`,
      );
    });

    test('should throw error when egress rule deletion fails with non-InvalidPermission error', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).rejects(
        new EC2ServiceException({
          name: 'AccessDenied',
          message: 'Access denied',
          $fault: 'client',
          $metadata: {},
        }),
      );

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC vpc-12345678`,
      );
    });

    test('should throw error when ingress rule deletion fails with non-InvalidPermission error', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).rejects(
        new EC2ServiceException({
          name: 'AccessDenied',
          message: 'Access denied',
          $fault: 'client',
          $metadata: {},
        }),
      );

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC vpc-12345678`,
      );
    });

    test('should handle non-Error instance in egress rule deletion', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).rejects('string error');

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC vpc-12345678`,
      );
    });

    test('should handle non-Error instance in ingress rule deletion', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).rejects('string error');

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC vpc-12345678`,
      );
    });

    test('should handle Error instance with different name in egress rule deletion', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });

      const otherError = new EC2ServiceException({
        name: 'SomeOtherError',
        message: 'Some other error',
        $fault: 'client',
        $metadata: {},
      });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).rejects(otherError);

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC vpc-12345678`,
      );
    });

    test('should handle Error instance with different name in ingress rule deletion', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});

      const otherError = new EC2ServiceException({
        name: 'SomeOtherError',
        message: 'Some other error',
        $fault: 'client',
        $metadata: {},
      });
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).rejects(otherError);

      await expect(deleteDefaultSecurityGroupRulesModule.handler(mockParameters)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete default security group rules for VPC vpc-12345678`,
      );
    });

    test('should pass through all input parameters correctly', async () => {
      const customInput: IDeleteDefaultSecurityGroupRulesParameter = {
        region: 'us-west-2',
        partition: 'aws-us-gov',
        configuration: {
          vpcId: 'vpc-custom123',
        },
        operation: 'delete-default-security-group-rules',
        dryRun: false,
        solutionId: 'custom-solution',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          sessionToken: 'test-token',
        },
      };

      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).resolves({});

      const result = await deleteDefaultSecurityGroupRulesModule.handler(customInput);

      expect(result).toBe('Successfully deleted default security group rules for VPC: vpc-custom123');
    });

    test('should verify correct parameters are passed to AWS SDK commands', async () => {
      ec2MockClient.on(DescribeSecurityGroupsCommand).resolves({ SecurityGroups: [mockDefaultSecurityGroup] });
      ec2MockClient.on(RevokeSecurityGroupEgressCommand).resolves({});
      ec2MockClient.on(RevokeSecurityGroupIngressCommand).resolves({});

      await deleteDefaultSecurityGroupRulesModule.handler(mockParameters);

      // Verify DescribeSecurityGroupsCommand parameters
      const describeCall = ec2MockClient.commandCalls(DescribeSecurityGroupsCommand)[0];
      expect(describeCall.args[0].input).toEqual({
        Filters: [
          { Name: 'group-name', Values: ['default'] },
          { Name: 'vpc-id', Values: ['vpc-12345678'] },
        ],
      });

      // Verify RevokeSecurityGroupEgressCommand parameters
      const egressCall = ec2MockClient.commandCalls(RevokeSecurityGroupEgressCommand)[0];
      expect(egressCall.args[0].input).toEqual({
        GroupId: 'sg-12345678',
        IpPermissions: [
          {
            IpProtocol: '-1',
            IpRanges: [{ CidrIp: '0.0.0.0/0' }],
          },
        ],
      });

      // Verify RevokeSecurityGroupIngressCommand parameters
      const ingressCall = ec2MockClient.commandCalls(RevokeSecurityGroupIngressCommand)[0];
      expect(ingressCall.args[0].input).toEqual({
        GroupId: 'sg-12345678',
        IpPermissions: [
          {
            IpProtocol: '-1',
            UserIdGroupPairs: [{ GroupId: 'sg-12345678' }],
          },
        ],
      });
    });
  });
});
