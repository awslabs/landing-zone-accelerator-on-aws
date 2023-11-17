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
import {
  ConfigServiceClient,
  SelectResourceConfigCommand,
  BatchGetResourceConfigCommand,
  BaseConfigurationItem,
} from '@aws-sdk/client-config-service';

import { getResourcePolicies, generatePolicyReplacements, RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY } from '../common/utils';
import { getOrCreateStrategyMap } from '../common/strategy';
import { ResourceType } from '../common/common-resources';

const config = new ConfigServiceClient();

const policyMapTemplate = getResourcePolicies();
const resourcePolicyStrategyMap = getOrCreateStrategyMap();

export const handler = async (event: { ResourceId: string }) => {
  console.log(`Custom Rule to remediate resource based policies`);
  console.log(JSON.stringify(event, null, 2));

  // Validate that the event has the required input
  if (!event.ResourceId) {
    throw new Error('resourceId is not found in event');
  }

  // Retrieve resource type first because we need both resourceId and resourceType to get the detail policy of a resource.
  const resourceType = await getResourceTypeById(event.ResourceId);
  const configurationItem = await getResourceConfigurationItem(event.ResourceId, resourceType);

  const paramsReplacement = {
    'ACCEL_LOOKUP::CUSTOM:ATTACHED_RESOURCE_ARN': (configurationItem as { arn: string }).arn,
  };
  const policyMap = generatePolicyReplacements(policyMapTemplate, paramsReplacement);
  const strategy = resourcePolicyStrategyMap.get(resourceType);

  if (!strategy) throw new Error(`Strategy for ${resourceType} is not implemented`);
  if (RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY.includes(resourceType)) {
    return strategy.updateResourceBasedPolicy(configurationItem);
  } else if (!policyMap.has(resourceType)) {
    throw Error(`Policy for ${resourceType} is missing`);
  }

  await strategy.updateResourceBasedPolicy(
    configurationItem as { resourceName: string; resourceId: string; resourceType: string },
    policyMap.get(resourceType)!,
  );
};

/**
 * Get the resource type based on the resourceId from AWS Config
 *
 * @param {*} resourceId
 * @returns
 */
const getResourceTypeById = async (resourceId: string): Promise<ResourceType> => {
  const queryResult = await config.send(
    new SelectResourceConfigCommand({ Expression: `SELECT resourceType WHERE resourceId = '${resourceId}'` }),
  );

  if (!queryResult.Results || queryResult.Results.length === 0) {
    throw new Error(`No resource type with resource id ${resourceId} was found`);
  }

  return JSON.parse(queryResult.Results[0]).resourceType as ResourceType;
};

/**
 * Get the AWS Config configuration item for the resource by resourceId and resourceType.
 * This will provide useful information such as resourceName, ARN etc.
 *
 * @param {*} resourceId
 * @param {*} resourceType
 * @returns
 */
const getResourceConfigurationItem = async (
  resourceId: string,
  resourceType: string,
): Promise<BaseConfigurationItem> => {
  const response = await config.send(
    new BatchGetResourceConfigCommand({
      resourceKeys: [
        {
          resourceId,
          resourceType,
        },
      ],
    }),
  );

  if (!response.baseConfigurationItems || response.baseConfigurationItems.length === 0) {
    throw new Error(`No configuration found for ${resourceId} with type ${resourceType} in AWS Config`);
  }

  return response.baseConfigurationItems[0];
};
