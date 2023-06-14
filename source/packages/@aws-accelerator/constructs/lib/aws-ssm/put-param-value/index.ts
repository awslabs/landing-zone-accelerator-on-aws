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
  const partition = event.ServiceToken.split(':')[1];

  switch (event.RequestType) {
    case 'Create':
      // Put parameters
      await processParameterCreate(
        { invokingAccountId, roleName, region, partition, solutionId },
        parameterAccountIds,
        parameters,
      );
      break;

    case 'Update':
      const oldParameters: SsmParameterProps[] = event.OldResourceProperties['parameters'];
      const oldAccountIds: string[] = event.OldResourceProperties['parameterAccountIds'];
      const removedAccountIds = oldAccountIds.filter(id => !parameterAccountIds.includes(id));
      const addedAccountIds = parameterAccountIds.filter(id => !oldAccountIds.includes(id));

      if (removedAccountIds.length > 0) {
        console.log(`Accounts ${removedAccountIds.join(',')} removed, deleting all old parameters for these accounts.`);
        await deleteParametersFromRemovedAccounts(
          { invokingAccountId, partition, region, roleName, solutionId },
          removedAccountIds,
          oldParameters,
        );
      }

      await processParameterUpdates(
        { invokingAccountId, roleName, region, partition, solutionId },
        parameterAccountIds,
        addedAccountIds,
        parameters,
        oldParameters,
      );
      break;

    case 'Delete':
      // Delete all parameters
      await processParameterDelete(
        { invokingAccountId, roleName, region, partition, solutionId },
        parameterAccountIds,
        parameters,
      );
      break;
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
 * Function to delete ssm parameters from removed accounts
 * @param stsConfig
 * @param removedAccountIds string[]
 * @param oldParameters {@link SsmParameterProps}[]
 */
async function deleteParametersFromRemovedAccounts(
  stsConfig: {
    invokingAccountId: string;
    partition: string;
    region: string;
    roleName: string;
    solutionId?: string;
  },
  removedAccountIds: string[],
  oldParameters: SsmParameterProps[],
): Promise<void> {
  const oldParameterNames = oldParameters ? oldParameters.map(oldParam => oldParam.name) : [];

  // Remove old parameters from removed accounts
  for (const removedAccountId of removedAccountIds) {
    const assumeRoleArn = setRoleArn(stsConfig.partition, removedAccountId, stsConfig.roleName);
    const ssmClient = await getSsmClient(
      stsConfig.invokingAccountId,
      removedAccountId,
      stsConfig.region,
      assumeRoleArn,
      stsConfig.solutionId,
    );
    // Remove parameters
    await deleteParameters(ssmClient, removedAccountId, oldParameterNames);
  }
}

/**
 * Process parameter delete
 * @param stsClient
 * @param parameterAccountIds string[]
 * @param parameterProps {@link SsmParameterProps}[]
 */
async function processParameterDelete(
  stsClient: { invokingAccountId: string; roleName: string; region: string; partition: string; solutionId?: string },
  parameterAccountIds: string[],
  parameterProps: SsmParameterProps[],
): Promise<void> {
  for (const parameterAccountId of parameterAccountIds) {
    // Get SSM client for the parameter account
    const assumeRoleArn = setRoleArn(stsClient.partition, parameterAccountId, stsClient.roleName);
    const ssmClient = await getSsmClient(
      stsClient.invokingAccountId,
      parameterAccountId,
      stsClient.region,
      assumeRoleArn,
      stsClient.solutionId,
    );

    // Delete all parameters
    await deleteParameters(ssmClient, parameterAccountId, undefined, parameterProps);
  }
}

/**
 * Process parameter create
 * @param stsClient
 * @param parameterAccountIds string[]
 * @param parameters {@link SsmParameterProps}[]
 */
async function processParameterCreate(
  stsClient: { invokingAccountId: string; roleName: string; region: string; partition: string; solutionId?: string },
  parameterAccountIds: string[],
  parameters: SsmParameterProps[],
): Promise<void> {
  for (const parameterAccountId of parameterAccountIds) {
    // Get SSM client for the parameter account
    const assumeRoleArn = setRoleArn(stsClient.partition, parameterAccountId, stsClient.roleName);
    const ssmClient = await getSsmClient(
      stsClient.invokingAccountId,
      parameterAccountId,
      stsClient.region,
      assumeRoleArn,
      stsClient.solutionId,
    );

    // Put parameters
    await createParameters(ssmClient, parameterAccountId, parameters);
  }
}

/**
 * Create SSM parameters
 * @param ssmClient {@link AWS.SSM}
 * @param parameterAccountId string
 * @param parameters {@link SsmParameterProps}[]
 */
async function createParameters(ssmClient: AWS.SSM, parameterAccountId: string, parameters: SsmParameterProps[]) {
  // Put parameters
  for (const parameter of parameters) {
    console.log(`Put SSM parameter ${parameter.name} to account ${parameterAccountId}`);
    await throttlingBackOff(() =>
      ssmClient
        .putParameter({ Name: parameter.name, Value: parameter.value, Type: 'String', Overwrite: true })
        .promise(),
    );
  }
}

/**
 * Delete SSM parameters
 * @param ssmClient {@link AWS.SSM}
 * @param parameterAccountId string
 * @param parameterNames string[]
 * @param parameterProps SsmParameterProps[]
 */
async function deleteParameters(
  ssmClient: AWS.SSM,
  parameterAccountId: string,
  parameterNames?: string[],
  parameterProps?: SsmParameterProps[],
) {
  const deleteParameterNames: string[] = [];

  for (const parameterProp of parameterProps ?? []) {
    deleteParameterNames.push(parameterProp.name);
  }

  deleteParameterNames.push(...(parameterNames ?? []));

  // Remove parameters
  for (const deleteParameterName of deleteParameterNames) {
    console.log(`Delete SSM parameter ${deleteParameterName} from account ${parameterAccountId}`);
    await throttlingBackOff(() => ssmClient.deleteParameter({ Name: deleteParameterName }).promise());
  }
}

/**
 * Function to get Modified parameters
 * @param ssmClient
 * @param parameterAccountId string
 * @param newParameters {@link SsmParameterProps}[]
 * @param oldParameters {@link SsmParameterProps}[]
 */
async function modifyParameters(
  ssmClient: AWS.SSM,
  parameterAccountId: string,
  newParameters: SsmParameterProps[],
  oldParameters: SsmParameterProps[],
): Promise<void> {
  const modifiedParameters: SsmParameterProps[] = [];

  for (const newParameter of newParameters) {
    const filterParameters = oldParameters.filter(item => item.name === newParameter.name);
    for (const filterParameter of filterParameters) {
      if (filterParameter.value !== newParameter.value) {
        modifiedParameters.push(newParameter);
      }
    }
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

/**
 * Process parameter updates
 * @param stsClient
 * @param parameterAccountIds string[]
 * @param addedAccountIds string[]
 * @param newParameters {@link SsmParameterProps}[]
 * @param oldParameters {@link SsmParameterProps}[]
 */
async function processParameterUpdates(
  stsClient: { invokingAccountId: string; roleName: string; region: string; partition: string; solutionId?: string },
  parameterAccountIds: string[],
  addedAccountIds: string[],
  newParameters: SsmParameterProps[],
  oldParameters: SsmParameterProps[],
): Promise<void> {
  const existingAccountIds = parameterAccountIds.filter(item => !addedAccountIds.includes(item));

  if (addedAccountIds.length > 0) {
    await processParameterCreate(stsClient, addedAccountIds, newParameters);
  }

  for (const parameterAccountId of existingAccountIds) {
    // Get SSM client for the parameter account

    const assumeRoleArn = setRoleArn(stsClient.partition, parameterAccountId, stsClient.roleName);
    const ssmClient = await getSsmClient(
      stsClient.invokingAccountId,
      parameterAccountId,
      stsClient.region,
      assumeRoleArn,
      stsClient.solutionId,
    );

    const oldParameterNames = oldParameters ? oldParameters.map(oldParam => oldParam.name) : [];
    const newParameterNames = newParameters.map(newParam => newParam.name);

    const removedParameterNames = oldParameterNames.filter(name => !newParameterNames.includes(name));
    const addedParameters = newParameters.filter(param => !oldParameterNames.includes(param.name));

    // Remove parameters
    await deleteParameters(ssmClient, parameterAccountId, removedParameterNames);

    // Create new parameters
    // Put parameters
    await createParameters(ssmClient, parameterAccountId, addedParameters);

    // Modify existing parameters if their values have changed
    await modifyParameters(ssmClient, parameterAccountId, newParameters, oldParameters);
  }
}
