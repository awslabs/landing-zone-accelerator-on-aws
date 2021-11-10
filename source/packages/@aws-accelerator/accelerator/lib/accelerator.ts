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
import { AccountsConfig, GlobalConfig, OrganizationConfig, SecurityConfig } from '@aws-accelerator/config';
import { throttlingBackOff } from '@aws-accelerator/utils';
import { AssumeProfilePlugin } from '@aws-cdk-extensions/cdk-plugin-assume-role';
import { DescribeOrganizationCommand, OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';
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
  LOGGING = 'logging',
  /**
   * Accounts Stage - Handle all Organization and Accounts actions
   */
  ACCOUNTS = 'accounts',
  DEPENDENCIES = 'dependencies',
  SECURITY = 'security',
  OPERATIONS = 'operations',
  NETWORK_TGW = 'network-tgw',
  NETWORK_VPC = 'network-vpc',
  NETWORK_TGW_ATTACH = 'network-tgw-attach',
  SECURITY_AUDIT = 'security-audit',
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
  partition: string;
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
  // private static readonly DEFAULT_MAX_CONCURRENT_STACKS = 20;

  static isSupportedStage(stage: AcceleratorStage): boolean {
    return Object.values(AcceleratorStage).includes(stage);
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
      return await AcceleratorToolkit.execute({
        command: props.command,
        accountId: props.account,
        region: props.region,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
      });
    }

    //
    // Read in all Accelerator Configuration files here, then pass the objects
    // to the stacks that need them. Exceptions are thrown if any of the
    // configuration files are malformed.
    //
    const globalConfig = GlobalConfig.load(props.configDirPath);
    const organizationsConfig = OrganizationConfig.load(props.configDirPath);
    const accountsConfig = AccountsConfig.load(props.configDirPath);
    const securityConfig = SecurityConfig.load(props.configDirPath);

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
    // Create a dictionary of all AWS Account IDs.
    //
    // TODO: Add functionality to read in a map from file for disconnected regions
    //
    const accountIds: { [name: string]: string } = {};
    for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
      for (const account of page.Accounts ?? []) {
        if (account.Email && account.Id) {
          accountIds[account.Email] = account.Id;
        }
      }
    }

    //
    // When running parallel, this will be the max concurrent stacks
    //
    // const maxStacks = process.env['MAX_CONCURRENT_STACKS'] ?? Accelerator.DEFAULT_MAX_CONCURRENT_STACKS;

    //
    // Execute Bootstrap stacks for all identified accounts
    //
    if (props.command == 'bootstrap') {
      // const promises: Promise<void>[] = [];
      const trustedAccountId = accountIds[accountsConfig['mandatory-accounts'].management.email];
      for (const region of globalConfig['enabled-regions']) {
        for (const account of Object.values(accountsConfig['mandatory-accounts'])) {
          const accountId = accountIds[account.email];
          // promises.push(
          await AcceleratorToolkit.execute({
            command: props.command,
            accountId,
            region,
            partition: props.partition,
            trustedAccountId,
            requireApproval: props.requireApproval,
            qualifier: 'accel',
          });
          // );
          // if (promises.length >= maxStacks) {
          //   await Promise.all(promises);
          // }
        }
        for (const account of Object.values(accountsConfig['workload-accounts'])) {
          const accountId = accountIds[account.email];
          // promises.push(
          await AcceleratorToolkit.execute({
            command: props.command,
            accountId,
            region,
            partition: props.partition,
            trustedAccountId,
            requireApproval: props.requireApproval,
            qualifier: 'accel',
          });
          // );
          // if (promises.length >= maxStacks) {
          //   await Promise.all(promises);
          // }
        }
      }
      // await Promise.all(promises);
      return;
    }

    // TODO: Need to decide the mandatory accounts for an accelerator --
    // Control Tower: To start a well-planned OU structure in your landing zone, AWS Control Tower
    // sets up a Security OU for you. This OU contains three shared accounts: the management
    // (primary) account, the log archive account, and the security audit account (also referred to
    // as the audit account).

    // const promises: Promise<void>[] = [];
    const managementAccount = accountsConfig['mandatory-accounts'].management;

    switch (props.stage) {
      case AcceleratorStage.ACCOUNTS:
        console.log(`Executing ${props.stage} for ${managementAccount}.`);
        // promises.push(
        await AcceleratorToolkit.execute({
          command: props.command,
          accountId: accountIds[managementAccount.email],
          region: globalConfig['home-region'],
          stage: props.stage,
          configDirPath: props.configDirPath,
          requireApproval: props.requireApproval,
        });
        // );
        // if (promises.length >= maxStacks) {
        //   await Promise.all(promises);
        // }

        break;

      case AcceleratorStage.ORGANIZATIONS:
        for (const region of globalConfig['enabled-regions']) {
          console.log(`Executing ${props.stage} for ${managementAccount} account in ${region} region.`);
          // promises.push(
          await AcceleratorToolkit.execute({
            command: props.command,
            accountId: accountIds[managementAccount.email],
            region: region,
            stage: props.stage,
            configDirPath: props.configDirPath,
            requireApproval: props.requireApproval,
          });
          // );
          // if (promises.length >= maxStacks) {
          //   await Promise.all(promises);
          // }
        }
        break;

      //
      // Apply these stacks to all account / regions. The contents of these stacks are dynamically
      // built from the inputted configuration files during stack construction
      //
      case AcceleratorStage.LOGGING:
      case AcceleratorStage.SECURITY:
      case AcceleratorStage.OPERATIONS:
      case AcceleratorStage.NETWORK_TGW:
      case AcceleratorStage.NETWORK_VPC:
      case AcceleratorStage.NETWORK_TGW_ATTACH:
        for (const region of globalConfig['enabled-regions']) {
          for (const account of Object.values(accountsConfig['mandatory-accounts'])) {
            console.log(`Executing ${props.stage} for ${account.email} account in ${region} region.`);
            const accountId = accountIds[account.email];
            // promises.push(
            await AcceleratorToolkit.execute({
              command: props.command,
              accountId,
              region,
              stage: props.stage,
              configDirPath: props.configDirPath,
              requireApproval: props.requireApproval,
            });
            // );
            // if (promises.length >= maxStacks) {
            //   await Promise.all(promises);
            // }
          }
          for (const account of Object.values(accountsConfig['workload-accounts'])) {
            console.log(`Executing ${props.stage} for ${account.email} account in ${region} region.`);
            const accountId = accountIds[account.email];
            // promises.push(
            await AcceleratorToolkit.execute({
              command: props.command,
              accountId,
              region,
              stage: props.stage,
              configDirPath: props.configDirPath,
              requireApproval: props.requireApproval,
            });
            // );
            // if (promises.length >= maxStacks) {
            //   await Promise.all(promises);
            // }
          }
        }
        break;
      case AcceleratorStage.SECURITY_AUDIT:
        const auditAccountName = securityConfig.getDelegatedAccountName();
        if (accountsConfig.accountExists(auditAccountName)) {
          for (const region of globalConfig['enabled-regions']) {
            const auditAccountEmail = accountsConfig.getEmail(auditAccountName);
            const accountId = accountIds[auditAccountEmail];
            console.log(`Executing ${props.stage} for ${auditAccountEmail} account in ${region} region.`);
            // promises.push(
            await AcceleratorToolkit.execute({
              command: props.command,
              accountId: accountId,
              region: region,
              stage: props.stage,
              configDirPath: props.configDirPath,
              requireApproval: props.requireApproval,
            });
            // );
            // if (promises.length >= maxStacks) {
            //   await Promise.all(promises);
            // }
          }
        } else {
          throw new Error(`Security delegated admin account name "${auditAccountName}" not found.`);
        }
        break;
      default:
        throw new Error(`Unknown stage: ${props.stage}`);
    }

    // await Promise.all(promises);
  }
}
