/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/**
 * aws-ec2-pre-warm-account - lambda handler
 *
 * @param event
 * @returns
 */

import {
  EC2Client,
  CreateVpcCommand,
  RunInstancesCommand,
  CreateSubnetCommand,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  TerminateInstancesCommand,
  DeleteVpcCommand,
  DeleteSubnetCommand,
  DescribeSubnetsCommand,
} from '@aws-sdk/client-ec2';
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  DeleteParameterCommand,
  ParameterType,
} from '@aws-sdk/client-ssm';
import { AdaptiveRetryStrategy } from '@aws-sdk/util-retry';
import { delay } from '@aws-accelerator/utils';
const solutionId = process.env['SOLUTION_ID'] ?? '';
const retryStrategy = new AdaptiveRetryStrategy(() => Promise.resolve(5));
const ec2Client = new EC2Client({ customUserAgent: solutionId, retryStrategy });
const ssmClient = new SSMClient({ customUserAgent: solutionId, retryStrategy });

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      IsComplete: boolean;
    }
  | undefined
> {
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const isWarm = await checkWarm();
      if (isWarm) {
        return {
          IsComplete: true,
        };
      }
      await createSsmParameter();
      await createVpcAndInstance();
      return {
        IsComplete: false,
      };

    case 'Delete':
      await terminateInstances();
      await deleteVpc();
      await deleteSsmParameter();
      return {
        IsComplete: true,
      };
  }
}

async function checkWarm(): Promise<boolean> {
  console.log('Checking if account has been pre-warmed');
  let warmed = false;
  try {
    const parameter = ssmClient.send(
      new GetParameterCommand({
        Name: '/accelerator/account/pre-warmed',
      }),
    );
    warmed = (parameter.Parameter?.Value ?? 'false') === 'true';
  } catch (e) {
    console.log(`SSM parameter doesn't exist warming account`);
  }
  return warmed;
}

async function createSsmParameter() {
  console.log('Creating SSM Parameter');
  try {
    ssmClient.send(
      new PutParameterCommand({
        Name: '/accelerator/account/pre-warmed',
        Value: 'false',
        Description: 'Flag for account pre-warming',
        Type: ParameterType.STRING,
        Overwrite: true,
      }),
    );
  } catch (e) {
    console.log(e);
    throw new Error('Failed creating SSM Parameter');
  }
}

async function createVpcAndInstance() {
  console.log('Creating VPC and Subnet');
  let vpcId: string | undefined;
  let subnetId: string | undefined;
  vpcId = await getVpcId();
  if (!vpcId) {
    const vpcResponse = await ec2Client.send(
      new CreateVpcCommand({
        CidrBlock: '10.10.10.0/24',
        TagSpecifications: [{ ResourceType: 'vpc', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
      }),
    );
    vpcId = vpcResponse.Vpc?.VpcId;
  } else {
    subnetId = await getSubnetId(vpcId);
  }
  console.log(`VpcId: ${vpcId}`);

  if (!subnetId) {
    const ec2Subnet = await ec2Client.send(
      new CreateSubnetCommand({
        VpcId: vpcId,
        CidrBlock: '10.10.10.0/24',
        TagSpecifications: [{ ResourceType: 'subnet', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
      }),
    );
    subnetId = ec2Subnet.Subnet?.SubnetId;
  }
  console.log(`SubnetId: ${subnetId}`);

  const instanceId = await getInstanceId();

  if (!instanceId) {
    const imageParameter = await ssmClient.send(
      new GetParameterCommand({ Name: '/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2' }),
    );
    const imageId = imageParameter.Parameter?.Value;
    console.log(`AMI Id: ${imageId}`);

    const ec2Instance = await ec2Client.send(
      new RunInstancesCommand({
        InstanceType: 't2.micro',
        MaxCount: 1,
        MinCount: 1,
        SubnetId: subnetId,
        ImageId: imageId,
        TagSpecifications: [{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
      }),
    );
    console.log(`Created EC2 Instance Id: ${ec2Instance.Instances[0].InstanceId}`);
  } else {
    console.log(`Using EC2 Instance Id: ${instanceId}`);
  }
}

async function deleteSsmParameter() {
  console.log('Deleting SSM Parameter');
  try {
    ssmClient.send(
      new DeleteParameterCommand({
        Name: '/accelerator/account/pre-warmed',
      }),
    );
  } catch (e) {
    console.log(e);
    throw new Error('Failed deleting SSM Parameter');
  }
}

async function deleteVpc() {
  console.log('Deleting VPC');
  const vpcId = await getVpcId();

  if (vpcId) {
    console.log('Deleting subnets');
    const subnets = await ec2Client.send(
      new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }] }),
    );
    for (const subnet of subnets.Subnets) {
      await ec2Client.send(new DeleteSubnetCommand({ SubnetId: subnet.SubnetId }));
    }
    console.log(`Deleting VPC with id: ${vpcId}`);
    await ec2Client.send(new DeleteVpcCommand({ VpcId: vpcId }));
  }
}

async function getInstanceId(): Promise<string | undefined> {
  console.log('Getting Instance Id');
  const ec2Instances = await ec2Client.send(
    new DescribeInstancesCommand({ Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] }),
  );

  for (const ec2Reservation of ec2Instances.Reservations) {
    for (const ec2Instance of ec2Reservation.Instances) {
      console.log(`Existing EC2 Instance Id, State Code: ${ec2Instance.InstanceId}, ${ec2Instance.State?.Code}`);
      if (ec2Instance.State.Code !== 48 && ec2Instance.State.Code !== 32) {
        return ec2Instance.InstanceId;
      }
    }
  }
  return undefined;
}

async function getVpcId(): Promise<string | undefined> {
  console.log('Getting VPC Id');
  const vpcs = await ec2Client.send(
    new DescribeVpcsCommand({ Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] }),
  );

  if (vpcs.Vpcs?.length ?? 0 > 0) {
    return vpcs.Vpcs![0].VpcId;
  }
  return undefined;
}

async function getSubnetId(vpcId: string): Promise<string | undefined> {
  console.log('Getting Subnet Id');
  const subnets = await ec2Client.send(
    new DescribeSubnetsCommand({
      Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
    }),
  );
  if (subnets.Subnets) {
    return subnets.Subnets[0].SubnetId;
  }
  return undefined;
}

async function terminateInstances(): Promise<void> {
  console.log('Checking for ec2 instance to terminate');
  const ec2Instances = await ec2Client.send(
    new DescribeInstancesCommand({ Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] }),
  );

  for (const ec2Reservation of ec2Instances.Reservations) {
    for (const ec2Instance of ec2Reservation.Instances) {
      if (ec2Instance.State?.Name === 'terminated' || ec2Instance.State?.Code === 48) {
        continue;
      }
      if (ec2Instance.State?.Name === 'shutting-down' || ec2Instance.State?.Code === 32) {
        await waitForTermination(ec2Instance.InstanceId!);
      }
      console.log(`Terminating EC2 Instance Id: ${ec2Instance.InstanceId}`);
      await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [ec2Instance.InstanceId!] }));
      await waitForTermination(ec2Instance.InstanceId!);
    }
  }
}

async function waitForTermination(instanceId: string): Promise<void> {
  console.log(`Waiting for termination of instanceId: ${instanceId}`);
  let ec2Terminated = false;
  while (!ec2Terminated) {
    const statusResponse = await ec2Client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    if (
      statusResponse.Reservations[0].Instances[0].State?.Name !== 'terminated' ||
      statusResponse.Reservations[0].Instances[0].State?.Code !== 48
    ) {
      delay(15000);
      continue;
    }
    ec2Terminated = true;
  }
}
