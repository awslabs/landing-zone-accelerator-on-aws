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
  AcceptHandshakeCommand,
  Account,
  CancelHandshakeCommand,
  CreateOrganizationalUnitCommand,
  DuplicateOrganizationalUnitException,
  HandshakePartyType,
  HandshakeState,
  InviteAccountToOrganizationCommand,
  ListHandshakesForAccountCommand,
  ListHandshakesForOrganizationCommand,
  MoveAccountCommand,
  OrganizationsClient,
  Root,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import {
  BaselineOperationStatus,
  BaselineSummary,
  ControlTowerClient,
  EnableBaselineCommand,
  EnabledBaselineParameter,
  EnabledBaselineSummary,
  EnablementStatus,
  GetBaselineOperationCommand,
  paginateListBaselines,
  paginateListEnabledBaselines,
} from '@aws-sdk/client-controltower';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import { createLogger } from '@aws-accelerator/utils/lib/logger';

import * as winston from 'winston';

import path from 'path';

import { AccountIdConfig, AccountsConfig, GlobalConfig, OrganizationConfig } from '@aws-accelerator/config';

import {
  OuRelationType,
  delay,
  getCredentials,
  getLandingZoneDetails,
  getLandingZoneIdentifier,
  getManagementAccountCredentials,
  getOrganizationsRoot,
  getOuRelationsFromConfig,
  getOrganizationalUnitKeys,
} from '../../common/functions';
import {
  AssumeRoleCredentialType,
  ControlTowerLandingZoneDetailsType,
  ModuleOptionsType,
  OrganizationalUnitDetailsType,
  OrganizationalUnitKeysType,
} from '../../common/resources';
import { AcceleratorModule } from '../accelerator-module';
import { setRetryStrategy } from '@aws-accelerator/utils/dist/lib/common-functions';

import { getBaselineVersion } from '@aws-accelerator/utils/lib/control-tower';

/**
 * Type for invite account and organization details type
 */
type InviteAccountOrgDetailsType = { accountItem: AccountIdConfig; accountInOrganization: boolean };

/**
 * Type for config invite account and organization details type
 */
type ConfigInviteAccountDetailsType = { ouConfigItem: OuRelationType; inviteAccountDetails: InviteAccountDetailsType };
/**
 * Organizational unit details type
 */
type OuDetailsType = {
  completePath: string;
  /**
   * The flag indicates whether an organizational unit exists within AWS Organizations.
   */
  isExistsInOrg: boolean;
  /**
   * The flag indicates whether the organizational unit has registered with the AWS Control Tower.
   */
  isRegisteredInCt: boolean;
  /**
   * The flag indicates whether any AWS accounts will be invited to the AWS Organizations organization unit.
   */
  hasAccountsToInvite: boolean;
  /**
   * List of accounts to invite
   */
  accountsToInvite: AccountIdConfig[];
  /**
   * AWS Organizations organization unit configuration
   */
  ou: OuRelationType;
  /**
   * AWS Organizations organization unit details
   */
  existingOu?: OrganizationalUnitDetailsType;
};

/**
 * Invite account details type
 */
type InviteAccountDetailsType = { hasAccountsToInvite: boolean; accountsToInvite: AccountIdConfig[] };

/**
 * AWSOrganization class to manage AWS Organizations operation.
 */
export class AWSOrganization implements AcceleratorModule {
  private logger: winston.Logger = createLogger([path.parse(path.basename(__filename)).name]);
  /**
   * Handler function to manage AWS Organizations
   *
   * @remarks
   * The following activities are performed by this function
   *
   * - Create AWS Organizations organizational unit
   * - Register the organizational unit into the AWS Control Tower
   * - If any updates are available, update the baseline of the organizational unit
   * - Invite accounts to the AWS Organizations
   * - Move accounts to desired organizational unit
   *
   * @param module string
   * @param props {@link ModuleOptionsType}
   * @returns status string
   */
  private ouKeys: OrganizationalUnitKeysType | undefined = undefined;

  public async handler(module: string, props: ModuleOptionsType): Promise<string> {
    const statuses: string[] = [];
    const globalConfig = GlobalConfig.load(props.configDirPath);

    //
    // Get Management account credentials
    //
    const managementAccountCredentials = await getManagementAccountCredentials(
      props.partition,
      globalConfig.homeRegion,
      props.solutionId,
    );

    const organizationConfig = OrganizationConfig.load(props.configDirPath);

    if (!organizationConfig.enable) {
      return `AWS Organizations not enabled in organization config, module "${module}" execution skipped`;
    }

    const ouRelationsFromConfig = getOuRelationsFromConfig(organizationConfig);

    const globalRegion = getGlobalRegion(props.partition);

    const controlTowerClient = new ControlTowerClient({
      region: globalConfig.homeRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: managementAccountCredentials,
    });

    const organizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: managementAccountCredentials,
    });

    const organizationRoot = await getOrganizationsRoot(organizationsClient);

    const landingZoneDetails = await this.getLandingZoneDetails(
      controlTowerClient,
      globalConfig.homeRegion,
      globalConfig.controlTower.enable,
    );

    const enabledBaselines: EnabledBaselineSummary[] = [];

    if (landingZoneDetails) {
      enabledBaselines.push(...(await this.getEnabledBaselines(controlTowerClient)));
    }

    const orgAccounts = await this.getOrganizationAccounts(organizationsClient);

    this.ouKeys = await getOrganizationalUnitKeys(organizationsClient);

    const ouItems = await this.prepareOuList(
      props,
      ouRelationsFromConfig,
      enabledBaselines,
      orgAccounts,
      landingZoneDetails,
    );

    for (const ouItem of ouItems) {
      // If applicable create the AWS organizational units
      await this.manageOuCreation(organizationsClient, ouItem, organizationRoot, statuses);

      // OU baseline only when CT is enabled and OU is not ignored
      if (globalConfig.controlTower.enable && !ouItem.ou.isIgnored) {
        // If applicable, enable or update baseline for the AWS organizational unit
        await this.manageOuRegistration(controlTowerClient, ouItem, statuses, landingZoneDetails);
      }

      // If applicable invite any AWS Accounts for the AWS organizational unit
      // Only for OU not marked as ignored.
      if (!ouItem.ou.isIgnored) {
        await this.inviteAccountsToOrganization(
          props,
          organizationsClient,
          organizationRoot,
          ouItem,
          globalRegion,
          globalConfig.managementAccountAccessRole,
          orgAccounts,
          statuses,
          managementAccountCredentials,
        );
      }
    }

    return `Module "${module}" completed with following status.\n ${statuses.join('\n')}`;
  }

  /**
   * Function to manage the organizational unit registration to AWS Control Tower
   * @param controlTowerClient {@link ControlTowerClient}
   * @param ouItem {@link OuDetailsType}
   * @param statuses string[]
   * @param landingZoneDetails {@link ControlTowerLandingZoneDetailsType} | undefined
   */
  private async manageOuRegistration(
    controlTowerClient: ControlTowerClient,
    ouItem: OuDetailsType,
    statuses: string[],
    landingZoneDetails?: ControlTowerLandingZoneDetailsType,
  ): Promise<void> {
    if (!landingZoneDetails) {
      throw new Error(
        `AWS Control Tower Landing Zone details undefined, can not perform organizational unit registration.`,
      );
    }
    const enabledBaselines = await this.getEnabledBaselines(controlTowerClient);

    const baselineVersion = getBaselineVersion(landingZoneDetails.version!);

    const availableControlTowerBaselines = await this.getAvailableControlTowerBaselines(controlTowerClient);

    const awsControlTowerBaselineIdentifier = availableControlTowerBaselines.find(
      item => item.name?.toLowerCase() === 'AWSControlTowerBaseline'.toLowerCase(),
    )?.arn;

    if (!awsControlTowerBaselineIdentifier) {
      throw new Error(`AWSControlTowerBaseline identifier not found in available Control Tower baselines.`);
    }

    const identityCenterBaselineIdentifier = await this.getIdentityCenterBaselineIdentifier(
      availableControlTowerBaselines,
      enabledBaselines,
    );

    if (landingZoneDetails.enableIdentityCenterAccess && !identityCenterBaselineIdentifier) {
      throw new Error(
        `AWS Control Tower Landing Zone is configured with IAM Identity Center, but IdentityCenterBaseline not found in enabled baselines.`,
      );
    }

    // Check for already registered ou status and re-register if registration was failed
    if (ouItem.isRegisteredInCt) {
      const baselineStatus = this.getOuBaselineStatus(ouItem.existingOu!.arn, enabledBaselines);

      if (baselineStatus === EnablementStatus.FAILED) {
        this.logger.info(
          `The organizational unit "${ouItem.ou.completePath}" baseline status is "${baselineStatus}", update baseline for the organizational unit wil be performed.`,
        );

        statuses.push(
          await this.updateExistingRegistration(
            controlTowerClient,
            ouItem,
            baselineVersion,
            awsControlTowerBaselineIdentifier,
            identityCenterBaselineIdentifier,
          ),
        );
      } else {
        this.logger.info(
          `The organizational unit "${ouItem.ou.completePath}" baseline status is "${baselineStatus}", update baseline skipped.`,
        );
      }
    } else {
      this.logger.info(
        `The organizational unit "${ouItem.ou.completePath}" is not registered into AWS Control Tower, it will be registered now.`,
      );

      statuses.push(
        await this.registerOrganizationalUnit(
          controlTowerClient,
          ouItem.ou,
          awsControlTowerBaselineIdentifier,
          baselineVersion,
          identityCenterBaselineIdentifier,
        ),
      );
    }
  }

  /**
   * Function to manage AWS Organizations organizational unit creation process
   * @param client {@link OrganizationsClient}
   * @param ouItem {@link OuDetailsType}
   * @param organizationRoot {@link Root}
   * @param statuses string[]
   */
  private async manageOuCreation(
    client: OrganizationsClient,
    ouItem: OuDetailsType,
    organizationRoot: Root,
    statuses: string[],
  ): Promise<void> {
    if (!ouItem.isExistsInOrg) {
      let parentId = organizationRoot.Id!;
      if (ouItem.ou.parentName) {
        const parentDetails = this.ouKeys!.find(
          item => item.acceleratorKey.toLowerCase() === ouItem.ou.parentName?.toLowerCase(),
        );

        if (!parentDetails) {
          throw new Error(
            `Parent organizational unit "${ouItem.ou.parentName}" not found for organizational unit "${ouItem.ou.completePath}" in AWS Organizations.`,
          );
        }

        this.logger.info(
          `The organizational unit "${ouItem.ou.completePath}" not found in AWS Organizations. It will be created and register if not ignored.`,
        );

        parentId = parentDetails.awsKey;
      }

      statuses.push(await this.createOrganizationUnit(client, ouItem.ou, parentId));
    } else {
      this.logger.info(
        `The organization unit "${ouItem.ou.completePath}" already exists in AWS Organizations, create organizational operation skipped.`,
      );
    }
  }

  /**
   * Function to update organizational unit registration
   * @param controlTowerClient {@link ControlTowerClient}
   * @param ouItem {@link OuDetailsType}
   * @param baselineVersion string
   * @param awsControlTowerBaselineIdentifier string
   * @param identityCenterBaselineIdentifier string | undefiled
   * @returns
   */
  private async updateExistingRegistration(
    controlTowerClient: ControlTowerClient,
    ouItem: OuDetailsType,
    baselineVersion: string,
    awsControlTowerBaselineIdentifier: string,
    identityCenterBaselineIdentifier?: string,
  ): Promise<string> {
    return this.registerOrganizationalUnit(
      controlTowerClient,
      ouItem.ou,
      awsControlTowerBaselineIdentifier,
      baselineVersion,
      identityCenterBaselineIdentifier,
    );
  }

  /**
   * Function to check if given organizational unit has any account to be invited
   * @param configDirPath string
   * @param ouConfigItem {@link OuRelationType}
   * @param orgAccounts {@link Account}[]
   * @returns status {@link InviteAccountDetailsType}
   */
  private async getInviteAccountDetails(
    configDirPath: string,
    ouConfigItem: OuRelationType,
    orgAccounts: Account[],
  ): Promise<InviteAccountDetailsType> {
    let hasAccountsToInvite = false;
    const accountsConfig = AccountsConfig.load(configDirPath);
    const accountsToInvite: AccountIdConfig[] = [];

    if (accountsConfig.accountIds?.length === 0) {
      return { hasAccountsToInvite, accountsToInvite: [] };
    }
    const configAccounts = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts];

    const promises: Promise<InviteAccountOrgDetailsType>[] = [];

    for (const accountItem of accountsConfig.accountIds ?? []) {
      promises.push(this.getInviteAccountOrgDetails(accountItem, orgAccounts));
    }

    const inviteAccountsOrgDetails = await Promise.all(promises);

    for (const inviteAccountOrgDetails of inviteAccountsOrgDetails) {
      const configAccount = configAccounts.find(
        item =>
          item.email === inviteAccountOrgDetails.accountItem.email &&
          item.organizationalUnit === ouConfigItem.completePath,
      );

      if (configAccount && !inviteAccountOrgDetails.accountInOrganization) {
        hasAccountsToInvite = true;
        accountsToInvite.push(inviteAccountOrgDetails.accountItem);
      }
    }
    return { hasAccountsToInvite, accountsToInvite: [...accountsToInvite] };
  }

  /**
   * Function to check invite account presents in org
   * @param accountItem {@link AccountIdConfig}
   * @param orgAccounts {@link Account}[]
   * @returns
   */
  private async getInviteAccountOrgDetails(
    accountItem: AccountIdConfig,
    orgAccounts: Account[],
  ): Promise<InviteAccountOrgDetailsType> {
    return {
      accountItem: accountItem,
      accountInOrganization: await this.isAccountInOrganization(accountItem.accountId, orgAccounts),
    };
  }

  /**
   * Function to prepare the organizational unit list
   * @param props {@link ModuleOptionsType}
   * @param ouRelationsFromConfig {@link OuRelationType}[]
   * @param enabledBaselines {@link EnabledBaselineSummary}[]
   * @param orgAccounts {@link Account}[]
   * @param landingZoneDetails {@link ControlTowerLandingZoneDetailsType}
   * @returns ous {@link OuDetailsType}[]
   */
  private async prepareOuList(
    props: ModuleOptionsType,
    ouRelationsFromConfig: OuRelationType[],
    enabledBaselines: EnabledBaselineSummary[],
    orgAccounts: Account[],
    landingZoneDetails?: ControlTowerLandingZoneDetailsType,
  ): Promise<OuDetailsType[]> {
    const ouItems: OuDetailsType[] = [];

    let filteredOuRelationsFromConfig = ouRelationsFromConfig;

    if (landingZoneDetails) {
      filteredOuRelationsFromConfig = ouRelationsFromConfig.filter(
        item => item.name !== landingZoneDetails.securityOuName,
      );
    }

    const promises: Promise<ConfigInviteAccountDetailsType>[] = [];

    for (const ouConfigItem of filteredOuRelationsFromConfig) {
      promises.push(this.getConfigInviteAccountDetails(props.configDirPath, ouConfigItem, orgAccounts));
    }

    const configInviteAccountsDetails = await Promise.all(promises);

    for (const configInviteAccountDetails of configInviteAccountsDetails) {
      const existingOu = this.ouKeys!.find(
        item => item.acceleratorKey === configInviteAccountDetails.ouConfigItem.completePath,
      );

      let isRegisteredInCt = false;
      let isExistsInOrg = false;

      let foo: OrganizationalUnitDetailsType | undefined = undefined;
      if (existingOu) {
        isExistsInOrg = true;
        if (landingZoneDetails) {
          isRegisteredInCt = this.isOuRegisteredInControlTower(existingOu.arn, enabledBaselines);
        }

        foo = {
          name: existingOu.acceleratorKey.split('/').pop() ?? existingOu.acceleratorKey,
          id: existingOu.awsKey,
          arn: existingOu.arn,
          level: existingOu.level,
          parentName: existingOu.parentPath,
          parentId: existingOu.parentId,
        };
      }

      ouItems.push({
        completePath: configInviteAccountDetails.ouConfigItem.completePath,
        isExistsInOrg,
        isRegisteredInCt,
        hasAccountsToInvite: configInviteAccountDetails.inviteAccountDetails.hasAccountsToInvite,
        accountsToInvite: configInviteAccountDetails.inviteAccountDetails.accountsToInvite,
        ou: configInviteAccountDetails.ouConfigItem,
        existingOu: foo,
      });
    }

    return ouItems;
  }

  /**
   * Function to get config invite account org details
   * @param configDirPath string
   * @param ouConfigItem {@link OuRelationType}
   * @param orgAccounts {@link Account}[]
   * @returns
   */
  private async getConfigInviteAccountDetails(
    configDirPath: string,
    ouConfigItem: OuRelationType,
    orgAccounts: Account[],
  ): Promise<ConfigInviteAccountDetailsType> {
    return {
      ouConfigItem,
      inviteAccountDetails: await this.getInviteAccountDetails(configDirPath, ouConfigItem, orgAccounts),
    };
  }

  /**
   * Function to create the given AWS Organizations organizational unit
   * @param client {@link OrganizationsClient}
   * @param ouItem {@link OuRelationType}
   * @param parentId string
   * @returns status string
   */
  private async createOrganizationUnit(
    client: OrganizationsClient,
    ouItem: OuRelationType,
    parentId: string,
  ): Promise<string> {
    this.logger.info(`Creating Organizational unit ${ouItem.completePath}`);
    try {
      const response = await throttlingBackOff(() =>
        client.send(new CreateOrganizationalUnitCommand({ Name: ouItem.name, ParentId: parentId })),
      );

      if (!response.OrganizationalUnit) {
        throw new Error(
          `The organization unit "${ouItem.completePath}", create organizational unit operation didn't return output.`,
        );
      }

      this.logger.info(`AWS Organizations organizational unit "${ouItem.completePath}" created successfully.`);

      // add new ou to list of ouKeys
      this.ouKeys?.push({
        acceleratorKey: ouItem.completePath,
        awsKey: response.OrganizationalUnit.Id!,
        arn: response.OrganizationalUnit.Arn!,
        level: ouItem.level,
        parentId: parentId,
        parentPath: ouItem.parentName!,
      });

      return `AWS Organizations organizational unit "${ouItem.completePath}" created successfully.`;
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e instanceof DuplicateOrganizationalUnitException) {
        this.logger.warn(
          `DuplicateOrganizationalUnitException exception occurred while creating ou ${ouItem.completePath}`,
        );
      }
      throw e;
    }
  }

  /**
   * Function to register the AWS Organizations organizational unit into AWS Control Tower
   * @param controlTowerClient {@link ControlTowerClient}
   * @param ouItem {@link OuRelationType}
   * @param baselineIdentifier string
   * @param baselineVersion string
   * @param identityCenterEnabledBaselineArn string | undefined
   * @returns status string
   */
  private async registerOrganizationalUnit(
    controlTowerClient: ControlTowerClient,
    ouItem: OuRelationType,
    baselineIdentifier: string,
    baselineVersion: string,
    identityCenterEnabledBaselineArn?: string,
  ): Promise<string> {
    const existingOuDetails = this.ouKeys!.find(item => item.acceleratorKey === ouItem.completePath);

    if (!existingOuDetails) {
      throw new Error(
        `Organizational unit "${ouItem.completePath}" not found in existing organization list failed to register the organization unit.`,
      );
    }

    const parameters: EnabledBaselineParameter[] = [];

    if (identityCenterEnabledBaselineArn) {
      parameters.push({
        key: 'IdentityCenterEnabledBaselineArn',
        value: identityCenterEnabledBaselineArn,
      });
    }

    const targetOuItem: OrganizationalUnitDetailsType = {
      name: existingOuDetails.acceleratorKey.split('/').pop() ?? existingOuDetails.acceleratorKey,
      id: existingOuDetails.awsKey,
      arn: existingOuDetails.arn,
      level: existingOuDetails.level,
      parentName: existingOuDetails.parentPath,
      parentId: existingOuDetails.parentId,
    };

    return this.enableBaseline(
      controlTowerClient,
      'Organizational Unit',
      targetOuItem,
      baselineIdentifier,
      baselineVersion,
      parameters,
    );
  }

  /**
   * Function to enable baseline for the target organization unit
   * @param client {@link ControlTowerClient}
   * @param itemType 'Organizational Unit' | 'AWS Account'
   * @param targetOuItem {@link OrganizationalUnitDetailsType}
   * @param baselineIdentifier string
   * @param baselineVersion string
   * @param parameters {@link EnabledBaselineParameter}[]
   * @returns status string
   */
  private async enableBaseline(
    client: ControlTowerClient,
    itemType: 'Organizational Unit' | 'AWS Account',
    targetOuItem: OrganizationalUnitDetailsType,
    baselineIdentifier: string,
    baselineVersion: string,
    parameters?: EnabledBaselineParameter[],
  ): Promise<string> {
    this.logger.info(
      `Enabling baseline for "${itemType} "${targetOuItem.name}" with id "${targetOuItem.id}" for parent "${targetOuItem.parentName}". Baseline version is "${baselineVersion}" and baseline identifier is "${baselineIdentifier}".`,
    );
    const response = await throttlingBackOff(() =>
      client.send(
        new EnableBaselineCommand({
          baselineIdentifier,
          baselineVersion,
          targetIdentifier: targetOuItem.arn,
          parameters,
        }),
      ),
    );

    if (!response.operationIdentifier) {
      throw new Error(
        `The "${itemType} "${targetOuItem.name}" with id "${targetOuItem.id}" for parent "${targetOuItem.parentName}" enable base line api didn't return operation identifier.`,
      );
    }

    await this.waitTillBaselineCompletes(client, targetOuItem, response.operationIdentifier);

    return `The "${itemType} "${targetOuItem.name}" with id "${targetOuItem.id}" for parent "${targetOuItem.parentName}" registered successfully into AWS Control Tower.`;
  }

  /**
   * Function to check and wait till the AWS Organizations organizational unit registration completion.
   * @param client {@link ControlTowerClient}
   * @param targetOuItem {@link OrganizationalUnitDetailsType}
   * @param operationIdentifier string
   */
  private async waitTillBaselineCompletes(
    client: ControlTowerClient,
    targetOuItem: OrganizationalUnitDetailsType,
    operationIdentifier: string,
  ): Promise<void> {
    const queryIntervalInMinutes = 2;
    const timeoutInMinutes = 60;
    let elapsedInMinutes = 0;
    let status = await this.getBaselineOperationStatus(client, targetOuItem.name, operationIdentifier);

    while (status !== BaselineOperationStatus.SUCCEEDED) {
      await delay(queryIntervalInMinutes);
      status = await this.getBaselineOperationStatus(client, targetOuItem.name, operationIdentifier);
      elapsedInMinutes = elapsedInMinutes + queryIntervalInMinutes;
      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `The organizational unit "${targetOuItem.name}" baseline operation took more than ${timeoutInMinutes} minutes. Pipeline aborted, please review AWS Control Tower console to make sure organization unit registration completes.`,
        );
      }
      this.logger.info(
        `The organizational unit "${targetOuItem.name}" with id "${targetOuItem.id}" for parent "${targetOuItem.parentName}" baseline operation with identifier "${operationIdentifier}" is currently in "${status}" state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked. Elapsed time ${elapsedInMinutes} minutes.`,
      );
    }
  }

  /**
   * Function to move AWS Account to target organizational unit
   * @param client {@link OrganizationsClient}
   * @param accountToInvite {@link AccountIdConfig}
   * @param sourceParentName string
   * @param sourceParentId string
   * @param destinationOuItem ${@link OuRelationType}
   * @returns status string
   */
  private async moveAccountToOu(
    client: OrganizationsClient,
    accountToInvite: AccountIdConfig,
    sourceParentName: string,
    sourceParentId: string,
    destinationOuItem: OuRelationType,
  ): Promise<string> {
    const destinationOu = this.ouKeys!.find(item => item.acceleratorKey === destinationOuItem.completePath);

    if (!destinationOu) {
      throw new Error(
        `Destination organizational unit id for ou "${destinationOuItem.name}" not found in existing organization list failed to move account with email "${accountToInvite.email}".`,
      );
    }

    await throttlingBackOff(() =>
      client.send(
        new MoveAccountCommand({
          AccountId: accountToInvite.accountId,
          SourceParentId: sourceParentId,
          DestinationParentId: destinationOu.awsKey,
        }),
      ),
    );

    return `Account with email "${accountToInvite.email}" moved from "${sourceParentName}" to "${destinationOuItem.name}" within the AWS Organizations.`;
  }

  /**
   * Function to invite AWS Accounts to AWS organizations
   * @param props {@link ModuleOptionsType}
   * @param client {@link OrganizationsClient}
   * @param organizationRoot {@link Root}
   * @param ouItem {@link OuDetailsType}
   * @param globalRegion string
   * @param assumeRoleName string
   * @param orgAccounts {@link Account}[]
   * @param statuses string[]
   * @param managementAccountCredentials {@link AssumeRoleCredentialType} | undefined
   */
  private async inviteAccountsToOrganization(
    props: ModuleOptionsType,
    client: OrganizationsClient,
    organizationRoot: Root,
    ouItem: OuDetailsType,
    globalRegion: string,
    assumeRoleName: string,
    orgAccounts: Account[],
    statuses: string[],
    managementAccountCredentials?: AssumeRoleCredentialType,
  ): Promise<void> {
    const localStatuses: string[] = [];
    if (ouItem.hasAccountsToInvite) {
      this.logger.info(`The organizational unit "${ouItem.ou.name}" has accounts to invite.`);

      const promises: Promise<InviteAccountOrgDetailsType>[] = [];

      for (const accountToInvite of ouItem.accountsToInvite) {
        promises.push(this.getInviteAccountOrgDetails(accountToInvite, orgAccounts));
      }

      const inviteAccountsOrgDetails = await Promise.all(promises);

      for (const inviteAccountOrgDetails of inviteAccountsOrgDetails) {
        if (!inviteAccountOrgDetails.accountInOrganization) {
          this.logger.info(
            `AWS Account with email "${inviteAccountOrgDetails.accountItem.email}" invited to the AWS Organizations.`,
          );
          const handshakeId = await this.inviteAccountToOrganization(client, inviteAccountOrgDetails.accountItem);

          localStatuses.push(
            await this.acceptAccountInvitationToOrganization(
              client,
              props.partition,
              globalRegion,
              props.solutionId,
              assumeRoleName,
              handshakeId,
              inviteAccountOrgDetails.accountItem,
              managementAccountCredentials,
            ),
          );

          localStatuses.push(
            await this.moveAccountToOu(
              client,
              inviteAccountOrgDetails.accountItem,
              organizationRoot.Name!,
              organizationRoot.Id!,
              ouItem.ou,
            ),
          );

          // AWS Accounts enrolled into existing OU can't be registered into Control Tower
          // Only OU is supported for base line The ARN of the target on which the baseline will be enabled. Only OUs are supported as targets.)
          // https://docs.aws.amazon.com/controltower/latest/APIReference/API_EnableBaseline.html
          if (ouItem.isExistsInOrg) {
            this.logger.info(
              `AWS Account with email ${inviteAccountOrgDetails.accountItem.email} moved to existing organizational unit ${ouItem.ou.name}, account will be enrolled by the prepare stack.`,
            );
          }
        }
      }
    }

    if (localStatuses.length === 0) {
      this.logger.info(
        `No accounts found for organizational unit "${ouItem.ou.name}" to be invited to the AWS Organizations.`,
      );
    }

    statuses.push(...localStatuses);
  }

  /**
   * Function to invite given account into AWS Organizations
   * @param client {@link OrganizationsClient}
   * @param accountToInvite {@link AccountIdConfig}
   * @returns handshakeId string
   */
  private async inviteAccountToOrganization(
    client: OrganizationsClient,
    accountToInvite: AccountIdConfig,
  ): Promise<string> {
    try {
      const response = await throttlingBackOff(() =>
        client.send(
          new InviteAccountToOrganizationCommand({ Target: { Type: 'ACCOUNT', Id: accountToInvite.accountId } }),
        ),
      );

      if (!response.Handshake?.Id) {
        throw new Error(
          `Account "${accountToInvite.email}" invitation api didn't return handshake id, please manually invite and accept this account into the AWS Organizations.`,
        );
      }

      return response.Handshake.Id;
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      this.logger.warn(
        `There was an "${e.name}" error when inviting account with email address "${accountToInvite.email}". AWS Organizations will cancel the invitation.`,
      );
      await this.cancelInvitationHandshake(client, accountToInvite);
      throw e;
    }
  }

  /**
   * Function to get the opened invitation handshake id for the given account.
   * @param client {@link OrganizationsClient}
   * @param accountId string
   * @returns handshakeId string | undefined
   */
  private async getOpenedInvitationHandshakeIdForAccount(
    client: OrganizationsClient,
    accountId: string,
  ): Promise<string | undefined> {
    const response = await throttlingBackOff(() => client.send(new ListHandshakesForOrganizationCommand({})));

    for (const handshake of response.Handshakes ?? []) {
      if (handshake.State === HandshakeState.OPEN) {
        for (const party of handshake.Parties ?? []) {
          if (party.Type === HandshakePartyType.ACCOUNT && party.Id === accountId) {
            return handshake.Id!;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Function to cancel AWS Account invitation to the AWS Organizations
   * @param client {@link OrganizationsClient}
   * @param accountItem {@link AccountIdConfig}
   */
  private async cancelInvitationHandshake(client: OrganizationsClient, accountItem: AccountIdConfig): Promise<void> {
    const handshakeId = await this.getOpenedInvitationHandshakeIdForAccount(client, accountItem.accountId);

    if (handshakeId) {
      this.logger.warn(`Cancelling invitation for account with email ${accountItem.email}`);
      await throttlingBackOff(() => client.send(new CancelHandshakeCommand({ HandshakeId: handshakeId })));
    }
  }

  /**
   * Function to accept invitation to AWS Organizations
   * @param managementAccountClient {@link OrganizationsClient}
   * @param partition string
   * @param globalRegion string
   * @param solutionId string
   * @param assumeRoleName string
   * @param handshakeId string
   * @param accountItem {@link AccountIdConfig}
   * @param managementAccountCredentials {@link AssumeRoleCredentialType} | undefined
   * @returns status string
   */
  private async acceptAccountInvitationToOrganization(
    managementAccountClient: OrganizationsClient,
    partition: string,
    globalRegion: string,
    solutionId: string,
    assumeRoleName: string,
    handshakeId: string,
    accountItem: AccountIdConfig,
    managementAccountCredentials?: AssumeRoleCredentialType,
  ): Promise<string> {
    let credentials: AssumeRoleCredentialType | undefined;
    try {
      credentials = await getCredentials({
        accountId: accountItem.accountId,
        region: globalRegion,
        solutionId,
        partition,
        assumeRoleName,
        sessionName: 'AcceleratorAcceptInviteAssumeRole',
        credentials: managementAccountCredentials,
      });
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      this.logger.warn(
        `When assuming role "${assumeRoleName}" to accept invitation for an account with the email address "${accountItem.email}", an "${e.name}" error occurred. Make sure the role is present in the account, or that the account id provided is valid. AWS Organizations will cancel the invitation.`,
      );
      await this.cancelInvitationHandshake(managementAccountClient, accountItem);
      throw e;
    }
    const accepterClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    this.logger.info(`Accepting AWS Account with email "${accountItem.email}" invite to the AWS Organizations.`);
    const response = await throttlingBackOff(() =>
      accepterClient.send(new AcceptHandshakeCommand({ HandshakeId: handshakeId })),
    );

    if (response.Handshake?.State === HandshakeState.ACCEPTED) {
      return `Invitation to AWS Organizations for AWS Account with email "${accountItem.email}" completed successfully.`;
    }

    if (!response.Handshake) {
      throw new Error(
        `AWS Account with email "${accountItem.email}" accept handshakes api didn't return any handshake response, please investigate the account invitation. `,
      );
    }

    if (!response.Handshake.Id) {
      throw new Error(
        `AWS Account with email "${accountItem.email}" accept handshakes api didn't return any handshake identifier, please investigate the account invitation. `,
      );
    }

    return this.waitUntilAccountInvitationAccepted(accepterClient, response.Handshake.Id, accountItem.email);
  }

  /**
   * Function to check and wait till the AWS Account invitation accepted.
   * @param client {@link OrganizationsClient}
   * @param handshakeId string
   * @param accountEmail string
   * @returns status string
   */
  private async waitUntilAccountInvitationAccepted(
    client: OrganizationsClient,
    handshakeId: string,
    accountEmail: string,
  ): Promise<string> {
    const queryIntervalInMinutes = 1;
    const timeoutInMinutes = 10;
    let elapsedInMinutes = 0;
    let status = await this.getAccountHandshakeStatus(client, handshakeId, accountEmail);

    while (status !== HandshakeState.ACCEPTED) {
      await delay(queryIntervalInMinutes);
      status = await this.getAccountHandshakeStatus(client, handshakeId, accountEmail);

      if (
        status === HandshakeState.CANCELED ||
        status === HandshakeState.DECLINED ||
        status === HandshakeState.EXPIRED
      ) {
        throw new Error(
          `AWS Account with email "${accountEmail}" invitation status is "${status}", please investigate the account invitation. `,
        );
      }

      elapsedInMinutes = elapsedInMinutes + queryIntervalInMinutes;
      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `AWS Account with email "${accountEmail}" invitation acceptance operation took more than ${timeoutInMinutes} minutes. Pipeline aborted, please review AWS Account with email "${accountEmail}" and complete acceptance of invitation.`,
        );
      }
      this.logger.info(
        `The AWS Account with email "${accountEmail}" invite acceptance with handshake identifier "${handshakeId}" is currently in "${status}" state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked. Elapsed time ${elapsedInMinutes} minutes.`,
      );
    }

    return `Invitation to AWS Organizations for AWS Account with email "${accountEmail}" completed successfully.`;
  }

  /**
   * Function to find AWS Account invitation handshake status
   * @param client {@link OrganizationsClient}
   * @param handshakeId string
   * @param accountEmail string
   * @returns status string
   */
  private async getAccountHandshakeStatus(
    client: OrganizationsClient,
    handshakeId: string,
    accountEmail: string,
  ): Promise<string> {
    const response = await throttlingBackOff(() =>
      client.send(new ListHandshakesForAccountCommand({ Filter: { ActionType: 'INVITE' } })),
    );

    if (!response.Handshakes) {
      throw new Error(
        `AWS Account with email "${accountEmail}" list handshakes api didn't return any response, please investigate the account invitation. `,
      );
    }

    const handshakeResponse = response.Handshakes.find(item => item.Id === handshakeId);

    if (!handshakeResponse) {
      throw new Error(
        `AWS Account with email "${accountEmail}" list handshakes api couldn't find handshake information with handshake id "${handshakeId}", please investigate the account invitation. `,
      );
    }

    if (!handshakeResponse.State) {
      throw new Error(
        `AWS Account with email "${accountEmail}" list handshakes api couldn't find handshake status with handshake id "${handshakeId}", please investigate the account invitation. `,
      );
    }

    return handshakeResponse.State;
  }

  /**
   * Function to check if the given function is part of AWS Organizations
   * @param accountId string
   * @param orgAccounts {@link Account}[]
   * @returns status boolean
   */
  private async isAccountInOrganization(accountId: string, orgAccounts: Account[]): Promise<boolean> {
    const accountFound = orgAccounts.find(item => item.Id === accountId);

    return !!accountFound;
  }

  /**
   * Function to get AWS Organizations accounts
   * @param client {@link OrganizationsClient}
   * @returns accounts {@link Account}[]
   */
  private async getOrganizationAccounts(client: OrganizationsClient): Promise<Account[]> {
    const accounts: Account[] = [];
    const paginator = paginateListAccounts({ client }, {});
    for await (const page of paginator) {
      for (const account of page.Accounts ?? []) {
        accounts.push(account);
      }
    }

    return accounts;
  }

  /**
   * Function to get available AWS Control Tower baselines
   * @param client {@link ControlTowerClient}
   * @returns baselines {@link BaselineSummary}[]
   */
  private async getAvailableControlTowerBaselines(client: ControlTowerClient): Promise<BaselineSummary[]> {
    const baselines: BaselineSummary[] = [];
    const paginator = paginateListBaselines({ client }, {});
    for await (const page of paginator) {
      for (const baseline of page.baselines ?? []) {
        baselines.push(baseline);
      }
    }

    return baselines;
  }

  /**
   * Function to get IdentityCenterBaselineIdentifier
   * @param baselines {@link BaselineSummary}[]
   * @param enabledBaselines {@link EnabledBaselineSummary}[]
   * @returns identifier string | undefined
   */
  private async getIdentityCenterBaselineIdentifier(
    baselines: BaselineSummary[],
    enabledBaselines: EnabledBaselineSummary[],
  ): Promise<string | undefined> {
    const baseline = baselines.find(item => item.name?.toLowerCase() === 'IdentityCenterBaseline'.toLowerCase());

    if (baseline) {
      const enabledBaseline = enabledBaselines.find(item => item.baselineIdentifier === baseline.arn);

      if (enabledBaseline) {
        return enabledBaseline.arn!;
      }
    }

    return undefined;
  }

  /**
   * Function to check if the given AWS Organizations organizational unit is registered into the AWS Control Tower
   * @param ouArn string
   * @param existingEnabledBaselines {@link EnabledBaselineSummary}[]
   * @returns status boolean
   */
  private isOuRegisteredInControlTower(ouArn: string, existingEnabledBaselines: EnabledBaselineSummary[]): boolean {
    const isOutFound = existingEnabledBaselines.find(item => item.targetIdentifier === ouArn);
    if (isOutFound) {
      return true;
    }
    return false;
  }

  /**
   * Function to get the AWS Organizations organizational unit baseline status
   * @param ouArn string
   * @param existingEnabledBaselines {@link EnabledBaselineSummary}[]
   * @returns status {@link EnablementStatus} | undefined
   */
  private getOuBaselineStatus(
    ouArn: string,
    existingEnabledBaselines: EnabledBaselineSummary[],
  ): EnablementStatus | undefined {
    const isOutFound = existingEnabledBaselines.find(item => item.targetIdentifier === ouArn);
    if (isOutFound) {
      return isOutFound.statusSummary?.status;
    }
    return undefined;
  }

  /**
   * Function to get the AWS Organizations organizational unit baseline operation status
   *
   * @param client {@link ControlTowerClient}
   * @param ouName string
   * @param operationIdentifier string
   * @returns operationStatus {@link BaselineOperationStatus}
   */
  private async getBaselineOperationStatus(
    client: ControlTowerClient,
    ouName: string,
    operationIdentifier: string,
  ): Promise<BaselineOperationStatus> {
    const response = await throttlingBackOff(() =>
      client.send(new GetBaselineOperationCommand({ operationIdentifier })),
    );

    const operationStatus = response.baselineOperation?.status;

    if (!operationStatus) {
      throw new Error(
        `AWS Control Tower Landing Zone get baseline operation api didn't return operation status. API returned "${operationStatus}" for operation status.`,
      );
    }

    if (operationStatus === BaselineOperationStatus.FAILED) {
      throw new Error(
        `The organizational unit "${ouName}" baseline operation with identifier "${operationIdentifier}" in "${response.baselineOperation?.status}" state. Please investigate baseline operation before executing pipeline.`,
      );
    }

    return operationStatus;
  }

  /**
   * Function to get enabled baselines
   * @param client {@link ControlTowerClient}
   * @returns enabledBaselines {@link EnabledBaselineSummary}[]
   */
  private async getEnabledBaselines(client: ControlTowerClient): Promise<EnabledBaselineSummary[]> {
    const enabledBaselines: EnabledBaselineSummary[] = [];
    const paginator = paginateListEnabledBaselines({ client }, {});
    for await (const page of paginator) {
      for (const enabledBaseline of page.enabledBaselines ?? []) {
        enabledBaselines.push(enabledBaseline);
      }
    }

    return enabledBaselines;
  }

  /**
   * Function to get AWS Control Tower Landing Zone details
   * @param client {@link ControlTowerClient}
   * @param homeRegion string
   * @param isControlTowerEnabled boolean
   * @returns
   */
  private async getLandingZoneDetails(
    client: ControlTowerClient,
    homeRegion: string,
    isControlTowerEnabled: boolean,
  ): Promise<ControlTowerLandingZoneDetailsType | undefined> {
    let landingZoneDetails: ControlTowerLandingZoneDetailsType | undefined;

    if (!isControlTowerEnabled) {
      this.logger.info(
        `AWS Control Tower Landing Zone not configured for the environment. The organizational unit registration will be skipped.`,
      );
    } else {
      const landingZoneIdentifier = await getLandingZoneIdentifier(client);
      if (!landingZoneIdentifier) {
        throw new Error(`AWS Control Tower Landing Zone not configured for the environment.`);
      }
      landingZoneDetails = await getLandingZoneDetails(client, homeRegion, landingZoneIdentifier);
      if (!landingZoneDetails) {
        throw new Error(`AWS Control Tower Landing Zone details undefined.`);
      }
    }
    return landingZoneDetails;
  }
}
