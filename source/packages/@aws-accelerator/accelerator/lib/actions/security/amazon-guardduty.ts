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

import { GuardDutyConfig } from '@aws-accelerator/config';
import {
  configureGuardDuty,
  createLogger,
  createStatusLogger,
  GuardDutyOrgFeatureStatus,
  IGuardDutyModuleRequest,
  IGuardDutyModuleResponse,
  IModuleResponse,
  isGuardDutyAvailableInPartition,
  MODULE_STATE_CODE,
} from 'aws-lza';
import path from 'node:path';
import { AcceleratorModules, ModuleParams } from '../../types';
import { extractSecurityServiceMetadata, loadOrganizationDataSources } from '../utils/common-config';
import { logModuleExecutionResult } from '../utils/module-logging';
import { calculateArrayHash, hasModuleConfigChanged, saveModuleExecutionState } from '../utils/module-state';

/**
 * GuardDuty configuration object for state comparison.
 * Contains only the fields relevant for detecting configuration changes.
 */
interface IGuardDutyConfigForState {
  /** Whether GuardDuty is enabled */
  readonly enable: boolean;
  /** Regions to exclude from GuardDuty deployment */
  readonly excludedRegions: string[];
  /** Regions where GuardDuty is explicitly disabled */
  readonly disabledRegions: string[];
  /** Whether to auto-enable GuardDuty for new organization members */
  readonly autoEnableOrgMembers: boolean | undefined;
  /** S3 protection configuration */
  readonly s3Protection: {
    readonly enable: boolean;
    readonly excludeRegions: string[];
  };
  /** EKS protection configuration */
  readonly eksProtection?: {
    readonly auditLogs: boolean | undefined;
    readonly runtimeMonitoring: boolean | undefined;
    readonly manageAgent?: boolean;
    readonly excludeRegions: string[];
  };
  /** EC2 protection configuration */
  readonly ec2Protection?: {
    readonly enable: boolean;
    readonly keepSnapshots: boolean;
    readonly excludeRegions: string[];
  };
  /** RDS protection configuration */
  readonly rdsProtection?: {
    readonly enable: boolean;
    readonly excludeRegions: string[];
  };
  /** Lambda protection configuration */
  readonly lambdaProtection?: {
    readonly enable: boolean;
    readonly excludeRegions: string[];
  };
  /** Export configuration */
  readonly exportConfiguration: {
    readonly enable: boolean;
    readonly overrideExisting: boolean;
    readonly exportFrequency: string;
  };
  /** S3 destination configuration for findings */
  readonly s3Destination: {
    readonly bucketName: string;
    readonly kmsKeyArn: string;
  };
  /** Delegated administrator account ID */
  readonly delegatedAdminAccountId: string;
  /** Number of enabled regions */
  readonly enabledRegionsCount: number;
  /** Hash of sorted enabled regions for detecting region replacements */
  readonly enabledRegionsHash: string;
  /** Number of accounts */
  readonly accountsCount: number;
  /** Hash of sorted account IDs for detecting account replacements */
  readonly accountsHash: string;
}

/**
 * Amazon GuardDuty configuration and management class for Landing Zone Accelerator.
 *
 * This abstract class provides static methods for configuring Amazon GuardDuty across an AWS organization.
 * It handles the orchestration of GuardDuty deployment, including service enablement, delegated administrator
 * setup, and configuration of threat detection protections and findings export.
 */
export abstract class AmazonGuardDuty {
  private static readonly statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);
  private static readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Validates required logging configuration parameters.
   */
  private static validateConfiguration(params: ModuleParams, logPrefix: string): void {
    if (!params.moduleRunnerParameters.logging.bucketName || !params.moduleRunnerParameters.logging.bucketKeyArn) {
      const message = `Logging bucket name and key arn must be provided.`;
      AmazonGuardDuty.statusLogger.error(message, logPrefix);
      throw new Error(message);
    }
  }

  /**
   * Maps the LZA autoEnableOrgMembers boolean to the GuardDuty OrgFeatureStatus enum.
   * Uses ALL (not NEW) to match legacy custom resource behavior and ensure drift protection —
   * if a member is manually disassociated between pipeline runs, GuardDuty will re-enroll it.
   */
  private static getAutoEnableOrgMembers(autoEnableOrgMembers?: boolean): GuardDutyOrgFeatureStatus {
    if (autoEnableOrgMembers === false) {
      return GuardDutyOrgFeatureStatus.NONE;
    }
    return GuardDutyOrgFeatureStatus.ALL;
  }

  /**
   * Resolves the per-environment batch operation timeout (milliseconds).
   *
   * Operators may extend the timeout via the `GUARDDUTY_OPERATION_TIMEOUT` env var for slower partitions
   * (GovCloud/China) or large organizations. The value must be a positive, finite number of milliseconds;
   * any invalid value (e.g. `15m`, `NaN`, `0`, negative) falls back to the default. This guards against a
   * non-numeric value becoming NaN and coercing the operation timeout to 0, which would fail every account.
   *
   * @returns Resolved operation timeout in milliseconds
   */
  private static resolveOperationTimeoutMs(): number {
    const DEFAULT_OPERATION_TIMEOUT_MS = 900000; // 15 minutes; must exceed the ~14 min enrollment wait
    const raw = process.env['GUARDDUTY_OPERATION_TIMEOUT'];
    if (!raw) {
      return DEFAULT_OPERATION_TIMEOUT_MS;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      AmazonGuardDuty.logger.warn(
        `Ignoring invalid GUARDDUTY_OPERATION_TIMEOUT="${raw}"; expected a positive number of milliseconds. ` +
          `Using default ${DEFAULT_OPERATION_TIMEOUT_MS}ms.`,
      );
      return DEFAULT_OPERATION_TIMEOUT_MS;
    }
    return parsed;
  }

  /**
   * Resolves the excluded regions from either the top-level excludeRegions config
   * or the deploymentTargets.excludedRegions fallback.
   * @param guardDutyConfig - GuardDuty configuration object
   * @returns Resolved excluded regions array, or undefined if none configured
   */
  private static getExcludedRegions(guardDutyConfig: GuardDutyConfig): string[] | undefined {
    return guardDutyConfig.excludeRegions?.length
      ? guardDutyConfig.excludeRegions
      : guardDutyConfig.deploymentTargets?.excludedRegions;
  }

  /**
   * Resolves EKS Protection into the independent GuardDuty features (`EKS_AUDIT_LOGS` and
   * `EKS_RUNTIME_MONITORING`) expected by the module.
   *
   * The legacy `enable` flag drives both features together for backwards compatibility (an explicit
   * true/false for both). When `enable` is not set, the granular `auditLogs` / `runtimeMonitoring`
   * flags are passed through verbatim — including `undefined` when a flag is not configured — so the
   * module can omit an unconfigured feature from the API request instead of sending it as DISABLED.
   * The config validator rejects configs that set both.
   * @param eksProtection - EKS protection configuration object
   * @returns Resolved `auditLogs` and `runtimeMonitoring` values (undefined when not configured)
   */
  private static resolveEksProtectionFeatures(eksProtection: {
    enable?: boolean;
    auditLogs?: boolean;
    runtimeMonitoring?: boolean;
  }): { auditLogs: boolean | undefined; runtimeMonitoring: boolean | undefined } {
    if (eksProtection.enable !== undefined) {
      return { auditLogs: eksProtection.enable, runtimeMonitoring: eksProtection.enable };
    }
    return {
      auditLogs: eksProtection.auditLogs,
      runtimeMonitoring: eksProtection.runtimeMonitoring,
    };
  }

  /**
   * Extracts GuardDuty configuration for state comparison.
   * @param params - Module parameters containing security and account configuration
   * @param logPrefix - Prefix for logging messages
   * @returns GuardDuty configuration object used for state hash comparison
   */
  private static extractGuardDutyConfig(params: ModuleParams, logPrefix: string): IGuardDutyConfigForState {
    const guardDutyConfig = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.guardduty!;
    let securityMetadata = extractSecurityServiceMetadata(params);

    // Override accounts metadata with deployment target accounts if configured
    if (guardDutyConfig.deploymentTargets) {
      const targetAccountIds = params.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget(
        guardDutyConfig.deploymentTargets,
      );
      if (targetAccountIds.length > 0) {
        securityMetadata = {
          ...securityMetadata,
          accountsCount: targetAccountIds.length,
          accountsHash: calculateArrayHash(targetAccountIds),
        };
      }
    }

    const config: IGuardDutyConfigForState = {
      enable: guardDutyConfig.enable,
      excludedRegions: this.getExcludedRegions(guardDutyConfig) ?? [],
      disabledRegions: guardDutyConfig.disabledRegions ?? [],
      autoEnableOrgMembers: guardDutyConfig.autoEnableOrgMembers,
      s3Protection: {
        enable: guardDutyConfig.s3Protection.enable,
        excludeRegions: guardDutyConfig.s3Protection.excludeRegions ?? [],
      },
      ...(guardDutyConfig.eksProtection && {
        eksProtection: {
          ...AmazonGuardDuty.resolveEksProtectionFeatures(guardDutyConfig.eksProtection),
          manageAgent: guardDutyConfig.eksProtection.manageAgent,
          excludeRegions: guardDutyConfig.eksProtection.excludeRegions ?? [],
        },
      }),
      ...(guardDutyConfig.ec2Protection && {
        ec2Protection: {
          enable: guardDutyConfig.ec2Protection.enable,
          keepSnapshots: guardDutyConfig.ec2Protection.keepSnapshots,
          excludeRegions: guardDutyConfig.ec2Protection.excludeRegions ?? [],
        },
      }),
      ...(guardDutyConfig.rdsProtection && {
        rdsProtection: {
          enable: guardDutyConfig.rdsProtection.enable,
          excludeRegions: guardDutyConfig.rdsProtection.excludeRegions ?? [],
        },
      }),
      ...(guardDutyConfig.lambdaProtection && {
        lambdaProtection: {
          enable: guardDutyConfig.lambdaProtection.enable,
          excludeRegions: guardDutyConfig.lambdaProtection.excludeRegions ?? [],
        },
      }),
      exportConfiguration: {
        enable: guardDutyConfig.exportConfiguration.enable,
        overrideExisting: guardDutyConfig.exportConfiguration.overrideExisting ?? false,
        exportFrequency: guardDutyConfig.exportConfiguration.exportFrequency,
      },
      s3Destination: {
        bucketName: params.moduleRunnerParameters.logging.bucketName!,
        kmsKeyArn: params.moduleRunnerParameters.logging.bucketKeyArn!,
      },
      ...securityMetadata,
    };
    AmazonGuardDuty.logger.info(`Current guardduty config: ${JSON.stringify(config)}`, logPrefix);
    return config;
  }

  /**
   * Builds GuardDuty module request for configuration.
   */
  private static async buildGuardDutyRequest(
    params: ModuleParams,
    logPrefix: string,
  ): Promise<IGuardDutyModuleRequest> {
    const guardDutyConfig = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.guardduty!;

    // Load organizational data sources if enabled (uses common utility)
    const dataSources = await loadOrganizationDataSources(params, logPrefix);

    // Log loaded data sources summary
    AmazonGuardDuty.logger.info(
      `Organization data sources loaded from ${dataSources?.organizations.tableName} table`,
      logPrefix,
    );

    // Build protections configuration from LZA config
    const protectionsConfiguration = guardDutyConfig.s3Protection
      ? {
          s3Protection: {
            enable: guardDutyConfig.s3Protection.enable,
            excludedRegions: guardDutyConfig.s3Protection.excludeRegions,
          },
          ...(guardDutyConfig.eksProtection && {
            eksProtection: {
              ...AmazonGuardDuty.resolveEksProtectionFeatures(guardDutyConfig.eksProtection),
              manageAgent: guardDutyConfig.eksProtection.manageAgent,
              excludedRegions: guardDutyConfig.eksProtection.excludeRegions,
            },
          }),
          ...(guardDutyConfig.ec2Protection && {
            ec2Protection: {
              enable: guardDutyConfig.ec2Protection.enable,
              keepSnapshots: guardDutyConfig.ec2Protection.keepSnapshots,
              excludedRegions: guardDutyConfig.ec2Protection.excludeRegions,
            },
          }),
          ...(guardDutyConfig.rdsProtection && {
            rdsProtection: {
              enable: guardDutyConfig.rdsProtection.enable,
              excludedRegions: guardDutyConfig.rdsProtection.excludeRegions,
            },
          }),
          ...(guardDutyConfig.lambdaProtection && {
            lambdaProtection: {
              enable: guardDutyConfig.lambdaProtection.enable,
              excludedRegions: guardDutyConfig.lambdaProtection.excludeRegions,
            },
          }),
        }
      : undefined;

    // Build export destination configuration
    let guardDutyPrefix: string | undefined = 'guardduty';
    if (guardDutyConfig.exportConfiguration?.overrideGuardDutyPrefix?.useCustomPrefix) {
      guardDutyPrefix = guardDutyConfig.exportConfiguration.overrideGuardDutyPrefix.customOverride ?? undefined;
    }

    const exportDestination = guardDutyConfig.exportConfiguration?.enable
      ? {
          destinationArn: guardDutyPrefix
            ? `arn:${params.runnerParameters.sessionContext.partition}:s3:::${params.moduleRunnerParameters.logging.bucketName}/${guardDutyPrefix}`
            : `arn:${params.runnerParameters.sessionContext.partition}:s3:::${params.moduleRunnerParameters.logging.bucketName}`,
          kmsKeyArn: params.moduleRunnerParameters.logging.bucketKeyArn!,
          destinationType: 'S3' as const,
          overrideExisting: guardDutyConfig.exportConfiguration.overrideExisting,
        }
      : undefined;

    return {
      ...params.runnerParameters.sessionContext,
      invokingAccountId: params.moduleRunnerParameters.configs.accountsConfig.getManagementAccountId(),
      operation: 'setup',
      moduleName: params.moduleItem.name,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      sessionPolicy: params.moduleRunnerParameters.sessionPolicy,
      configuration: {
        accountAccessRoleName: params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole,
        enable: guardDutyConfig.enable,
        delegatedAdminAccountId: params.moduleRunnerParameters.configs.accountsConfig.getAuditAccountId(),
        autoEnableOrgMembers: this.getAutoEnableOrgMembers(guardDutyConfig.autoEnableOrgMembers),
        batchOperationSettings: {
          maxConcurrentEnvironments: 50,
          // Allow operators to extend the per-environment timeout in slower partitions (e.g. GovCloud/China)
          // or large organizations where member association takes longer (via GUARDDUTY_OPERATION_TIMEOUT).
          // Default is 15 minutes so the member-enrollment verification wait (~14 min) can complete before
          // this outer timeout; previously 5 minutes, which pre-empted enrollment verification on slow setups.
          operationTimeoutMs: AmazonGuardDuty.resolveOperationTimeoutMs(),
        },
        protectionsConfiguration,
        exportFrequency: guardDutyConfig.exportConfiguration?.exportFrequency,
        exportDestination,
        enableKeepMalwareSnapshots: guardDutyConfig.ec2Protection?.keepSnapshots,
        regionFilters: {
          ignoredRegions: this.getExcludedRegions(guardDutyConfig),
          disabledRegions: guardDutyConfig.disabledRegions,
        },
        boundary: {
          regions: params.moduleRunnerParameters.configs.globalConfig.enabledRegions,
          accounts: guardDutyConfig.deploymentTargets
            ? this.resolveDeploymentTargetAccounts(params, guardDutyConfig)
            : undefined,
        },
        ...(dataSources && { dataSources }),
      },
    };
  }

  /**
   * Resolves deploymentTargets into account IDs for account boundary filtering.
   */
  private static resolveDeploymentTargetAccounts(
    params: ModuleParams,
    guardDutyConfig: GuardDutyConfig,
  ): string[] | undefined {
    if (!guardDutyConfig.deploymentTargets) {
      return undefined;
    }

    const accountsConfig = params.moduleRunnerParameters.configs.accountsConfig;

    const accountIds = accountsConfig.getAccountIdsFromDeploymentTarget(guardDutyConfig.deploymentTargets);

    // If no accounts resolved (e.g., empty config), return undefined (all accounts)
    if (accountIds.length === 0) {
      return undefined;
    }

    // The management and delegated-admin (Audit) accounts are always in scope for the module:
    // it performs organization-admin operations from the management account and member/detector/
    // publishing operations from the delegated admin. Under the previous CloudFormation
    // custom-resource behavior, deploymentTargets was a member-only list and these accounts were
    // implicit, so long-standing configs frequently omit them. To preserve backward compatibility,
    // auto-include them (rather than failing) when absent from deploymentTargets.
    const managementAccountId = accountsConfig.getManagementAccountId();
    const delegatedAdminAccountId = accountsConfig.getAuditAccountId();

    // Account IDs the customer explicitly excluded (already stripped from accountIds above). Re-adding
    // one of these overrides an explicit intent, so it is surfaced at warn rather than info.
    const explicitlyExcludedIds = new Set(
      (guardDutyConfig.deploymentTargets.excludedAccounts ?? []).map(name => accountsConfig.getAccountId(name)),
    );

    for (const requiredAccountId of [managementAccountId, delegatedAdminAccountId]) {
      if (!accountIds.includes(requiredAccountId)) {
        accountIds.push(requiredAccountId);
        if (explicitlyExcludedIds.has(requiredAccountId)) {
          AmazonGuardDuty.logger.warn(
            `GuardDuty deploymentTargets.excludedAccounts listed required account ${requiredAccountId}; re-adding it ` +
              `because the management and delegated-admin accounts are always in scope and cannot be excluded`,
          );
        } else {
          AmazonGuardDuty.logger.info(
            `Added required account ${requiredAccountId} to GuardDuty deployment boundary ` +
              `(management and delegated-admin accounts are always in scope)`,
          );
        }
      }
    }

    AmazonGuardDuty.logger.info(
      `Resolved deploymentTargets to ${accountIds.length} account(s): [${accountIds.join(', ')}]`,
    );
    return accountIds;
  }

  /**
   * Configures Amazon GuardDuty across the AWS organization according to the provided parameters.
   *
   * @param {ModuleParams} params - Complete module configuration parameters, including runner
   *   parameters, session context, logging configuration, and security config.
   * @returns {Promise<IModuleResponse<IGuardDutyModuleResponse>>} Module execution response.
   *   Status is COMPLETED on success, SKIPPED when GuardDuty is not configured / not available
   *   in the partition / retention module skipped / config unchanged, and FAILED when the state
   *   check or state save fails.
   * @throws {Error} When required logging bucket parameters (bucketName, bucketKeyArn) are missing.
   */
  public static async configure(params: ModuleParams): Promise<IModuleResponse<IGuardDutyModuleResponse>> {
    const logPrefix = `${params.runnerParameters.sessionContext.invokingAccountId}:${params.runnerParameters.sessionContext.region}`;

    // Log execution context
    AmazonGuardDuty.logger.processStart(
      `Starting GuardDuty module execution - dryRun: ${params.runnerParameters.dryRun}`,
      logPrefix,
    );

    // Early exit if retention module was skipped — custom resources are still managing GuardDuty
    if (process.env['SKIP_STACK_RESOURCES_RETENTION_MODULE']?.toLowerCase() === 'true') {
      const message = `Skipping module ${params.moduleItem.name} as stack resources retention module is skipped. GuardDuty custom resources remain active.`;
      AmazonGuardDuty.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // Early exit if GuardDuty is not configured in the security configuration
    if (!params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.guardduty) {
      const message = `Skipping module ${params.moduleItem.name} as GuardDuty is not configured.`;
      AmazonGuardDuty.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // Validate required logging configuration parameters
    this.validateConfiguration(params, logPrefix);

    // ========================================
    // PARTITION AVAILABILITY CHECK
    // ========================================
    // In partitions where GuardDuty is not available, skip the module
    const guardDutyAvailable = await isGuardDutyAvailableInPartition(
      {
        region: params.runnerParameters.sessionContext.globalRegion,
        solutionId: params.runnerParameters.solutionId,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
      },
      logPrefix,
    );

    if (!guardDutyAvailable) {
      const message = `Skipping module ${params.moduleItem.name} as Amazon GuardDuty is not available in this partition.`;
      AmazonGuardDuty.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    const guardDutyConfig = params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.guardduty;

    // Extract current configuration for state comparison
    const currentConfig = this.extractGuardDutyConfig(params, logPrefix);

    // Check if configuration has changed since last execution
    let configChanged: boolean;
    try {
      configChanged = await hasModuleConfigChanged(
        {
          serviceName: AcceleratorModules.GUARDDUTY,
          currentConfig,
          overrideExisting: guardDutyConfig.overrideExisting ?? false,
        },
        params,
        logPrefix,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown state check error';
      AmazonGuardDuty.statusLogger.error(`State management failure: ${errorMessage}`, logPrefix);

      const failedStatus = {
        status: MODULE_STATE_CODE.FAILED,
        summary: `State management failure: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
        error: {
          name: 'StateManagementError',
          message: errorMessage,
        },
      };

      logModuleExecutionResult(
        failedStatus,
        params.moduleItem.name,
        logPrefix,
        AmazonGuardDuty.logger,
        AmazonGuardDuty.statusLogger,
      );

      return failedStatus;
    }

    // Log configuration change detection result
    AmazonGuardDuty.logger.info(
      `Config change check result: changed=${configChanged}, overrideExisting=${guardDutyConfig.overrideExisting ?? false}`,
      logPrefix,
    );

    // Skip execution if configuration hasn't changed and not forcing run
    if (!configChanged) {
      const message = `Skipping module ${params.moduleItem.name} as configuration has not changed since last execution.`;
      AmazonGuardDuty.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // ========================================
    // PHASE 1: GuardDuty Configuration
    // ========================================
    AmazonGuardDuty.statusLogger.processStart('Starting GuardDuty configuration phase', logPrefix);

    // Build GuardDuty module request
    const input = await this.buildGuardDutyRequest(params, logPrefix);

    // Execute the GuardDuty configuration operation
    const status = await configureGuardDuty(input);

    AmazonGuardDuty.statusLogger.processEnd('GuardDuty configuration phase completed', logPrefix);

    // ========================================
    // PHASE 2: Save Execution State
    // ========================================
    try {
      AmazonGuardDuty.statusLogger.processStart('Module execution state saved started', logPrefix);
      await saveModuleExecutionState(
        {
          serviceName: AcceleratorModules.GUARDDUTY,
          config: currentConfig,
          status: status.status,
          response: status,
          dryRun: params.runnerParameters.dryRun,
        },
        params,
        logPrefix,
      );
      AmazonGuardDuty.logger.info(`Module response: ${JSON.stringify(status)}`, logPrefix);
      AmazonGuardDuty.statusLogger.processEnd('Module execution state saved successfully', logPrefix);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AmazonGuardDuty.statusLogger.error(`Module execution state save failed: ${errorMessage}`, logPrefix);

      const failedStatus = {
        status: MODULE_STATE_CODE.FAILED,
        summary: `Module execution state save failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
        error: {
          name: 'StateSaveError',
          message: errorMessage,
        },
      };

      logModuleExecutionResult(
        failedStatus,
        params.moduleItem.name,
        logPrefix,
        AmazonGuardDuty.logger,
        AmazonGuardDuty.statusLogger,
      );

      return failedStatus;
    }

    logModuleExecutionResult(
      status,
      params.moduleItem.name,
      logPrefix,
      AmazonGuardDuty.logger,
      AmazonGuardDuty.statusLogger,
    );

    return status;
  }
}
