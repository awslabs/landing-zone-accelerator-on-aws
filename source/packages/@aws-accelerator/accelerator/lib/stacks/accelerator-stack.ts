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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import {
  AccountsConfig,
  DeploymentTargets,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  NetworkConfigTypes,
  OrganizationConfig,
  SecurityConfig,
  ShareTargets,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';

import { version } from '../../../../../package.json';
import { Logger } from '../logger';

export interface AcceleratorStackProps extends cdk.StackProps {
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly partition: string;
  readonly qualifier?: string;
  readonly configCommitId?: string;
}

export abstract class AcceleratorStack extends cdk.Stack {
  protected props: AcceleratorStackProps;

  protected constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    this.props = props;

    new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/version`,
      stringValue: version,
    });
  }

  protected isIncluded(deploymentTargets: DeploymentTargets): boolean {
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
  protected getAccountNamesFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountNames: string[] = [];

    // Helper function to add an account to the list
    const addAccountName = (accountName: string) => {
      if (!accountNames.includes(accountName)) {
        accountNames.push(accountName);
      }
    };

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          addAccountName(account.name);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            addAccountName(account.name);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      addAccountName(account);
    }

    return accountNames;
  }

  protected getAccountIdsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    // Helper function to add an account id to the list
    const addAccountId = (accountId: string) => {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    };

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      // debug: processing ou
      if (ou === 'Root') {
        for (const account of this.props.accountsConfig.accountIds ?? []) {
          // debug: accountId
          addAccountId(account.accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            // debug: accountId
            addAccountId(accountId);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      addAccountId(accountId);
    }

    return accountIds;
  }

  protected getExcludedAccountIds(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    // Helper function to add an account id to the list
    const addAccountId = (accountId: string) => {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    };

    if (deploymentTargets.excludedAccounts) {
      deploymentTargets.excludedAccounts.forEach(account =>
        addAccountId(this.props.accountsConfig.getAccountId(account)),
      );
    }

    return accountIds;
  }

  protected getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
    let vpcAccountIds: string[];

    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      vpcAccountIds = [this.props.accountsConfig.getAccountId(vpcItem.account)];
    } else {
      const excludedAccountIds = this.getExcludedAccountIds(vpcItem.deploymentTargets);
      vpcAccountIds = this.getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets).filter(
        item => !excludedAccountIds.includes(item),
      );
    }

    return vpcAccountIds;
  }

  protected getAccountIdsFromShareTarget(shareTargets: ShareTargets): string[] {
    const accountIds: string[] = [];

    // Helper function to add an account id to the list
    const addAccountId = (accountId: string) => {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    };

    for (const ou of shareTargets.organizationalUnits ?? []) {
      // debug: processing ou
      if (ou === 'Root') {
        for (const account of this.props.accountsConfig.accountIds ?? []) {
          // debug: accountId
          addAccountId(account.accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            // debug: accountId
            addAccountId(accountId);
          }
        }
      }
    }

    for (const account of shareTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      // debug: accountId
      addAccountId(accountId);
    }

    return accountIds;
  }

  protected isRegionExcluded(regions: string[]): boolean {
    if (regions?.includes(cdk.Stack.of(this).region)) {
      Logger.info(`[accelerator-stack] ${cdk.Stack.of(this).region} region explicitly excluded`);
      return true;
    }
    return false;
  }

  protected isAccountExcluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        Logger.info(`[accelerator-stack] ${account} account explicitly excluded`);
        return true;
      }
    }
    return false;
  }

  protected isAccountIncluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        Logger.info(`[accelerator-stack] ${account} region explicitly included`);
        return true;
      }
    }
    return false;
  }

  protected isOrganizationalUnitIncluded(organizationalUnits: string[]): boolean {
    if (organizationalUnits) {
      // If Root is specified, return right away
      if (organizationalUnits.includes('Root')) {
        return true;
      }

      // Full list of all accounts
      const accounts = [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts];

      // Find the account with the matching ID
      const account = accounts.find(
        item => this.props.accountsConfig.getAccountId(item.name) === cdk.Stack.of(this).account,
      );

      if (account) {
        if (organizationalUnits.indexOf(account.organizationalUnit) != -1) {
          Logger.info(`[accelerator-stack] ${account.organizationalUnit} organizational unit explicitly included`);
          return true;
        }
      }
    }

    return false;
  }
}
