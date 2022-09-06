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
  EC2Client,
  DescribeTagsCommand,
  CreateTagsCommand,
  DeleteTagsCommand,
  DescribeSubnetsCommand,
} from '@aws-sdk/client-ec2';

const ec2Client = new EC2Client({});
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

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await updateSubnetTags(convertTags(subnetTags), sharedSubnetId);
      if (vpcTags?.length > 0) {
        await updateVpcTags(convertTags(vpcTags), sharedSubnetId);
      }
      return {
        PhysicalResourceId: sharedSubnetId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await deleteTags(sharedSubnetId);
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
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

async function updateVpcTags(vpcTags: Tag[], subnetId: string) {
  console.info('updateVpcTags');
  const describeSubnetsResponse = await throttlingBackOff(() =>
    ec2Client.send(new DescribeSubnetsCommand({ Filters: [{ Name: 'subnet-id', Values: [subnetId] }] })),
  );
  console.debug('describeSubnetsResponse: ', describeSubnetsResponse);

  if (describeSubnetsResponse.Subnets?.length > 0) {
    console.log(`Found subnetId: ${subnetId} with vpcId: ${describeSubnetsResponse.Subnets?.[0].VpcId}`);
  } else {
    console.error(`Could not find shared subnetId ${subnetId}`);
    return;
  }

  const vpcId = describeSubnetsResponse.Subnets?.[0].VpcId;
  if (vpcId) {
    console.debug('VPCId: ', vpcId);
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
