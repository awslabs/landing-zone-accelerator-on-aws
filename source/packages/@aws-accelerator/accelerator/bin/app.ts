#!/usr/bin/env node

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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { IConstruct } from 'constructs';
import 'source-map-support/register';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { Logger } from '../lib/logger';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkAssociationsStack } from '../lib/stacks/network-associations-stack';
import { NetworkPrepStack } from '../lib/stacks/network-prep-stack';
import { NetworkVpcStack } from '../lib/stacks/network-vpc-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { PrepareStack } from '../lib/stacks/prepare-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
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
    }
  }
}

async function main() {
  Logger.info('[app] Begin Platform Accelerator CDK App');
  const app = new cdk.App();

  //
  // Read in context inputs
  //
  const configDirPath = app.node.tryGetContext('config-dir');
  const stage = app.node.tryGetContext('stage');
  const account = app.node.tryGetContext('account');
  const region = app.node.tryGetContext('region');
  const partition = app.node.tryGetContext('partition');

  if (partition === 'aws-us-gov') {
    cdk.Aspects.of(app).add(new GovCloudOverrides());
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

  const qualifier = process.env['ACCELERATOR_QUALIFIER'] ?? 'aws-accelerator';

  const getStackName = (name: string, stage: string, account: string, region: string): string => {
    const stackName = process.env['ACCELERATOR_QUALIFIER']
      ? `${pascalCase(process.env['ACCELERATOR_QUALIFIER'])}-${name}-${account}-${region}`
          .split('_')
          .join('-')
          .replace(/AwsAccelerator/gi, 'AWSAccelerator')
      : `${AcceleratorStackNames[stage]}-${account}-${region}`;
    return stackName;
  };

  //
  // PIPELINE Stack
  //
  if (includeStage({ stage: AcceleratorStage.PIPELINE, account, region })) {
    const sourceRepositoryName = process.env['ACCELERATOR_REPOSITORY_NAME'];
    const sourceBranchName = process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME'];
    const enableApprovalStage = process.env['ACCELERATOR_ENABLE_APPROVAL_STAGE'] === 'Yes';

    // Verify ENV vars are set
    if (!sourceRepositoryName || !sourceBranchName) {
      throw new Error(
        'Attempting to deploy pipeline stage and environment variables are not set [ACCELERATOR_REPOSITORY_NAME, ACCELERATOR_REPOSITORY_BRANCH_NAME]',
      );
    }

    new PipelineStack(app, getStackName('PipelineStack', AcceleratorStage.PIPELINE, account, region), {
      env: { account, region },
      description: `(SO0199) AWS Platform Accelerator - Pipeline Stack`,
      sourceRepositoryName,
      sourceBranchName,
      enableApprovalStage,
      qualifier: qualifier,
      managementAccountId: process.env['MANAGEMENT_ACCOUNT_ID']!,
      managementAccountRoleName: process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']!,
    });
  }

  //
  // TESTER Stack
  //
  if (includeStage({ stage: AcceleratorStage.TESTER_PIPELINE, account, region })) {
    if (process.env['ACCELERATOR_REPOSITORY_NAME'] && process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']) {
      new TesterPipelineStack(
        app,
        getStackName('TesterPipelineStack', AcceleratorStage.TESTER_PIPELINE, account, region),
        {
          env: { account, region },
          description: `(SO0199) AWS Platform Accelerator - Tester Pipeline Stack`,
          sourceRepositoryName: process.env['ACCELERATOR_REPOSITORY_NAME']!,
          sourceBranchName: process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']!,
          qualifier: qualifier,
          managementCrossAccountRoleName: process.env['MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME']!,
          managementAccountId: process.env['MANAGEMENT_ACCOUNT_ID']!,
          managementAccountRoleName: process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']!,
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
        description: `(SO0199) AWS Platform Accelerator - Prepare Stack`,
        ...props,
      });
    }

    //
    // ACCOUNTS Stack
    //
    if (includeStage({ stage: AcceleratorStage.ACCOUNTS, account: managementAccountId, region: homeRegion })) {
      new AccountsStack(
        app,
        `${AcceleratorStackNames[AcceleratorStage.ACCOUNTS]}-${managementAccountId}-${homeRegion}`,
        {
          env: {
            account: managementAccountId,
            region: homeRegion,
          },
          description: `(SO0199) AWS Platform Accelerator - Accounts Stack`,
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
            description: `(SO0199) AWS Platform Accelerator - Organizations Stack`,
            ...props,
          },
        );
      }
    }

    //
    // SECURITY AUDIT Stack
    //
    for (const enabledRegion of props.globalConfig.enabledRegions) {
      if (includeStage({ stage: AcceleratorStage.SECURITY_AUDIT, account: auditAccountId, region: enabledRegion })) {
        new SecurityAuditStack(
          app,
          `${AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]}-${auditAccountId}-${enabledRegion}`,
          {
            env: {
              account: auditAccountId,
              region: enabledRegion,
            },
            description: `(SO0199) AWS Platform Accelerator - Security Audit Stack`,
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
            description: `(SO0199) AWS Platform Accelerator - Logging Stack`,
            synthesizer: new cdk.DefaultStackSynthesizer({
              generateBootstrapVersionRule: false,
            }),
            ...props,
          });
        }

        //
        // SECURITY Stack
        //
        if (includeStage({ stage: AcceleratorStage.SECURITY, account: accountId, region: enabledRegion })) {
          new SecurityStack(app, `${AcceleratorStackNames[AcceleratorStage.SECURITY]}-${accountId}-${enabledRegion}`, {
            env,
            description: `(SO0199) AWS Platform Accelerator - Security Stack`,
            synthesizer: new cdk.DefaultStackSynthesizer({
              generateBootstrapVersionRule: false,
            }),
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
              description: `(SO0199) AWS Platform Accelerator - Operations Stack`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
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
              description: `(SO0199) AWS Platform Accelerator - Network Prep Stack`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              ...props,
            },
          );
        }

        //
        // NETWORK VPC Stack
        //
        if (includeStage({ stage: AcceleratorStage.NETWORK_VPC, account: accountId, region: enabledRegion })) {
          new NetworkVpcStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199) AWS Platform Accelerator - Network VPC Stack`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              ...props,
            },
          );
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
              description: `(SO0199) AWS Platform Accelerator - Network Associations Stack`,
              synthesizer: new cdk.DefaultStackSynthesizer({
                generateBootstrapVersionRule: false,
              }),
              ...props,
            },
          );
        }
      }
    }
  }

  Logger.info('[app] End Platform Accelerator CDK App');
}

main();
