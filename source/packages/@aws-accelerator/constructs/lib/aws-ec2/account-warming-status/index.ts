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
 * aws-ec2-pre-warm-account-status - lambda handler
 *
 * @param event
 * @returns
 */

import { SSMClient, PutParameterCommand } from '@aws-sdk/client-ssm';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DeleteVpcCommand,
  DeleteSubnetCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2';
import { AdaptiveRetryStrategy } from '@aws-sdk/util-retry';
import { delay } from '@aws-accelerator/utils';

const solutionId = process.env['SOLUTION_ID'] ?? '';
const retryStrategy = new AdaptiveRetryStrategy(() => Promise.resolve(5));
const ec2Client = new EC2Client({ customUserAgent: solutionId, retryStrategy });
const ssmClient = new SSMClient({ customUserAgent: solutionId, retryStrategy });

type InstanceDetails = {
  instanceId: string | undefined;
  minutesSinceLaunch: number | undefined;
};

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<
  | {
      IsComplete: boolean;
    }
  | undefined
> {
  console.log(event);
  const instanceDetails = await getInstanceDetails();

  // if no instance was found, it has been deleted return
  if (instanceDetails.instanceId === undefined) {
    return { IsComplete: true };
  }

  if (instanceDetails.minutesSinceLaunch! > 15) {
    console.log('Account warming time reached');
    await terminateInstance(instanceDetails.instanceId);
    await deleteVpc();
    await setSSMParameter('true');
    return {
      IsComplete: true,
    };
  }
  console.log('Waiting for warmup to complete');
  return { IsComplete: false };
}

async function getInstanceDetails(): Promise<InstanceDetails> {
  console.log('Getting Instance Id');
  const instanceDetails: InstanceDetails = { instanceId: undefined, minutesSinceLaunch: undefined };
  const ec2Instances = await ec2Client.send(
    new DescribeInstancesCommand({ Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] }),
  );

  if (ec2Instances.Reservations && ec2Instances.Reservations.length < 1) {
    return instanceDetails;
  }

  if (ec2Instances.Reservations![0].Instances?.length ?? 0 > 0) {
    instanceDetails.instanceId = ec2Instances.Reservations![0].Instances![0].InstanceId;
    const launchTime = ec2Instances.Reservations![0].Instances![0].LaunchTime;

    const currentTime = new Date();
    const msElapsed = currentTime.getTime() - launchTime!.getTime();
    instanceDetails.minutesSinceLaunch = msElapsed / 1000 / 60;
  }

  return instanceDetails;
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

async function setSSMParameter(parameterValue: string) {
  console.log('Updating SSM Parameter');
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: '/accelerator/account/pre-warmed',
        Value: parameterValue,
        Overwrite: true,
      }),
    );
  } catch (e) {
    console.log(e);
  }
}

async function terminateInstance(instanceId: string): Promise<void> {
  console.log(`Terminating EC2 instance: ${instanceId}`);
  await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  await waitForTermination(instanceId);
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
