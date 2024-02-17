import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import {
  ControlTowerClient,
  CreateLandingZoneCommand,
  CreateLandingZoneCommandInput,
  GetLandingZoneCommand,
  GetLandingZoneOperationCommand,
  LandingZoneOperationStatus,
  LandingZoneStatus,
  ListLandingZonesCommand,
  ResetLandingZoneCommand,
  UpdateLandingZoneCommand,
} from '@aws-sdk/client-controltower';
import { AccountsConfig, GlobalConfig } from '@aws-accelerator/config';

import * as winston from 'winston';
import {
  ControlTowerLandingZoneConfigType,
  ControlTowerLandingZoneDetailsType,
  delay,
  isLandingZoneUpdateOrResetRequired,
  makeManifestDocument,
} from './utils/resources';
import { IamRole } from './prerequisites/iam-role';
import { KmsKey } from './prerequisites/kms-key';
import path from 'path';
import { Organization } from './prerequisites/organization';
import { SharedAccount } from './prerequisites/shared-account';
import { ModuleOptionsType, getGlobalRegion } from '../../common/resources';
import { AcceleratorModule } from '../accelerator-module';
import { AcceleratorConfigLoader } from '../../common/accelerator-config-loader';

const logger: winston.Logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * ControlTowerLandingZone class to manage AWS Control Tower Landing Zone operation.
 */
export class ControlTowerLandingZone implements AcceleratorModule {
  /**
   * Function to get the landing zone identifier.
   *
   * @remarks
   * Function returns undefined when there is no landing zone configured, otherwise returns arn for the landing zone.
   * If there are multiple landing zone deployment found, function will return error.
   * @returns landingZoneIdentifier string | undefined
   *
   * @param client {@link ControlTowerClient}
   * @returns landingZoneIdentifier string | undefined
   */
  private async getLandingZoneIdentifier(client: ControlTowerClient): Promise<string | undefined> {
    const response = await throttlingBackOff(() => client.send(new ListLandingZonesCommand({})));

    if (response.landingZones?.length === 1 && response.landingZones[0].arn) {
      logger.info(`There is an existing AWS Control Tower Landing Zone ${response.landingZones[0].arn}.`);
      return response.landingZones[0].arn;
    }

    if (response.landingZones!.length! > 1) {
      throw new Error(
        `Multiple AWS Control Tower Landing Zone configuration found, list of Landing Zone arns are - ${response.landingZones?.join(
          ',',
        )}`,
      );
    }
    return undefined;
  }

  /**
   * Function to get the landing zone details
   * @param client {@link ControlTowerClient}
   * @param region string
   * @param landingZoneIdentifier string| undefined
   * @returns landingZoneDetails {@link ControlTowerLandingZoneDetailsType} | undefined
   */
  private async getLandingZoneDetails(
    client: ControlTowerClient,
    region: string,
    landingZoneIdentifier?: string,
  ): Promise<ControlTowerLandingZoneDetailsType | undefined> {
    if (!landingZoneIdentifier) {
      return undefined;
    }

    const landingZoneDetails: ControlTowerLandingZoneDetailsType = { landingZoneIdentifier: landingZoneIdentifier };

    try {
      const response = await throttlingBackOff(() =>
        client.send(new GetLandingZoneCommand({ landingZoneIdentifier: landingZoneIdentifier })),
      );

      if (response.landingZone) {
        for (const [key, value] of Object.entries(response.landingZone.manifest!)) {
          switch (key) {
            case 'governedRegions':
              landingZoneDetails.governedRegions = value;
              break;
            case 'accessManagement':
              landingZoneDetails.enableIdentityCenterAccess = value['enabled'];
              break;
            case 'organizationStructure':
              landingZoneDetails.securityOuName = value['security']['name'];
              if (value['sandbox']) {
                landingZoneDetails.sandboxOuName = value['sandbox']['name'];
              }
              break;
            case 'centralizedLogging':
              landingZoneDetails.loggingBucketRetentionDays = value['configurations']['loggingBucket']['retentionDays'];
              landingZoneDetails.accessLoggingBucketRetentionDays =
                value['configurations']['accessLoggingBucket']['retentionDays'];
              landingZoneDetails.kmsKeyArn = value['configurations']['kmsKeyArn'];
              break;
          }
        }
        landingZoneDetails.landingZoneIdentifier = response.landingZone.arn!;
        landingZoneDetails.status = response.landingZone.status!;
        landingZoneDetails.version = response.landingZone.version!;
        landingZoneDetails.latestAvailableVersion = response.landingZone.latestAvailableVersion!;
        landingZoneDetails.driftStatus = response.landingZone.driftStatus!.status!;
      }
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e.name === 'ResourceNotFoundException' && landingZoneIdentifier) {
        logger.warn(
          `Existing AWS Control Tower Landing Zone home region differs from the executing environment region ${region}. Existing Landing Zone identifier is ${landingZoneIdentifier}`,
        );
        throw new Error(
          `Existing AWS Control Tower Landing Zone home region differs from the executing environment region ${region}. Existing Landing Zone identifier is ${landingZoneIdentifier}`,
        );
      }
      throw e;
    }

    return landingZoneDetails;
  }

  /**
   * Function to get the landing zone operation status
   *
   * @param operationIdentifier string
   * @param region string
   * @param solutionId string
   * @returns landingZoneOperationStatus string
   */
  private async getLandingZoneOperationStatus(
    operationIdentifier: string,
    region: string,
    solutionId: string,
  ): Promise<string> {
    const controlTowerClient = new ControlTowerClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });

    const response = await throttlingBackOff(() =>
      controlTowerClient.send(new GetLandingZoneOperationCommand({ operationIdentifier })),
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

  /**
   * Function to get AWS Control Tower Landing Zone configuration
   * @param globalConfig {@link GlobalConfig}
   * @param accountsConfig {@link AccountsConfig}
   * @returns config {@link ControlTowerLandingZoneConfigType}
   */
  private async getControlTowerLandingZoneConfig(
    globalConfig: GlobalConfig,
    accountsConfig: AccountsConfig,
  ): Promise<ControlTowerLandingZoneConfigType> {
    const landingZoneConfig = globalConfig.controlTower.landingZone!;

    return {
      version: landingZoneConfig.version,
      governedRegions: globalConfig.enabledRegions,
      logArchiveAccountId: accountsConfig.getLogArchiveAccountId(),
      auditAccountId: accountsConfig.getAuditAccountId(),
      enableIdentityCenterAccess: landingZoneConfig.security.enableIdentityCenterAccess,
      loggingBucketRetentionDays: landingZoneConfig.logging.loggingBucketRetentionDays,
      accessLoggingBucketRetentionDays: landingZoneConfig.logging.accessLoggingBucketRetentionDays,
      enableOrganizationTrail: landingZoneConfig.logging.organizationTrail,
    };
  }

  /**
   * Function to check and wait till the landing zone operation completion.
   * @param operationIdentifier string
   * @param region string
   */
  private async waitTillOperationCompletes(
    operationIdentifier: string,
    region: string,
    solutionId: string,
  ): Promise<void> {
    const queryIntervalInMinutes = 5;
    let status = await this.getLandingZoneOperationStatus(operationIdentifier, region, solutionId);

    while (status !== LandingZoneOperationStatus.SUCCEEDED) {
      logger.info(
        `The AWS Control Tower Landing Zone operation with identifier ${operationIdentifier} is currently in ${status} state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked.`,
      );

      await delay(queryIntervalInMinutes);
      status = await this.getLandingZoneOperationStatus(operationIdentifier, region, solutionId);
    }
  }

  /**
   * Module manager function
   * @param module string
   * @param props {@link ModuleOptionsType}
   * @returns status string
   */
  private async manageModule(module: string, props: ModuleOptionsType): Promise<string> {
    const globalConfig = GlobalConfig.load(props.configDirPath);
    const accountsConfig = AccountsConfig.load(props.configDirPath);

    if (!globalConfig.controlTower.landingZone) {
      return `The global-config.yaml file did not contain any configuration for AWS Control Tower Landing Zone, no activities for module ${module}.`;
    }

    const client: ControlTowerClient = new ControlTowerClient({
      region: globalConfig.homeRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
    });

    const landingZoneIdentifier = await this.getLandingZoneIdentifier(client);

    const preRequisitesResources = await ControlTowerPreRequisites.completePreRequisites(
      props,
      globalConfig.homeRegion,
      accountsConfig.getManagementAccount().email,
      landingZoneIdentifier,
    );

    const accountsConfigWithAccountIds = await AcceleratorConfigLoader.getAccountsConfigWithAccountIds(
      props.configDirPath,
      props.partition,
    );

    const landingZoneConfiguration = await this.getControlTowerLandingZoneConfig(
      globalConfig,
      accountsConfigWithAccountIds,
    );

    const landingZoneDetails = await this.getLandingZoneDetails(client, globalConfig.homeRegion, landingZoneIdentifier);

    if (landingZoneDetails?.status === LandingZoneStatus.PROCESSING) {
      throw new Error(
        `Module - ${module} The Landing Zone update operation failed with error - ConflictException - AWS Control Tower cannot begin landing zone setup while another execution is in progress.`,
      );
    }

    if (landingZoneDetails) {
      const landingZoneUpdateOrResetStatus = isLandingZoneUpdateOrResetRequired(
        landingZoneConfiguration,
        landingZoneDetails,
      );

      if (landingZoneUpdateOrResetStatus.updateRequired) {
        const operationIdentifier = await LandingZoneOperation.updateLandingZone(
          client,
          landingZoneUpdateOrResetStatus.targetVersion,
          landingZoneUpdateOrResetStatus.reason,
          landingZoneConfiguration,
          landingZoneDetails,
        );
        await this.waitTillOperationCompletes(operationIdentifier, globalConfig.homeRegion, props.solutionId);

        return `Module - ${module} The Landing Zone update operation completed successfully.`;
      }

      if (landingZoneUpdateOrResetStatus.resetRequired) {
        const operationIdentifier = await LandingZoneOperation.resetLandingZone(
          client,
          landingZoneDetails.landingZoneIdentifier,
          landingZoneUpdateOrResetStatus.reason,
        );
        await this.waitTillOperationCompletes(operationIdentifier, globalConfig.homeRegion, props.solutionId);

        return `Module - ${module} The Landing Zone reset operation completed successfully.`;
      }

      // When no changes required
      return landingZoneUpdateOrResetStatus.reason;
    } else {
      const operationIdentifier = await LandingZoneOperation.createLandingZone(
        client,
        landingZoneConfiguration,
        preRequisitesResources!.kmsKeyArn,
      );
      await this.waitTillOperationCompletes(operationIdentifier, globalConfig.homeRegion, props.solutionId);

      return `Module - ${module} The Landing Zone deployed successfully.`;
    }
  }

  /**
   * Handler function to manage AWS Control Tower Landing Zone
   *
   * @remarks
   * When AWS Control Tower Landing Zone is not configured this function will perform complete pre-requisites and create then landing zone.
   * When AWS Control Tower Landing Zone is configured, based ```controlTower.landingZone``` configuration in global config file, function will update the landing zone.
   * When existing AWS Control Tower Landing Zone is drifted, function will reset the landing zone.
   * @param module string
   * @param props {@link ModuleOptionsType}
   * @returns status string
   */
  public async handler(module: string, props: ModuleOptionsType): Promise<string> {
    return await this.manageModule(module, props);
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
      `The Landing Zone deployment operation successfully started, operation identifier is - ${operationIdentifier}`,
    );

    return operationIdentifier;
  }

  /**
   * Function to reset the landing zone
   * @param client {@link ControlTowerClient}
   * @param landingZoneIdentifier string
   * @param reason string
   * @returns operationIdentifier string
   */
  public static async resetLandingZone(
    client: ControlTowerClient,
    landingZoneIdentifier: string,
    reason: string,
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
      `The Landing Zone reset operation successfully started, operation identifier is - ${operationIdentifier}`,
    );

    return operationIdentifier;
  }

  /**
   * Function to update the landing zone
   *
   * @param client {@link ControlTowerClient}
   * @param targetVersion string
   * @param reason string
   * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
   * @param landingZoneDetails {@link ControlTowerLandingZoneDetailsType}
   * @returns operationIdentifier string
   */
  public static async updateLandingZone(
    client: ControlTowerClient,
    targetVersion: string,
    reason: string,
    landingZoneConfiguration: ControlTowerLandingZoneConfigType,
    landingZoneDetails: ControlTowerLandingZoneDetailsType,
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
      `The Landing Zone update operation successfully started, operation identifier is - ${operationIdentifier}`,
    );

    return operationIdentifier;
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
   * @param props {@link ModuleOptionsType}
   * @param landingZoneIdentifier
   * @returns metadata { kmsKeyArn: string } | undefined
   */
  public static async completePreRequisites(
    props: ModuleOptionsType,
    region: string,
    managementAccountEmail: string,
    landingZoneIdentifier?: string,
  ): Promise<{ kmsKeyArn: string } | undefined> {
    if (!landingZoneIdentifier) {
      const globalRegion = getGlobalRegion(props.partition);

      await Organization.ValidateOrganization(globalRegion, region, props.solutionId);

      const managementAccountId = await Organization.getManagementAccountId(
        globalRegion,
        props.solutionId,
        managementAccountEmail,
      );

      if (!props.useExistingRole) {
        await IamRole.createControlTowerRoles(props.partition, region, props.solutionId);
        // giving time to complete Role creation completes, otherwise ValidationException - CUSTOMER_ASSUME_ROLE_FAILED error occurs
        logger.info(`Created AWS Control Tower roles, sleeping for 5 minutes for role creations to complete.`);
        await delay(5);
      }

      await SharedAccount.createAccounts(props.configDirPath, globalRegion, props.solutionId);

      const kmsKeyArn = await KmsKey.createControlTowerKey(
        props.partition,
        managementAccountId,
        region,
        props.solutionId,
      );
      return { kmsKeyArn };
    }

    return undefined;
  }
}
