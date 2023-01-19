/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';

/**
 * get-ipam-subnet-cidr - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  console.log(event);
  const region = event.ResourceProperties['region'];
  const ssmSubnetIdPath = event.ResourceProperties['ssmSubnetIdPath'];
  //const roleArn = event.ResourceProperties['roleArn'];
  const roleArn: string | undefined = event.ResourceProperties['roleArn'];

  let ec2: AWS.EC2 | undefined;
  let ssm: AWS.SSM | undefined;
  const stsClient = new AWS.STS({ region });
  const assumeRoleCredential = await throttlingBackOff(() =>
    stsClient
      .assumeRole({
        RoleArn: event.ResourceProperties['roleArn'],
        RoleSessionName: 'AcceleratorAssumeRoleSession',
      })
      .promise(),
  );
  if (roleArn) {
    ec2 = new AWS.EC2({
      region,
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
        expireTime: assumeRoleCredential.Credentials!.Expiration,
      },
    });

    ssm = new AWS.SSM({
      region,
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
        expireTime: assumeRoleCredential.Credentials!.Expiration,
      },
    });
  } else {
    ec2 = new AWS.EC2({ region });
    ssm = new AWS.SSM({ region });
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(`Starting - Create/Update event for IPAM Nacls ${region}`);
      // Pull VPC ID from SSM return ID
      const subnetId = await getVpcId(ssm!, ssmSubnetIdPath);
      if (!subnetId) {
        throw new Error('Subnet ID not found.');
      }
      // Describe subnet with VPC ID as a filter
      const subnetCidr = await getCidr(ec2!, subnetId);
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

async function getVpcId(ssm: AWS.SSM, subnet: string): Promise<string | undefined> {
  const response = await throttlingBackOff(() => ssm.getParameter({ Name: subnet }).promise());
  return response.Parameter?.Value;
}

async function getCidr(ec2: AWS.EC2, subnet: string): Promise<string | undefined> {
  const response = await throttlingBackOff(() =>
    ec2
      .describeSubnets({
        Filters: [
          {
            Name: 'subnet-id',
            Values: [subnet],
          },
        ],
      })
      .promise(),
  );
  return response.Subnets?.pop()?.CidrBlock;
}
