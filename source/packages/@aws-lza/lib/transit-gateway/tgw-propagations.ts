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
 * @fileoverview TGW route table propagation management.
 *
 * Propagations are 1:many — an attachment can propagate to multiple route
 * tables. Order of enable/disable does not matter.
 */

import {
  EnableTransitGatewayRouteTablePropagationCommand,
  DisableTransitGatewayRouteTablePropagationCommand,
  GetTransitGatewayRouteTablePropagationsCommand,
  EC2Client,
  type TransitGatewayRouteTablePropagation,
} from '@aws-sdk/client-ec2';
import path from 'node:path';
import { createLogger } from '../common/logger';
import { executeApi } from '../common/utility';
import { waitUntil } from '../../common/functions';
import { findAttachmentName } from './functions';
import { IDesiredAttachment, ITgwPropagationResponse, TgwOperationResult } from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Abstract class for managing TGW route table propagations.
 *
 * Propagations are 1:many — an attachment can propagate to multiple route
 * tables. Order of enable/disable does not matter.
 */
export abstract class TgwPropagations {
  /**
   * Processes propagations for a single route table: queries current state,
   * diffs against desired, and executes disable then enable operations.
   * @param ec2 - EC2 client for the TGW owner account
   * @param routeTableId - Route table ID to process
   * @param routeTableName - Route table name for response building
   * @param tgwName - Transit gateway name for response building
   * @param region - Region for response building
   * @param desired - Desired propagations from config
   * @param knownAttachmentIds - Set of all managed attachment IDs (used for transitional state checks)
   * @param ownedResourceIds - Set of resource IDs previously owned by LZA (used for safe deletion)
   * @param dryRun - Whether to perform dry run without making changes
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to propagation operation results
   */
  public static async process(
    ec2: EC2Client,
    routeTableId: string,
    routeTableName: string,
    tgwName: string,
    region: string,
    desired: IDesiredAttachment[],
    knownAttachmentIds: Set<string>,
    ownedResourceIds: Set<string>,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<ITgwPropagationResponse[]> {
    const results: ITgwPropagationResponse[] = [];

    const transitionalStates = ['enabling', 'disabling'];
    let current = await this.getCurrent(ec2, routeTableId, logPrefix);

    if (current.some(p => transitionalStates.includes(p.State!))) {
      logger.info(
        `Route table ${routeTableName} has propagations in transitional state, waiting for stable state...`,
        logPrefix,
      );
      await waitUntil(async () => {
        const latest = await this.getCurrent(ec2, routeTableId, logPrefix);
        return !latest.some(p => transitionalStates.includes(p.State!));
      }, `Propagations on route table ${routeTableName} did not reach stable state within timeout`);
      current = await this.getCurrent(ec2, routeTableId, logPrefix);
    }

    // Filter out disabled items — they are terminal and should not block toCreate
    current = current.filter(p => p.State !== 'disabled');

    const desiredMap = new Map(desired.map(d => [d.attachmentId, d]));
    const currentSet = new Set(current.map(p => p.TransitGatewayAttachmentId!));

    const toCreate = desired.filter(d => !currentSet.has(d.attachmentId));
    const toDelete = current.filter(
      p =>
        knownAttachmentIds.has(p.TransitGatewayAttachmentId!) &&
        ownedResourceIds.has(`prop:${routeTableId}:${p.TransitGatewayAttachmentId!}`) &&
        !desiredMap.has(p.TransitGatewayAttachmentId!) &&
        p.State === 'enabled',
    );
    const existing = desired.filter(d => currentSet.has(d.attachmentId));

    for (const item of existing) {
      results.push(this.buildResponse('exists', region, tgwName, routeTableName, item));
    }

    // Disable propagations to delete
    for (const prop of toDelete) {
      const attachmentId = prop.TransitGatewayAttachmentId!;
      const attachmentName = findAttachmentName(attachmentId, desired);
      const parameters = { TransitGatewayRouteTableId: routeTableId, TransitGatewayAttachmentId: attachmentId };

      if (dryRun) {
        logger.dryRun('DisableTransitGatewayRouteTablePropagationCommand', parameters, logPrefix);
        results.push(
          this.buildResponse('deleted', region, tgwName, routeTableName, {
            attachmentId,
            attachmentName,
            attachmentType: 'vpc',
          }),
        );
        continue;
      }

      try {
        await executeApi(
          'DisableTransitGatewayRouteTablePropagationCommand',
          parameters,
          () => ec2.send(new DisableTransitGatewayRouteTablePropagationCommand(parameters)),
          logger,
          logPrefix,
        );
      } catch (e: unknown) {
        if (
          e instanceof Error &&
          (e.name === 'TransitGatewayRouteTablePropagation.NotFound' || e.name === 'Resource.NotFound')
        ) {
          logger.warn(`Propagation already disabled for ${attachmentName} on ${routeTableName}`, logPrefix);
        } else {
          throw e;
        }
      }
      results.push(
        this.buildResponse('deleted', region, tgwName, routeTableName, {
          attachmentId,
          attachmentName,
          attachmentType: 'vpc',
        }),
      );
    }

    // Enable new propagations
    for (const item of toCreate) {
      const parameters = { TransitGatewayRouteTableId: routeTableId, TransitGatewayAttachmentId: item.attachmentId };

      if (dryRun) {
        logger.dryRun('EnableTransitGatewayRouteTablePropagationCommand', parameters, logPrefix);
        results.push(this.buildResponse('created', region, tgwName, routeTableName, item));
        continue;
      }

      try {
        await executeApi(
          'EnableTransitGatewayRouteTablePropagationCommand',
          parameters,
          () => ec2.send(new EnableTransitGatewayRouteTablePropagationCommand(parameters)),
          logger,
          logPrefix,
        );
        results.push(this.buildResponse('created', region, tgwName, routeTableName, item));
      } catch (e: unknown) {
        if (
          e instanceof Error &&
          (e.name === 'TransitGatewayRouteTablePropagation.Duplicate' ||
            e.name === 'TransitGatewayRouteTablePropagation.AlreadyEnabled')
        ) {
          logger.warn(
            `Propagation already enabled for ${item.attachmentName} → ${routeTableName}, treating as exists`,
            logPrefix,
          );
          results.push(this.buildResponse('exists', region, tgwName, routeTableName, item));
        } else {
          throw e;
        }
      }
    }

    return results;
  }

  /**
   * Queries current propagations for a route table with pagination
   * @param ec2 - EC2 client instance
   * @param routeTableId - Route table ID to query
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to current propagations
   */
  private static async getCurrent(
    ec2: EC2Client,
    routeTableId: string,
    logPrefix: string,
  ): Promise<TransitGatewayRouteTablePropagation[]> {
    const results: TransitGatewayRouteTablePropagation[] = [];
    let nextToken: string | undefined;
    do {
      const response = await executeApi(
        'GetTransitGatewayRouteTablePropagationsCommand',
        { TransitGatewayRouteTableId: routeTableId },
        () =>
          ec2.send(
            new GetTransitGatewayRouteTablePropagationsCommand({
              TransitGatewayRouteTableId: routeTableId,
              NextToken: nextToken,
            }),
          ),
        logger,
        logPrefix,
      );
      results.push(...(response.TransitGatewayRouteTablePropagations ?? []));
      nextToken = response.NextToken;
    } while (nextToken);
    return results;
  }

  /**
   * Builds a typed propagation response
   */
  private static buildResponse(
    operation: TgwOperationResult,
    region: string,
    tgwName: string,
    routeTableName: string,
    attachment: IDesiredAttachment,
  ): ITgwPropagationResponse {
    return {
      operation,
      region,
      tgwName,
      routeTableName,
      attachmentType: attachment.attachmentType,
      attachmentName: attachment.attachmentName,
    };
  }
}
