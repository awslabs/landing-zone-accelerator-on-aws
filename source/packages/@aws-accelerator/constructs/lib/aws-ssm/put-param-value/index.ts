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

import { SSMClient, PutParameterCommand, DeleteParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';
import { STSClient } from '@aws-sdk/client-sts';
import { setRetryStrategy, getStsCredentials } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from '@aws-accelerator/utils/lib/common-types';

interface SsmParameterProps {
  readonly name: string;
  readonly value: string;
  readonly tags?: Record<string, string>;
}

/**
 * Put SSM parameter custom resource
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
  const region: string = event.ResourceProperties['region'];
  const invokingAccountId: string = event.ResourceProperties['invokingAccountId'];
  const parameterAccountIds: string[] = event.ResourceProperties['parameterAccountIds'];
  const roleName: string = event.ResourceProperties['roleName'];
  const parameters: SsmParameterProps[] = event.ResourceProperties['parameters'];
  const solutionId = process.env['SOLUTION_ID'];
  const partition = event.ServiceToken.split(':')[1];

  switch (event.RequestType) {
    case 'Create':
      await processParameterCreate(
        { invokingAccountId, roleName, region, partition, solutionId },
        parameterAccountIds,
        parameters,
      );
      break;

    case 'Update':
      const oldParameters: SsmParameterProps[] = event.OldResourceProperties['parameters'] ?? [];
      const oldAccountIds: string[] = event.OldResourceProperties['parameterAccountIds'] ?? [];
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
      await processParameterDelete(
        { invokingAccountId, roleName, region, partition, solutionId },
        parameterAccountIds,
        parameters,
      );
      break;
  }

  // Return the existing PhysicalResourceId for Update/Delete to prevent
  // CloudFormation from interpreting a changed ID as a resource replacement,
  // which triggers spurious Delete events that remove shared SSM parameters.
  const physicalResourceId =
    event.RequestType === 'Create'
      ? parameters[0].name
      : (event as CloudFormationCustomResourceUpdateEvent | CloudFormationCustomResourceDeleteEvent).PhysicalResourceId;

  return {
    PhysicalResourceId: physicalResourceId,
    Status: 'SUCCESS',
  };
}

function setRoleArn(partition: string, parameterAccountId: string, roleName: string): string {
  return `arn:${partition}:iam::${parameterAccountId}:role/${roleName}`;
}

async function getSsmClient(
  invokingAccountId: string,
  parameterAccountId: string,
  region: string,
  assumeRoleArn: string,
  solutionId?: string,
): Promise<SSMClient> {
  if (invokingAccountId !== parameterAccountId) {
    const stsClient = new STSClient({ region: region, customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
    return new SSMClient({
      region: region,
      credentials: await getStsCredentials(stsClient, assumeRoleArn),
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });
  }
  return new SSMClient({ region: region, customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
}

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

  for (const removedAccountId of removedAccountIds) {
    const assumeRoleArn = setRoleArn(stsConfig.partition, removedAccountId, stsConfig.roleName);
    try {
      const ssmClient = await getSsmClient(
        stsConfig.invokingAccountId,
        removedAccountId,
        stsConfig.region,
        assumeRoleArn,
        stsConfig.solutionId,
      );
      await deleteParameters(ssmClient, removedAccountId, oldParameterNames);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes('Could not assume role: AccessDenied') &&
          error.message.includes('is not authorized to perform: sts:AssumeRole')
        ) {
          console.log(
            `Unable to assume role for role arn: ${assumeRoleArn}. Skipping parameter deletion and continuing. Please validate whether this account is in a Suspended or Deleted state.`,
          );
          continue;
        }
      }
      throw error;
    }
  }
}

async function processParameterDelete(
  stsClient: { invokingAccountId: string; roleName: string; region: string; partition: string; solutionId?: string },
  parameterAccountIds: string[],
  parameterProps: SsmParameterProps[],
): Promise<void> {
  for (const parameterAccountId of parameterAccountIds) {
    const assumeRoleArn = setRoleArn(stsClient.partition, parameterAccountId, stsClient.roleName);
    const ssmClient = await getSsmClient(
      stsClient.invokingAccountId,
      parameterAccountId,
      stsClient.region,
      assumeRoleArn,
      stsClient.solutionId,
    );
    await deleteParameters(ssmClient, parameterAccountId, undefined, parameterProps);
  }
}

async function processParameterCreate(
  stsClient: { invokingAccountId: string; roleName: string; region: string; partition: string; solutionId?: string },
  parameterAccountIds: string[],
  parameters: SsmParameterProps[],
): Promise<void> {
  for (const parameterAccountId of parameterAccountIds) {
    const assumeRoleArn = setRoleArn(stsClient.partition, parameterAccountId, stsClient.roleName);
    const ssmClient = await getSsmClient(
      stsClient.invokingAccountId,
      parameterAccountId,
      stsClient.region,
      assumeRoleArn,
      stsClient.solutionId,
    );
    await createParameters(ssmClient, parameterAccountId, parameters);
  }
}

/**
 * Create or overwrite SSM parameters. Uses Overwrite: true which preserves
 * existing tags on the parameter. Tags are managed separately by the
 * tagging stacks and do not need to be applied here.
 */
async function createParameters(ssmClient: SSMClient, parameterAccountId: string, parameters: SsmParameterProps[]) {
  for (const parameter of parameters) {
    console.log(`Put SSM parameter ${parameter.name} to account ${parameterAccountId}`);
    await throttlingBackOff(() =>
      ssmClient.send(
        new PutParameterCommand({
          Name: parameter.name,
          Value: parameter.value,
          Type: 'String',
          Overwrite: true,
        }),
      ),
    );
  }
}

async function deleteParameters(
  ssmClient: SSMClient,
  parameterAccountId: string,
  parameterNames?: string[],
  parameterProps?: SsmParameterProps[],
) {
  const deleteParameterNames: string[] = [];

  for (const parameterProp of parameterProps ?? []) {
    deleteParameterNames.push(parameterProp.name);
  }
  deleteParameterNames.push(...(parameterNames ?? []));

  for (const deleteParameterName of deleteParameterNames) {
    console.log(`Delete SSM parameter ${deleteParameterName} from account ${parameterAccountId}`);
    try {
      await throttlingBackOff(() => ssmClient.send(new DeleteParameterCommand({ Name: deleteParameterName })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.name === 'ParameterNotFound' || err.Code === 'ParameterNotFound') {
        console.log(`Parameter ${deleteParameterName} not found in account ${parameterAccountId}, skipping.`);
      } else {
        throw err;
      }
    }
  }
}

/**
 * Returns the configured parameters that are absent from the target account or whose stored value
 * differs from the configured value.
 *
 * The previous implementation decided what to write by diffing the CloudFormation resource
 * properties (old vs new), which describes what this custom resource wrote last time rather than
 * what the target account currently holds. A parameter that went missing after being written -
 * deleted manually, lost while an account was suspended, or never written because an earlier
 * invocation failed part way - was therefore never rewritten, leaving share target accounts
 * permanently unable to deploy with
 * `Unable to fetch parameters [...] from parameter store for this account`.
 *
 * Reading the live state fixes that, and in the steady state issues no writes at all, so it avoids
 * churning parameter versions. That matters because Parameter Store keeps only the 100 most recent
 * versions of a parameter and cannot evict the oldest one if it carries a label, which would fail
 * the deployment with ParameterMaxVersionLimitExceeded.
 *
 * @param ssmClient SSMClient for the target account
 * @param parameters the configured parameters
 * @returns the subset of parameters that need to be written
 */
async function getParametersRequiringWrite(
  ssmClient: SSMClient,
  parameters: SsmParameterProps[],
): Promise<SsmParameterProps[]> {
  // GetParameters accepts a maximum of 10 names per request
  const getParametersBatchSize = 10;
  const storedValues = new Map<string, string>();

  for (let index = 0; index < parameters.length; index += getParametersBatchSize) {
    const batch = parameters.slice(index, index + getParametersBatchSize);
    const response = await throttlingBackOff(() =>
      ssmClient.send(new GetParametersCommand({ Names: batch.map(parameter => parameter.name) })),
    );
    // Names that do not exist are returned under InvalidParameters and are absent from Parameters,
    // so they fall through as requiring a write
    for (const storedParameter of response.Parameters ?? []) {
      if (storedParameter.Name) {
        storedValues.set(storedParameter.Name, storedParameter.Value ?? '');
      }
    }
  }

  // Only values are compared. Tags are deliberately excluded because createParameters does not
  // apply them either - tags on these parameters are owned by the tagging stacks.
  return parameters.filter(parameter => storedValues.get(parameter.name) !== parameter.value);
}

/**
 * Reconcile the parameters in every target account with the configured parameters.
 * Deletes parameters that are no longer configured and writes the ones that are missing or stale.
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

    // Remove parameters that are no longer configured
    await deleteParameters(ssmClient, parameterAccountId, removedParameterNames);

    // Write the parameters that the target account is actually missing or holds a stale value for
    const parametersRequiringWrite = await getParametersRequiringWrite(ssmClient, newParameters);
    if (parametersRequiringWrite.length === 0) {
      console.log(`SSM parameters in account ${parameterAccountId} are up to date`);
    }
    await createParameters(ssmClient, parameterAccountId, parametersRequiringWrite);
  }
}
