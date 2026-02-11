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
  IEnrollAccountsHandlerParameter,
  IEnrollAccountsModule,
} from '../../../interfaces/control-tower/enroll-accounts';

import { createLogger, createStatusLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import {
  delay,
  generateDryRunResponse,
  getLandingZoneIdentifier,
  getModuleDefaultParameters,
  setRetryStrategy,
} from '../../../common/functions';

import {
  BaselineOperationStatus,
  ControlTowerClient,
  EnabledBaselineDriftStatus,
  EnabledBaselineSummary,
  EnablementStatus,
  GetBaselineOperationCommand,
  paginateListEnabledBaselines,
  ResetEnabledBaselineCommand,
} from '@aws-sdk/client-controltower';
import { AcceleratorModuleName } from '../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

/**
 * Environment variable to override the baseline operation timeout in minutes.
 */
const BASELINE_OPERATION_TIMEOUT_ENV = 'ENROLL_ACCOUNTS_TIMEOUT_IN_MINUTES';
const DEFAULT_TIMEOUT_IN_MINUTES = 30;

/**
 * OU baseline that needs to be reset (accounts not yet enrolled)
 */
interface IDriftedOuBaseline {
  /** The OU target identifier ARN */
  readonly targetIdentifier: string;
  /** The enabled baseline ARN */
  readonly enabledBaselineArn: string;
}

/**
 * Account/OU baseline that is currently enrolling into Control Tower
 */
interface IEnrollingBaseline {
  /** The target identifier ARN */
  readonly targetIdentifier: string;
  /** The in-progress operation identifier */
  readonly operationId: string;
}

/**
 * Change set describing what actions need to be taken
 */
interface IChangeSet {
  /** OUs with inheritance drift — accounts in OU not yet enrolled into Control Tower */
  readonly driftedOus: IDriftedOuBaseline[];
  /** Baselines currently enrolling into Control Tower */
  readonly enrollingBaselines: IEnrollingBaseline[];
}

export class EnrollAccountsModule implements IEnrollAccountsModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);
  private readonly statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Extract the account ID or OU ID from an Organizations ARN.
   * @param arn string
   * @returns the trailing ID segment, or the full ARN if parsing fails
   */
  private static getIdFromArn(arn: string): string {
    const lastSlash = arn.lastIndexOf('/');
    return lastSlash !== -1 ? arn.substring(lastSlash + 1) : arn;
  }

  /**
   * Handler function to enroll accounts across the entire Control Tower organization
   *
   * @param props {@link IEnrollAccountsHandlerParameter}
   * @returns status string
   */
  public async handler(props: IEnrollAccountsHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IEnrollAccountsHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: IEnrollAccountsHandlerParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE, props);

    const client = new ControlTowerClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const landingZoneIdentifier = await getLandingZoneIdentifier(client);

    if (!landingZoneIdentifier) {
      if (defaultProps.dryRun) {
        return generateDryRunResponse(
          defaultProps.moduleName,
          props.operation,
          `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason the environment does not have AWS Control Tower Landing Zone configured.`,
        );
      }
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: AWS Control Tower Landing Zone not found in the region "${props.region}".`,
      );
    }

    // Get all enabled baselines including children (accounts)
    const enabledBaselines = await this.getEnabledBaselines(client);

    // Build change set
    const changeSet = this.buildChangeSet(enabledBaselines);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(defaultProps.moduleName, props.operation, changeSet);
    }

    if (changeSet.driftedOus.length === 0 && changeSet.enrollingBaselines.length === 0) {
      return 'No OUs with accounts to enroll and no accounts currently enrolling. No action needed.';
    }

    const timeoutInMinutes = this.getTimeoutInMinutes();
    let elapsedInMinutes = 0;

    // Process drifted OUs sequentially — reset each one and wait for completion before the next
    for (const ou of changeSet.driftedOus) {
      const ouId = EnrollAccountsModule.getIdFromArn(ou.targetIdentifier);
      this.statusLogger.info(`OU "${ouId}" has drifted. Resetting baseline...`);
      const operationId = await this.resetOuBaseline(client, ou.targetIdentifier, ou.enabledBaselineArn);

      this.statusLogger.info(`Waiting for OU "${ouId}" baseline reset to complete...`);
      elapsedInMinutes = await this.waitForOperation(
        client,
        ou.targetIdentifier,
        operationId,
        timeoutInMinutes,
        elapsedInMinutes,
      );
      this.statusLogger.info(
        `OU "${ouId}" baseline reset completed. Elapsed: ${elapsedInMinutes}/${timeoutInMinutes} minutes.`,
      );
    }

    // Wait for all enrolling accounts in parallel with the remaining time budget
    if (changeSet.enrollingBaselines.length > 0) {
      const accountOps = changeSet.enrollingBaselines.map(b => ({
        targetIdentifier: b.targetIdentifier,
        operationId: b.operationId,
      }));

      for (const op of accountOps) {
        this.statusLogger.info(
          `Account "${EnrollAccountsModule.getIdFromArn(op.targetIdentifier)}" is enrolling into Control Tower. Waiting for completion...`,
        );
      }

      elapsedInMinutes = await this.waitForAllOperations(client, accountOps, timeoutInMinutes, elapsedInMinutes);
    }

    return 'Enroll accounts completed successfully for the entire Control Tower organization.';
  }

  /**
   * Build a change set from the enabled baselines.
   * @param enabledBaselines {@link EnabledBaselineSummary}[]
   * @returns changeSet {@link IChangeSet}
   */
  private buildChangeSet(enabledBaselines: EnabledBaselineSummary[]): IChangeSet {
    const driftedOus: IDriftedOuBaseline[] = [];
    const enrollingBaselines: IEnrollingBaseline[] = [];

    for (const baseline of enabledBaselines) {
      const isOu = baseline.targetIdentifier?.includes(':ou/');
      const inheritanceDrift = baseline.driftStatusSummary?.types?.inheritance?.status;
      const status = baseline.statusSummary?.status;

      if (isOu && inheritanceDrift === EnabledBaselineDriftStatus.DRIFTED) {
        driftedOus.push({
          targetIdentifier: baseline.targetIdentifier!,
          enabledBaselineArn: baseline.arn!,
        });
      } else if (status === EnablementStatus.UNDER_CHANGE && baseline.statusSummary?.lastOperationIdentifier) {
        enrollingBaselines.push({
          targetIdentifier: baseline.targetIdentifier!,
          operationId: baseline.statusSummary.lastOperationIdentifier,
        });
      }
    }

    return { driftedOus, enrollingBaselines };
  }

  /**
   * Wait for a single baseline operation to complete.
   * @param client {@link ControlTowerClient}
   * @param targetIdentifier string - for logging
   * @param operationId string
   * @param timeoutInMinutes number - total timeout budget
   * @param elapsedInMinutes number - time already spent
   * @returns updated elapsedInMinutes
   */
  private async waitForOperation(
    client: ControlTowerClient,
    targetIdentifier: string,
    operationId: string,
    timeoutInMinutes: number,
    elapsedInMinutes: number,
  ): Promise<number> {
    const queryIntervalInMinutes = 2;
    const targetId = EnrollAccountsModule.getIdFromArn(targetIdentifier);

    while (true) {
      const status = await this.getBaselineOperationStatus(client, targetIdentifier, operationId);
      if (status === BaselineOperationStatus.SUCCEEDED) {
        return elapsedInMinutes;
      }

      await delay(queryIntervalInMinutes);
      elapsedInMinutes += queryIntervalInMinutes;

      this.statusLogger.info(
        `Waiting on "${targetId}" to complete. Elapsed: ${elapsedInMinutes}/${timeoutInMinutes} minutes.`,
      );

      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Baseline operations took more than ${timeoutInMinutes} minutes. Waiting on: ${targetId}. Pipeline aborted, please review AWS Control Tower console.`,
        );
      }
    }
  }

  /**
   * Wait for multiple baseline operations to complete concurrently.
   * Polls all operations in parallel until all succeed or timeout is reached.
   * @param client {@link ControlTowerClient}
   * @param operations Array of { targetIdentifier, operationId }
   * @param timeoutInMinutes number - total timeout budget
   * @param elapsedInMinutes number - time already spent
   * @returns updated elapsedInMinutes
   */
  private async waitForAllOperations(
    client: ControlTowerClient,
    operations: { targetIdentifier: string; operationId: string }[],
    timeoutInMinutes: number,
    elapsedInMinutes: number,
  ): Promise<number> {
    const queryIntervalInMinutes = 2;

    let pendingOperations = [...operations];

    while (pendingOperations.length > 0) {
      const results = await Promise.all(
        pendingOperations.map(async op => {
          const status = await this.getBaselineOperationStatus(client, op.targetIdentifier, op.operationId);
          return { ...op, status };
        }),
      );

      pendingOperations = results
        .filter(r => r.status !== BaselineOperationStatus.SUCCEEDED)
        .map(r => ({ targetIdentifier: r.targetIdentifier, operationId: r.operationId }));

      if (pendingOperations.length === 0) {
        break;
      }

      await delay(queryIntervalInMinutes);
      elapsedInMinutes += queryIntervalInMinutes;

      const pendingTargets = pendingOperations
        .map(o => EnrollAccountsModule.getIdFromArn(o.targetIdentifier))
        .join(', ');

      this.statusLogger.info(
        `${pendingOperations.length} operation(s) still in progress (${pendingTargets}). Elapsed: ${elapsedInMinutes}/${timeoutInMinutes} minutes.`,
      );

      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Baseline operations took more than ${timeoutInMinutes} minutes. Waiting on: ${pendingTargets}. Pipeline aborted, please review AWS Control Tower console.`,
        );
      }
    }

    return elapsedInMinutes;
  }

  /**
   * Get the timeout value in minutes, overridable via ENROLL_ACCOUNTS_TIMEOUT_IN_MINUTES env var.
   * @returns number
   */
  private getTimeoutInMinutes(): number {
    const envValue = process.env[BASELINE_OPERATION_TIMEOUT_ENV];
    if (envValue) {
      const parsed = Number(envValue);
      if (!isNaN(parsed) && parsed > 0) {
        this.logger.info(
          `Using timeout override from ${BASELINE_OPERATION_TIMEOUT_ENV}: ${parsed} minutes (default: ${DEFAULT_TIMEOUT_IN_MINUTES}).`,
        );
        return parsed;
      }
      this.logger.warn(
        `Invalid value "${envValue}" for ${BASELINE_OPERATION_TIMEOUT_ENV}, using default ${DEFAULT_TIMEOUT_IN_MINUTES} minutes.`,
      );
    }
    return DEFAULT_TIMEOUT_IN_MINUTES;
  }

  /**
   * Function to reset OU baseline in AWS Control Tower
   * @param client {@link ControlTowerClient}
   * @param ouTargetIdentifier string
   * @param enabledBaselineIdentifier string
   * @returns operationIdentifier string
   */
  private async resetOuBaseline(
    client: ControlTowerClient,
    ouTargetIdentifier: string,
    enabledBaselineIdentifier: string,
  ): Promise<string> {
    const ouId = EnrollAccountsModule.getIdFromArn(ouTargetIdentifier);
    this.logger.info(`Resetting baseline for OU "${ouId}" to re-enroll accounts.`);

    const response = await throttlingBackOff(() =>
      client.send(
        new ResetEnabledBaselineCommand({
          enabledBaselineIdentifier: enabledBaselineIdentifier,
        }),
      ),
    );

    if (!response.operationIdentifier) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ResetEnabledBaseline api did not return operationIdentifier property while resetting baseline for OU "${ouId}".`,
      );
    }

    return response.operationIdentifier;
  }

  /**
   * Function to get the baseline operation status
   * @param client {@link ControlTowerClient}
   * @param targetIdentifier string
   * @param operationIdentifier string
   * @returns operationStatus {@link BaselineOperationStatus}
   */
  private async getBaselineOperationStatus(
    client: ControlTowerClient,
    targetIdentifier: string,
    operationIdentifier: string,
  ): Promise<BaselineOperationStatus> {
    const response = await throttlingBackOff(() =>
      client.send(new GetBaselineOperationCommand({ operationIdentifier })),
    );

    const operationStatus = response.baselineOperation?.status;

    if (!operationStatus) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetBaselineOperation api did not return operationStatus property.`,
      );
    }

    if (operationStatus === BaselineOperationStatus.FAILED) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Baseline operation for "${EnrollAccountsModule.getIdFromArn(targetIdentifier)}" with identifier "${operationIdentifier}" in "${operationStatus}" state. Investigate baseline operation before executing pipeline.`,
      );
    }

    return operationStatus;
  }

  /**
   * Function to get enabled baselines with children included
   * @param client {@link ControlTowerClient}
   * @returns enabledBaselines {@link EnabledBaselineSummary}[]
   */
  private async getEnabledBaselines(client: ControlTowerClient): Promise<EnabledBaselineSummary[]> {
    const enabledBaselines: EnabledBaselineSummary[] = [];
    const paginator = paginateListEnabledBaselines({ client }, { includeChildren: true });
    for await (const page of paginator) {
      for (const enabledBaseline of page.enabledBaselines ?? []) {
        enabledBaselines.push(enabledBaseline);
      }
    }

    return enabledBaselines;
  }

  /**
   * Function to get dry run response showing only items that need action
   * @param moduleName string
   * @param operation string
   * @param changeSet {@link IChangeSet}
   * @returns string
   */
  private getDryRunResponse(moduleName: string, operation: string, changeSet: IChangeSet): string {
    if (changeSet.driftedOus.length === 0 && changeSet.enrollingBaselines.length === 0) {
      return generateDryRunResponse(
        moduleName,
        operation,
        'No OUs with accounts to enroll and no accounts currently enrolling. No action needed.',
      );
    }

    const lines: string[] = [];

    if (changeSet.driftedOus.length > 0) {
      lines.push(`(${changeSet.driftedOus.length}) OUs have drifted:`);
      for (const ou of changeSet.driftedOus) {
        lines.push(
          `  - OU: ${EnrollAccountsModule.getIdFromArn(ou.targetIdentifier)} → Will reset baseline to enroll accounts`,
        );
      }
    }

    if (changeSet.enrollingBaselines.length > 0) {
      lines.push(`(${changeSet.enrollingBaselines.length}) Accounts are enrolling into Control Tower:`);
      for (const baseline of changeSet.enrollingBaselines) {
        lines.push(
          `  - Account: ${EnrollAccountsModule.getIdFromArn(baseline.targetIdentifier)} | operationId: ${baseline.operationId} → Will wait for enrollment to complete`,
        );
      }
    }

    return generateDryRunResponse(moduleName, operation, lines.join('\n'));
  }
}
