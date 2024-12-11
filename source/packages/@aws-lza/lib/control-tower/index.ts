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

import { version } from '../../package.json';

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
  landingZoneUpdateOrResetRequired,
  LandingZoneUpdateOrResetRequiredType,
  makeManifestDocument,
} from './utils/resources';

import { IamRole } from './prerequisites/iam-role';
import { KmsKey } from './prerequisites/kms-key';
import { Organization } from './prerequisites/organization';
import { SharedAccount } from './prerequisites/shared-account';

import {
  IAcceleratorControlTowerLandingZoneModule,
  IControlTowerLandingZoneConfiguration,
  IControlTowerLandingZoneHandlerParameter,
} from '../../interfaces/control-tower';

import { delay, getLandingZoneDetails, getLandingZoneIdentifier, setRetryStrategy } from '../../common/functions';
import { createLogger } from '../../common/logger';
import { throttlingBackOff } from '../../common/throttle';
import { AcceleratorModuleName } from '../../common/resources';

type DefaultPropsType = { moduleName: string; globalRegion: string; solutionId: string; useExistingRole: boolean };

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * AcceleratorControlTowerLandingZoneModule class to manage AWS Control Tower Landing Zone operation.
 */
export class AcceleratorControlTowerLandingZoneModule implements IAcceleratorControlTowerLandingZoneModule {
  /**
   * Handler function to manage AWS Control Tower Landing Zone
   *
   * @remarks
   * When AWS Control Tower Landing Zone is not configured this function will perform complete pre-requisites and create then landing zone.
   * When AWS Control Tower Landing Zone is configured, based ```controlTower.landingZone``` configuration in global config file, function will update the landing zone.
   * When existing AWS Control Tower Landing Zone is drifted, function will reset the landing zone.
   * @param props {@link IControlTowerLandingZoneHandlerParameter}
   * @returns status string
   */
  public async handler(props: IControlTowerLandingZoneHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IControlTowerLandingZoneHandlerParameter}
   * @returns status string
   */
  private async manageModule(props: IControlTowerLandingZoneHandlerParameter): Promise<string> {
    //
    // Set default values
    //
    const defaultProps: DefaultPropsType = {
      moduleName: props.moduleName ?? AcceleratorModuleName.CONTROL_TOWER,
      globalRegion: props.globalRegion ?? props.homeRegion,
      solutionId: props.solutionId ?? `AwsSolution/SO0199/${version}`,
      useExistingRole: props.useExistingRole ?? false,
    };

    //
    // Initialize AWS Control Tower client
    //
    const client: ControlTowerClient = new ControlTowerClient({
      region: props.homeRegion,
      customUserAgent: defaultProps.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.managementAccountCredentials,
    });

    //
    // Get Landing Zone identifier
    //
    const landingZoneIdentifier = await getLandingZoneIdentifier(client);

    // When no existing LZ and dry run was executed
    if (!landingZoneIdentifier && props.dryRun) {
      return this.getDryRunResponse(props, defaultProps);
    }

    //
    // Complete AWS Control Tower pre-requisites
    //
    const preRequisitesResources = await ControlTowerPreRequisites.completePreRequisites(
      props,
      defaultProps,
      landingZoneIdentifier,
    );

    const organizationAccountDetailsByEmail: Account[] = [];
    const promises: Promise<Account>[] = [];

    // LogArchive Account
    promises.push(
      Organization.getOrganizationAccountDetailsByEmail(
        defaultProps.globalRegion,
        defaultProps.solutionId,
        props.configuration.sharedAccounts.logging.email,
        props.managementAccountCredentials,
      ),
    );

    // Audit Account
    promises.push(
      Organization.getOrganizationAccountDetailsByEmail(
        defaultProps.globalRegion,
        defaultProps.solutionId,
        props.configuration.sharedAccounts.audit.email,
        props.managementAccountCredentials,
      ),
    );

    organizationAccountDetailsByEmail.push(...(await Promise.all(promises)));

    const logArchiveAccountId = organizationAccountDetailsByEmail.find(
      item => item.Email === props.configuration.sharedAccounts.logging.email,
    );

    const auditAccountId = organizationAccountDetailsByEmail.find(
      item => item.Email === props.configuration.sharedAccounts.audit.email,
    );

    const landingZoneConfiguration = this.getControlTowerLandingZoneConfig(
      defaultProps.globalRegion,
      logArchiveAccountId!.Id!,
      auditAccountId!.Id!,
      props.configuration,
    );

    const landingZoneDetails = await getLandingZoneDetails(client, props.homeRegion, landingZoneIdentifier);

    if (landingZoneDetails?.status === LandingZoneStatus.PROCESSING && !props.dryRun) {
      throw new Error(
        `Module "${defaultProps.moduleName}" The Landing Zone update operation failed with error - ConflictException - AWS Control Tower cannot begin landing zone setup while another execution is in progress.`,
      );
    }

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
        defaultProps,
      );
    }
  }

  /**
   * Function to get AWS Control Tower Landing Zone configuration
   * @param globalRegion string
   * @param logArchiveAccountId string
   * @param auditAccountId string
   * @param landingZoneConfig {@link IControlTowerLandingZoneConfiguration}
   * @returns config {@link ControlTowerLandingZoneConfigType}
   */
  private getControlTowerLandingZoneConfig(
    globalRegion: string,
    logArchiveAccountId: string,
    auditAccountId: string,
    landingZoneConfig: IControlTowerLandingZoneConfiguration,
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
   * @param props {@link IControlTowerLandingZoneHandlerParameter}
   * @param defaultProps {@link DefaultPropsType}
   * @param landingZoneIdentifier string | undefined
   * @param landingZoneUpdateOrResetStatus {@link LandingZoneUpdateOrResetRequiredType} | undefined
   * @returns status string
   */
  private getDryRunResponse(
    props: IControlTowerLandingZoneHandlerParameter,
    defaultProps: DefaultPropsType,
    landingZoneIdentifier?: string,
    landingZoneUpdateOrResetStatus?: LandingZoneUpdateOrResetRequiredType,
  ): string {
    const status = `[DRY-RUN]: "${defaultProps.moduleName}" "${props.operation}" operation validated successfully (no actual changes were made)`;
    if (landingZoneIdentifier) {
      if (!landingZoneUpdateOrResetStatus?.resetRequired && !landingZoneUpdateOrResetStatus?.updateRequired) {
        logger.info(`Existing AWS Control Tower landing zone found, no changes required`);
        return status;
      }
      const operation = landingZoneUpdateOrResetStatus!.resetRequired ? 'reset' : 'update';
      logger.info(`Existing AWS Control Tower landing zone found, ${operation} is required for following changes`);
      logger.info(`${landingZoneUpdateOrResetStatus!.reason}`);
      return status;
    } else {
      logger.info(`No existing AWS Control Tower landing zone found it will be created`);
      return status;
    }
  }

  /**
   * Function to handle update and reset operation
   * @param props {@link IControlTowerLandingZoneHandlerParameter}
   * @param defaultProps {@link DefaultPropsType}
   * @param client {@link ControlTowerClient}
   * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
   * @param landingZoneDetails {@link ControlTowerLandingZoneDetailsType}
   * @param landingZoneIdentifier string | undefined
   * @returns status string
   */
  private async handleUpdateResetOperation(
    props: IControlTowerLandingZoneHandlerParameter,
    defaultProps: DefaultPropsType,
    client: ControlTowerClient,
    landingZoneConfiguration: ControlTowerLandingZoneConfigType,
    landingZoneDetails: ControlTowerLandingZoneDetailsType,
    landingZoneIdentifier?: string,
  ): Promise<string> {
    const landingZoneUpdateOrResetStatus = landingZoneUpdateOrResetRequired(
      landingZoneConfiguration,
      landingZoneDetails,
    );

    if (props.dryRun) {
      return this.getDryRunResponse(props, defaultProps, landingZoneIdentifier, landingZoneUpdateOrResetStatus);
    }

    if (landingZoneUpdateOrResetStatus.updateRequired) {
      return await LandingZoneOperation.updateLandingZone(
        client,
        landingZoneUpdateOrResetStatus.targetVersion,
        landingZoneUpdateOrResetStatus.reason,
        landingZoneConfiguration,
        landingZoneDetails,
        defaultProps,
      );
    }

    if (landingZoneUpdateOrResetStatus.resetRequired) {
      return await LandingZoneOperation.resetLandingZone(
        client,
        landingZoneDetails.landingZoneIdentifier,
        landingZoneUpdateOrResetStatus.reason,
        defaultProps,
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
   * @returns operationIdentifier string
   */
  public static async createLandingZone(
    client: ControlTowerClient,
    landingZoneConfiguration: ControlTowerLandingZoneConfigType,
    kmsKeyArn: string,
    defaultProps: DefaultPropsType,
  ): Promise<string> {
    const manifestDocument = makeManifestDocument(landingZoneConfiguration, 'CREATE', kmsKeyArn);
    const param: CreateLandingZoneCommandInput = {
      version: landingZoneConfiguration.version,
      manifest: manifestDocument,
    };

    const response = await throttlingBackOff(() => client.send(new CreateLandingZoneCommand(param)));

    const operationIdentifier = response.operationIdentifier;

    if (!operationIdentifier) {
      logger.warn(
        `AWS Control Tower Landing Zone create operation api didn't return operation identifier. API return ${operationIdentifier} for operation identifier`,
      );
      throw new Error(
        `AWS Control Tower Landing Zone create operation api didn't return operation identifier. Solution cannot verify successful completion of AWS Control Tower Landing Zone operation.`,
      );
    }

    logger.info(
      `The Landing Zone deployment operation has started asynchronously (ID: ${operationIdentifier}). The process will continue running independent of this session.`,
    );

    await LandingZoneOperation.waitUntilOperationCompletes(client, operationIdentifier);

    return `Module "${defaultProps.moduleName}" The Landing Zone deployed successfully.`;
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
    defaultProps: DefaultPropsType,
  ): Promise<string> {
    logger.info(`The Landing Zone reset operation will begin, because "${reason}"`);
    const response = await throttlingBackOff(() => client.send(new ResetLandingZoneCommand({ landingZoneIdentifier })));

    const operationIdentifier = response.operationIdentifier;

    if (!operationIdentifier) {
      logger.warn(
        `AWS Control Tower Landing Zone reset operation api didn't return operation identifier. API return ${operationIdentifier} for operation identifier`,
      );
      throw new Error(
        `AWS Control Tower Landing Zone reset operation api didn't return operation identifier. Solution cannot verify successful completion of AWS Control Tower Landing Zone operation.`,
      );
    }

    logger.info(
      `The Landing Zone reset operation has started asynchronously (ID: ${operationIdentifier}). The process will continue running independent of this session.`,
    );

    await LandingZoneOperation.waitUntilOperationCompletes(client, operationIdentifier);

    return `Module "${defaultProps.moduleName}" The Landing Zone reset operation completed successfully.`;
  }

  /**
   * Function to update the landing zone
   *
   * @param client {@link ControlTowerClient}
   * @param targetVersion string
   * @param reason string
   * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
   * @param landingZoneDetails {@link ControlTowerLandingZoneDetailsType}
   * @param defaultProps {@link DefaultPropsType}
   * @returns status string
   */
  public static async updateLandingZone(
    client: ControlTowerClient,
    targetVersion: string,
    reason: string,
    landingZoneConfiguration: ControlTowerLandingZoneConfigType,
    landingZoneDetails: ControlTowerLandingZoneDetailsType,
    defaultProps: DefaultPropsType,
  ): Promise<string> {
    logger.info(`The Landing Zone update operation will begin, because "${reason}"`);
    const manifestDocument = makeManifestDocument(
      landingZoneConfiguration,
      'UPDATE',
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
        `AWS Control Tower Landing Zone update operation api didn't return operation identifier. API return ${operationIdentifier} for operation identifier`,
      );
      throw new Error(
        `AWS Control Tower Landing Zone update operation api didn't return operation identifier. Solution cannot verify successful completion of AWS Control Tower Landing Zone operation.`,
      );
    }

    logger.info(
      `The Landing Zone update operation has started asynchronously (ID: ${operationIdentifier}). The process will continue running independent of this session.`,
    );

    await this.waitUntilOperationCompletes(client, operationIdentifier);

    return `Module "${defaultProps.moduleName}" The Landing Zone update operation completed successfully.`;
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
        `AWS Control Tower Landing Zone get landing zone operation api didn't return operation status. API returned ${operationStatus} for operation status.`,
      );
      throw new Error(
        `AWS Control Tower Landing Zone get landing zone operation api didn't return operation status. Solution cannot verify successful completion of Landing Zone operation.`,
      );
    }

    if (operationStatus === LandingZoneOperationStatus.FAILED) {
      logger.warn(
        `AWS Control Tower Landing Zone operation with identifier ${operationIdentifier} in ${response.operationDetails?.status} state !!!!. Please investigate CT operation before executing pipeline`,
      );
      throw new Error(
        `AWS Control Tower Landing Zone operation with identifier ${operationIdentifier} in ${response.operationDetails?.status} state !!!!. Please investigate CT operation before executing pipeline`,
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
   * @param props {@link IControlTowerLandingZoneHandlerParameter}
   * @param defaultProps {@link DefaultPropsType}
   * @param landingZoneIdentifier string | undefined
   * @returns metadata { kmsKeyArn: string } | undefined
   */
  public static async completePreRequisites(
    props: IControlTowerLandingZoneHandlerParameter,
    defaultProps: DefaultPropsType,
    landingZoneIdentifier?: string,
  ): Promise<{ kmsKeyArn: string } | undefined> {
    if (!landingZoneIdentifier) {
      await Organization.validate(
        defaultProps.globalRegion,
        props.homeRegion,
        defaultProps.solutionId,
        props.partition,
        {
          logArchive: props.configuration.sharedAccounts.logging.email,
          audit: props.configuration.sharedAccounts.audit.email,
        },
        props.managementAccountCredentials,
      );

      const organizationManagementAccountDetails = await Organization.getOrganizationAccountDetailsByEmail(
        defaultProps.globalRegion,
        defaultProps.solutionId,
        props.configuration.sharedAccounts.management.email,
        props.managementAccountCredentials,
      );

      const managementAccountId = organizationManagementAccountDetails.Id!;

      if (!props.useExistingRole) {
        await IamRole.createControlTowerRoles(
          props.partition,
          props.homeRegion,
          defaultProps.solutionId,
          props.managementAccountCredentials,
        );
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
          defaultProps.globalRegion,
          defaultProps.solutionId,
          props.managementAccountCredentials,
        );
      }

      const kmsKeyArn = await KmsKey.createControlTowerKey(
        props.partition,
        managementAccountId,
        props.homeRegion,
        defaultProps.solutionId,
        props.managementAccountCredentials,
      );
      return { kmsKeyArn };
    }

    return undefined;
  }
}
