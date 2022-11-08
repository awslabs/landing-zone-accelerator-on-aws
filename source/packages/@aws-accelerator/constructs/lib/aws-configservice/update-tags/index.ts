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
  ConfigServiceClient,
  TagResourceCommand,
  UntagResourceCommand,
  TagResourceCommandInput,
  UntagResourceCommandInput,
  Tag,
} from '@aws-sdk/client-config-service';
import { v4 as uuidv4 } from 'uuid';
let configClient: ConfigServiceClient;

/**
 * configservice-update-tags - lambda handler
 *
 * @param event
 * @returns
 */
export const handler = onEvent;

async function onEvent(
  event: AWSLambda.CloudFormationCustomResourceEvent,
): Promise<{ PhysicalResourceId: string | undefined; Status: string } | undefined> {
  console.log(JSON.stringify(event));
  const solutionId = process.env['SOLUTION_ID'];
  configClient = new ConfigServiceClient({ customUserAgent: solutionId });
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreate(event: AWSLambda.CloudFormationCustomResourceCreateEvent) {
  const resourceArn = event.ResourceProperties['resourceArn'];
  const acceleratorTags: Tag[] = event.ResourceProperties['tags'];
  await tagResource(resourceArn, await acceleratorTags);
  return {
    PhysicalResourceId: uuidv4(),
    Status: 'SUCCESS',
  };
}

async function onUpdate(event: AWSLambda.CloudFormationCustomResourceUpdateEvent) {
  const resourceArn = event.ResourceProperties['resourceArn'];
  const previousTags: Tag[] = event.OldResourceProperties['tags'];
  const currentTags: Tag[] = event.ResourceProperties['tags'];
  await unTagResource(resourceArn, previousTags);
  if (currentTags.length >>> 0) {
    await tagResource(resourceArn, await currentTags);
  }
  return {
    PhysicalResourceId: event.PhysicalResourceId,
    Status: 'SUCCESS',
  };
}

async function onDelete(event: AWSLambda.CloudFormationCustomResourceDeleteEvent) {
  const resourceArn = event.ResourceProperties['resourceArn'];
  const acceleratorTags: Tag[] = event.ResourceProperties['tags'];
  await unTagResource(resourceArn, acceleratorTags);
  return {
    PhysicalResourceId: event.PhysicalResourceId,
    Status: 'SUCCESS',
  };
}

async function tagResource(resourceArn: string, tags: Tag[]): Promise<boolean> {
  console.log(tags);
  const params: TagResourceCommandInput = {
    ResourceArn: resourceArn,
    Tags: tags,
  };
  await throttlingBackOff(() => configClient.send(new TagResourceCommand(params)));
  return true;
}

async function unTagResource(resourceArn: string, tags: Tag[]): Promise<boolean> {
  const tagKeys: string[] = [];
  for (const tag of tags) {
    tagKeys.push(tag.Key!);
  }
  const params: UntagResourceCommandInput = {
    ResourceArn: resourceArn,
    TagKeys: tagKeys,
  };
  await throttlingBackOff(() => configClient.send(new UntagResourceCommand(params)));
  return true;
}
