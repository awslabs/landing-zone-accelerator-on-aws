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
import * as AWS from 'aws-sdk';
import {
  EC2Client,
  DescribeTagsCommand,
  CreateTagsCommand,
  DeleteTagsCommand,
  DescribeSubnetsCommand,
} from '@aws-sdk/client-ec2';

let ec2Client: EC2Client;
interface Tag {
  readonly Key: string;
  readonly Value: string;
}

/**
 * share-subnet-tags - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(JSON.stringify(event));

  const vpcTags = event.ResourceProperties['vpcTags'] || [];
  const subnetTags = event.ResourceProperties['subnetTags'] || [];
  const sharedSubnetId: string = event.ResourceProperties['sharedSubnetId'];
  const sharedSubnetName: string = event.ResourceProperties['sharedSubnetName'];
  const vpcName: string = event.ResourceProperties['vpcName'];
  const ssmParamNamePrefix = event.ResourceProperties['acceleratorSsmParamPrefix'];
  const solutionId = process.env['SOLUTION_ID'];

  ec2Client = new EC2Client({ customUserAgent: solutionId });
  const ssmClient = new AWS.SSM({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Create Shared Subnet SSM parameter
      await createParameter(
        ssmClient,
        `${ssmParamNamePrefix}/shared/network/vpc/${vpcName}/subnet/${sharedSubnetName}/id`,
        'Shared subnet',
        sharedSubnetId,
      );
      await updateSubnetTags(convertTags(subnetTags), sharedSubnetId);
      if (vpcTags?.length > 0) {
        await updateVpcTags(convertTags(vpcTags), sharedSubnetId, ssmClient, vpcName, ssmParamNamePrefix);
      }
      return {
        PhysicalResourceId: sharedSubnetId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Delete Shared Subnet SSM parameter
      await deleteParameter(
        ssmClient,
        `${ssmParamNamePrefix}/shared/network/vpc/${vpcName}/subnet/${sharedSubnetName}/id`,
      );
      await deleteTags(sharedSubnetId);
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

async function isParameterExists(ssmClient: AWS.SSM, name: string): Promise<boolean> {
  console.log(`Checking if parameter ${name} exists`);
  try {
    await throttlingBackOff(() =>
      ssmClient
        .getParameter({
          Name: name,
        })
        .promise(),
    );

    console.log(`Parameter ${name} exists`);
    return true;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (
      // SDKv2 Error Structure
      e.code === 'ParameterNotFound' ||
      // SDKv3 Error Structure
      e.name === 'ParameterNotFound'
    ) {
      console.warn(e.name + ': ' + e.message);
      return false;
    } else {
      throw new Error(e.name + ': ' + e.message);
    }
  }
}

async function createParameter(ssmClient: AWS.SSM, name: string, description: string, value: string): Promise<void> {
  console.log(`Creating parameter ${name}`);
  if (!(await isParameterExists(ssmClient, name))) {
    await throttlingBackOff(() =>
      ssmClient
        .putParameter({
          Name: name,
          Description: description,
          Value: value,
          Type: 'String',
          Overwrite: true,
        })
        .promise(),
    );
  }
}

async function deleteParameter(ssmClient: AWS.SSM, name: string): Promise<void> {
  console.log(`Deleting parameter ${name}`);
  if (!(await isParameterExists(ssmClient, name))) {
    await throttlingBackOff(() =>
      ssmClient
        .deleteParameter({
          Name: name,
        })
        .promise(),
    );
  }
}

async function updateSubnetTags(subnetTags: Tag[], subnetId: string) {
  console.log(subnetTags);
  console.info('updateSubnetTags');
  const describeTagsResponse = await throttlingBackOff(() =>
    ec2Client.send(new DescribeTagsCommand({ Filters: [{ Name: 'resource-id', Values: [subnetId] }] })),
  );

  console.debug('describeTagsResponse: ', describeTagsResponse);

  // if tags don't exist create them
  if (describeTagsResponse.Tags?.length === 0) {
    await createTags(subnetId, subnetTags);
    return;
  }

  // remove existing tags
  console.debug('Deleting existing subnet tags');
  await deleteTags(subnetId);

  // insert updated tags
  console.debug('Adding subnet tags');
  await createTags(subnetId, subnetTags);
}

async function updateVpcTags(
  vpcTags: Tag[],
  subnetId: string,
  ssmClient: AWS.SSM,
  vpcName: string,
  ssmParamNamePrefix: string,
) {
  console.info('updateVpcTags');
  const describeSubnetsResponse = await throttlingBackOff(() =>
    ec2Client.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'subnet-id', Values: [subnetId] }] })),
  );
  console.debug('describeSubnetsResponse: ', describeSubnetsResponse);

  if (describeSubnetsResponse.Subnets!.length > 0) {
    console.log(`Found subnetId: ${subnetId} with vpcId: ${describeSubnetsResponse.Subnets?.[0].VpcId}`);
  } else {
    console.error(`Could not find shared subnetId ${subnetId}`);
    return;
  }

  const vpcId = describeSubnetsResponse.Subnets?.[0].VpcId;
  if (vpcId) {
    console.debug('VPCId: ', vpcId);
    // Create Shared VPC SSM parameter
    await createParameter(ssmClient, `${ssmParamNamePrefix}/shared/network/vpc/${vpcName}/id`, 'Shared vpc', vpcId);
  } else {
    console.error(`Could not locate vpc for shared subnetId ${subnetId}`);
    return;
  }

  const describeTagsResponse = await throttlingBackOff(() =>
    ec2Client.send(new DescribeTagsCommand({ Filters: [{ Name: 'resource-id', Values: [vpcId] }] })),
  );
  console.debug('describeTagsResponse: ', describeTagsResponse);

  // if tags don't exist create them
  if (describeTagsResponse.Tags?.length === 0) {
    console.info('Adding vpc tags');
    const addTagResponse = await throttlingBackOff(() =>
      ec2Client.send(new CreateTagsCommand({ Resources: [vpcId], Tags: vpcTags })),
    );
    console.log(addTagResponse);
    return;
  }

  // remove existing tags
  console.debug('Deleting existing vpc tags');
  await deleteTags(vpcId);

  // insert updated tags
  console.debug('Adding vpc tags');
  await createTags(vpcId, vpcTags);
}

async function deleteTags(itemId: string) {
  const deleteTagsResponse = await throttlingBackOff(() =>
    ec2Client.send(new DeleteTagsCommand({ Resources: [itemId] })),
  );
  console.debug('Delete Tags response: ', deleteTagsResponse);
}

async function createTags(itemId: string, tags: Tag[]) {
  const createTagsResponse = await throttlingBackOff(() =>
    ec2Client.send(new CreateTagsCommand({ Resources: [itemId], Tags: tags })),
  );
  console.debug('createTagsResponse: ', createTagsResponse);
}

function convertTags(tags: []): Tag[] {
  const convertedTags: Tag[] = [];
  for (const tag of tags) {
    convertedTags.push({ Key: tag['key'], Value: tag['value'] });
  }
  return convertedTags;
}
