/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { AccountsConfig, GlobalConfig, OrganizationConfig } from '@aws-accelerator/config';
import { throttlingBackOff } from '@aws-accelerator/utils';
import { AssumeProfilePlugin } from '@aws-cdk-extensions/cdk-plugin-assume-role';
import {
  Account,
  DescribeOrganizationCommand,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import { RequireApproval } from 'aws-cdk/lib/diff';
import { PluginHost } from 'aws-cdk/lib/plugin';
import { AcceleratorToolkit } from './toolkit';

export enum AcceleratorStage {
  PIPELINE = 'pipeline',
  /**
   * Validate Stage - Verify the configuration files and environment
   */
  VALIDATE = 'validate',
  ORGANIZATIONS = 'organizations',
  /**
   * Accounts Stage - Handle all Organization and Accounts actions
   */
  ACCOUNTS = 'accounts',
  DEPENDENCIES = 'dependencies',
  SECURITY = 'security',
  OPERATIONS = 'operations',
  NETWORKING = 'networking',
}

/**
 *
 */
export interface AcceleratorProps {
  command: string;
  configDirPath: string;
  parallel: boolean;
  stage: string;
  account: string;
  region: string;
  requireApproval: RequireApproval;
}

/**
 * Wrapper around the CdkToolkit. The Accelerator defines this wrapper to add
 * the following functionality:
 *
 * - x
 * - y
 * - z
 */
export abstract class Accelerator {
  static isSupportedStage(stage: AcceleratorStage): boolean {
    return Object.values(AcceleratorStage).includes(stage);
  }

  static getAccountIdFromEmail(organizationsAccountList: Account[], email: string): string {
    const account = Object.entries(organizationsAccountList).find(
      ([
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _,
        account,
      ]) => email === account.Email,
    );

    if (account && account[1].Id) {
      return account[1].Id;
    }

    throw new Error(`Account ID not found for ${email}`);
  }

  /**
   *
   * @returns
   */
  static async run(props: AcceleratorProps): Promise<void> {
    //
    // When an account and region is specified, execute as single stack
    //
    if (props.account || props.region) {
      if (props.account && props.region === undefined) {
        throw new Error(`Account set to ${props.account}, but region is undefined`);
      }
      if (props.region && props.account === undefined) {
        throw new Error(`Region set to ${props.region}, but region is undefined`);
      }
      return await AcceleratorToolkit.execute(
        props.command,
        props.account,
        props.region,
        props.stage,
        props.configDirPath,
        props.requireApproval,
      );
    }

    //
    // Read in all Accelerator Configuration files here, then pass the objects
    // to the stacks that need them. Exceptions are thrown if any of the
    // configuration files are malformed.
    //
    const globalConfig = GlobalConfig.load(props.configDirPath);
    const organizationsConfig = OrganizationConfig.load(props.configDirPath);
    const accountsConfig = AccountsConfig.load(props.configDirPath);

    //
    // Load Plugins
    //
    const assumeRolePlugin = new AssumeProfilePlugin({
      // TODO: Read this from arg
      assumeRoleName: organizationsConfig['organizations-access-role'],
      assumeRoleDuration: 3600,
    });
    assumeRolePlugin.init(PluginHost.instance);

    //
    // NOTE: We do some early environment validation here before we kick off the
    //       CodePipeline that has a built in validation-stack
    //

    //
    // Verify AWS Organizations has been enabled
    //
    const organizationsClient = new OrganizationsClient({});
    await throttlingBackOff(() =>
      organizationsClient.send(new DescribeOrganizationCommand({})).catch(error => {
        if (error.name === 'AWSOrganizationsNotInUseException') {
          throw new Error(error.message);
        }
        throw new Error(error);
      }),
    );

    //
    // Verify all Organizations accounts are defined in the configuration
    //
    const organizationsAccountList: Account[] = [];
    for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
      organizationsAccountList.push(...(page.Accounts ?? []));
    }
    const unlistedAccounts: string[] = [];
    organizationsAccountList.forEach(account => {
      if (!accountsConfig.containsEmail(account.Email)) {
        if (account.Email) {
          unlistedAccounts.push(account.Email);
        }
      }
    });
    if (unlistedAccounts.length > 0) {
      throw new Error(`Account(s) are not defined in the accounts configuration: ${unlistedAccounts}`);
    }

    //
    // Execute Bootstrap stacks for all identified accounts
    //
    if (props.command == 'bootstrap') {
      const trustedAccountId = Accelerator.getAccountIdFromEmail(
        organizationsAccountList,
        accountsConfig['mandatory-accounts'].management.email,
      );

      for (const region of globalConfig['enabled-regions']) {
        for (const account of Object.values(accountsConfig['mandatory-accounts'])) {
          const accountId = Accelerator.getAccountIdFromEmail(organizationsAccountList, account.email);
          await AcceleratorToolkit.execute(props.command, accountId, region, trustedAccountId);
        }
        for (const account of Object.values(accountsConfig['workload-accounts'])) {
          const accountId = Accelerator.getAccountIdFromEmail(organizationsAccountList, account.email);
          await AcceleratorToolkit.execute(props.command, accountId, region, trustedAccountId);
        }
      }
      return;
    }

    // TODO: Need to decide the mandatory accounts for an accelerator --
    // Control Tower: To start a well-planned OU structure in your landing zone, AWS Control Tower
    // sets up a Security OU for you. This OU contains three shared accounts: the management
    // (primary) account, the log archive account, and the security audit account (also referred to
    // as the audit account).

    switch (props.stage) {
      case AcceleratorStage.VALIDATE:
      case AcceleratorStage.ACCOUNTS:
      case AcceleratorStage.ORGANIZATIONS:
        const managementAccount = accountsConfig['mandatory-accounts'].management;
        const accountId = Accelerator.getAccountIdFromEmail(organizationsAccountList, managementAccount.email);
        const region = globalConfig['home-region'];
        await AcceleratorToolkit.execute(
          props.command,
          accountId,
          region,
          props.stage,
          props.configDirPath,
          props.requireApproval,
        );
        break;

      // case AcceleratorStage.LOGGING:
      // case AcceleratorStage.DELEGATED_MANAGEMENT:
      // case AcceleratorStage.NETWORKING_PRE_DEPLOYMENT:
      // case AcceleratorStage.NETWORKING_POST_DEPLOYMENT:

      //
      // Apply these stacks to all account / regions. The contents of these stacks are dynamically
      // built from the inputted configuration files during stack construction
      //
      case AcceleratorStage.DEPENDENCIES:
      case AcceleratorStage.SECURITY:
      case AcceleratorStage.OPERATIONS:
      case AcceleratorStage.NETWORKING:
        for (const region of globalConfig['enabled-regions']) {
          for (const account of Object.values(accountsConfig['mandatory-accounts'])) {
            const accountId = Accelerator.getAccountIdFromEmail(organizationsAccountList, account.email);
            await AcceleratorToolkit.execute(
              props.command,
              accountId,
              region,
              props.stage,
              props.configDirPath,
              props.requireApproval,
            );
          }
          for (const account of Object.values(accountsConfig['workload-accounts'])) {
            const accountId = Accelerator.getAccountIdFromEmail(organizationsAccountList, account.email);
            await AcceleratorToolkit.execute(
              props.command,
              accountId,
              region,
              props.stage,
              props.configDirPath,
              props.requireApproval,
            );
          }
        }
        break;
      default:
        throw new Error(`Unknown stage: ${props.stage}`);
    }
  }
}
