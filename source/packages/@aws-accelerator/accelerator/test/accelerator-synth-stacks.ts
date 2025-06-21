/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';

import { Stack } from 'aws-cdk-lib';
import { AcceleratorStackNames, AcceleratorV2Stacks } from '../lib/accelerator';
import { AcceleratorAspects } from '../lib/accelerator-aspects';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStack, AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { ApplicationsStack } from '../lib/stacks/applications-stack';
import { BootstrapStack } from '../lib/stacks/bootstrap-stack';
import { CustomStack, generateCustomStackMappings, isIncluded } from '../lib/stacks/custom-stack';
import { CustomizationsStack } from '../lib/stacks/customizations-stack';
import { DependenciesStack } from '../lib/stacks/dependencies-stack/dependencies-stack';
import { FinalizeStack } from '../lib/stacks/finalize-stack';
import { IdentityCenterStack } from '../lib/stacks/identity-center-stack';
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
import { ResourcePolicyEnforcementStack } from '../lib/stacks/resource-policy-enforcement-stack';
import { getV2NetworkResources, getVpcsInScope } from '../lib/stacks/v2-network/utils/functions';
import { VpcBaseStack } from '../lib/stacks/v2-network/stacks/vpc-base-stack';
import { VpcRouteTablesBaseStack } from '../lib/stacks/v2-network/stacks/vpc-route-tables-base-stack';
import { VpcSecurityGroupsBaseStack } from '../lib/stacks/v2-network/stacks/vpc-security-groups-base-stack';
import { VpcSubnetsBaseStack } from '../lib/stacks/v2-network/stacks/vpc-subnets-base-stack';
import { VpcSubnetsShareBaseStack } from '../lib/stacks/v2-network/stacks/vpc-subnets-share-base-stack';
import { VpcNaclsBaseStack } from '../lib/stacks/v2-network/stacks/vp-nacls-base-stack';
import { VpcLoadBalancersBaseStack } from '../lib/stacks/v2-network/stacks/vpc-load-balancers-base-stack';

export class AcceleratorSynthStacks {
  private readonly configFolderName: string;
  private readonly partition: string;
  private readonly configDirPath: string;
  private props: AcceleratorStackProps;
  private readonly app: cdk.App;
  private readonly homeRegion: string;
  private readonly managementAccountId: string;
  private readonly managementAccount: AccountConfig;
  private readonly auditAccountId: string;
  private readonly auditAccount: AccountConfig;
  private readonly stageName: string;
  private readonly globalRegion: string;
  private readonly globalConfig: GlobalConfig;
  private readonly accountsConfig: AccountsConfig;
  private readonly customizationsConfig: CustomizationsConfig;
  private readonly replacementsConfig: ReplacementsConfig;

  public readonly stacks = new Map<string, AcceleratorStack | CustomStack | Stack>();
  constructor(stageName: string, partition: string, globalRegion: string, configFolderName?: string) {
    this.configFolderName = configFolderName ?? 'snapshot-only';
    this.partition = partition;
    this.stageName = stageName;
    this.globalRegion = globalRegion;

    /**
     * Test stack CDK app
     */
    this.app = new cdk.App({
      context: { 'config-dir': path.join(__dirname, `configs/${this.configFolderName}`) },
    });
    new AcceleratorAspects(this.app, this.partition, false);
    this.configDirPath = this.app.node.tryGetContext('config-dir');
    this.accountsConfig = AccountsConfig.load(this.configDirPath);
    // Account IDs and dynamic replacements from SSM are not loaded here
    this.replacementsConfig = ReplacementsConfig.load(this.configDirPath, this.accountsConfig);
    this.globalConfig = GlobalConfig.load(this.configDirPath, this.replacementsConfig);
    // Create empty customizationsConfig if optional configuration file does not exist
    if (fs.existsSync(path.join(this.configDirPath, 'customizations-config.yaml'))) {
      this.customizationsConfig = CustomizationsConfig.load(this.configDirPath, this.replacementsConfig);
    } else {
      this.customizationsConfig = new CustomizationsConfig();
    }

    this.props = this.getProps(false, this.accountsConfig, this.customizationsConfig, this.replacementsConfig);
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

  /**
   * Function to get properties
   * @param v2Props boolean
   * @param accountsConfig {@link AccountsConfig}
   * @param customizationsConfig {@link CustomizationsConfig}
   * @param replacementsConfig {@link ReplacementsConfig}
   * @returns
   */
  private getProps(
    v2Props: boolean,
    accountsConfig: AccountsConfig,
    customizationsConfig: CustomizationsConfig,
    replacementsConfig: ReplacementsConfig,
  ): AcceleratorStackProps {
    let networkConfig = NetworkConfig.load(this.configDirPath, replacementsConfig);
    if (v2Props) {
      const buffer = fs.readFileSync(path.join(this.configDirPath, 'v2-network-config.yaml'), 'utf8');
      networkConfig = NetworkConfig.loadFromString(buffer, replacementsConfig)!;
    }
    this.props = {
      configDirPath: this.configDirPath,
      accountsConfig,
      customizationsConfig,
      globalConfig: this.globalConfig,
      iamConfig: IamConfig.load(this.configDirPath, replacementsConfig),
      networkConfig,
      organizationConfig: OrganizationConfig.load(this.configDirPath, replacementsConfig),
      securityConfig: SecurityConfig.load(this.configDirPath, replacementsConfig),
      replacementsConfig: replacementsConfig,
      partition: this.partition,
      globalRegion: this.globalRegion,
      centralizedLoggingRegion: this.globalConfig.logging.centralizedLoggingRegion ?? this.globalConfig.homeRegion,
      configRepositoryName: 'aws-accelerator-config',
      configRepositoryLocation: 'codecommit',
      prefixes: {
        accelerator: 'AWSAccelerator',
        kmsAlias: 'alias/accelerator',
        bucketName: 'aws-accelerator',
        ssmParamName: '/accelerator',
        importResourcesSsmParamName: '/accelerator/imported-resources',
        snsTopicName: 'aws-accelerator',
        repoName: 'aws-accelerator',
        secretName: '/accelerator',
        trailLogName: 'aws-accelerator',
        databaseName: 'aws-accelerator',
        ssmLogName: 'aws-accelerator',
      },
      enableSingleAccountMode: false,
      useExistingRoles: false,
      centralLogsBucketKmsKeyArn: 'arn:aws:kms:us-east-1:111111111111:key/00000000-0000-0000-0000-000000000000',
      isDiagnosticsPackEnabled: 'Yes',
      pipelineAccountId: '111111111111',
      installerStackName: 'AWSAccelerator-InstallerStack',
    };

    return this.props;
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
      case AcceleratorStage.IDENTITY_CENTER:
        this.synthIdentityCenterStacks();
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
      case AcceleratorStage.RESOURCE_POLICY_ENFORCEMENT:
        this.synthResourcePolicyEnforcementStacks();
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
   * Synth V2 Network VPC stacks
   * @returns
   */
  public synthV2NetworkVpcStacks() {
    if (!this.props.globalConfig.useV2Stacks) {
      return;
    }

    if (this.configFolderName !== 'snapshot-only') {
      return;
    }

    this.saveStackTemplate(`${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}`);
    this.copySynthesizedTemplates();

    // Create separate CDK app for V2 synthesis
    const v2App = new cdk.App({
      context: { 'config-dir': this.configDirPath },
    });
    new AcceleratorAspects(v2App, this.partition, false);

    this.props = this.getProps(true, this.accountsConfig, this.customizationsConfig, this.replacementsConfig);

    for (const enabledRegion of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        const vpcsInScope = getVpcsInScope(this.props.networkConfig, this.props.accountsConfig, {
          accountId,
          region: enabledRegion,
        });
        const v2NetworkResources = getV2NetworkResources(
          vpcsInScope,
          this.props.globalConfig,
          this.props.accountsConfig,
          this.props.networkConfig,
          this.props.prefixes.accelerator,
          {
            accountId,
            region: enabledRegion,
            stackName: `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${enabledRegion}`,
          },
        );

        for (const vpcItem of vpcsInScope) {
          const sanitizedVpcName = vpcItem.name.replace(/[^A-Za-z0-9-]/g, '-');
          this.stacks.set(
            `VpcStack-${account.name}-${enabledRegion}-${sanitizedVpcName}`,
            new VpcBaseStack(
              v2App,
              `${
                AcceleratorStackNames[AcceleratorV2Stacks.VPC_STACK]
              }-${sanitizedVpcName}-${accountId}-${enabledRegion}`,
              {
                env: {
                  account: accountId,
                  region: enabledRegion,
                },
                ...this.props,
                vpcConfig: vpcItem,
                vpcStack: true,
                v2NetworkResources,
              },
            ),
          );

          this.stacks.set(
            `RouteTableStack-${account.name}-${enabledRegion}-${sanitizedVpcName}`,
            new VpcRouteTablesBaseStack(
              v2App,
              `${
                AcceleratorStackNames[AcceleratorV2Stacks.ROUTE_TABLES_STACK]
              }-${sanitizedVpcName}-${accountId}-${enabledRegion}`,
              {
                env: {
                  account: accountId,
                  region: enabledRegion,
                },
                ...this.props,
                vpcConfig: vpcItem,
                vpcStack: false,
                v2NetworkResources,
              },
            ),
          );

          this.stacks.set(
            `SecurityGroupStack-${account.name}-${enabledRegion}-${sanitizedVpcName}`,
            new VpcSecurityGroupsBaseStack(
              v2App,
              `${
                AcceleratorStackNames[AcceleratorV2Stacks.SECURITY_GROUPS_STACK]
              }-${sanitizedVpcName}-${accountId}-${enabledRegion}`,
              {
                env: {
                  account: accountId,
                  region: enabledRegion,
                },
                ...this.props,
                vpcConfig: vpcItem,
                vpcStack: false,
                v2NetworkResources,
              },
            ),
          );

          this.stacks.set(
            `SubnetStack-${account.name}-${enabledRegion}-${sanitizedVpcName}`,
            new VpcSubnetsBaseStack(
              v2App,
              `${
                AcceleratorStackNames[AcceleratorV2Stacks.SUBNETS_STACK]
              }-${sanitizedVpcName}-${accountId}-${enabledRegion}`,
              {
                env: {
                  account: accountId,
                  region: enabledRegion,
                },
                ...this.props,
                vpcConfig: vpcItem,
                vpcStack: false,
                v2NetworkResources,
              },
            ),
          );

          this.stacks.set(
            `SubnetShareStack-${account.name}-${enabledRegion}-${sanitizedVpcName}`,
            new VpcSubnetsShareBaseStack(
              v2App,
              `${
                AcceleratorStackNames[AcceleratorV2Stacks.SUBNETS_SHARE_STACK]
              }-${sanitizedVpcName}-${accountId}-${enabledRegion}`,
              {
                env: {
                  account: accountId,
                  region: enabledRegion,
                },
                ...this.props,
                vpcConfig: vpcItem,
                vpcStack: false,
                v2NetworkResources,
              },
            ),
          );

          this.stacks.set(
            `NackStack-${account.name}-${enabledRegion}-${sanitizedVpcName}`,
            new VpcNaclsBaseStack(
              v2App,
              `${
                AcceleratorStackNames[AcceleratorV2Stacks.NACLS_STACK]
              }-${sanitizedVpcName}-${accountId}-${enabledRegion}`,
              {
                env: {
                  account: accountId,
                  region: enabledRegion,
                },
                ...this.props,
                vpcConfig: vpcItem,
                vpcStack: false,
                v2NetworkResources,
              },
            ),
          );

          this.stacks.set(
            `LbStack-${account.name}-${enabledRegion}-${sanitizedVpcName}`,
            new VpcLoadBalancersBaseStack(
              v2App,
              `${
                AcceleratorStackNames[AcceleratorV2Stacks.LB_STACK]
              }-${sanitizedVpcName}-${accountId}-${enabledRegion}`,
              {
                env: {
                  account: accountId,
                  region: enabledRegion,
                },
                ...this.props,
                vpcConfig: vpcItem,
                vpcStack: false,
                v2NetworkResources,
              },
            ),
          );
        }
      }

      this.props.networkConfig.vpcs.pop();
    }

    // reset the props
    this.props = this.getProps(false, this.accountsConfig, this.customizationsConfig, this.replacementsConfig);
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
   * synth IdentityCenter stacks
   */
  private synthIdentityCenterStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new IdentityCenterStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.IDENTITY_CENTER]}-${accountId}-${region}`,
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
   * synth ResourcePolicyEnforcementStack
   */
  private synthResourcePolicyEnforcementStacks() {
    for (const region of this.props.globalConfig.enabledRegions) {
      for (const account of [
        ...this.props.accountsConfig.mandatoryAccounts,
        ...this.props.accountsConfig.workloadAccounts,
      ]) {
        const accountId = this.props.accountsConfig.getAccountId(account.name);
        this.stacks.set(
          `${account.name}-${region}`,
          new ResourcePolicyEnforcementStack(
            this.app,
            `${AcceleratorStackNames[AcceleratorStage.RESOURCE_POLICY_ENFORCEMENT]}-${accountId}-${region}`,
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

  private async copySynthesizedTemplates() {
    const sourcePath = path.join(__dirname, `configs/${this.configFolderName}/synthesized-cfn-templates`);
    const destinationPath = path.join(__dirname, '../cfn-templates');
    console.log(`Copying synthesized templates from ${sourcePath} into ${destinationPath} path.`);
    const sourcePathExists = fs.existsSync(sourcePath);
    if (sourcePathExists) {
      fs.cpSync(sourcePath, destinationPath, { recursive: true });
      fs.rmSync(sourcePath, { recursive: true, force: true });
    }
  }

  /**
   * Function to save the templates for V2 stack snapshot test
   *
   * @description
   * Use this function during development to generate template to be used for future V2 stack snapshot test
   * @param stackPrefix string
   */
  public async saveStackTemplate(stackPrefix: string) {
    for (const [key, stack] of this.stacks) {
      if (stack.stackName.startsWith(stackPrefix)) {
        console.log(`Saving stack ${stack.stackName} template. Stack key is ${key}`);
        const outputDir = `${this.configDirPath}/synthesized-cfn-templates/${stack.account}/${stack.region}`;
        console.log(`Getting template for stack ${stack.stackName}`);
        const template = this.app.synth().getStackByName(stack.stackName).template;
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(path.join(outputDir, `${stack.stackName}.json`), JSON.stringify(template, null, 2));
        this.app.synth().getStackByName(stack.stackName).template;
      }
    }
  }
}
