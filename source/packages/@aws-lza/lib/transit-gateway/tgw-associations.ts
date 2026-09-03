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
 * @fileoverview TGW route table association management.
 *
 * Handles the 1:1 constraint: an attachment can only be associated to one
 * route table at a time. Disassociations run before new associations.
 */

import {
  AssociateTransitGatewayRouteTableCommand,
  DisassociateTransitGatewayRouteTableCommand,
  DescribeTransitGatewayAttachmentsCommand,
  EC2Client,
  type TransitGatewayAttachmentAssociation,
  type TransitGatewayAttachment,
} from '@aws-sdk/client-ec2';
import path from 'node:path';
import { createLogger } from '../common/logger';
import { executeApi } from '../common/utility';
import { waitUntil } from '../../common/functions';
import { findAttachmentName } from './functions';
import { IDesiredAttachment, ITgwAssociationResponse, TgwOperationResult } from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

interface IRouteTableTarget {
  routeTableId: string;
  routeTableName: string;
}

interface IDesiredAssociation extends IRouteTableTarget {
  attachment: IDesiredAttachment;
}

interface ICurrentAssociation {
  attachmentId: string;
  routeTableId?: string;
  state?: string;
}

/**
 * Abstract class for managing TGW route table associations.
 *
 * Handles the 1:1 constraint: an attachment can only be associated to one
 * route table at a time. Disassociations run before new associations.
 */
export abstract class TgwAssociations {
  /**
   * Processes all associations for a single TGW with a release/acquire phase barrier.
   * This avoids EC2's 1:1 route table association collision when multiple attachments
   * are moved between route tables in the same run.
   * @param ec2 - EC2 client for the TGW owner account
   * @param transitGatewayId - Transit gateway ID to process
   * @param tgwName - Transit gateway name for response building
   * @param region - Region for response building
   * @param routeTables - Route table IDs and names for the TGW
   * @param desiredByRouteTableId - Desired associations keyed by target route table ID
   * @param knownAttachmentIds - Set of all managed attachment IDs (used for transitional state checks)
   * @param ownedResourceIds - Set of resource IDs previously owned by LZA (used for safe deletion)
   * @param dryRun - Whether to perform dry run without making changes
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to association operation results
   */
  public static async processTransitGateway(
    ec2: EC2Client,
    transitGatewayId: string,
    tgwName: string,
    region: string,
    routeTables: IRouteTableTarget[],
    desiredByRouteTableId: Map<string, IDesiredAttachment[]>,
    knownAttachmentIds: Set<string>,
    ownedResourceIds: Set<string>,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<ITgwAssociationResponse[]> {
    const results: ITgwAssociationResponse[] = [];
    const routeTableNamesById = new Map(routeTables.map(rt => [rt.routeTableId, rt.routeTableName]));
    const desiredByAttachmentId = this.buildDesiredAssociationMap(desiredByRouteTableId, routeTableNamesById);
    const allDesired = [...desiredByAttachmentId.values()].map(d => d.attachment);
    let currentByAttachmentId = await this.getCurrentForTransitGateway(ec2, transitGatewayId, logPrefix);

    if (this.hasManagedTransitionalAssociation(currentByAttachmentId, knownAttachmentIds)) {
      logger.info(
        `TGW ${tgwName} has managed associations in transitional state, waiting for stable state...`,
        logPrefix,
      );
      await waitUntil(async () => {
        const latest = await this.getCurrentForTransitGateway(ec2, transitGatewayId, logPrefix);
        return !this.hasManagedTransitionalAssociation(latest, knownAttachmentIds);
      }, `Associations on TGW ${tgwName} did not reach stable state within timeout`);
      currentByAttachmentId = await this.getCurrentForTransitGateway(ec2, transitGatewayId, logPrefix);
    }

    const toRelease = [...currentByAttachmentId.values()].filter(current => {
      if (!knownAttachmentIds.has(current.attachmentId) || current.state !== 'associated' || !current.routeTableId) {
        return false;
      }
      // Only release if LZA previously owned this association (in state) OR if it needs to move to a different RT
      const resourceKey = `assoc:${current.routeTableId}:${current.attachmentId}`;
      if (!ownedResourceIds.has(resourceKey)) {
        // Not owned by LZA — check if it's a move (desired exists but different RT)
        const desired = desiredByAttachmentId.get(current.attachmentId);
        return !!desired && desired.routeTableId !== current.routeTableId;
      }
      const desired = desiredByAttachmentId.get(current.attachmentId);
      return !desired || desired.routeTableId !== current.routeTableId;
    });
    const toAcquire = [...desiredByAttachmentId.values()].filter(desired => {
      const current = currentByAttachmentId.get(desired.attachment.attachmentId);
      return current?.state !== 'associated' || current.routeTableId !== desired.routeTableId;
    });

    for (const desired of desiredByAttachmentId.values()) {
      const current = currentByAttachmentId.get(desired.attachment.attachmentId);
      if (current?.state === 'associated' && current.routeTableId === desired.routeTableId) {
        results.push(this.buildResponse('exists', region, tgwName, desired.routeTableName, desired.attachment));
      }
    }

    const releaseFailures = new Set<string>();
    const releaseStarted: ICurrentAssociation[] = [];
    for (const current of toRelease) {
      const routeTableName = routeTableNamesById.get(current.routeTableId!) ?? current.routeTableId!;
      const attachment = desiredByAttachmentId.get(current.attachmentId)?.attachment ?? {
        attachmentId: current.attachmentId,
        attachmentName: findAttachmentName(current.attachmentId, allDesired),
        attachmentType: 'vpc' as const,
      };
      const parameters = {
        TransitGatewayRouteTableId: current.routeTableId!,
        TransitGatewayAttachmentId: current.attachmentId,
      };

      if (dryRun) {
        logger.dryRun('DisassociateTransitGatewayRouteTableCommand', parameters, logPrefix);
        results.push(this.buildResponse('deleted', region, tgwName, routeTableName, attachment));
        releaseStarted.push(current);
        continue;
      }

      try {
        await executeApi(
          'DisassociateTransitGatewayRouteTableCommand',
          parameters,
          () => ec2.send(new DisassociateTransitGatewayRouteTableCommand(parameters)),
          logger,
          logPrefix,
        );
        releaseStarted.push(current);
      } catch (e: unknown) {
        if (e instanceof Error && (e.name === 'InvalidAssociation.NotFound' || e.name === 'Resource.NotFound')) {
          logger.warn(`Association already removed for ${attachment.attachmentName} on ${routeTableName}`, logPrefix);
          releaseStarted.push(current);
        } else {
          releaseFailures.add(current.attachmentId);
          results.push(
            this.buildResponse(
              'failed',
              region,
              tgwName,
              routeTableName,
              attachment,
              e instanceof Error ? e.message : String(e),
            ),
          );
        }
      }
    }

    if (!dryRun && releaseStarted.length > 0) {
      let latestByAttachmentId = currentByAttachmentId;
      let releaseWaitFailed = false;
      try {
        await waitUntil(async () => {
          latestByAttachmentId = await this.getCurrentForTransitGateway(ec2, transitGatewayId, logPrefix);
          return releaseStarted.every(release =>
            this.isReleased(latestByAttachmentId.get(release.attachmentId), release),
          );
        }, `Associations on TGW ${tgwName} did not disassociate within timeout`);
      } catch (e: unknown) {
        releaseWaitFailed = true;
        logger.error(e instanceof Error ? e.message : String(e), logPrefix);
      }

      for (const release of releaseStarted) {
        const routeTableName = routeTableNamesById.get(release.routeTableId!) ?? release.routeTableId!;
        const attachment = desiredByAttachmentId.get(release.attachmentId)?.attachment ?? {
          attachmentId: release.attachmentId,
          attachmentName: findAttachmentName(release.attachmentId, allDesired),
          attachmentType: 'vpc' as const,
        };
        if (!releaseWaitFailed || this.isReleased(latestByAttachmentId.get(release.attachmentId), release)) {
          results.push(this.buildResponse('deleted', region, tgwName, routeTableName, attachment));
        } else {
          releaseFailures.add(release.attachmentId);
          results.push(
            this.buildResponse(
              'failed',
              region,
              tgwName,
              routeTableName,
              attachment,
              `Attachment did not disassociate from ${routeTableName}`,
            ),
          );
        }
      }
    }

    const acquireStarted: IDesiredAssociation[] = [];
    for (const desired of toAcquire) {
      const attachmentId = desired.attachment.attachmentId;
      if (releaseFailures.has(attachmentId)) {
        results.push(
          this.buildResponse(
            'failed',
            region,
            tgwName,
            desired.routeTableName,
            desired.attachment,
            'Skipped association because release phase failed for this attachment',
          ),
        );
        continue;
      }

      const parameters = {
        TransitGatewayRouteTableId: desired.routeTableId,
        TransitGatewayAttachmentId: attachmentId,
      };

      if (dryRun) {
        logger.dryRun('AssociateTransitGatewayRouteTableCommand', parameters, logPrefix);
        results.push(this.buildResponse('created', region, tgwName, desired.routeTableName, desired.attachment));
        continue;
      }

      try {
        await executeApi(
          'AssociateTransitGatewayRouteTableCommand',
          parameters,
          () => ec2.send(new AssociateTransitGatewayRouteTableCommand(parameters)),
          logger,
          logPrefix,
        );
        acquireStarted.push(desired);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'Resource.AlreadyAssociated') {
          let currentAssociation: TransitGatewayAttachmentAssociation | undefined;
          try {
            currentAssociation = await this.getAttachmentAssociation(ec2, attachmentId, logPrefix);
          } catch (describeError: unknown) {
            results.push(
              this.buildResponse(
                'failed',
                region,
                tgwName,
                desired.routeTableName,
                desired.attachment,
                describeError instanceof Error ? describeError.message : String(describeError),
              ),
            );
            continue;
          }
          if (
            currentAssociation?.State === 'associated' &&
            currentAssociation.TransitGatewayRouteTableId === desired.routeTableId
          ) {
            logger.info(
              `Association already exists for ${desired.attachment.attachmentName} → ${desired.routeTableName}, treating as exists`,
              logPrefix,
            );
            results.push(this.buildResponse('exists', region, tgwName, desired.routeTableName, desired.attachment));
          } else {
            results.push(
              this.buildResponse(
                'failed',
                region,
                tgwName,
                desired.routeTableName,
                desired.attachment,
                `Attachment is already associated to ${currentAssociation?.TransitGatewayRouteTableId ?? 'unknown route table'}`,
              ),
            );
          }
        } else {
          results.push(
            this.buildResponse(
              'failed',
              region,
              tgwName,
              desired.routeTableName,
              desired.attachment,
              e instanceof Error ? e.message : String(e),
            ),
          );
        }
      }
    }

    if (!dryRun && acquireStarted.length > 0) {
      let latestByAttachmentId = currentByAttachmentId;
      let acquireWaitFailed = false;
      try {
        await waitUntil(async () => {
          latestByAttachmentId = await this.getCurrentForTransitGateway(ec2, transitGatewayId, logPrefix);
          return acquireStarted.every(acquire =>
            this.isAssociated(latestByAttachmentId.get(acquire.attachment.attachmentId), acquire),
          );
        }, `Associations on TGW ${tgwName} did not associate within timeout`);
      } catch (e: unknown) {
        acquireWaitFailed = true;
        logger.error(e instanceof Error ? e.message : String(e), logPrefix);
      }

      for (const acquire of acquireStarted) {
        if (
          !acquireWaitFailed ||
          this.isAssociated(latestByAttachmentId.get(acquire.attachment.attachmentId), acquire)
        ) {
          results.push(this.buildResponse('created', region, tgwName, acquire.routeTableName, acquire.attachment));
        } else {
          results.push(
            this.buildResponse(
              'failed',
              region,
              tgwName,
              acquire.routeTableName,
              acquire.attachment,
              `Attachment did not associate to ${acquire.routeTableName}`,
            ),
          );
        }
      }
    }

    return results;
  }

  /**
   * Returns the attachment's current route table association (or undefined if none), used to
   * detect and complete association MOVES. EC2 returns Resource.AlreadyAssociated on associate
   * regardless of which route table the attachment is currently on, so we describe the attachment
   * to learn the actual association and its state.
   * @param ec2 - EC2 client instance
   * @param attachmentId - Transit gateway attachment ID
   * @param logPrefix - Prefix for logging messages
   * @returns The attachment's Association, or undefined if it has none
   */
  private static async getAttachmentAssociation(
    ec2: EC2Client,
    attachmentId: string,
    logPrefix: string,
  ): Promise<TransitGatewayAttachmentAssociation | undefined> {
    const response = await executeApi(
      'DescribeTransitGatewayAttachmentsCommand',
      { TransitGatewayAttachmentIds: [attachmentId] },
      () => ec2.send(new DescribeTransitGatewayAttachmentsCommand({ TransitGatewayAttachmentIds: [attachmentId] })),
      logger,
      logPrefix,
    );
    return response.TransitGatewayAttachments?.[0]?.Association;
  }

  /**
   * Builds desired associations keyed by attachment ID.
   * @param desiredByRouteTableId - Desired associations keyed by route table ID
   * @param routeTableNamesById - Route table names keyed by route table ID
   * @returns Map of attachment ID to desired association target
   */
  private static buildDesiredAssociationMap(
    desiredByRouteTableId: Map<string, IDesiredAttachment[]>,
    routeTableNamesById: Map<string, string>,
  ): Map<string, IDesiredAssociation> {
    const result = new Map<string, IDesiredAssociation>();
    for (const [routeTableId, desiredAttachments] of desiredByRouteTableId) {
      const routeTableName = routeTableNamesById.get(routeTableId) ?? routeTableId;
      for (const attachment of desiredAttachments) {
        if (result.has(attachment.attachmentId)) {
          const existing = result.get(attachment.attachmentId)!;
          throw new Error(
            `Attachment "${attachment.attachmentName}" is associated with multiple route tables: ` +
              `"${existing.routeTableName}" and "${routeTableName}"`,
          );
        }
        result.set(attachment.attachmentId, { routeTableId, routeTableName, attachment });
      }
    }
    return result;
  }

  /**
   * Queries current attachment associations for a transit gateway with pagination.
   * @param ec2 - EC2 client instance
   * @param transitGatewayId - Transit gateway ID to query
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to current associations keyed by attachment ID
   */
  private static async getCurrentForTransitGateway(
    ec2: EC2Client,
    transitGatewayId: string,
    logPrefix: string,
  ): Promise<Map<string, ICurrentAssociation>> {
    const attachments: TransitGatewayAttachment[] = [];
    let nextToken: string | undefined;
    do {
      const parameters = {
        Filters: [{ Name: 'transit-gateway-id', Values: [transitGatewayId] }],
        NextToken: nextToken,
      };
      const response = await executeApi(
        'DescribeTransitGatewayAttachmentsCommand',
        parameters,
        () => ec2.send(new DescribeTransitGatewayAttachmentsCommand(parameters)),
        logger,
        logPrefix,
      );
      attachments.push(...(response.TransitGatewayAttachments ?? []));
      nextToken = response.NextToken;
    } while (nextToken);

    const result = new Map<string, ICurrentAssociation>();
    for (const attachment of attachments) {
      if (!attachment.TransitGatewayAttachmentId) continue;
      result.set(attachment.TransitGatewayAttachmentId, {
        attachmentId: attachment.TransitGatewayAttachmentId,
        routeTableId: attachment.Association?.TransitGatewayRouteTableId,
        state: attachment.Association?.State,
      });
    }
    return result;
  }

  /**
   * Determines whether an association state is transitional.
   * @param state - Association state to check
   * @returns True when the state is associating or disassociating
   */
  private static isTransitional(state: string | undefined): boolean {
    return state === 'associating' || state === 'disassociating';
  }

  /**
   * Determines whether any managed attachment association is in a transitional state.
   * @param associationsByAttachmentId - Current associations keyed by attachment ID
   * @param knownAttachmentIds - Set of managed attachment IDs
   * @returns True when a managed association is associating or disassociating
   */
  private static hasManagedTransitionalAssociation(
    associationsByAttachmentId: Map<string, ICurrentAssociation>,
    knownAttachmentIds: Set<string>,
  ): boolean {
    return [...associationsByAttachmentId.values()].some(
      association => knownAttachmentIds.has(association.attachmentId) && this.isTransitional(association.state),
    );
  }

  /**
   * Determines whether a release operation has completed.
   * @param current - Current association state after polling
   * @param release - Original association being released
   * @returns True when the original route table association is gone
   */
  private static isReleased(current: ICurrentAssociation | undefined, release: ICurrentAssociation): boolean {
    return (
      current === undefined ||
      current.state === undefined ||
      current.state === 'disassociated' ||
      current.routeTableId !== release.routeTableId
    );
  }

  /**
   * Determines whether an attachment is associated to its desired route table.
   * @param current - Current association state after polling
   * @param desired - Desired association target
   * @returns True when the attachment is associated to the desired route table
   */
  private static isAssociated(current: ICurrentAssociation | undefined, desired: IDesiredAssociation): boolean {
    return current?.state === 'associated' && current.routeTableId === desired.routeTableId;
  }

  /**
   * Builds a typed association response.
   * @param operation - Operation result for the association
   * @param region - Region for response building
   * @param tgwName - Transit gateway name for response building
   * @param routeTableName - Route table name for response building
   * @param attachment - Desired attachment used for response details
   * @param errorMessage - Optional error message for failed operations
   * @returns TGW association response
   */
  private static buildResponse(
    operation: TgwOperationResult,
    region: string,
    tgwName: string,
    routeTableName: string,
    attachment: IDesiredAttachment,
    errorMessage?: string,
  ): ITgwAssociationResponse {
    return {
      operation,
      region,
      tgwName,
      routeTableName,
      attachmentType: attachment.attachmentType,
      attachmentName: attachment.attachmentName,
      ...(errorMessage ? { errorMessage } : {}),
    };
  }
}
