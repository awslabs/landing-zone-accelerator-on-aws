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
import * as fs from 'fs';
import * as path from 'path';

import {
  AccountConfig,
  AccountsConfig,
  AppConfigItem,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';

import { Stack } from 'aws-cdk-lib';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStack, AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { ApplicationsStack } from '../lib/stacks/applications-stack';
import { BootstrapStack } from '../lib/stacks/bootstrap-stack';
import { CustomStack, generateCustomStackMappings, isIncluded } from '../lib/stacks/custom-stack';
import { CustomizationsStack } from '../lib/stacks/customizations-stack';
import { DependenciesStack } from '../lib/stacks/dependencies-stack';
import { FinalizeStack } from '../lib/stacks/finalize-stack';
import { KeyStack } from '../lib/stacks/key-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkAssociationsGwlbStack } from '../lib/stacks/network-stacks/network-associations-gwlb-stack/network-associations-gwlb-stack';
import { NetworkAssociationsStack } from '../lib/stacks/network-stacks/network-associations-stack/network-associations-stack';
import { NetworkPrepStack } from '../lib/stacks/network-stacks/network-prep-stack/network-prep-stack';
import { NetworkVpcDnsStack } from '../lib/stacks/network-stacks/network-vpc-dns-stack/network-vpc-dns-stack';
import { NetworkVpcEndpointsStack } from '../lib/stacks/network-stacks/network-vpc-endpoints-stack/network-vpc-endpoints-stack';
import { NetworkVpcStack } from '../lib/stacks/network-stacks/network-vpc-stack/network-vpc-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PrepareStack } from '../lib/stacks/prepare-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
import { SecurityResourcesStack } from '../lib/stacks/security-resources-stack';
import { SecurityStack } from '../lib/stacks/security-stack';

export class AcceleratorSynthStacks {
  private readonly configFolderName: string;
  private readonly partition: string;
  private readonly configDirPath: string;
  private readonly props: AcceleratorStackProps;
  private readonly app: cdk.App;
  private readonly homeRegion: string;
  private readonly managementAccountId: string;
  private readonly managementAccount: AccountConfig;
  private readonly auditAccountId: string;
  private readonly auditAccount: AccountConfig;
  private readonly stageName: string;
  private readonly globalRegion: string;

  public readonly stacks = new Map<string, AcceleratorStack | CustomStack | Stack>();
  constructor(stageName: string, configFolderName: string, partition: string, globalRegion: string) {
    this.configFolderName = configFolderName;
    this.partition = partition;
    this.stageName = stageName;
    this.globalRegion = globalRegion;

    /**
     * Test stack CDK app
     */
    this.app = new cdk.App({
      context: { 'config-dir': path.join(__dirname, `configs/${this.configFolderName}`) },
    });
    this.configDirPath = this.app.node.tryGetContext('config-dir');

    const globalConfig = GlobalConfig.load(this.configDirPath);

    let customizationsConfig: CustomizationsConfig;
    // console.log(`Using config directory ${this.configDirPath}`);
    // Create empty customizationsConfig if optional configuration file does not exist
    if (fs.existsSync(path.join(this.configDirPath, 'customizations-config.yaml'))) {
      customizationsConfig = CustomizationsConfig.load(this.configDirPath);
    } else {
      customizationsConfig = new CustomizationsConfig();
    }

    this.props = {
      configDirPath: this.configDirPath,
      accountsConfig: AccountsConfig.load(this.configDirPath),
      // customizationsConfig: CustomizationsConfig.load(this.configDirPath),
      customizationsConfig,
      globalConfig,
      iamConfig: IamConfig.load(this.configDirPath),
      networkConfig: NetworkConfig.load(this.configDirPath),
      organizationConfig: OrganizationConfig.load(this.configDirPath),
      securityConfig: SecurityConfig.load(this.configDirPath),
      partition: this.partition,
      globalRegion: this.globalRegion,
      centralizedLoggingRegion: globalConfig.logging.centralizedLoggingRegion ?? globalConfig.homeRegion,
      configRepositoryName: 'aws-accelerator-config',
      prefixes: {
        accelerator: 'AWSAccelerator',
        kmsAlias: 'alias/accelerator',
        bucketName: 'aws-accelerator',
        ssmParamName: '/accelerator',
        snsTopicName: 'aws-accelerator',
        repoName: 'aws-accelerator',
        secretName: '/accelerator',
        trailLogName: 'aws-accelerator',
        databaseName: 'aws-accelerator',
      },
      enableSingleAccountMode: false,
    };

    this.homeRegion = this.props.globalConfig.homeRegion;

    this.managementAccount = this.props.accountsConfig.getManagementAccount();
    this.managementAccountId = this.props.accountsConfig.getManagementAccountId();

    this.auditAccount = this.props.accountsConfig.getAuditAccount();
    this.auditAccountId = this.props.accountsConfig.getAuditAccountId();

    /**
     * synth all test stacks
     */
    this.synthAllTestStacks();
  }

  private synthAllTestStacks() {
    switch (this.stageName) {
      case AcceleratorStage.FINALIZE:
        this.synthFinalizeStacks();
        break;
      case AcceleratorStage.SECURITY_AUDIT:
        this.synthSecurityAuditStacks();
        break;
      case AcceleratorStage.LOGGING:
        this.synthLoggingStacks();
        break;
      case AcceleratorStage.CUSTOMIZATIONS:
        this.synthCustomizationsStacks();
        this.synthApplicationsStacks();
        break;
      case AcceleratorStage.NETWORK_ASSOCIATIONS:
        this.synthNetworkAssociationStacks();
        break;
      case AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB:
        this.synthNetworkAssociationGwlbStacks();
        break;
      case AcceleratorStage.NETWORK_PREP:
        this.synthNetworkPrepStacks();
        break;
      case AcceleratorStage.NETWORK_VPC_DNS:
        this.synthNetworkVpcDnsStacks();
        break;
      case AcceleratorStage.NETWORK_VPC_ENDPOINTS:
        this.synthNetworkVpcEndPointsStacks();
        break;
      case AcceleratorStage.NETWORK_VPC:
        this.synthNetworkVpcStacks();
        break;
      case AcceleratorStage.OPERATIONS:
        this.synthOperationsStacks();
        break;
      case AcceleratorStage.ORGANIZATIONS:
        this.synthOrganizationsStacks();
        break;
      case AcceleratorStage.PREPARE:
        this.synthPrepareStacks();
        break;
      case AcceleratorStage.KEY:
        this.synthKeyStacks();
        break;
      case AcceleratorStage.SECURITY_RESOURCES:
        this.synthSecurityResourcesStacks();
        break;
      case AcceleratorStage.SECURITY:
        this.synthSecurityStacks();
        break;
      case AcceleratorStage.ACCOUNTS:
        this.synthAccountStacks();
        break;
      case AcceleratorStage.BOOTSTRAP:
        this.synthBootstrapStacks();
        break;
      case AcceleratorStage.DEPENDENCIES:
        this.synthDependenciesStacks();
        break;
    }
  }

  /**
   * Function to synth Finalize stack
   */
  private synthFinalizeStacks() {
    this.stacks.set(
      `${this.managementAccount.name}-${this.homeRegion}`,
      new FinalizeStack(
        this.app,
        `${AcceleratorStackNames[AcceleratorStage.FINALIZE]}-${this.managementAccountId}-${this.homeRegion}`,
        {
          env: {
            account: this.managementAccountId,
            region: this.homeRegion,
          },
          ...this.props,
        },
      ),
    );
  }
  /**
   * synth Security Audit stacks
   */
  private synthSecurityAuditStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      this.stacks.set(
        `${this.auditAccount.name}-${region}`,
        new SecurityAuditStack(
          this.app,
          `${AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]}-${this.auditAccountId}-${region}`,
          {
            env: {
              account: this.auditAccountId,
              region: region,
            },
            ...this.props,
          },
        ),
      );
    }
  }

  /**
   * synth Logging stacks
   */
  private synthLoggingStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new LoggingStack(this.app, `${AcceleratorStackNames[AcceleratorStage.LOGGING]}-${accountId}-${region}`, {
            env: {
              account: accountId,
              region: region,
            },
            ...this.props,
          }),
        );
      }
    }
  }
  /**
   * synth Customizations stacks
   */
  private synthCustomizationsStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new CustomizationsStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.CUSTOMIZATIONS]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
    this.synthCustomStacks();
  }
  /**
   * synth Custom stacks
   */
  private synthCustomStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        const customStackList = generateCustomStackMappings(
          this.props.accountsConfig,
          this.props.organizationConfig,
          this.props.customizationsConfig,
          accountId,
          region,
        );

        for (const stack of customStackList ?? []) {
          stack.stackObj = new CustomStack(this.app, `${stack.stackConfig.name}-${accountId}-${region}`, {
            env: {
              account: accountId,
              region: region,
            },
            description: stack.stackConfig.description,
            runOrder: stack.stackConfig.runOrder,
            stackName: stack.stackConfig.name,
            templateFile: stack.stackConfig.template,
            terminationProtection: stack.stackConfig.terminationProtection,
            ...this.props,
            parameters: stack.stackConfig.parameters,
            ssmParamNamePrefix: '/accelerator',
          });

          if (stack.dependsOn) {
            for (const stackName of stack.dependsOn) {
              const previousStack = customStackList.find(a => a.stackConfig.name == stackName)?.stackObj;
              if (previousStack) {
                stack.stackObj.addDependency(previousStack);
              }
            }
          }
          this.stacks.set(`${stack.stackConfig.name}-${accountId}-${region}`, stack.stackObj);
        }
      }
    }
  }
  /**
   * synth Applications stacks
   */
  private synthApplicationsStacks() {
    for (const application of this.props.customizationsConfig.applications ?? []) {
      this.synthProcessEachApplicationStack(application);
    }
  }

  private synthProcessEachApplicationStack(application: AppConfigItem) {
    if (
      isIncluded(
        application.deploymentTargets,
        'us-east-1',
        '444444444444',
        this.props.accountsConfig,
        this.props.organizationConfig,
      )
    ) {
      const applicationStackName = `AWSAccelerator-App-${application.name}-444444444444-us-east-1`;
      const env = {
        account: '444444444444',
        region: 'us-east-1',
      };

      new ApplicationsStack(this.app, applicationStackName, {
        env,
        ...this.props,
        appConfigItem: application,
      });
    }
  }
  /**
   * synth Network Association stacks
   */
  private synthNetworkAssociationStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new NetworkAssociationsStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }
  /**
   * synth Network Association stacks
   */
  private synthNetworkAssociationGwlbStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new NetworkAssociationsGwlbStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }
  /**
   * synth Network Prep stacks
   */
  private synthNetworkPrepStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new NetworkPrepStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_PREP]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }
  /**
   * synth Network VPC DNS stacks
   */
  private synthNetworkVpcDnsStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new NetworkVpcDnsStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }
  /**
   * synth Network VPC Endpoints stacks
   */
  private synthNetworkVpcEndPointsStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new NetworkVpcEndpointsStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_ENDPOINTS]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }
  /**
   * synth Network VPC stacks
   */
  private synthNetworkVpcStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new NetworkVpcStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }

  /**
   * synth Operations stacks
   */
  private synthOperationsStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new OperationsStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.OPERATIONS]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
              accountWarming: account.warm ?? false,
            },
          ),
        );
      }
    }
  }
  /**
   * synth Organizations stacks
   */
  private synthOrganizationsStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      this.stacks.set(
        `${this.managementAccount.name}-${region}`,
        new OrganizationsStack(
          this.app,
          `${AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]}-${this.managementAccountId}-${region}`,
          {
            env: {
              account: this.managementAccountId,
              region: region,
            },
            ...this.props,
          },
        ),
      );
    }
  }
  /**
   * synth Prepare stacks
   */
  private synthPrepareStacks() {
    this.stacks.set(
      `${this.managementAccount.name}-${this.homeRegion}`,
      new PrepareStack(
        this.app,
        `${AcceleratorStackNames[AcceleratorStage.PREPARE]}-${this.managementAccountId}-${this.homeRegion}`,
        {
          env: {
            account: this.managementAccountId,
            region: this.homeRegion,
          },
          ...this.props,
        },
      ),
    );
  }
  /**
   * synth Key stacks
   */
  private synthKeyStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      this.stacks.set(
        `${this.auditAccount.name}-${region}`,
        new KeyStack(this.app, `${AcceleratorStackNames[AcceleratorStage.KEY]}-${this.auditAccountId}-${region}`, {
          env: {
            account: this.auditAccountId,
            region: region,
          },
          ...this.props,
        }),
      );
    }
  }
  /**
   * synth SecurityResources stacks
   */
  private synthSecurityResourcesStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new SecurityResourcesStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.SECURITY_RESOURCES]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }
  /**
   * synth Security stacks
   */
  private synthSecurityStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new SecurityStack(this.app, `${AcceleratorStackNames[AcceleratorStage.SECURITY]}-${accountId}-${region}`, {
            env: {
              account: accountId,
              region: region,
            },
            ...this.props,
          }),
        );
      }
    }
  }
  /**
   * synth Bootstrap stacks
   */
  private synthBootstrapStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new BootstrapStack(this.app, `${AcceleratorStackNames[AcceleratorStage.BOOTSTRAP]}-${accountId}-${region}`, {
            env: {
              account: accountId,
              region: region,
            },
            ...this.props,
          }),
        );
      }
    }
  }
  /**
   * synth Account stacks
   */

  private synthAccountStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      this.stacks.set(
        `${this.managementAccount.name}-${region}`,
        new AccountsStack(
          this.app,
          `${AcceleratorStackNames[AcceleratorStage.ACCOUNTS]}-${this.managementAccountId}-${region}`,
          {
            env: {
              account: this.managementAccountId,
              region: region,
            },
            ...this.props,
          },
        ),
      );
    }
  }

  /**
   * Synth Dependencies stacks
   */
  private synthDependenciesStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new DependenciesStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.DEPENDENCIES]}-${accountId}-${region}`,
            {
              env: {
                account: accountId,
                region: region,
              },
              ...this.props,
            },
          ),
        );
      }
    }
  }
}
