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
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import {
  SSMClient,
  GetParameterCommand,
  DeleteParameterCommand,
  PutParameterCommand,
  ParameterNotFound,
} from '@aws-sdk/client-ssm';
import {
  EC2Client,
  DescribeTagsCommand,
  CreateTagsCommand,
  DeleteTagsCommand,
  DescribeSubnetsCommand,
  DeleteTagsCommandInput,
  TagDescription,
} from '@aws-sdk/client-ec2';
import { CloudFormationCustomResourceEvent } from '../../lza-custom-resource';

const solutionId = process.env['SOLUTION_ID'];

const ec2Client = new EC2Client({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
const ssmClient = new SSMClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });

interface Tag {
  readonly Key: string | undefined;
  readonly Value: string | undefined;
}

/**
 * share-subnet-tags - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(JSON.stringify(event));

  const vpcTags = convertTags(event.ResourceProperties['vpcTags'] || []);
  const subnetTags = convertTags(event.ResourceProperties['subnetTags'] || []);
  const sharedSubnetId: string = event.ResourceProperties['sharedSubnetId'];
  const sharedSubnetName: string = event.ResourceProperties['sharedSubnetName'];
  const vpcName: string = event.ResourceProperties['vpcName'];
  const ssmParamNamePrefix = event.ResourceProperties['acceleratorSsmParamPrefix'];

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
      await updateSubnetTags(subnetTags, sharedSubnetId);
      await updateVpcTags(vpcTags, sharedSubnetId, ssmClient, vpcName, ssmParamNamePrefix);
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

async function parameterExists(ssmClient: SSMClient, name: string): Promise<boolean> {
  console.log(`Checking if parameter ${name} exists`);
  try {
    await throttlingBackOff(() => ssmClient.send(new GetParameterCommand({ Name: name })));
    console.log(`Parameter ${name} exists`);
    return true;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (e instanceof ParameterNotFound) {
      console.warn(e.name + ': ' + e.message);
      return false;
    } else {
      throw new Error(e.name + ': ' + e.message);
    }
  }
}

async function createParameter(ssmClient: SSMClient, name: string, description: string, value: string): Promise<void> {
  console.log(`Creating parameter ${name}`);
  if (!(await parameterExists(ssmClient, name))) {
    await throttlingBackOff(() =>
      ssmClient.send(
        new PutParameterCommand({
          Name: name,
          Description: description,
          Value: value,
          Type: 'String',
          Overwrite: true,
        }),
      ),
    );
  }
}

async function deleteParameter(ssmClient: SSMClient, name: string): Promise<void> {
  console.log(`Deleting parameter ${name}`);
  if (!(await parameterExists(ssmClient, name))) {
    await throttlingBackOff(() =>
      ssmClient.send(
        new DeleteParameterCommand({
          Name: name,
        }),
      ),
    );
  }
}

async function updateSubnetTags(newSubnetTags: Tag[], subnetId: string) {
  console.info('updateSubnetTags');
  const existingSubnetTags = await getResourceTags(subnetId);
  const tagsToDelete = getTagsToDelete(existingSubnetTags, newSubnetTags);
  const tagsToAdd = getTagsToAdd(existingSubnetTags, newSubnetTags);
  const tagsToUpdate = getTagsToUpdate(existingSubnetTags, newSubnetTags);
  const tagsToCreateAndUpdate = [...tagsToAdd, ...tagsToUpdate];

  if (tagsToDelete.length > 0) {
    console.info(`Deleting subnet tags for subnet ${subnetId}`);
    console.info(JSON.stringify(tagsToDelete, null, 2));
    await deleteTags(subnetId, tagsToDelete);
  }

  if (tagsToCreateAndUpdate.length > 0) {
    console.info(`Adding and updating subnet tags for subnet ${subnetId}`);
    console.info(JSON.stringify(tagsToCreateAndUpdate, null, 2));
    await createTags(subnetId, tagsToCreateAndUpdate);
  }
}

async function updateVpcTags(
  newVpcTags: Tag[],
  subnetId: string,
  ssmClient: SSMClient,
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

  const existingVpcTags = await getResourceTags(vpcId);
  const tagsToDelete = getTagsToDelete(existingVpcTags, newVpcTags);
  const tagsToAdd = getTagsToAdd(existingVpcTags, newVpcTags);
  const tagsToUpdate = getTagsToUpdate(existingVpcTags, newVpcTags);
  const tagsToCreateAndUpdate = [...tagsToAdd, ...tagsToUpdate];

  if (tagsToDelete.length > 0) {
    console.info(`Deleting vpc tags for vpc ${vpcId}`);
    console.info(JSON.stringify(tagsToDelete, null, 2));
    await deleteTags(vpcId, tagsToDelete);
  }

  if (tagsToCreateAndUpdate.length > 0) {
    console.log(`Adding and updating vpc tags for VPC ${vpcId}`);
    console.log(JSON.stringify(tagsToCreateAndUpdate, null, 2));
    await createTags(vpcId, tagsToCreateAndUpdate);
  }
}

async function deleteTags(itemId: string, tagsToDelete?: Tag[]) {
  const deleteTagRequest: DeleteTagsCommandInput = {
    Resources: [itemId],
    Tags: tagsToDelete,
  };
  const deleteTagsResponse = await throttlingBackOff(() => ec2Client.send(new DeleteTagsCommand(deleteTagRequest)));
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

async function getResourceTags(resourceId: string): Promise<Tag[]> {
  const tags: Tag[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const describeTagsResponse = await throttlingBackOff(() =>
      ec2Client.send(
        new DescribeTagsCommand({ Filters: [{ Name: 'resource-id', Values: [resourceId] }], NextToken: nextToken }),
      ),
    );
    console.log(describeTagsResponse);
    if (describeTagsResponse.Tags) {
      const tagKeyValueList = describeTagsResponse.Tags.map((tag: TagDescription) => {
        return {
          Key: tag.Key,
          Value: tag.Value,
        };
      });
      tags.push(...tagKeyValueList);
    }
    nextToken = describeTagsResponse.NextToken! ?? undefined;
  } while (nextToken);
  return tags;
}

function getTagsToDelete(currentTags: Tag[], newTags: Tag[]): Tag[] {
  const tagsToDelete: Tag[] = [];
  for (const currentTag of currentTags) {
    const foundTag: Tag | undefined = newTags.find(newTag => newTag.Key === currentTag.Key);
    if (!foundTag) {
      tagsToDelete.push(currentTag);
    }
  }
  return tagsToDelete;
}

function getTagsToAdd(currentTags: Tag[], newTags: Tag[]): Tag[] {
  const tagsToAdd: Tag[] = [];
  for (const newTag of newTags) {
    const foundTag: Tag | undefined = currentTags.find(currentTag => currentTag.Key === newTag.Key);
    if (!foundTag) {
      tagsToAdd.push(newTag);
    }
  }
  return tagsToAdd;
}

function getTagsToUpdate(currentTags: Tag[], newTags: Tag[]): Tag[] {
  const tagsToUpdate: Tag[] = [];
  for (const newTag of newTags) {
    const foundTag = currentTags.find(currentTag => currentTag.Key === newTag.Key);
    if (foundTag?.Value !== newTag.Value) {
      tagsToUpdate.push(newTag);
    }
  }
  return tagsToUpdate;
}
