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

import { NlbTargetTypeConfig } from '@aws-accelerator/config';
import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * get cross account NLB IP Addresses and add static ip addresses in config- lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const region: string = event.ResourceProperties['region'];
  const targets: (string | NlbTargetTypeConfig)[] = event.ResourceProperties['targets'];
  const assumeRoleName: string = event.ResourceProperties['assumeRoleName'];
  const partition: string = event.ResourceProperties['partition'];
  const solutionId = process.env['SOLUTION_ID'];
  const stsClient = new AWS.STS({ customUserAgent: solutionId, region: region });
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const ec2ClientMap = await setEC2ClientMap({ stsClient, partition, targets, assumeRoleName });
      const nlbIpAddressList = await getEniIpAddresses(ec2ClientMap, targets);
      const staticIpAddresses =
        targets
          .filter(target => typeof target === 'string')
          .map(filteredTarget => {
            return { Id: filteredTarget };
          }) ?? [];
      const ipAddressList = [...nlbIpAddressList, ...staticIpAddresses];
      if (!ipAddressList) {
        throw new Error(`Could not get static IP addresses for targets ${JSON.stringify(targets, null, 4)}`);
      }
      return { Status: 'Success', StatusCode: 200, Data: { ipAddresses: ipAddressList } };

    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function assumeRole(stsClient: AWS.STS, assumeRoleName: string, accountId: string, partition: string) {
  const roleArn = `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`;
  const assumeRole = await throttlingBackOff(() =>
    stsClient.assumeRole({ RoleArn: roleArn, RoleSessionName: `fmsDeregisterAdmin` }).promise(),
  );
  return new AWS.Credentials({
    accessKeyId: assumeRole.Credentials!.AccessKeyId,
    secretAccessKey: assumeRole.Credentials!.SecretAccessKey,
    sessionToken: assumeRole.Credentials!.SessionToken,
  });
}

async function setEC2ClientMap(props: {
  stsClient: AWS.STS;
  partition: string;
  targets: (string | NlbTargetTypeConfig)[];
  assumeRoleName: string;
}) {
  const ec2ClientMap = new Map<string, AWS.EC2>();

  for (const target of props.targets) {
    if (typeof target !== 'string') {
      if (!ec2ClientMap.get(`${target.account}${target.region}`)) {
        const credentials = await assumeRole(props.stsClient, props.assumeRoleName, target.account, props.partition);
        const ec2Client = new AWS.EC2({ credentials, region: target.region });
        ec2ClientMap.set(`${target.account}${target.region}`, ec2Client);
      }
    }
  }

  return ec2ClientMap;
}

async function getEniIpAddresses(ec2ClientMap: Map<string, AWS.EC2>, targets: (string | NlbTargetTypeConfig)[]) {
  const ipAddresses = [];
  for (const target of targets) {
    if (typeof target !== 'string') {
      const ec2Client = ec2ClientMap.get(`${target.account}${target.region}`);
      if (ec2Client) {
        const enis = await ec2Client
          .describeNetworkInterfaces({
            Filters: [
              {
                Name: 'description',
                Values: [`ELB net/${target.nlbName}*`],
              },
            ],
          })
          .promise();
        const ips =
          enis.NetworkInterfaces?.map(eni => {
            return { Id: eni.PrivateIpAddress, AvailabilityZone: 'all' };
          }) ?? [];
        ipAddresses.push(...ips);
      }
    }
  }
  return ipAddresses;
}
