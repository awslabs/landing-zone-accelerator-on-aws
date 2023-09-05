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

import { throttlingBackOff } from '@aws-accelerator/utils';
import {
  AssociateKmsKeyCommand,
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

/**
 * create-log-groups - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(
  event: AWSLambda.CloudFormationCustomResourceEvent,
): Promise<
  | { PhysicalResourceId: string; Data: { LogGroupArn: string }; Status: string }
  | { PhysicalResourceId: string; Status: string }
  | undefined
> {
  const logGroupName: string = event.ResourceProperties['logGroupName'];
  const retention = Number(event.ResourceProperties['retention']);
  const terminationProtected: boolean = event.ResourceProperties['terminationProtected'] === 'true';
  const encryptionKey: string | undefined = event.ResourceProperties['keyArn'];
  const owningAccountId: string | undefined = event.ResourceProperties['owningAccountId'];
  const owningRegion: string | undefined = event.ResourceProperties['owningRegion'];
  const roleName: string | undefined = event.ResourceProperties['roleName'];
  const invokingAccountId = event.ServiceToken.split(':')[4];
  const invokingRegion = event.ServiceToken.split(':')[3];
  const partition = event.ServiceToken.split(':')[1];
  const solutionId = process.env['SOLUTION_ID'];
  //
  // Set CloudWatch Logs client
  const logClient = await setLogsClient({
    invokingAccountId,
    invokingRegion,
    partition,
    owningAccountId,
    owningRegion,
    roleName,
    solutionId,
  });
  //
  // Retrieve existing CloudWatch Logs Group
  const existingLogGroup = await logGroupExists(logClient, logGroupName);
  //
  // Set log group ARN
  const logGroupArn = setLogGroupArn({
    invokingAccountId,
    invokingRegion,
    partition,
    logGroupName,
    owningAccountId,
    owningRegion,
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Creating or updating log groups');
      //
      // Code Block for CloudWatch Log Group that exists
      if (existingLogGroup) {
        console.warn(`Log Group already exists : ${logGroupName}`);
        if (encryptionKey) {
          await associateKey(logClient, encryptionKey, logGroupName);
        }
      }
      //
      // Code Block for CloudWatch Log Group if it doesn't exist
      else {
        await createLogGroup(logClient, logGroupName, encryptionKey);
      }
      //
      // Put log group retention policy
      await putPolicy(logClient, logGroupName, retention);

      return {
        PhysicalResourceId: logGroupName,
        Data: { LogGroupArn: logGroupArn },
        Status: 'SUCCESS',
      };

    case 'Delete':
      if (!terminationProtected && existingLogGroup) {
        await deleteLogGroup(logClient, logGroupName);
      } else {
        console.log(`The Log Group ${logGroupName} is set to retain or does not exist.`);
      }
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Returns a local or cross-account/cross-region CloudWatch Logs client based on input parameters
 * @param options
 * @returns Promise<CloudWatchLogsClient>
 */
async function setLogsClient(options: {
  invokingAccountId: string;
  invokingRegion: string;
  partition: string;
  owningAccountId?: string;
  owningRegion?: string;
  roleName?: string;
  solutionId?: string;
}): Promise<CloudWatchLogsClient> {
  const roleArn = `arn:${options.partition}:iam::${options.owningAccountId}:role/${options.roleName}`;
  const stsClient = new STSClient({ region: options.invokingRegion, customUserAgent: options.solutionId });

  if (options.owningAccountId && options.owningRegion) {
    if (!options.roleName) {
      throw new Error(`Cross-account log group required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return logs client
    return new CloudWatchLogsClient({
      region: options.owningRegion,
      customUserAgent: options.solutionId,
      credentials,
    });
  } else if (options.owningAccountId && !options.owningRegion) {
    if (!options.roleName) {
      throw new Error(`Cross-account log group required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return logs client
    return new CloudWatchLogsClient({
      region: options.invokingRegion,
      customUserAgent: options.solutionId,
      credentials,
    });
  } else {
    return new CloudWatchLogsClient({
      region: options.owningRegion ?? options.invokingRegion,
      customUserAgent: options.solutionId,
    });
  }
}

/**
 * Returns STS credentials for a given role ARN
 * @param stsClient STSClient
 * @param roleArn string
 * @returns `Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }>`
 */
async function getStsCredentials(
  stsClient: STSClient,
  roleArn: string,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }> {
  console.log(`Assuming role ${roleArn}...`);
  try {
    const response = await throttlingBackOff(() =>
      stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'AcceleratorAssumeRole' })),
    );
    //
    // Validate response
    if (!response.Credentials?.AccessKeyId) {
      throw new Error(`Access key ID not returned from AssumeRole command`);
    }
    if (!response.Credentials.SecretAccessKey) {
      throw new Error(`Secret access key not returned from AssumeRole command`);
    }
    if (!response.Credentials.SessionToken) {
      throw new Error(`Session token not returned from AssumeRole command`);
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
    };
  } catch (e) {
    throw new Error(`Could not assume role: ${e}`);
  }
}

/**
 * Set the log group ARN
 * @param options
 * @returns string
 */
function setLogGroupArn(options: {
  invokingAccountId: string;
  invokingRegion: string;
  partition: string;
  logGroupName: string;
  owningAccountId?: string;
  owningRegion?: string;
}): string {
  return `arn:${options.partition}:logs:${options.owningRegion ?? options.invokingRegion}:${
    options.owningAccountId ?? options.invokingAccountId
  }:log-group:${options.logGroupName}`;
}

/**
 * Determine if there is an existing log group with the given name
 * @param logClient CloudWatchLogsClient
 * @param logGroupName string
 * @returns Promise<boolean>
 */
async function logGroupExists(logClient: CloudWatchLogsClient, logGroupName: string): Promise<boolean> {
  console.log(`Describing existing log groups...`);
  try {
    const response = await throttlingBackOff(() =>
      logClient.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName })),
    );
    return response.logGroups?.find(lg => lg.logGroupName === logGroupName) ? true : false;
  } catch (e) {
    throw new Error(`Could not describe log groups: ${e}`);
  }
}

/**
 * Associate KMS key with log group
 * @param logClient CloudWatchLogsClient
 * @param kmsKeyId string
 * @param logGroupName string
 */
async function associateKey(logClient: CloudWatchLogsClient, kmsKeyId: string, logGroupName: string) {
  console.log(`Associating KMS key ${kmsKeyId} with log group ${logGroupName}...`);
  try {
    await throttlingBackOff(() => logClient.send(new AssociateKmsKeyCommand({ kmsKeyId, logGroupName })));
  } catch (e) {
    throw new Error(`Could not associate KMS key with log group: ${e}`);
  }
}

/**
 * Create a CloudWatch Log group
 * @param logClient CloudWatchLogsClient
 * @param logGroupName string
 * @param kmsKeyId string | undefined
 */
async function createLogGroup(logClient: CloudWatchLogsClient, logGroupName: string, kmsKeyId?: string) {
  console.log(`Creating log group ${logGroupName}...`);
  try {
    await throttlingBackOff(() => logClient.send(new CreateLogGroupCommand({ kmsKeyId, logGroupName })));
  } catch (e) {
    throw new Error(`Unable to create log group: ${e}`);
  }
}

/**
 * Put retention policy to log group
 * @param logClient
 * @param logGroupName
 * @param retention
 */
async function putPolicy(logClient: CloudWatchLogsClient, logGroupName: string, retentionInDays: number) {
  console.log(`Modifying log group ${logGroupName} retention and expiration policy`);
  try {
    await throttlingBackOff(() => logClient.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays })));
  } catch (e) {
    throw new Error(`Unable to put retention policy to log group: ${e}`);
  }
}

/**
 * Delete a log group
 * @param logClient CloudWatchLogsClient
 * @param logGroupName string
 */
async function deleteLogGroup(logClient: CloudWatchLogsClient, logGroupName: string) {
  console.log(`The Log Group ${logGroupName} is not set to retain. Deleting log group.`);
  try {
    await throttlingBackOff(() => logClient.send(new DeleteLogGroupCommand({ logGroupName })));
  } catch (e) {
    throw new Error(`Unable to delete log group: ${e}`);
  }
}
