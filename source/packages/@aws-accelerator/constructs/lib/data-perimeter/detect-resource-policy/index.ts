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
  APPLICABLE_RESOURCES,
  RESOURCE_POLICY,
  deepEqual,
  getResourcePolicies,
  generatePolicyReplacements,
  ConfigRuleEvent,
  ConfigurationItem,
  PolicyDocument,
  InvokingEvent,
} from './utils';

import { ConfigServiceClient, PutEvaluationsCommand } from '@aws-sdk/client-config-service';

const configClient = new ConfigServiceClient();

const resourcePolicyTemplates = getResourcePolicies();

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

  const evaluation = evaluateCompliance(configurationItem, resourcePolicies);

  await configClient.send(
    new PutEvaluationsCommand({
      ResultToken: event.resultToken,
      Evaluations: [
        {
          ComplianceResourceId: configurationItem.resourceId,
          ComplianceResourceType: configurationItem.resourceType,
          ComplianceType: evaluation.complianceType,
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
  if (!APPLICABLE_RESOURCES.includes(configurationItem.resourceType)) {
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

  switch (configurationItem.resourceType) {
    case 'AWS::S3::Bucket':
      return evaluateS3ResourcePolicy(policyMap, configurationItem);
    case 'AWS::IAM::Role':
      return evaluateRoleTrustedIdentity(policyMap, configurationItem);
    case 'AWS::KMS::Key':
      return evaluateKeyPolicy(policyMap, configurationItem);
    default:
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: 'Unsupported resource type',
      };
  }
};

/**
 * Check if bucket policy is compliant to the designated resource policy
 *
 * @param {*} policyMap
 * @param {*} configurationItem
 * @returns
 */
const evaluateS3ResourcePolicy = (policyMap: Map<string, PolicyDocument>, configurationItem: ConfigurationItem) => {
  const currPolicyText = configurationItem.supplementaryConfiguration?.BucketPolicy?.policyText;
  const mandatoryPolicy = policyMap.get(RESOURCE_POLICY.S3_POLICY);

  return compareResourcePolicies(currPolicyText ? JSON.parse(currPolicyText) : undefined, mandatoryPolicy);
};

/**
 * Check if role trusted identity is compliant to the designated resource policy
 *
 * @param {*} policyMap
 * @param {*} configurationItem
 * @returns
 */
const evaluateRoleTrustedIdentity = (policyMap: Map<string, PolicyDocument>, configurationItem: ConfigurationItem) => {
  if (configurationItem.configuration?.path?.startsWith('/aws-service-role/')) {
    return {
      complianceType: 'NOT_APPLICABLE',
      annotation: 'resource policy check is not applicable to AWS managed role',
    };
  }
  if (!configurationItem.configuration?.assumeRolePolicyDocument) {
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'Trusted entity is empty',
    };
  }

  // The trust policy (which includes the trust entity) is stored in the 'assumeRolePolicyDocument' field
  const trustPolicy = JSON.parse(decodeURIComponent(configurationItem.configuration.assumeRolePolicyDocument));

  const mandatoryPolicy = policyMap.get(RESOURCE_POLICY.IAM_POLICY);
  return compareResourcePolicies(trustPolicy, mandatoryPolicy);
};

/**
 * Check if key policy is compliant to the designated resource policy
 *
 * @param {*} policyMap
 * @param {*} configurationItem
 * @returns
 */
const evaluateKeyPolicy = (policyMap: Map<string, PolicyDocument>, configurationItem: ConfigurationItem) => {
  if (configurationItem.configuration?.keyManager === 'AWS') {
    return {
      complianceType: 'NOT_APPLICABLE',
      annotation: 'resource policy check is not applicable to AWS managed key',
    };
  }

  const keyPolicyStr = configurationItem.supplementaryConfiguration?.Policy;
  if (!keyPolicyStr) {
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'Key policy is empty',
    };
  }

  const mandatoryPolicy = policyMap.get(RESOURCE_POLICY.KMS_POLICY);
  return compareResourcePolicies(JSON.parse(keyPolicyStr), mandatoryPolicy);
};

/**
 * Compare if each statement in {mandatoryPolicy} exists in current {resourcePolicy}.
 *
 * @param {*} resourcePolicy
 * @param {*} mandatoryPolicy
 * @returns
 */
const compareResourcePolicies = (resourcePolicy: PolicyDocument, mandatoryPolicy: PolicyDocument | undefined) => {
  if (!resourcePolicy)
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'Resource policy is empty',
    };
  if (!mandatoryPolicy) {
    return {
      complianceType: 'NON_COMPLIANT',
      annotation: 'Mandatory resource policy or default resource policy is empty',
    };
  }

  const currStatements = resourcePolicy.Statement;
  for (const policy of mandatoryPolicy.Statement) {
    const target = currStatements.find(s => s.Sid === policy.Sid);
    if (!target)
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: `Policy statement ${policy.Sid} is not found`,
      };

    if (!deepEqual(target, policy)) {
      return {
        complianceType: 'NON_COMPLIANT',
        annotation: `Policy statement ${policy.Sid} is not identical to mandatory resource policy`,
      };
    }
  }

  return {
    complianceType: 'COMPLIANT',
  };
};
