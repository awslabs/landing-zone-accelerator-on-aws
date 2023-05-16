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

/* istanbul ignore file */

import { PluginHost } from 'aws-cdk/lib/api/plugin';
import { RequireApproval } from 'aws-cdk/lib/diff';
import { Command } from 'aws-cdk/lib/settings';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import { STSClient, AssumeRoleCommand, AssumeRoleCommandInput, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import {
  SSMClient,
  GetParameterCommand,
  GetParameterCommandInput,
  GetParameterCommandOutput,
} from '@aws-sdk/client-ssm';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

import { AccountsConfig, GlobalConfig } from '@aws-accelerator/config';
import { createLogger, throttlingBackOff } from '@aws-accelerator/utils';
import { AssumeProfilePlugin } from '@aws-cdk-extensions/cdk-plugin-assume-role';

import { AcceleratorStage } from './accelerator-stage';
import { AcceleratorToolkit } from './toolkit';

const logger = createLogger(['accelerator']);

process.on('uncaughtException', err => {
  logger.error(err);
  throw new Error('Synthesis failed');
});

/**
 * List of AWS ELB root account and regions mapping
 */
export const AcceleratorElbRootAccounts: Record<string, string> = {
  'us-east-1': '127311923021',
  'us-east-2': '033677994240',
  'us-west-1': '027434742980',
  'us-west-2': '797873946194',
  'af-south-1': '098369216593',
  'ca-central-1': '985666609251',
  'eu-central-1': '054676820928',
  'eu-west-1': '156460612806',
  'eu-west-2': '652711504416',
  'eu-south-1': '635631232127',
  'eu-west-3': '009996457667',
  'eu-north-1': '897822967062',
  'ap-east-1': '754344448648',
  'ap-northeast-1': '582318560864',
  'ap-northeast-2': '600734575887',
  'ap-northeast-3': '383597477331',
  'ap-southeast-1': '114774131450',
  'ap-southeast-2': '783225319266',
  'ap-southeast-3': '589379963580',
  'ap-south-1': '718504428378',
  'me-south-1': '076674570225',
  'sa-east-1': '507241528517',
  'us-gov-west-1': '048591011584',
  'us-gov-east-1': '190560391635',
  'cn-north-1': '638102146993',
  'cn-northwest-1': '037604701340',
};

export const OptInRegions = [
  'af-south-1',
  'ap-east-1',
  'ap-south-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'eu-central-2',
  'eu-south-1',
  'eu-south-2',
  'me-central-1',
  'me-south-1',
];

export const BootstrapVersion = 18;

const stackPrefix = process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator';

/**
 * constant maintaining cloudformation stack names
 */
export const AcceleratorStackNames: Record<string, string> = {
  [AcceleratorStage.PREPARE]: `${stackPrefix}-PrepareStack`,
  [AcceleratorStage.PIPELINE]: `${stackPrefix}-PipelineStack`,
  [AcceleratorStage.TESTER_PIPELINE]: `${stackPrefix}-TesterPipelineStack`,
  [AcceleratorStage.ORGANIZATIONS]: `${stackPrefix}-OrganizationsStack`,
  [AcceleratorStage.KEY]: `${stackPrefix}-KeyStack`,
  [AcceleratorStage.LOGGING]: `${stackPrefix}-LoggingStack`,
  [AcceleratorStage.BOOTSTRAP]: `${stackPrefix}-BootstrapStack`,
  [AcceleratorStage.ACCOUNTS]: `${stackPrefix}-AccountsStack`,
  [AcceleratorStage.DEPENDENCIES]: `${stackPrefix}-DependenciesStack`,
  [AcceleratorStage.SECURITY]: `${stackPrefix}-SecurityStack`,
  [AcceleratorStage.SECURITY_RESOURCES]: `${stackPrefix}-SecurityResourcesStack`,
  [AcceleratorStage.OPERATIONS]: `${stackPrefix}-OperationsStack`,
  [AcceleratorStage.NETWORK_PREP]: `${stackPrefix}-NetworkPrepStack`,
  [AcceleratorStage.NETWORK_VPC]: `${stackPrefix}-NetworkVpcStack`,
  [AcceleratorStage.NETWORK_VPC_ENDPOINTS]: `${stackPrefix}-NetworkVpcEndpointsStack`,
  [AcceleratorStage.NETWORK_VPC_DNS]: `${stackPrefix}-NetworkVpcDnsStack`,
  [AcceleratorStage.NETWORK_ASSOCIATIONS]: `${stackPrefix}-NetworkAssociationsStack`,
  [AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]: `${stackPrefix}-NetworkAssociationsGwlbStack`,
  [AcceleratorStage.FINALIZE]: `${stackPrefix}-FinalizeStack`,
  [AcceleratorStage.SECURITY_AUDIT]: `${stackPrefix}-SecurityAuditStack`,
  [AcceleratorStage.CUSTOMIZATIONS]: `${stackPrefix}-CustomizationsStack`,
};

/**
 *
 */
export interface AcceleratorProps {
  readonly command: string;
  readonly configDirPath: string;
  readonly stage?: string;
  readonly account?: string;
  readonly region?: string;
  readonly partition: string;
  readonly requireApproval: RequireApproval;
  readonly app?: string;
  readonly caBundlePath?: string;
  readonly ec2Creds?: boolean;
  readonly proxyAddress?: string;
  readonly enableSingleAccountMode: boolean;
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
    if (stage === undefined) {
      return false;
    }
    return Object.values(AcceleratorStage).includes(stage);
  }

  /**
   *
   * @returns
   */
  static async run(props: AcceleratorProps): Promise<void> {
    let managementAccountCredentials: AWS.STS.Credentials | undefined;
    let globalConfig = undefined;
    let assumeRolePlugin = undefined;

    let globalRegion = 'us-east-1';

    if (props.partition === 'aws-us-gov') {
      globalRegion = 'us-gov-west-1';
    } else if (props.partition === 'aws-iso-b') {
      globalRegion = 'us-isob-east-1';
    } else if (props.partition === 'aws-iso') {
      globalRegion = 'us-iso-east-1';
    } else if (props.partition === 'aws-cn') {
      globalRegion = 'cn-northwest-1';
    }

    if (props.stage !== AcceleratorStage.PIPELINE && props.stage !== AcceleratorStage.TESTER_PIPELINE) {
      // Get management account credential when pipeline is executing outside of management account
      managementAccountCredentials = await this.getManagementAccountCredentials(props.partition);

      // Load in the global config to read in the management account access roles
      globalConfig = GlobalConfig.load(props.configDirPath);

      //
      // Load Plugins
      //
      assumeRolePlugin = await this.initializeAssumeRolePlugin({
        region: props.region ?? globalRegion,
        assumeRoleName: globalConfig.managementAccountAccessRole,
        partition: props.partition,
        caBundlePath: props.caBundlePath,
        credentials: managementAccountCredentials,
      });
      assumeRolePlugin.init(PluginHost.instance);
    }

    //
    // When an account and region is specified, execute as single stack
    //
    if (props.account || props.region) {
      if (props.account && props.region === undefined) {
        logger.error(`Account set to ${props.account}, but region is undefined`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      if (props.region && props.account === undefined) {
        logger.error(`Region set to ${props.region}, but account is undefined`);
        throw new Error(`Configuration validation failed at runtime.`);
      }

      return AcceleratorToolkit.execute({
        command: props.command,
        accountId: props.account,
        region: props.region,
        partition: props.partition,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
        app: props.app,
        caBundlePath: props.caBundlePath,
        ec2Creds: props.ec2Creds,
        proxyAddress: props.proxyAddress,
        centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
        cdkOptions: globalConfig?.cdkOptions,
        enableSingleAccountMode: props.enableSingleAccountMode,
      });
    }

    // Treat synthesize as a single - do not need parallel paths to generate all stacks
    if (props.command === Command.SYNTH || props.command === Command.SYNTHESIZE || props.command === Command.DIFF) {
      return AcceleratorToolkit.execute({
        command: props.command,
        accountId: props.account,
        region: props.region,
        partition: props.partition,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
        app: props.app,
        caBundlePath: props.caBundlePath,
        ec2Creds: props.ec2Creds,
        proxyAddress: props.proxyAddress,
        centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
        cdkOptions: globalConfig?.cdkOptions,
        enableSingleAccountMode: props.enableSingleAccountMode,
      });
    }

    //
    // Read in all Accelerator Configuration files here, then pass the objects
    // to the stacks that need them. Exceptions are thrown if any of the
    // configuration files are malformed.
    //
    globalConfig = GlobalConfig.load(props.configDirPath);
    const accountsConfig = AccountsConfig.load(props.configDirPath);

    //
    // Will load in account IDs using the Organizations client if not provided
    // as inputs in accountsConfig
    //
    await accountsConfig.loadAccountIds(props.partition, props.enableSingleAccountMode);

    //
    // When running parallel, this will be the max concurrent stacks
    //
    const maxStacks = Number(process.env['MAX_CONCURRENT_STACKS'] ?? 250);

    let promises: Promise<void>[] = [];

    //
    // Execute Bootstrap stacks for all identified accounts
    //
    if (props.command == 'bootstrap') {
      const trustedAccountId = accountsConfig.getManagementAccountId();
      // bootstrap management account
      for (const region of globalConfig.enabledRegions) {
        await delay(500);
        promises.push(
          AcceleratorToolkit.execute({
            command: props.command,
            accountId: accountsConfig.getManagementAccountId(),
            region,
            partition: props.partition,
            trustedAccountId,
            configDirPath: props.configDirPath,
            requireApproval: props.requireApproval,
            app: props.app,
            caBundlePath: props.caBundlePath,
            ec2Creds: props.ec2Creds,
            proxyAddress: props.proxyAddress,
            centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
            cdkOptions: globalConfig?.cdkOptions,
            enableSingleAccountMode: props.enableSingleAccountMode,
          }),
        );
        await Promise.all(promises);
        promises = [];
      }

      for (const region of globalConfig.enabledRegions) {
        for (const account of accountsConfig.getAccounts(props.enableSingleAccountMode)) {
          const accountId = accountsConfig.getAccountId(account.name);
          if (accountId !== trustedAccountId) {
            const needsBootstrapping = await bootstrapRequired(
              accountId,
              region,
              props.partition,
              globalConfig.managementAccountAccessRole,
              globalConfig?.centralizeCdkBuckets?.enable || globalConfig?.cdkOptions?.centralizeBuckets,
            );
            if (needsBootstrapping) {
              await delay(500);
              promises.push(
                AcceleratorToolkit.execute({
                  command: props.command,
                  accountId: accountId,
                  region,
                  partition: props.partition,
                  trustedAccountId,
                  configDirPath: props.configDirPath,
                  requireApproval: props.requireApproval,
                  app: props.app,
                  caBundlePath: props.caBundlePath,
                  ec2Creds: props.ec2Creds,
                  proxyAddress: props.proxyAddress,
                  centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
                  cdkOptions: globalConfig?.cdkOptions,
                  enableSingleAccountMode: props.enableSingleAccountMode,
                }),
              );
            }
          }

          if (promises.length >= 100) {
            await Promise.all(promises);
            promises = [];
          }
        }
      }

      await Promise.all(promises);
      return;
    }

    // Control Tower: To start a well-planned OU structure in your landing zone, AWS Control Tower
    // sets up a Security OU for you. This OU contains three shared accounts: the management
    // (primary) account, the log archive account, and the security audit account (also referred to
    // as the audit account).
    if (props.stage === AcceleratorStage.ACCOUNTS) {
      logger.info(`Executing ${props.stage} for Management account.`);
      return AcceleratorToolkit.execute({
        command: props.command,
        accountId: accountsConfig.getManagementAccountId(),
        region: globalRegion,
        partition: props.partition,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
        app: props.app,
        caBundlePath: props.caBundlePath,
        ec2Creds: props.ec2Creds,
        proxyAddress: props.proxyAddress,
        centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
        cdkOptions: globalConfig?.cdkOptions,
        enableSingleAccountMode: props.enableSingleAccountMode,
      });
    }

    if (props.stage === AcceleratorStage.PREPARE) {
      logger.info(`Executing ${props.stage} for Management account.`);
      return AcceleratorToolkit.execute({
        command: props.command,
        accountId: accountsConfig.getManagementAccountId(),
        region: globalConfig.homeRegion,
        partition: props.partition,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
        app: props.app,
        caBundlePath: props.caBundlePath,
        ec2Creds: props.ec2Creds,
        proxyAddress: props.proxyAddress,
        centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
        cdkOptions: globalConfig?.cdkOptions,
        enableSingleAccountMode: props.enableSingleAccountMode,
      });
    }

    if (props.stage === AcceleratorStage.FINALIZE) {
      logger.info(`Executing ${props.stage} for Management account.`);
      return AcceleratorToolkit.execute({
        command: props.command,
        accountId: accountsConfig.getManagementAccountId(),
        region: globalRegion,
        partition: props.partition,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
        app: props.app,
        centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
        cdkOptions: globalConfig?.cdkOptions,
        enableSingleAccountMode: props.enableSingleAccountMode,
      });
    }

    if (props.stage === AcceleratorStage.ORGANIZATIONS) {
      for (const region of globalConfig.enabledRegions) {
        logger.info(`Executing ${props.stage} for Management account in ${region} region.`);
        promises.push(
          AcceleratorToolkit.execute({
            command: props.command,
            accountId: accountsConfig.getManagementAccountId(),
            region: region,
            partition: props.partition,
            stage: props.stage,
            configDirPath: props.configDirPath,
            requireApproval: props.requireApproval,
            app: props.app,
            caBundlePath: props.caBundlePath,
            ec2Creds: props.ec2Creds,
            proxyAddress: props.proxyAddress,
            centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
            cdkOptions: globalConfig?.cdkOptions,
            enableSingleAccountMode: props.enableSingleAccountMode,
          }),
        );
        if (promises.length >= maxStacks) {
          await Promise.all(promises);
          promises = [];
        }
      }
    }

    if (props.stage === AcceleratorStage.SECURITY_AUDIT) {
      for (const region of globalConfig.enabledRegions) {
        logger.info(`Executing ${props.stage} for audit account in ${region} region.`);
        promises.push(
          AcceleratorToolkit.execute({
            command: props.command,
            accountId: accountsConfig.getAuditAccountId(),
            region: region,
            partition: props.partition,
            stage: props.stage,
            configDirPath: props.configDirPath,
            requireApproval: props.requireApproval,
            app: props.app,
            caBundlePath: props.caBundlePath,
            ec2Creds: props.ec2Creds,
            proxyAddress: props.proxyAddress,
            centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
            cdkOptions: globalConfig?.cdkOptions,
            enableSingleAccountMode: props.enableSingleAccountMode,
          }),
        );
        if (promises.length >= maxStacks) {
          await Promise.all(promises);
          promises = [];
        }
      }
    }

    //
    // CentralLogs bucket region logging stack needs to complete first before other enable regions. Because CentralLog buckets is created in home region.
    // ELB access log bucket is created in every region, ELB access log bucket needs to replicate to Central Log bucket, so CentralLogs bucket region must be completed
    // before any other region.
    // When CentralLogs bucket is not defined, CentralLogs bucket will be pipeline home region.
    if (props.stage === AcceleratorStage.LOGGING) {
      const logAccountId = accountsConfig.getLogArchiveAccountId();
      const logAccountName = accountsConfig.getAccountId(accountsConfig.getLogArchiveAccount().name);
      const centralLogsBucketRegion = globalConfig.logging.centralizedLoggingRegion ?? globalConfig.homeRegion;

      // Execute home region before other region for LogArchive account
      logger.info(`Executing ${props.stage} for ${logAccountName} account in ${centralLogsBucketRegion} region.`);
      await AcceleratorToolkit.execute({
        command: props.command,
        accountId: logAccountId,
        region: centralLogsBucketRegion,
        partition: props.partition,
        stage: props.stage,
        configDirPath: props.configDirPath,
        requireApproval: props.requireApproval,
        app: props.app,
        centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
        cdkOptions: globalConfig?.cdkOptions,
        enableSingleAccountMode: props.enableSingleAccountMode,
      });
      // execute in all other regions for Logging account, except home region
      for (const region of globalConfig.enabledRegions) {
        if (region !== centralLogsBucketRegion) {
          logger.info(`Executing ${props.stage} for ${logAccountName} account in ${region} region.`);
          await AcceleratorToolkit.execute({
            command: props.command,
            accountId: logAccountId,
            region: region,
            partition: props.partition,
            stage: props.stage,
            configDirPath: props.configDirPath,
            requireApproval: props.requireApproval,
            app: props.app,
            centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
            cdkOptions: globalConfig?.cdkOptions,
            enableSingleAccountMode: props.enableSingleAccountMode,
          });
        }
      }
      // execute in all other regions for all accounts, except logging account
      for (const region of globalConfig.enabledRegions) {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          logger.info(`Executing ${props.stage} for ${account.name} account in ${region} region.`);
          const accountId = accountsConfig.getAccountId(account.name);
          if (accountId !== logAccountId) {
            await delay(1000);
            promises.push(
              AcceleratorToolkit.execute({
                command: props.command,
                accountId,
                region,
                partition: props.partition,
                stage: props.stage,
                configDirPath: props.configDirPath,
                requireApproval: props.requireApproval,
                app: props.app,
                centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
                cdkOptions: globalConfig?.cdkOptions,
                enableSingleAccountMode: props.enableSingleAccountMode,
              }),
            );
          }

          if (promises.length >= maxStacks) {
            await Promise.all(promises);
            promises = [];
          }
        }
      }
    }

    if (
      props.stage === AcceleratorStage.SECURITY ||
      props.stage === AcceleratorStage.SECURITY_RESOURCES ||
      props.stage === AcceleratorStage.OPERATIONS ||
      props.stage === AcceleratorStage.NETWORK_PREP ||
      props.stage === AcceleratorStage.NETWORK_VPC ||
      props.stage === AcceleratorStage.NETWORK_ASSOCIATIONS ||
      props.stage === AcceleratorStage.CUSTOMIZATIONS ||
      props.stage === AcceleratorStage.KEY
    ) {
      const managementAccountId = accountsConfig.getManagementAccountId();
      for (const region of globalConfig.enabledRegions) {
        promises.push(
          AcceleratorToolkit.execute({
            command: props.command,
            accountId: managementAccountId,
            region,
            partition: props.partition,
            stage: props.stage,
            configDirPath: props.configDirPath,
            requireApproval: props.requireApproval,
            app: props.app,
            caBundlePath: props.caBundlePath,
            ec2Creds: props.ec2Creds,
            proxyAddress: props.proxyAddress,
            centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
            cdkOptions: globalConfig?.cdkOptions,
            enableSingleAccountMode: props.enableSingleAccountMode,
          }),
        );
        await Promise.all(promises);
      }

      for (const region of globalConfig.enabledRegions) {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          const accountId = accountsConfig.getAccountId(account.name);
          if (accountId !== managementAccountId) {
            await delay(1000);
            logger.info(`Executing ${props.stage} for ${account.name} account in ${region} region.`);
            promises.push(
              AcceleratorToolkit.execute({
                command: props.command,
                accountId: accountId,
                region,
                partition: props.partition,
                stage: props.stage,
                configDirPath: props.configDirPath,
                requireApproval: props.requireApproval,
                app: props.app,
                caBundlePath: props.caBundlePath,
                ec2Creds: props.ec2Creds,
                proxyAddress: props.proxyAddress,
                centralizeCdkBootstrap: globalConfig?.centralizeCdkBuckets?.enable,
                cdkOptions: globalConfig?.cdkOptions,
                enableSingleAccountMode: props.enableSingleAccountMode,
              }),
            );
            if (promises.length >= maxStacks) {
              await Promise.all(promises);
              promises = [];
            }
          }
        }
      }
    }

    await Promise.all(promises);
  }

  static async getManagementAccountCredentials(partition: string): Promise<AWS.STS.Credentials | undefined> {
    if (process.env['CREDENTIALS_PATH'] && fs.existsSync(process.env['CREDENTIALS_PATH'])) {
      logger.info('Detected Debugging environment. Loading temporary credentials.');

      const credentialsString = fs.readFileSync(process.env['CREDENTIALS_PATH']).toString();
      const credentials = JSON.parse(credentialsString);

      // Support for V2 SDK
      AWS.config.update({
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
      });
    }
    if (
      process.env['MANAGEMENT_ACCOUNT_ID'] &&
      process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'] &&
      process.env['ACCOUNT_ID'] !== process.env['MANAGEMENT_ACCOUNT_ID']
    ) {
      logger.info('set management account credentials');
      logger.info(`managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`);
      logger.info(`management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`);

      const roleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;
      const stsClient = new AWS.STS({ region: process.env['AWS_REGION'] });
      logger.info(`management account roleArn => ${roleArn}`);

      const assumeRoleCredential = await throttlingBackOff(() =>
        stsClient.assumeRole({ RoleArn: roleArn, RoleSessionName: 'acceleratorAssumeRoleSession' }).promise(),
      );

      process.env['AWS_ACCESS_KEY_ID'] = assumeRoleCredential.Credentials!.AccessKeyId!;
      process.env['AWS_ACCESS_KEY'] = assumeRoleCredential.Credentials!.AccessKeyId!;
      process.env['AWS_SECRET_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;
      process.env['AWS_SECRET_ACCESS_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;
      process.env['AWS_SESSION_TOKEN'] = assumeRoleCredential.Credentials!.SessionToken;

      // Support for V2 SDK
      AWS.config.update({
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
      });

      return assumeRoleCredential.Credentials;
    } else {
      return undefined;
    }
  }

  static async initializeAssumeRolePlugin(props: {
    region: string | undefined;
    assumeRoleName: string | undefined;
    partition: string;
    caBundlePath: string | undefined;
    credentials?: AWS.STS.Credentials;
  }) {
    const assumeRolePlugin = new AssumeProfilePlugin({
      region: props.region,
      assumeRoleName: props.assumeRoleName,
      assumeRoleDuration: 3600,
      credentials: props.credentials,
      partition: props.partition,
      caBundlePath: props.caBundlePath,
    });
    assumeRolePlugin.init(PluginHost.instance);
    return assumeRolePlugin;
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bootstrapRequired(
  accountId: string,
  region: string,
  partition: string,
  managementAccountAccessRole: string,
  centralizedBuckets: boolean,
): Promise<boolean> {
  const crossAccountCredentials = await getCrossAccountCredentials(
    accountId,
    region,
    partition,
    managementAccountAccessRole,
  );

  if (!centralizedBuckets) {
    logger.info(`Checking if workload account CDK asset bucket exists in account ${accountId}`);
    const s3Client = await getCrossAccountS3Client(region, crossAccountCredentials);
    const assetBucketExists = await doesCdkAssetBucketExist(s3Client, accountId, region);
    if (!assetBucketExists) {
      return true;
    }
  }

  const bootstrapVersionName = ' /cdk-bootstrap/accel/version';
  const ssmClient = await getCrossAccountSsmClient(region, crossAccountCredentials);
  const bootstrapVersionValue = await getSsmParameterValue(bootstrapVersionName, ssmClient);
  if (bootstrapVersionValue && Number(bootstrapVersionValue) >= BootstrapVersion) {
    logger.info(`Skipping bootstrap for account-region: ${accountId}-${region}`);
    return false;
  }

  return true;
}

async function doesCdkAssetBucketExist(s3Client: S3Client, accountId: string, region: string) {
  const commandInput = {
    Bucket: `cdk-accel-assets-${accountId}-${region}`,
  };
  try {
    await throttlingBackOff(() => s3Client.send(new HeadBucketCommand(commandInput)));
    return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.info(`CDK Asset Bucket not found for account ${accountId}, attempting to re-bootstrap`);
    return false;
  }
}

async function getSsmParameterValue(parameterName: string, ssmClient: SSMClient) {
  const parameterInput: GetParameterCommandInput = {
    Name: parameterName,
  };
  let parameterOutput: GetParameterCommandOutput | undefined = undefined;

  try {
    parameterOutput = await throttlingBackOff(() => ssmClient.send(new GetParameterCommand(parameterInput)));
    return parameterOutput.Parameter?.Value ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.name === 'ParameterNotFound') {
      logger.info(`Value not found for SSM Parameter: ${parameterName}`);
      return '';
    }
    logger.error(JSON.stringify(e));
    throw new Error(e.message);
  }
}

async function getCrossAccountCredentials(
  accountId: string,
  region: string,
  partition: string,
  managementAccountAccessRole: string,
) {
  const stsClient = new STSClient({ region: region });
  const stsParams: AssumeRoleCommandInput = {
    RoleArn: `arn:${partition}:iam::${accountId}:role/${managementAccountAccessRole}`,
    RoleSessionName: 'acceleratorBootstrapCheck',
    DurationSeconds: 900,
  };
  let assumeRoleCredential: AssumeRoleCommandOutput | undefined = undefined;
  try {
    assumeRoleCredential = await throttlingBackOff(() => stsClient.send(new AssumeRoleCommand(stsParams)));
    if (assumeRoleCredential) {
      return assumeRoleCredential;
    } else {
      throw new Error(
        `Error assuming role ${managementAccountAccessRole} in account ${accountId} for bootstrap checks`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    logger.error(JSON.stringify(e));
    throw new Error(e.message);
  }
}

async function getCrossAccountSsmClient(region: string, assumeRoleCredential: AssumeRoleCommandOutput) {
  return new SSMClient({
    credentials: {
      accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
      secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
      sessionToken: assumeRoleCredential.Credentials?.SessionToken,
    },
    region: region,
  });
}

async function getCrossAccountS3Client(region: string, assumeRoleCredential: AssumeRoleCommandOutput) {
  return new S3Client({
    credentials: {
      accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
      secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
      sessionToken: assumeRoleCredential.Credentials?.SessionToken,
    },
    region: region,
  });
}
