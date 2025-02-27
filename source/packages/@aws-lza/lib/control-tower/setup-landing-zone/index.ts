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

import path from 'path';

import {
  ControlTowerClient,
  CreateLandingZoneCommand,
  CreateLandingZoneCommandInput,
  GetLandingZoneOperationCommand,
  LandingZoneOperationStatus,
  LandingZoneStatus,
  ResetLandingZoneCommand,
  UpdateLandingZoneCommand,
} from '@aws-sdk/client-controltower';
import { Account } from '@aws-sdk/client-organizations';

import {
  ControlTowerLandingZoneConfigType,
  ControlTowerLandingZoneDetailsType,
  LandingZoneUpdateOrResetRequiredType,
} from './resources';

import { landingZoneUpdateOrResetRequired, makeManifestDocument } from './functions';

import { IamRole } from './prerequisites/iam-role';
import { KmsKey } from './prerequisites/kms-key';
import { Organization } from './prerequisites/organization';
import { SharedAccount } from './prerequisites/shared-account';

import {
  delay,
  generateDryRunResponse,
  getLandingZoneDetails,
  getLandingZoneIdentifier,
  getModuleDefaultParameters,
  setRetryStrategy,
} from '../../../common/functions';
import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import { AcceleratorModuleName, IModuleDefaultParameter } from '../../../common/resources';
import {
  ISetupLandingZoneConfiguration,
  ISetupLandingZoneHandlerParameter,
  ISetupLandingZoneModule,
} from '../../../interfaces/control-tower/setup-landing-zone';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * SetupLandingZoneModule class to manage AWS Control Tower Landing Zone operation.
 */
export class SetupLandingZoneModule implements ISetupLandingZoneModule {
  /**
   * Handler function to manage AWS Control Tower Landing Zone
   *
   * @remarks
   * When AWS Control Tower Landing Zone is not configured this function will perform complete pre-requisites and create then landing zone.
   * When AWS Control Tower Landing Zone is configured, based ```controlTower.landingZone``` configuration in global config file, function will update the landing zone.
   * When existing AWS Control Tower Landing Zone is drifted, function will reset the landing zone.
   * @param props {@link ISetupLandingZoneHandlerParameter}
   * @returns status string
   */
  public async handler(props: ISetupLandingZoneHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link ISetupLandingZoneHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: ISetupLandingZoneHandlerParameter): Promise<string> {
    //
    // Set default values
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.CONTROL_TOWER_LANDING_ZONE, props);

    //
    // Initialize AWS Control Tower client
    //
    const client: ControlTowerClient = new ControlTowerClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    //
    // Get Landing Zone identifier
    //
    const landingZoneIdentifier = await getLandingZoneIdentifier(client);

    // When no existing LZ and dry run was executed
    if (!landingZoneIdentifier && defaultProps.dryRun) {
      return this.getDryRunResponse(defaultProps.moduleName, props.operation);
    }

    //
    // Complete AWS Control Tower pre-requisites
    //
    const preRequisitesResources = await ControlTowerPreRequisites.completePreRequisites(
      props,
      defaultProps.globalRegion,
      defaultProps.useExistingRole,
      landingZoneIdentifier,
    );

    const organizationAccountDetailsByEmail: Account[] = [];
    const promises: Promise<Account>[] = [];

    // LogArchive Account
    promises.push(
      Organization.getOrganizationAccountDetailsByEmail(
        defaultProps.globalRegion,
        props.configuration.sharedAccounts.logging.email,
        props.credentials,
        props.solutionId,
      ),
    );

    // Audit Account
    promises.push(
      Organization.getOrganizationAccountDetailsByEmail(
        defaultProps.globalRegion,
        props.configuration.sharedAccounts.audit.email,
        props.credentials,
        props.solutionId,
      ),
    );

    organizationAccountDetailsByEmail.push(...(await Promise.all(promises)));

    const logArchiveAccount = organizationAccountDetailsByEmail.find(
      item => item.Email === props.configuration.sharedAccounts.logging.email,
    );

    const auditAccount = organizationAccountDetailsByEmail.find(
      item => item.Email === props.configuration.sharedAccounts.audit.email,
    );

    const landingZoneConfiguration = this.getControlTowerLandingZoneConfig(
      defaultProps.globalRegion,
      logArchiveAccount!.Id!,
      auditAccount!.Id!,
      props.configuration,
    );

    const landingZoneDetails = await getLandingZoneDetails(client, props.region, landingZoneIdentifier);

    if (landingZoneDetails) {
      return await this.handleUpdateResetOperation(
        props,
        defaultProps,
        client,
        landingZoneConfiguration,
        landingZoneDetails,
        landingZoneIdentifier,
      );
    } else {
      return await LandingZoneOperation.createLandingZone(
        client,
        landingZoneConfiguration,
        preRequisitesResources!.kmsKeyArn,
        defaultProps.moduleName,
      );
    }
  }

  /**
   * Function to get AWS Control Tower Landing Zone configuration
   * @param globalRegion string
   * @param logArchiveAccountId string
   * @param auditAccountId string
   * @param landingZoneConfig {@link ISetupLandingZoneConfiguration}
   * @returns config {@link ControlTowerLandingZoneConfigType}
   */
  private getControlTowerLandingZoneConfig(
    globalRegion: string,
    logArchiveAccountId: string,
    auditAccountId: string,
    landingZoneConfig: ISetupLandingZoneConfiguration,
  ): ControlTowerLandingZoneConfigType {
    const governedRegions: string[] = landingZoneConfig.enabledRegions;

    //
    // By default Accelerator will add global region to be governed by AWS CT
    //
    if (!landingZoneConfig.enabledRegions.includes(globalRegion)) {
      governedRegions.push(globalRegion);
    }

    return {
      version: landingZoneConfig.version,
      governedRegions,
      logArchiveAccountId,
      auditAccountId,
      enableIdentityCenterAccess: landingZoneConfig.security.enableIdentityCenterAccess,
      loggingBucketRetentionDays: landingZoneConfig.logging.retention.loggingBucket,
      accessLoggingBucketRetentionDays: landingZoneConfig.logging.retention.accessLoggingBucket,
      enableOrganizationTrail: landingZoneConfig.logging.organizationTrail,
    };
  }

  /**
   * Function to get display for dry run
   * @param moduleName string
   * @param moduleOperation string
   * @param landingZoneIdentifier string | undefined
   * @param landingZoneUpdateOrResetStatus {@link LandingZoneUpdateOrResetRequiredType} | undefined
   * @returns status string
   */
  private getDryRunResponse(
    moduleName: string,
    moduleOperation: string,
    landingZoneIdentifier?: string,
    landingZoneUpdateOrResetStatus?: LandingZoneUpdateOrResetRequiredType,
    landingZoneDetails?: ControlTowerLandingZoneDetailsType,
  ): string {
    if (landingZoneIdentifier && landingZoneUpdateOrResetStatus) {
      if (!landingZoneUpdateOrResetStatus.resetRequired && !landingZoneUpdateOrResetStatus.updateRequired) {
        const message = `Existing AWS Control Tower landing zone found, no changes required`;
        logger.info(message);
        return generateDryRunResponse(moduleName, moduleOperation, message);
      }
      const operation = landingZoneUpdateOrResetStatus.resetRequired ? 'reset' : 'update';
      let message = `Existing AWS Control Tower landing zone found, ${operation} is required for following changes\n ${landingZoneUpdateOrResetStatus.reason}`;
      if (landingZoneDetails && landingZoneDetails.status !== LandingZoneStatus.ACTIVE) {
        message = `${message}.\n Will experience ${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}. Reason AWS Control Tower not in "${LandingZoneStatus.ACTIVE}" status, current status is "${landingZoneDetails.status}".`;
      }

      logger.info(message);
      return generateDryRunResponse(moduleName, moduleOperation, message);
    }

    const message = `No existing AWS Control Tower landing zone found it will be created`;
    logger.info(message);
    return generateDryRunResponse(moduleName, moduleOperation, message);
  }

  /**
   * Function to handle update and reset operation
   * @param props {@link ISetupLandingZoneHandlerParameter}
   * @param defaultProps {@link IModuleDefaultParameter}
   * @param client {@link ControlTowerClient}
   * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
   * @param landingZoneDetails {@link ControlTowerLandingZoneDetailsType}
   * @param landingZoneIdentifier string | undefined
   * @returns status string
   */
  private async handleUpdateResetOperation(
    props: ISetupLandingZoneHandlerParameter,
    defaultProps: IModuleDefaultParameter,
    client: ControlTowerClient,
    landingZoneConfiguration: ControlTowerLandingZoneConfigType,
    landingZoneDetails: ControlTowerLandingZoneDetailsType,
    landingZoneIdentifier?: string,
  ): Promise<string> {
    const landingZoneUpdateOrResetStatus = landingZoneUpdateOrResetRequired(
      landingZoneConfiguration,
      landingZoneDetails,
    );

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        landingZoneIdentifier,
        landingZoneUpdateOrResetStatus,
        landingZoneDetails,
      );
    }

    if (landingZoneDetails.status === LandingZoneStatus.PROCESSING && !defaultProps.dryRun) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone update operation failed with error - ConflictException - AWS Control Tower cannot begin landing zone setup while another execution is in progress.`,
      );
    }

    if (landingZoneDetails.status === LandingZoneStatus.FAILED && !defaultProps.dryRun) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone Module has status of "${LandingZoneStatus.FAILED}". Before continuing, proceed to AWS Control Tower and evaluate the status`,
      );
    }

    if (landingZoneUpdateOrResetStatus.updateRequired) {
      return await LandingZoneOperation.updateLandingZone(
        client,
        landingZoneUpdateOrResetStatus.targetVersion,
        landingZoneUpdateOrResetStatus.reason,
        landingZoneConfiguration,
        landingZoneDetails,
        defaultProps.moduleName,
      );
    }

    if (landingZoneUpdateOrResetStatus.resetRequired) {
      return await LandingZoneOperation.resetLandingZone(
        client,
        landingZoneDetails.landingZoneIdentifier,
        landingZoneUpdateOrResetStatus.reason,
        defaultProps.moduleName,
      );
    }

    // When no changes required
    return `Module "${defaultProps.moduleName}" completed successfully with status ${landingZoneUpdateOrResetStatus.reason}`;
  }
}
/**
 * LandingZoneOperation an abstract class to perform following AWS Control Tower operation
 *
 * - Create AWS Control Tower Landing Zone
 * - Reset AWS Control Tower Landing Zone
 * - Update AWS Control Tower Landing Zone
 */
abstract class LandingZoneOperation {
  /**
   * Function to deploy the landing zone
   * @param client {@link ControlTowerClient}
   * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
   * @param kmsKeyArn string
   * @param moduleName string
   * @returns operationIdentifier string
   */
  public static async createLandingZone(
    client: ControlTowerClient,
    landingZoneConfiguration: ControlTowerLandingZoneConfigType,
    kmsKeyArn: string,
    moduleName: string,
  ): Promise<string> {
    const manifestDocument = makeManifestDocument(landingZoneConfiguration, 'CREATE', 'Security', kmsKeyArn);
    const param: CreateLandingZoneCommandInput = {
      version: landingZoneConfiguration.version,
      manifest: manifestDocument,
    };

    const response = await throttlingBackOff(() => client.send(new CreateLandingZoneCommand(param)));

    const operationIdentifier = response.operationIdentifier;

    if (!operationIdentifier) {
      logger.warn(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: CreateLandingZoneCommand did not return operationIdentifier`,
      );
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: CreateLandingZoneCommand did not return operationIdentifier`,
      );
    }

    logger.info(
      `The Landing Zone deployment operation has started asynchronously (ID: ${operationIdentifier}). The process will continue running independent of this session.`,
    );

    await LandingZoneOperation.waitUntilOperationCompletes(client, operationIdentifier);

    return `Module "${moduleName}" The Landing Zone deployed successfully.`;
  }

  /**
   * Function to reset the landing zone
   * @param client {@link ControlTowerClient}
   * @param landingZoneIdentifier string
   * @param reason string
   * @returns status string
   */
  public static async resetLandingZone(
    client: ControlTowerClient,
    landingZoneIdentifier: string,
    reason: string,
    moduleName: string,
  ): Promise<string> {
    logger.info(`The Landing Zone reset operation will begin, because "${reason}"`);
    const response = await throttlingBackOff(() => client.send(new ResetLandingZoneCommand({ landingZoneIdentifier })));

    const operationIdentifier = response.operationIdentifier;

    if (!operationIdentifier) {
      logger.warn(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ResetLandingZoneCommand did not return operationIdentifier`);
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ResetLandingZoneCommand did not return operationIdentifier`,
      );
    }

    logger.info(
      `The Landing Zone reset operation has started asynchronously (ID: ${operationIdentifier}). The process will continue running independent of this session.`,
    );

    await LandingZoneOperation.waitUntilOperationCompletes(client, operationIdentifier);

    return `Module "${moduleName}" The Landing Zone reset operation completed successfully.`;
  }

  /**
   * Function to update the landing zone
   *
   * @param client {@link ControlTowerClient}
   * @param targetVersion string
   * @param reason string
   * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
   * @param landingZoneDetails {@link ControlTowerLandingZoneDetailsType}
   * @param moduleName string
   * @returns status string
   */
  public static async updateLandingZone(
    client: ControlTowerClient,
    targetVersion: string,
    reason: string,
    landingZoneConfiguration: ControlTowerLandingZoneConfigType,
    landingZoneDetails: ControlTowerLandingZoneDetailsType,
    moduleName: string,
  ): Promise<string> {
    logger.info(`The Landing Zone update operation will begin, because "${reason}"`);
    if (!landingZoneDetails.securityOuName) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneCommand did not return security Ou name`);
    }

    const manifestDocument = makeManifestDocument(
      landingZoneConfiguration,
      'UPDATE',
      landingZoneDetails.securityOuName,
      landingZoneDetails.kmsKeyArn,
      landingZoneDetails.sandboxOuName,
    );

    const response = await throttlingBackOff(() =>
      client.send(
        new UpdateLandingZoneCommand({
          version: targetVersion,
          landingZoneIdentifier: landingZoneDetails.landingZoneIdentifier,
          manifest: manifestDocument,
        }),
      ),
    );

    const operationIdentifier = response.operationIdentifier;

    if (!operationIdentifier) {
      logger.warn(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: UpdateLandingZoneCommand did not return operationIdentifier`,
      );
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: UpdateLandingZoneCommand did not return operationIdentifier`,
      );
    }

    logger.info(
      `The Landing Zone update operation has started asynchronously (ID: ${operationIdentifier}). The process will continue running independent of this session.`,
    );

    await this.waitUntilOperationCompletes(client, operationIdentifier);

    return `Module "${moduleName}" The Landing Zone update operation completed successfully.`;
  }

  /**
   * Function to check and wait till the landing zone operation completion.
   * @param client {@link ControlTowerClient}
   * @param operationIdentifier string
   * @param region string
   */
  private static async waitUntilOperationCompletes(
    client: ControlTowerClient,
    operationIdentifier: string,
  ): Promise<void> {
    const queryIntervalInMinutes = 5;
    let status = await LandingZoneOperation.getLandingZoneOperationStatus(client, operationIdentifier);

    while (status === LandingZoneOperationStatus.IN_PROGRESS) {
      logger.info(
        `The AWS Control Tower Landing Zone operation with identifier ${operationIdentifier} is currently in ${status} state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked.`,
      );

      await delay(queryIntervalInMinutes);
      status = await LandingZoneOperation.getLandingZoneOperationStatus(client, operationIdentifier);
    }
  }

  /**
   * Function to get the landing zone operation status
   *
   * @param client {@link ControlTowerClient}
   * @param operationIdentifier string
   * @returns landingZoneOperationStatus string
   */
  private static async getLandingZoneOperationStatus(
    client: ControlTowerClient,
    operationIdentifier: string,
  ): Promise<string> {
    const response = await throttlingBackOff(() =>
      client.send(new GetLandingZoneOperationCommand({ operationIdentifier })),
    );

    const operationStatus = response.operationDetails?.status;

    if (!operationStatus) {
      logger.warn(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );
    }

    if (operationStatus === LandingZoneOperationStatus.FAILED) {
      logger.warn(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${operationIdentifier}" in "${operationStatus}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${operationIdentifier}" in "${operationStatus}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );
    }

    return operationStatus;
  }
}

/**
 * ControlTowerPreRequisites an abstract class to perform AWS Control Tower pre-requisites
 *
 * @remarks
 * The following activities are performed by this class
 *
 * - Validate AWS Organizations
 * - Create AWS Control Tower Roles
 * - Create AWS KMS CMK to encrypt AWS Control Tower resources
 * - Create the shared accounts (LogArchive and Audit)
 *
 */
abstract class ControlTowerPreRequisites {
  /**
   * Function to complete AWS Control Tower Landing Zone pre-requisites
   *
   * @remarks
   * The following activities are performed by this function
   *
   * - Validate AWS Organizations
   * - Create AWS Control Tower Roles
   * - Create AWS KMS CMK to encrypt AWS Control Tower resources
   * - Create the shared accounts (LogArchive and Audit)
   *
   * @param props {@link ISetupLandingZoneHandlerParameter}
   * @param globalRegion string
   * @param useExistingRole boolean
   * @param landingZoneIdentifier string | undefined
   * @returns metadata { kmsKeyArn: string } | undefined
   */
  public static async completePreRequisites(
    props: ISetupLandingZoneHandlerParameter,
    globalRegion: string,
    useExistingRole: boolean,
    landingZoneIdentifier?: string,
  ): Promise<{ kmsKeyArn: string } | undefined> {
    if (!landingZoneIdentifier) {
      await Organization.validate(
        globalRegion,
        props.region,
        props.partition,
        {
          logArchive: props.configuration.sharedAccounts.logging.email,
          audit: props.configuration.sharedAccounts.audit.email,
        },
        props.credentials,
        props.solutionId,
      );

      const organizationManagementAccountDetails = await Organization.getOrganizationAccountDetailsByEmail(
        globalRegion,
        props.configuration.sharedAccounts.management.email,
        props.credentials,
        props.solutionId,
      );

      const managementAccountId = organizationManagementAccountDetails.Id!;

      if (!useExistingRole) {
        await IamRole.createControlTowerRoles(props.partition, props.region, props.solutionId, props.credentials);
        // giving time to complete Role creation completes, otherwise ValidationException - CUSTOMER_ASSUME_ROLE_FAILED error occurs
        logger.info(`Created AWS Control Tower roles, sleeping for 5 minutes for role creations to complete.`);
        await delay(5);
      }

      //
      // Do not create accounts for US GovCloud
      //
      if (props.partition !== 'aws-us-gov') {
        await SharedAccount.createAccounts(
          props.configuration.sharedAccounts.logging,
          props.configuration.sharedAccounts.audit,
          globalRegion,
          props.solutionId,
          props.credentials,
        );
      }

      const kmsKeyArn = await KmsKey.createControlTowerKey(
        props.partition,
        managementAccountId,
        props.region,
        props.solutionId,
        props.credentials,
      );
      return { kmsKeyArn };
    }

    return undefined;
  }
}
