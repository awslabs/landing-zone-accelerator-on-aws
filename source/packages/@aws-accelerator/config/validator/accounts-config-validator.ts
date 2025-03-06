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

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import * as emailValidator from 'email-validator';
import { AccountsConfig, AccountConfig } from '../lib/accounts-config';
import { OrganizationConfig } from '../lib/organization-config';

export class AccountsConfigValidator {
  constructor(values: AccountsConfig, organizationConfig: OrganizationConfig) {
    const ouIdNames: string[] = ['Root'];

    const errors: string[] = [];

    const logger = createLogger(['accounts-config-validator']);

    logger.info(`${AccountsConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    //
    ouIdNames.push(...this.getOuIdNames(organizationConfig));
    //
    // Validate OU name for account
    //
    this.validateAccountOrganizationalUnit(values, ouIdNames, organizationConfig, errors);
    //
    // Verify mandatory account names did not change
    //
    this.validateMandatoryAccountNames(values, errors);
    //
    // Verify account names are unique and name without space
    //
    this.validateAccountNames(values, errors);
    //
    // Email validation
    //
    this.validateEmails(values, errors);
    //
    // Account Alias validation
    //
    this.validateAccountAliases(values, errors);

    if (errors.length) {
      throw new Error(`${AccountsConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
  }

  /**
   * Function to validate account aliases and look for duplicates within the config
   * @param values
   */
  private validateAccountAliases(values: AccountsConfig, errors: string[]) {
    const aliases = new Set<string>();

    // Helper function to check for duplicate aliases
    const checkForDuplicateAliases = (accounts: AccountConfig[], accountType = '') => {
      for (const account of accounts ?? []) {
        if (account.accountAlias) {
          if (aliases.has(account.accountAlias)) {
            errors.push(
              `${accountType} alias "${account.accountAlias}" is duplicated. Account aliases must be unique across all accounts.`,
            );
          } else {
            aliases.add(account.accountAlias);
          }
        }
      }
    };

    // Check mandatory and workload accounts for duplicate aliases
    checkForDuplicateAliases(values.mandatoryAccounts, 'Account');
    checkForDuplicateAliases(values.workloadAccounts, 'Workload Account');

    // Validate alias format
    aliases.forEach(alias => {
      // AWS account alias constraints:
      // - Must be unique across all AWS accounts
      // - Must contain only lowercase letters, digits, and dashes
      // - Must start with a letter or number
      // - Must be between 3 and 63 characters long
      const aliasRegex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
      if (!aliasRegex.test(alias)) {
        errors.push(
          `Account alias "${alias}" is invalid. Aliases must be between 3 and 63 characters long, ` +
            `contain only lowercase letters, numbers, and hyphens, and must start and end with a letter or number.`,
        );
      }
    });
  }

  /**
   * Function to validate email formats, default and duplicate email checks
   * @param values
   */
  private validateEmails(values: AccountsConfig, errors: string[]) {
    const emails = [...values.mandatoryAccounts, ...values.workloadAccounts].map(item => item.email);
    const defaultEmails = ['management-account@example.com', 'log-archive@example.com', 'audit@example.com'];

    //
    // validate email format
    //
    emails.forEach(item => {
      if (!emailValidator.validate(item)) {
        errors.push(`Invalid email ${item}.`);
      }
    });

    //
    // default email check
    //
    defaultEmails.forEach(item => {
      if (emails.indexOf(item) !== -1) {
        errors.push(`Default email (${item}) found.`);
      }
    });

    // Check for duplicates altered to allow for single account deployment
    const singleAccountDeployment = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
      ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
      : false;
    if (singleAccountDeployment) {
      return;
    } else {
      this.findDuplicateEmails(values, errors);
    }
  }

  /**
   * Finds duplicate emails in the given accounts configuration.
   *
   * @param values - The AccountsConfig object containing mandatory and workload accounts.
   * @param errors - An array to store error messages for duplicate emails.
   *
   * @description This function iterates over the mandatory and workload accounts in the provided AccountsConfig object.
   * It checks for duplicate emails by maintaining a Map of emails and their associated account names.
   * If a duplicate email is found, it adds an error message to the `errors` array with the duplicate email
   * and the associated account names.
   * Adding account name will help find all affected accounts in arrays with over 100 objects.
   */
  private findDuplicateEmails(values: AccountsConfig, errors: string[]) {
    const emailMap = new Map<string, string[]>();
    const allAccounts = [...values.mandatoryAccounts, ...values.workloadAccounts];

    for (const account of allAccounts) {
      const { name, email } = account;
      if (emailMap.has(email)) {
        const accountNames = emailMap.get(email);
        accountNames?.push(name);
        errors.push(`Duplicate email: ${email}, associated with multiple accounts: ${accountNames?.join(', ')}`);
      } else {
        emailMap.set(email, [name]);
      }
    }
  }

  /**
   * Function to verify account names are unique and name without space
   * @param values
   */
  private validateAccountNames(values: AccountsConfig, errors: string[]) {
    const accountNames = [...values.mandatoryAccounts, ...values.workloadAccounts].map(item => item.name);
    if (new Set(accountNames).size !== accountNames.length) {
      errors.push(`Duplicate account names defined [${accountNames}].`);
    }

    for (const account of [...values.mandatoryAccounts, ...values.workloadAccounts]) {
      if (account.name.indexOf(' ') > 0) {
        errors.push(`Account name (${account.name}) found with spaces. Please remove spaces and retry the pipeline.`);
      }
    }
  }

  /**
   * Function to verify mandatory account names did not change
   * @param values
   */
  private validateMandatoryAccountNames(values: AccountsConfig, errors: string[]) {
    for (const accountName of [
      AccountsConfig.MANAGEMENT_ACCOUNT,
      AccountsConfig.AUDIT_ACCOUNT,
      AccountsConfig.LOG_ARCHIVE_ACCOUNT,
    ]) {
      if (!values.mandatoryAccounts.find(item => item.name === accountName)) {
        errors.push(`Unable to find mandatory account with name ${accountName}.`);
      }
    }
  }

  /**
   * Function to validate existence of account deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateAccountOrganizationalUnit(
    values: AccountsConfig,
    ouIdNames: string[],
    organizationConfig: OrganizationConfig,
    errors: string[],
  ) {
    for (const account of [...values.mandatoryAccounts, ...values.workloadAccounts]) {
      if (account.organizationalUnit) {
        // Check if OU exists
        if (!ouIdNames.includes(account.organizationalUnit)) {
          errors.push(
            `OU ${account.organizationalUnit} for account ${account.name} does not exist in organization-config.yaml file.`,
          );
        } else {
          // Check if OU is ignored
          const isIgnoredOu = organizationConfig.organizationalUnits.find(
            ou => ou.name === account.organizationalUnit && ou.ignore,
          );
          if (isIgnoredOu) {
            errors.push(
              `OU ${account.organizationalUnit} for account ${account.name} is ignored. Please remove the account from accounts-config.yaml or target a different OU`,
            );
          }
        }
      }
    }
  }

  /**
   * Prepare list of OU ids from organization config file
   * @param configDir
   */
  private getOuIdNames(organizationConfig: OrganizationConfig): string[] {
    const ouIdNames: string[] = [];

    for (const organizationalUnit of organizationConfig.organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
    }
    return ouIdNames;
  }
}
