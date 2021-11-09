/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as console from 'console';
import {
  BatchDisableStandardsCommand,
  BatchEnableStandardsCommand,
  EnableSecurityHubCommand,
  GetEnabledStandardsCommand,
  SecurityHubClient,
  StandardsControl,
  UpdateStandardsControlCommand,
  paginateDescribeStandards,
  paginateDescribeStandardsControls,
} from '@aws-sdk/client-securityhub';
import { StandardsSubscriptionRequests, StandardsSubscription } from 'aws-sdk/clients/securityhub';
/**
 * btch-enable-standards - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const region = event.ResourceProperties['region'];
  const inputStandards: { name: string; enable: boolean; 'controls-to-disable': string[] | undefined }[] =
    event.ResourceProperties['standards'];

  const securityHubClient = new SecurityHubClient({ region: region });

  // Get AWS defined security standards name and ARN
  const awsSecurityHubStandards: { [name: string]: string }[] = [];
  for await (const page of paginateDescribeStandards({ client: securityHubClient }, {})) {
    for (const standard of page.Standards ?? []) {
      if (standard.StandardsArn && standard.Name) {
        const securityHubStandard: { [name: string]: string } = {};
        securityHubStandard[standard.Name] = standard.StandardsArn;
        awsSecurityHubStandards.push(securityHubStandard);
      }
    }
  }

  // Enable security hub is admin account before creating delegation admin account, if this wasn't enabled by organization delegation
  await enableSecurityHub(securityHubClient);

  const standardsModificationList = await getStandardsModificationList(
    securityHubClient,
    inputStandards,
    awsSecurityHubStandards,
  );
  console.log('standardsModificationList');
  console.log(standardsModificationList);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - BatchEnableStandardsCommand');

      // When there are standards to be enable
      if (standardsModificationList.toEnableStandardRequests.length > 0) {
        console.log('to enable');
        console.log(standardsModificationList.toEnableStandardRequests);
        await throttlingBackOff(() =>
          securityHubClient.send(
            new BatchEnableStandardsCommand({
              StandardsSubscriptionRequests: standardsModificationList.toEnableStandardRequests,
            }),
          ),
        );
      }

      // When there are standards to be disable
      if (standardsModificationList.toDisableStandardArns!.length > 0) {
        console.log('to disable');
        console.log(standardsModificationList.toEnableStandardRequests);
        await throttlingBackOff(() =>
          securityHubClient.send(
            new BatchDisableStandardsCommand({
              StandardsSubscriptionArns: standardsModificationList.toDisableStandardArns,
            }),
          ),
        );
      }

      // get list of controls to modify
      const controlsToModify = await getControlArnsToModify(securityHubClient, inputStandards, awsSecurityHubStandards);

      // Enable standard controls
      for (const controArnlToModify of controlsToModify.disableStandardControlArns) {
        await throttlingBackOff(() =>
          securityHubClient.send(
            new UpdateStandardsControlCommand({
              StandardsControlArn: controArnlToModify,
              ControlStatus: 'DISABLED',
              DisabledReason: 'Control disabled by Platform Accelerator',
            }),
          ),
        );
      }

      // Disable standard controls
      for (const controArnlToModify of controlsToModify.enableStandardControlArns) {
        await throttlingBackOff(() =>
          securityHubClient.send(
            new UpdateStandardsControlCommand({
              StandardsControlArn: controArnlToModify,
              ControlStatus: 'ENABLED',
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const existingEnabledStandards = await getExistingEnabledStandards(securityHubClient);
      const subscriptionArns: string[] = [];
      existingEnabledStandards.forEach(standard => {
        subscriptionArns.push(standard.StandardsSubscriptionArn);
      });

      if (subscriptionArns.length > 0) {
        console.log('Below listed standards disable during delete');
        console.log(subscriptionArns);
        await throttlingBackOff(() =>
          securityHubClient.send(
            new BatchDisableStandardsCommand({
              StandardsSubscriptionArns: subscriptionArns,
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Function to check if security client is enable
 * @param securityHubClient
 */
async function enableSecurityHub(securityHubClient: SecurityHubClient): Promise<void> {
  try {
    console.log('inside enableSecurityHub');
    await throttlingBackOff(() =>
      securityHubClient.send(new EnableSecurityHubCommand({ EnableDefaultStandards: false })),
    );
  } catch (e) {
    if (`${e}`.includes('Account is already subscribed to Security Hub')) {
      console.warn(`Securityhub is already enabled, error message got ${e}`);
      return;
    }
    throw new Error(`SecurityHub enable issue error message - ${e}`);
  }
}

/**
 * Function to provide existing enabled standards
 * @param securityHubClient
 */
async function getExistingEnabledStandards(securityHubClient: SecurityHubClient): Promise<StandardsSubscription[]> {
  const response = await throttlingBackOff(() => securityHubClient.send(new GetEnabledStandardsCommand({})));

  // Get list of  existing enabled standards within securityhub
  const existingEnabledStandardArns: StandardsSubscription[] = [];
  response.StandardsSubscriptions!.forEach(item => {
    // if (item.StandardsStatus === StandardsStatus.READY) {
    existingEnabledStandardArns.push({
      StandardsArn: item.StandardsArn!,
      StandardsInput: item.StandardsInput!,
      StandardsStatus: item.StandardsStatus!,
      StandardsSubscriptionArn: item.StandardsSubscriptionArn!,
    });
    // }
  });

  return existingEnabledStandardArns;
}

/**
 * Function to provide list of control arns for standards to be enable or disable
 * @param securityHubClient
 * @param inputStandards
 * @param awsSecurityHubStandards
 */
async function getControlArnsToModify(
  securityHubClient: SecurityHubClient,
  inputStandards: { name: string; enable: boolean; 'controls-to-disable': string[] | undefined }[],
  awsSecurityHubStandards: { [name: string]: string }[],
): Promise<{ disableStandardControlArns: string[]; enableStandardControlArns: string[] }> {
  const existingEnabledStandards = await getExistingEnabledStandards(securityHubClient);
  const disableStandardControls: string[] = [];
  const enableStandardControls: string[] = [];

  for (const inputStandard of inputStandards) {
    if (inputStandard.enable) {
      for (const awsSecurityHubStandard of awsSecurityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          const existingEnabledStandard = existingEnabledStandards.find(
            item => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );
          if (existingEnabledStandard) {
            console.log(`Getting controls for ${existingEnabledStandard?.StandardsSubscriptionArn} subscription`);

            const standardsControl: StandardsControl[] = [];

            for await (const page of paginateDescribeStandardsControls(
              { client: securityHubClient },
              { StandardsSubscriptionArn: existingEnabledStandard?.StandardsSubscriptionArn },
            )) {
              for (const control of page.Controls ?? []) {
                standardsControl.push(control);
              }
            }

            while (standardsControl.length === 0) {
              console.warn(
                `Delaying standard control retrieval by 10000 ms for ${existingEnabledStandard?.StandardsSubscriptionArn}`,
              );
              await delay(10000);
              console.warn(`Rechecking - Getting controls for ${existingEnabledStandard?.StandardsSubscriptionArn}`);
              for await (const page of paginateDescribeStandardsControls(
                { client: securityHubClient },
                { StandardsSubscriptionArn: existingEnabledStandard?.StandardsSubscriptionArn },
              )) {
                for (const control of page.Controls ?? []) {
                  standardsControl.push(control);
                }
              }
            }

            console.log(`When control list available for ${existingEnabledStandard?.StandardsSubscriptionArn}`);
            console.log(standardsControl);

            for (const control of standardsControl) {
              if (inputStandard['controls-to-disable']?.includes(control.ControlId!)) {
                console.log(control.ControlId!);
                console.log(inputStandard.name);
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
  console.log('***********');
  console.log(disableStandardControls);
  console.log(enableStandardControls);
  console.log('***********');

  return { disableStandardControlArns: disableStandardControls, enableStandardControlArns: enableStandardControls };
}

/**
 * Function to be executed before event specific action starts, this function makes the list of standards to be enable or disable based on the input
 * @param securityHubClient
 * @param inputStandards
 * @param awsSecurityHubStandards
 */
async function getStandardsModificationList(
  securityHubClient: SecurityHubClient,
  inputStandards: { name: string; enable: boolean; 'controls-to-disable': string[] | undefined }[],
  awsSecurityHubStandards: { [name: string]: string }[],
): Promise<{ toEnableStandardRequests: StandardsSubscriptionRequests; toDisableStandardArns: string[] | undefined }> {
  const existingEnabledStandards = await getExistingEnabledStandards(securityHubClient);
  const toEnableStandardRequests: StandardsSubscriptionRequests = [];
  const toDisableStandardArns: string[] | undefined = [];

  for (const inputStandard of inputStandards) {
    if (inputStandard.enable) {
      for (const awsSecurityHubStandard of awsSecurityHubStandards) {
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
      for (const awsSecurityHubStandard of awsSecurityHubStandards) {
        if (awsSecurityHubStandard[inputStandard.name]) {
          const existingEnabledStandard = existingEnabledStandards.find(
            item => item.StandardsArn === awsSecurityHubStandard[inputStandard.name],
          );

          if (existingEnabledStandard) {
            toDisableStandardArns.push(existingEnabledStandard?.StandardsSubscriptionArn);
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
