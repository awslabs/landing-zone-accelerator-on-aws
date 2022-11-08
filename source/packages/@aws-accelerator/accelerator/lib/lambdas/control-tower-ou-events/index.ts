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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  OrganizationsClient,
  ListParentsCommand,
  DescribeOrganizationalUnitCommand,
} from '@aws-sdk/client-organizations';

const configTableName: string = process.env['CONFIG_TABLE_NAME'] ?? '';
const solutionId: string = process.env['SOLUTION_ID'] ?? '';

const organizationsClient = new OrganizationsClient({ customUserAgent: solutionId });
const dynamodbClient = new DynamoDBClient({ customUserAgent: solutionId });
const ddbDocumentClient = DynamoDBDocumentClient.from(dynamodbClient);
/**
 * Control Tower OU Events  - lambda handler
 *
 * @param event
 * @returns
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<any> {
  console.log(JSON.stringify(event));

  if (event.detailType != 'AWS Service Event via CloudTrail' && event.source != 'aws.controltower') {
    console.error('Event was not the proper type.');
    return;
  }

  switch (event.detail.eventName) {
    case 'RegisterOrganizationalUnit':
      const registerOuId =
        event.detail.serviceEventDetails.registerOrganizationalUnitStatus.organizationalUnit.organizationalUnitId;
      const registerOuName =
        event.detail.serviceEventDetails.registerOrganizationalUnitStatus.organizationalUnit.organizationalUnitName;
      console.log(
        `Updating config with RegisterOrganizationalUnit for OuId ${registerOuId} with name ${registerOuName}`,
      );
      const registeredKey = await getAcceleratorKeyForOu(registerOuId, registerOuName);
      await updateOrganizationRecord(registeredKey, registerOuId, true);
      break;
    case 'DeregisterOrganizationalUnit':
      const deregisterOuId =
        event.detail.serviceEventDetails.registerOrganizationalUnitStatus.organizationalUnit.organizationalUnitId;
      const deregisterOuName =
        event.detail.serviceEventDetails.registerOrganizationalUnitStatus.organizationalUnit.organizationalUnitName;
      console.log(
        `Updating config with DeregisterOrganizationalUnit for OuId ${deregisterOuId} with name ${deregisterOuName}`,
      );
      const deregisteredKey = await getAcceleratorKeyForOu(deregisterOuId, deregisterOuName);
      await updateOrganizationRecord(deregisteredKey, deregisterOuId, false);
      break;
    default:
      console.error('Event Name is not supported');
  }
}

async function getAcceleratorKeyForOu(ouId: string, ouName: string): Promise<string> {
  let acceleratorKey = ouName;
  // check if OU exists in config table
  const acceleratorKeyLookup = await getAcceleratorKeyWithAwsKey(ouId);
  if (acceleratorKeyLookup) {
    return acceleratorKeyLookup;
  }
  // build acceleratorKey by building path to OU
  let currentOuType = 'ORGANIZATIONAL_UNIT';
  let currentOuId = ouId;
  while (currentOuType == 'ORGANIZATIONAL_UNIT') {
    const parentOu = await throttlingBackOff(() =>
      organizationsClient.send(
        new ListParentsCommand({
          ChildId: currentOuId,
        }),
      ),
    );

    if (parentOu.Parents?.[0].Type == 'ROOT') {
      return acceleratorKey;
    } else {
      currentOuType = parentOu.Parents?.[0].Type ?? '';
      currentOuId = parentOu.Parents?.[0].Id ?? '';
    }
    const parentOuDescription = await throttlingBackOff(() =>
      organizationsClient.send(
        new DescribeOrganizationalUnitCommand({
          OrganizationalUnitId: parentOu.Parents?.[0].Id,
        }),
      ),
    );
    acceleratorKey = `${parentOuDescription.OrganizationalUnit?.Name}/${acceleratorKey}`;
  }
  return '';
}

async function updateOrganizationRecord(acceleratorKey: string, awsKey: string, registered: boolean): Promise<void> {
  const params: UpdateCommandInput = {
    TableName: configTableName,
    Key: {
      dataType: 'organization',
      acceleratorKey: acceleratorKey,
    },
    UpdateExpression: 'set #awsKey = :v_awsKey, #registered = :v_registered',
    ExpressionAttributeNames: {
      '#awsKey': 'awsKey',
      '#registered': 'registered',
    },
    ExpressionAttributeValues: {
      ':v_awsKey': awsKey,
      ':v_registered': registered,
    },
  };
  await throttlingBackOff(() => ddbDocumentClient.send(new UpdateCommand(params)));
}

async function getAcceleratorKeyWithAwsKey(awsKey: string): Promise<string> {
  const params: QueryCommandInput = {
    TableName: configTableName,
    IndexName: 'awsResourceKeys',
    KeyConditionExpression: 'dataType = :hkey AND awsKey = :awsKey',
    ExpressionAttributeValues: {
      ':hkey': 'organization',
      ':awsKey': awsKey,
    },
    ProjectionExpression: 'acceleratorKey, awsKey',
  };
  const response = await throttlingBackOff(() => ddbDocumentClient.send(new QueryCommand(params)));
  if (response.Items) {
    return response.Items[0]['acceleratorKey'];
  } else {
    return '';
  }
}
