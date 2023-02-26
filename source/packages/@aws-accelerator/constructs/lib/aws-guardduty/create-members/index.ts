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
import * as AWS from 'aws-sdk';
import { GuardDuty } from 'aws-sdk';
AWS.config.logger = console;

/**
 * enable-guardduty - lambda handler
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
  const partition = event.ResourceProperties['partition'];
  const enableS3Protection: boolean = event.ResourceProperties['enableS3Protection'] === 'true';
  const enableEksProtection: boolean = event.ResourceProperties['enableEksProtection'] === 'true';
  const solutionId = process.env['SOLUTION_ID'];

  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1', customUserAgent: solutionId });
  } else if (partition === 'aws-cn') {
    organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1', customUserAgent: solutionId });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1', customUserAgent: solutionId });
  }

  const guardDutyClient = new AWS.GuardDuty({ region: region, customUserAgent: solutionId });

  const detectorId = await getDetectorId(guardDutyClient);

  let nextToken: string | undefined = undefined;

  console.log(`EnableS3Protection: ${enableS3Protection}`);
  console.log(`EnableEksProtection: ${enableEksProtection}`);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');
      const allAccounts: AWS.GuardDuty.AccountDetail[] = [];

      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.listAccounts({ NextToken: nextToken }).promise(),
        );
        for (const account of page.Accounts ?? []) {
          allAccounts.push({ AccountId: account.Id!, Email: account.Email! });
        }
        nextToken = page.NextToken;
      } while (nextToken);

      await throttlingBackOff(() =>
        guardDutyClient.createMembers({ DetectorId: detectorId!, AccountDetails: allAccounts }).promise(),
      );

      const dataSources: GuardDuty.OrganizationDataSourceConfigurations = {};
      dataSources.S3Logs = { AutoEnable: enableS3Protection };
      dataSources.Kubernetes = { AuditLogs: { AutoEnable: enableEksProtection } };

      console.log('starting - UpdateOrganizationConfiguration');
      try {
        await guardDutyClient
          .updateOrganizationConfiguration({
            AutoEnable: true,
            DetectorId: detectorId!,
            DataSources: dataSources,
          })
          .promise();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        if (
          e.statusCode == 400 &&
          e.message.startsWith('The request is rejected because an invalid or out-of-range value')
        ) {
          console.log('Retrying with only S3 protection');
          const dataSources: GuardDuty.OrganizationDataSourceConfigurations = {};
          dataSources.S3Logs = { AutoEnable: enableS3Protection };
          await guardDutyClient
            .updateOrganizationConfiguration({
              AutoEnable: true,
              DetectorId: detectorId!,
              DataSources: dataSources,
            })
            .promise();
        } else {
          console.log(`Error: ${JSON.stringify(e)}`);
          return { Status: 'Failure', StatusCode: e.statuCode };
        }
      }

      console.log('Returning Success');
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const existingMemberAccountIds: string[] = [];
      nextToken = undefined;
      do {
        const page = await throttlingBackOff(() =>
          guardDutyClient.listMembers({ DetectorId: detectorId!, NextToken: nextToken }).promise(),
        );
        for (const member of page.Members ?? []) {
          existingMemberAccountIds.push(member.AccountId!);
        }
        nextToken = page.NextToken;
      } while (nextToken);

      if (existingMemberAccountIds.length > 0) {
        await throttlingBackOff(() =>
          guardDutyClient
            .disassociateMembers({ AccountIds: existingMemberAccountIds, DetectorId: detectorId! })
            .promise(),
        );

        await throttlingBackOff(() =>
          guardDutyClient.deleteMembers({ AccountIds: existingMemberAccountIds, DetectorId: detectorId! }).promise(),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getDetectorId(guardDutyClient: AWS.GuardDuty): Promise<string | undefined> {
  const response = await throttlingBackOff(() => guardDutyClient.listDetectors({}).promise());
  console.log(response);
  return response.DetectorIds!.length === 1 ? response.DetectorIds![0] : undefined;
}
