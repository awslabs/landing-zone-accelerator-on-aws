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
 * @fileoverview Transit Gateway module entry point.
 *
 * Orchestrates TGW route table associations, propagations, and DX Gateway
 * associations. Receives a self-contained ITgwModuleRequest and executes
 * all phases:
 *   Phase 1: Resolve TGW, route table, and attachment IDs
 *   Phase 2: Create/delete associations and propagations
 *   Phase 3: DX Gateway associations
 *
 * Callable from:
 * - LZA Action (accelerator/lib/actions/network/tgw-associations-and-propagations.ts)
 * - CLI (aws-lza setup transit-gateway -c config.json)
 */

import { createStatusLogger } from '../common/logger';
import { IModuleResponse } from '../common/interfaces';
import { MODULE_STATE_CODE } from '../common/types';
import { ITgwAttachmentConfig, ITgwModuleRequest, ITgwModuleResponse, ITgwResolvedContext } from './interfaces';
import { configureAssociationsAndPropagations } from './tgw-route-tables';
import { TransitGatewayAttachmentLookup } from './transit-gateway-attachment-lookup';
import { DirectConnectGatewayAssociation } from './direct-connect-gateway-association';
import { TransitGatewayConnect } from './tgw-connect';

const statusLogger = createStatusLogger(['transit-gateway']);

export async function configureTgw(props: ITgwModuleRequest): Promise<IModuleResponse<ITgwModuleResponse>> {
  const logPrefix = `${props.invokingAccountId}:${props.region}`;
  const moduleName = props.moduleName ?? 'transit-gateway';
  const dryRun = props.dryRun ?? false;

  try {
    statusLogger.info(`Starting ${moduleName} module`, logPrefix);

    if (!props.configuration.enable) {
      return {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'TGW module disabled in configuration.',
        timestamp: new Date().toISOString(),
        moduleName,
        dryRun,
        response: { associations: [], propagations: [], dxAssociations: [], connectAttachments: [] },
      };
    }

    // Validate TGW regions against boundary when provided
    validateTgwRegions(props, logPrefix);

    // Phase 1: Resolve resource IDs
    statusLogger.info('Phase 1: Resolving TGW resource IDs', logPrefix);
    const resolvedContext = await TransitGatewayAttachmentLookup.resolveAttachments(props, logPrefix);

    // Phase 1b: DX Gateway associations (creates attachments, adds IDs to context)
    statusLogger.info('Phase 1b: Resolving DX Gateway associations', logPrefix);
    const {
      dxResponses,
      dxAttachments,
      ownedResources: dxOwnedResources,
    } = await DirectConnectGatewayAssociation.resolveDxGatewayAssociations(props, resolvedContext, logPrefix);

    // Merge DX attachments into the request so Phase 2 handles their RT associations/propagations
    const mergedProps =
      dxAttachments.length > 0
        ? {
            ...props,
            configuration: {
              ...props.configuration,
              attachments: [...props.configuration.attachments, ...dxAttachments],
            },
          }
        : props;

    logResolvedContext(resolvedContext, logPrefix);

    // Phase 1c: TGW Connect attachments (creates Connect on top of transport attachments)
    statusLogger.info('Phase 1c: Creating TGW Connect attachments', logPrefix);
    const connectResponses = await TransitGatewayConnect.createConnectAttachments(props, resolvedContext, logPrefix);

    // Phase 1c deletion: remove Connect attachments not in config
    const connectDeleteResponses = await TransitGatewayConnect.deleteStaleConnectAttachments(
      props,
      resolvedContext,
      logPrefix,
    );
    connectResponses.push(...connectDeleteResponses);

    // Merge Connect attachments into Phase 2 so their RT associations/propagations are handled uniformly.
    // Exclude 'skipped' (dry-run) and 'deleted' operations — a deleted Connect must not receive RT
    // associations or propagations in Phase 2.
    const connectAttachments: ITgwAttachmentConfig[] = [];
    for (const resp of connectResponses) {
      if (resp.connectAttachmentId && resp.operation !== 'skipped' && resp.operation !== 'deleted') {
        const connectConfig = props.configuration.connectAttachments?.find(
          c => c.name === resp.connectName && c.transitGateway === resp.tgwName,
        );
        if (
          connectConfig &&
          (connectConfig.routeTableAssociations?.length || connectConfig.routeTablePropagations?.length)
        ) {
          const attachmentKey = `${resp.tgwName}_${connectConfig.transportAccountId}_connect-${resp.connectName}`;
          resolvedContext.attachmentIds.set(attachmentKey, resp.connectAttachmentId);
          connectAttachments.push({
            type: 'connect',
            name: `connect-${resp.connectName}`,
            accountId: connectConfig.transportAccountId,
            transitGateway: resp.tgwName,
            routeTableAssociations: connectConfig.routeTableAssociations ?? [],
            routeTablePropagations: connectConfig.routeTablePropagations ?? [],
          });
        }
      }
    }

    const finalProps =
      connectAttachments.length > 0
        ? {
            ...mergedProps,
            configuration: {
              ...mergedProps.configuration,
              attachments: [...mergedProps.configuration.attachments, ...connectAttachments],
            },
          }
        : mergedProps;

    // Phase 2: Associations & Propagations (VPC + VPN + DX + Connect, uniformly)
    statusLogger.info('Phase 2: Configuring associations and propagations', logPrefix);
    const phase2Results = await configureAssociationsAndPropagations(finalProps, resolvedContext, logPrefix);

    const response: ITgwModuleResponse = {
      associations: phase2Results.associations,
      propagations: phase2Results.propagations,
      dxAssociations: dxResponses,
      connectAttachments: connectResponses,
      // Combine route-table owned IDs (assoc:/prop:) with DX Gateway association owned IDs (dxassoc:)
      // so all LZA-created resources are recorded in a single ownership set persisted to state.
      ownedResources: [...(phase2Results.ownedResources ?? []), ...(dxOwnedResources ?? [])],
    };

    logSummary(response, dryRun, logPrefix);
    const failedAssociations = response.associations.filter(a => a.operation === 'failed');
    if (failedAssociations.length > 0) {
      return {
        status: MODULE_STATE_CODE.FAILED,
        summary: buildSummaryText(response, dryRun),
        timestamp: new Date().toISOString(),
        moduleName,
        dryRun,
        response,
        error: {
          name: 'TgwAssociationError',
          message: `${failedAssociations.length} TGW route table association operation(s) failed`,
        },
      };
    }

    return {
      status: MODULE_STATE_CODE.COMPLETED,
      summary: buildSummaryText(response, dryRun),
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      response,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    statusLogger.error(`${moduleName} module failed: ${errorMessage}`, logPrefix);
    return {
      status: MODULE_STATE_CODE.FAILED,
      summary: `TGW module failed: ${errorMessage}`,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      error: { name: 'TgwModuleError', message: errorMessage },
    };
  }
}

function logResolvedContext(ctx: ITgwResolvedContext, logPrefix: string): void {
  const divider = '─'.repeat(70);

  statusLogger.info(divider, logPrefix);
  statusLogger.info(
    `Resolved: ${ctx.transitGatewayIds.size} TGWs, ${ctx.routeTableIds.size} route tables, ${ctx.attachmentIds.size} attachments`,
    logPrefix,
  );
  statusLogger.info(divider, logPrefix);

  for (const [key, id] of ctx.transitGatewayIds) {
    statusLogger.info(`  TGW          ${key.padEnd(40)} → ${id}`, logPrefix);
  }
  for (const [key, id] of ctx.routeTableIds) {
    statusLogger.info(`  RouteTable   ${key.padEnd(40)} → ${id}`, logPrefix);
  }
  for (const [key, id] of ctx.attachmentIds) {
    statusLogger.info(`  Attachment   ${key.padEnd(40)} → ${id}`, logPrefix);
  }

  statusLogger.info(divider, logPrefix);
}

function logSummary(response: ITgwModuleResponse, dryRun: boolean, logPrefix: string): void {
  const d = '═'.repeat(70);
  const prefix = dryRun ? 'DRY RUN SUMMARY' : 'EXECUTION SUMMARY';

  statusLogger.info('', logPrefix);
  statusLogger.info(d, logPrefix);
  statusLogger.info(`  ${prefix}`, logPrefix);
  statusLogger.info(d, logPrefix);

  // Associations
  const assocCreated = response.associations.filter(a => a.operation === 'created');
  const assocDeleted = response.associations.filter(a => a.operation === 'deleted');
  const assocExists = response.associations.filter(a => a.operation === 'exists');
  const assocFailed = response.associations.filter(a => a.operation === 'failed');

  statusLogger.info('', logPrefix);
  statusLogger.info('  ROUTE TABLE ASSOCIATIONS', logPrefix);
  statusLogger.info(`    Already in place:  ${assocExists.length}`, logPrefix);
  statusLogger.info(`    ${dryRun ? 'Would create' : 'Created'}:       ${assocCreated.length}`, logPrefix);
  statusLogger.info(`    ${dryRun ? 'Would remove' : 'Removed'}:       ${assocDeleted.length}`, logPrefix);
  statusLogger.info(`    Failed:        ${assocFailed.length}`, logPrefix);

  for (const a of assocCreated) {
    statusLogger.info(`      + ${a.attachmentName} → ${a.routeTableName} (${a.attachmentType})`, logPrefix);
  }
  for (const a of assocDeleted) {
    statusLogger.info(`      - ${a.attachmentName} x ${a.routeTableName} (${a.attachmentType})`, logPrefix);
  }
  for (const a of assocFailed) {
    statusLogger.error(
      `      ! ${a.attachmentName} → ${a.routeTableName}: ${a.errorMessage ?? 'Unknown error'}`,
      logPrefix,
    );
  }

  // Propagations
  const propCreated = response.propagations.filter(p => p.operation === 'created');
  const propDeleted = response.propagations.filter(p => p.operation === 'deleted');
  const propExists = response.propagations.filter(p => p.operation === 'exists');

  statusLogger.info('', logPrefix);
  statusLogger.info('  ROUTE TABLE PROPAGATIONS', logPrefix);
  statusLogger.info(`    Already in place:  ${propExists.length}`, logPrefix);
  statusLogger.info(`    ${dryRun ? 'Would enable' : 'Enabled'}:       ${propCreated.length}`, logPrefix);
  statusLogger.info(`    ${dryRun ? 'Would disable' : 'Disabled'}:      ${propDeleted.length}`, logPrefix);

  for (const p of propCreated) {
    statusLogger.info(`      + ${p.attachmentName} → ${p.routeTableName} (${p.attachmentType})`, logPrefix);
  }
  for (const p of propDeleted) {
    statusLogger.info(`      - ${p.attachmentName} x ${p.routeTableName} (${p.attachmentType})`, logPrefix);
  }

  // DX Associations
  if (response.dxAssociations.length > 0) {
    const dxCreated = response.dxAssociations.filter(d => d.operation === 'created');
    const dxDeleted = response.dxAssociations.filter(d => d.operation === 'deleted');
    const dxUpdated = response.dxAssociations.filter(d => d.operation === 'updated');
    const dxExists = response.dxAssociations.filter(d => d.operation === 'exists');

    statusLogger.info('', logPrefix);
    statusLogger.info('  DX GATEWAY ASSOCIATIONS', logPrefix);
    statusLogger.info(`    Already in place:  ${dxExists.length}`, logPrefix);
    statusLogger.info(`    ${dryRun ? 'Would create' : 'Created'}:       ${dxCreated.length}`, logPrefix);
    statusLogger.info(`    ${dryRun ? 'Would update' : 'Updated'}:       ${dxUpdated.length}`, logPrefix);
    statusLogger.info(`    ${dryRun ? 'Would remove' : 'Removed'}:       ${dxDeleted.length}`, logPrefix);

    for (const d of dxCreated) {
      statusLogger.info(`      + ${d.dxGatewayName} ↔ TGW ${d.tgwName}`, logPrefix);
    }
    for (const d of dxUpdated) {
      statusLogger.info(`      ~ ${d.dxGatewayName} ↔ TGW ${d.tgwName} (prefixes updated)`, logPrefix);
    }
    for (const d of dxDeleted) {
      statusLogger.info(`      - ${d.dxGatewayName} ↔ TGW ${d.tgwName}`, logPrefix);
    }
  }

  // Connect Attachments
  if (response.connectAttachments.length > 0) {
    const connectCreated = response.connectAttachments.filter(c => c.operation === 'created');
    const connectDeleted = response.connectAttachments.filter(c => c.operation === 'deleted');
    const connectExists = response.connectAttachments.filter(c => c.operation === 'exists');

    statusLogger.info('', logPrefix);
    statusLogger.info('  TGW CONNECT ATTACHMENTS', logPrefix);
    statusLogger.info(`    Already in place:  ${connectExists.length}`, logPrefix);
    statusLogger.info(`    ${dryRun ? 'Would create' : 'Created'}:       ${connectCreated.length}`, logPrefix);
    statusLogger.info(`    ${dryRun ? 'Would remove' : 'Removed'}:       ${connectDeleted.length}`, logPrefix);

    for (const c of connectCreated) {
      statusLogger.info(`      + ${c.connectName} on TGW ${c.tgwName}`, logPrefix);
    }
    for (const c of connectDeleted) {
      statusLogger.info(`      - ${c.connectName} on TGW ${c.tgwName}`, logPrefix);
    }
  }

  const totalChanges =
    assocCreated.length +
    assocDeleted.length +
    propCreated.length +
    propDeleted.length +
    response.dxAssociations.filter(
      d => d.operation === 'created' || d.operation === 'deleted' || d.operation === 'updated',
    ).length +
    response.connectAttachments.filter(c => c.operation === 'created' || c.operation === 'deleted').length;
  statusLogger.info('', logPrefix);
  if (totalChanges === 0) {
    statusLogger.info('  No changes needed — infrastructure matches config', logPrefix);
  } else if (dryRun) {
    statusLogger.info(`  ${totalChanges} change(s) would be made. Run without --dry-run to apply.`, logPrefix);
  } else {
    statusLogger.info(`  ${totalChanges} change(s) applied successfully.`, logPrefix);
  }
  statusLogger.info(d, logPrefix);
  statusLogger.info('', logPrefix);
}

/**
 * Validates that all TGW regions are within the allowed boundary regions.
 * Only enforced when boundary.regions is provided in the configuration.
 * @param props - TGW module request
 * @param logPrefix - Structured logging prefix
 * @throws Error if any TGW targets a region outside the boundary
 */
function validateTgwRegions(props: ITgwModuleRequest, logPrefix: string): void {
  const allowedRegions = props.configuration.boundary?.regions;
  if (!allowedRegions || allowedRegions.length === 0) {
    return;
  }

  const allowedSet = new Set(allowedRegions);
  const invalidTgws = props.configuration.transitGateways.filter(tgw => !allowedSet.has(tgw.region));

  if (invalidTgws.length > 0) {
    const details = invalidTgws.map(tgw => `'${tgw.name}' (region: ${tgw.region})`).join(', ');
    throw new Error(
      `Transit gateway(s) target regions not in enabled regions [${allowedRegions.join(', ')}]: ${details}`,
    );
  }

  statusLogger.info(
    `Validated ${props.configuration.transitGateways.length} TGW region(s) against boundary`,
    logPrefix,
  );
}

function buildSummaryText(response: ITgwModuleResponse, dryRun: boolean): string {
  const ac = response.associations.filter(a => a.operation === 'created').length;
  const ad = response.associations.filter(a => a.operation === 'deleted').length;
  const ae = response.associations.filter(a => a.operation === 'exists').length;
  const af = response.associations.filter(a => a.operation === 'failed').length;
  const pc = response.propagations.filter(p => p.operation === 'created').length;
  const pd = response.propagations.filter(p => p.operation === 'deleted').length;
  const pe = response.propagations.filter(p => p.operation === 'exists').length;
  const dc = response.dxAssociations.filter(d => d.operation === 'created').length;
  const du = response.dxAssociations.filter(d => d.operation === 'updated').length;
  const dd = response.dxAssociations.filter(d => d.operation === 'deleted').length;
  const de_ = response.dxAssociations.filter(d => d.operation === 'exists').length;
  const cc = response.connectAttachments.filter(c => c.operation === 'created').length;
  const cd = response.connectAttachments.filter(c => c.operation === 'deleted').length;
  const ce = response.connectAttachments.filter(c => c.operation === 'exists').length;
  const verb = dryRun ? 'Dry run' : 'Completed';
  return `${verb}: associations(+${ac} -${ad} =${ae} !${af}), propagations(+${pc} -${pd} =${pe}), dxAssociations(+${dc} ~${du} -${dd} =${de_}), connects(+${cc} -${cd} =${ce})`;
}
