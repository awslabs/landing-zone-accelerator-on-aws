/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { DescribeSubnetsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * get-ipam-subnet-cidr - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: CloudFormationCustomResourceEvent) {
  console.log(event);
  const region = event.ResourceProperties['region'];
  const ssmSubnetIdPath = event.ResourceProperties['ssmSubnetIdPath'];
  const roleArn: string | undefined = event.ResourceProperties['roleArn'];
  const solutionId = process.env['SOLUTION_ID'];

  let ec2: EC2Client;
  let ssm: SSMClient;
  const stsClient = new STSClient({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const assumeRoleCredential = await throttlingBackOff(() =>
    stsClient.send(
      new AssumeRoleCommand({
        RoleArn: event.ResourceProperties['roleArn'],
        RoleSessionName: 'AcceleratorAssumeRoleSession',
      }),
    ),
  );
  if (roleArn) {
    ec2 = new EC2Client({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
        expiration: assumeRoleCredential.Credentials!.Expiration,
      },
    });

    ssm = new SSMClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
        expiration: assumeRoleCredential.Credentials!.Expiration,
      },
    });
  } else {
    ec2 = new EC2Client({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });
    ssm = new SSMClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`Starting - Create/Update event for IPAM Nacls ${region}`);
      // Pull VPC ID from SSM return ID
      const subnetId = await getVpcId(ssm, ssmSubnetIdPath);
      if (!subnetId) {
        throw new Error('Subnet ID not found.');
      }
      // Describe subnet with VPC ID as a filter
      const subnetCidr = await getCidr(ec2, subnetId);
      if (!subnetCidr) {
        throw new Error(`Not able to pull the Cidr from parameter store ${ssmSubnetIdPath}!`);
      }

      return {
        PhysicalResourceId: subnetCidr,
        Data: { ipv4CidrBlock: subnetCidr },
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

async function getVpcId(ssm: SSMClient, subnet: string): Promise<string | undefined> {
  const response = await throttlingBackOff(() => ssm.send(new GetParameterCommand({ Name: subnet })));
  return response.Parameter?.Value;
}

async function getCidr(ec2: EC2Client, subnet: string): Promise<string | undefined> {
  const response = await throttlingBackOff(() =>
    ec2.send(
      new DescribeSubnetsCommand({
        Filters: [
          {
            Name: 'subnet-id',
            Values: [subnet],
          },
        ],
      }),
    ),
  );
  return response.Subnets?.pop()?.CidrBlock;
}
