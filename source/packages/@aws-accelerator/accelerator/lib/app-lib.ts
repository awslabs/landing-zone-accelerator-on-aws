#!/usr/bin/env node

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
import { App } from 'aws-cdk-lib';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import {
  AcceleratorContext,
  AcceleratorEnvironment,
  AcceleratorResourcePrefixes,
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
  createIdentityCenterStack,
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
  importAseaResourceStack,
  saveAseaResourceMapping,
} from '../utils/stack-utils';
import { AseaResourceMapping } from '@aws-accelerator/config';
import { AcceleratorToolkitProps } from './toolkit';
import { getGlobalRegion } from '@aws-accelerator/utils';

const logger = createLogger(['app']);

/**
 * Get accelerator app context from CLI input
 * @param app
 * @returns
 */
function getContextFromCli(options: AcceleratorToolkitProps): AcceleratorContext {
  const partition = options.partition ?? 'aws';

  if (!options.partition) {
    logger.info('Partition value not specified in CLI, defaulting to aws');
  }

  return {
    partition,
    configDirPath: options.configDirPath,
    stage: options.stage,
    account: options.accountId,
    region: options.region,
    useExistingRoles: options.useExistingRoles,
  };
}

/**
 * Create pipeline and tester pipeline stacks
 * @param context
 * @param acceleratorEnv
 * @param resourcePrefixes
 */
async function createPipelineStacks(
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  resourcePrefixes: AcceleratorResourcePrefixes,
  useExistingRoles: boolean,
) {
  const pipelineCdkApps: App[] = [];
  //
  // PIPELINE Stack
  const pipelineApp = await createPipelineStack(context, acceleratorEnv, resourcePrefixes, useExistingRoles);
  addCdkApps(pipelineCdkApps, pipelineApp);
  //
  // TESTER Stack
  addCdkApps(pipelineCdkApps, createTesterStack(context, acceleratorEnv, resourcePrefixes));
  return pipelineCdkApps;
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
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  homeRegion: string,
  globalRegion: string,
) {
  const managementCdkApps: App[] = [];
  //
  // PREPARE Stack
  addCdkApps(managementCdkApps, createPrepareStack(context, props, managementAccountId, homeRegion));
  //
  // ACCOUNTS Stack
  addCdkApps(managementCdkApps, createAccountsStack(context, props, managementAccountId, globalRegion));
  //
  // IDENTITY CENTER Stack
  addCdkApps(managementCdkApps, createIdentityCenterStack(context, props, managementAccountId, homeRegion));
  //
  // FINALIZE Stack
  addCdkApps(managementCdkApps, createFinalizeStack(context, props, managementAccountId, globalRegion));
  return managementCdkApps;
}

/**
 * Creates accelerator stacks that target a single account in all enabled regions
 * @param context
 * @param props
 * @param managementAccountId
 * @param auditAccountId
 */
function createSingleAccountMultiRegionStacks(
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  auditAccountId: string,
) {
  const singleAccountMultiRegionCdkApps: App[] = [];
  for (const enabledRegion of props.globalConfig.enabledRegions) {
    //
    // ORGANIZATIONS Stack
    addCdkApps(
      singleAccountMultiRegionCdkApps,
      createOrganizationsStack(context, props, managementAccountId, enabledRegion),
    );
    //
    // SECURITY AUDIT Stack
    addCdkApps(
      singleAccountMultiRegionCdkApps,
      createSecurityAuditStack(context, props, auditAccountId, enabledRegion),
    );
  }
  return singleAccountMultiRegionCdkApps;
}

/**
 * Safely adds CDK applications to a collection, handling both single apps and arrays.
 *
 * This utility function provides null-safe addition of CDK apps to a target collection,
 * automatically handling the different return types from stack creation functions.
 *
 * @param collection - The target array to add CDK apps to
 * @param apps - The CDK app(s) to add. Can be:
 *   - A single App instance
 *   - An array of App instances
 *   - undefined (safely ignored)
 *
 * @example
 * ```typescript
 * const apps: App[] = [];
 *
 * // Add single app
 * addCdkApps(apps, createSingleStack());
 *
 * // Add array of apps
 * addCdkApps(apps, createMultipleStacks());
 *
 * // Safely handle undefined
 * addCdkApps(apps, mayReturnUndefined());
 * ```
 */
function addCdkApps(collection: App[], apps: App[] | App | undefined) {
  if (apps) {
    if (Array.isArray(apps)) {
      collection.push(...apps);
    } else {
      collection.push(apps);
    }
  }
}

/**
 * Create accelerator stacks that target all accounts and enabled regions
 * @param context
 * @param props
 */
async function createMultiAccountMultiRegionStacks(context: AcceleratorContext, props: AcceleratorStackProps) {
  const aseaResources: AseaResourceMapping[] = [];
  const multiAccountMultiRegionCdkApps: App[] = [];
  try {
    for (const enabledRegion of props.globalConfig.enabledRegions) {
      let accountId = '';
      for (const accountItem of props.accountsConfig.getAccounts(props.enableSingleAccountMode)) {
        logger.debug(`Processing account ${accountItem.name} in region ${enabledRegion}`);
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
        const aseaAccountResources = await importAseaResourceStack(context, props, accountId, enabledRegion);
        if (aseaAccountResources?.resourceMapping) aseaResources.push(...aseaAccountResources.resourceMapping);
        // Create all stacks and safely add to collection
        if (aseaAccountResources?.importAseaResourceApps)
          addCdkApps(multiAccountMultiRegionCdkApps, aseaAccountResources.importAseaResourceApps);
        addCdkApps(
          multiAccountMultiRegionCdkApps,
          createKeyDependencyStacks(context, props, env, accountId, enabledRegion),
        );
        addCdkApps(multiAccountMultiRegionCdkApps, createBootstrapStack(context, props, env, accountId, enabledRegion));
        addCdkApps(multiAccountMultiRegionCdkApps, createLoggingStack(context, props, env, accountId, enabledRegion));
        addCdkApps(multiAccountMultiRegionCdkApps, createSecurityStack(context, props, env, accountId, enabledRegion));
        addCdkApps(
          multiAccountMultiRegionCdkApps,
          createOperationsStack(context, props, env, accountId, enabledRegion, accountItem.warm ?? false),
        );
        addCdkApps(
          multiAccountMultiRegionCdkApps,
          createNetworkPrepStack(context, props, env, accountId, enabledRegion),
        );
        addCdkApps(
          multiAccountMultiRegionCdkApps,
          createSecurityResourcesStack(context, props, env, accountId, enabledRegion),
        );
        addCdkApps(
          multiAccountMultiRegionCdkApps,
          createNetworkVpcStacks(context, props, env, accountId, enabledRegion),
        );
        addCdkApps(
          multiAccountMultiRegionCdkApps,
          createNetworkAssociationsStacks(context, props, env, accountId, enabledRegion),
        );
        addCdkApps(
          multiAccountMultiRegionCdkApps,
          createCustomizationsStacks(context, props, env, accountId, enabledRegion),
        );
      }
    }

    if (props.globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources) {
      await saveAseaResourceMapping(context, props, aseaResources);
    }
    return multiAccountMultiRegionCdkApps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error('Error in createMultiAccountMultiRegionStacks:');
    logger.error(error.stack || error.toString());
    throw error;
  }
}

export async function createCdkApp(options: AcceleratorToolkitProps, outputDir?: string) {
  const mainCdkApps: App[] = [];
  if (outputDir) {
    logger.debug(`Creating CDK app dir explicitly in outputDir: ${outputDir}`);
  }

  try {
    // Read in inputs from CLI args
    const context = getContextFromCli(options);
    logger.debug(`[app] Retrieved context from CLI: ${JSON.stringify(context)}`);

    //
    // Get aspects and global region
    const useExistingRoles = options.useExistingRoles ?? false;
    const globalRegion = getGlobalRegion(options.partition);
    //
    // Set various resource name prefixes used in code base
    const resourcePrefixes = setResourcePrefixes(process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator');
    //
    // Set accelerator environment variables
    const acceleratorEnv = setAcceleratorEnvironment(process.env, resourcePrefixes, options.stage);

    //
    // Create the diagnostics pack resources. The Diagnostics pack stack will be deployed for multi-account environments without utilizing existing roles for deployment.
    //
    if (!useExistingRoles && !acceleratorEnv.enableSingleAccountMode) {
      addCdkApps(mainCdkApps, createDiagnosticsPackStack(context, acceleratorEnv, resourcePrefixes));
    }

    //
    // PIPELINE and TESTER Stacks
    const pipelineStacks = await createPipelineStacks(context, acceleratorEnv, resourcePrefixes, useExistingRoles);
    addCdkApps(mainCdkApps, pipelineStacks);
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
      const managementCdkApps = await createManagementAccountStacks(
        context,
        props,
        managementAccountId,
        homeRegion,
        globalRegion,
      );
      addCdkApps(mainCdkApps, managementCdkApps);
      //
      // ORGANIZATIONS and SECURITY AUDIT Stacks
      const singleAccountMultiRegionCdkApps = await createSingleAccountMultiRegionStacks(
        context,
        props,
        managementAccountId,
        auditAccountId,
      );
      addCdkApps(mainCdkApps, singleAccountMultiRegionCdkApps);
      //
      // All remaining stacks
      const multiAccountMultiRegionCdkApps = await createMultiAccountMultiRegionStacks(context, props);
      addCdkApps(mainCdkApps, multiAccountMultiRegionCdkApps);
    }

    return mainCdkApps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error('Error in createCdkApp:');
    logger.error(error.stack || error.toString());
    throw error; // Re-throw to preserve stack trace
  }
}
