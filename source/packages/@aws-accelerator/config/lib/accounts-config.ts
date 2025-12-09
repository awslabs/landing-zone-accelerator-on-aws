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

import { STSClient, GetCallerIdentityCommand, GetCallerIdentityCommandOutput } from '@aws-sdk/client-sts';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { OrganizationsClient, ListAccountsCommand, ListAccountsCommandOutput } from '@aws-sdk/client-organizations';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import {
  createLogger,
  getGlobalRegion,
  getSSMParameterValue,
  queryConfigTable,
  setRetryStrategy,
  throttlingBackOff,
} from '@aws-accelerator/utils';
import { createSchema, DeploymentTargets, parseAccountsConfig } from './common';
import * as i from './models/accounts-config';
import { OrganizationalUnitConfig } from './organization-config';
import { Account } from '@aws-sdk/client-organizations';
import { removeDuplicates, safeParseJsonProperty } from './common/config-helper';

const logger = createLogger(['accounts-config']);

export class AccountIdConfig implements i.IAccountIdConfig {
  readonly email: string = '';
  readonly accountId: string = '';
  readonly orgsApiResponse?: Account = undefined;
  readonly status?: string = '';
}

export class AccountConfig implements i.IAccountConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly email: string = '';
  readonly organizationalUnit: string = '';
  readonly warm: boolean | undefined = undefined;
  readonly accountAlias?: string | undefined = undefined;
}

export class GovCloudAccountConfig implements i.IGovCloudAccountConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly email: string = '';
  readonly organizationalUnit: string = '';
  readonly orgsApiResponse: Account | undefined = undefined;
  readonly warm: boolean | undefined = undefined;
  readonly enableGovCloud: boolean | undefined = undefined;
  readonly accountAlias?: string | undefined = undefined;
}

export class AccountsConfig implements i.IAccountsConfig {
  static readonly FILENAME = 'accounts-config.yaml';
  static readonly MANAGEMENT_ACCOUNT = 'Management';
  static readonly LOG_ARCHIVE_ACCOUNT = 'LogArchive';
  static readonly AUDIT_ACCOUNT = 'Audit';

  readonly mandatoryAccounts: AccountConfig[] | GovCloudAccountConfig[] = [];

  readonly workloadAccounts: AccountConfig[] | GovCloudAccountConfig[] = [];

  private readonly solutionId: string;
  private readonly awsRegion: string;
  private readonly acceleratorSsmParamNamePrefix: string;
  private readonly configCommitId: string;

  /**
   * Optionally provide a list of AWS Account IDs to bypass the usage of the
   * AWS Organizations Client lookup. This is not a readonly member since we
   * will initialize it with values if it is not provided
   */
  public accountIds: AccountIdConfig[] | undefined = undefined;

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
   *
   * @param props
   * @param values
   * @param validateConfig
   */
  constructor(
    props: { managementAccountEmail: string; logArchiveAccountEmail: string; auditAccountEmail: string },
    values?: i.IAccountsConfig,
  ) {
    // Initialize environment variables in constructor for better testability
    this.solutionId = process.env['SOLUTION_ID'] ?? '';
    this.awsRegion = process.env['AWS_REGION'] ?? '';
    if (!process.env['ACCELERATOR_SSM_PARAM_NAME_PREFIX']) {
      logger.warn(
        'ACCELERATOR_SSM_PARAM_NAME_PREFIX environment variable is not defined, continuing with default value of /accelerator',
      );
      this.acceleratorSsmParamNamePrefix = '/accelerator';
    } else {
      this.acceleratorSsmParamNamePrefix = process.env['ACCELERATOR_SSM_PARAM_NAME_PREFIX'];
    }
    this.configCommitId = process.env['CONFIG_COMMIT_ID'] ?? '';

    if (values) {
      Object.assign(this, values);
    } else {
      this.mandatoryAccounts = this._createDefaultMandatoryAccounts(props);
    }
  }

  /**
   * Creates the default mandatory accounts configuration
   * @param props Account email configuration
   * @returns Array of default mandatory accounts
   */
  private _createDefaultMandatoryAccounts(props: {
    managementAccountEmail: string;
    logArchiveAccountEmail: string;
    auditAccountEmail: string;
  }): AccountConfig[] {
    return [
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
    logger.debug('accounts loaded file');
    // Create schema with custom !include tag
    const schema = createSchema(dir);
    // Load YAML with custom schema
    let values: i.IAccountsConfig | undefined = undefined;
    try {
      values = parseAccountsConfig(yaml.load(buffer, { schema }));
    } catch (e) {
      logger.error('parsing accounts-config failed', e);
      throw new Error('Could not parse accounts configuration');
    }
    const managementAccountEmail =
      (values!.mandatoryAccounts as unknown as i.IBaseAccountConfig[])
        .find(value => value.name == AccountsConfig.MANAGEMENT_ACCOUNT)
        ?.email.toLocaleLowerCase() || '<management-account>@example.com <----- UPDATE EMAIL ADDRESS';
    const logArchiveAccountEmail =
      (values!.mandatoryAccounts as unknown as i.IBaseAccountConfig[])
        .find(value => value.name == AccountsConfig.LOG_ARCHIVE_ACCOUNT)
        ?.email.toLocaleLowerCase() || '<log-archive-account>@example.com <----- UPDATE EMAIL ADDRESS';
    const auditAccountEmail =
      (values!.mandatoryAccounts as unknown as i.IBaseAccountConfig[])
        .find(value => value.name == AccountsConfig.AUDIT_ACCOUNT)
        ?.email.toLocaleLowerCase() || '<audit-account>@example.com <----- UPDATE EMAIL ADDRESS';

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
    managementAccountCredentials?: AwsCredentialIdentity,
    loadFromDynamoDbTable?: boolean,
  ): Promise<void> {
    if (enableSingleAccountMode) {
      await this._loadAccountIdsForSingleAccountMode();
      return;
    }

    if (!this.accountIds) this.accountIds = [];

    if (isOrgsEnabled) {
      if (loadFromDynamoDbTable) {
        await this._loadAccountIdsFromDynamoDB(accountsConfig, managementAccountCredentials);
      } else {
        await this._loadAccountIdsFromOrganizationsAPI(partition, managementAccountCredentials);
      }
    } else {
      if (accountsConfig.accountIds) {
        this._loadAccountIdsFromConfig(accountsConfig);
      } else {
        this._validateAccountIdsForDisabledOrgs(accountsConfig);
      }
    }
  }

  public getAccountId(name: string): string {
    const email = this.getAccount(name).email.toLocaleLowerCase();
    const accountId = this.accountIds?.find(item => item.email.toLocaleLowerCase() === email)?.accountId;
    if (accountId) {
      return accountId;
    }

    // Get installer stack name from environment variable for more specific error messages
    const installerStackName = process.env['INSTALLER_STACK_NAME'] || 'AWSAccelerator-InstallerStack';

    throw new Error(
      `Account Name not found for ${name}. Validate that the emails in the parameter ManagementAccountEmail of the ${installerStackName} and account configs (accounts-config.yaml) match the correct account emails shown in AWS Organizations. Configuration validation failed.`,
    );
  }

  public getAccountNameById(accountId: string): string | undefined {
    const email = this.accountIds?.find(item => item.accountId === accountId)?.email.toLocaleLowerCase();
    const accounts = this.getAccounts(false);
    const accountName = accounts.find(account => account.email.toLocaleLowerCase() === email)?.name;

    if (accountName) {
      return accountName;
    }

    // Get installer stack name from environment variable for more specific error messages
    const installerStackName = process.env['INSTALLER_STACK_NAME'] || 'AWSAccelerator-InstallerStack';

    throw new Error(
      `Account Name not found for ${accountId}. Validate that the emails in the parameter ManagementAccountEmail of the ${installerStackName} and account configs (accounts-config.yaml) match the correct account emails shown in AWS Organizations. Configuration validation failed.`,
    );
  }

  public getAccountIds(): string[] {
    const accountEmails = [...this.mandatoryAccounts, ...this.workloadAccounts].map(account =>
      account.email.toLocaleLowerCase(),
    );
    const lzaAccounts =
      this.accountIds?.filter(item => {
        if (accountEmails.includes(item.email.toLocaleLowerCase())) {
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

  private getActiveAccounts(suspendedOus: OrganizationalUnitConfig[]): (AccountConfig | GovCloudAccountConfig)[] {
    const accounts = this.getAccounts();
    const suspendedOuNames = suspendedOus.flatMap(item => item.name);
    return accounts.filter(account => !suspendedOuNames.includes(account.organizationalUnit));
  }

  public getActiveAccountIds(suspendedOus: OrganizationalUnitConfig[]) {
    const activeAccounts = this.getActiveAccounts(suspendedOus);
    const activeAccountIds = activeAccounts.map(account => this.getAccountId(account.name));
    const accountIds = this.getAccountIds();
    return accountIds.filter(accountId => activeAccountIds.includes(accountId));
  }
  public getAccount(name: string): AccountConfig {
    const value = [...this.mandatoryAccounts, ...this.workloadAccounts].find(item => item.name == name);
    if (value) {
      return value;
    }
    // Get installer stack name from environment variable for more specific error messages
    const installerStackName = process.env['INSTALLER_STACK_NAME'] || 'AWSAccelerator-InstallerStack';

    logger.error(
      `Account name not found for ${name}. Validate that the emails in the parameter ManagementAccountEmail of the ${installerStackName} and account configs (accounts-config.yaml) match the correct account emails shown in AWS Organizations.`,
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

  public getAccounts(enableSingleAccountMode?: boolean): (AccountConfig | GovCloudAccountConfig)[] {
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

  // Helper function to add an account id to the list
  private _addAccountId(ids: string[], accountId: string) {
    if (!ids.includes(accountId)) {
      ids.push(accountId);
    }
  }

  private async _loadAccountIdsForSingleAccountMode(): Promise<void> {
    const stsClient = new STSClient({
      region: this.awsRegion,
      customUserAgent: this.solutionId,
      retryStrategy: setRetryStrategy(),
    });
    const stsCallerIdentity = (await throttlingBackOff(() =>
      stsClient.send(new GetCallerIdentityCommand({})),
    )) as GetCallerIdentityCommandOutput;
    const currentAccountId = stsCallerIdentity.Account!;
    this.mandatoryAccounts.forEach(item => {
      this.accountIds?.push({
        email: item.email.toLocaleLowerCase(),
        accountId: currentAccountId,
      });
    });
  }

  /**
   * Loads account IDs from DynamoDB table
   */
  private async _loadAccountIdsFromDynamoDB(
    accountsConfig: AccountsConfig,
    credentials?: AwsCredentialIdentity,
  ): Promise<void> {
    logger.debug(`Orgs is enabled, solution will query from dynamoDB table instead of AWS Organizations API`);
    const ssmConfigTableNameParameter = `${this.acceleratorSsmParamNamePrefix}/prepare-stack/configTable/name`;

    const configTableName = await getSSMParameterValue(ssmConfigTableNameParameter, credentials);
    const [mandatoryAccountItems, workloadAccountItems] = await Promise.all([
      queryConfigTable(configTableName, 'mandatoryAccount', 'orgInfo', credentials, this.configCommitId),
      queryConfigTable(configTableName, 'workloadAccount', 'orgInfo', credentials, this.configCommitId),
    ]);

    const configAccountEmails = [
      ...accountsConfig.mandatoryAccounts.map(account => account.email.toLowerCase()),
      ...accountsConfig.workloadAccounts.map(account => account.email.toLowerCase()),
    ];

    const allAccounts = [
      ...mandatoryAccountItems.map(item => safeParseJsonProperty<AccountIdConfig>(item, 'orgInfo')),
      ...workloadAccountItems.map(item => safeParseJsonProperty<AccountIdConfig>(item, 'orgInfo')),
    ];

    const filteredAccounts = allAccounts.filter(account => configAccountEmails.includes(account.email.toLowerCase()));

    logger.debug(`Successfully retrieved accounts data from DynamoDB`);

    this.accountIds!.push(...filteredAccounts);
    this.accountIds = removeDuplicates(this.accountIds!, account => account.email);
  }

  /**
   * Loads account IDs from AWS Organizations API
   */
  private async _loadAccountIdsFromOrganizationsAPI(
    partition: string,
    credentials?: AwsCredentialIdentity,
  ): Promise<void> {
    logger.debug(`Orgs is enabled, solution will query from AWS Organizations API`);

    const retryStrategy = setRetryStrategy();

    const organizationsClient = new OrganizationsClient({
      region: getGlobalRegion(partition),
      credentials: credentials,
      customUserAgent: this.solutionId,
      retryStrategy,
    });

    let nextToken: string | undefined = undefined;

    do {
      const page = (await throttlingBackOff(() =>
        organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })),
      )) as ListAccountsCommandOutput;

      page.Accounts?.forEach((item: Account) => {
        if (item.Email && item.Id) {
          this.accountIds?.push({
            email: item.Email.toLocaleLowerCase(),
            accountId: item.Id,
            status: item.Status,
            orgsApiResponse: item as Account,
          });
        }
      });
      nextToken = page.NextToken;
    } while (nextToken);

    this.accountIds = removeDuplicates(this.accountIds!, account => account.email);
  }

  /**
   * Loads account IDs from provided configuration
   */
  private _loadAccountIdsFromConfig(accountsConfig: AccountsConfig): void {
    for (const account of accountsConfig.accountIds ?? []) {
      this.accountIds?.push({
        email: account.email.toLowerCase(),
        accountId: account.accountId,
      });
    }
  }

  /**
   * Validates that sufficient account IDs are provided when organizations is disabled
   */
  private _validateAccountIdsForDisabledOrgs(accountsConfig: AccountsConfig): void {
    if ((accountsConfig.accountIds ?? []).length < 3) {
      throw new Error(`Organization is disabled, but the number of accounts in the accounts config is less than 3.`);
    }
  }
}
