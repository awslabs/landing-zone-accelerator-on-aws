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

/**
 * @fileoverview Amazon GuardDuty Main Module - Orchestrates complete GuardDuty setup across AWS Organizations
 *
 * Provides the main orchestration logic for Amazon GuardDuty deployment and configuration across
 * AWS Organizations. Handles multi-account, multi-region operations with proper dependency
 * management, boundary resolution, and comprehensive error handling.
 *
 * Key capabilities:
 * - Complete GuardDuty organization setup and teardown
 * - Multi-account batch processing with dependency ordering
 * - Regional boundary resolution and filtering
 * - Delegated administrator account management
 * - Member account lifecycle management
 * - Detector configuration across all accounts
 * - Findings export destination management
 * - Comprehensive response tracking and reporting
 */

import { AccountDetail, GuardDutyClient, OrgFeatureStatus } from '@aws-sdk/client-guardduty';
import { Account, OrganizationsClient } from '@aws-sdk/client-organizations';
import path from 'node:path';
import {
  AccountSetupHandler,
  ServiceOperationHandler,
  processDisableOperations,
  processEnableOperations,
} from '../common/batch-processor';
import {
  AcceleratorModuleName,
  IDelegatedAccountData,
  IDelegatedAccountResponse,
  IModuleResponse,
  IOrganizationAdminData,
  IOrganizationAdminResponse,
  IRegionOperationError,
} from '../common/interfaces';
import { createLogger } from '../common/logger';
import {
  DelegatedAdminManager,
  DelegatedAdminOperations,
  manageOrganizationsApiDelegatedAdmin,
} from '../common/security/delegated-admin-manager';
import { SecurityServiceContextBuilder } from '../common/security/security-service-context-builder';
import { SecurityServiceModuleResponseBuilder } from '../common/security/security-service-module-response-builder';
import {
  DelegatedAccountResponseHandler,
  OrganizationAdminResponseHandler,
  SecurityServiceResponseBuilder,
} from '../common/security/security-service-response-builder';
import { scopeActionsToResource } from '../common/module-session-policies';
import { getCredentials } from '../common/sts-functions';
import { ensureOrganizationsTrustedAccess } from '../common/organizations-functions';
import { MODULE_EXCEPTIONS, SecurityModuleOperationAction, SecurityModuleOperationType } from '../common/types';
import { setRetryStrategy } from '../common/utility';
import { FindingsExportConfiguration } from './findings-export-configuration';
import {
  createDetector,
  deduplicateOrderedAccountListType,
  deleteDetectorId,
  getDetectorId,
  getFeaturesToEnable,
  getOrganizationAdminAccountId,
} from './functions';
import { GuardDutyMembers } from './guardduty-members';
import {
  IGuardDutyDetectorResponse,
  IGuardDutyExportDestination,
  IGuardDutyModuleRequest,
  IGuardDutyModuleResponse,
  IGuardDutyProtectionsConfiguration,
} from './interfaces';
import { OrganizationsDelegatedAdminAccount } from './organizations-delegated-admin-account';
import { GuardDutyDetectorResponseHandler } from './response-factories';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * GuardDuty service name constant used for Organizations API calls
 */
const GUARDDUTY_SERVICE_NAME = 'guardduty.amazonaws.com';
const GUARDDUTY_MALWARE_PROTECTION_SERVICE_PRINCIPAL = 'malware-protection.guardduty.amazonaws.com';

/**
 * GuardDuty detector configuration data
 * Used by handlers to return detector setup information (data only, no operation/regions)
 */
interface IGuardDutyDetectorData {
  /** Index signature for compatibility with Record<string, unknown> */
  [key: string]: unknown;
  /** List of account IDs affected by the operation */
  accountIds: string[];
  /** Feature flags that were configured */
  protectionsConfiguration?: IGuardDutyProtectionsConfiguration;
  /** Finding publishing frequency */
  exportFrequency?: string;
  /** Export destination configuration */
  exportDestination?: IGuardDutyExportDestination;
}

/**
 * Handler operation response
 * Contains data returned by a single handler execution (one account-region)
 */
interface GuardDutyOperationResponse {
  /** Organization admin configuration data */
  organizationAdmin?: IOrganizationAdminData;
  /** Delegated admin configuration data */
  delegatedAdmin?: IDelegatedAccountData;
  /** Detector configuration data */
  detector?: IGuardDutyDetectorData;
}

/**
 * Collected response with region and account context
 */
interface CollectedGuardDutyResponse {
  region: string;
  accountId: string;
  response: GuardDutyOperationResponse;
  operation: SecurityModuleOperationAction;
}

/**
 * Builds module-specific response from collected handler responses
 * Uses SecurityServiceResponseBuilder to merge responses across regions
 *
 * @param operation - Operation type (enabled/disabled)
 * @param collectedResponses - All responses collected from handlers
 * @param logPrefix - Logging prefix for the operation
 * @returns Module response with configuration results
 */
function buildModuleResponse(
  operation: SecurityModuleOperationType,
  collectedResponses: CollectedGuardDutyResponse[],
  logPrefix: string,
): IGuardDutyModuleResponse {
  // Create response builders for each response type
  const orgAdminBuilder = new SecurityServiceResponseBuilder<IOrganizationAdminResponse>(logger);
  const delegatedAdminBuilder = new SecurityServiceResponseBuilder<IDelegatedAccountResponse>(logger);
  const detectorBuilder = new SecurityServiceResponseBuilder<IGuardDutyDetectorResponse>(logger);

  // Create response handlers (combined factory + merge strategy)
  const orgAdminHandler = new OrganizationAdminResponseHandler();
  const delegatedAdminHandler = new DelegatedAccountResponseHandler();
  const detectorHandler = new GuardDutyDetectorResponseHandler();

  // Process all collected responses
  for (const { region, response } of collectedResponses) {
    // Add organization admin responses
    if (response.organizationAdmin) {
      orgAdminBuilder.addResponse(operation, region, orgAdminHandler, response.organizationAdmin, logPrefix);
    }

    // Add delegated admin responses
    if (response.delegatedAdmin) {
      delegatedAdminBuilder.addResponse(operation, region, delegatedAdminHandler, response.delegatedAdmin, logPrefix);
    }

    // Add detector responses
    if (response.detector) {
      detectorBuilder.addResponse(operation, region, detectorHandler, response.detector, logPrefix);
    }
  }

  return {
    organizationAdminConfig: orgAdminBuilder.getResponses(),
    delegatedAdminAccountConfig: delegatedAdminBuilder.getResponses(),
    detectorConfig: detectorBuilder.getResponses(),
  };
}

/**
 * Delegated admin operations for the security service
 * Implements the DelegatedAdminOperations interface
 */
const delegatedAdminOps: DelegatedAdminOperations<GuardDutyClient> = {
  enable: async (client: GuardDutyClient, accountId: string, dryRun: boolean, logPrefix: string) => {
    await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(client, dryRun, accountId, logPrefix);
  },
  disable: async (client: GuardDutyClient, accountId: string, dryRun: boolean, logPrefix: string) => {
    await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(client, dryRun, accountId, logPrefix);
  },
  getCurrent: async (client: GuardDutyClient, logPrefix: string) => {
    return await getOrganizationAdminAccountId(client, logPrefix);
  },
};

/**
 * Main entry point for configuring Amazon GuardDuty across AWS Organizations
 * @param props - GuardDuty module request containing configuration and context
 * @returns Promise resolving to module response with operation results
 */
export async function configureGuardDuty(
  props: IGuardDutyModuleRequest,
): Promise<IModuleResponse<IGuardDutyModuleResponse>> {
  const logPrefix = `${props.invokingAccountId}:${props.region}`;
  const moduleName = props.moduleName ?? AcceleratorModuleName.AMAZON_GUARDDUTY;
  const dryRun = props.dryRun ?? false;

  // Create response collection array
  const collectedResponses: CollectedGuardDutyResponse[] = [];

  try {
    logger.processStart(`Starting ${moduleName} module`, logPrefix);
    // Build security service context
    const contextBuilder = new SecurityServiceContextBuilder(logger);
    const context = await contextBuilder.build(moduleName, props, GUARDDUTY_SERVICE_NAME, logPrefix);

    logger.info(
      `GuardDuty configuration initialized: ${context.enabledRegions.length} enabled regions, ${context.disabledRegions.length} disabled regions`,
      logPrefix,
    );

    // Manage Organizations API delegated admin globally (once per execution)
    // This must be done BEFORE regional operations to avoid race conditions
    const organizationsClient = new OrganizationsClient({
      region: props.region, // Use home region for Organizations API
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    await manageOrganizationsApiDelegatedAdmin(
      organizationsClient,
      GUARDDUTY_SERVICE_NAME,
      props.configuration.delegatedAdminAccountId,
      context.enabledRegions,
      context.disabledRegions,
      dryRun,
      logPrefix,
      logger,
    );

    // EBS Malware Protection requires Organizations trusted access. This is a global management-account
    // prerequisite, so confirm it once before regional GuardDuty operations fan out. Do not enable it when
    // EC2 Protection is disabled or excluded from every region the module will configure.
    const ec2Protection = props.configuration.protectionsConfiguration?.ec2Protection;
    const ec2ProtectionEnabledInAnyRegion =
      ec2Protection?.enable === true &&
      context.enabledRegions.some(region => !ec2Protection.excludedRegions?.includes(region));

    if (ec2ProtectionEnabledInAnyRegion) {
      await ensureOrganizationsTrustedAccess(
        organizationsClient,
        GUARDDUTY_MALWARE_PROTECTION_SERVICE_PRINCIPAL,
        dryRun,
        logPrefix,
      );
    }
    // Trusted access is only ever enabled here, never disabled. This intentionally matches the legacy
    // custom resource, which likewise never called DisableAWSServiceAccess (not on EC2 Protection removal,
    // nor on full teardown). Leaving trusted access in place when EC2 Protection is later disabled is the
    // safer choice: it is a harmless org-level grant, other tooling may rely on it, and disabling it could
    // disrupt an unrelated malware-protection consumer. Hence the module policy grants only
    // ListAWSServiceAccessForOrganization and EnableAWSServiceAccess.

    // Pass response collection array through props
    const propsWithResponses = { ...props, collectedResponses };

    // Update context with props that include collectedResponses
    const contextWithResponses = { ...context, props: propsWithResponses };

    // Execute regional operations in parallel (enable and disable target different environments)
    //
    // Enable path: Only Management and DelegatedAdmin accounts are processed directly.
    // WorkLoad accounts are intentionally excluded (slice(0, ENABLE_GROUPS_COUNT)) because
    // GuardDuty's delegated admin model manages member enrollment centrally. The CreateMembers
    // API, called from the delegated admin's enable handler, automatically enables GuardDuty
    // in all member accounts and applies the organization's auto-enable settings.
    // No per-account AssumeRole into workload accounts is needed for the enable flow.
    // See: https://docs.aws.amazon.com/guardduty/latest/APIReference/API_CreateMembers.html
    //
    // Disable path: All accounts are processed because DeleteDetector is owner-only —
    // it cannot be called cross-account from the delegated admin. Disassociating a member
    // via DeleteMembers leaves the member's detector active as a standalone account.
    // To fully disable GuardDuty, we must assume into each workload account and call
    // DeleteDetector directly.
    // See: https://docs.aws.amazon.com/guardduty/latest/ug/disassociate-remove-member-account-from-admin.html
    // See: https://docs.aws.amazon.com/guardduty/latest/APIReference/API_DeleteDetector.html
    const ENABLE_GROUPS_COUNT = 2; // Management + DelegatedAdmin (excludes WorkLoads)
    const [enableResults, disableResults] = await Promise.all([
      processEnableOperations<IGuardDutyModuleRequest, void>({
        service: context.moduleName,
        managementAccountId: context.managementAccountId,
        orderedTargetAccounts: deduplicateOrderedAccountListType(
          context.enableOrderedAccounts.slice(0, ENABLE_GROUPS_COUNT),
        ),
        targetRegions: context.enabledRegions,
        props: contextWithResponses.props,
        dryRun,
        serviceHandler: guardDutyEnableHandler,
        batchOperationSettings: context.batchOperationSettings,
        accountSetupHandler: guardDutyAccountSetup,
        organizationAccounts: context.organizationAccounts,
      }),
      processDisableOperations<IGuardDutyModuleRequest, void>({
        service: context.moduleName,
        managementAccountId: context.managementAccountId,
        orderedTargetAccounts: deduplicateOrderedAccountListType(context.disableOrderedAccounts),
        targetRegions: context.disabledRegions,
        props: contextWithResponses.props,
        dryRun,
        serviceHandler: guardDutyDisableHandler,
        batchOperationSettings: context.batchOperationSettings,

        accountSetupHandler: guardDutyAccountSetup,
        organizationAccounts: context.organizationAccounts,
      }),
    ]);

    logger.info(
      `Regional operations completed: ${enableResults.length} enable results, ${disableResults.length} disable results`,
      logPrefix,
    );

    // Perform final cleanup (if needed)
    let cleanupResults: (void | IRegionOperationError)[] = [];

    if (context.disabledRegions.length > 0) {
      const cleanupAccounts = [
        context.organizationAccounts.find(acc => acc.Id === props.configuration.delegatedAdminAccountId),
        context.organizationAccounts.find(acc => acc.Id === context.managementAccountId),
      ].filter(Boolean) as Account[];

      if (cleanupAccounts.length > 0) {
        logger.info(
          `Performing final cleanup for ${cleanupAccounts.length} accounts in ${context.disabledRegions.length} disabled regions`,
          logPrefix,
        );

        cleanupResults = await processDisableOperations<IGuardDutyModuleRequest, void>({
          service: context.moduleName,
          managementAccountId: context.managementAccountId,
          orderedTargetAccounts: [{ name: 'WorkLoads', order: 1, accounts: cleanupAccounts }],
          targetRegions: context.disabledRegions,
          props: contextWithResponses.props,
          dryRun,
          serviceHandler: guardDutyFinalCleanupHandler,
          batchOperationSettings: context.batchOperationSettings,

          accountSetupHandler: guardDutyAccountSetup,
          organizationAccounts: cleanupAccounts,
        });

        logger.info(`Final cleanup completed`, logPrefix);
      }
    }

    // Build module-specific response from collected responses
    // Separate responses by operation type
    const enableResponses = collectedResponses.filter(r => r.operation === 'enable');
    const disableResponses = collectedResponses.filter(r => r.operation === 'disable');

    // Build responses for each operation type
    const enableModuleResponse =
      enableResponses.length > 0
        ? buildModuleResponse('enabled', enableResponses, logPrefix)
        : { organizationAdminConfig: [], delegatedAdminAccountConfig: [], detectorConfig: [] };

    const disableModuleResponse =
      disableResponses.length > 0
        ? buildModuleResponse('disabled', disableResponses, logPrefix)
        : { organizationAdminConfig: [], delegatedAdminAccountConfig: [], detectorConfig: [] };

    // Merge both responses
    const guardDutyResponse: IGuardDutyModuleResponse = {
      organizationAdminConfig: [
        ...enableModuleResponse.organizationAdminConfig,
        ...disableModuleResponse.organizationAdminConfig,
      ],
      delegatedAdminAccountConfig: [
        ...enableModuleResponse.delegatedAdminAccountConfig,
        ...disableModuleResponse.delegatedAdminAccountConfig,
      ],
      detectorConfig: [...enableModuleResponse.detectorConfig, ...disableModuleResponse.detectorConfig],
    };

    // Build final module response
    const responseBuilder = new SecurityServiceModuleResponseBuilder(logger);

    const response = responseBuilder.build(
      'guardduty',
      props.operation,
      guardDutyResponse,
      [...enableResults, ...disableResults],
      cleanupResults,
      dryRun,
    );
    logger.processEnd(`Successfully completed ${moduleName} module`, logPrefix);

    return response;
  } catch (error) {
    // Handle top-level errors
    logger.error(`Error in configureGuardDuty: ${error}`, logPrefix);

    const responseBuilder = new SecurityServiceModuleResponseBuilder(logger);

    const emptyResponse: IGuardDutyModuleResponse = {
      organizationAdminConfig: [],
      delegatedAdminAccountConfig: [],
      detectorConfig: [],
    };

    const response = responseBuilder.buildErrorResponse(error, 'guardduty', props.operation, dryRun, emptyResponse);
    logger.processEnd(`${moduleName} module failed`, logPrefix);
    return response;
  }
}

/**
 * Account setup handler for cross-account credential management
 * @param targetAccount - Target AWS account for operations
 * @param managementAccountId - Management account ID
 * @param props - GuardDuty module request properties
 * @returns Promise resolving to updated props with appropriate credentials
 */
export const guardDutyAccountSetup: AccountSetupHandler<IGuardDutyModuleRequest> = async (
  targetAccount: Account,
  managementAccountId: string,
  props: IGuardDutyModuleRequest,
): Promise<IGuardDutyModuleRequest> => {
  // Use original credentials for management account
  if (targetAccount.Id === managementAccountId) {
    return props;
  }

  // The findings-export bucket ARN is only known at runtime, so s3:PutObject / s3:GetObject
  // cannot be resource-scoped in the static module policy. Narrow them here to the export
  // destination rather than leaving them on `Resource: "*"`. When findings export is not
  // configured the policy is returned unchanged.
  const destinationArn = props.configuration.exportDestination?.destinationArn;
  const sessionPolicy = props.sessionPolicy
    ? scopeActionsToResource(
        props.sessionPolicy,
        ['s3:PutObject', 's3:GetObject'],
        destinationArn ? `${destinationArn.replace(/\/+$/, '')}/*` : '',
        'GuardDutyFindingsExportObjects',
      )
    : props.sessionPolicy;

  // Assume role for target accounts (called only once per account)
  const credentials = await getCredentials({
    partition: props.partition,
    accountId: targetAccount.Id!,
    region: props.region,
    logPrefix: `Invoker:${props.region}`,
    solutionId: props.solutionId,
    assumeRoleName: props.configuration.accountAccessRoleName,
    credentials: props.credentials,
    sessionPolicy,
    requireSessionPolicy: !!sessionPolicy,
  });

  return { ...props, credentials }; // Return props with target account credentials
};

/**
 * Converts Organization Account objects to GuardDuty AccountDetail format
 * @param accounts - Organization accounts to convert
 * @param excludeAccountId - Account ID to exclude from the list
 * @returns Array of AccountDetail objects for GuardDuty API calls
 */
function toAccountDetails(
  accounts: Account[],
  excludeAccountId: string,
  boundaryAccountIds?: string[],
): AccountDetail[] {
  // When boundaryAccountIds is provided and non-empty, restrict the result to those accounts
  // (the resolved deploymentTargets allow-list). Undefined or empty means no account boundary —
  // all accounts are in scope.
  const hasBoundary = boundaryAccountIds !== undefined && boundaryAccountIds.length > 0;
  const boundarySet = hasBoundary ? new Set(boundaryAccountIds) : undefined;

  return accounts
    .filter(
      (acc): acc is Account & { Id: string; Email: string } =>
        acc.Id !== excludeAccountId && !!acc.Id && !!acc.Email && (!boundarySet || boundarySet.has(acc.Id)),
    )
    .map(acc => ({
      AccountId: acc.Id,
      Email: acc.Email,
    }));
}

/**
 * Service operation handler for enabling GuardDuty across accounts and regions
 * @param managementAccountId - Management account ID
 * @param targetAccount - Target account for the operation
 * @param targetRegion - Target region for the operation
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix for the operation
 * @param props - GuardDuty module request properties
 * @param organizationAccounts - Optional list of organization accounts
 * @returns Promise that resolves when enable operation completes
 */
export const guardDutyEnableHandler: ServiceOperationHandler<IGuardDutyModuleRequest, void> = async (
  managementAccountId: string,
  targetAccount: Account,
  targetRegion: string,
  dryRun: boolean,
  logPrefix: string,
  props: IGuardDutyModuleRequest,
  organizationAccounts?: Account[],
): Promise<void> => {
  const response = await enableService(
    targetAccount,
    targetRegion,
    managementAccountId,
    dryRun,
    logPrefix,
    props,
    organizationAccounts ?? [],
  );

  // Add response to collection array if available
  const propsWithResponses = props as IGuardDutyModuleRequest & { collectedResponses?: CollectedGuardDutyResponse[] };
  if (propsWithResponses.collectedResponses && targetAccount.Id) {
    propsWithResponses.collectedResponses.push({
      region: targetRegion,
      accountId: targetAccount.Id,
      response,
      operation: 'enable',
    });
  }
};

/**
 * Service operation handler for disabling GuardDuty across accounts and regions
 * @param managementAccountId - Management account ID
 * @param targetAccount - Target account for the operation
 * @param targetRegion - Target region for the operation
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix for the operation
 * @param props - GuardDuty module request properties
 * @param organizationAccounts - Optional list of organization accounts
 * @returns Promise that resolves when disable operation completes
 */
export const guardDutyDisableHandler: ServiceOperationHandler<IGuardDutyModuleRequest, void> = async (
  managementAccountId: string,
  targetAccount: Account,
  targetRegion: string,
  dryRun: boolean,
  logPrefix: string,
  props: IGuardDutyModuleRequest,
  organizationAccounts?: Account[],
): Promise<void> => {
  const response = await disableService(
    targetAccount,
    targetRegion,
    managementAccountId,
    dryRun,
    logPrefix,
    props,
    organizationAccounts ?? [],
  );

  // Add response to collection array if available
  const propsWithResponses = props as IGuardDutyModuleRequest & { collectedResponses?: CollectedGuardDutyResponse[] };
  if (propsWithResponses.collectedResponses && targetAccount.Id) {
    propsWithResponses.collectedResponses.push({
      region: targetRegion,
      accountId: targetAccount.Id,
      response,
      operation: 'disable',
    });
  }
};

/**
 * Final cleanup handler for disabling GuardDuty in management and delegated admin accounts
 * Deletes the detector in disabled regions for these privileged accounts after member cleanup
 * @param _managementAccountId - Management account ID (unused)
 * @param targetAccount - Target account for cleanup
 * @param targetRegion - Target region for cleanup
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix for the operation
 * @param props - GuardDuty module request properties
 * @returns Promise that resolves when cleanup completes
 */
export const guardDutyFinalCleanupHandler: ServiceOperationHandler<IGuardDutyModuleRequest, void> = async (
  _managementAccountId: string,
  targetAccount: Account,
  targetRegion: string,
  dryRun: boolean,
  logPrefix: string,
  props: IGuardDutyModuleRequest,
): Promise<void> => {
  const client = new GuardDutyClient({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  let detectorId: string | undefined;
  try {
    detectorId = await getDetectorId(client, logPrefix);
    if (!detectorId) {
      logger.info(
        `No GuardDuty detector found in ${targetRegion} for ${targetAccount.Name} account, skipping cleanup.`,
        logPrefix,
      );
      return;
    }
  } catch (err) {
    logger.error(`Error getting GuardDuty detector in ${targetRegion} for ${targetAccount.Name} account`, logPrefix);
    throw err;
  }

  if (!dryRun) {
    logger.info(
      `Cleaning up GuardDuty detector ${detectorId} in ${targetRegion} for ${targetAccount.Name} account (final cleanup).`,
      logPrefix,
    );
  }

  // Delete the findings export destination before deleting the detector
  if (props.configuration.exportDestination && props.configuration.exportDestination.overrideExisting !== false) {
    await FindingsExportConfiguration.deletePublishingDestination(
      client,
      detectorId,
      props.configuration.exportDestination.destinationType,
      dryRun,
      logPrefix,
    );
  }

  // Delete the detector to fully disable GuardDuty in this region
  await deleteDetectorId(client, detectorId, dryRun, logPrefix);
};

/**
 * Enables GuardDuty service for a specific account and region with role-based configuration
 * @param targetAccount - Target account for enablement
 * @param targetRegion - Target region for enablement
 * @param managementAccountId - Management account ID
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @param props - GuardDuty module request properties
 * @param organizationAccounts - List of organization accounts
 * @returns Promise that resolves with operation response data
 */
async function enableService(
  targetAccount: Account,
  targetRegion: string,
  managementAccountId: string,
  dryRun: boolean,
  logPrefix: string,
  props: IGuardDutyModuleRequest,
  organizationAccounts: Account[],
): Promise<GuardDutyOperationResponse> {
  const response: GuardDutyOperationResponse = {};

  const client = new GuardDutyClient({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  // GuardDuty requires a detector to exist

  let detectorId = await getDetectorId(client, logPrefix);

  if (!detectorId) {
    logger.info(
      `No GuardDuty detector found in ${targetRegion} for ${targetAccount.Name} account, attempting to create.`,
      logPrefix,
    );
    detectorId = await createDetector(client, dryRun, logPrefix);
    if (!detectorId) {
      if (dryRun) {
        // In dry-run mode, detector creation is skipped — use a placeholder to continue
        // logging downstream operations. All downstream functions (GuardDutyMembers.enable,
        // FindingsExportConfiguration, etc.) check dryRun before making API calls,
        // so this placeholder is never sent to the GuardDuty service.
        logger.info(
          `Dry run: detector would be created in ${targetRegion} for ${targetAccount.Name} account, continuing with dry-run operations.`,
          logPrefix,
        );
        detectorId = 'dry-run-detector-placeholder';
      } else {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: No GuardDuty detector found in ${targetRegion} for ${targetAccount.Name} account. Could not create new detector.`,
        );
      }
    }
  }

  // Process Management Account
  if (targetAccount.Id === managementAccountId) {
    await enableDelegatedAdminAccount(
      props,
      targetRegion,
      client,
      GUARDDUTY_SERVICE_NAME,
      managementAccountId,
      dryRun,
      logPrefix,
    );
    response.organizationAdmin = {
      managementAccountId,
      delegatedAdminAccountId: props.configuration.delegatedAdminAccountId,
    };
  }

  // Process Delegated Admin Account
  if (targetAccount.Id === props.configuration.delegatedAdminAccountId) {
    // Account boundary resolved from deploymentTargets (management + delegated admin always included by
    // the accelerator). Undefined/empty = no boundary → all organization accounts are members.
    const boundaryAccountIds = props.configuration.boundary?.accounts;

    // Members LZA should enroll = organization accounts (minus the admin itself) scoped to the boundary.
    const enableAccounts = toAccountDetails(organizationAccounts, targetAccount.Id, boundaryAccountIds);

    let disableAccounts: AccountDetail[] = [];
    if (boundaryAccountIds !== undefined && boundaryAccountIds.length > 0) {
      const enableIds = new Set(enableAccounts.map(account => account.AccountId));
      disableAccounts = toAccountDetails(organizationAccounts, targetAccount.Id).filter(
        // Never prune the management account. The accelerator always includes it in the boundary
        // (management and delegated admin are always in scope), but guard here so a non-accelerator
        // caller passing a boundary that omits it can never disassociate/delete the management account.
        // The delegated admin is already excluded via toAccountDetails(excludeAccountId=targetAccount.Id).
        account => !enableIds.has(account.AccountId) && account.AccountId !== managementAccountId,
      );

      // Fail fast on a contradictory combination before any mutating API call — but ONLY when the boundary
      // would actually prune something (disableAccounts non-empty). A boundary that already covers the whole
      // organization (e.g. deploymentTargets targeting the Root OU) prunes nothing, so autoEnableOrgMembers=
      // ALL/NEW is not contradictory there and must keep working: Root-OU targets are exempt from the
      // accelerator validator's NONE requirement and default to ALL. When the boundary IS a proper subset,
      // autoEnableOrgMembers=ALL would auto-re-enroll pruned accounts and GuardDuty rejects DisassociateMembers
      // for org members under ALL, so the prune would throw mid-run after CreateMembers already landed.
      if (disableAccounts.length > 0 && props.configuration.autoEnableOrgMembers !== OrgFeatureStatus.NONE) {
        throw new Error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: boundary.accounts (deploymentTargets) that excludes organization ` +
            `accounts requires autoEnableOrgMembers=NONE, but got ${props.configuration.autoEnableOrgMembers}. ` +
            `Pruning out-of-boundary members is incompatible with auto-enrolling all organization members.`,
        );
      }
    }

    await GuardDutyMembers.enable(
      client,
      enableAccounts,
      disableAccounts,
      props.configuration.autoEnableOrgMembers,
      detectorId,
      dryRun,
      logPrefix,
      getFeaturesToEnable(targetRegion, logPrefix, props.configuration.protectionsConfiguration),
      {
        exportFrequency: props.configuration.exportFrequency,
        enableKeepMalwareSnapshots: props.configuration.enableKeepMalwareSnapshots,
      },
    );

    // Configure findings export destination on the delegated admin detector
    if (props.configuration.exportDestination) {
      await FindingsExportConfiguration.configurePublishingDestination(
        client,
        props.configuration.exportDestination.overrideExisting ?? true,
        detectorId,
        props.configuration.exportDestination.destinationType,
        {
          DestinationArn: props.configuration.exportDestination.destinationArn,
          KmsKeyArn: props.configuration.exportDestination.kmsKeyArn,
        },
        dryRun,
        logPrefix,
      );
    } else {
      // Export disabled — remove existing destination if present
      await FindingsExportConfiguration.deletePublishingDestination(client, detectorId, 'S3', dryRun, logPrefix);
    }

    response.delegatedAdmin = {
      adminAccountId: targetAccount.Id,
      // Report the accounts actually enrolled as members (boundary-scoped), not the full organization.
      memberAccountIds: enableAccounts.map(account => account.AccountId).filter((id): id is string => !!id),
    };

    response.detector = {
      accountIds: [targetAccount.Id],
      protectionsConfiguration: props.configuration.protectionsConfiguration,
      exportFrequency: props.configuration.exportFrequency,
      exportDestination: props.configuration.exportDestination,
    };
  }

  return response;
}

/**
 * Enables delegated administrator account for GuardDuty organization management
 * @param props - GuardDuty module request properties
 * @param targetRegion - Target region for the operation
 * @param client - GuardDuty client instance
 * @param serviceName - AWS service name for Organizations API
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @returns Promise that resolves when delegated admin is configured
 */
async function enableDelegatedAdminAccount(
  props: IGuardDutyModuleRequest,
  targetRegion: string,
  client: GuardDutyClient,
  serviceName: string,
  managementAccountId: string,
  dryRun: boolean,
  logPrefix: string,
): Promise<void> {
  // Get current delegated admin
  const currentAdmin = await getOrganizationAdminAccountId(client, logPrefix);

  if (currentAdmin && currentAdmin !== props.configuration.delegatedAdminAccountId) {
    // Disable the current admin before instating the new one
    await disableDelegatedAdminAccount(
      client,
      GUARDDUTY_SERVICE_NAME,
      currentAdmin !== managementAccountId,
      dryRun,
      logPrefix,
      props,
      targetRegion,
    );
  }

  // Create Organizations client for delegated admin management
  const organizationsClient = new OrganizationsClient({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  // Create delegated admin manager
  const adminManager = new DelegatedAdminManager<GuardDutyClient>(serviceName, organizationsClient, logger);

  // Enable delegated admin using the simplified interface
  await adminManager.enable(props.configuration.delegatedAdminAccountId, client, delegatedAdminOps, dryRun, logPrefix);
}

/**
 * Disables GuardDuty service for a specific account and region with proper cleanup
 * @param targetAccount - Target account for disablement
 * @param targetRegion - Target region for disablement
 * @param managementAccountId - Management account ID
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @param props - GuardDuty module request properties
 * @param organizationAccounts - List of organization accounts
 * @returns Promise that resolves with operation response data
 */
async function disableService(
  targetAccount: Account,
  targetRegion: string,
  managementAccountId: string,
  dryRun: boolean,
  logPrefix: string,
  props: IGuardDutyModuleRequest,
  organizationAccounts: Account[],
): Promise<GuardDutyOperationResponse> {
  const response: GuardDutyOperationResponse = {};

  const client = new GuardDutyClient({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  let detectorId: string | undefined;
  try {
    detectorId = await getDetectorId(client, logPrefix);
    if (!detectorId) {
      logger.info(
        `No GuardDuty detector found in ${targetRegion} for ${targetAccount.Name} account, skipping cleanup.`,
        logPrefix,
      );
      return response;
    }
  } catch (err) {
    logger.error(`Error getting GuardDuty detector in ${targetRegion} for ${targetAccount.Name} account`, logPrefix);
    throw err;
  }

  // Process Delegated Admin Account
  if (targetAccount.Id === props.configuration.delegatedAdminAccountId) {
    await GuardDutyMembers.disable(client, detectorId, dryRun, logPrefix);

    // Delete findings export destination from the delegated admin detector
    if (props.configuration.exportDestination && props.configuration.exportDestination.overrideExisting !== false) {
      logger.info(
        `Deleting GuardDuty findings export in ${targetRegion} for ${targetAccount.Name} account.`,
        logPrefix,
      );
      await FindingsExportConfiguration.deletePublishingDestination(
        client,
        detectorId,
        props.configuration.exportDestination.destinationType,
        dryRun,
        logPrefix,
      );
    }

    response.delegatedAdmin = {
      adminAccountId: targetAccount.Id,
      memberAccountIds: organizationAccounts
        .map(acc => acc.Id)
        .filter((id): id is string => id !== targetAccount.Id && !!id),
    };
  }

  // Process Management Account — only management account can query/disable org-level admin
  if (targetAccount.Id === managementAccountId) {
    const currentAdmin = await getOrganizationAdminAccountId(client, logPrefix);

    if (currentAdmin) {
      await disableDelegatedAdminAccount(
        client,
        GUARDDUTY_SERVICE_NAME,
        managementAccountId !== props.configuration.delegatedAdminAccountId,
        dryRun,
        logPrefix,
        props,
        targetRegion,
      );
    } else {
      logger.info(`GuardDuty delegated admin is already disabled in ${targetRegion}, skipping.`, logPrefix);
    }

    response.organizationAdmin = {
      managementAccountId,
      delegatedAdminAccountId: props.configuration.delegatedAdminAccountId,
    };
  }

  // Process Workload Accounts — delete detector to fully disable GuardDuty
  if (targetAccount.Id !== managementAccountId && targetAccount.Id !== props.configuration.delegatedAdminAccountId) {
    await deleteDetectorId(client, detectorId, dryRun, logPrefix);
  }

  return response;
}

/**
 * Disables the current delegated administrator account for GuardDuty
 * @param client - GuardDuty client instance
 * @param serviceName - AWS service name for Organizations API
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @param props - GuardDuty module request properties (needed for Organizations client)
 * @param targetRegion - Target region (needed for Organizations client)
 * @returns Promise that resolves when delegated admin is disabled
 */
async function disableDelegatedAdminAccount(
  client: GuardDutyClient,
  serviceName: string,
  deregister: boolean,
  dryRun: boolean,
  logPrefix: string,
  props: IGuardDutyModuleRequest,
  targetRegion: string,
): Promise<void> {
  // Create Organizations client for delegated admin management
  const organizationsClient = new OrganizationsClient({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  if (deregister) {
    // Create delegated admin manager
    const adminManager = new DelegatedAdminManager<GuardDutyClient>(serviceName, organizationsClient, logger);

    // Disable delegated admin using the simplified interface
    await adminManager.disable(client, delegatedAdminOps, dryRun, logPrefix);
  } else {
    // Only disable the delegated admin in the organization, but don't deregister it
    const delegatedAdminAccountId = await delegatedAdminOps.getCurrent(client, logPrefix);
    if (!delegatedAdminAccountId) {
      logger.info('No delegated admin account found, skipping disable operation', logPrefix);
      return;
    }
    await delegatedAdminOps.disable(client, delegatedAdminAccountId, dryRun, logPrefix);
  }
}
