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
import { AssumeRoleCommand, Credentials, STSClient } from '@aws-sdk/client-sts';
import { ConfigServiceClient, PutEvaluationsCommand } from '@aws-sdk/client-config-service';
import { throttlingBackOff } from '@aws-accelerator/utils';
import { validateTransitGateway } from './test-target-functions/validate-transit-gateway';

/**
 * AWS Config custom config lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event): Promise<{
  Status: string | undefined;
  StatusCode: number | undefined;
}> {
  console.log(event);
  const resultToken = event['resultToken'];

  const ruleParameters = JSON.parse(event['ruleParameters']);

  const configRegion = ruleParameters['awsConfigRegion'];
  const test = ruleParameters['test'];

  const managementCrossAccountRoleName = ruleParameters['managementAccount']['crossAccountRoleName'];
  const partition = ruleParameters['managementAccount']['partition'];
  const managementAccountId = ruleParameters['managementAccount']['id'];
  const managementAccountRoleName = ruleParameters['managementAccount']['roleName'];

  const invokingEvent = JSON.parse(event['invokingEvent']);
  const invokingAwsAccountId = invokingEvent['awsAccountId'];

  const stsClient = new STSClient({});
  let managementAccountCredential: Credentials;

  // Create management account credential when invoking account is not management account
  if (invokingAwsAccountId !== managementAccountId) {
    const roleArn = `arn:${partition}:iam::${managementAccountId}:role/${managementAccountRoleName}`;
    const response = await throttlingBackOff(() =>
      stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'acceleratorAssumeRoleSession' })),
    );
    managementAccountCredential = response.Credentials!;
  } else {
    const credentials = await stsClient.config.credentials();
    managementAccountCredential = {
      AccessKeyId: credentials.accessKeyId,
      SecretAccessKey: credentials.secretAccessKey,
      SessionToken: credentials.sessionToken,
      Expiration: credentials.expiration,
    };
  }

  let response;

  if (test['suite'] === 'network') {
    if (test['testTarget'] === 'validateTransitGateway') {
      response = await validateTransitGateway(
        configRegion,
        {
          partition: partition,
          id: managementAccountId,
          crossAccountRoleName: managementCrossAccountRoleName,
          credential: managementAccountCredential,
        },
        test['parameters'],
      );
    }
  }

  if (response) {
    await putEvaluations(configRegion, resultToken, response);
  }
  return { Status: 'Success', StatusCode: 200 };
}

/**
 * Function to config custom rule put evaluation
 * @param configRegion
 * @param resultToken
 * @param result
 */
async function putEvaluations(
  // configServiceClient: ConfigServiceClient,
  configRegion: string,
  resultToken: string,
  result: { complianceResourceType: string; complianceResourceId: string; complianceType: string },
): Promise<void> {
  //Put Evaluation
  const configServiceClient = new ConfigServiceClient({ region: configRegion });
  await throttlingBackOff(() =>
    configServiceClient.send(
      new PutEvaluationsCommand({
        Evaluations: [
          {
            Annotation: 'Verified by custom lambda function',
            ComplianceResourceId: result.complianceResourceId,
            ComplianceResourceType: result.complianceResourceType,
            ComplianceType: result.complianceType,
            OrderingTimestamp: new Date(),
          },
        ],
        ResultToken: resultToken,
      }),
    ),
  );
}
