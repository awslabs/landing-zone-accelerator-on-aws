#!/usr/bin/env node

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

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { IConstruct } from 'constructs';
import { version } from '../../../../package.json';

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';

import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { Logger } from '../lib/logger';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { FinalizeStack } from '../lib/stacks/finalize-stack';
import { KeyStack } from '../lib/stacks/key-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkAssociationsStack } from '../lib/stacks/network-associations-stack';
import { NetworkPrepStack } from '../lib/stacks/network-prep-stack';
import { NetworkVpcDnsStack } from '../lib/stacks/network-vpc-dns-stack';
import { NetworkVpcEndpointsStack } from '../lib/stacks/network-vpc-endpoints-stack';
import { NetworkVpcStack } from '../lib/stacks/network-vpc-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { PrepareStack } from '../lib/stacks/prepare-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
import { SecurityResourcesStack } from '../lib/stacks/security-resources-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { TesterPipelineStack } from '../lib/stacks/tester-pipeline-stack';

process.on(
  'unhandledRejection',
  (
    reason,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _,
  ) => {
    console.error(reason);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  },
);

export class GovCloudOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('KmsKeyId');
      node.addPropertyDeletionOverride('Tags');
    }
  }
}

export class IsobOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_ec2.CfnFlowLog) {
      node.addPropertyDeletionOverride('LogFormat');
      node.addPropertyDeletionOverride('Tags');
      node.addPropertyDeletionOverride('MaxAggregationInterval');
    }
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('KmsKeyId');
      node.addPropertyDeletionOverride('Tags');
    }
    if (node instanceof cdk.aws_s3.CfnBucket) {
      node.addPropertyDeletionOverride('PublicAccessBlockConfiguration');
      node.addPropertyDeletionOverride('OwnershipControls');
    }
  }
}

async function main() {
  Logger.info('[app] Begin Accelerator CDK App');
  const app = new cdk.App();
  cdk.Aspects.of(app).add(new AwsSolutionsChecks());

  //
  // Read in context inputs
  //
  const configDirPath = app.node.tryGetContext('config-dir');
  const stage = app.node.tryGetContext('stage');
  const account = app.node.tryGetContext('account');
  const region = app.node.tryGetContext('region');
  const partition = app.node.tryGetContext('partition');

  let globalRegion = 'us-east-1';

  if (partition === 'aws-us-gov') {
    cdk.Aspects.of(app).add(new GovCloudOverrides());
    globalRegion = 'us-gov-west-1';
  }

  if (partition === 'aws-iso-b') {
    cdk.Aspects.of(app).add(new IsobOverrides());
  }

  const includeStage = (props: { stage: string; account: string; region: string }): boolean => {
    if (stage === undefined) {
      // Do not include PIPELINE or TESTER_PIPELINE in full synth/diff
      if (props.stage === AcceleratorStage.PIPELINE || props.stage === AcceleratorStage.TESTER_PIPELINE) {
        return false;
      }
      return true; // No stage, return all other stacks
    }
    if (stage === props.stage) {
      if (account === undefined && region === undefined) {
        return true; // No account or region, return all stacks for synth/diff
      }
      if (props.account === account && props.region === region) {
        return true;
      }
    }
    return false;
  };

  //
  // PIPELINE Stack
  //
  if (includeStage({ stage: AcceleratorStage.PIPELINE, account, region })) {
    const sourceRepository = process.env['ACCELERATOR_REPOSITORY_SOURCE'] ?? 'github';
    const sourceRepositoryOwner = process.env['ACCELERATOR_REPOSITORY_OWNER'] ?? 'awslabs';
    const sourceRepositoryName = process.env['ACCELERATOR_REPOSITORY_NAME'] ?? 'landing-zone-accelerator-on-aws';
    const sourceBranchName = process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME'];
    const enableApprovalStage = process.env['ACCELERATOR_ENABLE_APPROVAL_STAGE']
      ? process.env['ACCELERATOR_ENABLE_APPROVAL_STAGE'] === 'Yes'
      : true;

    // Verify ENV vars are set
    if (!sourceRepositoryName || !sourceBranchName) {
      throw new Error(
        'Attempting to deploy pipeline stage and environment variables are not set [ACCELERATOR_REPOSITORY_NAME, ACCELERATOR_REPOSITORY_BRANCH_NAME]',
      );
    }

    new PipelineStack(
      app,
      process.env['ACCELERATOR_QUALIFIER']
        ? `${process.env['ACCELERATOR_QUALIFIER']}-${AcceleratorStage.PIPELINE}-stack-${account}-${region}`
        : `${AcceleratorStackNames[stage]}-${account}-${region}`,
      {
        env: { account, region },
        description: `(SO0199-pipeline) Landing Zone Accelerator on AWS. Version ${version}.`,
        sourceRepository,
        sourceRepositoryOwner,
        sourceRepositoryName,
        sourceBranchName,
        enableApprovalStage,
        terminationProtection: true,
        qualifier: process.env['ACCELERATOR_QUALIFIER'],
        managementAccountId: process.env['MANAGEMENT_ACCOUNT_ID']!,
        managementAccountRoleName: process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']!,
        managementAccountEmail: process.env['MANAGEMENT_ACCOUNT_EMAIL']!,
        logArchiveAccountEmail: process.env['LOG_ARCHIVE_ACCOUNT_EMAIL']!,
        auditAccountEmail: process.env['AUDIT_ACCOUNT_EMAIL']!,
        approvalStageNotifyEmailList: process.env['APPROVAL_STAGE_NOTIFY_EMAIL_LIST'],
        partition,
      },
    );
  }

  //
  // TESTER Stack
  //
  if (includeStage({ stage: AcceleratorStage.TESTER_PIPELINE, account, region })) {
    if (process.env['ACCELERATOR_REPOSITORY_NAME'] && process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']) {
      new TesterPipelineStack(
        app,
        process.env['ACCELERATOR_QUALIFIER']
          ? `${process.env['ACCELERATOR_QUALIFIER']}-${AcceleratorStage.TESTER_PIPELINE}-stack-${account}-${region}`
          : `${AcceleratorStackNames[stage]}-${account}-${region}`,
        {
          env: { account, region },
          description: `(SO0199-tester) Landing Zone Accelerator on AWS. Version ${version}.`,
          sourceRepositoryName: process.env['ACCELERATOR_REPOSITORY_NAME']!,
          sourceBranchName: process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']!,
          managementCrossAccountRoleName: process.env['MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME']!,
          qualifier: process.env['ACCELERATOR_QUALIFIER'],
          managementAccountId: process.env['MANAGEMENT_ACCOUNT_ID'],
          managementAccountRoleName: process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'],
          terminationProtection: true,
        },
      );
    }
  }

  if (configDirPath) {
    //
    // Create properties to be used by AcceleratorStack types
    //
    const props = {
      configDirPath,
      accountsConfig: AccountsConfig.load(configDirPath),
      globalConfig: GlobalConfig.load(configDirPath),
      iamConfig: IamConfig.load(configDirPath),
      networkConfig: NetworkConfig.load(configDirPath),
      organizationConfig: OrganizationConfig.load(configDirPath),
      securityConfig: SecurityConfig.load(configDirPath),
      partition: partition,
      qualifier: process.env['ACCELERATOR_QUALIFIER'],
      configCommitId: process.env['CONFIG_COMMIT_ID'],
    };

    //
    // Load in account IDs using the Organizations client if not provided as
    // inputs in accountsConfig
    //
    await props.accountsConfig.loadAccountIds(partition);

    //
    // Load in organizational unit IDs using the Organizations client if not
    // provided as inputs in accountsConfig
    //
    await props.organizationConfig.loadOrganizationalUnitIds(partition);

    const homeRegion = props.globalConfig.homeRegion;
    const managementAccountId = props.accountsConfig.getManagementAccountId();
    const auditAccountId = props.accountsConfig.getAuditAccountId();

    //
    // PREPARE Stack
    //
    if (includeStage({ stage: AcceleratorStage.PREPARE, account: managementAccountId, region: homeRegion })) {
      new PrepareStack(app, `${AcceleratorStackNames[AcceleratorStage.PREPARE]}-${managementAccountId}-${homeRegion}`, {
        env: {
          account: managementAccountId,
          region: homeRegion,
        },
        description: `(SO0199-prepare) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: new cdk.DefaultStackSynthesizer({
          generateBootstrapVersionRule: false,
        }),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      });
    }

    //
    // FINALIZE Stack
    //
    if (includeStage({ stage: AcceleratorStage.FINALIZE, account: managementAccountId, region: globalRegion })) {
      new FinalizeStack(
        app,
        `${AcceleratorStackNames[AcceleratorStage.FINALIZE]}-${managementAccountId}-${globalRegion}`,
        {
          env: {
            account: managementAccountId,
            region: globalRegion,
          },
          description: `(SO0199-finalize) Landing Zone Accelerator on AWS. Version ${version}.`,
          synthesizer: new cdk.DefaultStackSynthesizer({
            generateBootstrapVersionRule: false,
          }),
          terminationProtection: props.globalConfig.terminationProtection ?? true,
          ...props,
        },
      );
    }

    //
    // ACCOUNTS Stack
    //
    if (includeStage({ stage: AcceleratorStage.ACCOUNTS, account: managementAccountId, region: globalRegion })) {
      new AccountsStack(
        app,
        `${AcceleratorStackNames[AcceleratorStage.ACCOUNTS]}-${managementAccountId}-${globalRegion}`,
        {
          env: {
            account: managementAccountId,
            region: globalRegion,
          },
          description: `(SO0199-accounts) Landing Zone Accelerator on AWS. Version ${version}.`,
          terminationProtection: props.globalConfig.terminationProtection ?? true,
          ...props,
        },
      );
    }

    //
    // ORGANIZATIONS Stack
    //
    for (const enabledRegion of props.globalConfig.enabledRegions) {
      if (
        includeStage({ stage: AcceleratorStage.ORGANIZATIONS, account: managementAccountId, region: enabledRegion })
      ) {
        new OrganizationsStack(
          app,
          `${AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]}-${managementAccountId}-${enabledRegion}`,
          {
            env: {
              account: managementAccountId,
              region: enabledRegion,
            },
            description: `(SO0199-organizations) Landing Zone Accelerator on AWS. Version ${version}.`,
            terminationProtection: props.globalConfig.terminationProtection ?? true,
            ...props,
          },
        );
      }
    }

    //
    // KEY and SECURITY AUDIT Stack
    //
    for (const enabledRegion of props.globalConfig.enabledRegions) {
      if (includeStage({ stage: AcceleratorStage.KEY, account: auditAccountId, region: enabledRegion })) {
        new KeyStack(app, `${AcceleratorStackNames[AcceleratorStage.KEY]}-${auditAccountId}-${enabledRegion}`, {
          env: {
            account: auditAccountId,
            region: enabledRegion,
          },
          description: `(SO0199-key) Landing Zone Accelerator on AWS. Version ${version}.`,
          terminationProtection: props.globalConfig.terminationProtection ?? true,
          ...props,
        });
      }

      if (includeStage({ stage: AcceleratorStage.SECURITY_AUDIT, account: auditAccountId, region: enabledRegion })) {
        new SecurityAuditStack(
          app,
          `${AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]}-${auditAccountId}-${enabledRegion}`,
          {
            env: {
              account: auditAccountId,
              region: enabledRegion,
            },
            description: `(SO0199-securityaudit) Landing Zone Accelerator on AWS. Version ${version}.`,
            terminationProtection: props.globalConfig.terminationProtection ?? true,
            ...props,
          },
        );
      }
    }

    for (const enabledRegion of props.globalConfig.enabledRegions) {
      let accountId = '';
      for (const accountItem of [...props.accountsConfig.mandatoryAccounts, ...props.accountsConfig.workloadAccounts]) {
        try {
          accountId = props.accountsConfig.getAccountId(accountItem.name);
        } catch (error) {
          continue;
        }
        const env = {
          account: accountId,
          region: enabledRegion,
        };

        //
        // LOGGING Stack
        //
        if (includeStage({ stage: AcceleratorStage.LOGGING, account: accountId, region: enabledRegion })) {
          new LoggingStack(app, `${AcceleratorStackNames[AcceleratorStage.LOGGING]}-${accountId}-${enabledRegion}`, {
            env,
            description: `(SO0199-logging) Landing Zone Accelerator on AWS. Version ${version}.`,
            synthesizer: new cdk.DefaultStackSynthesizer({
              generateBootstrapVersionRule: false,
            }),
            terminationProtection: props.globalConfig.terminationProtection ?? true,
            ...props,
          });
        }

        //
        // SECURITY Stack
        //
        if (includeStage({ stage: AcceleratorStage.SECURITY, account: accountId, region: enabledRegion })) {
          new SecurityStack(app, `${AcceleratorStackNames[AcceleratorStage.SECURITY]}-${accountId}-${enabledRegion}`, {
            env,
            description: `(SO0199-security) Landing Zone Accelerator on AWS. Version ${version}.`,
            synthesizer: new cdk.DefaultStackSynthesizer({
              generateBootstrapVersionRule: false,
            }),
            terminationProtection: props.globalConfig.terminationProtection ?? true,
            ...props,
          });
        }

        //
        // OPERATIONS Stack
        //
        if (includeStage({ stage: AcceleratorStage.OPERATIONS, account: accountId, region: enabledRegion })) {
          new OperationsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.OPERATIONS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-operations) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
        }

        //
        // NETWORK PREP Stack
        //
        if (includeStage({ stage: AcceleratorStage.NETWORK_PREP, account: accountId, region: enabledRegion })) {
          new NetworkPrepStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_PREP]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkprep) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
        }

        //
        // SECURITY_RESOURCES Stack
        //
        if (includeStage({ stage: AcceleratorStage.SECURITY_RESOURCES, account: accountId, region: enabledRegion })) {
          new SecurityResourcesStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.SECURITY_RESOURCES]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-securityresources) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
        }

        //
        // NETWORK VPC Stack
        //
        if (includeStage({ stage: AcceleratorStage.NETWORK_VPC, account: accountId, region: enabledRegion })) {
          const vpcStack = new NetworkVpcStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkvpc) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );

          const endpointsStack = new NetworkVpcEndpointsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_ENDPOINTS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkendpoints) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          endpointsStack.addDependency(vpcStack);

          const dnsStack = new NetworkVpcDnsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkdns) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              ...props,
            },
          );
          dnsStack.addDependency(endpointsStack);
        }

        //
        // NETWORK ASSOCIATIONS Stack
        //
        if (includeStage({ stage: AcceleratorStage.NETWORK_ASSOCIATIONS, account: accountId, region: enabledRegion })) {
          new NetworkAssociationsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkassociations) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
        }
      }
    }
  }

  Logger.info('[app] End Accelerator CDK App');
}

main();
