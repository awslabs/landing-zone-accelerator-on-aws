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

import * as config from '@aws-accelerator/config';
import { AssumeProfilePlugin } from '@aws-cdk-extensions/cdk-plugin-assume-role';
import {
  Account,
  DescribeOrganizationCommand,
  ListAccountsCommand,
  ListAccountsCommandOutput,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { PluginHost } from 'aws-cdk/lib/plugin';
import console from 'console';
import { AcceleratorToolkit } from './toolkit';

const _ = require('lodash');

export enum AcceleratorStage {
  PIPELINE = 'pipeline',
  /**
   * Validate Stage - Verify the configuration files and environment
   */
  VALIDATE = 'validate',
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
}

/**
 * Wrapper around the CdkToolkit. The Accelerator defines this wrapper to add
 * the following functionality:
 *
 * - x
 * - y
 * - z
 */
export class Accelerator {
  static isSupportedStage(stage: AcceleratorStage): boolean {
    return Object.values(AcceleratorStage).includes(stage);
  }

  /**
   *
   * @returns
   */
  static async run(props: AcceleratorProps): Promise<void> {
    //
    // Load Plugins
    //
    const assumeRolePlugin = new AssumeProfilePlugin({
      // TODO: Read this from arg
      assumeRoleName: 'AWSControlTowerExecution',
      assumeRoleDuration: 3600,
    });
    assumeRolePlugin.init(PluginHost.instance);

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
      return await AcceleratorToolkit.execute(props.command, props.account, props.region, props.stage);
    }

    //
    // Read in all Accelerator Configuration files here, then pass the objects
    // to the stacks that need them
    //
    const organizationConfig = await config.loadOrganizationConfig(props.configDirPath);
    console.log(JSON.stringify(organizationConfig, null, 2));

    //
    // If any of the configurations are empty, consider this a new install and
    // do not take any actions
    //
    if (_.isEqual(organizationConfig, new config.OrganizationConfig())) {
      console.log('Config Empty!');
    }

    //
    // NOTE: We do some early environment validation here before we kick off the
    //       CodePipeline that has a built in validation-stack
    //

    //
    // Verify AWS Organizations has been enabled
    //
    const organizationsClient = new OrganizationsClient({});
    await organizationsClient.send(new DescribeOrganizationCommand({})).catch(error => {
      if (error.name === 'AWSOrganizationsNotInUseException') {
        throw new Error(error.message);
      }
      throw new Error(error);
    });

    //
    // Verify Accounts list matches the definition in the config
    //
    const organizationsAccountList: Account[] = [];
    let nextToken;
    do {
      const response: ListAccountsCommandOutput = await organizationsClient
        .send(new ListAccountsCommand({ NextToken: nextToken }))
        .catch(error => {
          throw new Error(error);
        });
      response.Accounts?.forEach(account => {
        organizationsAccountList.push(account);
      });
      nextToken = response.NextToken;
    } while (nextToken);

    const configurationAccountsList: string[] = [];
    for (const account in organizationConfig.accounts) {
      configurationAccountsList.push(organizationConfig.accounts[account].email);
    }

    // if (organizationsAccountList.every((item, index) => item.email === configurationAccountsList[index])) {
    //   console.log('MATCH');
    // }

    //
    // Logic to decide what accounts and regions to apply the stage to
    //

    // const deployToAccounts: string[] = [];
    // const deployToRegions: string[] = [];

    // TODO: Need to decide the mandatory accounts for an accelerator --
    // Control Tower: To start a well-planned OU structure in your landing zone, AWS Control Tower
    // sets up a Security OU for you. This OU contains three shared accounts: the management
    // (primary) account, the log archive account, and the security audit account (also referred to
    // as the audit account).

    switch (props.stage) {
      // This stack should only be run in the pipeline account home region
      case AcceleratorStage.VALIDATE:
      case AcceleratorStage.ACCOUNTS:
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
        break;
      default:
        throw new Error(`Unknown stage: ${props.stage}`);
    }
    // console.log(configurationAccountsList);

    // // TODO: Make this more elegant
    // configurationAccountsList.sort();
    // organizationsAccountList.sort();

    // console.log(organizationConfig);

    // TODO: And Environment variables to enable debug logs

    //
    // switch statement logic goes here to determine what stacks to call and how
    //

    //
    // Loop through all accounts and regions and execute commands
    //
    // TODO: Add parallel support
    // TODO: Change config to not include account numbers, need to pull from Organizations
    for (const account in organizationConfig['accounts']) {
      const email = organizationConfig['accounts'][account].email;
      // console.log(organizationConfig['accounts'][account].email);
      // Get the Account IDs from the Organizations List
      let accountId = '';
      for (const item in organizationsAccountList) {
        if (organizationsAccountList[item].Email == email) {
          accountId = organizationsAccountList[item].Id || '';
        }
      }
      for (const region of organizationConfig['enabled-regions']) {
        // console.log(`${accountId} ${region}`);
        await AcceleratorToolkit.execute(props.command, accountId, region, props.stage);
      }
    }
  }
}
