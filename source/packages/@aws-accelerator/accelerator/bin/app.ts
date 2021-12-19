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
import { throttlingBackOff } from '@aws-accelerator/utils';
import {
  DescribeOrganizationCommand,
  OrganizationsClient,
  paginateListAccounts,
  paginateListOrganizationalUnitsForParent,
  paginateListRoots,
} from '@aws-sdk/client-organizations';
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { Logger } from '../lib/logger';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { DefaultStack } from '../lib/stacks/default-stack';
import { DependenciesStack } from '../lib/stacks/dependencies-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkTgwAttachStack } from '../lib/stacks/network-tgw-attach-stack';
import { NetworkTgwStack } from '../lib/stacks/network-tgw-stack';
import { NetworkVpcStack } from '../lib/stacks/network-vpc-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { ValidateStack } from '../lib/stacks/validate-stack';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

async function main() {
  Logger.info('[app] Begin Platform Accelerator');
  const app = new cdk.App();

  const stage = app.node.tryGetContext('stage');
  const account = app.node.tryGetContext('account');
  const region = app.node.tryGetContext('region');
  const configDirPath = app.node.tryGetContext('config-dir');
  const command = app.node.tryGetContext('command');

  const env = {
    account,
    region,
  };

  if (command === 'bootstrap') {
    // Need to define a dummy stack here to allow the bootstrap to occur
    new DefaultStack(app, 'AWSAccelerator-DefaultStack', { env });
    return;
  }

  if (stage === AcceleratorStage.PIPELINE) {
    new PipelineStack(app, 'AWSAccelerator-PipelineStack', {
      env,
      stage,
      sourceRepositoryName: process.env['ACCELERATOR_REPOSITORY_NAME']!,
      sourceBranchName: process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']!,
      managementAccountId: process.env['MANAGEMENT_ACCOUNT_ID'],
      managementAccountRoleName: process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'],
    });
    return;
  }

  const accountsConfig = AccountsConfig.load(configDirPath);
  const iamConfig = IamConfig.load(configDirPath);
  const globalConfig = GlobalConfig.load(configDirPath);
  const organizationConfig = OrganizationConfig.load(configDirPath);
  const networkConfig = NetworkConfig.load(configDirPath);
  const accountIds = await getAccountIds();
  const organizationsId = await getOrganizationsId();
  const organizationalUnitIds = await getOrganizationalUnitIds(organizationConfig);

  const props: AcceleratorStackProps = {
    accountIds,
    organizationsId,
    organizationalUnitIds,
    accountsConfig,
    iamConfig,
    globalConfig,
    organizationConfig,
    networkConfig,
  };

  // const synthesizer = new cdk.DefaultStackSynthesizer({
  //   qualifier: 'accel',
  //   deployRoleArn:
  //     'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + props.organizationConfig['organizationsAccessRole'],
  //   fileAssetPublishingRoleArn:
  //     'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + props.organizationConfig['organizationsAccessRole'],
  //   imageAssetPublishingRoleArn:
  //     'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + props.organizationConfig['organizationsAccessRole'],
  //   cloudFormationExecutionRole:
  //     'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + props.organizationConfig['organizationsAccessRole'],
  // });

  if (stage === AcceleratorStage.LOGGING) {
    new LoggingStack(app, 'AWSAccelerator-LoggingStack', {
      env,
      // synthesizer,
      accountIds: await getAccountIds(),
      accountsConfig: AccountsConfig.load(configDirPath),
      globalConfig: GlobalConfig.load(configDirPath),
    });
  } else if (stage === AcceleratorStage.ACCOUNTS) {
    new AccountsStack(app, 'AWSAccelerator-AccountsStack', {
      env,
      // synthesizer,
      accountIds: await getAccountIds(),
      configDirPath,
      accountsConfig: AccountsConfig.load(configDirPath),
      organizationConfig: OrganizationConfig.load(configDirPath),
      globalConfig: GlobalConfig.load(configDirPath),
      securityConfig: SecurityConfig.load(configDirPath),
    });
  } else if (stage === AcceleratorStage.ORGANIZATIONS) {
    new OrganizationsStack(app, 'AWSAccelerator-OrganizationsStack', {
      env,
      // synthesizer,
      accountIds: await getAccountIds(),
      configDirPath,
      accountsConfig: AccountsConfig.load(configDirPath),
      organizationConfig: OrganizationConfig.load(configDirPath),
      globalConfig: GlobalConfig.load(configDirPath),
      securityConfig: SecurityConfig.load(configDirPath),
    });
  } else if (stage === AcceleratorStage.VALIDATE) {
    new ValidateStack(app, 'AWSAccelerator-ValidateStack', {
      env,
      //synthesizer,
      stage,
    });
  } else if (stage === AcceleratorStage.DEPENDENCIES) {
    new DependenciesStack(app, 'AWSAccelerator-DependenciesStack', {
      env,
      //synthesizer,
      stage,
    });
  } else if (stage === AcceleratorStage.SECURITY) {
    new SecurityStack(app, 'AWSAccelerator-SecurityStack', {
      env,
      // synthesizer,
      accountIds: await getAccountIds(),
      accountsConfig: AccountsConfig.load(configDirPath),
      globalConfig: GlobalConfig.load(configDirPath),
      securityConfig: SecurityConfig.load(configDirPath),
    });
  } else if (stage === AcceleratorStage.SECURITY_AUDIT) {
    new SecurityAuditStack(app, 'AWSAccelerator-SecurityAuditStack', {
      env,
      // synthesizer,
      stage,
      accountsConfig: AccountsConfig.load(configDirPath),
      securityConfig: SecurityConfig.load(configDirPath),
    });
  } else if (stage === AcceleratorStage.OPERATIONS) {
    new OperationsStack(app, 'AWSAccelerator-OperationsStack', {
      env,
      // synthesizer,
      configDirPath,
      ...props,
    });
  } else if (stage === AcceleratorStage.NETWORK_TGW) {
    new NetworkTgwStack(app, 'AWSAccelerator-NetworkTgwStack', {
      env,
      // synthesizer,
      ...props,
    });
  } else if (stage === AcceleratorStage.NETWORK_VPC) {
    new NetworkVpcStack(app, 'AWSAccelerator-NetworkVpcStack', {
      env,
      // synthesizer,
      ...props,
    });
  } else if (stage === AcceleratorStage.NETWORK_TGW_ATTACH) {
    new NetworkTgwAttachStack(app, 'AWSAccelerator-NetworkTgwAttachStack', {
      env,
      // synthesizer,
      ...props,
    });
  }
}

/**
 * Provides a dictionary of account email to account id. Will initially check if
 * a local file is provided with the mappings, and if not existent, build the
 * list though the Organizations client
 *
 * @returns dictionary of account email to account id
 */
async function getAccountIds(): Promise<{ [name: string]: string }> {
  const organizationsClient = new OrganizationsClient({});
  const accountIds: { [name: string]: string } = {};
  for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
    for (const account of page.Accounts ?? []) {
      if (account.Email && account.Id) {
        accountIds[account.Email] = account.Id;
      }
    }
  }
  return accountIds;
}

async function getOrganizationsId(): Promise<string> {
  const organizationsClient = new OrganizationsClient({});
  const organization = await throttlingBackOff(() =>
    organizationsClient.send(new DescribeOrganizationCommand({})).catch(error => {
      if (error.name === 'AWSOrganizationsNotInUseException') {
        throw new Error(error.message);
      }
      throw new Error(error);
    }),
  );

  return organization.Organization?.Id ?? '';
}

/**
 * Provides a dictionary of logical organizational unit name to organizational
 * unit id. Will initially check if a local file is provided with the mappings,
 * and if not existent, build the list though the Organizations client
 *
 * @param organizationConfig
 * @returns
 */
async function getOrganizationalUnitIds(
  organizationConfig: OrganizationConfig,
): Promise<{ [name: string]: { id: string; arn: string } }> {
  const organizationsClient = new OrganizationsClient({});
  const organizationalUnitIds: { [name: string]: { id: string; arn: string } } = {};

  // Add root first
  for await (const page of paginateListRoots({ client: organizationsClient }, {})) {
    for (const root of page.Roots ?? []) {
      if (root.Name === 'Root') {
        organizationalUnitIds['Root'] = {
          id: root.Id ?? '',
          arn: root.Arn ?? '',
        };
      }
    }
  }

  // Add all top level OUs
  for await (const page of paginateListOrganizationalUnitsForParent(
    { client: organizationsClient },
    { ParentId: organizationalUnitIds['Root'].id },
  )) {
    for (const ou of page.OrganizationalUnits ?? []) {
      const entry = organizationConfig.organizationalUnits.find(item => item.name === ou.Name);
      if (entry && ou.Id) {
        organizationalUnitIds[entry.name] = {
          id: ou.Id ?? '',
          arn: ou.Arn ?? '',
        };
      }
    }
  }
  return organizationalUnitIds;
}

main();
