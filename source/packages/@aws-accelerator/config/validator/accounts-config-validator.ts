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

import { createLogger } from '@aws-accelerator/utils';
import * as emailValidator from 'email-validator';
import { AccountsConfig, AccountConfig } from '../lib/accounts-config';
import { OrganizationConfig } from '../lib/organization-config';

export class AccountsConfigValidator {
  private readonly accountsConfig: AccountsConfig;
  private readonly organizationConfig: OrganizationConfig;
  private readonly logger = createLogger(['accounts-config-validator']);

  constructor(values: AccountsConfig, organizationConfig: OrganizationConfig) {
    this.accountsConfig = values;
    this.organizationConfig = organizationConfig;
  }

  public validate(): void {
    const errors: string[] = [];

    this.logger.info(`${AccountsConfig.FILENAME} file validation started`);

    //
    // Validate OU name for account
    //
    errors.push(...this.validateAccountOrganizationalUnit());
    //
    // Verify mandatory account names did not change
    //
    errors.push(...this.validateMandatoryAccountNames());
    //
    // Verify account names are unique and name without space
    //
    errors.push(...this.validateAccountNames());
    //
    // Email validation
    //
    errors.push(...this.validateEmails());
    //
    // Account Alias validation
    //
    errors.push(...this.validateAccountAliases());
    //
    // Account Tags validation
    //
    errors.push(...this.validateAccountTags());

    if (errors.length) {
      throw new Error(`${AccountsConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
  }

  /**
   * Function to validate account aliases and look for duplicates within the config
   * @returns Array of validation errors
   */
  private validateAccountAliases(): string[] {
    const errors: string[] = [];
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
    checkForDuplicateAliases(this.accountsConfig.mandatoryAccounts, 'Account');
    checkForDuplicateAliases(this.accountsConfig.workloadAccounts, 'Workload Account');

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

    return errors;
  }

  /**
   * Function to validate email formats, default and duplicate email checks
   * @returns Array of validation errors
   */
  private validateEmails(): string[] {
    const errors: string[] = [];
    const emails = [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts].map(
      item => item.email,
    );
    const defaultEmails = ['management-account@example.com', 'log-archive@example.com', 'audit@example.com'];

    //
    // validate email format
    //
    emails.forEach(item => {
      if (!emailValidator.validate(item)) {
        errors.push(`Invalid email ${item}.`);
      }
      // AWS Organizations CreateAccount API-specific email validation
      if (item.length < 6 || item.length > 64) {
        errors.push(
          `Email "${item}" must be between 6 and 64 characters (found ${item.length}). This is an AWS Organizations API constraint.`,
        );
      }
      const emailPrefix = item.split('@')[0] ?? '';
      const forbiddenEmailChars = /[\s"'()<>[\]:;,\\|%&]/;
      if (forbiddenEmailChars.test(emailPrefix)) {
        errors.push(`Email "${item}" contains characters in the local name not allowed by AWS Organizations.`);
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
      return errors;
    } else {
      errors.push(...this.findDuplicateEmails());
    }

    return errors;
  }

  /**
   * Finds duplicate emails in the given accounts configuration.
   *
   * @returns Array of validation errors for duplicate emails.
   *
   * @description This function iterates over the mandatory and workload accounts in the provided AccountsConfig object.
   * It checks for duplicate emails by maintaining a Map of emails and their associated account names.
   * If a duplicate email is found, it adds an error message to the returned array with the duplicate email
   * and the associated account names.
   * Adding account name will help find all affected accounts in arrays with over 100 objects.
   */
  private findDuplicateEmails(): string[] {
    const errors: string[] = [];
    const emailMap = new Map<string, string[]>();
    const allAccounts = [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts];

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

    return errors;
  }

  /**
   * Function to verify account names are unique, without spaces, and within AWS length constraints
   * @returns Array of validation errors
   */
  private validateAccountNames(): string[] {
    const errors: string[] = [];
    const accountNames = [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts].map(
      item => item.name,
    );
    if (new Set(accountNames).size !== accountNames.length) {
      errors.push(`Duplicate account names defined [${accountNames}].`);
    }

    for (const account of [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts]) {
      if (account.name.indexOf(' ') > 0) {
        errors.push(`Account name (${account.name}) found with spaces. Please remove spaces and retry the pipeline.`);
      }
      // AWS Organizations CreateAccount API constraint: AccountName is 1-50 characters
      if (account.name.length > 50) {
        errors.push(
          `Account name "${account.name}" exceeds the maximum length of 50 characters (found ${account.name.length}). This is an AWS Organizations API constraint.`,
        );
      }
      // Pattern [ -~] matches printable ASCII range (space 0x20 through tilde 0x7E)
      const printableAsciiPattern = /^[ -~]+$/;
      if (!printableAsciiPattern.test(account.name)) {
        errors.push(
          `Account name "${account.name}" contains invalid characters. Only printable ASCII characters are allowed.`,
        );
      }
    }

    return errors;
  }

  /**
   * Function to verify mandatory account names did not change
   * @returns Array of validation errors
   */
  private validateMandatoryAccountNames(): string[] {
    const errors: string[] = [];
    for (const accountName of [
      AccountsConfig.MANAGEMENT_ACCOUNT,
      AccountsConfig.AUDIT_ACCOUNT,
      AccountsConfig.LOG_ARCHIVE_ACCOUNT,
    ]) {
      if (!this.accountsConfig.mandatoryAccounts.find(item => item.name === accountName)) {
        errors.push(`Unable to find mandatory account with name ${accountName}.`);
      }
    }

    return errors;
  }

  /**
   * Function to validate existence of account deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @returns Array of validation errors
   */
  private validateAccountOrganizationalUnit(): string[] {
    const errors: string[] = [];
    const ouIdNames: string[] = ['Root'];

    //
    // Get list of OU ID names from organization config file
    //
    ouIdNames.push(...this.getOuIdNames());
    for (const account of [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts]) {
      if (account.organizationalUnit) {
        // Check if OU exists
        if (!ouIdNames.includes(account.organizationalUnit)) {
          errors.push(
            `OU ${account.organizationalUnit} for account ${account.name} does not exist in organization-config.yaml file.`,
          );
        } else {
          // Check if OU is ignored
          const isIgnoredOu = this.organizationConfig.organizationalUnits.find(
            ou => ou.name === account.organizationalUnit && ou.ignore,
          );
          if (isIgnoredOu) {
            errors.push(
              `OU ${account.organizationalUnit} for account ${account.name} is ignored. Please remove the account from accounts-config.yaml or target a different OU`,
            );
          }
        }
      } else {
        errors.push(`Organizational Unit not defined for account ${account.name}.`);
      }
    }

    return errors;
  }

  /**
   * Prepare list of OU ids from organization config file
   */
  private getOuIdNames(): string[] {
    const ouIdNames: string[] = [];

    for (const organizationalUnit of this.organizationConfig.organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
    }
    return ouIdNames;
  }

  /**
   * Function to validate account tags against AWS Organizations constraints
   * @returns Array of validation errors
   */
  private validateAccountTags(): string[] {
    const errors: string[] = [];
    const allAccounts = [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts];

    for (const account of allAccounts) {
      const tags = account.tags ?? [];

      if (tags.length > 50) {
        errors.push(`Account "${account.name}" has ${tags.length} tags, exceeding the AWS limit of 50.`);
      }

      const seenKeys = new Set<string>();
      for (const tag of tags) {
        if (tag.key.length === 0) {
          errors.push(`Account "${account.name}" has a tag with an empty key.`);
        }
        if (tag.key.startsWith('aws:')) {
          errors.push(`Account "${account.name}" has tag key "${tag.key}" with reserved "aws:" prefix.`);
        }
        if (tag.key.length > 128) {
          errors.push(`Account "${account.name}" has tag key "${tag.key}" exceeding 128 characters.`);
        }
        if (tag.value.length > 256) {
          errors.push(`Account "${account.name}" has tag value for key "${tag.key}" exceeding 256 characters.`);
        }
        if (seenKeys.has(tag.key)) {
          errors.push(`Account "${account.name}" has duplicate tag key "${tag.key}".`);
        }
        seenKeys.add(tag.key);
      }
    }
    return errors;
  }
}
