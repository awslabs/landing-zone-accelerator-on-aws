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

import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import * as i from './models/accounts-config';
import { DeploymentTargets, parseAccountsConfig } from './common';

const logger = createLogger(['accounts-config']);

export class AccountIdConfig implements i.IAccountIdConfig {
  readonly email: string = '';
  readonly accountId: string = '';
  readonly status?: string = '';
}

export class AccountConfig implements i.IAccountConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly email: string = '';
  readonly organizationalUnit: string = '';
  readonly warm: boolean | undefined = undefined;
}

export class GovCloudAccountConfig implements i.IGovCloudAccountConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly email: string = '';
  readonly organizationalUnit: string = '';
  readonly warm: boolean | undefined = undefined;
  readonly enableGovCloud: boolean | undefined = undefined;
}

export class AccountsConfig implements i.IAccountsConfig {
  static readonly FILENAME = 'accounts-config.yaml';
  static readonly MANAGEMENT_ACCOUNT = 'Management';
  static readonly LOG_ARCHIVE_ACCOUNT = 'LogArchive';
  static readonly AUDIT_ACCOUNT = 'Audit';

  readonly mandatoryAccounts: AccountConfig[] | GovCloudAccountConfig[] = [];

  readonly workloadAccounts: AccountConfig[] | GovCloudAccountConfig[] = [];

  public isGovCloudAccount(account: AccountConfig | GovCloudAccountConfig) {
    if ('enableGovCloud' in account) {
      return true;
    } else {
      return false;
    }
  }

  public anyGovCloudAccounts(): boolean {
    for (const account of this.workloadAccounts) {
      if (this.isGovCloudAccount(account)) {
        return true;
      }
    }
    return false;
  }

  public isGovCloudEnabled(account: AccountConfig | GovCloudAccountConfig) {
    if (this.isGovCloudAccount(account)) {
      return (account as GovCloudAccountConfig).enableGovCloud;
    }
    return false;
  }

  /**
   * Optionally provide a list of AWS Account IDs to bypass the usage of the
   * AWS Organizations Client lookup. This is not a readonly member since we
   * will initialize it with values if it is not provided
   */
  public accountIds: AccountIdConfig[] | undefined = undefined;

  /**
   *
   * @param props
   * @param values
   * @param validateConfig
   */
  constructor(
    props: { managementAccountEmail: string; logArchiveAccountEmail: string; auditAccountEmail: string },
    values?: i.IAccountsConfig,
  ) {
    if (values) {
      Object.assign(this, values);
    } else {
      this.mandatoryAccounts = [
        {
          name: AccountsConfig.MANAGEMENT_ACCOUNT,
          description:
            'The management (primary) account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
          email: props.managementAccountEmail,
          organizationalUnit: 'Root',
          warm: false,
        },
        {
          name: AccountsConfig.LOG_ARCHIVE_ACCOUNT,
          description:
            'The log archive account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
          email: props.logArchiveAccountEmail,
          organizationalUnit: 'Security',
          warm: false,
        },
        {
          name: AccountsConfig.AUDIT_ACCOUNT,
          description:
            'The security audit account (also referred to as the audit account). Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
          email: props.auditAccountEmail,
          organizationalUnit: 'Security',
          warm: false,
        },
      ];
    }
  }

  // Helper function to add an account id to the list
  private _addAccountId(ids: string[], accountId: string) {
    if (!ids.includes(accountId)) {
      ids.push(accountId);
    }
  }

  /**
   *
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string): AccountsConfig {
    if (!fs.existsSync(path.join(dir, AccountsConfig.FILENAME))) {
      throw new Error(
        `Error loading accounts-config.yaml. Please verify this file is at the root of the configuration repository or archive. If you are using S3, this may indicate your zip archive includes a nested aws-accelerator-config directory.`,
      );
    }

    const buffer = fs.readFileSync(path.join(dir, AccountsConfig.FILENAME), 'utf8');
    const values = parseAccountsConfig(yaml.load(buffer));
    const managementAccountEmail =
      (values.mandatoryAccounts as unknown as i.IBaseAccountConfig[]).find(
        value => value.name == AccountsConfig.MANAGEMENT_ACCOUNT,
      )?.email || '<management-account>@example.com <----- UPDATE EMAIL ADDRESS';
    const logArchiveAccountEmail =
      (values.mandatoryAccounts as unknown as i.IBaseAccountConfig[]).find(
        value => value.name == AccountsConfig.MANAGEMENT_ACCOUNT,
      )?.email || '<management-account>@example.com <----- UPDATE EMAIL ADDRESS';
    const auditAccountEmail =
      (values.mandatoryAccounts as unknown as i.IBaseAccountConfig[]).find(
        value => value.name == AccountsConfig.MANAGEMENT_ACCOUNT,
      )?.email || '<management-account>@example.com <----- UPDATE EMAIL ADDRESS';

    return new AccountsConfig(
      {
        managementAccountEmail,
        logArchiveAccountEmail,
        auditAccountEmail,
      },
      values,
    );
  }

  /**
   * Loads account ids by utilizing the organizations client if account ids are
   * not provided in the config.
   */
  public async loadAccountIds(
    partition: string,
    enableSingleAccountMode: boolean,
    isOrgsEnabled: boolean,
    accountsConfig: AccountsConfig,
    /**
     * Management account credential when deployed from external account, otherwise this should remain undefined
     */
    managementAccountCredentials?: AWS.Credentials,
  ): Promise<void> {
    logger.info(`SATHYA: In loadAccountIds :: partition: ${partition}, enableSingleAccountMode: ${enableSingleAccountMode}, isOrgsEnabled: ${isOrgsEnabled}`);
  
    if (this.accountIds === undefined) {
      logger.info(`SATHYA: accountIds is undefined, initializing to empty array`);
      this.accountIds = [];
    }
  
    if (this.accountIds.length == 0) {
      logger.info(`SATHYA: accountIds is empty, loading account IDs`);
  
      if (enableSingleAccountMode) {
        logger.info(`SATHYA: Single account mode enabled`);
        const stsClient = new AWS.STS({ region: process.env['AWS_REGION'] });
        const stsCallerIdentity = await throttlingBackOff(() => stsClient.getCallerIdentity({}).promise());
        const currentAccountId = stsCallerIdentity.Account!;
        logger.info(`SATHYA: Retrieved current account ID: ${currentAccountId}`);
  
        this.mandatoryAccounts.forEach(item => {
          this.accountIds?.push({ email: item.email, accountId: currentAccountId });
          logger.info(`SATHYA: Added mandatory account with email: ${item.email}, accountId: ${currentAccountId}`);
        });
  
      } else if (isOrgsEnabled) {
        logger.info(`SATHYA: Organizations enabled`);
        let organizationsClient: AWS.Organizations;
  
        if (partition === 'aws-us-gov') {
          organizationsClient = new AWS.Organizations({
            region: 'us-gov-west-1',
            credentials: managementAccountCredentials,
          });
        } else if (partition === 'aws-cn') {
          organizationsClient = new AWS.Organizations({
            region: 'cn-northwest-1',
            credentials: managementAccountCredentials,
          });
        } else if (partition === 'aws-iso-f') {
          organizationsClient = new AWS.Organizations({
            region: 'us-isof-south-1',
            credentials: managementAccountCredentials,
          });
        } else if (partition === 'aws-iso-e') {
          organizationsClient = new AWS.Organizations({
            region: 'eu-isoe-west-1',
            credentials: managementAccountCredentials,
          });
        } else {
          organizationsClient = new AWS.Organizations({
            region: 'us-east-1',
            credentials: managementAccountCredentials,
          });
        }
  
        logger.info(`SATHYA: Initialized Organizations client for partition: ${partition} `);
  
        let nextToken: string | undefined = undefined;
  
        do {
          const page = await throttlingBackOff(() =>
            organizationsClient.listAccounts({ NextToken: nextToken }).promise(),
          );
  
          page.Accounts?.forEach(item => {
            if (item.Email && item.Id) {
              this.accountIds?.push({ email: item.Email, accountId: item.Id, status: item.Status });
              logger.info(`SATHYA: Added account with email: ${item.Email}, accountId: ${item.Id}, status: ${item.Status}`);
            }
          });
          nextToken = page.NextToken;
          logger.info(`SATHYA: NextToken: ${nextToken}`);
        } while (nextToken);
  
      } else if (!isOrgsEnabled && (accountsConfig.accountIds ?? []).length > 2) {
        logger.info(`SATHYA: Organizations disabled, loading account IDs from accountsConfig`);
  
        for (const account of accountsConfig.accountIds ?? []) {
          this.accountIds?.push({ email: account.email, accountId: account.accountId });
          logger.info(`SATHYA: Added account from config with email: ${account.email}, accountId: ${account.accountId}`);
        }
  
      } else if (!isOrgsEnabled && (accountsConfig.accountIds ?? []).length < 3) {
        logger.error(`SATHYA: Organization is disabled, but the number of accounts in the accounts config is less than 3`);
        throw new Error(`Organization is disabled, but the number of accounts in the accounts config is less than 3.`);
      }
    }
  }

  public getAccountId(name: string): string {
    logger.info(`SATHYA: In getAccountId :: invoked with name:{name}`)
    const email = this.getAccount(name).email;

    logger.info(`SATHYA: Current accountIds: ${JSON.stringify(this.accountIds)}`);

    logger.info(`SATHYA: In getAccountId :: getAccount email:{email} for name:{name}`)
    const accountId = this.accountIds?.find(item => item.email === email)?.accountId;
    if (accountId) {

      logger.info(`SATHYA: In getAccountId :: returned  accountId:{accountId} for name:{name}`)
      return accountId;
    }

    logger.info(`SATHYA: In getAccountId :: accountId is null `)
    logger.error(
      `Account ID not found for ${name}. Validate that the emails in the parameter ManagementAccountEmail of the AWSAccelerator-InstallerStack and account configs (accounts-config.yaml) match the correct account emails shown in AWS Organizations.`,
    );
    throw new Error('configuration validation failed.');
  }

  public getAccountNameById(accountId: string): string | undefined {
    const email = this.accountIds?.find(item => item.accountId === accountId)?.email;
    const accounts = this.getAccounts(false);
    const accountName = accounts.find(account => account.email === email)?.name;

    if (accountName) {
      return accountName;
    }
    logger.error(
      `Account Name not found for ${accountId}. Validate that the emails in the parameter ManagementAccountEmail of the AWSAccelerator-InstallerStack and account configs (accounts-config.yaml) match the correct account emails shown in AWS Organizations.`,
    );
    throw new Error('configuration validation failed.');
  }

  public getAccountIds(): string[] {
    const accountEmails = [...this.mandatoryAccounts, ...this.workloadAccounts].map(account => account.email);
    const lzaAccounts =
      this.accountIds?.filter(item => {
        if (accountEmails.includes(item.email)) {
          if (!item.status) {
            return true;
          }
          if (item.status === 'ACTIVE') {
            return true;
          }
        }
        return false;
      }) ?? [];
    return lzaAccounts.map(account => account.accountId);
  }

  public getAccount(name: string): AccountConfig {
    const value = [...this.mandatoryAccounts, ...this.workloadAccounts].find(item => item.name == name);
    if (value) {
      return value;
    }
    logger.error(
      `Account name not found for ${name}. Validate that the emails in the parameter ManagementAccountEmail of the AWSAccelerator-InstallerStack and account configs (accounts-config.yaml) match the correct account emails shown in AWS Organizations.`,
    );
    throw new Error('configuration validation failed.');
  }

  public containsAccount(name: string): boolean {
    const value = [...this.mandatoryAccounts, ...this.workloadAccounts].find(item => item.name == name);
    if (value) {
      return true;
    }

    return false;
  }

  public getAccounts(enableSingleAccountMode: boolean): (AccountConfig | GovCloudAccountConfig)[] {
    if (enableSingleAccountMode) {
      return [this.getManagementAccount()];
    } else {
      return [...this.mandatoryAccounts, ...this.workloadAccounts];
    }
  }

  public getAccountIdsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [...this.mandatoryAccounts, ...this.workloadAccounts]) {
          const accountId = this.getAccountId(account.name);
          this._addAccountId(accountIds, accountId);
        }
      } else {
        for (const account of [...this.mandatoryAccounts, ...this.workloadAccounts]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.getAccountId(account.name);
            this._addAccountId(accountIds, accountId);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      const accountId = this.getAccountId(account);
      this._addAccountId(accountIds, accountId);
    }

    const excludedAccountIds = this.getExcludedAccountIds(deploymentTargets);
    const filteredAccountIds = accountIds.filter(item => !excludedAccountIds.includes(item));

    return filteredAccountIds;
  }

  public getExcludedAccountIds(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    if (deploymentTargets.excludedAccounts) {
      deploymentTargets.excludedAccounts.forEach(account => this._addAccountId(accountIds, this.getAccountId(account)));
    }

    return accountIds;
  }

  public getManagementAccount(): AccountConfig {
    return this.getAccount(AccountsConfig.MANAGEMENT_ACCOUNT);
  }

  public getLogArchiveAccount(): AccountConfig {
    return this.getAccount(AccountsConfig.LOG_ARCHIVE_ACCOUNT);
  }

  public getAuditAccount(): AccountConfig {
    return this.getAccount(AccountsConfig.AUDIT_ACCOUNT);
  }

  public getManagementAccountId(): string {
    return this.getAccountId(AccountsConfig.MANAGEMENT_ACCOUNT);
  }

  public getLogArchiveAccountId(): string {
    return this.getAccountId(AccountsConfig.LOG_ARCHIVE_ACCOUNT);
  }

  public getAuditAccountId(): string {
    return this.getAccountId(AccountsConfig.AUDIT_ACCOUNT);
  }
}
