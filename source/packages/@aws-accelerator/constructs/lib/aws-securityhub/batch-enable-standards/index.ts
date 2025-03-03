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
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  BatchDisableStandardsCommand,
  BatchEnableStandardsCommand,
  EnableSecurityHubCommand,
  paginateDescribeStandards,
  paginateDescribeStandardsControls,
  paginateGetEnabledStandards,
  ResourceConflictException,
  SecurityHubClient,
  StandardsControl,
  StandardsSubscription,
  StandardsSubscriptionRequest,
  UpdateStandardsControlCommand,
} from '@aws-sdk/client-securityhub';

type InputStandardType = { name: string; enable: string; controlsToDisable: string[] | undefined };
type SecurityHubStandardType = { [name: string]: string };
/**
 * batch-enable-standards - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const inputStandards = JSON.parse(JSON.stringify(event.ResourceProperties['standards']));

  const client = new SecurityHubClient({
    region: region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  // Get AWS defined security standards name and ARN
  const securityHubStandards: SecurityHubStandardType[] = [];
  const paginator = paginateDescribeStandards({ client }, {});

  for await (const page of paginator) {
    for (const standard of page.Standards ?? []) {
      if (standard.StandardsArn && standard.Name) {
        const securityHubStandard: SecurityHubStandardType = {};
        securityHubStandard[standard.Name] = standard.StandardsArn;
        securityHubStandards.push(securityHubStandard);
      }
    }
  }

  // Enable security hub is admin account before creating delegation admin account, if this wasn't enabled by organization delegation
  await enableSecurityHub(client);

  const standardsModificationList = await getStandardsModificationList(client, inputStandards, securityHubStandards);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - BatchEnableStandardsCommand');

      // When there are standards to be enable
      if (standardsModificationList.toEnableStandardRequests.length > 0) {
        console.log('To enable:');
        console.log(standardsModificationList.toEnableStandardRequests);
        await throttlingBackOff(() =>
          client.send(
            new BatchEnableStandardsCommand({
              StandardsSubscriptionRequests: standardsModificationList.toEnableStandardRequests,
            }),
          ),
        );
      }

      // When there are standards to be disable
      if (standardsModificationList.toDisableStandardArns!.length > 0) {
        console.log(`Disabling standard ${standardsModificationList.toDisableStandardArns!}`);
        await throttlingBackOff(() =>
          client.send(
            new BatchDisableStandardsCommand({
              StandardsSubscriptionArns: standardsModificationList.toDisableStandardArns!,
            }),
          ),
        );
      }

      // get list of controls to modify
      const controlsToModify = await getControlArnsToModify(client, inputStandards, securityHubStandards);

      // Enable standard controls
      for (const controlArnToModify of controlsToModify.disableStandardControlArns) {
        await throttlingBackOff(() =>
          client.send(
            new UpdateStandardsControlCommand({
              StandardsControlArn: controlArnToModify,
              ControlStatus: 'DISABLED',
              DisabledReason: 'Control disabled by Accelerator',
            }),
          ),
        );
      }

      // Disable standard controls
      for (const controlArnToModify of controlsToModify.enableStandardControlArns) {
        await throttlingBackOff(() =>
          client.send(
            new UpdateStandardsControlCommand({ StandardsControlArn: controlArnToModify, ControlStatus: 'ENABLED' }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const existingEnabledStandards = await getExistingEnabledStandards(client);
      const subscriptionArns: string[] = [];
      existingEnabledStandards.forEach(standard => {
        if (standard.StandardsSubscriptionArn) {
          subscriptionArns.push(standard.StandardsSubscriptionArn);
        }
      });

      if (subscriptionArns.length > 0) {
        console.log('Below listed standards disable during delete');
        console.log(subscriptionArns);
        await throttlingBackOff(() =>
          client.send(new BatchDisableStandardsCommand({ StandardsSubscriptionArns: subscriptionArns })),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Enable SecurityHub
 * @param client {@link SecurityHubClient}
 */
async function enableSecurityHub(client: SecurityHubClient): Promise<void> {
  try {
    await throttlingBackOff(() => client.send(new EnableSecurityHubCommand({ EnableDefaultStandards: false })));
  } catch (error: unknown) {
    if (error instanceof ResourceConflictException) {
      console.warn(error.name + ': ' + error.message);
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${error}`);
  }
}

/**
 * Function to provide existing enabled standards
 * @param securityHubClient {@link SecurityHubClient}
 * @returns standards {@link StandardsSubscription}[]
 */
async function getExistingEnabledStandards(client: SecurityHubClient): Promise<StandardsSubscription[]> {
  const standardsSubscriptions: StandardsSubscription[] = [];

  const paginator = paginateGetEnabledStandards({ client }, {});

  for await (const page of paginator) {
    if (page.StandardsSubscriptions) {
      standardsSubscriptions.push(...page.StandardsSubscriptions);
    }
  }

  return standardsSubscriptions;
}

/**
 * Function to provide list of control arns for standards to be enable or disable
 * @param client {@link SecurityHubClient}
 * @param inputStandards {@link InputStandardType}[]
 * @param securityHubStandards {@link SecurityHubStandardType}[]
 * @returns
 */
async function getControlArnsToModify(
  client: SecurityHubClient,
  inputStandards: InputStandardType[],
  securityHubStandards: SecurityHubStandardType[],
): Promise<{ disableStandardControlArns: string[]; enableStandardControlArns: string[] }> {
  const existingEnabledStandards = await getExistingEnabledStandards(client);
  const disableStandardControls: string[] = [];
  const enableStandardControls: string[] = [];

  for (const inputStandard of inputStandards) {
    console.log(`inputStandard: ${JSON.stringify(inputStandard)}`);
    if (inputStandard.enable === 'true') {
      for (const awsSecurityHubStandard of securityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          console.log(`Standard Name: ${awsSecurityHubStandard[inputStandard.name]}`);
          const existingEnabledStandard = existingEnabledStandards.find(
            item => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );
          if (existingEnabledStandard?.StandardsSubscriptionArn) {
            console.log(`Getting controls for ${existingEnabledStandard?.StandardsSubscriptionArn} subscription`);

            const standardsControl: StandardsControl[] = await getDescribeStandardsControls(
              client,
              existingEnabledStandard.StandardsSubscriptionArn,
            );

            while (standardsControl.length === 0) {
              console.warn(
                `Delaying standard control retrieval by 10000 ms for ${existingEnabledStandard.StandardsSubscriptionArn}`,
              );
              await delay(10000);

              standardsControl.push(
                ...(await getDescribeStandardsControls(client, existingEnabledStandard.StandardsSubscriptionArn)),
              );
            }

            console.log(`When control list available for ${existingEnabledStandard.StandardsSubscriptionArn}`);
            console.log(standardsControl);

            for (const control of standardsControl) {
              if (inputStandard.controlsToDisable?.includes(control.ControlId!)) {
                console.log(control.ControlId!);
                disableStandardControls.push(control.StandardsControlArn!);
              } else {
                if (control.ControlStatus == 'DISABLED') {
                  console.log('following is disabled need to be enable now');
                  console.log(control.ControlId!);
                  enableStandardControls.push(control.StandardsControlArn!);
                }
              }
            }
          }
        }
      }
    }
  }

  return { disableStandardControlArns: disableStandardControls, enableStandardControlArns: enableStandardControls };
}

/**
 * Function to be executed before event specific action starts, this function makes the list of standards to be enable or disable based on the input
 * @param client {@link SecurityHubClient}
 * @param inputStandards {@link InputStandardType}[]
 * @param securityHubStandards {@link SecurityHubStandardType}[]
 * @returns
 */
async function getStandardsModificationList(
  client: SecurityHubClient,
  inputStandards: InputStandardType[],
  securityHubStandards: SecurityHubStandardType[],
): Promise<{
  toEnableStandardRequests: StandardsSubscriptionRequest[];
  toDisableStandardArns: string[] | undefined;
}> {
  const existingEnabledStandards = await getExistingEnabledStandards(client);
  const toEnableStandardRequests: StandardsSubscriptionRequest[] = [];
  const toDisableStandardArns: string[] | undefined = [];

  if (!inputStandards || inputStandards.length === 0) {
    for (const existingEnabledStandard of existingEnabledStandards) {
      if (existingEnabledStandard.StandardsSubscriptionArn) {
        toDisableStandardArns.push(existingEnabledStandard.StandardsSubscriptionArn);
      }
    }
  }

  for (const inputStandard of inputStandards) {
    if (inputStandard.enable === 'true') {
      for (const awsSecurityHubStandard of securityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          const existingEnabledStandard = existingEnabledStandards.filter(
            item => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );
          if (existingEnabledStandard.length === 0) {
            toEnableStandardRequests.push({ StandardsArn: awsSecurityHubStandard[inputStandard.name] });
          }
        }
      }
    } else {
      for (const awsSecurityHubStandard of securityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          const existingEnabledStandard = existingEnabledStandards.find(
            item => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );

          if (existingEnabledStandard) {
            if (existingEnabledStandard.StandardsSubscriptionArn) {
              toDisableStandardArns.push(existingEnabledStandard.StandardsSubscriptionArn);
            }
          }
        }
      }
    }
  }

  return { toEnableStandardRequests: toEnableStandardRequests, toDisableStandardArns: toDisableStandardArns };
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Function to get list of controls for a given standards controls
 * @param client {@link SecurityHubClient}
 * @param standardsSubscriptionArn string
 * @returns standardsControl {@link StandardsControl}[]
 */
async function getDescribeStandardsControls(
  client: SecurityHubClient,
  standardsSubscriptionArn: string,
): Promise<StandardsControl[]> {
  const controls: StandardsControl[] = [];
  const paginator = paginateDescribeStandardsControls(
    { client },
    {
      StandardsSubscriptionArn: standardsSubscriptionArn,
    },
  );

  for await (const page of paginator) {
    if (page.Controls) {
      controls.push(...page.Controls);
    }
  }

  return controls;
}
