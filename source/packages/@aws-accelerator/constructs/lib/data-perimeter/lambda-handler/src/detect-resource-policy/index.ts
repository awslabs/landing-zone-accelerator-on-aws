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
import { ComplianceType, ConfigServiceClient, PutEvaluationsCommand } from '@aws-sdk/client-config-service';

import { getResourcePolicies, generatePolicyReplacements, RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY } from '../common/utils';
import { getOrCreateStrategyMap } from '../common/strategy';
import {
  ConfigRuleEvent,
  ConfigurationItem,
  PolicyDocument,
  InvokingEvent,
  ResourceType,
} from '../common/common-resources';

const configClient = new ConfigServiceClient();
const resourcePolicyTemplates = getResourcePolicies();
const resourcePolicyStrategyMap = getOrCreateStrategyMap();

/**
 * detect-resource-policy - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: ConfigRuleEvent) {
  console.log(`Custom Rule for checking resource based policies`);
  console.log(JSON.stringify(event, null, 2));
  const invokingEvent: InvokingEvent = JSON.parse(event.invokingEvent);
  const configurationItem = invokingEvent.configurationItem!;

  const paramsReplacement = {
    'ACCEL_LOOKUP::CUSTOM:ATTACHED_RESOURCE_ARN': configurationItem.ARN,
  };
  const resourcePolicies = generatePolicyReplacements(resourcePolicyTemplates, paramsReplacement);

  const invocationType = invokingEvent.messageType;
  if (invocationType === 'ScheduledNotification') {
    return;
  }

  const evaluation = await evaluateCompliance(configurationItem, resourcePolicies);

  await configClient.send(
    new PutEvaluationsCommand({
      ResultToken: event.resultToken,
      Evaluations: [
        {
          ComplianceResourceId: configurationItem.resourceId,
          ComplianceResourceType: configurationItem.resourceType,
          ComplianceType: evaluation.complianceType as ComplianceType,
          OrderingTimestamp: new Date(configurationItem.configurationItemCaptureTime),
          Annotation: evaluation.annotation,
        },
      ],
    }),
  );
}

/**
 * Evaluate if the current resource policy is compliant or not
 * @param {*} props
 * @returns
 */
const evaluateCompliance = (configurationItem: ConfigurationItem, policyMap: Map<string, PolicyDocument>) => {
  if (
    !configurationItem.resourceType ||
    !Object.values(ResourceType).includes(configurationItem.resourceType as ResourceType)
  ) {
    return {
      complianceType: 'NOT_APPLICABLE',
      annotation: `The rule doesn't apply to resources of type ${configurationItem.resourceType}`,
    };
  } else if (configurationItem.configurationItemStatus === 'ResourceDeleted') {
    return {
      complianceType: 'NOT_APPLICABLE',
      annotation: 'The configuration item was deleted and could not be validated',
    };
  }

  const resourceType = configurationItem.resourceType as ResourceType;
  const strategy = resourcePolicyStrategyMap.get(resourceType);
  if (!strategy) throw new Error(`Strategy for ${resourceType} is not implemented`);

  if (RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY.includes(resourceType)) {
    return strategy.evaluateResourcePolicyCompliance(configurationItem);
  } else if (!policyMap.has(resourceType)) {
    throw Error(`Policy for ${resourceType} is missing`);
  }

  return strategy.evaluateResourcePolicyCompliance(configurationItem, policyMap.get(resourceType)!);
};
