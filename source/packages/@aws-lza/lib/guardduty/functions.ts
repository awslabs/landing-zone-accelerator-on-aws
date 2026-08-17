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
  AdminAccount,
  CreateDetectorCommand,
  DeleteDetectorCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  paginateListOrganizationAdminAccounts,
} from '@aws-sdk/client-guardduty';
import { InvalidInputException, OrganizationsClient } from '@aws-sdk/client-organizations';
import { createLogger } from '../common/logger';
import path from 'node:path';
import { executeApi, setRetryStrategy } from '../common/utility';
import { getDelegatedAdministratorAccountId } from '../common/organizations-functions';
import { MODULE_EXCEPTIONS, OrderedAccountListType } from '../common/types';
import { AssumeRoleCredentialType } from '../common/interfaces';
import { IGuardDutyFeatureFlags, IGuardDutyProtectionsConfiguration } from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

const GUARDDUTY_SERVICE_PRINCIPAL = 'guardduty.amazonaws.com';

/**
 * Lists all organization admin accounts for GuardDuty
 * @param client - GuardDuty client instance
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to array of admin accounts
 */
export async function listAdminAccounts(client: GuardDutyClient, logPrefix: string): Promise<AdminAccount[]> {
  const adminAccounts: AdminAccount[] = [];
  const commandName = 'paginateListOrganizationAdminAccounts';
  const parameters = {};
  logger.commandExecution(commandName, parameters, logPrefix);
  const paginator = paginateListOrganizationAdminAccounts({ client }, parameters);
  for await (const page of paginator) {
    adminAccounts.push(...(page.AdminAccounts ?? []));
  }
  logger.commandSuccess(commandName, parameters, logPrefix);
  return adminAccounts;
}

/**
 * Retrieves the current organization admin account ID for GuardDuty
 * @param client - GuardDuty client instance
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to current admin account ID or undefined
 * @throws Error if multiple enabled admin accounts are found
 */
export async function getOrganizationAdminAccountId(
  client: GuardDutyClient,
  logPrefix: string,
): Promise<string | undefined> {
  const adminAccounts = await listAdminAccounts(client, logPrefix);
  const enabledAccounts = adminAccounts
    .map(account => account.AdminAccountId)
    .filter((id): id is string => id !== undefined);
  if (enabledAccounts.length > 1) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Found multiple enabled GuardDuty admin accounts: ${enabledAccounts.join(', ')}`,
    );
  }
  if (enabledAccounts.length === 0) {
    return undefined;
  }
  return enabledAccounts[0];
}

/**
 * Gets the detector Id for GuardDuty
 * @param client - GuardDutyClient
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to the detector ID or undefined if no detector exists
 * @throws Error if multiple detectors are found (SERVICE_EXCEPTION)
 */
export async function getDetectorId(client: GuardDutyClient, logPrefix: string): Promise<string | undefined> {
  const commandName = 'ListDetectorsCommand';

  const response = await executeApi(
    commandName,
    {},
    () => client.send(new ListDetectorsCommand({})),
    logger,
    logPrefix,
  );

  if (!response.DetectorIds || response.DetectorIds.length === 0) {
    return undefined;
  }

  if (response.DetectorIds.length > 1) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Expected 1 detector ID but found ${response.DetectorIds.length}`,
    );
  }

  return response.DetectorIds[0];
}

/**
 * Creates a new GuardDuty detector with detection enabled
 * @param client - GuardDuty client instance
 * @param dryRun - When true, logs the operation without creating the detector
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to the new detector ID, or undefined if dryRun is true
 */
export async function createDetector(
  client: GuardDutyClient,
  dryRun: boolean,
  logPrefix: string,
): Promise<string | undefined> {
  const commandName = 'CreateDetectorCommand';
  const parameters = {
    Enable: true,
  };

  if (dryRun) {
    logger.dryRun(commandName, parameters, logPrefix);
    return;
  } else {
    const response = await executeApi(
      commandName,
      parameters,
      () => client.send(new CreateDetectorCommand(parameters)),
      logger,
      logPrefix,
    );
    return response.DetectorId;
  }
}

/**
 * Deletes the specified detector ID for GuardDuty
 * @param client - GuardDutyClient
 * @param detectorId - Detector ID to be deleted
 * @param dryRun - When true, logs the operation without deleting the detector
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving when deletion is completed
 */
export async function deleteDetectorId(
  client: GuardDutyClient,
  detectorId: string,
  dryRun: boolean,
  logPrefix: string,
): Promise<void> {
  const commandName = 'DeleteDetectorCommand';
  const parameters = { DetectorId: detectorId };
  if (dryRun) {
    logger.dryRun(commandName, parameters, logPrefix);
  } else {
    await executeApi(
      commandName,
      parameters,
      () => client.send(new DeleteDetectorCommand(parameters)),
      logger,
      logPrefix,
    );
  }
}

/**
 * Takes in GuardDuty protections configuration and returns a feature map specifying which protections to enable
 * @param region - AWS region the protections will be enabled in
 * @param logPrefix - Prefix for logging messages
 * @param config - GuardDuty protections configuration
 * @returns {@link IGuardDutyFeatureFlags}
 */
export function getFeaturesToEnable(
  region: string,
  logPrefix: string,
  config?: IGuardDutyProtectionsConfiguration,
): IGuardDutyFeatureFlags {
  // Retrieve values from config, defaulting to false if not defined
  const returnFlags: IGuardDutyFeatureFlags = {
    s3DataEvents: config?.s3Protection.enable,
    eksProtection: config?.eksProtection?.enable ?? false,
    eksAgent: config?.eksProtection?.manageAgent ?? false,
    ec2Protection: config?.ec2Protection?.enable ?? false,
    rdsProtection: config?.rdsProtection?.enable ?? false,
    lambdaProtection: config?.lambdaProtection?.enable ?? false,
  };

  // If the region is in the excluded regions list, disable
  if (config?.s3Protection.excludedRegions?.includes(region)) {
    logger.info(`S3 Protection disabled for region ${region} as it is in the excluded regions list`, logPrefix);
    returnFlags.s3DataEvents = false;
  }
  if (config?.eksProtection?.excludedRegions?.includes(region)) {
    logger.info(`EKS Protection disabled for region ${region} as it is in the excluded regions list`, logPrefix);
    returnFlags.eksAgent = false;
    returnFlags.eksProtection = false;
  }

  if (config?.ec2Protection?.excludedRegions?.includes(region)) {
    logger.info(`EC2 Protection disabled for region ${region} as it is in the excluded regions list`, logPrefix);
    returnFlags.ec2Protection = false;
  }
  if (config?.rdsProtection?.excludedRegions?.includes(region)) {
    logger.info(`RDS Protection disabled for region ${region} as it is in the excluded regions list`, logPrefix);
    returnFlags.rdsProtection = false;
  }
  if (config?.lambdaProtection?.excludedRegions?.includes(region)) {
    logger.info(`Lambda Protection disabled for region ${region} as it is in the excluded regions list`, logPrefix);
    returnFlags.lambdaProtection = false;
  }
  return returnFlags;
}

/**
 * Deduplicates an ordered account list by removing empty groups and groups
 * whose first account ID has already been seen.
 *
 * @param orderedAccountList - Array of ordered account groups to deduplicate
 * @returns Filtered array with empty groups removed and duplicates (by first account ID) eliminated
 */
export function deduplicateOrderedAccountListType(
  orderedAccountList: OrderedAccountListType[],
): OrderedAccountListType[] {
  const seen = new Set<string>();

  return orderedAccountList.filter(accountGroup => {
    // Remove empty groups
    if (accountGroup.accounts.length === 0) {
      return false;
    }
    // Check if the account group name has been seen before
    if (seen.has(accountGroup.accounts[0].Id!)) {
      return false; // Skip duplicates
    }
    seen.add(accountGroup.accounts[0].Id!);
    return true; // Keep unique account groups
  });
}

/**
 * Checks whether Amazon GuardDuty is available in the current AWS partition.
 *
 * Uses the Organizations ListDelegatedAdministrators API with the GuardDuty service principal.
 * If the partition doesn't recognize the service principal, it returns false.
 *
 * @param props - Configuration including region, solution ID, and optional credentials
 * @param logPrefix - Logging prefix
 * @returns true if GuardDuty is available, false if the service principal is unrecognized
 * @throws Re-throws any error that is not an InvalidInputException for unrecognized service principal
 */
export async function isGuardDutyAvailableInPartition(
  props: {
    region: string;
    solutionId?: string;
    credentials?: AssumeRoleCredentialType;
  },
  logPrefix: string,
): Promise<boolean> {
  const client = new OrganizationsClient({
    region: props.region,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  try {
    await getDelegatedAdministratorAccountId(client, GUARDDUTY_SERVICE_PRINCIPAL, logPrefix);
    return true;
  } catch (error: unknown) {
    if (error instanceof InvalidInputException && error.message?.includes('unrecognized service principal')) {
      logger.info(`GuardDuty is not available in this partition: ${error.message}`, logPrefix);
      return false;
    }
    throw error;
  }
}
