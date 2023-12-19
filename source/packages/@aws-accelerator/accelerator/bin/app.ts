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

import { createLogger } from '@aws-accelerator/utils';

import { AcceleratorAspects } from '../lib/accelerator-aspects';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import {
  AcceleratorContext,
  AcceleratorEnvironment,
  AcceleratorResourcePrefixes,
  getContext,
  setAcceleratorEnvironment,
  setAcceleratorStackProps,
  setResourcePrefixes,
} from '../utils/app-utils';
import {
  createAccountsStack,
  createBootstrapStack,
  createCustomizationsStacks,
  createDiagnosticsPackStack,
  createFinalizeStack,
  createKeyDependencyStacks,
  createLoggingStack,
  createNetworkAssociationsStacks,
  createNetworkPrepStack,
  createNetworkVpcStacks,
  createOperationsStack,
  createOrganizationsStack,
  createPipelineStack,
  createPrepareStack,
  createSecurityAuditStack,
  createSecurityResourcesStack,
  createSecurityStack,
  createTesterStack,
  importAseaResourceStacks,
  saveAseaResourceMapping,
} from '../utils/stack-utils';
import { AseaResourceMapping } from '@aws-accelerator/config';

const logger = createLogger(['app']);

/**
 * Create pipeline and tester pipeline stacks
 * @param app
 * @param context
 * @param acceleratorEnv
 * @param resourcePrefixes
 */
function createPipelineStacks(
  app: cdk.App,
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  resourcePrefixes: AcceleratorResourcePrefixes,
) {
  //
  // PIPELINE Stack
  createPipelineStack(app, context, acceleratorEnv, resourcePrefixes);
  //
  // TESTER Stack
  createTesterStack(app, context, acceleratorEnv, resourcePrefixes);
}

/**
 * Create accelerator stacks that target only the management account in
 * either the home region or global region
 * @param app
 * @param context
 * @param props
 * @param managementAccountId
 * @param homeRegion
 * @param globalRegion
 */
function createManagementAccountStacks(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  homeRegion: string,
  globalRegion: string,
) {
  //
  // PREPARE Stack
  createPrepareStack(app, context, props, managementAccountId, homeRegion);
  //
  // ACCOUNTS Stack
  createAccountsStack(app, context, props, managementAccountId, globalRegion);
  //
  // FINALIZE Stack
  createFinalizeStack(app, context, props, managementAccountId, globalRegion);
}

/**
 * Creates accelerator stacks that target a single account in all enabled regions
 * @param app
 * @param context
 * @param props
 * @param managementAccountId
 * @param auditAccountId
 */
function createSingleAccountMultiRegionStacks(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  auditAccountId: string,
) {
  for (const enabledRegion of props.globalConfig.enabledRegions) {
    //
    // ORGANIZATIONS Stack
    createOrganizationsStack(app, context, props, managementAccountId, enabledRegion);
    //
    // SECURITY AUDIT Stack
    createSecurityAuditStack(app, context, props, auditAccountId, enabledRegion);
  }
}

/**
 * Create accelerator stacks that target all accounts and enabled regions
 * @param app
 * @param context
 * @param props
 */
function createMultiAccountMultiRegionStacks(app: cdk.App, context: AcceleratorContext, props: AcceleratorStackProps) {
  const aseaResources: AseaResourceMapping[] = [];
  for (const enabledRegion of props.globalConfig.enabledRegions) {
    let accountId = '';
    for (const accountItem of props.accountsConfig.getAccounts(props.enableSingleAccountMode)) {
      // Retrieve account ID and create stack env
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
      // Import ASEA resources using CfnInclude
      const aseaAccountResources = importAseaResourceStacks(app, context, props, accountId, enabledRegion);
      if (aseaAccountResources) aseaResources.push(...aseaAccountResources);
      //
      // KEY and DEPENDENCIES Stacks
      createKeyDependencyStacks(app, context, props, env, accountId, enabledRegion);
      //
      // BOOTSTRAP Stack
      createBootstrapStack(app, context, props, env, accountId, enabledRegion);
      //
      // LOGGING Stack
      createLoggingStack(app, context, props, env, accountId, enabledRegion);
      //
      // SECURITY Stack
      createSecurityStack(app, context, props, env, accountId, enabledRegion);
      //
      // OPERATIONS Stack
      createOperationsStack(app, context, props, env, accountId, enabledRegion, accountItem.warm ?? false);
      //
      // NETWORK PREP Stack
      createNetworkPrepStack(app, context, props, env, accountId, enabledRegion);
      //
      // SECURITY RESOURCES Stack
      createSecurityResourcesStack(app, context, props, env, accountId, enabledRegion);
      //
      // All NETWORK_VPC stage stacks
      createNetworkVpcStacks(app, context, props, env, accountId, enabledRegion);
      //
      // All NETWORK_ASSOCIATIONS stage stacks
      createNetworkAssociationsStacks(app, context, props, env, accountId, enabledRegion);
      //
      // All CUSTOMIZATIONS stage stacks
      createCustomizationsStacks(app, context, props, env, accountId, enabledRegion);
    }
  }

  if (props.globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources) {
    saveAseaResourceMapping(context, props, aseaResources);
  }
}

async function main() {
  logger.info('Begin Accelerator CDK App');
  const app = new cdk.App();
  //
  // Read in context inputs
  const context = getContext(app);
  //
  // Set aspects and global region
  const useExistingRoles = context.useExistingRoles ?? false;
  const aspects = new AcceleratorAspects(app, context.partition, useExistingRoles);
  const globalRegion = aspects.globalRegion;
  //
  // Set various resource name prefixes used in code base
  const resourcePrefixes = setResourcePrefixes(process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator');
  //
  // Set accelerator environment variables
  const acceleratorEnv = setAcceleratorEnvironment(process.env, resourcePrefixes, context.stage);

  //
  // Create the diagnostics pack resources. The Diagnostics pack stack will be deployed for multi-account environments without utilizing existing roles for deployment.
  //
  if (!useExistingRoles && !acceleratorEnv.enableSingleAccountMode) {
    createDiagnosticsPackStack(app, context, acceleratorEnv, resourcePrefixes);
  }

  //
  // PIPELINE and TESTER Stacks
  createPipelineStacks(app, context, acceleratorEnv, resourcePrefixes);
  //
  // Set accelerator stack props
  const props = await setAcceleratorStackProps(context, acceleratorEnv, resourcePrefixes, globalRegion);

  if (props) {
    // Set common variables used in stacks
    const homeRegion = props.globalConfig.homeRegion;
    const managementAccountId = props.accountsConfig.getManagementAccountId();
    const auditAccountId = props.accountsConfig.getAuditAccountId();

    //
    // PREPARE, ACCOUNTS, and FINALIZE Stacks
    createManagementAccountStacks(app, context, props, managementAccountId, homeRegion, globalRegion);
    //
    // ORGANIZATIONS and SECURITY AUDIT Stacks
    createSingleAccountMultiRegionStacks(app, context, props, managementAccountId, auditAccountId);
    //
    // All remaining stacks
    createMultiAccountMultiRegionStacks(app, context, props);
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
