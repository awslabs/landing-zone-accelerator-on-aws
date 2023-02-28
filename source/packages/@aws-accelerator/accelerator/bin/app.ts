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
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { IConstruct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils';

import { version } from '../../../../package.json';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { ApplicationsStack } from '../lib/stacks/applications-stack';
import { BootstrapStack } from '../lib/stacks/bootstrap-stack';
import { CustomStack, generateCustomStackMappings, isIncluded } from '../lib/stacks/custom-stack';
import { CustomizationsStack } from '../lib/stacks/customizations-stack';
import { FinalizeStack } from '../lib/stacks/finalize-stack';
import { KeyStack } from '../lib/stacks/key-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkAssociationsGwlbStack } from '../lib/stacks/network-associations-gwlb-stack';
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

const logger = createLogger(['app']);

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
    if (node instanceof cdk.aws_cloudtrail.CfnTrail) {
      node.addPropertyDeletionOverride('InsightSelectors');
      node.addPropertyDeletionOverride('IsOrganizationTrail');
    }
    if (node instanceof cdk.aws_ec2.CfnVPCEndpoint) {
      const ServiceName = node.serviceName.replace('com.amazonaws.us', 'gov.sgov.sc2s.us');
      node.addPropertyOverride('ServiceName', ServiceName);
    }
  }
}

export class IsoOverrides implements cdk.IAspect {
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
    if (node instanceof cdk.aws_cloudtrail.CfnTrail) {
      node.addPropertyDeletionOverride('InsightSelectors');
      node.addPropertyDeletionOverride('IsOrganizationTrail');
    }
    if (node instanceof cdk.aws_ec2.CfnVPCEndpoint) {
      const ServiceName = node.serviceName.replace('com.amazonaws.us', 'gov.ic.c2s.us');
      node.addPropertyOverride('ServiceName', ServiceName);
    }
  }
}

export class CnOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('Tags');
    }
    if (node instanceof cdk.aws_cloudtrail.CfnTrail) {
      node.addPropertyDeletionOverride('IsOrganizationTrail');
    }
  }
}

export class AwsSolutionAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      if (node.cfnResourceType === 'AWS::Lambda::Function') {
        node.addPropertyOverride('Environment.Variables.SOLUTION_ID', `AwsSolution/SO0199/${version}`);
      }
    }
  }
}

// This function is required rather than using an Aspect class for two reasons:
// 1. Some resources do not support tag updates
// 2. Using Aspects for stacks that use the fs.writeFileSync() operation
// causes the application to quit during stack synthesis
function addAcceleratorTags(node: IConstruct, partition: string): void {
  // Current accelerator prefix is static
  const acceleratorPrefix = 'AWSAccelerator';

  // Resource types that do not support tag updates
  const excludeResourceTypes = [
    'AWS::EC2::TransitGatewayRouteTable',
    'AWS::Route53Resolver::FirewallDomainList',
    'AWS::Route53Resolver::ResolverEndpoint',
    'AWS::Route53Resolver::ResolverRule',
  ];

  for (const resource of node.node.findAll()) {
    if (resource instanceof cdk.CfnResource && !excludeResourceTypes.includes(resource.cfnResourceType)) {
      if (resource instanceof cdk.aws_ec2.CfnTransitGateway && partition !== 'aws') {
        continue;
      }
      new cdk.Tag('Accel-P', acceleratorPrefix).visit(resource);
      new cdk.Tag('Accelerator', acceleratorPrefix).visit(resource);
    }
  }
}

async function main() {
  logger.info('Begin Accelerator CDK App');
  const app = new cdk.App();
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
    globalRegion = 'us-isob-east-1';
  }

  if (partition === 'aws-iso') {
    cdk.Aspects.of(app).add(new IsoOverrides());
    globalRegion = 'us-iso-east-1';
  }

  if (partition === 'aws-cn') {
    globalRegion = 'cn-northwest-1';
    cdk.Aspects.of(app).add(new CnOverrides());
  }

  cdk.Aspects.of(app).add(new AwsSolutionAspect());

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

    const configRepositoryName = process.env['ACCELERATOR_CONFIG_REPOSITORY_NAME'] ?? 'aws-accelerator-config';
    const configRepositoryBranchName = process.env['ACCELERATOR_CONFIG_REPOSITORY_BRANCH_NAME'] ?? 'main';

    // Verify ENV vars are set
    if (!sourceRepositoryName || !sourceBranchName) {
      throw new Error(
        'Attempting to deploy pipeline stage and environment variables are not set [ACCELERATOR_REPOSITORY_NAME, ACCELERATOR_REPOSITORY_BRANCH_NAME]',
      );
    }

    const pipelineStack = new PipelineStack(
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
        controlTowerEnabled: process.env['CONTROL_TOWER_ENABLED']!,
        approvalStageNotifyEmailList: process.env['APPROVAL_STAGE_NOTIFY_EMAIL_LIST'],
        partition,
        configRepositoryName,
        configRepositoryBranchName,
      },
    );

    cdk.Aspects.of(pipelineStack).add(new AwsSolutionsChecks());

    NagSuppressions.addStackSuppressions(pipelineStack, [
      { id: 'AwsSolutions-IAM5', reason: 'IAM role requires wildcard permissions.' },
    ]);
  }

  //
  // TESTER Stack
  //
  if (includeStage({ stage: AcceleratorStage.TESTER_PIPELINE, account, region })) {
    if (process.env['ACCELERATOR_REPOSITORY_NAME'] && process.env['ACCELERATOR_REPOSITORY_BRANCH_NAME']) {
      const testerPipelineStack = new TesterPipelineStack(
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
      cdk.Aspects.of(testerPipelineStack).add(new AwsSolutionsChecks());
    }
  }

  if (configDirPath) {
    const globalConfig = GlobalConfig.load(configDirPath);
    let customizationsConfig: CustomizationsConfig;

    // Create empty customizationsConfig if optional configuration file does not exist
    if (fs.existsSync(path.join(configDirPath, 'customizations-config.yaml'))) {
      customizationsConfig = CustomizationsConfig.load(configDirPath);
    } else {
      customizationsConfig = new CustomizationsConfig();
    }

    //
    // Make config repository name
    let configRepoName = 'aws-accelerator-config';
    if (process.env['ACCELERATOR_CONFIG_REPOSITORY_NAME']) {
      configRepoName = process.env['ACCELERATOR_CONFIG_REPOSITORY_NAME'];
    } else {
      if (process.env['ACCELERATOR_QUALIFIER']) {
        configRepoName = `${process.env['ACCELERATOR_QUALIFIER']}-config`;
      }
    }

    //
    // Create properties to be used by AcceleratorStack types
    //
    const props = {
      configDirPath,
      accountsConfig: AccountsConfig.load(configDirPath),
      customizationsConfig: customizationsConfig,
      globalConfig: GlobalConfig.load(configDirPath),
      iamConfig: IamConfig.load(configDirPath),
      networkConfig: NetworkConfig.load(configDirPath),
      organizationConfig: OrganizationConfig.load(configDirPath),
      securityConfig: SecurityConfig.load(configDirPath),
      partition: partition,
      configRepositoryName: configRepoName,
      qualifier: process.env['ACCELERATOR_QUALIFIER'],
      configCommitId: process.env['CONFIG_COMMIT_ID'],
      globalRegion: globalRegion,
      centralizedLoggingRegion: globalConfig.logging.centralizedLoggingRegion ?? globalConfig.homeRegion,
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

    //
    // PREPARE Stack
    //
    if (includeStage({ stage: AcceleratorStage.PREPARE, account: managementAccountId, region: homeRegion })) {
      const prepareStack = new PrepareStack(
        app,
        `${AcceleratorStackNames[AcceleratorStage.PREPARE]}-${managementAccountId}-${homeRegion}`,
        {
          env: {
            account: managementAccountId,
            region: homeRegion,
          },
          description: `(SO0199-prepare) Landing Zone Accelerator on AWS. Version ${version}.`,
          synthesizer: new cdk.DefaultStackSynthesizer({
            generateBootstrapVersionRule: false,
            bucketPrefix: props.globalConfig.centralizeCdkBuckets?.enable ? `${managementAccountId}/` : undefined,
            fileAssetsBucketName: props.globalConfig.centralizeCdkBuckets?.enable
              ? `cdk-accel-assets-${managementAccountId}-${homeRegion}`
              : undefined,
          }),
          terminationProtection: props.globalConfig.terminationProtection ?? true,
          ...props,
        },
      );
      addAcceleratorTags(prepareStack, partition);
      cdk.Aspects.of(prepareStack).add(new AwsSolutionsChecks());
    }

    //
    // FINALIZE Stack
    //
    if (includeStage({ stage: AcceleratorStage.FINALIZE, account: managementAccountId, region: globalRegion })) {
      const finalizeStack = new FinalizeStack(
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
            bucketPrefix: props.globalConfig.centralizeCdkBuckets?.enable ? `${managementAccountId}/` : undefined,
            fileAssetsBucketName: props.globalConfig.centralizeCdkBuckets?.enable
              ? `cdk-accel-assets-${managementAccountId}-${globalRegion}`
              : undefined,
          }),
          terminationProtection: props.globalConfig.terminationProtection ?? true,
          ...props,
        },
      );
      addAcceleratorTags(finalizeStack, partition);
      cdk.Aspects.of(finalizeStack).add(new AwsSolutionsChecks());
    }

    //
    // ACCOUNTS Stack
    //
    if (includeStage({ stage: AcceleratorStage.ACCOUNTS, account: managementAccountId, region: globalRegion })) {
      const accountsStack = new AccountsStack(
        app,
        `${AcceleratorStackNames[AcceleratorStage.ACCOUNTS]}-${managementAccountId}-${globalRegion}`,
        {
          env: {
            account: managementAccountId,
            region: globalRegion,
          },
          description: `(SO0199-accounts) Landing Zone Accelerator on AWS. Version ${version}.`,
          synthesizer: new cdk.DefaultStackSynthesizer({
            generateBootstrapVersionRule: false,
            bucketPrefix: props.globalConfig.centralizeCdkBuckets?.enable ? `${managementAccountId}/` : undefined,
            fileAssetsBucketName: props.globalConfig.centralizeCdkBuckets?.enable
              ? `cdk-accel-assets-${managementAccountId}-${globalRegion}`
              : undefined,
          }),
          terminationProtection: props.globalConfig.terminationProtection ?? true,
          ...props,
        },
      );
      addAcceleratorTags(accountsStack, partition);
      cdk.Aspects.of(accountsStack).add(new AwsSolutionsChecks());
    }

    //
    // ORGANIZATIONS Stack
    //
    for (const enabledRegion of props.globalConfig.enabledRegions) {
      if (
        includeStage({ stage: AcceleratorStage.ORGANIZATIONS, account: managementAccountId, region: enabledRegion })
      ) {
        const organizationStack = new OrganizationsStack(
          app,
          `${AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]}-${managementAccountId}-${enabledRegion}`,
          {
            env: {
              account: managementAccountId,
              region: enabledRegion,
            },
            description: `(SO0199-organizations) Landing Zone Accelerator on AWS. Version ${version}.`,
            synthesizer: new cdk.DefaultStackSynthesizer({
              generateBootstrapVersionRule: false,
              bucketPrefix: props.globalConfig.centralizeCdkBuckets?.enable ? `${managementAccountId}/` : undefined,
              fileAssetsBucketName: props.globalConfig.centralizeCdkBuckets?.enable
                ? `cdk-accel-assets-${managementAccountId}-${enabledRegion}`
                : undefined,
            }),
            terminationProtection: props.globalConfig.terminationProtection ?? true,
            ...props,
          },
        );
        addAcceleratorTags(organizationStack, partition);
        cdk.Aspects.of(organizationStack).add(new AwsSolutionsChecks());
      }
    }
    const auditAccountId = props.accountsConfig.getAuditAccountId();

    // If audit account doesn't exist cannot run the
    // other stacks
    logger.info(`Audit AccountId ${auditAccountId}`);
    //
    // KEY and SECURITY AUDIT Stack
    //
    for (const enabledRegion of props.globalConfig.enabledRegions) {
      if (includeStage({ stage: AcceleratorStage.KEY, account: auditAccountId, region: enabledRegion })) {
        const keyStack = new KeyStack(
          app,
          `${AcceleratorStackNames[AcceleratorStage.KEY]}-${auditAccountId}-${enabledRegion}`,
          {
            env: {
              account: auditAccountId,
              region: enabledRegion,
            },
            description: `(SO0199-key) Landing Zone Accelerator on AWS. Version ${version}.`,
            synthesizer: new cdk.DefaultStackSynthesizer({
              generateBootstrapVersionRule: false,
              bucketPrefix: props.globalConfig.centralizeCdkBuckets?.enable ? `${auditAccountId}/` : undefined,
              fileAssetsBucketName: props.globalConfig.centralizeCdkBuckets?.enable
                ? `cdk-accel-assets-${managementAccountId}-${enabledRegion}`
                : undefined,
            }),
            terminationProtection: props.globalConfig.terminationProtection ?? true,
            ...props,
          },
        );
        addAcceleratorTags(keyStack, partition);
        cdk.Aspects.of(keyStack).add(new AwsSolutionsChecks());
      }

      if (includeStage({ stage: AcceleratorStage.SECURITY_AUDIT, account: auditAccountId, region: enabledRegion })) {
        const auditStack = new SecurityAuditStack(
          app,
          `${AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]}-${auditAccountId}-${enabledRegion}`,
          {
            env: {
              account: auditAccountId,
              region: enabledRegion,
            },
            description: `(SO0199-securityaudit) Landing Zone Accelerator on AWS. Version ${version}.`,
            synthesizer: new cdk.DefaultStackSynthesizer({
              generateBootstrapVersionRule: false,
              bucketPrefix: props.globalConfig.centralizeCdkBuckets?.enable ? `${auditAccountId}/` : undefined,
              fileAssetsBucketName: props.globalConfig.centralizeCdkBuckets?.enable
                ? `cdk-accel-assets-${managementAccountId}-${enabledRegion}`
                : undefined,
            }),
            terminationProtection: props.globalConfig.terminationProtection ?? true,
            ...props,
          },
        );
        addAcceleratorTags(auditStack, partition);
        cdk.Aspects.of(auditStack).add(new AwsSolutionsChecks());
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
        const stackSynthesizerProps = {
          generateBootstrapVersionRule: false,
          bucketPrefix: props.globalConfig.centralizeCdkBuckets?.enable ? `${accountId}/` : undefined,
          fileAssetsBucketName: props.globalConfig.centralizeCdkBuckets?.enable
            ? `cdk-accel-assets-${managementAccountId}-${enabledRegion}`
            : undefined,
        };
        //
        // BOOTSTRAP Stack
        //
        if (includeStage({ stage: AcceleratorStage.BOOTSTRAP, account: accountId, region: enabledRegion })) {
          const bootstrapStack = new BootstrapStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.BOOTSTRAP]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-bootstrap) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(bootstrapStack, partition);
          cdk.Aspects.of(bootstrapStack).add(new AwsSolutionsChecks());
        }

        //
        // LOGGING Stack
        //
        if (includeStage({ stage: AcceleratorStage.LOGGING, account: accountId, region: enabledRegion })) {
          const loggingStack = new LoggingStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.LOGGING]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-logging) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(loggingStack, partition);
          cdk.Aspects.of(loggingStack).add(new AwsSolutionsChecks());
        }

        //
        // SECURITY Stack
        //
        if (includeStage({ stage: AcceleratorStage.SECURITY, account: accountId, region: enabledRegion })) {
          const securityStack = new SecurityStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.SECURITY]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-security) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(securityStack, partition);
          cdk.Aspects.of(securityStack).add(new AwsSolutionsChecks());
        }

        //
        // OPERATIONS Stack
        //
        if (includeStage({ stage: AcceleratorStage.OPERATIONS, account: accountId, region: enabledRegion })) {
          const operationsStack = new OperationsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.OPERATIONS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-operations) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
              accountWarming: accountItem.warm ?? false,
            },
          );
          addAcceleratorTags(operationsStack, partition);
          cdk.Aspects.of(operationsStack).add(new AwsSolutionsChecks());
        }

        //
        // NETWORK PREP Stack
        //
        if (includeStage({ stage: AcceleratorStage.NETWORK_PREP, account: accountId, region: enabledRegion })) {
          const networkPrepStack = new NetworkPrepStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_PREP]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkprep) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(networkPrepStack, partition);
          cdk.Aspects.of(networkPrepStack).add(new AwsSolutionsChecks());
        }

        //
        // SECURITY_RESOURCES Stack
        //
        if (includeStage({ stage: AcceleratorStage.SECURITY_RESOURCES, account: accountId, region: enabledRegion })) {
          const securityResourcesStack = new SecurityResourcesStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.SECURITY_RESOURCES]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-securityresources) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(securityResourcesStack, partition);
          cdk.Aspects.of(securityResourcesStack).add(new AwsSolutionsChecks());
        }

        //
        // CUSTOMIZATIONS Stack
        //
        if (includeStage({ stage: AcceleratorStage.CUSTOMIZATIONS, account: accountId, region: enabledRegion })) {
          const customizationsStack = new CustomizationsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.CUSTOMIZATIONS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-customizations) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          cdk.Aspects.of(customizationsStack).add(new AwsSolutionsChecks());

          if (customizationsConfig?.customizations?.cloudFormationStacks) {
            const customStackList = generateCustomStackMappings(
              props.accountsConfig,
              props.organizationConfig,
              customizationsConfig,
              accountId,
              enabledRegion,
            );

            for (const stack of customStackList ?? []) {
              logger.info(`New custom stack ${stack.stackConfig.name}`);
              stack.stackObj = new CustomStack(app, `${stack.stackConfig.name}-${accountId}-${enabledRegion}`, {
                env,
                description: stack.stackConfig.description,
                runOrder: stack.stackConfig.runOrder,
                stackName: stack.stackConfig.name,
                synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
                templateFile: stack.stackConfig.template,
                terminationProtection: stack.stackConfig.terminationProtection,
                parameters: stack.stackConfig.parameters,
                ...props,
              });

              if (stack.dependsOn) {
                for (const stackName of stack.dependsOn) {
                  const previousStack = customStackList.find(a => a.stackConfig.name == stackName)?.stackObj;
                  if (previousStack) {
                    stack.stackObj.addDependency(previousStack);
                  }
                }
              }
            }
          }
          if (customizationsConfig?.applications) {
            for (const application of customizationsConfig.applications) {
              if (
                isIncluded(
                  application.deploymentTargets,
                  enabledRegion,
                  accountId,
                  props.accountsConfig,
                  props.organizationConfig,
                )
              ) {
                const applicationStackName = `AWSAccelerator-App-${application.name}-${accountId}-${enabledRegion}`;
                const env = {
                  account: accountId,
                  region: enabledRegion,
                };
                const applicationStack = new ApplicationsStack(app, applicationStackName, {
                  env,
                  description: `(SO0199-customizations) Landing Zone Accelerator on AWS. Version ${version}.`,
                  synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
                  terminationProtection: props.globalConfig.terminationProtection ?? true,
                  ...props,
                  appConfigItem: application,
                });
                cdk.Aspects.of(applicationStack).add(new AwsSolutionsChecks());
              }
            }
          }
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
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(vpcStack, partition);
          cdk.Aspects.of(vpcStack).add(new AwsSolutionsChecks());

          const endpointsStack = new NetworkVpcEndpointsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_ENDPOINTS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkendpoints) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(endpointsStack, partition);
          endpointsStack.addDependency(vpcStack);
          cdk.Aspects.of(endpointsStack).add(new AwsSolutionsChecks());

          const dnsStack = new NetworkVpcDnsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkdns) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(dnsStack, partition);
          dnsStack.addDependency(endpointsStack);
          cdk.Aspects.of(dnsStack).add(new AwsSolutionsChecks());
        }

        //
        // NETWORK ASSOCIATIONS Stack
        //
        if (includeStage({ stage: AcceleratorStage.NETWORK_ASSOCIATIONS, account: accountId, region: enabledRegion })) {
          const networkAssociationsStack = new NetworkAssociationsStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkassociations) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(networkAssociationsStack, partition);
          cdk.Aspects.of(networkAssociationsStack).add(new AwsSolutionsChecks());

          const networkGwlbStack = new NetworkAssociationsGwlbStack(
            app,
            `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]}-${accountId}-${enabledRegion}`,
            {
              env,
              description: `(SO0199-networkgwlb) Landing Zone Accelerator on AWS. Version ${version}.`,
              synthesizer: new cdk.DefaultStackSynthesizer(stackSynthesizerProps),
              terminationProtection: props.globalConfig.terminationProtection ?? true,
              ...props,
            },
          );
          addAcceleratorTags(networkGwlbStack, partition);
          cdk.Aspects.of(networkGwlbStack).add(new AwsSolutionsChecks());
        }
      }
    }
  }

  logger.info('End Accelerator CDK App');
}

(async () => {
  try {
    await main();
  } catch (err) {
    logger.error(err);
    throw new Error(`${err}`);
  }
})();
