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

import * as AWS from 'aws-sdk';
import * as console from 'console';

import { throttlingBackOff } from '@aws-accelerator/utils';

AWS.config.logger = console;

interface SsmParameterProps {
  readonly name: string;
  readonly value: string;
}

/**
 * Put SSM parameter custom resource
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
  const region: string = event.ResourceProperties['region'];
  const invokingAccountId: string = event.ResourceProperties['invokingAccountId'];
  const parameterAccountIds: string[] = event.ResourceProperties['parameterAccountIds'];
  const roleName: string = event.ResourceProperties['roleName'];
  const parameters: SsmParameterProps[] = event.ResourceProperties['parameters'];
  const solutionId = process.env['SOLUTION_ID'];

  for (const parameterAccountId of parameterAccountIds) {
    // Get SSM client for the parameter account
    const partition = event.ServiceToken.split(':')[1];
    const assumeRoleArn = setRoleArn(partition, parameterAccountId, roleName);
    const ssmClient = await getSsmClient(invokingAccountId, parameterAccountId, region, assumeRoleArn, solutionId);

    switch (event.RequestType) {
      case 'Create':
        // Put parameters
        for (const parameter of parameters) {
          console.log(`Put SSM parameter ${parameter.name} to account ${parameterAccountId}`);
          await throttlingBackOff(() =>
            ssmClient
              .putParameter({ Name: parameter.name, Value: parameter.value, Type: 'String', Overwrite: true })
              .promise(),
          );
        }
        break;

      case 'Update':
        // Process creation, updates, and deletes
        await processParameterUpdates(
          parameters,
          ssmClient,
          parameterAccountId,
          event.OldResourceProperties['parameters'],
        );
        break;

      case 'Delete':
        // Delete all parameters
        for (const parameter of parameters) {
          console.log(`Delete SSM parameter ${parameter.name} from account ${parameterAccountId}`);
          await throttlingBackOff(() => ssmClient.deleteParameter({ Name: parameter.name }).promise());
        }
        break;
    }
  }
  return {
    PhysicalResourceId: parameters[0].name, // required for backwards compatibility
    Status: 'SUCCESS',
  };
}

/**
 * Set role ARN for a given partition, account ID and role name
 *
 * @param partition
 * @param parameterAccountId
 * @param roleName
 * @returns
 */
function setRoleArn(partition: string, parameterAccountId: string, roleName: string): string {
  return `arn:${partition}:iam::${parameterAccountId}:role/${roleName}`;
}

/**
 * Returns an SSM client based on the account ID and region
 * @param accountId
 * @param region
 * @returns
 */
async function getSsmClient(
  invokingAccountId: string,
  parameterAccountId: string,
  region: string,
  assumeRoleArn: string,
  solutionId?: string,
): Promise<AWS.SSM> {
  let ssmClient: AWS.SSM;
  if (invokingAccountId !== parameterAccountId) {
    const stsClient = new AWS.STS({ region: region, customUserAgent: solutionId });
    const assumeRoleCredential = await throttlingBackOff(() =>
      stsClient
        .assumeRole({
          RoleArn: assumeRoleArn,
          RoleSessionName: 'acceleratorAssumeRoleSession',
        })
        .promise(),
    );
    ssmClient = new AWS.SSM({
      region: region,
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
        expireTime: assumeRoleCredential.Credentials!.Expiration,
      },
      customUserAgent: solutionId,
    });
  } else {
    ssmClient = new AWS.SSM({ region: region, customUserAgent: solutionId });
  }
  return ssmClient;
}

/**
 * Process parameter updates
 * @param oldParameters
 * @param newParameters
 * @param ssmClient
 * @param parameterAccountId
 */
async function processParameterUpdates(
  newParameters: SsmParameterProps[],
  ssmClient: AWS.SSM,
  parameterAccountId: string,
  oldParameters?: SsmParameterProps[],
): Promise<void> {
  const oldParameterNames = oldParameters ? oldParameters.map(oldParam => oldParam.name) : [];
  const oldParameterValues = oldParameters ? oldParameters.map(oldParam => oldParam.value) : [];
  const newParameterNames = newParameters.map(newParam => newParam.name);

  const removedParameters = oldParameterNames.filter(name => !newParameterNames.includes(name));
  const addedParameters = newParameters.filter(param => !oldParameterNames.includes(param.name));
  const modifiedParameters = newParameters.filter(
    param => oldParameterNames.includes(param.name) && !oldParameterValues.includes(param.value),
  );

  // Remove parameters
  for (const parameter of removedParameters) {
    console.log(`Delete SSM parameter ${parameter} from account ${parameterAccountId}`);
    await throttlingBackOff(() => ssmClient.deleteParameter({ Name: parameter }).promise());
  }

  // Create new parameters
  for (const parameter of addedParameters) {
    console.log(`Put SSM parameter ${parameter} to account ${parameterAccountId}`);
    await throttlingBackOff(() =>
      ssmClient
        .putParameter({ Name: parameter.name, Value: parameter.value, Type: 'String', Overwrite: true })
        .promise(),
    );
  }

  // Modify existing parameters if their values have changed
  for (const parameter of modifiedParameters) {
    console.log(`Modify SSM parameter ${parameter.name} in account ${parameterAccountId}`);
    await throttlingBackOff(() =>
      ssmClient
        .putParameter({ Name: parameter.name, Value: parameter.value, Type: 'String', Overwrite: true })
        .promise(),
    );
  }
}
