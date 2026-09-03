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
 * @fileoverview Phase 2 orchestrator: TGW route table associations and propagations.
 *
 * Groups TGWs by owner account/region, iterates route tables, resolves desired
 * state, and delegates to TgwAssociations and TgwPropagations for execution.
 */

import { EC2Client } from '@aws-sdk/client-ec2';
import path from 'node:path';
import { createLogger } from '../common/logger';
import { getEc2Client } from './functions';
import {
  IAccountRegionGroup,
  IDesiredAttachment,
  ITgwAttachmentConfig,
  ITgwConfig,
  ITgwModuleRequest,
  ITgwOwnedResource,
  ITgwResolvedContext,
  ITgwAssociationResponse,
  ITgwPropagationResponse,
} from './interfaces';
import { TgwAssociations } from './tgw-associations';
import { TgwPropagations } from './tgw-propagations';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Backward-compatible entry point called by tgw.ts.
 * Delegates to TgwRouteTables.configure().
 * @param props - TGW module request containing configuration and credentials
 * @param context - Resolved TGW/RT/attachment IDs
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to association and propagation results
 */
export async function configureAssociationsAndPropagations(
  props: ITgwModuleRequest,
  context: ITgwResolvedContext,
  logPrefix: string,
): Promise<{
  associations: ITgwAssociationResponse[];
  propagations: ITgwPropagationResponse[];
  ownedResources: ITgwOwnedResource[];
}> {
  return TgwRouteTables.configure(props, context, logPrefix);
}

/**
 * Abstract class for orchestrating TGW route table associations and propagations.
 *
 * Groups TGWs by owner account/region, creates EC2 clients, iterates route tables,
 * and delegates to TgwAssociations and TgwPropagations for the actual SDK operations.
 */
export abstract class TgwRouteTables {
  /**
   * Configures associations and propagations for all route tables across all TGWs.
   * @param props - TGW module request containing configuration and credentials
   * @param context - Resolved TGW/RT/attachment IDs from Phase 1
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to association and propagation results
   */
  public static async configure(
    props: ITgwModuleRequest,
    context: ITgwResolvedContext,
    logPrefix: string,
  ): Promise<{
    associations: ITgwAssociationResponse[];
    propagations: ITgwPropagationResponse[];
    ownedResources: ITgwOwnedResource[];
  }> {
    const config = props.configuration;
    const dryRun = props.dryRun ?? false;
    const results: { associations: ITgwAssociationResponse[]; propagations: ITgwPropagationResponse[] } = {
      associations: [],
      propagations: [],
    };

    this.validateRouteTableReferences(config.transitGateways, config.attachments);

    const knownAttachmentIds = new Set(context.attachmentIds.values());

    // Build owned resource IDs set from previously saved state (passed via config)
    const ownedResourceIds = new Set(config.ownedResources ?? []);

    const byAccountRegion = this.groupByAccountRegion(config.transitGateways);

    for (const group of byAccountRegion.values()) {
      const ec2Client = await getEc2Client(props, group.accountId, group.region, logPrefix);

      for (const tgwName of group.tgwNames) {
        const tgwConfig = config.transitGateways.find(t => t.name === tgwName)!;
        const tgwId = context.transitGatewayIds.get(tgwName);
        if (!tgwId) {
          throw new Error(`Transit gateway ID not resolved for ${tgwName}`);
        }

        const routeTables = tgwConfig.routeTables.map(rt => {
          const routeTableId = context.routeTableIds.get(`${tgwName}_${rt.name}`);
          if (!routeTableId) {
            throw new Error(`Route table ID not resolved for ${tgwName}_${rt.name}`);
          }
          return { routeTableId, routeTableName: rt.name };
        });
        const desiredAssociationsByRouteTableId = new Map<string, IDesiredAttachment[]>();
        for (const rt of routeTables) {
          desiredAssociationsByRouteTableId.set(
            rt.routeTableId,
            this.getDesiredAttachments(config.attachments, tgwName, rt.routeTableName, 'association', context),
          );
        }

        results.associations.push(
          ...(await TgwAssociations.processTransitGateway(
            ec2Client,
            tgwId,
            tgwName,
            group.region,
            routeTables,
            desiredAssociationsByRouteTableId,
            knownAttachmentIds,
            ownedResourceIds,
            dryRun,
            logPrefix,
          )),
        );

        for (const rt of routeTables) {
          results.propagations.push(
            ...(await this.processRouteTablePropagations(
              ec2Client,
              config.attachments,
              context,
              knownAttachmentIds,
              ownedResourceIds,
              tgwName,
              rt.routeTableName,
              group.region,
              dryRun,
              logPrefix,
            )),
          );
        }
      }
    }

    // Build owned resources from desired config: everything resolved and in config is owned by LZA.
    // Uses the same attachment IDs and route table IDs that Phase 2 used for operations.
    const ownedResources: ITgwOwnedResource[] = [];
    logger.info(`Building owned resources from ${config.attachments.length} attachments`, logPrefix);
    for (const attachment of config.attachments) {
      const attKey = `${attachment.transitGateway}_${attachment.accountId}_${attachment.name}`;
      const attId = context.attachmentIds.get(attKey);
      if (!attId) {
        logger.info(`  Skipping attachment ${attKey} — not resolved in context`, logPrefix);
        continue;
      }

      for (const rtName of attachment.routeTableAssociations) {
        const rtId = context.routeTableIds.get(`${attachment.transitGateway}_${rtName}`);
        if (rtId) {
          ownedResources.push(`assoc:${rtId}:${attId}`);
        }
      }
      for (const rtName of attachment.routeTablePropagations) {
        const rtId = context.routeTableIds.get(`${attachment.transitGateway}_${rtName}`);
        if (rtId) {
          ownedResources.push(`prop:${rtId}:${attId}`);
        }
      }
    }
    logger.info(`Owned resources collected: ${ownedResources.length}`, logPrefix);

    return { ...results, ownedResources };
  }

  /**
   * Groups transit gateways by owner account and region for batching EC2 API calls
   * @param transitGateways - Transit gateway configurations
   * @returns Map of "accountId_region" → group with TGW names
   */
  private static groupByAccountRegion(transitGateways: ITgwConfig[]): Map<string, IAccountRegionGroup> {
    const groups = new Map<string, IAccountRegionGroup>();
    for (const tgw of transitGateways) {
      const groupKey = `${tgw.accountId}_${tgw.region}`;
      const group = groups.get(groupKey) ?? { accountId: tgw.accountId, region: tgw.region, tgwNames: [] };
      group.tgwNames.push(tgw.name);
      groups.set(groupKey, group);
    }
    return groups;
  }

  /**
   * Validates that all route table names referenced by attachments exist on their target TGW.
   * Throws an error listing the invalid name and available route tables.
   * @param transitGateways - Transit gateway configurations
   * @param attachments - Attachment configurations to validate
   */
  private static validateRouteTableReferences(
    transitGateways: ITgwConfig[],
    attachments: ITgwAttachmentConfig[],
  ): void {
    const validRtNamesByTgw = new Map<string, Set<string>>();
    for (const tgw of transitGateways) {
      if (validRtNamesByTgw.has(tgw.name)) {
        throw new Error(`Duplicate transit gateway name "${tgw.name}" in configuration`);
      }
      validRtNamesByTgw.set(tgw.name, new Set(tgw.routeTables.map(rt => rt.name)));
    }
    for (const att of attachments) {
      const validNames = validRtNamesByTgw.get(att.transitGateway);
      if (!validNames) {
        logger.warn(
          `Attachment "${att.name}" references unknown transit gateway "${att.transitGateway}" — skipping RT validation`,
          '',
        );
        continue;
      }
      for (const rtName of [...att.routeTableAssociations, ...att.routeTablePropagations]) {
        if (!validNames.has(rtName)) {
          throw new Error(
            `Route table "${rtName}" referenced in attachment "${att.name}" does not exist on TGW "${att.transitGateway}". ` +
              `Available route tables: [${[...validNames].join(', ')}]`,
          );
        }
      }
    }
  }

  /**
   * Processes propagations for a single route table
   * @param ec2 - EC2 client for the TGW owner account
   * @param attachments - All attachment configurations from the request
   * @param context - Resolved TGW/RT/attachment IDs
   * @param knownAttachmentIds - Set of all managed attachment IDs
   * @param ownedResourceIds - Set of resource IDs previously owned by LZA (for safe deletion)
   * @param tgwName - Transit gateway name
   * @param routeTableName - Route table name
   * @param region - Region for response building
   * @param dryRun - Whether to perform dry run without making changes
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to propagation results for this route table
   */
  private static async processRouteTablePropagations(
    ec2: EC2Client,
    attachments: ITgwAttachmentConfig[],
    context: ITgwResolvedContext,
    knownAttachmentIds: Set<string>,
    ownedResourceIds: Set<string>,
    tgwName: string,
    routeTableName: string,
    region: string,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<ITgwPropagationResponse[]> {
    const rtId = context.routeTableIds.get(`${tgwName}_${routeTableName}`);
    if (!rtId) {
      throw new Error(`Route table ID not resolved for ${tgwName}_${routeTableName}`);
    }

    const desiredPropagations = this.getDesiredAttachments(
      attachments,
      tgwName,
      routeTableName,
      'propagation',
      context,
    );

    logger.info(`Processing propagations: ${tgwName} / ${routeTableName} (${rtId})`, logPrefix);
    logger.info(`  Desired: ${desiredPropagations.length} propagations`, logPrefix);

    return TgwPropagations.process(
      ec2,
      rtId,
      routeTableName,
      tgwName,
      region,
      desiredPropagations,
      knownAttachmentIds,
      ownedResourceIds,
      dryRun,
      logPrefix,
    );
  }

  /**
   * Determines desired attachments for a given route table and mode (association or propagation)
   * @param attachments - All attachment configurations from the request
   * @param tgwName - Transit gateway name to filter by
   * @param routeTableName - Route table name to filter by
   * @param mode - Whether to check association or propagation lists
   * @param context - Resolved context containing attachment IDs
   * @returns Array of desired attachments with resolved IDs
   */
  private static getDesiredAttachments(
    attachments: ITgwAttachmentConfig[],
    tgwName: string,
    routeTableName: string,
    mode: 'association' | 'propagation',
    context: ITgwResolvedContext,
  ): IDesiredAttachment[] {
    const result: IDesiredAttachment[] = [];
    for (const att of attachments) {
      if (att.transitGateway !== tgwName) continue;
      const rtList = mode === 'association' ? att.routeTableAssociations : att.routeTablePropagations;
      if (!rtList.includes(routeTableName)) continue;

      const key = `${att.transitGateway}_${att.accountId}_${att.name}`;
      const attachmentId = context.attachmentIds.get(key);
      if (!attachmentId) {
        throw new Error(`Attachment ID not resolved for ${key}`);
      }
      result.push({ attachmentId, attachmentName: att.name, attachmentType: att.type });
    }
    return result;
  }
}
