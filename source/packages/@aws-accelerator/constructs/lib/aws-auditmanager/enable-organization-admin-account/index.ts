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

import {
  AccountStatus,
  AuditManagerClient,
  DeregisterOrganizationAdminAccountCommand,
  GetAccountStatusCommand,
  GetOrganizationAdminAccountCommand,
  GetSettingsCommand,
  RegisterAccountCommand,
  RegisterOrganizationAdminAccountCommand,
  SettingAttribute,
  Settings,
  UpdateSettingsCommand,
} from '@aws-sdk/client-auditmanager';

import {
  EnableAWSServiceAccessCommand,
  ListAWSServiceAccessForOrganizationCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * enable-auditmanager - lambda handler
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
  const managementAccountId = event.ResourceProperties['managementAccountId'];
  const region = event.ResourceProperties['region'];
  const newAdminAccountId: string = event.ResourceProperties['adminAccountId'];
  const kmsKeyArn: string | undefined = event.ResourceProperties['kmsKeyArn'] ?? undefined;
  const solutionId = event.ResourceProperties['solutionId'];

  const client: AuditManagerClient = new AuditManagerClient({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  const auditManagerEnabled = await isAuditManagerEnabled(client);
  const existingAdminAccountId = await getOrganizationAdminAccountId(client, auditManagerEnabled);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await enableAuditManagerServiceAccess(region);

      if (!auditManagerEnabled) {
        console.log(
          `Audit manager is not enabled in the account, register account command will be executed to config delegated admin account to Setting delegated admin account to ${newAdminAccountId}`,
        );
        await registerAuditManager(client, newAdminAccountId, kmsKeyArn);
      } else {
        console.log(
          `Audit manager is already enabled in the account, if required update delegated admin account to ${newAdminAccountId}`,
        );
        // update delegated admin account id
        await changeDelegatedAdminAccountId(client, managementAccountId, newAdminAccountId, existingAdminAccountId);

        // update settings (kms key arn)
        await updateSettings(client, { kmsKey: kmsKeyArn });
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Function to get Organization Admin account
 * @param client {@link AuditManagerClient}
 * @param auditManagerEnabled boolean
 * @returns accountId string | undefined
 */
async function getOrganizationAdminAccountId(
  client: AuditManagerClient,
  auditManagerEnabled: boolean,
): Promise<string | undefined> {
  if (!auditManagerEnabled) {
    return undefined;
  }
  const response = await throttlingBackOff(() => client.send(new GetOrganizationAdminAccountCommand({})));
  return response.adminAccountId;
}

/**
 * Function to check if Audit Manager is enabled
 * @param client {@link AuditManagerClient}
 * @returns status boolean
 */
async function isAuditManagerEnabled(client: AuditManagerClient): Promise<boolean> {
  const response = await throttlingBackOff(() => client.send(new GetAccountStatusCommand({})));
  console.log(response);
  const status = response.status;

  if (status === AccountStatus.INACTIVE) {
    return false;
  }
  return true;
}

/**
 * Function to get Audit manager settings
 * @param client {@link AuditManagerClient}
 * @returns settings {@link Settings} | undefined
 */
async function getAuditManagerSettings(client: AuditManagerClient): Promise<Settings | undefined> {
  const response = await throttlingBackOff(() =>
    client.send(new GetSettingsCommand({ attribute: SettingAttribute.ALL })),
  );
  return response.settings;
}

/**
 * Function to update Audit manager settings
 * @param client {@link AuditManagerClient}
 * @param newSettings {@link Settings}
 */
async function updateSettings(client: AuditManagerClient, newSettings: Settings): Promise<void> {
  const existingSettings = await getAuditManagerSettings(client);
  const newKmsKey = newSettings.kmsKey ?? 'DEFAULT';

  if (existingSettings?.kmsKey !== newKmsKey) {
    console.log(
      `Existing kms key ${existingSettings?.kmsKey} is different from new kms key ${newKmsKey}, updating settings to set kms key`,
    );
    await throttlingBackOff(() =>
      client.send(
        new UpdateSettingsCommand({
          kmsKey: newKmsKey,
        }),
      ),
    );
  } else {
    console.warn(
      `Existing kms key ${existingSettings?.kmsKey} is same as new kms key ${newKmsKey}, no changes in encryption key required`,
    );
  }
}

/**
 * Function to change delegated admin account id
 *
 * @description
 * 1. This function ensures admin account id is not set to management account.
 * 2. This function ensures admin account id is not set to same account as delegated admin account.
 *
 * @param client {@link AuditManagerClient}
 * @param managementAccountId string
 * @param newAdminAccountId string
 * @param existingAdminAccountId string | undefined
 */
async function changeDelegatedAdminAccountId(
  client: AuditManagerClient,
  managementAccountId: string,
  newAdminAccountId: string,
  existingAdminAccountId?: string,
): Promise<void> {
  if (newAdminAccountId === managementAccountId) {
    console.log(
      `You cannot register management account/yourself as delegated administrator for your organization, requested admin account id ${newAdminAccountId} is same as management account id.`,
    );
    throw new Error(
      `You cannot register management account/yourself as delegated administrator for your organization.`,
    );
  }

  if (newAdminAccountId === existingAdminAccountId) {
    console.warn(
      `Existing delegated admin account ${existingAdminAccountId} is same as new delegated admin account ${newAdminAccountId}, no changes in delegated admin account required`,
    );
    return;
  }

  if (existingAdminAccountId !== newAdminAccountId && existingAdminAccountId) {
    console.warn(
      `Existing admin account id ${existingAdminAccountId} is different from requested new admin account id ${newAdminAccountId}. LZA will remove existing delegated admin account for Audit manager to set the new delegated admin account.`,
    );
    await throttlingBackOff(() =>
      client.send(new DeregisterOrganizationAdminAccountCommand({ adminAccountId: existingAdminAccountId })),
    );
  }

  console.log(`Setting delegated admin account to ${newAdminAccountId} from ${existingAdminAccountId}`);
  await throttlingBackOff(() =>
    client.send(new RegisterOrganizationAdminAccountCommand({ adminAccountId: newAdminAccountId })),
  );
}

/**
 * Function to check if Audit Manager service access is enabled
 * @param client {@link OrganizationsClient}
 * @param serviceName string
 * @returns status boolean
 */
async function isAuditManagerServiceAccessEnabled(client: OrganizationsClient, serviceName: string): Promise<boolean> {
  const response = await throttlingBackOff(() => client.send(new ListAWSServiceAccessForOrganizationCommand({})));

  const isServiceEnabled = response.EnabledServicePrincipals?.find(
    enabledServicePrincipal => enabledServicePrincipal.ServicePrincipal === serviceName,
  );

  return isServiceEnabled !== undefined;
}

/**
 * Function to enable Audit Manager service access
 * @param region string
 */
async function enableAuditManagerServiceAccess(region: string): Promise<void> {
  const serviceName = 'auditmanager.amazonaws.com';
  const client = new OrganizationsClient({ region });
  if (!(await isAuditManagerServiceAccessEnabled(client, serviceName))) {
    console.log(`Enabling Audit Manager service access for ${serviceName} service principal`);
    await throttlingBackOff(() =>
      client.send(
        new EnableAWSServiceAccessCommand({
          ServicePrincipal: serviceName,
        }),
      ),
    );
  }
}

/**
 * Function to register Audit manager with delegated admin account and encryption key
 * @param client {@link AuditManagerClient}
 * @param delegatedAdminAccount string
 * @param kmsKeyArn string | undefined
 */
async function registerAuditManager(
  client: AuditManagerClient,
  delegatedAdminAccount: string,
  kmsKeyArn?: string,
): Promise<void> {
  const kmsKey = kmsKeyArn ?? 'DEFAULT';
  console.log(
    `Registering audit manager with delegated admin account id ${delegatedAdminAccount} and kms key arn ${kmsKey}`,
  );
  await throttlingBackOff(() => client.send(new RegisterAccountCommand({ delegatedAdminAccount, kmsKey })));
}
