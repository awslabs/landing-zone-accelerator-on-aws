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

import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import * as cdk from 'aws-cdk-lib';

import {
  AccountConfig,
  AccountsConfig,
  AseaStackInfo,
  CustomizationsConfig,
  DeploymentTargets,
  GlobalConfig,
  GovCloudAccountConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  Region,
  SecurityConfig,
  ShareTargets,
} from '@aws-accelerator/config';
import { createLogger, policyReplacements } from '@aws-accelerator/utils';
import { AcceleratorResourceNames } from './accelerator-resource-names';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import { AcceleratorResourcePrefixes } from '../utils/app-utils';

export interface AseaResourceHelperProps {
  readonly stackInfo: AseaStackInfo;
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly customizationsConfig: CustomizationsConfig;
  readonly globalRegion: string;
  readonly centralizedLoggingRegion: string;
  /**
   * Accelerator resource name prefixes
   */
  readonly prefixes: AcceleratorResourcePrefixes;
}

process.on('uncaughtException', err => {
  const logger = createLogger(['accelerator']);
  logger.error(err);
  throw new Error('Synthesis failed');
});

export abstract class AseaResourceHelper {
  protected logger: winston.Logger;
  protected props: AseaResourceHelperProps;
  public acceleratorResourceNames: AcceleratorResourceNames;
  private readonly app: CfnInclude;

  protected constructor(scope: cdk.cloudformation_include.CfnInclude, props: AseaResourceHelperProps) {
    this.logger = createLogger([props.stackInfo.stackName]);
    this.props = props;
    this.app = scope;
    //
    // Initialize resource names
    this.acceleratorResourceNames = new AcceleratorResourceNames({ prefixes: props.prefixes });
  }

  protected getResourcesByType(resourceType: string) {
    return this.props.stackInfo.resources.filter(r => r.resourceType === resourceType);
  }

  public isIncluded(deploymentTargets: DeploymentTargets): boolean {
    // Explicit Denies
    if (
      this.isRegionExcluded(deploymentTargets.excludedRegions) ||
      this.isAccountExcluded(deploymentTargets.excludedAccounts)
    ) {
      return false;
    }

    // Explicit Allows
    if (
      this.isAccountIncluded(deploymentTargets.accounts) ||
      this.isOrganizationalUnitIncluded(deploymentTargets.organizationalUnits)
    ) {
      return true;
    }

    // Implicit Deny
    return false;
  }

  /**
   * Private helper function to get account names from Accounts array of DeploymentTarget
   * @param accounts
   * @returns Array of account names
   *
   * @remarks Used only in getAccountNamesFromDeploymentTarget function.
   */
  private getAccountNamesFromDeploymentTargetAccountNames(accounts: string[]): string[] {
    const accountNames: string[] = [];
    for (const account of accounts ?? []) {
      accountNames.push(account);
    }
    return accountNames;
  }

  /**
   * Private helper function to get account names from given list of account configs
   * @param ouName
   * @param accountConfigs
   * @returns Array of account names
   *
   * @remarks Used only in getAccountNamesFromDeploymentTarget function.
   */
  private getAccountNamesFromAccountConfigs(
    ouName: string,
    accountConfigs: (AccountConfig | GovCloudAccountConfig)[],
  ): string[] {
    const accountNames: string[] = [];
    if (ouName === 'Root') {
      for (const account of accountConfigs) {
        accountNames.push(account.name);
      }
    } else {
      for (const account of accountConfigs) {
        if (ouName === account.organizationalUnit) {
          accountNames.push(account.name);
        }
      }
    }

    return accountNames;
  }

  /**
   * Function to get list of account names from given DeploymentTargets.
   * @param deploymentTargets
   * @returns Array of account names
   */
  protected getAccountNamesFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountNames: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      accountNames.push(
        ...this.getAccountNamesFromAccountConfigs(ou, [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]),
      );
    }

    accountNames.push(...this.getAccountNamesFromDeploymentTargetAccountNames(deploymentTargets.accounts));

    return [...new Set(accountNames)];
  }

  // Helper function to add an account id to the list
  private _addAccountId(ids: string[], accountId: string) {
    if (!ids.includes(accountId)) {
      ids.push(accountId);
    }
  }

  /**
   * Private helper function to append account ids from Accounts array of DeploymentTarget or ShareTargets
   * @param accounts
   * @param accountIds - List where processed account ids from Accounts array of DeploymentTarget or ShareTargets to be appended to.
   * @returns Array of Account Ids
   *
   * @remarks Used only in getAccountIdsFromDeploymentTarget function.
   */
  private appendAccountIdsFromDeploymentTargetAccounts(
    deploymentTargets: DeploymentTargets | ShareTargets,
    accountIds: string[],
  ): void {
    for (const accountName of deploymentTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(accountName);
      this._addAccountId(accountIds, accountId);
    }
  }

  /**
   * Private helper function to append account ids from given list of account configs
   * @param ouName
   * @param accountConfigs
   * @param accountIds - List where processed account ids from accountConfigs to be appended to.
   * @returns Array of Account Ids
   *
   * @remarks Used only in getAccountIdsFromDeploymentTarget function.
   */
  private appendAccountIdsFromAccountConfigs(
    ouName: string,
    accountConfigs: (AccountConfig | GovCloudAccountConfig)[],
    accountIds: string[],
  ): void {
    if (ouName === 'Root') {
      for (const accountConfig of accountConfigs) {
        const accountId = this.props.accountsConfig.getAccountId(accountConfig.name);
        this._addAccountId(accountIds, accountId);
      }
    } else {
      for (const accountConfig of accountConfigs) {
        if (ouName === accountConfig.organizationalUnit) {
          const accountId = this.props.accountsConfig.getAccountId(accountConfig.name);
          this._addAccountId(accountIds, accountId);
        }
      }
    }
  }

  /**
   * Function to get account ids from given DeploymentTarget
   * @param deploymentTargets
   * @returns
   */
  public getAccountIdsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      this.appendAccountIdsFromAccountConfigs(
        ou,
        [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts],
        accountIds,
      );
    }

    this.appendAccountIdsFromDeploymentTargetAccounts(deploymentTargets, accountIds);

    const excludedAccountIds = this.getExcludedAccountIds(deploymentTargets);
    const filteredAccountIds = accountIds.filter(item => !excludedAccountIds.includes(item));

    return filteredAccountIds;
  }

  protected getExcludedAccountIds(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    if (deploymentTargets.excludedAccounts) {
      deploymentTargets.excludedAccounts.forEach(account =>
        this._addAccountId(accountIds, this.props.accountsConfig.getAccountId(account)),
      );
    }

    return accountIds;
  }

  public getRegionsFromDeploymentTarget(deploymentTargets: DeploymentTargets): Region[] {
    const regions: Region[] = [];
    const enabledRegions = this.props.globalConfig.enabledRegions;
    regions.push(
      ...enabledRegions.filter(region => {
        return !deploymentTargets?.excludedRegions?.includes(region);
      }),
    );
    return regions;
  }

  protected isRegionExcluded(regions: string[]): boolean {
    if (regions?.includes(this.props.stackInfo.region)) {
      this.logger.info(`${this.props.stackInfo.region} region explicitly excluded`);
      return true;
    }
    return false;
  }

  public isAccountExcluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (this.props.stackInfo.accountId === this.props.accountsConfig.getAccountId(account)) {
        this.logger.info(`${account} account explicitly excluded`);
        return true;
      }
    }
    return false;
  }

  protected isAccountIncluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (this.props.stackInfo.accountId === this.props.accountsConfig.getAccountId(account)) {
        const accountConfig = this.props.accountsConfig.getAccount(account);
        if (this.props.organizationConfig.isIgnored(accountConfig.organizationalUnit)) {
          this.logger.info(`Account ${account} was not included as it is a member of an ignored organizational unit.`);
          return false;
        }
        this.logger.info(`${account} account explicitly included`);
        return true;
      }
    }
    return false;
  }

  protected isOrganizationalUnitIncluded(organizationalUnits: string[]): boolean {
    if (organizationalUnits) {
      // Full list of all accounts
      const accounts = [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts];

      // Find the account with the matching ID
      const account = accounts.find(
        item => this.props.accountsConfig.getAccountId(item.name) === this.props.stackInfo.accountId,
      );

      if (account) {
        if (organizationalUnits.indexOf(account.organizationalUnit) != -1 || organizationalUnits.includes('Root')) {
          const ignored = this.props.organizationConfig.isIgnored(account.organizationalUnit);
          if (ignored) {
            this.logger.info(`${account.organizationalUnit} is ignored and not included`);
          }
          this.logger.info(`${account.organizationalUnit} organizational unit included`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Generate policy replacements and optionally return a temp path
   * to the transformed document
   * @param policyPath
   * @param returnTempPath
   * @param organizationId
   * @returns
   */
  public generatePolicyReplacements(policyPath: string, returnTempPath: boolean, organizationId?: string): string {
    // Transform policy document
    let policyContent: string = JSON.stringify(require(policyPath));
    const acceleratorPrefix = this.props.prefixes.accelerator;
    const acceleratorPrefixNoDash = acceleratorPrefix.endsWith('-')
      ? acceleratorPrefix.slice(0, -1)
      : acceleratorPrefix;

    const additionalReplacements: { [key: string]: string | string[] } = {
      '\\${ACCELERATOR_DEFAULT_PREFIX_SHORTHAND}': acceleratorPrefix.substring(0, 4).toUpperCase(),
      '\\${ACCELERATOR_PREFIX_ND}': acceleratorPrefixNoDash,
      '\\${ACCELERATOR_PREFIX_LND}': acceleratorPrefixNoDash.toLowerCase(),
      '\\${ACCOUNT_ID}': this.props.stackInfo.accountId,
      '\\${AUDIT_ACCOUNT_ID}': this.props.accountsConfig.getAuditAccountId(),
      '\\${HOME_REGION}': this.props.globalConfig.homeRegion,
      '\\${LOGARCHIVE_ACCOUNT_ID}': this.props.accountsConfig.getLogArchiveAccountId(),
      '\\${MANAGEMENT_ACCOUNT_ID}': this.props.accountsConfig.getManagementAccountId(),
      '\\${REGION}': this.props.stackInfo.region,
    };

    if (organizationId) {
      additionalReplacements['\\${ORG_ID}'] = organizationId;
    }

    policyContent = policyReplacements({
      content: policyContent,
      acceleratorPrefix,
      managementAccountAccessRole: this.props.globalConfig.managementAccountAccessRole,
      partition: this.app.stack.partition,
      additionalReplacements,
    });

    if (returnTempPath) {
      return this.createTempFile(policyContent);
    } else {
      return policyContent;
    }
  }

  /**
   * Create a temp file of a transformed policy document
   * @param policyContent
   * @returns
   */
  private createTempFile(policyContent: string): string {
    // Generate unique file path in temporary directory
    let tempDir: string;
    if (process.platform === 'win32') {
      try {
        fs.accessSync(process.env['Temp']!, fs.constants.W_OK);
      } catch (e) {
        this.logger.error(`Unable to write files to temp directory: ${e}`);
      }
      tempDir = path.join(process.env['Temp']!, 'temp-accelerator-policies');
    } else {
      try {
        fs.accessSync('/tmp', fs.constants.W_OK);
      } catch (e) {
        this.logger.error(`Unable to write files to temp directory: ${e}`);
      }
      tempDir = path.join('/tmp', 'temp-accelerator-policies');
    }
    const tempPath = path.join(tempDir, `${uuidv4()}.json`);

    // Write transformed file
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    fs.writeFileSync(tempPath, policyContent, 'utf-8');

    return tempPath;
  }

  protected convertMinutesToIso8601(s: number) {
    const days = Math.floor(s / 1440);
    s = s - days * 1440;
    const hours = Math.floor(s / 60);
    s = s - hours * 60;

    let dur = 'PT';
    if (days > 0) {
      dur += days + 'D';
    }
    if (hours > 0) {
      dur += hours + 'H';
    }
    dur += s + 'M';

    return dur.toString();
  }
}
