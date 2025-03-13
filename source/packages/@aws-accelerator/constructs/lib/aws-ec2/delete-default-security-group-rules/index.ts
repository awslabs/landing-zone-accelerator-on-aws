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
  DescribeSecurityGroupsCommand,
  EC2Client,
  RevokeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
} from '@aws-sdk/client-ec2';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * delete-default-security-group-rules - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  // Retrieve operating region that stack is ran
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const ec2 = new EC2Client({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const vpcId = event.ResourceProperties['vpcId'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`Starting - Deletion of default security group ingress and egress rules for ${vpcId}`);
      const securityGroupParams = {
        Filters: [
          {
            Name: 'group-name',
            Values: ['default'],
          },
          {
            Name: 'vpc-id',
            Values: [vpcId],
          },
        ],
      };
      // Pull VPC ID from SSM return ID
      const securityGroupId = await getDefaultSecurityGroupId(ec2, securityGroupParams);
      console.log(securityGroupId);
      if (!securityGroupId) {
        throw new Error('Security Group ID not found.');
      }
      // Build traffic parameter to pass to ingress and egress removal functions.
      const ingresstrafficParams = {
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: '-1',
            UserIdGroupPairs: [
              {
                GroupId: securityGroupId,
              },
            ],
          },
        ],
      };
      const egresstrafficParams = {
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: '-1',
            IpRanges: [
              {
                CidrIp: '0.0.0.0/0',
              },
            ],
          },
        ],
      };

      console.log(`Removing egress rules for ${securityGroupId}`);
      await deleteEgressRules(ec2, egresstrafficParams);

      console.log(`Removing ingress rules for ${securityGroupId}`);
      await deleteIngressRules(ec2, ingresstrafficParams);

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      // Do Nothing
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getDefaultSecurityGroupId(
  ec2: EC2Client,
  params: {
    Filters: {
      Name: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Values: any[];
    }[];
  },
): Promise<string | undefined> {
  const response = await throttlingBackOff(() => ec2.send(new DescribeSecurityGroupsCommand(params)));
  return response.SecurityGroups![0].GroupId;
}

async function deleteEgressRules(
  ec2: EC2Client,
  params: {
    GroupId: string;
    IpPermissions: {
      IpProtocol: string;
      IpRanges: {
        CidrIp: string;
      }[];
    }[];
  },
) {
  try {
    await throttlingBackOff(() => ec2.send(new RevokeSecurityGroupEgressCommand(params)));
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'InvalidPermission.NotFound') {
      return;
    }
    throw e;
  }
}

async function deleteIngressRules(
  ec2: EC2Client,
  params: {
    GroupId: string;
    IpPermissions: {
      IpProtocol: string;
      UserIdGroupPairs: {
        GroupId: string;
      }[];
    }[];
  },
) {
  try {
    await throttlingBackOff(() => ec2.send(new RevokeSecurityGroupIngressCommand(params)));
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'InvalidPermission.NotFound') {
      return;
    }
    throw e;
  }
}
