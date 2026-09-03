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
 * @fileoverview DX Gateway association management for the TGW module.
 *
 * Resolves DX Gateway IDs from SSM, creates or finds DX-TGW associations,
 * and returns attachment configs so Phase 2 can handle route table
 * associations/propagations uniformly.
 *
 * Two flows:
 *   Same-account:  CreateDirectConnectGatewayAssociation → poll → get attachment ID
 *   Cross-account: CreateDirectConnectGatewayAssociationProposal → log proposal (no attachment)
 */

import {
  DirectConnectClient,
  CreateDirectConnectGatewayAssociationCommand,
  CreateDirectConnectGatewayAssociationProposalCommand,
  DeleteDirectConnectGatewayAssociationCommand,
  DescribeDirectConnectGatewayAssociationsCommand,
  UpdateDirectConnectGatewayAssociationCommand,
} from '@aws-sdk/client-direct-connect';
import { DescribeTransitGatewayAttachmentsCommand, EC2Client } from '@aws-sdk/client-ec2';
import path from 'node:path';
import { createLogger } from '../common/logger';
import { getCredentials } from '../common/sts-functions';
import { executeApi, setRetryStrategy } from '../common/utility';
import { GetSsmParametersValueModule } from '../aws-ssm/get-parameters';
import { IGetSsmParametersValueConfiguration } from '../../interfaces/aws-ssm/get-parameters';
import {
  DxAssociationState,
  IDxAssociationResponse,
  IDxGatewayConfig,
  IDxTgwAssociationConfig,
  ITgwAttachmentConfig,
  ITgwModuleRequest,
  ITgwResolvedContext,
  TgwAttachmentState,
} from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

const MAX_POLL_RETRIES = 13;
const POLL_INTERVAL_MS = 60_000;

/**
 * DX Gateway association management for the TGW module.
 *
 * Resolves DX Gateway IDs from SSM, creates or finds DX-TGW associations,
 * and returns attachment configs so Phase 2 can handle route table
 * associations/propagations uniformly.
 */
export abstract class DirectConnectGatewayAssociation {
  /**
   * @param props - Module request with credentials and configuration
   * @param context - Resolved TGW/RT/attachment ID maps from Phase 1
   * @param logPrefix - Structured logging prefix
   * @returns An object containing:
   *   - `dxResponses`: DX Gateway association operation results
   *   - `dxAttachments`: attachment configs merged into Phase 2 for route-table associations/propagations
   *   - `ownedResources`: ownership-state IDs for DX Gateway↔TGW associations created by LZA, one per
   *     declared association in the form `dxassoc:{dxGatewayId}:{transitGatewayId}`. Persisted to state
   *     so subsequent runs only delete associations LZA created (externally-created ones are preserved).
   */
  public static async resolveDxGatewayAssociations(
    props: ITgwModuleRequest,
    context: ITgwResolvedContext,
    logPrefix: string,
  ): Promise<{
    dxResponses: IDxAssociationResponse[];
    dxAttachments: ITgwAttachmentConfig[];
    ownedResources: string[];
  }> {
    const config = props.configuration;
    const dxGateways = config.directConnectGateways ?? [];
    const dryRun = props.dryRun ?? false;

    // Set of DX Gateway↔TGW associations previously created by LZA (ownership state). Only
    // associations in this set may be deleted — externally-created associations on managed TGWs
    // are preserved. Format: "dxassoc:{dxGatewayId}:{transitGatewayId}".
    const ownedResourceIds = new Set(config.ownedResources ?? []);

    if (dxGateways.length === 0) {
      return { dxResponses: [], dxAttachments: [], ownedResources: [] };
    }

    const ssmPrefix = config.dataSources?.ssmParameterPrefix;
    if (!ssmPrefix) {
      throw new Error('DX Gateway resolution requires dataSources.ssmParameterPrefix');
    }

    const homeRegion = config.homeRegion;
    if (!homeRegion) {
      throw new Error('DX Gateway resolution requires homeRegion in configuration');
    }

    const dxGatewayIds = await DirectConnectGatewayAssociation.resolveDxGatewayIds(
      props,
      dxGateways,
      ssmPrefix,
      homeRegion,
      logPrefix,
    );

    const workItems = dxGateways.flatMap(dxgw => {
      const dxgwId = dxGatewayIds.get(dxgw.name);
      if (!dxgwId) {
        throw new Error(`DX Gateway ID not resolved for ${dxgw.name}`);
      }
      return (dxgw.transitGatewayAssociations ?? []).map(assoc => ({ dxgw, dxgwId, assoc }));
    });

    const dxResponses: IDxAssociationResponse[] = [];
    const dxAttachments: ITgwAttachmentConfig[] = [];
    const dxClientCache = new Map<string, DirectConnectClient>();
    const ec2ClientCache = new Map<string, EC2Client>();

    for (const { dxgw, dxgwId, assoc } of workItems) {
      const tgwId = context.transitGatewayIds.get(assoc.name);
      if (!tgwId) {
        throw new Error(`TGW ID not resolved for ${assoc.name} — needed for DX Gateway ${dxgw.name}`);
      }

      const tgwConfig = config.transitGateways.find(t => t.name === assoc.name);
      if (!tgwConfig) {
        throw new Error(`TGW config not found for ${assoc.name}`);
      }

      const isSameAccount = dxgw.accountId === tgwConfig.accountId;

      if (isSameAccount) {
        const clientKey = `${tgwConfig.accountId}_${tgwConfig.region}`;
        if (!dxClientCache.has(clientKey)) {
          dxClientCache.set(
            clientKey,
            await DirectConnectGatewayAssociation.buildDxClient(props, tgwConfig.accountId, tgwConfig.region),
          );
        }
        if (!ec2ClientCache.has(clientKey)) {
          ec2ClientCache.set(
            clientKey,
            await DirectConnectGatewayAssociation.buildEc2Client(props, tgwConfig.accountId, tgwConfig.region),
          );
        }
        const result = await DirectConnectGatewayAssociation.handleSameAccountAssociation(
          dxClientCache.get(clientKey)!,
          ec2ClientCache.get(clientKey)!,
          dxgw,
          assoc,
          dxgwId,
          tgwId,
          tgwConfig.region,
          dryRun,
          logPrefix,
        );
        dxResponses.push(result.response);

        if (result.attachmentId) {
          const attachmentKey = `${assoc.name}_${dxgw.accountId}_dxgw-${dxgw.name}`;
          context.attachmentIds.set(attachmentKey, result.attachmentId);

          dxAttachments.push({
            type: 'dxGateway',
            name: `dxgw-${dxgw.name}`,
            accountId: dxgw.accountId,
            transitGateway: assoc.name,
            routeTableAssociations: assoc.routeTableAssociations ?? [],
            routeTablePropagations: assoc.routeTablePropagations ?? [],
          });
        }
      } else {
        const clientKey = `${tgwConfig.accountId}_${tgwConfig.region}`;
        if (!dxClientCache.has(clientKey)) {
          dxClientCache.set(
            clientKey,
            await DirectConnectGatewayAssociation.buildDxClient(props, tgwConfig.accountId, tgwConfig.region),
          );
        }
        const result = await DirectConnectGatewayAssociation.handleCrossAccountProposal(
          dxClientCache.get(clientKey)!,
          dxgw,
          assoc,
          dxgwId,
          tgwId,
          tgwConfig.region,
          dryRun,
          logPrefix,
        );
        dxResponses.push(result);
      }
    }

    // Owned set built from desired config: every DX Gateway↔TGW association declared in config is
    // owned by LZA. Persisted to state so subsequent runs know which associations LZA created and
    // may therefore delete when removed from config.
    const ownedResources: string[] = [];
    for (const { dxgwId, assoc } of workItems) {
      const tgwId = context.transitGatewayIds.get(assoc.name);
      if (tgwId) {
        ownedResources.push(`dxassoc:${dxgwId}:${tgwId}`);
      }
    }

    // ── Deletion phase: remove stale DX-TGW associations ──
    const declaredPairs = new Set(workItems.map(w => `${w.dxgwId}::${context.transitGatewayIds.get(w.assoc.name)}`));
    const managedTgwIds = new Set(context.transitGatewayIds.values());

    for (const dxgw of dxGateways) {
      const dxgwId = dxGatewayIds.get(dxgw.name)!;

      // Build a DX client for the DX GW owner account
      const dxClient = await DirectConnectGatewayAssociation.buildDxClient(props, dxgw.accountId, props.region);

      // Describe ALL associations for this DX GW
      const descResp = await executeApi(
        'DescribeDirectConnectGatewayAssociationsCommand',
        { directConnectGatewayId: dxgwId },
        () => dxClient.send(new DescribeDirectConnectGatewayAssociationsCommand({ directConnectGatewayId: dxgwId })),
        logger,
        logPrefix,
      );

      for (const assoc of descResp?.directConnectGatewayAssociations ?? []) {
        const assocTgwId = assoc.associatedGateway?.id;
        const assocState = assoc.associationState;
        const associationId = assoc.associationId;

        if (!assocTgwId || !associationId) continue;
        if (assoc.associatedGateway?.type !== 'transitGateway') continue;
        if (!managedTgwIds.has(assocTgwId)) continue;
        if (declaredPairs.has(`${dxgwId}::${assocTgwId}`)) continue;

        // Ownership gate: only delete associations LZA previously created. An association on a
        // managed TGW that is not in the owned set was created out-of-band and must be preserved.
        if (!ownedResourceIds.has(`dxassoc:${dxgwId}:${assocTgwId}`)) {
          logger.info(
            `Skipping deletion of DX Gateway association ${dxgw.name} ↔ TGW ${assocTgwId}: not created by LZA ` +
              `(no 'dxassoc:${dxgwId}:${assocTgwId}' in ownership state)`,
            logPrefix,
          );
          continue;
        }

        // Find the TGW name for logging
        const tgwName = [...context.transitGatewayIds.entries()].find(([, id]) => id === assocTgwId)?.[0] ?? assocTgwId;

        // Only delete associations in 'associated' state to avoid race conditions
        if (assocState !== DxAssociationState.ASSOCIATED) {
          logger.warn(
            `Skipped deletion of DX Gateway association ${dxgw.name} ↔ TGW ${tgwName}: state is '${assocState}', expected 'associated'`,
            logPrefix,
          );
          continue;
        }

        if (dryRun) {
          logger.info(`[DRY RUN] Would delete DX Gateway association: ${dxgw.name} ↔ TGW ${tgwName}`, logPrefix);
          dxResponses.push(
            DirectConnectGatewayAssociation.buildDxResponse('deleted', props.region, tgwName, dxgw.name, 'direct'),
          );
          continue;
        }

        logger.info(`Deleting DX Gateway association: ${dxgw.name} ↔ TGW ${tgwName} (${associationId})`, logPrefix);

        await executeApi(
          'DeleteDirectConnectGatewayAssociationCommand',
          { associationId },
          () => dxClient.send(new DeleteDirectConnectGatewayAssociationCommand({ associationId })),
          logger,
          logPrefix,
        );

        await DirectConnectGatewayAssociation.pollAssociationState(
          dxClient,
          associationId,
          DxAssociationState.DISASSOCIATED,
          logPrefix,
          [DxAssociationState.ASSOCIATING, DxAssociationState.ASSOCIATED],
        );

        logger.info(`DX Gateway association deleted: ${dxgw.name} ↔ TGW ${tgwName}`, logPrefix);
        dxResponses.push(
          DirectConnectGatewayAssociation.buildDxResponse('deleted', props.region, tgwName, dxgw.name, 'direct'),
        );
      }
    }

    return { dxResponses, dxAttachments, ownedResources };
  }

  /**
   * @param props - Module request with credentials
   * @param dxGateways - DX Gateway configurations to resolve
   * @param ssmPrefix - SSM parameter path prefix
   * @param homeRegion - Home region where DX GW SSM parameters are stored
   * @param logPrefix - Structured logging prefix
   * @returns Map of DX Gateway name → AWS resource ID
   */
  private static async resolveDxGatewayIds(
    props: ITgwModuleRequest,
    dxGateways: IDxGatewayConfig[],
    ssmPrefix: string,
    homeRegion: string,
    logPrefix: string,
  ): Promise<Map<string, string>> {
    interface DxSsmEntry extends IGetSsmParametersValueConfiguration {
      key: string;
    }

    const entries: DxSsmEntry[] = dxGateways.map(dxgw => ({
      key: dxgw.name,
      name: `${ssmPrefix}/network/directConnectGateways/${dxgw.name}/id`,
      region: homeRegion,
      assumeRoleArn: DirectConnectGatewayAssociation.buildAssumeRoleArn(props, dxgw.accountId),
    }));

    logger.info(`Resolving ${entries.length} DX Gateway IDs via SSM batch API`, logPrefix);

    const module = new GetSsmParametersValueModule();
    const ssmResults = await module.handler({
      operation: 'get-parameters',
      partition: props.partition,
      region: props.region,
      solutionId: props.solutionId,
      credentials: props.credentials,
      configuration: entries,
    });

    const resultByName = new Map(ssmResults.map(r => [r.name, r]));
    const result = new Map<string, string>();
    for (const entry of entries) {
      const param = resultByName.get(entry.key) ?? resultByName.get(entry.name);
      if (!param?.exists || !param.value) {
        throw new Error(`SSM parameter not found: ${entry.name}`);
      }
      result.set(entry.key, param.value);
      logger.info(`  DX Gateway ${entry.key} → ${param.value}`, logPrefix);
    }

    return result;
  }

  private static buildAssumeRoleArn(props: ITgwModuleRequest, targetAccountId: string): string | undefined {
    if (targetAccountId === props.invokingAccountId) {
      return undefined;
    }
    return `arn:${props.partition}:iam::${targetAccountId}:role/${props.configuration.accountAccessRoleName}`;
  }

  /**
   * @param props - Module request with credentials
   * @param dxgw - DX Gateway configuration
   * @param assoc - TGW association configuration with allowed prefixes
   * @param dxgwId - Resolved DX Gateway AWS ID
   * @param tgwId - Resolved Transit Gateway AWS ID
   * @param tgwAccountId - TGW owner account ID
   * @param tgwRegion - TGW region
   * @param dryRun - If true, skip mutating API calls
   * @param logPrefix - Structured logging prefix
   * @returns Association response and optional attachment ID
   */
  private static async handleSameAccountAssociation(
    dxClient: DirectConnectClient,
    ec2Client: EC2Client,
    dxgw: IDxGatewayConfig,
    assoc: IDxTgwAssociationConfig,
    dxgwId: string,
    tgwId: string,
    tgwRegion: string,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<{ response: IDxAssociationResponse; attachmentId?: string }> {
    const existing = await DirectConnectGatewayAssociation.findExistingAssociation(dxClient, dxgwId, tgwId, logPrefix);

    if (existing) {
      if (existing.state === DxAssociationState.ASSOCIATED) {
        // Check if allowed prefixes need updating
        const desiredPrefixes = [...assoc.allowedPrefixes].sort();
        const actualPrefixes = [...existing.allowedPrefixes].sort();
        const prefixesMatch =
          desiredPrefixes.length === actualPrefixes.length && desiredPrefixes.every((v, i) => v === actualPrefixes[i]);

        if (!prefixesMatch && !dryRun) {
          logger.info(
            `Updating allowed prefixes for DX Gateway ${dxgw.name} ↔ TGW ${assoc.name}: [${actualPrefixes}] → [${desiredPrefixes}]`,
            logPrefix,
          );
          const addPrefixes = desiredPrefixes.map(cidr => ({ cidr }));
          const removeCidrs = actualPrefixes.filter(p => !desiredPrefixes.includes(p));
          const removePrefixes = removeCidrs.length > 0 ? removeCidrs.map(cidr => ({ cidr })) : undefined;

          await executeApi(
            'UpdateDirectConnectGatewayAssociationCommand',
            { associationId: existing.associationId },
            () =>
              dxClient.send(
                new UpdateDirectConnectGatewayAssociationCommand({
                  associationId: existing.associationId,
                  addAllowedPrefixesToDirectConnectGateway: addPrefixes,
                  removeAllowedPrefixesToDirectConnectGateway: removePrefixes,
                }),
              ),
            logger,
            logPrefix,
          );
          await DirectConnectGatewayAssociation.pollAssociationState(
            dxClient,
            existing.associationId,
            DxAssociationState.ASSOCIATED,
            logPrefix,
            [DxAssociationState.DISASSOCIATING, DxAssociationState.DISASSOCIATED],
          );
          logger.info(`Allowed prefixes updated for DX Gateway ${dxgw.name} ↔ TGW ${assoc.name}`, logPrefix);
        } else if (!prefixesMatch && dryRun) {
          logger.info(
            `[DRY RUN] Would update allowed prefixes for DX Gateway ${dxgw.name} ↔ TGW ${assoc.name}: [${actualPrefixes}] → [${desiredPrefixes}]`,
            logPrefix,
          );
        }

        const attachmentId = await DirectConnectGatewayAssociation.getDxAttachmentId(
          ec2Client,
          dxgwId,
          tgwId,
          logPrefix,
        );
        logger.info(
          `DX Gateway ${dxgw.name} already associated with TGW ${assoc.name} (attachment: ${attachmentId})`,
          logPrefix,
        );
        return {
          response: DirectConnectGatewayAssociation.buildDxResponse(
            prefixesMatch ? 'exists' : 'updated',
            tgwRegion,
            assoc.name,
            dxgw.name,
            'direct',
          ),
          attachmentId,
        };
      }
      if (existing.state === DxAssociationState.ASSOCIATING) {
        logger.info(`DX Gateway ${dxgw.name} association in progress, polling...`, logPrefix);
        await DirectConnectGatewayAssociation.pollAssociationState(
          dxClient,
          existing.associationId,
          DxAssociationState.ASSOCIATED,
          logPrefix,
          [DxAssociationState.DISASSOCIATING, DxAssociationState.DISASSOCIATED],
        );
        const attachmentId = await DirectConnectGatewayAssociation.getDxAttachmentId(
          ec2Client,
          dxgwId,
          tgwId,
          logPrefix,
        );
        return {
          response: DirectConnectGatewayAssociation.buildDxResponse(
            'exists',
            tgwRegion,
            assoc.name,
            dxgw.name,
            'direct',
          ),
          attachmentId,
        };
      }
      // Handle updating: another caller is changing allowed prefixes; poll until associated then report exists.
      // Next pipeline run will reconcile any remaining prefix drift against config.
      if (existing.state === DxAssociationState.UPDATING) {
        logger.info(`DX Gateway ${dxgw.name} association is updating, polling until stable...`, logPrefix);
        await DirectConnectGatewayAssociation.pollAssociationState(
          dxClient,
          existing.associationId,
          DxAssociationState.ASSOCIATED,
          logPrefix,
          [DxAssociationState.DISASSOCIATING, DxAssociationState.DISASSOCIATED],
        );
        const attachmentId = await DirectConnectGatewayAssociation.getDxAttachmentId(
          ec2Client,
          dxgwId,
          tgwId,
          logPrefix,
        );
        return {
          response: DirectConnectGatewayAssociation.buildDxResponse(
            'exists',
            tgwRegion,
            assoc.name,
            dxgw.name,
            'direct',
          ),
          attachmentId,
        };
      }
      // Handle disassociating: poll until disassociated, then fall through to create
      if (existing.state === DxAssociationState.DISASSOCIATING) {
        logger.info(`DX Gateway ${dxgw.name} association is disassociating. Polling until complete...`, logPrefix);
        await DirectConnectGatewayAssociation.pollAssociationState(
          dxClient,
          existing.associationId,
          DxAssociationState.DISASSOCIATED,
          logPrefix,
          [DxAssociationState.ASSOCIATED], // unexpected reversal is a terminal failure
        );
        logger.info(
          `DX Gateway ${dxgw.name} disassociation complete. Proceeding to create new association.`,
          logPrefix,
        );
        // Fall through to create
      } else if (existing.state === DxAssociationState.DISASSOCIATED) {
        // Handle disassociated: fall through directly to create
        logger.info(
          `DX Gateway ${dxgw.name} association is disassociated. Proceeding to create new association.`,
          logPrefix,
        );
        // Fall through to create
      } else {
        // Unknown state — require manual intervention
        throw new Error(
          `DX Gateway ${dxgw.name} association with TGW ${assoc.name} is in unexpected state: ${existing.state}. ` +
            `Manual intervention may be required.`,
        );
      }
    }

    if (dryRun) {
      logger.info(`[DRY RUN] Would create DX Gateway association: ${dxgw.name} → TGW ${assoc.name}`, logPrefix);
      return {
        response: DirectConnectGatewayAssociation.buildDxResponse(
          'created',
          tgwRegion,
          assoc.name,
          dxgw.name,
          'direct',
        ),
        attachmentId: `placeholder-dxgw-${dxgw.name}-will-be-populated-on-deploy`,
      };
    }

    logger.info(`Creating DX Gateway association: ${dxgw.name} → TGW ${assoc.name}`, logPrefix);
    const allowedPrefixes = assoc.allowedPrefixes.map(cidr => ({ cidr }));

    const createResponse = await executeApi(
      'CreateDirectConnectGatewayAssociationCommand',
      { directConnectGatewayId: dxgwId, gatewayId: tgwId },
      () =>
        dxClient.send(
          new CreateDirectConnectGatewayAssociationCommand({
            directConnectGatewayId: dxgwId,
            gatewayId: tgwId,
            addAllowedPrefixesToDirectConnectGateway: allowedPrefixes,
          }),
        ),
      logger,
      logPrefix,
    );

    const associationId = createResponse.directConnectGatewayAssociation?.associationId;
    if (!associationId) {
      throw new Error(`Failed to create DX Gateway association for ${dxgw.name} → TGW ${assoc.name}`);
    }

    await DirectConnectGatewayAssociation.pollAssociationState(
      dxClient,
      associationId,
      DxAssociationState.ASSOCIATED,
      logPrefix,
      [DxAssociationState.DISASSOCIATING, DxAssociationState.DISASSOCIATED],
    );

    const attachmentId = await DirectConnectGatewayAssociation.getDxAttachmentId(ec2Client, dxgwId, tgwId, logPrefix);

    logger.info(
      `DX Gateway association created: ${dxgw.name} → TGW ${assoc.name} (attachment: ${attachmentId})`,
      logPrefix,
    );

    return {
      response: DirectConnectGatewayAssociation.buildDxResponse('created', tgwRegion, assoc.name, dxgw.name, 'direct'),
      attachmentId,
    };
  }

  /**
   * Acceptance is out of scope (matches current LZA behavior).
   * @param props - Module request with credentials
   * @param dxgw - DX Gateway configuration
   * @param assoc - TGW association configuration with allowed prefixes
   * @param dxgwId - Resolved DX Gateway AWS ID
   * @param tgwId - Resolved Transit Gateway AWS ID
   * @param tgwAccountId - TGW owner account ID
   * @param tgwRegion - TGW region
   * @param dryRun - If true, skip mutating API calls
   * @param logPrefix - Structured logging prefix
   * @returns Association response with proposal type
   */
  private static async handleCrossAccountProposal(
    dxClient: DirectConnectClient,
    dxgw: IDxGatewayConfig,
    assoc: IDxTgwAssociationConfig,
    dxgwId: string,
    tgwId: string,
    tgwRegion: string,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<IDxAssociationResponse> {
    // Cross-account proposals run from the TGW owner account. The DX client is scoped
    // to tgwConfig.accountId — DescribeDirectConnectGatewayAssociations works here because
    // the TGW owner can see associations involving their gateway.
    const existing = await DirectConnectGatewayAssociation.findExistingAssociation(dxClient, dxgwId, tgwId, logPrefix);

    if (existing) {
      // Check if allowed prefixes changed on an associated cross-account association
      if (existing.state === DxAssociationState.ASSOCIATED) {
        const desiredPrefixes = [...assoc.allowedPrefixes].sort();
        const actualPrefixes = [...existing.allowedPrefixes].sort();
        const prefixesMatch =
          desiredPrefixes.length === actualPrefixes.length && desiredPrefixes.every((v, i) => v === actualPrefixes[i]);

        if (!prefixesMatch) {
          if (dryRun) {
            logger.info(
              `[DRY RUN] Would create new proposal to update allowed prefixes for DX Gateway ${dxgw.name} ↔ TGW ${assoc.name}: [${actualPrefixes}] → [${desiredPrefixes}]`,
              logPrefix,
            );
            return DirectConnectGatewayAssociation.buildDxResponse(
              'created',
              tgwRegion,
              assoc.name,
              dxgw.name,
              'proposal',
            );
          }

          logger.info(
            `Creating new proposal to update allowed prefixes for DX Gateway ${dxgw.name} ↔ TGW ${assoc.name}: [${actualPrefixes}] → [${desiredPrefixes}]`,
            logPrefix,
          );
          const addPrefixes = desiredPrefixes.map(cidr => ({ cidr }));
          const removeCidrs = actualPrefixes.filter(p => !desiredPrefixes.includes(p));
          const removePrefixes = removeCidrs.length > 0 ? removeCidrs.map(cidr => ({ cidr })) : undefined;

          const response = await executeApi(
            'CreateDirectConnectGatewayAssociationProposalCommand',
            { directConnectGatewayId: dxgwId, gatewayId: tgwId },
            () =>
              dxClient.send(
                new CreateDirectConnectGatewayAssociationProposalCommand({
                  directConnectGatewayId: dxgwId,
                  directConnectGatewayOwnerAccount: dxgw.accountId,
                  gatewayId: tgwId,
                  addAllowedPrefixesToDirectConnectGateway: addPrefixes,
                  removeAllowedPrefixesToDirectConnectGateway: removePrefixes,
                }),
              ),
            logger,
            logPrefix,
          );

          const proposalId = response.directConnectGatewayAssociationProposal?.proposalId;
          logger.info(
            `DX Gateway prefix update proposal created: ${proposalId} (requires manual acceptance in DX GW owner account)`,
            logPrefix,
          );
          return DirectConnectGatewayAssociation.buildDxResponse(
            'created',
            tgwRegion,
            assoc.name,
            dxgw.name,
            'proposal',
          );
        }
      }

      logger.info(
        `DX Gateway ${dxgw.name} association already exists with TGW ${assoc.name} (state: ${existing.state})`,
        logPrefix,
      );
      return DirectConnectGatewayAssociation.buildDxResponse('exists', tgwRegion, assoc.name, dxgw.name, 'proposal');
    }

    if (dryRun) {
      logger.info(
        `[DRY RUN] Would create DX Gateway association proposal: ${dxgw.name} → TGW ${assoc.name} (cross-account)`,
        logPrefix,
      );
      return DirectConnectGatewayAssociation.buildDxResponse('created', tgwRegion, assoc.name, dxgw.name, 'proposal');
    }

    logger.info(
      `Creating DX Gateway association proposal: ${dxgw.name} → TGW ${assoc.name} (cross-account)`,
      logPrefix,
    );
    const allowedPrefixes = assoc.allowedPrefixes.map(cidr => ({ cidr }));

    const response = await executeApi(
      'CreateDirectConnectGatewayAssociationProposalCommand',
      { directConnectGatewayId: dxgwId, gatewayId: tgwId },
      () =>
        dxClient.send(
          new CreateDirectConnectGatewayAssociationProposalCommand({
            directConnectGatewayId: dxgwId,
            directConnectGatewayOwnerAccount: dxgw.accountId,
            gatewayId: tgwId,
            addAllowedPrefixesToDirectConnectGateway: allowedPrefixes,
          }),
        ),
      logger,
      logPrefix,
    );

    const proposalId = response.directConnectGatewayAssociationProposal?.proposalId;
    logger.info(
      `DX Gateway proposal created: ${proposalId} (requires manual acceptance in DX GW owner account)`,
      logPrefix,
    );

    return DirectConnectGatewayAssociation.buildDxResponse('created', tgwRegion, assoc.name, dxgw.name, 'proposal');
  }

  /**
   * Checks if a DX Gateway ↔ TGW association already exists.
   * @param dxClient - Direct Connect client scoped to the correct account/region
   * @param dxgwId - DX Gateway AWS ID
   * @param tgwId - Transit Gateway AWS ID
   * @param logPrefix - Structured logging prefix
   * @returns Association ID and state if found, undefined otherwise
   */
  private static async findExistingAssociation(
    dxClient: DirectConnectClient,
    dxgwId: string,
    tgwId: string,
    logPrefix: string,
  ): Promise<{ associationId: string; state: DxAssociationState; allowedPrefixes: string[] } | undefined> {
    const response = await executeApi(
      'DescribeDirectConnectGatewayAssociationsCommand',
      { directConnectGatewayId: dxgwId, associatedGatewayId: tgwId },
      () =>
        dxClient.send(
          new DescribeDirectConnectGatewayAssociationsCommand({
            directConnectGatewayId: dxgwId,
            associatedGatewayId: tgwId,
          }),
        ),
      logger,
      logPrefix,
    );

    const match = (response.directConnectGatewayAssociations ?? []).find(a => a.associatedGateway?.id === tgwId);
    if (match?.associationId && match.associationState) {
      const allowedPrefixes = (match.allowedPrefixesToDirectConnectGateway ?? [])
        .map(p => p.cidr ?? '')
        .filter(Boolean);
      return {
        associationId: match.associationId,
        state: match.associationState as DxAssociationState,
        allowedPrefixes,
      };
    }
    return undefined;
  }

  /**
   * Polls a DX Gateway association until it reaches the expected state.
   * @param dxClient - Direct Connect client
   * @param associationId - Association ID to poll
   * @param expectedState - Target state (e.g. 'associated')
   * @param logPrefix - Structured logging prefix
   * @param terminalFailureStates - Optional states that indicate an unrecoverable failure
   * @throws Error if the association does not reach the expected state within timeout
   */
  /**
   * Polls a DX Gateway association until it reaches the expected terminal state.
   *
   * AWS association states: associating → associated → disassociating → disassociated → (removed).
   * After reaching `disassociated`, AWS eventually removes the association from Describe responses
   * entirely. An empty response is treated as equivalent to `disassociated`.
   */
  private static async pollAssociationState(
    dxClient: DirectConnectClient,
    associationId: string,
    expectedState: DxAssociationState,
    logPrefix: string,
    terminalFailureStates?: DxAssociationState[],
  ): Promise<void> {
    for (let i = 0; i < MAX_POLL_RETRIES; i++) {
      const response = await executeApi(
        'DescribeDirectConnectGatewayAssociationsCommand',
        { associationId },
        () => dxClient.send(new DescribeDirectConnectGatewayAssociationsCommand({ associationId })),
        logger,
        logPrefix,
      );

      const associations = response?.directConnectGatewayAssociations ?? [];
      if (associations.length === 0 && expectedState === DxAssociationState.DISASSOCIATED) {
        return; // Association removed from API — equivalent to disassociated
      }
      const state = associations[0]?.associationState;
      if (state === expectedState) {
        return;
      }
      // Fail fast if the association entered an unrecoverable state
      if (state && (terminalFailureStates as string[] | undefined)?.includes(state)) {
        throw new Error(
          `DX Gateway association ${associationId} entered terminal state: ${state} while waiting for ${expectedState}`,
        );
      }
      logger.info(`  Polling DX association ${associationId}: ${state} (waiting for ${expectedState})`, logPrefix);
      await DirectConnectGatewayAssociation.sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`DX Gateway association ${associationId} did not reach ${expectedState} state within timeout`);
  }

  /**
   * Finds the TGW attachment created by a DX Gateway association.
   * @param ec2 - EC2 client scoped to the TGW owner account/region
   * @param dxgwId - DX Gateway AWS ID
   * @param tgwId - Transit Gateway AWS ID
   * @param logPrefix - Structured logging prefix
   * @returns TGW attachment ID
   * @throws Error if no available attachment is found
   */
  private static async getDxAttachmentId(
    ec2: EC2Client,
    dxgwId: string,
    tgwId: string,
    logPrefix: string,
  ): Promise<string> {
    const filters = [
      { Name: 'resource-id', Values: [dxgwId] },
      { Name: 'transit-gateway-id', Values: [tgwId] },
    ];
    let nextToken: string | undefined;
    do {
      const response = await executeApi(
        'DescribeTransitGatewayAttachmentsCommand',
        { Filters: filters },
        () => ec2.send(new DescribeTransitGatewayAttachmentsCommand({ Filters: filters, NextToken: nextToken })),
        logger,
        logPrefix,
      );

      for (const att of response.TransitGatewayAttachments ?? []) {
        if (att.State === TgwAttachmentState.AVAILABLE && att.TransitGatewayAttachmentId) {
          return att.TransitGatewayAttachmentId;
        }
      }
      nextToken = response.NextToken;
    } while (nextToken);

    throw new Error(`TGW attachment not found for DX Gateway ${dxgwId} on TGW ${tgwId}`);
  }

  /**
   * Builds a Direct Connect client, assuming cross-account credentials if needed.
   * @param props - Module request with credentials
   * @param accountId - Target account ID
   * @param region - Target region
   * @returns Configured DirectConnectClient
   */
  private static async buildDxClient(
    props: ITgwModuleRequest,
    accountId: string,
    region: string,
  ): Promise<DirectConnectClient> {
    const credentials = await DirectConnectGatewayAssociation.resolveCredentials(props, accountId, region);
    return new DirectConnectClient({
      region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });
  }

  /**
   * Builds an EC2 client, assuming cross-account credentials if needed.
   * @param props - Module request with credentials
   * @param accountId - Target account ID
   * @param region - Target region
   * @returns Configured EC2Client
   */
  private static async buildEc2Client(props: ITgwModuleRequest, accountId: string, region: string): Promise<EC2Client> {
    const credentials = await DirectConnectGatewayAssociation.resolveCredentials(props, accountId, region);
    return new EC2Client({
      region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });
  }

  /**
   * Resolves credentials for a target account/region, assuming a role if cross-account.
   * @param props - Module request with credentials and partition info
   * @param accountId - Target account ID
   * @param region - Target region
   * @returns Credentials to use for SDK clients
   */
  private static async resolveCredentials(props: ITgwModuleRequest, accountId: string, region: string) {
    if (accountId !== props.invokingAccountId || region !== props.region) {
      const assumed = await getCredentials({
        partition: props.partition,
        accountId,
        region,
        logPrefix: `${props.invokingAccountId}:${props.region}`,
        solutionId: props.solutionId,
        assumeRoleName: props.configuration.accountAccessRoleName,
        credentials: props.credentials,
        sessionPolicy: props.sessionPolicy,
        requireSessionPolicy: !!props.sessionPolicy,
      });
      if (assumed) return assumed;
    }
    return props.credentials;
  }

  private static buildDxResponse(
    operation: IDxAssociationResponse['operation'],
    region: string,
    tgwName: string,
    dxGatewayName: string,
    associationType: IDxAssociationResponse['associationType'],
  ): IDxAssociationResponse {
    return { operation, region, tgwName, dxGatewayName, associationType };
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
