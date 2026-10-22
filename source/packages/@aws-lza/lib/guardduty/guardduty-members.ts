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
  AccountDetail,
  AutoEnableMembers,
  BadRequestException,
  CreateMembersCommand,
  DeleteMembersCommand,
  DetectorFeature,
  DetectorFeatureConfiguration,
  DisassociateMembersCommand,
  EbsSnapshotPreservation,
  FeatureAdditionalConfiguration,
  FeatureStatus,
  FindingPublishingFrequency,
  GuardDutyClient,
  OrganizationFeatureConfiguration,
  OrgFeature,
  OrgFeatureStatus,
  paginateListMembers,
  UpdateDetectorCommand,
  UpdateMalwareScanSettingsCommand,
  UpdateMemberDetectorsCommand,
  UpdateOrganizationConfigurationCommand,
} from '@aws-sdk/client-guardduty';
import path from 'node:path';
import { createLogger } from '../common/logger';
import { executeApi, waitUntil } from '../common/utility';
import { IGuardDutyFeatureFlags } from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

// GuardDuty returns this BadRequestException message when a request references a feature name that is not
// valid in the current region/partition (e.g. EKS Runtime Monitoring / RDS / Lambda in us-isob-east-1).
// Only this specific condition should trigger the S3-only fallback; any other BadRequestException (invalid
// feature/config combination, malformed parameter, invalid detector state) is a genuine error that must
// surface so it is not silently downgraded to S3-only.
const UNSUPPORTED_FEATURE_ERROR_FRAGMENT = 'provided feature names are invalid';

/**
 * Returns true only for the specific "unsupported feature in this region/partition" BadRequestException,
 * so the S3-only fallback is not applied to unrelated client-side request errors.
 */
function isUnsupportedFeatureError(error: unknown): error is BadRequestException {
  return (
    error instanceof BadRequestException &&
    (error.message ?? '').toLowerCase().includes(UNSUPPORTED_FEATURE_ERROR_FRAGMENT)
  );
}

// Budget for verifying member enrollment after CreateMembers. Member association can take several minutes
// in slower partitions (e.g. GovCloud/China) and on new installations with freshly created accounts, so the
// default 5-check (~5 min) budget is too short and caused enrollment verification to fail on the first run.
// This runs AFTER the CreateMembers settle loop below, so the two budgets are additive and must TOGETHER
// stay under the batch operation timeout (operationTimeoutMs, default 15 min / 900000 ms). ~9 checks at
// 1-minute intervals (~9 min) plus the settle loop's ~2.5 min worst case is ~11.5 min total, leaving
// headroom for API latency and additional 50-account batches. The long verification is partly redundant
// now that the settle loop already confirms CreateMembers succeeded (members are created; this only waits
// for ListMembers to observe them), so the reduced budget is safe.
const MEMBER_ENROLLMENT_RETRY_LIMIT = 9;
const MEMBER_ENROLLMENT_QUERY_INTERVAL_MINUTES = 1;

// Budget for the CreateMembers settle/retry (see createMembersWithRetry for the rationale). waitUntil
// sleeps between attempts, so this is ~2.5 min worst case (5 retries x 0.5 min). Combined with the ~9-min
// MEMBER_ENROLLMENT verification below (~11.5 min total), this stays under the batch operationTimeoutMs
// (default 15 min / 900000 ms), with margin for API latency and organizations with more than 50 accounts
// (each additional 50-account batch adds its own settle loop).
const CREATE_MEMBERS_RETRY_LIMIT = 5;
const CREATE_MEMBERS_QUERY_INTERVAL_MINUTES = 0.5;

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Abstract class for managing Amazon GuardDuty member accounts in AWS Organizations
 */
export abstract class GuardDutyMembers {
  /**
   * Enables GuardDuty for specified member accounts, disables it in pre-existing accounts
   * @param client - GuardDutyClient
   * @param enableAccounts - List of accounts to enable GuardDuty for
   * @param disableAccounts - List of accounts to disassociate and delete from GuardDuty membership
   * @param autoEnableOrgMembers - Whether or not to autoEnable GuardDuty in organization accounts
   * @param detectorId - The id of the GuardDuty detector to update
   * @param dryRun - Whether to perform a dry-run without making changes
   * @param logPrefix - Prefix for logging messages
   * @param featuresToEnable - Boolean flags specifying which GuardDuty features to enable
   * @param additionalOptions - Optional settings: export frequency, malware snapshot retention, and
   *   `ec2ProtectionConfigured` (the configured `ec2Protection.enable` value, `undefined` when EC2 protection
   *   is not configured, so check with `=== undefined`; `false` means configured-and-off) which gates
   *   UpdateMalwareScanSettings
   * @returns Promise that resolves when required actions are completed
   */
  public static async enable(
    client: GuardDutyClient,
    enableAccounts: AccountDetail[],
    disableAccounts: AccountDetail[],
    autoEnableOrgMembers: OrgFeatureStatus,
    detectorId: string,
    dryRun: boolean,
    logPrefix: string,
    featuresToEnable?: IGuardDutyFeatureFlags,
    additionalOptions?: {
      exportFrequency?: FindingPublishingFrequency;
      enableKeepMalwareSnapshots?: boolean;
      ec2ProtectionConfigured?: boolean;
    },
  ) {
    // Update Main Detector
    const mainDetectorFeatures = GuardDutyMembers.createDetectorFeatures(featuresToEnable);

    const updateDetectorParameters = {
      DetectorId: detectorId,
      Features: mainDetectorFeatures,
      Enable: true,
      FindingPublishingFrequency: additionalOptions?.exportFrequency,
    };
    if (dryRun) {
      logger.dryRun('UpdateDetectorCommand', updateDetectorParameters, logPrefix);
    } else {
      try {
        await executeApi(
          'UpdateDetectorCommand',
          updateDetectorParameters,
          () => client.send(new UpdateDetectorCommand(updateDetectorParameters)),
          logger,
          logPrefix,
        );
      } catch (error: unknown) {
        // To keep the detector true to config (drift protection), LZA sends ALL GuardDuty features on every
        // update — features the customer did not configure are sent as DISABLED, not omitted. Some feature
        // names (e.g. EKS Runtime Monitoring, RDS, Lambda) do not exist in every region/partition (e.g. LCK),
        // so GuardDuty rejects the request with "provided feature names are invalid" — even when those
        // features are DISABLED and even when the customer enabled none of them. This is therefore a
        // region/partition limitation, not a customer misconfiguration. Only that specific error triggers the
        // S3-only fallback (S3 stays enabled); any other BadRequestException (invalid feature/config
        // combination, malformed parameter, invalid detector state) is re-thrown so a genuine error is not
        // silently downgraded to S3-only.
        if (!isUnsupportedFeatureError(error)) {
          throw error;
        }
        logger.warn(
          `UpdateDetector rejected the requested feature names as invalid in this region/partition ` +
            `("${(error as BadRequestException).message}"). LZA sends all features (unconfigured ones as ` +
            `DISABLED) to stay true to config, but some feature names do not exist here, so this fails even ` +
            `when no features are enabled. Retrying with S3 protection only; other GuardDuty features are not ` +
            `configured in this region.`,
          logPrefix,
        );
        const s3OnlyParameters = {
          DetectorId: detectorId,
          Features: [GuardDutyMembers.createFeature(DetectorFeature.S3_DATA_EVENTS, featuresToEnable?.s3DataEvents)],
          Enable: true,
          FindingPublishingFrequency: additionalOptions?.exportFrequency,
        };
        await executeApi(
          'UpdateDetectorCommand',
          s3OnlyParameters,
          () => client.send(new UpdateDetectorCommand(s3OnlyParameters)),
          logger,
          logPrefix,
        );
      }
    }

    // UpdateMalwareScanSettings only configures EbsSnapshotPreservation, a sub-setting of EBS Malware
    // Protection (EC2 Protection). Only touch it when the configuration addresses EC2 protection — the same
    // "only send what is configured" rule the feature list uses. Gate on additionalOptions.ec2ProtectionConfigured
    // (the raw config value, undefined when not configured) rather than featuresToEnable.ec2Protection, which
    // is coerced to false when unconfigured and so cannot distinguish "not configured" from "configured off".
    // When EC2 protection is not configured, configuring its snapshot setting would be a no-op, so skip the
    // call entirely. This gate also keeps the call out of partitions without EBS Malware Protection (e.g. ADC)
    // for the common "not configured there" case. A configured value of false still sends it (NO_RETENTION):
    // the customer explicitly addressed the feature, so the setting is normalized. If EC2 protection IS
    // configured in a partition that does not support EBS Malware Protection, the call fails with
    // BadRequestException and the run surfaces it — that is a config error for the customer to fix (remove
    // ec2Protection for that partition), not an error LZA silently swallows.
    if (additionalOptions?.ec2ProtectionConfigured === undefined) {
      logger.info(
        'Skipping UpdateMalwareScanSettings on the delegated admin detector: EC2 protection is not configured.',
        logPrefix,
      );
    } else {
      const updateDetectorMalwareParameters = {
        DetectorId: detectorId,
        EbsSnapshotPreservation: additionalOptions?.enableKeepMalwareSnapshots
          ? EbsSnapshotPreservation.RETENTION_WITH_FINDING
          : EbsSnapshotPreservation.NO_RETENTION,
      };
      if (dryRun) {
        logger.dryRun('UpdateMalwareScanSettingsCommand', updateDetectorMalwareParameters, logPrefix);
      } else {
        await executeApi(
          'UpdateMalwareScanSettingsCommand',
          updateDetectorMalwareParameters,
          () => client.send(new UpdateMalwareScanSettingsCommand(updateDetectorMalwareParameters)),
          logger,
          logPrefix,
        );
      }
    }

    // Enable and configure GuardDuty members
    await GuardDutyMembers.enableAndConfigureMembers(
      client,
      detectorId,
      enableAccounts,
      autoEnableOrgMembers,
      logPrefix,
      dryRun,
      featuresToEnable,
      additionalOptions,
    );

    // Remove existing members listed in disable accounts
    if (disableAccounts.length > 0) {
      await GuardDutyMembers.disassociateAndDeleteMembers(
        client,
        detectorId,
        disableAccounts.map(account => account.AccountId).filter(account => account !== undefined),
        logPrefix,
        dryRun,
      );
    }

    // Verify all accounts have been removed (skip in dry-run since no changes were made)
    if (!dryRun) {
      await waitUntil(
        async () => {
          const currentAccounts = await GuardDutyMembers.getExistingMembers(client, detectorId, logPrefix);

          for (const account of disableAccounts) {
            if (!account.AccountId) {
              return false;
            }

            if (currentAccounts.includes(account.AccountId)) {
              return false;
            }
          }
          return true;
        },
        `Failed to confirm the desired membership changes occurred.`,
        logger,
        logPrefix,
      );
    }
  }

  /**
   * Disables GuardDuty for all member accounts and removes them from the organization
   * @param client - GuardDutyClient
   * @param detectorId - The id of the GuardDuty detector to update
   * @param dryRun - Whether to perform a dry-run without making changes
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when all members are removed
   */
  public static async disable(client: GuardDutyClient, detectorId: string, dryRun: boolean, logPrefix: string) {
    try {
      await GuardDutyMembers.updateOrganizationConfiguration(client, detectorId, 'NONE', logPrefix, dryRun);
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException &&
        error.message?.includes('delegated administrator account has not been enabled')
      ) {
        logger.info(`Delegated admin is no longer registered, skipping organization configuration update.`, logPrefix);
      } else {
        throw error;
      }
    }

    const existingMembers = await GuardDutyMembers.getExistingMembers(client, detectorId, logPrefix);

    await GuardDutyMembers.disassociateAndDeleteMembers(
      client,
      detectorId,
      [...existingMembers.values()],
      logPrefix,
      dryRun,
    );

    // Verify all members were removed (skip in dry-run since no changes were made)
    if (!dryRun) {
      await waitUntil(
        async () => {
          return (await GuardDutyMembers.getExistingMembers(client, detectorId, logPrefix)).length === 0;
        },
        'Failed to confirm all members were removed from GuardDuty',
        logger,
        logPrefix,
      );
    }
  }

  /**
   * Formats organization features for GuardDuty
   * @param autoEnableOrgMembers Determines how autoenable is set-up for the organization
   * @param featuresToEnable Object of boolean flags dictating which features are to be enabled
   * @returns List of organization feature configurations
   */
  private static getOrganizationFeaturesEnabled(
    autoEnableOrgMembers: OrgFeatureStatus,
    featuresToEnable?: IGuardDutyFeatureFlags,
  ): OrganizationFeatureConfiguration[] {
    const featureList: OrganizationFeatureConfiguration[] = [];
    const featureNameMap: Record<string, OrgFeature> = {
      s3DataEvents: OrgFeature.S3_DATA_EVENTS,
      auditLogs: OrgFeature.EKS_AUDIT_LOGS,
      ec2Protection: OrgFeature.EBS_MALWARE_PROTECTION,
      rdsProtection: OrgFeature.RDS_LOGIN_EVENTS,
      lambdaProtection: OrgFeature.LAMBDA_NETWORK_LOGS,
    };

    if (!featuresToEnable) {
      return featureList;
    }

    for (const [key, value] of Object.entries(featuresToEnable)) {
      // A feature the configuration does not address is left undefined upstream — omit it from the
      // organization configuration entirely rather than sending it as AutoEnable: NONE. This keeps
      // feature names the customer never configured (and that may not exist in the region/partition)
      // out of the request.
      if (value === undefined) {
        continue;
      }
      // EKS_ADDON_MANAGEMENT is emitted as additional configuration of
      // EKS_RUNTIME_MONITORING (handled with the runtimeMonitoring key), not as a feature of its own.
      if (key === 'eksAgent') {
        continue;
      }
      // Provide additional configuration for EKS Runtime Monitoring
      if (key === 'runtimeMonitoring') {
        const feature: OrganizationFeatureConfiguration = {
          AutoEnable: value ? autoEnableOrgMembers : AutoEnableMembers.NONE,
          Name: 'EKS_RUNTIME_MONITORING',
          AdditionalConfiguration: [
            {
              Name: 'EKS_ADDON_MANAGEMENT',
              AutoEnable: featuresToEnable.eksAgent ? autoEnableOrgMembers : AutoEnableMembers.NONE,
            },
          ],
        };
        featureList.push(feature);
      } else {
        featureList.push({
          AutoEnable: value ? autoEnableOrgMembers : AutoEnableMembers.NONE,
          Name: featureNameMap[key],
        });
      }
    }

    return featureList;
  }

  /**
   * Updates the given organization's GuardDuty configuration
   * @param client - GuardDutyClient
   * @param detectorId - The id of the GuardDuty detector to update
   * @param autoEnableOrgMembers - Determines autoenable settings for the organization
   * @param logPrefix - Prefix for logging messages
   * @param dryRun - Whether to perform a dry-run without making changes
   * @param features - List of features to enable
   */
  private static async updateOrganizationConfiguration(
    client: GuardDutyClient,
    detectorId: string,
    autoEnableOrgMembers: OrgFeatureStatus,
    logPrefix: string,
    dryRun: boolean,
    features?: OrganizationFeatureConfiguration[],
  ) {
    const parameters = {
      AutoEnableOrganizationMembers: autoEnableOrgMembers,
      DetectorId: detectorId,
      Features: features,
    };

    if (dryRun) {
      logger.dryRun('UpdateOrganizationConfigurationCommand', parameters, logPrefix);
      return;
    }

    try {
      await executeApi(
        'UpdateOrganizationConfigurationCommand',
        parameters,
        () => client.send(new UpdateOrganizationConfigurationCommand(parameters)),
        logger,
        logPrefix,
      );
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException &&
        error.message?.includes('do not have required AWS Organization master permission') &&
        features &&
        features.length > 0
      ) {
        logger.warn(
          `UpdateOrganizationConfigurationCommand failed with all features, retrying with S3 protection only.`,
          logPrefix,
        );
        const s3OnlyFeatures = features.filter(feat => feat.Name === 'S3_DATA_EVENTS');
        const fallbackParameters = {
          AutoEnableOrganizationMembers: autoEnableOrgMembers,
          DetectorId: detectorId,
          Features: s3OnlyFeatures.length > 0 ? s3OnlyFeatures : undefined,
        };
        await executeApi(
          'UpdateOrganizationConfigurationCommand',
          fallbackParameters,
          () => client.send(new UpdateOrganizationConfigurationCommand(fallbackParameters)),
          logger,
          logPrefix,
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Gets all current members of the GuardDuty deployment
   * @param client - GuardDutyClient
   * @param detectorId - The detector ID to query for members
   * @param logPrefix - Prefix for logging messages
   * @returns List of account IDs that are currently members
   */
  private static async getExistingMembers(
    client: GuardDutyClient,
    detectorId: string,
    logPrefix: string,
  ): Promise<string[]> {
    const existingMembers: string[] = [];

    const commandName = 'PaginateListMembers';
    const parameters = { DetectorId: detectorId };

    logger.commandExecution(commandName, parameters, logPrefix);

    const paginator = paginateListMembers({ client }, parameters);
    for await (const page of paginator) {
      for (const member of page.Members ?? []) {
        existingMembers.push(member.AccountId!);
      }
    }

    logger.commandSuccess(commandName, parameters, logPrefix);

    return existingMembers;
  }

  /**
   * Creates GuardDuty members for one batch and settles on partial failures.
   *
   * CreateMembers is a partial-success API: it returns HTTP 200 even when some or all accounts fail,
   * reporting those in UnprocessedAccounts rather than throwing. On a newly-created organization or
   * delegated admin the admin relationship may not have fully propagated yet, so the accounts come back
   * unprocessed (typically "Internal error"). We retry only the still-unprocessed accounts until they
   * clear, giving propagation time to settle — mirroring the delay the legacy custom resource got for free
   * from running admin-enable and CreateMembers in separate CloudFormation stages. If the accounts never
   * clear within the budget, waitUntil throws with the per-account reason so the real cause is surfaced
   * immediately instead of the downstream ListMembers verification timing out minutes later.
   *
   * @param client - GuardDutyClient
   * @param detectorId - The detector ID to enroll members under
   * @param accounts - The batch of accounts (max 50) to enroll
   * @param logPrefix - Prefix for logging messages
   */
  private static async createMembersWithRetry(
    client: GuardDutyClient,
    detectorId: string,
    accounts: AccountDetail[],
    logPrefix: string,
  ): Promise<void> {
    // Accounts still needing enrollment; narrowed to the unprocessed set after each attempt.
    let pendingAccounts = accounts;

    await waitUntil(
      async () => {
        const parameters = { AccountDetails: pendingAccounts, DetectorId: detectorId };
        const result = await executeApi(
          'CreateMembersCommand',
          parameters,
          () => client.send(new CreateMembersCommand(parameters)),
          logger,
          logPrefix,
        );

        const unprocessed = result.UnprocessedAccounts ?? [];
        if (unprocessed.length === 0) {
          return true;
        }

        const unprocessedDetail = unprocessed.map(account => `${account.AccountId} (${account.Result})`).join('; ');
        // Retry only the accounts that did not get processed.
        const stillPending = new Set(
          unprocessed.map(account => account.AccountId).filter((id): id is string => id !== undefined),
        );
        pendingAccounts = pendingAccounts.filter(account => account.AccountId && stillPending.has(account.AccountId));

        logger.warn(
          `GuardDuty CreateMembers left ${unprocessed.length} account(s) unprocessed: ${unprocessedDetail}. ` +
            `This is commonly transient on a newly-created organization or delegated admin whose admin ` +
            `relationship has not fully propagated yet — retrying the unprocessed account(s).`,
          logPrefix,
        );
        return false;
      },
      // Terminal message (thrown by waitUntil only if the accounts never clear within the budget). The
      // per-account reasons are logged on every attempt above; the non-transient ones (bad email, region
      // opt-in, not an org member) will never settle no matter how long we wait, so point at those.
      `GuardDuty could not enroll member account(s) via CreateMembers after retries (see the account-level ` +
        `reasons logged above). If this persists, verify that each account has a valid, unique root email, ` +
        `that GuardDuty is available and opted-in for the target region, and that the account is an active ` +
        `member of the organization.`,
      logger,
      logPrefix,
      CREATE_MEMBERS_RETRY_LIMIT,
      CREATE_MEMBERS_QUERY_INTERVAL_MINUTES,
    );
  }

  /**
   * For every account, will enable within GuardDuty then configure what GuardDuty features are enabled
   *
   * @param client - GuardDutyClient
   * @param detectorId - The detector ID to enable members for
   * @param enableAccounts - List of accounts to enable GuardDuty for
   * @param autoEnableOrgMembers - Whether or not to autoEnable GuardDuty in organization accounts
   * @param logPrefix - Prefix for logging messages
   * @param dryRun - Whether to perform a dry-run without making changes
   * @param featuresToEnable - Boolean flags specifying which GuardDuty features to enable {@link IGuardDutyFeatureFlags}
   * @param additionalOptions - Additional configuration options for GuardDuty
   * @returns Promise that resolves when all members are created and configured
   */
  private static async enableAndConfigureMembers(
    client: GuardDutyClient,
    detectorId: string,
    enableAccounts: AccountDetail[],
    autoEnableOrgMembers: OrgFeatureStatus,
    logPrefix: string,
    dryRun: boolean,
    featuresToEnable?: IGuardDutyFeatureFlags,
    additionalOptions?: {
      exportFrequency?: FindingPublishingFrequency;
      enableKeepMalwareSnapshots?: boolean;
      ec2ProtectionConfigured?: boolean;
    },
  ) {
    const features = GuardDutyMembers.getOrganizationFeaturesEnabled(autoEnableOrgMembers, featuresToEnable);

    await GuardDutyMembers.updateOrganizationConfiguration(
      client,
      detectorId,
      autoEnableOrgMembers,
      logPrefix,
      dryRun,
      features,
    );

    const batchedAccounts = chunkArray(enableAccounts, 50);

    // Create new members in batches of 50
    for (const accounts of batchedAccounts) {
      if (dryRun) {
        logger.dryRun('CreateMembersCommand', { AccountDetails: accounts, DetectorId: detectorId }, logPrefix);
        continue;
      }
      await GuardDutyMembers.createMembersWithRetry(client, detectorId, accounts, logPrefix);
    }

    // Verify all accounts were enrolled (skip in dry-run since no members were actually created)
    if (!dryRun) {
      await waitUntil(
        async () => {
          const currentAccounts = await GuardDutyMembers.getExistingMembers(client, detectorId, logPrefix);

          for (const account of enableAccounts) {
            if (!currentAccounts.includes(account.AccountId!)) {
              return false;
            }
          }
          return true;
        },
        'Could not verify all accounts were enrolled in GuardDuty',
        logger,
        logPrefix,
        MEMBER_ENROLLMENT_RETRY_LIMIT,
        MEMBER_ENROLLMENT_QUERY_INTERVAL_MINUTES,
      );
    }

    // Configure members
    const memberFeatures = GuardDutyMembers.createDetectorFeatures(featuresToEnable);

    for (const accounts of batchedAccounts) {
      const accountIds = accounts
        .map((account: AccountDetail) => account.AccountId)
        .filter((accountId: string | undefined): accountId is string => accountId !== undefined);
      const parameters = {
        DetectorId: detectorId,
        AccountIds: accountIds,
        Features: memberFeatures,
      };
      if (dryRun) {
        logger.dryRun('UpdateMemberDetectorsCommand', parameters, logPrefix);
      } else {
        try {
          await executeApi(
            'UpdateMemberDetectorsCommand',
            parameters,
            () => client.send(new UpdateMemberDetectorsCommand(parameters)),
            logger,
            logPrefix,
          );
        } catch (error: unknown) {
          // Mirror the main-detector fallback: LZA sends all features (unconfigured ones as DISABLED) to stay
          // true to config, but some feature names do not exist in every region/partition (e.g. LCK), so
          // GuardDuty returns "provided feature names are invalid" even when no features are enabled — a
          // region/partition limitation, not a misconfiguration. Only that specific error triggers the S3-only
          // retry; any other BadRequestException is re-thrown so a genuine error is not silently downgraded.
          if (!isUnsupportedFeatureError(error)) {
            throw error;
          }
          logger.warn(
            `UpdateMemberDetectors rejected the requested feature names as invalid in this region/partition ` +
              `("${(error as BadRequestException).message}"). LZA sends all features (unconfigured ones as ` +
              `DISABLED) to stay true to config, but some feature names do not exist here, so this fails even ` +
              `when no features are enabled. Retrying with S3 protection only; other GuardDuty features are not ` +
              `configured for members in this region.`,
            logPrefix,
          );
          const s3OnlyParameters = {
            DetectorId: detectorId,
            AccountIds: accountIds,
            Features: [GuardDutyMembers.createFeature(DetectorFeature.S3_DATA_EVENTS, featuresToEnable?.s3DataEvents)],
          };
          await executeApi(
            'UpdateMemberDetectorsCommand',
            s3OnlyParameters,
            () => client.send(new UpdateMemberDetectorsCommand(s3OnlyParameters)),
            logger,
            logPrefix,
          );
        }
      }
    }

    // Update malware scan settings
    // See enable(): gate on additionalOptions.ec2ProtectionConfigured (undefined = EC2 protection not
    // configured) so the call is skipped when EC2 protection is not configured. A configured value of false
    // still sends it (NO_RETENTION). If EC2 protection is configured in a partition without EBS Malware
    // Protection, the call fails with BadRequestException and the run surfaces it as a config error to fix.
    if (additionalOptions?.ec2ProtectionConfigured === undefined) {
      logger.info(
        'Skipping UpdateMalwareScanSettings for member detectors: EC2 protection is not configured.',
        logPrefix,
      );
    } else {
      const parameters = {
        DetectorId: detectorId,
        EbsSnapshotPreservation: additionalOptions?.enableKeepMalwareSnapshots
          ? EbsSnapshotPreservation.RETENTION_WITH_FINDING
          : EbsSnapshotPreservation.NO_RETENTION,
      };
      if (dryRun) {
        logger.dryRun('UpdateMalwareScanSettingsCommand', parameters, logPrefix);
      } else {
        await executeApi(
          'UpdateMalwareScanSettingsCommand',
          parameters,
          () => client.send(new UpdateMalwareScanSettingsCommand(parameters)),
          logger,
          logPrefix,
        );
      }
    }
  }

  private static createDetectorFeatures(featuresToEnable?: IGuardDutyFeatureFlags): DetectorFeatureConfiguration[] {
    const addFeatures: DetectorFeatureConfiguration[] = [];

    // Only emit features the configuration actually addresses (defined flags). A feature left
    // undefined (not in config) is omitted from the request entirely rather than sent as DISABLED,
    // so unconfigured feature names that may not exist in the region/partition are never sent.
    // EKS Runtime Monitoring is gated solely on runtimeMonitoring (matching the organization path):
    // EKS_ADDON_MANAGEMENT is an additional configuration of EKS_RUNTIME_MONITORING, so when runtime
    // monitoring is not configured the whole feature — and the addon — is omitted. The addon status
    // follows the agent (manageAgent) flag only when the runtime feature is emitted.
    if (featuresToEnable?.runtimeMonitoring !== undefined) {
      const eksRuntimeFeature = GuardDutyMembers.createFeature(
        DetectorFeature.EKS_RUNTIME_MONITORING,
        featuresToEnable.runtimeMonitoring,
      );
      eksRuntimeFeature.AdditionalConfiguration = [
        {
          Name: FeatureAdditionalConfiguration.EKS_ADDON_MANAGEMENT,
          Status: featuresToEnable?.eksAgent ? FeatureStatus.ENABLED : FeatureStatus.DISABLED,
        },
      ];
      addFeatures.push(eksRuntimeFeature);
    }

    if (featuresToEnable?.auditLogs !== undefined) {
      addFeatures.push(GuardDutyMembers.createFeature(DetectorFeature.EKS_AUDIT_LOGS, featuresToEnable.auditLogs));
    }
    if (featuresToEnable?.s3DataEvents !== undefined) {
      addFeatures.push(GuardDutyMembers.createFeature(DetectorFeature.S3_DATA_EVENTS, featuresToEnable.s3DataEvents));
    }
    if (featuresToEnable?.ec2Protection !== undefined) {
      addFeatures.push(
        GuardDutyMembers.createFeature(DetectorFeature.EBS_MALWARE_PROTECTION, featuresToEnable.ec2Protection),
      );
    }
    if (featuresToEnable?.rdsProtection !== undefined) {
      addFeatures.push(
        GuardDutyMembers.createFeature(DetectorFeature.RDS_LOGIN_EVENTS, featuresToEnable.rdsProtection),
      );
    }
    if (featuresToEnable?.lambdaProtection !== undefined) {
      addFeatures.push(
        GuardDutyMembers.createFeature(DetectorFeature.LAMBDA_NETWORK_LOGS, featuresToEnable.lambdaProtection),
      );
    }

    return addFeatures;
  }

  private static createFeature(featureName: DetectorFeature, featureStatus?: boolean): DetectorFeatureConfiguration {
    return {
      Name: featureName,
      Status: featureStatus ? FeatureStatus.ENABLED : FeatureStatus.DISABLED,
    };
  }

  /**
   * Disassociates and deletes the specified member accounts from GuardDuty
   * @param client - GuardDutyClient
   * @param detectorId - The detector ID to remove members from
   * @param accountsToRemove - The list of account ID's to remove
   * @param logPrefix - Prefix for logging messages
   * @param dryRun - Whether or not to perform a dry-run without making changes
   */
  private static async disassociateAndDeleteMembers(
    client: GuardDutyClient,
    detectorId: string,
    accountsToRemove: string[],
    logPrefix: string,
    dryRun: boolean,
  ) {
    const chunkedAccountsForDelete = chunkArray(accountsToRemove, 50);

    for (const existingMemberAccountIdBatch of chunkedAccountsForDelete) {
      const parameters = { AccountIds: existingMemberAccountIdBatch, DetectorId: detectorId };
      if (dryRun) {
        logger.dryRun('DisassociateMembersCommand', parameters, logPrefix);
        logger.dryRun('DeleteMembersCommand', parameters, logPrefix);
      } else {
        await executeApi(
          'DisassociateMembersCommand',
          parameters,
          () => client.send(new DisassociateMembersCommand(parameters)),
          logger,
          logPrefix,
        );

        await executeApi(
          'DeleteMembersCommand',
          parameters,
          () => client.send(new DeleteMembersCommand(parameters)),
          logger,
          logPrefix,
        );
      }
    }
  }
}
