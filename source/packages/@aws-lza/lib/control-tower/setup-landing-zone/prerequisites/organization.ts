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
  DescribeOrganizationCommand,
  ListRootsCommand,
  OrganizationsClient,
  OrganizationalUnit,
  paginateListAccounts,
  EnableAllFeaturesCommand,
  Account,
  AWSOrganizationsNotInUseException,
  paginateListAWSServiceAccessForOrganization,
  EnabledServicePrincipal,
  OrganizationFeatureSet,
  CreateOrganizationalUnitCommand,
  MoveAccountCommand,
  ListParentsCommand,
} from '@aws-sdk/client-organizations';
import { InstanceMetadata, paginateListInstances, SSOAdminClient } from '@aws-sdk/client-sso-admin';

import {
  getOrganizationalUnitsForParent,
  setRetryStrategy,
  getParentOuId,
  getAccountId,
} from '../../../../common/functions';
import { createLogger } from '../../../../common/logger';
import { IAssumeRoleCredential, OrganizationRootType } from '../../../../common/resources';
import { throttlingBackOff } from '../../../../common/throttle';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

/**
 * Organization abstract class to get AWS Organizations details and create AWS Organizations if not exists
 */
export abstract class Organization {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to check if AWS Organizations is configured
   * @param client {@link OrganizationsClient}
   * @returns status boolean
   */
  private static async configured(client: OrganizationsClient): Promise<boolean> {
    try {
      const response = await throttlingBackOff(() => client.send(new DescribeOrganizationCommand({})));

      if (response.Organization?.Id) {
        Organization.logger.info(`AWS Organizations already configured`);
        return true;
      }
      return false;
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e instanceof AWSOrganizationsNotInUseException) {
        return false;
      }
      throw e;
    }
  }
  /**
   * Function to get list of services enabled in AWS Organizations
   * @param client {@link OrganizationsClient}
   * @returns enabledServicePrincipals {@link EnabledServicePrincipal}[]
   */
  private static async getOrganizationEnabledServices(client: OrganizationsClient): Promise<EnabledServicePrincipal[]> {
    const enabledServicePrincipals: EnabledServicePrincipal[] = [];

    const paginator = paginateListAWSServiceAccessForOrganization({ client }, {});
    for await (const page of paginator) {
      for (const enabledServicePrincipal of page.EnabledServicePrincipals ?? []) {
        enabledServicePrincipals.push(enabledServicePrincipal);
      }
    }
    return enabledServicePrincipals;
  }

  /**
   * Function to check if any services are enabled in AWS Organizations
   * @param client {@link OrganizationsClient}
   * @returns status boolean
   */
  private static async isAnyOrganizationServiceEnabled(client: OrganizationsClient): Promise<boolean> {
    const enabledServicePrincipals = await this.getOrganizationEnabledServices(client);
    if (enabledServicePrincipals.length > 0) {
      Organization.logger.warn(
        `AWS Organizations have multiple services enabled "${enabledServicePrincipals
          .map(item => item.ServicePrincipal)
          .join(',')}", the solution cannot deploy AWS Control Tower Landing Zone.`,
      );
      return true;
    }

    return false;
  }

  /**
   * Function to check if AWS Organizations have any organizational units
   * @param client {@link OrganizationsClient}
   * @returns status boolean
   */
  private static async hasOrganizationalUnits(client: OrganizationsClient): Promise<boolean> {
    const organizationalUnitsForRoot = await Organization.getOrganizationalUnitsForRoot(client);

    if (organizationalUnitsForRoot.length !== 0) {
      Organization.logger.warn(
        `AWS Organizations have multiple organization units "${organizationalUnitsForRoot
          .map(item => item.Name)
          .join(',')}", the solution cannot deploy AWS Control Tower Landing Zone.`,
      );
      return true;
    }

    return false;
  }

  /**
   * Function to check if AWS Organizations have any accounts other than management account.
   *
   * @remarks
   * GovCloud (US) will have shared accounts within the AWS Organizations, for AWS standard partition these accounts will be created by the solution
   * @param client {@link OrganizationsClient}
   * @param partition string
   * @param sharedAccountEmail
   * @returns status boolean
   */
  private static async hasAdditionalAccounts(
    client: OrganizationsClient,
    partition: string,
    sharedAccountEmail: { logArchive: string; audit: string },
  ): Promise<boolean> {
    const accounts = await Organization.getOrganizationAccounts(client);

    switch (partition) {
      case 'aws-us-gov':
        const logArchiveAccount = accounts.find(item => item.Email === sharedAccountEmail.logArchive);
        const auditAccount = accounts.find(item => item.Email === sharedAccountEmail.audit);

        if (accounts.length === 3 && logArchiveAccount && auditAccount) {
          return false;
        } else {
          Organization.logger.warn(
            `Either AWS Organizations does not have required shared accounts (LogArchive and Audit) or have other accounts. Existing AWS Organizations accounts are - "${accounts
              .map(account => account.Name + ' -> ' + account.Email)
              .join(',')}", the solution cannot deploy AWS Control Tower Landing Zone.`,
          );
          return true;
        }
      default:
        if (accounts.length > 1) {
          Organization.logger.warn(
            `AWS Organizations have multiple accounts "${accounts
              .map(account => account.Name + ' -> ' + account.Email)
              .join(',')}", the solution cannot deploy AWS Control Tower Landing Zone.`,
          );
          return true;
        } else {
          return false;
        }
    }
  }

  /**
   * Function to get list of the AWS IAM Identity Center instances
   * @param region string
   * @param solutionId string | undefined
   * @param credentials {@link IAssumeRoleCredential} | undefined
   * @returns instances {@link InstanceMetadata}[]
   */
  private static async getIdentityCenterInstances(
    region: string,
    solutionId?: string,
    credentials?: IAssumeRoleCredential,
  ): Promise<InstanceMetadata[]> {
    const client = new SSOAdminClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });
    const instances: InstanceMetadata[] = [];

    const paginator = paginateListInstances({ client }, {});
    for await (const page of paginator) {
      for (const instance of page.Instances ?? []) {
        instances.push(instance);
      }
    }
    return instances;
  }

  /**
   * Function to check if IAM Identity Center is enabled
   * @param region string
   * @param solutionId string | undefined
   * @param credentials {@link IAssumeRoleCredential} | undefined
   * @returns status boolean
   */
  private static async identityCenterEnabled(
    region: string,
    solutionId?: string,
    credentials?: IAssumeRoleCredential,
  ): Promise<boolean> {
    const instances = await Organization.getIdentityCenterInstances(region, solutionId, credentials);
    if (instances.length > 0) {
      Organization.logger.warn(
        `AWS Organizations have IAM Identity Center enabled "${instances
          .map(instance => instance.IdentityStoreId)
          .join(',')}", the solution cannot deploy AWS Control Tower Landing Zone.`,
      );
      return true;
    }
    return false;
  }

  /**
   * Function to get Organizational units for root
   * @param client {@link OrganizationsClient}
   * @returns ous {@link OrganizationalUnit}[]
   */
  private static async getOrganizationalUnitsForRoot(client: OrganizationsClient): Promise<OrganizationalUnit[]> {
    const parentId = (await Organization.getOrganizationsRoot(client)).Id;
    return getOrganizationalUnitsForParent(client, parentId);
  }

  /**
   * Function to get AWS Organizations Root details
   *
   * @param client {@link OrganizationsClient}
   * @returns organizationRoot {@link OrganizationRootType}
   */
  public static async getOrganizationsRoot(client: OrganizationsClient): Promise<OrganizationRootType> {
    const response = await throttlingBackOff(() => client.send(new ListRootsCommand({})));
    return { Name: response.Roots![0].Name!, Id: response.Roots![0].Id! };
  }

  /**
   * Function to enable all features for AWS Organization if not enabled already.
   * @param client {@link OrganizationsClient}
   */
  private static async enableAllFeatures(client: OrganizationsClient): Promise<void> {
    const response = await throttlingBackOff(() => client.send(new DescribeOrganizationCommand({})));
    if (response.Organization!.FeatureSet !== OrganizationFeatureSet.ALL) {
      Organization.logger.warn(
        `The existing AWS Organization ${
          response.Organization!.Id
        } does not have all features enabled. The solution will update your organization so that all features are enabled.`,
      );
      await throttlingBackOff(() => client.send(new EnableAllFeaturesCommand({})));
    }
  }

  /**
   * Function to retrieve AWS organizations accounts
   * @param client {@link OrganizationsClient}
   * @returns accounts {@link Account}[]
   */
  public static async getOrganizationAccounts(client: OrganizationsClient): Promise<Account[]> {
    const organizationAccounts: Account[] = [];
    const paginator = paginateListAccounts({ client }, {});
    for await (const page of paginator) {
      for (const account of page.Accounts ?? []) {
        organizationAccounts.push(account);
      }
    }
    return organizationAccounts;
  }

  /**
   * Function to get account id for the given email
   * @param globalRegion string
   * @parm email string
   * @param credentials {@link IAssumeRoleCredential} | undefined
   * @parm solutionId string | undefined
   * @returns accountId string
   */
  public static async getOrganizationAccountDetailsByEmail(
    globalRegion: string,
    email: string,
    credentials?: IAssumeRoleCredential,
    solutionId?: string,
  ): Promise<Account> {
    const client: OrganizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });
    const accounts = await Organization.getOrganizationAccounts(client);

    for (const account of accounts) {
      if (account.Id && account.Email?.toLowerCase() === email.toLowerCase()) {
        return account;
      }
    }
    throw new Error(`Account with email ${email} not found`);
  }

  /**
   * Function to validate AWS Organizations
   *
   * @param globalRegion string
   * @param region string
   * @param solutionId string
   * @param sharedAccountEmail
   * @param credentials {@link IAssumeRoleCredential} | undefined
   */
  public static async validate(
    globalRegion: string,
    region: string,
    partition: string,
    sharedAccountEmail: { logArchive: string; audit: string },
    credentials?: IAssumeRoleCredential,
    solutionId?: string,
  ): Promise<void> {
    const client: OrganizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });

    const validationErrors: string[] = [];

    if (await Organization.identityCenterEnabled(region, solutionId, credentials)) {
      validationErrors.push(`AWS Control Tower Landing Zone cannot deploy because IAM Identity Center is configured.`);
    }

    if (!(await Organization.configured(client))) {
      validationErrors.push(
        `AWS Control Tower Landing Zone cannot deploy because AWS Organizations have not been configured for the environment.`,
      );
    } else {
      if (await Organization.isAnyOrganizationServiceEnabled(client)) {
        validationErrors.push(
          `AWS Control Tower Landing Zone cannot deploy because AWS Organizations have services enabled.`,
        );
      }

      if (await Organization.hasOrganizationalUnits(client)) {
        validationErrors.push(
          `AWS Control Tower Landing Zone cannot deploy because there are multiple organizational units in AWS Organizations.`,
        );
      }

      if (await Organization.hasAdditionalAccounts(client, partition, sharedAccountEmail)) {
        if (partition === 'aws-us-gov') {
          validationErrors.push(
            `Either AWS Organizations does not have required shared accounts (LogArchive and Audit) or have other accounts.`,
          );
        } else {
          validationErrors.push(
            `AWS Control Tower Landing Zone cannot deploy because there are multiple accounts in AWS Organizations.`,
          );
        }
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(
        `AWS Organization validation has ${validationErrors.length} issue(s):\n${validationErrors.join('\n')}`,
      );
    }

    await Organization.enableAllFeatures(client);
  }

  /**
   * Function to create an Organizational Unit
   *
   * @param globalRegion string
   * @param ouName string - Name of the OU to create
   * @param parentOuName string - Name of the parent OU (default: 'Root')
   * @param credentials {@link IAssumeRoleCredential} | undefined
   * @param solutionId string | undefined
   * @returns string OuId
   */
  public static async createOu(
    globalRegion: string,
    ouName: string,
    parentOuName: string = 'Root',
    credentials?: IAssumeRoleCredential,
    solutionId?: string,
  ): Promise<string> {
    Organization.logger.info(`Creating Organizational Unit "${ouName}" under "${parentOuName}"`);

    const client: OrganizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });

    const parentOuId = await getParentOuId(client, parentOuName);

    if (!parentOuId) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Parent OU "${parentOuName}" not found.`);
    }

    const organizationalUnitsForParent = await getOrganizationalUnitsForParent(client, parentOuId);
    const existingOu = organizationalUnitsForParent.find(ou => ou.Name === ouName);

    if (existingOu && existingOu.Id) {
      Organization.logger.info(
        `AWS Organizations organizational unit "${ouName}" already exists with ID "${existingOu.Id}", skipping creation.`,
      );
      return existingOu.Id;
    }

    const response = await throttlingBackOff(() =>
      client.send(
        new CreateOrganizationalUnitCommand({
          Name: ouName,
          ParentId: parentOuId,
        }),
      ),
    );

    if (!response.OrganizationalUnit || !response.OrganizationalUnit.Id) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Organization unit "${ouName}" create organization unit api did not return OrganizationalUnit object with ID.`,
      );
    }

    Organization.logger.info(
      `AWS Organizations organizational unit "${ouName}" created successfully with ID "${response.OrganizationalUnit.Id}".`,
    );
    return response.OrganizationalUnit.Id;
  }

  /**
   * Function to move accounts to a specified OU
   *
   * @param globalRegion string
   * @param destinationOuId string - The ID of the destination OU
   * @param accountEmails string[] - Array of account email addresses to move
   * @param credentials {@link IAssumeRoleCredential} | undefined
   * @param solutionId string | undefined
   */
  public static async moveAccounts(
    globalRegion: string,
    destinationOuId: string,
    accountEmails: string[],
    credentials?: IAssumeRoleCredential,
    solutionId?: string,
  ): Promise<void> {
    Organization.logger.info(`Moving ${accountEmails.length} account(s) to OU "${destinationOuId}"`);

    const client: OrganizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });

    // Move accounts in parallel
    const promises: Promise<void>[] = [];
    for (const accountEmail of accountEmails) {
      promises.push(Organization.moveAccountToOu(client, accountEmail, destinationOuId));
    }

    await Promise.all(promises);

    Organization.logger.info(`Successfully moved ${accountEmails.length} account(s) to OU "${destinationOuId}"`);
  }

  /**
   * Helper function to move an account to a destination OU
   *
   * @param client {@link OrganizationsClient}
   * @param accountEmail string
   * @param destinationOuId string - The ID of the destination OU
   */
  private static async moveAccountToOu(
    client: OrganizationsClient,
    accountEmail: string,
    destinationOuId: string,
  ): Promise<void> {
    const accountId = await getAccountId(client, accountEmail);

    const listParentsResponse = await throttlingBackOff(() =>
      client.send(
        new ListParentsCommand({
          ChildId: accountId,
        }),
      ),
    );

    if (!listParentsResponse.Parents || listParentsResponse.Parents.length === 0) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${accountEmail}" does not have a parent OU.`);
    }

    const sourceParentId = listParentsResponse.Parents[0].Id!;

    if (sourceParentId === destinationOuId) {
      Organization.logger.info(`Account "${accountEmail}" is already in OU "${destinationOuId}", skipping move.`);
      return;
    }

    await throttlingBackOff(() =>
      client.send(
        new MoveAccountCommand({
          AccountId: accountId,
          DestinationParentId: destinationOuId,
          SourceParentId: sourceParentId,
        }),
      ),
    );

    Organization.logger.info(`Account "${accountEmail}" successfully moved to OU "${destinationOuId}".`);
  }
}
