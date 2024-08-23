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

import { ASEAMapping, AseaResourceMapping, GlobalConfig } from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { IConstruct } from 'constructs';
import { version } from '../../../../package.json';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
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
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { PrepareStack } from '../lib/stacks/prepare-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
import { SecurityResourcesStack } from '../lib/stacks/security-resources-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { TesterPipelineStack } from '../lib/stacks/tester-pipeline-stack';
import { AcceleratorContext, AcceleratorEnvironment, AcceleratorResourcePrefixes } from './app-utils';
import { ImportAseaResourcesStack } from '../lib/stacks/import-asea-resources-stack';
import { AcceleratorAspects, PermissionsBoundaryAspect } from '../lib/accelerator-aspects';
import { ResourcePolicyEnforcementStack } from '../lib/stacks/resource-policy-enforcement-stack';
import { DiagnosticsPackStack } from '../lib/stacks/diagnostics-pack-stack';
import { AcceleratorToolkit } from '../lib/toolkit';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { ControlTowerClient, ListLandingZonesCommand } from '@aws-sdk/client-controltower';

const logger = createLogger(['stack-utils']);
/**
 * This function returns a CDK stack synthesizer based on configuration options
 * @param props
 * @param accountId
 * @param region
 * @returns
 */
function getStackSynthesizer(
  props: AcceleratorStackProps,
  accountId: string,
  region: string,
  stage: string | undefined = undefined,
) {
  const customDeploymentRole = props.globalConfig.cdkOptions?.customDeploymentRole;
  const managementAccountId = props.accountsConfig.getManagementAccountId();
  const centralizeBuckets =
    props.globalConfig.centralizeCdkBuckets?.enable || props.globalConfig.cdkOptions?.centralizeBuckets;
  const fileAssetBucketName = centralizeBuckets ? `cdk-accel-assets-${managementAccountId}-${region}` : undefined;
  const bucketPrefix = centralizeBuckets ? `${accountId}/` : undefined;
  if (customDeploymentRole && !isBeforeBootstrapStage(stage)) {
    logger.info(
      `Stack in account ${accountId} and region ${region} using Custom deployment role ${customDeploymentRole}`,
    );
    const customDeploymentRoleArn = `arn:${props.partition}:iam::${accountId}:role/${customDeploymentRole}`;

    return new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
      bucketPrefix: bucketPrefix,
      fileAssetsBucketName: fileAssetBucketName,
      cloudFormationExecutionRole: customDeploymentRoleArn,
      deployRoleArn: customDeploymentRoleArn,
      fileAssetPublishingRoleArn: customDeploymentRoleArn,
      lookupRoleArn: customDeploymentRoleArn,
      imageAssetPublishingRoleArn: customDeploymentRoleArn,
    });
  }
  if (props.globalConfig.cdkOptions?.useManagementAccessRole) {
    logger.info(`Stack in account ${accountId} and region ${region} using CliCredentialSynthesizer`);
    return new cdk.CliCredentialsStackSynthesizer({
      bucketPrefix: bucketPrefix,
      fileAssetsBucketName: fileAssetBucketName,
    });
  } else {
    logger.info(`Stack in account ${accountId} and region ${region} using DefaultSynthesizer`);
    return new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
      bucketPrefix: bucketPrefix,
      fileAssetsBucketName: fileAssetBucketName,
    });
  }
}

/**
 * This function returns a CDK stack synthesizer based on configuration options
 * @param props
 * @param accountId
 * @param region
 * @param bootstrapAccountId
 * @param qualifier
 * @param roleName
 * @returns
 */
function getAseaStackSynthesizer(props: {
  accelProps: AcceleratorStackProps;
  accountId: string;
  region: string;
  qualifier?: string;
  roleName?: string;
}) {
  const { accountId, region, qualifier, roleName, accelProps } = props;
  const managementAccountId = accelProps.accountsConfig.getManagementAccountId();
  const centralizeBuckets =
    accelProps.globalConfig.centralizeCdkBuckets?.enable || accelProps.globalConfig.cdkOptions?.centralizeBuckets;
  const fileAssetsBucketName = centralizeBuckets ? `cdk-accel-assets-${managementAccountId}-${region}` : undefined;
  const bucketPrefix = `${accountId}/`;

  if (accelProps.globalConfig.cdkOptions?.useManagementAccessRole) {
    logger.info(`Stack in account ${accountId} and region ${region} using CliCredentialSynthesizer`);
    return new cdk.CliCredentialsStackSynthesizer({
      bucketPrefix,
      fileAssetsBucketName,
      qualifier,
    });
  } else {
    logger.info(`Stack in account ${accountId} and region ${region} using DefaultSynthesizer`, roleName);
    const executionRoleArn = `arn:aws:iam::${accountId}:role/${roleName!}`;
    return new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
      bucketPrefix,
      fileAssetsBucketName,
      qualifier,
      cloudFormationExecutionRole: executionRoleArn,
      deployRoleArn: executionRoleArn,
      fileAssetPublishingRoleArn: executionRoleArn,
      imageAssetPublishingRoleArn: executionRoleArn,
    });
  }
}

/**
 * This function is required rather than using an Aspect class for two reasons:
 * 1. Some resources do not support tag updates
 * 2. Using Aspects for stacks that use the fs.writeFileSync() operation
 * causes the application to quit during stack synthesis
 * @param node
 * @param partition
 * @param globalConfig
 * @param acceleratorPrefix
 */
function addAcceleratorTags(
  node: IConstruct,
  partition: string,
  globalConfig: GlobalConfig,
  acceleratorPrefix: string,
): void {
  if (partition === 'aws-iso' || partition === 'aws-iso-b') {
    return;
  }
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
      if (resource.cfnResourceType === 'AWS::EC2::SecurityGroup') {
        new cdk.Tag('Accel-P', acceleratorPrefix).visit(resource);
      }
      new cdk.Tag('Accelerator', acceleratorPrefix).visit(resource);

      if (globalConfig?.tags) {
        globalConfig.tags.forEach(t => {
          new cdk.Tag(t.key, t.value).visit(resource);
        });
      }
    }
  }
}

/**
 * Compares app context with stack environment and returns a boolean value
 * based on whether or not a given stack should be synthesized
 * @param context
 * @param props
 * @returns
 */
export function includeStage(
  context: AcceleratorContext,
  props: { stage: string; account?: string; region?: string },
): boolean {
  if (!context.stage) {
    // Do not include PIPELINE or TESTER_PIPELINE in full synth/diff
    if (['pipeline', 'tester-pipeline'].includes(props.stage)) {
      return false;
    }
    return true; // No stage, return all other stacks
  }
  if (context.stage === props.stage) {
    if (!context.account && !context.region) {
      return true; // No account or region, return all stacks for synth/diff
    }
    if (props.account === context.account && props.region === context.region) {
      return true;
    }
  }
  return false;
}

/**
 * Create Pipeline Stack
 * @param app
 * @param context
 * @param acceleratorEnv
 * @param resourcePrefixes
 */
export async function createPipelineStack(
  app: cdk.App,
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  resourcePrefixes: AcceleratorResourcePrefixes,
  useExistingRoles: boolean,
) {
  if (includeStage(context, { stage: AcceleratorStage.PIPELINE, account: context.account, region: context.region })) {
    const pipelineStackName = AcceleratorToolkit.getNonConfigDependentStackName(AcceleratorStage.PIPELINE, {
      stage: context.stage!,
      accountId: context.account!,
      region: context.region!,
    });
    // get existing CT details only when Control Tower is enabled
    let landingZoneIdentifier: string | undefined;
    if (acceleratorEnv.controlTowerEnabled === 'Yes' && !acceleratorEnv.enableSingleAccountMode) {
      //
      // Get Management account credentials
      //
      const solutionId = `AwsSolution/SO0199/${version}`;
      const managementAccountCredentials = await getManagementAccountCredentials(
        context.partition,
        context.region!,
        solutionId,
      );

      landingZoneIdentifier = await getLandingZoneIdentifier(undefined, {
        homeRegion: context.region!,
        solutionId,
        credentials: managementAccountCredentials,
      });
    }

    const pipelineStack = new PipelineStack(app, pipelineStackName, {
      env: { account: context.account, region: context.region },
      description: `(SO0199-pipeline) Landing Zone Accelerator on AWS. Version ${version}.`,
      terminationProtection: true,
      partition: context.partition,
      prefixes: resourcePrefixes,
      useExistingRoles,
      ...acceleratorEnv,
      landingZoneIdentifier,
    });
    cdk.Aspects.of(pipelineStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(pipelineStack).add(new PermissionsBoundaryAspect(context.account!, context.partition));

    NagSuppressions.addStackSuppressions(pipelineStack, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'IAM role requires wildcard permissions.',
      },
    ]);
  }
}

/**
 * Create Tester Pipeline Stack
 * @param rootApp
 * @param context
 * @param acceleratorEnv
 * @param resourcePrefixes
 */
export function createTesterStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  resourcePrefixes: AcceleratorResourcePrefixes,
) {
  if (
    includeStage(context, { stage: AcceleratorStage.TESTER_PIPELINE, account: context.account, region: context.region })
  ) {
    if (acceleratorEnv.managementCrossAccountRoleName) {
      checkRootApp(rootApp);
      const testerPipelineStackName = AcceleratorToolkit.getNonConfigDependentStackName(
        AcceleratorStage.TESTER_PIPELINE,
        {
          stage: context.stage!,
          accountId: context.account!,
          region: context.region!,
        },
      );
      const app = new cdk.App({
        outdir: `cdk.out/${testerPipelineStackName}`,
      });
      const testerPipelineStack = new TesterPipelineStack(app, testerPipelineStackName, {
        env: { account: context.account, region: context.region },
        description: `(SO0199-tester) Landing Zone Accelerator on AWS. Version ${version}.`,
        terminationProtection: true,
        prefixes: resourcePrefixes,
        managementCrossAccountRoleName: acceleratorEnv.managementCrossAccountRoleName,
        ...acceleratorEnv,
      });
      cdk.Aspects.of(testerPipelineStack).add(new AwsSolutionsChecks());
      new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
    }
  }
}

/**
 * Create Diagnostics Pack Stack
 * @param rootApp
 * @param context
 * @param props
 * @param accountId
 * @param homeRegion
 */
export function createDiagnosticsPackStack(
  app: cdk.App,
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  resourcePrefixes: AcceleratorResourcePrefixes,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.DIAGNOSTICS_PACK,
      account: context.account,
      region: context.region,
    })
  ) {
    const diagnosticsPackStackName = AcceleratorToolkit.getNonConfigDependentStackName(
      AcceleratorStage.DIAGNOSTICS_PACK,
      {
        stage: context.stage!,
        accountId: context.account!,
        region: context.region!,
      },
    );
    const diagnosticsPackStack = new DiagnosticsPackStack(app, diagnosticsPackStackName, {
      env: { account: context.account, region: context.region },
      description: `(SO0199-pipeline) Landing Zone Accelerator on AWS. Version ${version}.`,
      terminationProtection: true,
      acceleratorPrefix: resourcePrefixes.accelerator,
      ssmParamPrefix: resourcePrefixes.ssmParamName,
      bucketNamePrefix: resourcePrefixes.bucketName,
      installerStackName: acceleratorEnv.installerStackName,
      configRepositoryName: acceleratorEnv.configRepositoryName,
      qualifier: acceleratorEnv.qualifier,
    });
    cdk.Aspects.of(diagnosticsPackStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(diagnosticsPackStack).add(new PermissionsBoundaryAspect(context.account!, context.partition));
  }
}

/**
 * Create Prepare Stack
 * @param rootApp
 * @param context
 * @param props
 * @param managementAccountId
 * @param homeRegion
 */
export function createPrepareStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  homeRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.PREPARE,
      account: managementAccountId,
      region: homeRegion,
    })
  ) {
    checkRootApp(rootApp);
    const prepareStackName = `${AcceleratorStackNames[AcceleratorStage.PREPARE]}-${managementAccountId}-${homeRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${prepareStackName}`,
    });
    const prepareStack = new PrepareStack(app, `${prepareStackName}`, {
      env: {
        account: managementAccountId,
        region: homeRegion,
      },
      description: `(SO0199-prepare) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, managementAccountId, homeRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(prepareStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(prepareStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(prepareStack).add(new PermissionsBoundaryAspect(managementAccountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Finalize Stack
 * @param rootApp
 * @param context
 * @param props
 * @param managementAccountId
 * @param globalRegion
 */
export function createFinalizeStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  globalRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.FINALIZE,
      account: managementAccountId,
      region: globalRegion,
    })
  ) {
    checkRootApp(rootApp);
    const finalizeStackName = `${
      AcceleratorStackNames[AcceleratorStage.FINALIZE]
    }-${managementAccountId}-${globalRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${finalizeStackName}`,
    });
    const finalizeStack = new FinalizeStack(app, `${finalizeStackName}`, {
      env: {
        account: managementAccountId,
        region: globalRegion,
      },
      description: `(SO0199-finalize) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, managementAccountId, globalRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(finalizeStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(finalizeStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(finalizeStack).add(new PermissionsBoundaryAspect(managementAccountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Accounts Stack
 * @param rootApp
 * @param context
 * @param props
 * @param managementAccountId
 * @param globalRegion
 */
export function createAccountsStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  globalRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.ACCOUNTS,
      account: managementAccountId,
      region: globalRegion,
    })
  ) {
    checkRootApp(rootApp);
    const accountsStackName = `${
      AcceleratorStackNames[AcceleratorStage.ACCOUNTS]
    }-${managementAccountId}-${globalRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${accountsStackName}`,
    });
    const accountsStack = new AccountsStack(app, `${accountsStackName}`, {
      env: {
        account: managementAccountId,
        region: globalRegion,
      },
      description: `(SO0199-accounts) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, managementAccountId, globalRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(accountsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(accountsStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(accountsStack).add(new PermissionsBoundaryAspect(managementAccountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Organizations Stack
 * @param rootApp
 * @param context
 * @param props
 * @param managementAccountId
 * @param enabledRegion
 */
export function createOrganizationsStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.ORGANIZATIONS,
      account: managementAccountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const organizationStackName = `${
      AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]
    }-${managementAccountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${organizationStackName}`,
    });
    const organizationStack = new OrganizationsStack(app, `${organizationStackName}`, {
      env: {
        account: managementAccountId,
        region: enabledRegion,
      },
      description: `(SO0199-organizations) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, managementAccountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(organizationStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(organizationStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(organizationStack).add(new PermissionsBoundaryAspect(managementAccountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Security Audit Stack
 * @param rootApp
 * @param context
 * @param props
 * @param auditAccountId
 * @param enabledRegion
 */
export function createSecurityAuditStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  auditAccountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.SECURITY_AUDIT,
      account: auditAccountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const securityAuditStackName = `${
      AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]
    }-${auditAccountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${securityAuditStackName}`,
    });
    const auditStack = new SecurityAuditStack(app, `${securityAuditStackName}`, {
      env: {
        account: auditAccountId,
        region: enabledRegion,
      },
      description: `(SO0199-securityaudit) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, auditAccountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(auditStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(auditStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(auditStack).add(new PermissionsBoundaryAspect(auditAccountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Creates the Key and Dependencies Stacks
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createKeyDependencyStacks(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.KEY,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const keyStackName = `${AcceleratorStackNames[AcceleratorStage.KEY]}-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${keyStackName}`,
    });
    const keyStack = new KeyStack(app, `${keyStackName}`, {
      env,
      description: `(SO0199-key) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(keyStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(keyStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(keyStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);

    const dependencyStackName = `${AcceleratorStackNames[AcceleratorStage.DEPENDENCIES]}-${accountId}-${enabledRegion}`;
    const appDependency = new cdk.App({
      outdir: `cdk.out/${dependencyStackName}`,
    });
    const dependencyStack = new DependenciesStack(appDependency, `${dependencyStackName}`, {
      env,
      description: `(SO0199-dependencies) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(dependencyStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(dependencyStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(dependencyStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(appDependency, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Bootstrap Stack
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createBootstrapStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.BOOTSTRAP,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const bootstrapStackName = `${AcceleratorStackNames[AcceleratorStage.BOOTSTRAP]}-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${bootstrapStackName}`,
    });
    const bootstrapStack = new BootstrapStack(app, `${bootstrapStackName}`, {
      env,
      description: `(SO0199-bootstrap) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(bootstrapStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(bootstrapStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(bootstrapStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Logging Stack
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createLoggingStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.LOGGING,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const loggingStackName = `${AcceleratorStackNames[AcceleratorStage.LOGGING]}-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${loggingStackName}`,
    });
    const loggingStack = new LoggingStack(app, `${loggingStackName}`, {
      env,
      description: `(SO0199-logging) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(loggingStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(loggingStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(loggingStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Security Stack
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createSecurityStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.SECURITY,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const securityStackName = `${AcceleratorStackNames[AcceleratorStage.SECURITY]}-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${securityStackName}`,
    });
    const securityStack = new SecurityStack(app, `${securityStackName}`, {
      env,
      description: `(SO0199-security) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(securityStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(securityStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(securityStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Operations Stack
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 * @param accountWarming
 */
export function createOperationsStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
  accountWarming: boolean,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.OPERATIONS,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const operationsStackName = `${AcceleratorStackNames[AcceleratorStage.OPERATIONS]}-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${operationsStackName}`,
    });
    const operationsStack = new OperationsStack(app, `${operationsStackName}`, {
      env,
      description: `(SO0199-operations) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
      accountWarming,
    });
    addAcceleratorTags(operationsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(operationsStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(operationsStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Identity-Center Stack
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 * @param accountWarming
 */
export function createIdentityCenterStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  accountId: string,
  homeRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.IDENTITY_CENTER,
      account: accountId,
      region: homeRegion,
    })
  ) {
    checkRootApp(rootApp);
    const identityCenterStackName = `${
      AcceleratorStackNames[AcceleratorStage.IDENTITY_CENTER]
    }-${accountId}-${homeRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${identityCenterStackName}`,
    });
    const identityCenterStack = new IdentityCenterStack(app, `${identityCenterStackName}`, {
      env: {
        account: accountId,
        region: homeRegion,
      },
      description: `(SO0199-identitycenter) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, homeRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(identityCenterStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(identityCenterStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(identityCenterStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Network Prep Stack
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createNetworkPrepStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.NETWORK_PREP,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const networkPrepStackName = `${
      AcceleratorStackNames[AcceleratorStage.NETWORK_PREP]
    }-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${networkPrepStackName}`,
    });
    const networkPrepStack = new NetworkPrepStack(app, `${networkPrepStackName}`, {
      env,
      description: `(SO0199-networkprep) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(networkPrepStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(networkPrepStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(networkPrepStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create Security Resources Stack
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createSecurityResourcesStack(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.SECURITY_RESOURCES,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const securityResourcesStackName = `${
      AcceleratorStackNames[AcceleratorStage.SECURITY_RESOURCES]
    }-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${securityResourcesStackName}`,
    });
    const securityResourcesStack = new SecurityResourcesStack(app, `${securityResourcesStackName}`, {
      env,
      description: `(SO0199-securityresources) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(securityResourcesStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(securityResourcesStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(securityResourcesStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create all Network VPC stage stacks
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createNetworkVpcStacks(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.NETWORK_VPC,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const dnsStackName = `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${accountId}-${enabledRegion}`;

    const app = new cdk.App({
      outdir: `cdk.out/${dnsStackName}`,
    });
    const vpcStack = new NetworkVpcStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkvpc) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(vpcStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(vpcStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(vpcStack).add(new PermissionsBoundaryAspect(accountId, context.partition));

    const endpointsStack = new NetworkVpcEndpointsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_ENDPOINTS]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkendpoints) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(endpointsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    endpointsStack.addDependency(vpcStack);
    cdk.Aspects.of(endpointsStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(endpointsStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    const dnsStack = new NetworkVpcDnsStack(app, `${dnsStackName}`, {
      env,
      description: `(SO0199-networkdns) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(dnsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    dnsStack.addDependency(endpointsStack);
    cdk.Aspects.of(dnsStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(dnsStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create all Network Associations stage stacks
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createNetworkAssociationsStacks(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.NETWORK_ASSOCIATIONS,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const networkAssociationsStackName = `${
      AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]
    }-${accountId}-${enabledRegion}`;
    const networkGwlbStackName = `${
      AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]
    }-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${networkGwlbStackName}`,
    });

    const networkAssociationsStack = new NetworkAssociationsStack(app, `${networkAssociationsStackName}`, {
      env,
      description: `(SO0199-networkassociations) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(networkAssociationsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(networkAssociationsStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(networkAssociationsStack).add(new PermissionsBoundaryAspect(accountId, context.partition));

    const networkGwlbStack = new NetworkAssociationsGwlbStack(app, networkGwlbStackName, {
      env,
      description: `(SO0199-networkgwlb) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(networkGwlbStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    // Since shared security groups are created in networkAssociations. NetworkGwlbStack depends on NetworkAssociationsStack
    networkGwlbStack.addDependency(networkAssociationsStack);
    cdk.Aspects.of(networkGwlbStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(networkAssociationsStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Create all Customizations stage stacks
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createCustomizationsStacks(
  rootApp: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.CUSTOMIZATIONS,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    checkRootApp(rootApp);
    const customizationsStackName = `${
      AcceleratorStackNames[AcceleratorStage.CUSTOMIZATIONS]
    }-${accountId}-${enabledRegion}`;
    const app = new cdk.App({
      outdir: `cdk.out/${customizationsStackName}`,
    });
    const customizationsStack = new CustomizationsStack(app, `${customizationsStackName}`, {
      env,
      description: `(SO0199-customizations) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    cdk.Aspects.of(customizationsStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(customizationsStack).add(new PermissionsBoundaryAspect(accountId, context.partition));

    createCustomStacks(app, props, env, accountId, enabledRegion);

    createApplicationsStacks(app, context, props, env, accountId, enabledRegion);
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);

    const resourcePolicyEnforcementStackName = `${
      AcceleratorStackNames[AcceleratorStage.RESOURCE_POLICY_ENFORCEMENT]
    }-${accountId}-${enabledRegion}`;

    const resourcePolicyEnforcementStack = new ResourcePolicyEnforcementStack(
      app,
      `${resourcePolicyEnforcementStackName}`,
      {
        env,
        description: `(SO0199-resource-policy-enforcement) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(
      resourcePolicyEnforcementStack,
      context.partition,
      props.globalConfig,
      props.prefixes.accelerator,
    );
    cdk.Aspects.of(resourcePolicyEnforcementStack).add(new AwsSolutionsChecks());
    cdk.Aspects.of(resourcePolicyEnforcementStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
    new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
  }
}

/**
 * Import ASEA CloudFormation stacks manage resources using LZA CDK App
 * @param rootApp
 * @param context
 * @param props
 * @param accountId
 * @param enabledRegion
 * @returns
 */
export async function importAseaResourceStack(
  rootApp: cdk.App,
  rootContext: AcceleratorContext,
  props: AcceleratorStackProps,
  accountId: string,
  enabledRegion: string,
) {
  if (
    (!includeStage(rootContext, {
      stage: AcceleratorStage.IMPORT_ASEA_RESOURCES,
      account: accountId,
      region: enabledRegion,
    }) &&
      !includeStage(rootContext, {
        stage: AcceleratorStage.POST_IMPORT_ASEA_RESOURCES,
        account: accountId,
        region: enabledRegion,
      })) ||
    !props.globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources
  ) {
    return;
  }
  // Since we use different apps and stacks are not part of rootApp, adding empty stack
  // to app to avoid command failure for no stacks in app
  checkRootApp(rootApp);
  const aseaStackMap = props.globalConfig.externalLandingZoneResources?.templateMap;
  const acceleratorPrefix = props.globalConfig.externalLandingZoneResources?.acceleratorPrefix;

  if (!aseaStackMap) {
    logger.error(`Could not load asea mapping file from externalLandingZoneResources in global config`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  if (!acceleratorPrefix) {
    logger.error(`Could not load accelerator prefix from externalLandingZoneResources in global config`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  const resourceMapping: AseaResourceMapping[] = [];
  for (const phase of ['-1', '0', '1', '2', '3', '4', '5']) {
    const app = new cdk.App({
      outdir: `cdk.out/phase${phase}-${accountId}-${enabledRegion}`,
    });
    const importStackPromises = [];
    const stacksByPhase: ASEAMapping[] = [];
    Object.keys(aseaStackMap).forEach(key => {
      if (
        aseaStackMap[key].accountId === accountId &&
        aseaStackMap[key].region === enabledRegion &&
        aseaStackMap[key].phase === phase
      ) {
        stacksByPhase.push(aseaStackMap[key]);
      }
    });
    if (stacksByPhase.length === 0) {
      logger.warn(`No ASEA stack found for account ${accountId} in region ${enabledRegion} for ${phase}`);
      continue;
    }
    const synthesizer = getAseaStackSynthesizer({
      accelProps: props,
      accountId,
      region: enabledRegion,
      roleName: props.globalConfig.cdkOptions.customDeploymentRole || `${acceleratorPrefix}-PipelineRole`,
    });
    for (const aseaStack of stacksByPhase) {
      importStackPromises.push(
        ImportAseaResourcesStack.init(app, aseaStack.stackName, {
          ...props,
          stackName: aseaStack.stackName,
          synthesizer,
          terminationProtection: props.globalConfig.terminationProtection ?? true,
          stackInfo: aseaStack,
          mapping: aseaStackMap,
          env: {
            account: accountId,
            region: enabledRegion,
          },
          stage: rootContext.stage! as
            | AcceleratorStage.IMPORT_ASEA_RESOURCES
            | AcceleratorStage.POST_IMPORT_ASEA_RESOURCES,
        }),
      );
    }
    const resourceMappings = await Promise.all(importStackPromises);
    const saveResourceMappingPromises = [];
    for (const mapping of resourceMappings) {
      saveResourceMappingPromises.push(mapping.saveLocalResourceFile());
      resourceMapping.push(...mapping.resourceMapping);
    }
    await Promise.all(saveResourceMappingPromises);
    saveResourceMappingPromises.length = 0;
  }
  return resourceMapping;
}

/**
 * Saves Consolidated ASEA Resources from resource mapping
 * @param context
 * @param props
 * @param resources
 */
export async function saveAseaResourceMapping(
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  resources: AseaResourceMapping[],
) {
  if (
    context.stage &&
    (context.stage === AcceleratorStage.IMPORT_ASEA_RESOURCES ||
      context.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES)
  ) {
    await props.globalConfig.saveAseaResourceMapping(resources);
  }
}

/**
 * Create custom CloudFormation stacks
 * @param app
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
function createCustomStacks(
  app: cdk.App,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (props.customizationsConfig?.customizations?.cloudFormationStacks) {
    const customStackList = generateCustomStackMappings(
      props.accountsConfig,
      props.organizationConfig,
      props.customizationsConfig,
      accountId,
      enabledRegion,
    );
    for (const stack of customStackList ?? []) {
      logger.info(`New custom stack ${stack.stackConfig.name}`);
      const customStackName = `${stack.stackConfig.name}-${accountId}-${enabledRegion}`;
      stack.stackObj = new CustomStack(app, `${customStackName}`, {
        env,
        description: stack.stackConfig.description,
        runOrder: stack.stackConfig.runOrder,
        stackName: stack.stackConfig.name,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion),
        templateFile: stack.stackConfig.template,
        terminationProtection: stack.stackConfig.terminationProtection,
        parameters: stack.stackConfig.parameters,
        ssmParamNamePrefix: props.prefixes.ssmParamName,
        ...props,
      });
    }
  }
}

/**
 * Create custom applications stacks
 * @param rootApp
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
function createApplicationsStacks(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  for (const application of props.customizationsConfig.applications ?? []) {
    if (
      isIncluded(
        application.deploymentTargets,
        enabledRegion,
        accountId,
        props.accountsConfig,
        props.organizationConfig,
      )
    ) {
      // application stacks are created in customization stage
      // so the output directory will be customizations folder specific to that account and region
      const applicationStackName = `${props.prefixes.accelerator}-App-${application.name}-${accountId}-${enabledRegion}`;

      const applicationStack = new ApplicationsStack(app, applicationStackName, {
        env,
        description: `(SO0199-customizations) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
        appConfigItem: application,
      });
      cdk.Aspects.of(applicationStack).add(new AwsSolutionsChecks());
      cdk.Aspects.of(applicationStack).add(new PermissionsBoundaryAspect(accountId, context.partition));
      new AcceleratorAspects(app, context.partition, context.useExistingRoles ?? false);
    }
  }
}

function isBeforeBootstrapStage(stage?: string): boolean {
  const preBootstrapStages = [
    AcceleratorStage.PREPARE,
    AcceleratorStage.ACCOUNTS,
    AcceleratorStage.BOOTSTRAP,
  ] as string[];
  if (!stage) {
    return false;
  }

  return preBootstrapStages.includes(stage);
}

/**
 * Function to check if the root app has a placeholder
 * this avoids command failure of no stacks in app
 */
function checkRootApp(rootApp: cdk.App): cdk.App | cdk.Stack {
  if (!rootApp.node.tryFindChild(`placeHolder`)) {
    return new cdk.Stack(rootApp, `placeHolder`, {});
  } else {
    return rootApp;
  }
}

/**
 * Cross Account assume role credential type
 */
type AssumeRoleCredentialType = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
};

/**
 * Function to get management account credential.
 *
 * @remarks
 * When solution deployed from external account management account credential will be provided
 * @param partition string
 * @param region string
 * @param solutionId string
 * @returns credential {@AssumeRoleCredentialType} | undefined
 */
async function getManagementAccountCredentials(
  partition: string,
  region: string,
  solutionId: string,
): Promise<AssumeRoleCredentialType | undefined> {
  if (process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']) {
    logger.info('set management account credentials');
    logger.info(`managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`);
    logger.info(`management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`);

    const assumeRoleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;

    return getCredentials({
      accountId: process.env['MANAGEMENT_ACCOUNT_ID'],
      region,
      solutionId,
      assumeRoleArn,
      sessionName: 'ManagementAccountAssumeSession',
    });
  }

  return undefined;
}

/**
 * Function to get cross account assume role credential
 * @param options
 * @returns credentials {@link Credentials}
 */
async function getCredentials(options: {
  accountId: string;
  region: string;
  solutionId: string;
  partition?: string;
  assumeRoleName?: string;
  assumeRoleArn?: string;
  sessionName?: string;
  credentials?: AssumeRoleCredentialType;
}): Promise<AssumeRoleCredentialType | undefined> {
  if (options.assumeRoleName && options.assumeRoleArn) {
    throw new Error(`Either assumeRoleName or assumeRoleArn can be provided not both`);
  }

  if (!options.assumeRoleName && !options.assumeRoleArn) {
    throw new Error(`Either assumeRoleName or assumeRoleArn must provided`);
  }

  if (options.assumeRoleName && !options.partition) {
    throw new Error(`When assumeRoleName provided partition must be provided`);
  }

  const roleArn =
    options.assumeRoleArn ?? `arn:${options.partition}:iam::${options.accountId}:role/${options.assumeRoleName}`;

  const client: STSClient = new STSClient({
    region: options.region,
    customUserAgent: options.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: options.credentials,
  });

  const currentSessionResponse = await throttlingBackOff(() => client.send(new GetCallerIdentityCommand({})));

  if (currentSessionResponse.Arn === roleArn) {
    logger.info(`Already in target environment assume role credential not required`);
    return undefined;
  }

  const response = await throttlingBackOff(() =>
    client.send(
      new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: options.sessionName ?? 'AcceleratorAssumeRole' }),
    ),
  );

  if (!response.Credentials) {
    throw new Error(`Credentials undefined from AssumeRole command`);
  }

  //
  // Validate response
  if (!response.Credentials.AccessKeyId) {
    throw new Error(`Access key ID not returned from AssumeRole command`);
  }
  if (!response.Credentials.SecretAccessKey) {
    throw new Error(`Secret access key not returned from AssumeRole command`);
  }
  if (!response.Credentials.SessionToken) {
    throw new Error(`Session token not returned from AssumeRole command`);
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId,
    secretAccessKey: response.Credentials.SecretAccessKey,
    sessionToken: response.Credentials.SessionToken,
    expiration: response.Credentials.Expiration,
  };
}

/**
 * Function to get the landing zone identifier.
 *
 * @remarks
 * Function returns undefined when there is no landing zone configured, otherwise returns arn for the landing zone.
 * If there are multiple landing zone deployment found, function will return error.
 * @returns landingZoneIdentifier string | undefined
 *
 * @param client {@link ControlTowerClient}
 * @returns landingZoneIdentifier string | undefined
 */
async function getLandingZoneIdentifier(
  client?: ControlTowerClient,
  clientProps?: {
    homeRegion: string;
    solutionId: string;
    credentials?: AssumeRoleCredentialType;
  },
): Promise<string | undefined> {
  if (!client && !clientProps) {
    throw new Error(`It is necessary to provide either AWS Control Tower client or client configuration properties.`);
  }
  if (client && clientProps) {
    throw new Error(
      `It is not possible to provide both AWS Control Tower client and client configuration properties at the same time.`,
    );
  }

  let controlTowerClient: ControlTowerClient;

  if (!client) {
    controlTowerClient = new ControlTowerClient({
      region: clientProps!.homeRegion,
      customUserAgent: clientProps!.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: clientProps!.credentials,
    });
  } else {
    controlTowerClient = client;
  }

  const response = await throttlingBackOff(() => controlTowerClient.send(new ListLandingZonesCommand({})));

  if (response.landingZones!.length > 1) {
    throw new Error(
      `Multiple AWS Control Tower Landing Zone configuration found, list of Landing Zone arns are - ${response.landingZones?.join(
        ',',
      )}`,
    );
  }

  if (response.landingZones?.length === 1 && response.landingZones[0].arn) {
    return response.landingZones[0].arn;
  }

  return undefined;
}
