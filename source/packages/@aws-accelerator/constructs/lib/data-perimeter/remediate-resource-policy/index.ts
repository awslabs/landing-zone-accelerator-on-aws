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
} from '@aws-sdk/client-config-service';
import { S3Client, GetBucketPolicyCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import { IAMClient, GetRoleCommand, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';
import { KMSClient, GetKeyPolicyCommand, PutKeyPolicyCommand } from '@aws-sdk/client-kms';

import { RESOURCE_POLICY, getResourcePolicies, generatePolicyReplacements, PolicyDocument } from './utils';

const config = new ConfigServiceClient();
const s3 = new S3Client();
const iam = new IAMClient();
const kms = new KMSClient();

const policyMapTemplate = getResourcePolicies();

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
    'ACCEL_LOOKUP::CUSTOM:ATTACHED_RESOURCE_ARN': (configurationItem as { ARN: string }).ARN,
  };
  const policyMap = generatePolicyReplacements(policyMapTemplate, paramsReplacement);
  await attachResourcePolicy(
    policyMap,
    configurationItem as { resourceName: string; resourceId: string; resourceType: string },
  );
};

/**
 * Get the resource type based on the resourceId from AWS Config
 *
 * @param {*} resourceId
 * @returns
 */
const getResourceTypeById = async (resourceId: string) => {
  const queryResult = await config.send(
    new SelectResourceConfigCommand({ Expression: `SELECT resourceType WHERE resourceId = '${resourceId}'` }),
  );

  if (!queryResult.Results || queryResult.Results.length === 0) {
    throw new Error(`No resource type with resource id ${resourceId} was found`);
  }

  return JSON.parse(queryResult.Results[0]).resourceType;
};

/**
 * Attach mandatory bucket policy to the s3 bucket
 *
 * @param {*} policyMap
 * @param {*} bucketName
 */
const attachS3ResourcePolicy = async (policyMap: Map<string, PolicyDocument>, bucketName: string) => {
  const s3StandardPolicy = policyMap.get(RESOURCE_POLICY.S3_POLICY);

  let bucketPolicy: PolicyDocument = {
    Version: '2012-10-17',
    Statement: [],
  };
  try {
    const data = await s3.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
    bucketPolicy = JSON.parse(data.Policy || '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.name !== 'NoSuchBucketPolicy') {
      throw err;
    }
  }

  const currStatements = bucketPolicy.Statement;

  // Update or append the s3 standard policy customized by user
  for (const statement of s3StandardPolicy?.Statement || []) {
    const idx = currStatements.findIndex(s => s.Sid === statement.Sid);
    const newStatement = {
      ...statement,
      Resource: [`arn:aws:s3:::${bucketName}`, `arn:aws:s3:::${bucketName}/*`],
    };

    if (idx >= 0) {
      currStatements[idx] = newStatement;
    } else {
      currStatements.push(newStatement);
    }
  }

  const params = {
    Bucket: bucketName,
    Policy: JSON.stringify(bucketPolicy),
  };

  await s3.send(new PutBucketPolicyCommand(params));
};

/**
 * Get the AWS Config configuration item for the resource by resourceId and resourceType.
 * This will provide useful information such as resourceName, ARN etc.
 *
 * @param {*} resourceId
 * @param {*} resourceType
 * @returns
 */
const getResourceConfigurationItem = async (resourceId: string, resourceType: string) => {
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

/**
 * Attach mandatory trusted identity to the Role
 *
 * @param {*} policyMap
 * @param {*} bucketName
 */
const attachRolePolicy = async (policyMap: Map<string, PolicyDocument>, roleName: string) => {
  const resourcePolicyTemplate = policyMap.get(RESOURCE_POLICY.IAM_POLICY);
  const role = await iam.send(new GetRoleCommand({ RoleName: roleName }));

  let currAssumeRolePolicyDocument;
  if (role.Role?.AssumeRolePolicyDocument) {
    currAssumeRolePolicyDocument = JSON.parse(decodeURIComponent(role.Role.AssumeRolePolicyDocument));
  } else {
    currAssumeRolePolicyDocument = {
      Version: '2012-10-17',
      Statement: [],
      Id: 'DataPerimeterRolePolicy',
    };
  }

  const currStatements = currAssumeRolePolicyDocument.Statement;

  for (const statement of resourcePolicyTemplate?.Statement || []) {
    const idx = currStatements.findIndex((s: { Sid: string }) => s.Sid === statement.Sid);

    if (idx >= 0) {
      currStatements[idx] = statement;
    } else {
      currStatements.push(statement);
    }
  }

  await iam.send(
    new UpdateAssumeRolePolicyCommand({
      RoleName: roleName,
      PolicyDocument: JSON.stringify(currAssumeRolePolicyDocument),
    }),
  );
};

/**
 * Attach mandatory KMS Key policy to target key
 *
 * @param {*} policyMap
 * @param {*} bucketName
 */
const attachKeyPolicy = async (policyMap: Map<string, PolicyDocument>, keyId: string) => {
  const keyPolicyTemplate = policyMap.get(RESOURCE_POLICY.KMS_POLICY);

  const getPolicyResponse = await kms.send(
    new GetKeyPolicyCommand({
      KeyId: keyId,
      PolicyName: 'default',
    }),
  );

  let currPolicyDocument;
  if (getPolicyResponse.Policy) {
    currPolicyDocument = JSON.parse(getPolicyResponse.Policy);
  } else {
    currPolicyDocument = {
      Version: '2012-10-17',
      Statement: [],
      Id: 'DataPerimeterKeyPolicy',
    };
  }

  const currStatements = currPolicyDocument.Statement;

  for (const statement of keyPolicyTemplate?.Statement || []) {
    const idx = currStatements.findIndex((s: { Sid: string }) => s.Sid === statement.Sid);

    if (idx >= 0) {
      currStatements[idx] = statement;
    } else {
      currStatements.push(statement);
    }
  }

  await kms.send(
    new PutKeyPolicyCommand({
      KeyId: keyId,
      PolicyName: 'default',
      Policy: JSON.stringify(currPolicyDocument),
      BypassPolicyLockoutSafetyCheck: false,
    }),
  );
};

/**
 * Attach mandatory resource policy to the target resource
 *
 * @param {*} policyMap
 * @param {*} bucketName
 */
const attachResourcePolicy = async (
  policyMap: Map<string, PolicyDocument>,
  configurationItem: { resourceName: string; resourceId: string; resourceType: string },
) => {
  switch (configurationItem.resourceType) {
    case 'AWS::S3::Bucket':
      await attachS3ResourcePolicy(policyMap, configurationItem.resourceName);
      break;
    case 'AWS::IAM::Role':
      await attachRolePolicy(policyMap, configurationItem.resourceName);
      break;
    case 'AWS::KMS::Key':
      await attachKeyPolicy(policyMap, configurationItem.resourceId);
      break;
    default:
      throw new Error(`${configurationItem.resourceType} is not supported`);
  }
};
