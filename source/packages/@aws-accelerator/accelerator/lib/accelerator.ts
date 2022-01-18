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
import { AccountsConfig, GlobalConfig, SecurityConfig } from '@aws-accelerator/config';
import { throttlingBackOff } from '@aws-accelerator/utils';
import { AssumeProfilePlugin } from '@aws-cdk-extensions/cdk-plugin-assume-role';
import { AssumeRoleCommand, Credentials, STSClient } from '@aws-sdk/client-sts';
import { RequireApproval } from 'aws-cdk/lib/diff';
import { PluginHost } from 'aws-cdk/lib/plugin';
import { AcceleratorStage } from './accelerator-stage';
import { Logger } from './logger';
import { AcceleratorToolkit } from './toolkit';

/**
 * constant maintaining cloudformation stack names
 */
export const AcceleratorStackNames: Record<string, string> = {
  [AcceleratorStage.VALIDATE]: 'AWSAccelerator-ValidateStack',
  [AcceleratorStage.PIPELINE]: 'AWSAccelerator-PipelineStack',
  [AcceleratorStage.ORGANIZATIONS]: 'AWSAccelerator-OrganizationsStack',
  [AcceleratorStage.LOGGING]: 'AWSAccelerator-LoggingStack',
  [AcceleratorStage.ACCOUNTS]: 'AWSAccelerator-AccountsStack',
  [AcceleratorStage.DEPENDENCIES]: 'AWSAccelerator-DependenciesStack',
  [AcceleratorStage.SECURITY]: 'AWSAccelerator-SecurityStack',
  [AcceleratorStage.OPERATIONS]: 'AWSAccelerator-OperationsStack',
  [AcceleratorStage.NETWORK_PREP]: 'AWSAccelerator-NetworkPrepStack',
  [AcceleratorStage.NETWORK_VPC]: 'AWSAccelerator-NetworkVpcStack',
  [AcceleratorStage.NETWORK_ASSOCIATIONS]: 'AWSAccelerator-NetworkAssociationsStack',
  [AcceleratorStage.SECURITY_AUDIT]: 'AWSAccelerator-SecurityAuditStack',
};

/**
 *
 */
export interface AcceleratorProps {
  readonly command: string;
  readonly configDirPath: string;
  readonly parallel: boolean;
  readonly stage: string;
  readonly account: string;
  readonly region: string;
  readonly partition: string;
  readonly requireApproval: RequireApproval;
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
        partition: props.partition,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
      });
    }

    // Get management account credential when pipeline is executing outside of management account
    const managementAccountCredentials = await this.getManagementAccountCredentials(props.partition);

    //
    // Read in all Accelerator Configuration files here, then pass the objects
    // to the stacks that need them. Exceptions are thrown if any of the
    // configuration files are malformed.
    //
    const globalConfig = GlobalConfig.load(props.configDirPath);
    const accountsConfig = AccountsConfig.load(props.configDirPath);

    //
    // Will load in account IDs using the Organizations client if not provided
    // as inputs in accountsConfig
    //
    await accountsConfig.loadAccountIds();

    // TODO: Deprecate securityConfig.getDelegatedAccountName, use accountsConfig.getAuditAccountId()
    const securityConfig = SecurityConfig.load(props.configDirPath);

    //
    // Load Plugins
    //
    const assumeRolePlugin = new AssumeProfilePlugin({
      // TODO: Read this from arg
      assumeRoleName: globalConfig.managementAccountAccessRole,
      assumeRoleDuration: 3600,
      credentials: managementAccountCredentials,
      partition: props.partition,
    });
    assumeRolePlugin.init(PluginHost.instance);

    //
    // When running parallel, this will be the max concurrent stacks
    //
    // const maxStacks = process.env['MAX_CONCURRENT_STACKS'] ?? Accelerator.DEFAULT_MAX_CONCURRENT_STACKS;

    //
    // Execute Bootstrap stacks for all identified accounts
    //
    if (props.command == 'bootstrap') {
      const trustedAccountId = accountsConfig.getManagementAccountId();
      for (const region of globalConfig.enabledRegions) {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          await AcceleratorToolkit.execute({
            command: props.command,
            accountId: accountsConfig.getAccountId(account.name),
            region,
            partition: props.partition,
            trustedAccountId,
            requireApproval: props.requireApproval,
            qualifier: 'accel',
          });
        }
      }
      return;
    }

    // TODO: Need to decide the mandatory accounts for an accelerator --
    // Control Tower: To start a well-planned OU structure in your landing zone, AWS Control Tower
    // sets up a Security OU for you. This OU contains three shared accounts: the management
    // (primary) account, the log archive account, and the security audit account (also referred to
    // as the audit account).

    // const promises: Promise<void>[] = [];

    switch (props.stage) {
      case AcceleratorStage.ACCOUNTS:
        Logger.info(`[accelerator] Executing ${props.stage} for Management account.`);

        // promises.push(
        await AcceleratorToolkit.execute({
          command: props.command,
          accountId: accountsConfig.getManagementAccountId(),
          region: globalConfig.homeRegion,
          partition: props.partition,
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
        for (const region of globalConfig.enabledRegions) {
          Logger.info(`[accelerator] Executing ${props.stage} for Management account in ${region} region.`);
          // promises.push(
          await AcceleratorToolkit.execute({
            command: props.command,
            accountId: accountsConfig.getManagementAccountId(),
            region: region,
            partition: props.partition,
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
      case AcceleratorStage.NETWORK_PREP:
      case AcceleratorStage.NETWORK_VPC:
      case AcceleratorStage.NETWORK_ASSOCIATIONS:
        for (const region of globalConfig.enabledRegions) {
          for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
            Logger.info(`[accelerator] Executing ${props.stage} for ${account.name} account in ${region} region.`);
            await AcceleratorToolkit.execute({
              command: props.command,
              accountId: accountsConfig.getAccountId(account.name),
              region,
              partition: props.partition,
              stage: props.stage,
              configDirPath: props.configDirPath,
              requireApproval: props.requireApproval,
            });
          }
        }
        break;
      case AcceleratorStage.SECURITY_AUDIT:
        const auditAccountName = securityConfig.getDelegatedAccountName();
        Logger.info(`[accelerator] Configuring the security-audit stack for account ${auditAccountName}`);
        if (accountsConfig.containsAccount(auditAccountName)) {
          for (const region of globalConfig.enabledRegions) {
            Logger.info(`[accelerator] Executing ${props.stage} for ${auditAccountName} account in ${region} region.`);
            // promises.push(
            await AcceleratorToolkit.execute({
              command: props.command,
              accountId: accountsConfig.getAccountId(auditAccountName),
              region: region,
              partition: props.partition,
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

  private static async getManagementAccountCredentials(partition: string): Promise<Credentials | undefined> {
    if (
      process.env['MANAGEMENT_ACCOUNT_ID'] &&
      process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'] &&
      process.env['ACCOUNT_ID'] !== process.env['MANAGEMENT_ACCOUNT_ID']
    ) {
      Logger.info('[accelerator] set management account credentials');
      Logger.info(`[accelerator] pipeline region => ${process.env['AWS_DEFAULT_REGION']}`);
      Logger.info(`[accelerator] pipeline executingAccountId => ${process.env['ACCOUNT_ID']}`);
      Logger.info(`[accelerator] managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`);
      Logger.info(`[accelerator] management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`);

      const roleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;
      const stsClient = new STSClient({ region: process.env['AWS_REGION'] });
      Logger.info(`[accelerator] [PlatformAccelerator][INFO] management account roleArn => ${roleArn}`);

      const assumeRoleCredential = await throttlingBackOff(() =>
        stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'acceleratorAssumeRoleSession' })),
      );

      process.env['AWS_ACCESS_KEY_ID'] = assumeRoleCredential.Credentials!.AccessKeyId!;
      process.env['AWS_ACCESS_KEY'] = assumeRoleCredential.Credentials!.AccessKeyId!;

      process.env['AWS_SECRET_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;
      process.env['AWS_SECRET_ACCESS_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;

      process.env['AWS_SESSION_TOKEN'] = assumeRoleCredential.Credentials!.SessionToken;

      return assumeRoleCredential.Credentials;
    } else {
      return undefined;
    }
  }
}
