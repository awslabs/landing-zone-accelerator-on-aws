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

import { throttlingBackOff } from '@aws-accelerator/utils';

AWS.config.logger = console;

/**
 * get ssm parameter custom control
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
  const parameterRegion = event.ResourceProperties['parameterRegion'];
  const invokingAccountID = event.ResourceProperties['invokingAccountID'];
  const parameterAccountID = event.ResourceProperties['parameterAccountID'];
  const assumeRoleArn = event.ResourceProperties['assumeRoleArn'];
  const parameterName = event.ResourceProperties['parameterName'];
  const solutionId = process.env['SOLUTION_ID'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let ssmClient: AWS.SSM;
      if (invokingAccountID !== parameterAccountID) {
        const stsClient = new AWS.STS({ region: parameterRegion, customUserAgent: solutionId });
        const assumeRoleCredential = await throttlingBackOff(() =>
          stsClient
            .assumeRole({
              RoleArn: assumeRoleArn,
              RoleSessionName: 'acceleratorAssumeRoleSession',
            })
            .promise(),
        );
        ssmClient = new AWS.SSM({
          region: parameterRegion,
          credentials: {
            accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
            secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
            sessionToken: assumeRoleCredential.Credentials!.SessionToken,
            expireTime: assumeRoleCredential.Credentials!.Expiration,
          },
          customUserAgent: solutionId,
        });
      } else {
        ssmClient = new AWS.SSM({ region: parameterRegion, customUserAgent: solutionId });
      }

      const response = await throttlingBackOff(() => ssmClient.getParameter({ Name: parameterName }).promise());

      return { PhysicalResourceId: response.Parameter!.Value, Status: 'SUCCESS' };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: undefined,
        Status: 'SUCCESS',
      };
  }
}
