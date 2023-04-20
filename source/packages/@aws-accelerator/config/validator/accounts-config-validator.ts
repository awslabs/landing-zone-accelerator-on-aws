/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { AccountsConfig } from '../lib/accounts-config';
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

    if (errors.length) {
      throw new Error(`${AccountsConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
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
      : true;
    if (singleAccountDeployment) {
      return;
    } else if (new Set(emails).size !== emails.length) {
      errors.push(`Duplicate emails defined [${emails}].`);
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
    for (const account of [...values.mandatoryAccounts, ...values.workloadAccounts] ?? []) {
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
