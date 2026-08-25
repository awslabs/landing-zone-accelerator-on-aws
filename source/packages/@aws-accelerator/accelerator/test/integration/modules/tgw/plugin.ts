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

/**
 * @fileoverview Transit Gateway associations/propagations module integration test plugin.
 *
 * Mirrors the Macie plugin's chained-narrative pattern: provides only TGW-specific
 * NetworkConfig stubs and the handler reference. Exercises the TGW SDK path via the
 * LZA wrapper (TgwAssociationsAndPropagations.configure), not configureTgw directly.
 * All generic plumbing (accounts, org accounts, base params) comes from the framework.
 */
import { createLogger, getCredentials, IModuleResponse } from 'aws-lza';
import {
  DeleteDirectConnectGatewayAssociationCommand,
  DescribeDirectConnectGatewayAssociationsCommand,
  DirectConnectClient,
} from '@aws-sdk/client-direct-connect';
import {
  DisableTransitGatewayRouteTablePropagationCommand,
  DisassociateTransitGatewayRouteTableCommand,
  EC2Client,
  GetTransitGatewayRouteTableAssociationsCommand,
  GetTransitGatewayRouteTablePropagationsCommand,
} from '@aws-sdk/client-ec2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import path from 'node:path';
import { TgwAssociationsAndPropagations } from '../../../../lib/actions/network/tgw-associations-and-propagations';
import { AcceleratorModules, ModuleParams } from '../../../../lib/types';
import { buildBaseModuleParams } from '../../framework/base-params-builder';
import { getModuleTestRoleName } from '../../framework/permissions-boundary';
import { resetModuleLatestState } from '../../framework/module-state-reset';
import { AssertionResult, ModuleTestPlugin, ResolvedEnvironment, TestManifest } from '../../framework/types';
import { runTgwAssertions, capturePreExecutionTimestamp } from './assertions';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

const SERVICE_NAME = 'tgw-associations-and-propagations';

/**
 * Track whether the state table has been reset for this test run.
 * Ensures we only clear stale state once, before the first manifest executes.
 */
let stateTableReset = false;

/**
 * Manifest moduleConfig shape for TGW tests.
 *
 * Each field is a NetworkConfig fragment passed through to the wrapper, which
 * constructs the ITgwModuleRequest from it. Keeping these as `unknown[]` avoids
 * pulling full NetworkConfig model types into manifest authoring.
 */
export interface TgwManifestConfig {
  transitGateways?: unknown[];
  vpcs?: unknown[];
  vpcTemplates?: unknown[];
  customerGateways?: unknown[];
  directConnectGateways?: unknown[];
  homeRegion?: string;
  enabledRegions?: string[];
  dryRun?: boolean;
}

/**
 * TGW associations/propagations module test plugin.
 *
 * Only provides TGW-specific NetworkConfig stubs. Everything else is handled
 * by buildBaseModuleParams from the framework.
 */
export const tgwPlugin: ModuleTestPlugin = {
  moduleName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,

  async buildParams(manifest: TestManifest, environment: ResolvedEnvironment): Promise<ModuleParams> {
    const tgwConfig = manifest.moduleConfig as unknown as TgwManifestConfig;

    const accessRole = getModuleTestRoleName(SERVICE_NAME);

    const params = buildBaseModuleParams({
      moduleName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
      handler: TgwAssociationsAndPropagations.configure,
      manifest,
      environment,
      configOverrides: {
        globalConfig: {
          homeRegion: tgwConfig.homeRegion ?? environment.region,
          enabledRegions: tgwConfig.enabledRegions ?? [environment.region],
          managementAccountAccessRole: accessRole,
        },
        networkConfig: {
          transitGateways: tgwConfig.transitGateways ?? [],
          vpcs: tgwConfig.vpcs ?? [],
          vpcTemplates: tgwConfig.vpcTemplates ?? [],
          customerGateways: tgwConfig.customerGateways ?? [],
          directConnectGateways: tgwConfig.directConnectGateways ?? [],
        },
      },
    });

    if (tgwConfig.dryRun !== undefined) {
      params.runnerParameters = { ...params.runnerParameters, dryRun: tgwConfig.dryRun };
    }

    return params;
  },

  async execute(params: ModuleParams): Promise<IModuleResponse> {
    logger.info('Executing TgwAssociationsAndPropagations.configure()');
    return TgwAssociationsAndPropagations.configure(params);
  },

  async assert(manifest: TestManifest, environment: ResolvedEnvironment): Promise<AssertionResult[]> {
    await waitForTerminalStates(environment);
    return runTgwAssertions(manifest, environment);
  },

  /**
   * Prepare hook — runs before every manifest.
   *
   * 1. On the very first manifest of a suite run:
   *    a) Delete the stale EXECUTION#latest row from the Module-State table
   *    b) Clean mutable state in AWS so the module starts from a known-empty state
   *       (prevents "exists" instead of "created"). Only the following mutable
   *       artifacts are removed:
   *         - TGW route-table associations (on core-rt, segregated-rt)
   *         - TGW route-table propagations (on core-rt, segregated-rt)
   *         - Direct Connect Gateway associations (on network-dxgw and shared-dxgw)
   *
   *       All baseline resources provisioned by tgw-prereqs.sh are preserved:
   *         - Transit Gateway (main-tgw)
   *         - TGW route tables (core-rt, segregated-rt)
   *         - VPC attachments (network-vpc-attach, shared-vpc-attach)
   *         - VPN attachment (network-vpn) + Customer Gateway (network-cgw)
   *         - Direct Connect Gateways (network-dxgw, shared-dxgw)
   *         - VPCs/subnets in Network + SharedServices
   *         - RAM share + SSM parameters
   *
   * 2. Before every manifest, snapshot the current `lastExecutionTime` from the state
   *    table. Skipped/idempotent/dry-run assertions compare against this baseline to
   *    detect whether the wrapper wrote a new row.
   */
  async prepare(_manifest: TestManifest, environment: ResolvedEnvironment): Promise<void> {
    // One-time reset on first manifest
    if (!stateTableReset) {
      stateTableReset = true;

      logger.info('--- Pre-test cleanup (one-time per suite run) ---');
      logger.info('  Removing: TGW route-table associations + propagations, DX Gateway associations');
      logger.info('  Preserving: main-tgw, core-rt, segregated-rt, VPC/VPN attachments, network-dxgw, shared-dxgw,');
      logger.info('              Customer Gateway, VPCs/subnets, RAM share, SSM parameters');

      await resetModuleLatestState(environment, SERVICE_NAME);

      // --- Clean DX Gateway associations (must happen before RT cleanup) ---
      await cleanDxGatewayAssociationsInAws(environment);

      // --- Clean AWS TGW route table associations and propagations ---
      await cleanTgwRouteTablesInAws(environment);
    }

    // Snapshot pre-execution timestamp for every manifest
    await capturePreExecutionTimestamp(environment);
  },
};

// ─── Inter-Manifest Stabilization ───────────────────────────────────────────

/**
 * Wait for all TGW route table associations and propagations to reach terminal states
 * before the next manifest executes.
 *
 * Terminal states:
 *   - Associations: `associated` (disassociated entries disappear from the API response)
 *   - Propagations: `enabled` (disabled entries disappear from the API response)
 *
 * This replaces the fixed 10s delay to avoid a timing race where the production code's
 * `State === 'associated'` filter skips entries still in `associating` state.
 */
async function waitForTerminalStates(environment: ResolvedEnvironment): Promise<void> {
  logger.info('Waiting for TGW associations/propagations to reach terminal states...');

  const networkAccountId = environment.accounts.get('Network');
  if (!networkAccountId) {
    logger.warn('Cannot resolve Network account — skipping terminal-state wait');
    return;
  }

  const adminRole = process.env['LZA_GITLAB_ROLE_NAME'] ?? 'LzaGitlabRole';
  let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined;
  try {
    const creds = await getCredentials({
      accountId: networkAccountId,
      region: environment.region,
      partition: environment.partition,
      assumeRoleName: adminRole,
      solutionId: 'LzaIntegTest',
      logPrefix: 'TgwPlugin',
      credentials: environment.managementAccountCredentials,
    });
    if (creds) {
      credentials = {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to assume role into Network account — skipping terminal-state wait: ${msg}`);
    return;
  }

  const ec2 = new EC2Client({ region: environment.region, credentials });
  const ssm = new SSMClient({ region: environment.region, credentials });

  const ssmPrefix = process.env['TGW_INTEG_SSM_PREFIX'] ?? environment.resourcePrefixes.ssmParamName;
  const routeTableNames = ['core-rt', 'segregated-rt'];

  // Resolve route table IDs upfront
  const routeTableIds: { name: string; id: string }[] = [];
  for (const rtName of routeTableNames) {
    const paramName = `${ssmPrefix}/network/transitGateways/main-tgw/routeTables/${rtName}/id`;
    try {
      const resp = await ssm.send(new GetParameterCommand({ Name: paramName }));
      if (resp.Parameter?.Value) {
        routeTableIds.push({ name: rtName, id: resp.Parameter.Value });
      }
    } catch {
      logger.warn(`SSM param ${paramName} not found — skipping terminal-state check for ${rtName}`);
    }
  }

  if (routeTableIds.length === 0) {
    logger.warn('No route table IDs resolved — skipping terminal-state wait');
    return;
  }

  // Initial delay before first poll
  await new Promise(resolve => setTimeout(resolve, 2_000));

  const maxWaitMs = 120_000;
  const pollIntervalMs = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    let allTerminal = true;

    for (const rt of routeTableIds) {
      try {
        const assocResp = await ec2.send(
          new GetTransitGatewayRouteTableAssociationsCommand({ TransitGatewayRouteTableId: rt.id }),
        );
        const nonTerminalAssocs = (assocResp.Associations ?? []).filter(a => a.State !== 'associated');
        if (nonTerminalAssocs.length > 0) {
          logger.info(
            `[${rt.name}] ${nonTerminalAssocs.length} association(s) not yet terminal (e.g. ${nonTerminalAssocs[0].State})`,
          );
          allTerminal = false;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`[${rt.name}] Failed to check associations: ${msg}`);
      }

      try {
        const propResp = await ec2.send(
          new GetTransitGatewayRouteTablePropagationsCommand({ TransitGatewayRouteTableId: rt.id }),
        );
        const nonTerminalProps = (propResp.TransitGatewayRouteTablePropagations ?? []).filter(
          p => p.State !== 'enabled',
        );
        if (nonTerminalProps.length > 0) {
          logger.info(
            `[${rt.name}] ${nonTerminalProps.length} propagation(s) not yet terminal (e.g. ${nonTerminalProps[0].State})`,
          );
          allTerminal = false;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`[${rt.name}] Failed to check propagations: ${msg}`);
      }
    }

    if (allTerminal) {
      logger.info('All TGW associations/propagations are in terminal states');
      return;
    }

    logger.info(`Waiting ${pollIntervalMs / 1000}s before next poll...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  logger.warn(`Terminal-state wait timed out after ${maxWaitMs / 1000}s — proceeding anyway`);
}

// ─── AWS Infrastructure Cleanup ─────────────────────────────────────────────

/**
 * Remove all associations and propagations from both TGW route tables (core-rt, segregated-rt).
 * This ensures the test suite starts from a clean AWS state regardless of prior run crashes.
 *
 * Scope: Only TGW route-table associations and propagations are removed. The TGW itself,
 * its route tables, and any attachments (VPC, VPN, DX) provisioned by tgw-prereqs.sh
 * are NEVER deleted — only the mutable bindings on top of them.
 *
 * Route tables scanned are hard-coded to the prereq names (core-rt, segregated-rt) so we
 * cannot accidentally touch any other TGW route table that may exist in the account.
 */
async function cleanTgwRouteTablesInAws(environment: ResolvedEnvironment): Promise<void> {
  logger.info('Cleaning TGW route table associations and propagations in AWS');

  const networkAccountId = environment.accounts.get('Network');
  if (!networkAccountId) {
    logger.warn('Cannot resolve Network account — skipping AWS cleanup');
    return;
  }

  // Get credentials for the Network account
  const adminRole = process.env['LZA_GITLAB_ROLE_NAME'] ?? 'LzaGitlabRole';
  let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined;
  try {
    const creds = await getCredentials({
      accountId: networkAccountId,
      region: environment.region,
      partition: environment.partition,
      assumeRoleName: adminRole,
      solutionId: 'LzaIntegTest',
      logPrefix: 'TgwPlugin',
      credentials: environment.managementAccountCredentials,
    });
    if (creds) {
      credentials = {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to assume role into Network account — skipping AWS cleanup: ${msg}`);
    return;
  }

  const ec2 = new EC2Client({ region: environment.region, credentials });
  const ssm = new SSMClient({ region: environment.region, credentials });

  const ssmPrefix = process.env['TGW_INTEG_SSM_PREFIX'] ?? environment.resourcePrefixes.ssmParamName;
  const routeTableNames = ['core-rt', 'segregated-rt'];

  for (const rtName of routeTableNames) {
    const paramName = `${ssmPrefix}/network/transitGateways/main-tgw/routeTables/${rtName}/id`;
    let rtId: string | undefined;
    try {
      const resp = await ssm.send(new GetParameterCommand({ Name: paramName }));
      rtId = resp.Parameter?.Value;
    } catch {
      logger.warn(`SSM param ${paramName} not found — skipping cleanup for ${rtName}`);
      continue;
    }

    if (!rtId) continue;

    // Remove all associations
    try {
      const assocResp = await ec2.send(
        new GetTransitGatewayRouteTableAssociationsCommand({ TransitGatewayRouteTableId: rtId }),
      );
      for (const assoc of assocResp.Associations ?? []) {
        if (assoc.TransitGatewayAttachmentId && assoc.State !== 'disassociating') {
          logger.info(`Disassociating ${assoc.TransitGatewayAttachmentId} from ${rtName} (${rtId})`);
          try {
            await ec2.send(
              new DisassociateTransitGatewayRouteTableCommand({
                TransitGatewayRouteTableId: rtId,
                TransitGatewayAttachmentId: assoc.TransitGatewayAttachmentId,
              }),
            );
          } catch (disassocError: unknown) {
            const msg = disassocError instanceof Error ? disassocError.message : String(disassocError);
            logger.warn(`Failed to disassociate ${assoc.TransitGatewayAttachmentId} from ${rtName}: ${msg}`);
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to list associations for ${rtName}: ${msg}`);
    }

    // Remove all propagations
    try {
      const propResp = await ec2.send(
        new GetTransitGatewayRouteTablePropagationsCommand({ TransitGatewayRouteTableId: rtId }),
      );
      for (const prop of propResp.TransitGatewayRouteTablePropagations ?? []) {
        if (prop.TransitGatewayAttachmentId && prop.State !== 'disabling') {
          logger.info(`Disabling propagation ${prop.TransitGatewayAttachmentId} on ${rtName} (${rtId})`);
          try {
            await ec2.send(
              new DisableTransitGatewayRouteTablePropagationCommand({
                TransitGatewayRouteTableId: rtId,
                TransitGatewayAttachmentId: prop.TransitGatewayAttachmentId,
              }),
            );
          } catch (disableError: unknown) {
            const msg = disableError instanceof Error ? disableError.message : String(disableError);
            logger.warn(`Failed to disable propagation ${prop.TransitGatewayAttachmentId} on ${rtName}: ${msg}`);
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to list propagations for ${rtName}: ${msg}`);
    }
  }

  // Wait for disassociations to complete (AWS transitions through 'disassociating' state)
  logger.info('Waiting for TGW route table cleanup to complete...');
  const maxWaitMs = 120_000; // 2 minutes max
  const pollIntervalMs = 5_000;
  const startTime = Date.now();

  for (const rtName of routeTableNames) {
    const paramName = `${ssmPrefix}/network/transitGateways/main-tgw/routeTables/${rtName}/id`;
    let rtId: string | undefined;
    try {
      const resp = await ssm.send(new GetParameterCommand({ Name: paramName }));
      rtId = resp.Parameter?.Value;
    } catch {
      continue;
    }
    if (!rtId) continue;

    // Poll until no associations remain
    while (Date.now() - startTime < maxWaitMs) {
      const assocResp = await ec2.send(
        new GetTransitGatewayRouteTableAssociationsCommand({ TransitGatewayRouteTableId: rtId }),
      );
      const activeAssocs = (assocResp.Associations ?? []).filter(a => a.State !== 'disassociated');
      const propResp = await ec2.send(
        new GetTransitGatewayRouteTablePropagationsCommand({ TransitGatewayRouteTableId: rtId }),
      );
      const activeProps = (propResp.TransitGatewayRouteTablePropagations ?? []).filter(p => p.State !== 'disabled');

      if (activeAssocs.length === 0 && activeProps.length === 0) {
        logger.info(`[${rtName}] Clean — 0 associations, 0 propagations`);
        break;
      }

      logger.info(
        `[${rtName}] Still cleaning: ${activeAssocs.length} association(s), ${activeProps.length} propagation(s) — waiting ${pollIntervalMs / 1000}s...`,
      );
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  logger.info('TGW route table cleanup complete');
}

/**
 * Clean associations for a single DX Gateway identified by its SSM parameter.
 * The DX Gateway itself is NEVER deleted — only its TGW associations are removed.
 */
async function cleanSingleDxGateway(
  dx: DirectConnectClient,
  ssm: SSMClient,
  dxgwParamName: string,
  label: string,
): Promise<void> {
  // Resolve DX Gateway ID
  let dxgwId: string | undefined;
  try {
    const resp = await ssm.send(new GetParameterCommand({ Name: dxgwParamName }));
    dxgwId = resp.Parameter?.Value;
  } catch {
    logger.warn(`SSM param ${dxgwParamName} not found — skipping DX cleanup for ${label}`);
    return;
  }
  if (!dxgwId) return;

  // Find and delete all associations for this DX Gateway
  try {
    const descResp = await dx.send(
      new DescribeDirectConnectGatewayAssociationsCommand({ directConnectGatewayId: dxgwId }),
    );
    const associations = descResp.directConnectGatewayAssociations ?? [];
    const active = associations.filter(
      a => a.associationState !== 'disassociated' && a.associationState !== 'disassociating',
    );

    for (const assoc of active) {
      if (assoc.associationId) {
        logger.info(
          `[${label}] Deleting DX Gateway association ${assoc.associationId} (state: ${assoc.associationState})`,
        );
        try {
          await dx.send(new DeleteDirectConnectGatewayAssociationCommand({ associationId: assoc.associationId }));
        } catch (delError: unknown) {
          const msg = delError instanceof Error ? delError.message : String(delError);
          logger.warn(`[${label}] Failed to delete DX association ${assoc.associationId}: ${msg}`);
        }
      }
    }

    // Poll until all associations are disassociated
    if (active.length > 0) {
      logger.info(`[${label}] Waiting for DX Gateway disassociations to complete...`);
      const maxWaitMs = 300_000; // 5 minutes (DX disassociation can be slow)
      const pollIntervalMs = 15_000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        const pollResp = await dx.send(
          new DescribeDirectConnectGatewayAssociationsCommand({ directConnectGatewayId: dxgwId }),
        );
        const remaining = (pollResp.directConnectGatewayAssociations ?? []).filter(
          a => a.associationState !== 'disassociated',
        );
        if (remaining.length === 0) {
          logger.info(`[${label}] DX Gateway associations fully disassociated`);
          break;
        }
        logger.info(`[${label}] DX Gateway: ${remaining.length} association(s) still active — waiting...`);
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`[${label}] Failed to clean DX Gateway associations: ${msg}`);
  }
}

/**
 * Remove any existing DX Gateway associations with the TGW for both DX Gateways.
 * DX associations create TGW attachments that have their own RT associations/propagations,
 * so they must be cleaned before the RT cleanup to avoid stale state.
 *
 * Scope: Only the associations on the prereq DX Gateways (network-dxgw in Network,
 * shared-dxgw in Shared Services, resolved via SSM) are removed. The DX Gateways
 * themselves are NEVER deleted — they are long-lived prereq resources provisioned
 * by tgw-prereqs.sh.
 */
async function cleanDxGatewayAssociationsInAws(environment: ResolvedEnvironment): Promise<void> {
  logger.info('Cleaning DX Gateway associations in AWS (network-dxgw + shared-dxgw)');

  const adminRole = process.env['LZA_GITLAB_ROLE_NAME'] ?? 'LzaGitlabRole';
  const ssmPrefix = process.env['TGW_INTEG_SSM_PREFIX'] ?? environment.resourcePrefixes.ssmParamName;

  // --- Clean network-dxgw in Network account (same-account DX GW) ---
  const networkAccountId = environment.accounts.get('Network');
  if (networkAccountId) {
    try {
      const creds = await getCredentials({
        accountId: networkAccountId,
        region: environment.region,
        partition: environment.partition,
        assumeRoleName: adminRole,
        solutionId: 'LzaIntegTest',
        logPrefix: 'TgwPlugin',
        credentials: environment.managementAccountCredentials,
      });
      if (creds) {
        const credentials = {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        };
        const ssm = new SSMClient({ region: environment.region, credentials });
        const dx = new DirectConnectClient({ region: environment.region, credentials });
        const dxParamName = `${ssmPrefix}/network/directConnectGateways/network-dxgw/id`;
        await cleanSingleDxGateway(dx, ssm, dxParamName, 'network-dxgw');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to assume role into Network account — skipping network-dxgw cleanup: ${msg}`);
    }
  } else {
    logger.warn('Cannot resolve Network account — skipping network-dxgw cleanup');
  }

  // --- Clean shared-dxgw in Shared Services account (cross-account DX GW) ---
  const sharedServicesAccountId = environment.accounts.get('Shared Services');
  if (sharedServicesAccountId) {
    try {
      const creds = await getCredentials({
        accountId: sharedServicesAccountId,
        region: environment.region,
        partition: environment.partition,
        assumeRoleName: adminRole,
        solutionId: 'LzaIntegTest',
        logPrefix: 'TgwPlugin',
        credentials: environment.managementAccountCredentials,
      });
      if (creds) {
        const credentials = {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        };
        const ssm = new SSMClient({ region: environment.region, credentials });
        const dx = new DirectConnectClient({ region: environment.region, credentials });
        const dxParamName = `${ssmPrefix}/network/directConnectGateways/shared-dxgw/id`;
        await cleanSingleDxGateway(dx, ssm, dxParamName, 'shared-dxgw');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to assume role into Shared Services account — skipping shared-dxgw cleanup: ${msg}`);
    }
  } else {
    logger.warn('Cannot resolve Shared Services account — skipping shared-dxgw cleanup');
  }

  logger.info('DX Gateway cleanup complete (both gateways)');
}
