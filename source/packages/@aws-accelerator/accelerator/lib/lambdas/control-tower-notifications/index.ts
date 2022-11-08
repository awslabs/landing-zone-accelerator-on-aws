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
import { SSMClient, PutParameterCommand, PutParameterCommandInput } from '@aws-sdk/client-ssm';

const driftParameterName: string = process.env['DRIFT_PARAMETER_NAME'] ?? '';
const driftMessageParameterName: string = process.env['DRIFT_MESSAGE_PARAMETER_NAME'] ?? '';
const solutionId: string = process.env['SOLUTION_ID'] ?? '';

const ssmClient = new SSMClient({ customUserAgent: solutionId });
/**
 * Control Tower Notifications - lambda handler
 *
 * @param event
 * @returns
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<void> {
  console.log(JSON.stringify(event));
  console.log(event['Records']);

  const snsMessage = JSON.parse(event['Records'][0]['Sns']['Message']);
  console.log('Message:', snsMessage['Message']);
  console.log('DriftType', snsMessage['DriftType']);
  const driftType = snsMessage['DriftType'] ?? 'Not available. Check the Control Tower console.';
  const driftMessage = snsMessage['Message'] ?? 'Message not found in Control Tower notification.  Check Console.';
  switch (driftType) {
    case 'ACCOUNT_MOVED_BETWEEN_OUS':
    case 'ACCOUNT_REMOVED_FROM_ORGANIZATION':
    case 'SCP_DETACHED_FROM_OU':
    case 'OrganizationalUnitDeleted':
      console.log('Setting drift detected');
      await setDriftDetected(driftMessage);
      break;
    case 'AccountAddedToOrganization':
    case 'ServiceControlPolicyUpdated':
    case 'SCP_ATTACHED_TO_OU':
      console.log('No action taken');
      return;
  }
}

async function setDriftDetected(driftMessage: string): Promise<void> {
  const driftDetectedParams: PutParameterCommandInput = {
    Name: driftParameterName,
    Overwrite: true,
    Value: 'true',
  };
  const driftDetectedResponse = await throttlingBackOff(() =>
    ssmClient.send(new PutParameterCommand(driftDetectedParams)),
  );
  console.log(driftDetectedResponse);

  const driftMessageParams: PutParameterCommandInput = {
    Name: driftMessageParameterName,
    Overwrite: true,
    Value: driftMessage,
  };
  const driftMessageResponse = await throttlingBackOff(() =>
    ssmClient.send(new PutParameterCommand(driftMessageParams)),
  );
  console.log(driftMessageResponse);
}
