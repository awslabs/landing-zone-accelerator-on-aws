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
AWS.config.logger = console;

/**
 * enable-auditmanager - lambda handler
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
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const kmsKeyArn = event.ResourceProperties['kmsKeyArn'];
  const solutionId = event.ResourceProperties['solutionId'];

  const auditManagerClient = new AWS.AuditManager({ region: region, customUserAgent: solutionId });

  const auditManagerAdminAccount = await isAuditManagerEnable(auditManagerClient);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (auditManagerAdminAccount.accountId === adminAccountId) {
        console.warn(
          `GuardDuty admin account ${auditManagerAdminAccount.accountId} is already an admin account, in ${region} region. No action needed`,
        );
        return { Status: 'Success', StatusCode: 200 };
      } else {
        console.log(
          `Started enableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
        );
        await throttlingBackOff(() =>
          auditManagerClient.registerAccount({ delegatedAdminAccount: adminAccountId, kmsKey: kmsKeyArn }).promise(),
        );
        await throttlingBackOff(() =>
          auditManagerClient.registerOrganizationAdminAccount({ adminAccountId: adminAccountId }).promise(),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log(auditManagerAdminAccount.accountId);
      if (auditManagerAdminAccount.accountId) {
        if (auditManagerAdminAccount.accountId === adminAccountId) {
          console.log(
            `Started disableOrganizationAdminAccount function in ${event.ResourceProperties['region']} region for account ${adminAccountId}`,
          );
          await throttlingBackOff(() =>
            auditManagerClient
              .deregisterOrganizationAdminAccount({
                adminAccountId: adminAccountId,
              })
              .promise(),
          );
          await throttlingBackOff(() => auditManagerClient.deregisterAccount().promise());
        }
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isAuditManagerEnable(auditManagerClient: AWS.AuditManager): Promise<{ accountId: string | undefined }> {
  try {
    const response = await throttlingBackOff(() => auditManagerClient.getOrganizationAdminAccount().promise());
    const adminAccount = response.adminAccountId;

    if (adminAccount === undefined) {
      return { accountId: undefined };
    }
    return { accountId: adminAccount };
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.code === 'AccessDeniedException') {
      console.log('Admin account not enabled');
      return { accountId: undefined };
    } else {
      throw error;
    }
  }
}
