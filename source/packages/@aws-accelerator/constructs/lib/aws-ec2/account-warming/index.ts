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
import { throttlingBackOff, delay } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '../../lza-custom-resource';
const solutionId = process.env['SOLUTION_ID'] ?? '';

const ec2Client = new EC2Client({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
const ssmClient = new SSMClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      IsComplete: boolean;
    }
  | undefined
> {
  const ssmPrefix: string = event.ResourceProperties['ssmPrefix'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const isWarm = await checkWarm(ssmPrefix);
      if (isWarm) {
        return {
          IsComplete: true,
        };
      }
      await createSsmParameter(ssmPrefix);
      await createVpcAndInstance();
      return {
        IsComplete: false,
      };

    case 'Delete':
      await terminateInstances();
      await deleteVpc();
      await deleteSsmParameter(ssmPrefix);
      return {
        IsComplete: true,
      };
  }
}

async function checkWarm(ssmPrefix: string): Promise<boolean> {
  console.log('Checking if account has been pre-warmed');
  let warmed = false;
  try {
    const parameter = await throttlingBackOff(() =>
      ssmClient.send(
        new GetParameterCommand({
          Name: `${ssmPrefix}/account/pre-warmed`,
        }),
      ),
    );
    warmed = (parameter.Parameter?.Value ?? 'false') === 'true';
  } catch (e) {
    console.log(`SSM parameter doesn't exist warming account`);
  }
  return warmed;
}

async function createSsmParameter(ssmPrefix: string) {
  console.log('Creating SSM Parameter');
  try {
    await throttlingBackOff(() =>
      ssmClient.send(
        new PutParameterCommand({
          Name: `${ssmPrefix}/account/pre-warmed`,
          Value: 'false',
          Description: 'Flag for account pre-warming',
          Type: ParameterType.STRING,
          Overwrite: true,
        }),
      ),
    );
  } catch (e) {
    console.log(e);
    throw new Error('Failed creating SSM Parameter');
  }
}

async function createVpcAndInstance() {
  console.log('Creating VPC and Subnet');
  const vpcId = await getVpcId();
  const subnetId = await getSubnetId(vpcId);
  console.log(`VpcId: ${vpcId}`);
  console.log(`SubnetId: ${subnetId}`);
  console.log(`SubnetId: ${subnetId}`);

  const instanceId = await getInstanceId(subnetId);
  console.log(`Using EC2 Instance Id: ${instanceId}`);
}

async function deleteSsmParameter(ssmPrefix: string) {
  console.log('Deleting SSM Parameter');
  try {
    await throttlingBackOff(() =>
      ssmClient.send(
        new DeleteParameterCommand({
          Name: `${ssmPrefix}/account/pre-warmed`,
        }),
      ),
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
    const subnets = await throttlingBackOff(() =>
      ec2Client.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [vpcId] }] })),
    );
    for (const subnet of subnets.Subnets!) {
      await throttlingBackOff(() => ec2Client.send(new DeleteSubnetCommand({ SubnetId: subnet.SubnetId })));
    }
    console.log(`Deleting VPC with id: ${vpcId}`);
    await throttlingBackOff(() => ec2Client.send(new DeleteVpcCommand({ VpcId: vpcId })));
  }
}

async function getInstanceId(subnetId: string): Promise<string> {
  console.log('Getting Instance Id');
  let instanceId: string | undefined;
  const ec2Instances = await throttlingBackOff(() =>
    ec2Client.send(new DescribeInstancesCommand({ Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })),
  );
  if (ec2Instances.Reservations!.length > 0) {
    for (const ec2Reservation of ec2Instances.Reservations!) {
      for (const ec2Instance of ec2Reservation.Instances!) {
        console.log(`Existing EC2 Instance Id, State Code: ${ec2Instance.InstanceId}, ${ec2Instance.State?.Code}`);
        if (ec2Instance.State!.Code !== 48 && ec2Instance.State!.Code !== 32) {
          instanceId = ec2Instance!.InstanceId!;
        }
      }
    }
  } else {
    const imageParameter = await throttlingBackOff(() =>
      ssmClient.send(
        new GetParameterCommand({ Name: '/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2' }),
      ),
    );
    const imageId = imageParameter.Parameter?.Value;
    console.log(`AMI Id: ${imageId}`);

    const ec2Instance = await throttlingBackOff(() =>
      ec2Client.send(
        new RunInstancesCommand({
          InstanceType: 't2.micro',
          MaxCount: 1,
          MinCount: 1,
          SubnetId: subnetId,
          ImageId: imageId,
          TagSpecifications: [{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
        }),
      ),
    );
    delay(1000); // this delay is needed as program looped and created 2 instances in some cases
    console.log(`Created EC2 Instance Id: ${ec2Instance.Instances![0].InstanceId}`);
    instanceId = ec2Instance!.Instances![0].InstanceId!;
  }
  return instanceId!;
}

async function getVpcId(): Promise<string> {
  console.log('Getting VPC Id');
  let vpcId: string;
  const vpcs = await throttlingBackOff(() =>
    ec2Client.send(new DescribeVpcsCommand({ Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })),
  );

  if (vpcs.Vpcs?.length ?? 0 > 0) {
    vpcId = vpcs.Vpcs![0].VpcId!;
  } else {
    const vpcResponse = await throttlingBackOff(() =>
      ec2Client.send(
        new CreateVpcCommand({
          CidrBlock: '10.10.10.0/24',
          TagSpecifications: [{ ResourceType: 'vpc', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
        }),
      ),
    );
    vpcId = vpcResponse.Vpc!.VpcId!;
  }
  return vpcId;
}

async function getSubnetId(vpcId: string): Promise<string> {
  console.log('Getting Subnet Id');
  let subnetId: string;
  const subnets = await throttlingBackOff(() =>
    ec2Client.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      }),
    ),
  );
  if (subnets.Subnets!.length > 0) {
    subnetId = subnets.Subnets![0].SubnetId!;
  } else {
    const ec2Subnet = await throttlingBackOff(() =>
      ec2Client.send(
        new CreateSubnetCommand({
          VpcId: vpcId,
          CidrBlock: '10.10.10.0/24',
          TagSpecifications: [{ ResourceType: 'subnet', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
        }),
      ),
    );
    subnetId = ec2Subnet.Subnet!.SubnetId!;
  }
  return subnetId;
}

async function terminateInstances(): Promise<void> {
  console.log('Checking for ec2 instance to terminate');
  const ec2Instances = await throttlingBackOff(() =>
    ec2Client.send(new DescribeInstancesCommand({ Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })),
  );

  for (const ec2Reservation of ec2Instances.Reservations!) {
    for (const ec2Instance of ec2Reservation.Instances!) {
      if (ec2Instance.State?.Name === 'terminated' || ec2Instance.State?.Code === 48) {
        continue;
      }
      if (ec2Instance.State?.Name === 'shutting-down' || ec2Instance.State?.Code === 32) {
        await waitForTermination(ec2Instance.InstanceId!);
      }
      console.log(`Terminating EC2 Instance Id: ${ec2Instance.InstanceId}`);
      await throttlingBackOff(() =>
        ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [ec2Instance.InstanceId!] })),
      );
      await waitForTermination(ec2Instance.InstanceId!);
    }
  }
}

async function waitForTermination(instanceId: string): Promise<void> {
  console.log(`Waiting for termination of instanceId: ${instanceId}`);
  let ec2Terminated = false;
  while (!ec2Terminated) {
    const statusResponse = await throttlingBackOff(() =>
      ec2Client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] })),
    );
    if (
      statusResponse.Reservations![0].Instances![0].State?.Name !== 'terminated' ||
      statusResponse.Reservations![0].Instances![0].State?.Code !== 48
    ) {
      delay(15000);
      continue;
    }
    ec2Terminated = true;
  }
}
