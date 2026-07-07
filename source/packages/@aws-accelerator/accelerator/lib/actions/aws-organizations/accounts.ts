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
 * @fileoverview Accelerator action wiring for the unified `accounts` module.
 *
 * @description
 * Bridges the accelerator runner's {@link ModuleParams} into the `aws-lza`
 * {@link configureAccounts} module function. Responsibilities owned here:
 *   - Select active accounts that have alias or tags configured
 *   - Derive a state fingerprint for DynamoDB-backed change detection
 *   - Skip execution when no accounts require reconciliation or when the
 *     fingerprint matches the last successful run
 *   - Invoke the module function with a single aggregated request (the
 *     module loops across accounts internally, matching the Macie pattern)
 *   - Persist execution state after a successful run
 *   - Emit the canonical module completion log record
 */

import {
  configureAccounts,
  createLogger,
  createStatusLogger,
  IAccountConfig,
  IAccountsModuleRequest,
  IAccountsModuleResponse,
  IModuleResponse,
  MODULE_STATE_CODE,
} from 'aws-lza';
import path from 'node:path';

import { AcceleratorModules, ModuleParams } from '../../types';
import { logModuleExecutionResult } from '../utils/module-logging';
import { calculateArrayHash, hasModuleConfigChanged, saveModuleExecutionState } from '../utils/module-state';

/**
 * Minimal shape used for state-change detection.
 *
 * @description
 * The full desired alias + tag set is hashed so that any change on any
 * account invalidates the fingerprint and triggers a re-run.
 */
interface IAccountsConfigForState {
  readonly accountsCount: number;
  readonly accountsHash: string;
  readonly perAccountFingerprint: ReadonlyArray<{
    accountId: string;
    alias?: string;
    tagsHash?: string;
  }>;
}

export abstract class Accounts {
  private static readonly logger = createLogger([path.parse(path.basename(__filename)).name]);
  private static readonly statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

  public static async configure(params: ModuleParams): Promise<IModuleResponse<IAccountsModuleResponse>> {
    const moduleName = params.moduleItem.name;
    const dryRun = params.runnerParameters.dryRun;
    const { sessionContext } = params.runnerParameters;
    const logPrefix = `${sessionContext.invokingAccountId}:${sessionContext.region}`;

    Accounts.statusLogger.processStart(`Starting ${moduleName} module`, logPrefix);

    const targetAccounts = this.selectTargetAccounts(params);

    if (targetAccounts.length === 0) {
      const summary = `Skipping ${moduleName}: no accounts have alias or tags configured`;
      Accounts.statusLogger.info(summary, logPrefix);
      return this.skipResponse(moduleName, dryRun, summary);
    }

    const currentConfig = this.extractConfigForState(targetAccounts);

    let configChanged: boolean;
    try {
      configChanged = await hasModuleConfigChanged(
        {
          serviceName: AcceleratorModules.ACCOUNTS,
          currentConfig,
          overrideExisting: false,
        },
        params,
        logPrefix,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown state check error';
      Accounts.statusLogger.error(`State management failure: ${errorMessage}`, logPrefix);
      const failed = this.failResponse(moduleName, dryRun, `State management failure: ${errorMessage}`, {
        name: 'StateManagementError',
        message: errorMessage,
      });
      logModuleExecutionResult(failed, moduleName, logPrefix, Accounts.logger, Accounts.statusLogger);
      return failed;
    }

    if (!configChanged) {
      const summary = `Skipping ${moduleName}: configuration unchanged since last successful execution`;
      Accounts.statusLogger.info(summary, logPrefix);
      return this.skipResponse(moduleName, dryRun, summary);
    }

    const { globalConfig, accountsConfig } = params.moduleRunnerParameters.configs;

    const request: IAccountsModuleRequest = {
      operation: 'accounts',
      moduleName,
      partition: sessionContext.partition,
      region: globalConfig.homeRegion,
      globalRegion: sessionContext.globalRegion,
      invokingAccountId: sessionContext.invokingAccountId,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      sessionPolicy: params.moduleRunnerParameters.sessionPolicy,
      dryRun,
      configuration: {
        accounts: targetAccounts,
        accountAccessRoleName: globalConfig.managementAccountAccessRole,
        managementAccountId: accountsConfig.getManagementAccountId(),
      },
    };

    const response = await configureAccounts(request);

    if (response.status === MODULE_STATE_CODE.SUCCESS || response.status === MODULE_STATE_CODE.COMPLETED) {
      try {
        await saveModuleExecutionState(
          {
            serviceName: AcceleratorModules.ACCOUNTS,
            config: currentConfig,
            status: response.status,
            response,
            dryRun,
          },
          params,
          logPrefix,
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Accounts.statusLogger.error(`Module execution state save failed: ${errorMessage}`, logPrefix);
        const failed = this.failResponse(moduleName, dryRun, `Module execution state save failed: ${errorMessage}`, {
          name: 'StateSaveError',
          message: errorMessage,
        });
        logModuleExecutionResult(failed, moduleName, logPrefix, Accounts.logger, Accounts.statusLogger);
        return failed;
      }
    }

    logModuleExecutionResult(response, moduleName, logPrefix, Accounts.logger, Accounts.statusLogger);
    return response;
  }

  /**
   * Returns the list of active accounts that have alias or tags configured,
   * shaped as the module function's {@link IAccountConfig} input.
   */
  private static selectTargetAccounts(params: ModuleParams): IAccountConfig[] {
    const { accountsConfig, organizationConfig } = params.moduleRunnerParameters.configs;
    const ignoredOus = organizationConfig.getIgnoredOus();
    const activeAccountIds = accountsConfig.getActiveAccountIds(ignoredOus);
    const allAccounts = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts];

    return allAccounts
      .filter(account => activeAccountIds.includes(accountsConfig.getAccountId(account.name)))
      .filter(account => {
        const hasAlias = typeof account.accountAlias === 'string' && account.accountAlias.length > 0;
        const hasTags = Array.isArray(account.tags) && account.tags.length > 0;
        return hasAlias || hasTags;
      })
      .map(account => ({
        accountId: accountsConfig.getAccountId(account.name),
        accountName: account.name,
        alias:
          typeof account.accountAlias === 'string' && account.accountAlias.length > 0
            ? account.accountAlias
            : undefined,
        tags:
          Array.isArray(account.tags) && account.tags.length > 0
            ? account.tags.map(t => ({ key: t.key, value: t.value }))
            : undefined,
      }));
  }

  /**
   * Derives a deterministic fingerprint covering both alias and tags for
   * every target account. Sorted per-account so declaration order does not
   * affect the hash.
   */
  private static extractConfigForState(accounts: IAccountConfig[]): IAccountsConfigForState {
    const sortedAccountIds = accounts.map(a => a.accountId).sort();

    const perAccountFingerprint = accounts
      .slice()
      .sort((a, b) => a.accountId.localeCompare(b.accountId))
      .map(a => ({
        accountId: a.accountId,
        alias: a.alias,
        tagsHash: a.tags ? calculateArrayHash(a.tags.map(t => `${t.key}=${t.value}`)) : undefined,
      }));

    return {
      accountsCount: accounts.length,
      accountsHash: calculateArrayHash(sortedAccountIds),
      perAccountFingerprint,
    };
  }

  private static skipResponse(
    moduleName: string,
    dryRun: boolean,
    summary: string,
  ): IModuleResponse<IAccountsModuleResponse> {
    return {
      status: MODULE_STATE_CODE.SKIPPED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      response: { perAccountResults: [] },
    };
  }

  private static failResponse(
    moduleName: string,
    dryRun: boolean,
    summary: string,
    error: { name: string; message: string },
  ): IModuleResponse<IAccountsModuleResponse> {
    return {
      status: MODULE_STATE_CODE.FAILED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      error,
      response: { perAccountResults: [] },
    };
  }
}
