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
 * @fileoverview TGW Attachment Resolver - Resolves human-readable config names into AWS resource IDs
 *
 * Provides resolution of Transit Gateway, route table, and attachment identifiers
 * from configuration names. Supports two resolution paths:
 *   - SSM Parameters (when dataSources.ssmParameterPrefix is provided)
 *   - EC2 Describe APIs (fallback for standalone CLI)
 *
 * Key capabilities:
 * - Cross-account SSM parameter resolution via GetSsmParametersValueModule (batch API)
 * - VPC attachment ID resolution via SSM with cross-account support
 * - VPN attachment ID resolution via EC2 Describe API
 * - Batched and grouped operations for efficiency
 */

import {
  DescribeTransitGatewayAttachmentsCommand,
  DescribeVpnConnectionsCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import path from 'node:path';
import { AssumeRoleCredentialType } from '../common/interfaces';
import { createLogger } from '../common/logger';
import { getCredentials } from '../common/sts-functions';
import { executeApi, setRetryStrategy } from '../common/utility';
import { GetSsmParametersValueModule } from '../aws-ssm/get-parameters';
import { IGetSsmParametersValueConfiguration } from '../../interfaces/aws-ssm/get-parameters';
import { ITgwConfig, ITgwModuleRequest, ITgwResolvedContext } from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

interface TgwSsmEntry extends IGetSsmParametersValueConfiguration {
  /** Logical key used to index the result (caller-defined) */
  key: string;
  /** Resolution target type */
  target: 'tgw' | 'rt' | 'attachment';
}

/** Pending VPN lookup entry */
interface IVpnLookupEntry {
  vpnName: string;
  tgwId: string;
  tgwName: string;
  cgwAccountId: string;
}

/** A group of VPN lookups scoped to a single account and region */
interface IVpnLookupGroup {
  accountId: string;
  region: string;
  pending: Map<string, IVpnLookupEntry>;
}

/**
 * Abstract class for resolving TGW attachment identifiers from configuration
 */
export abstract class TransitGatewayAttachmentLookup {
  /**
   * Resolves all TGW, route table, and attachment IDs from config
   */
  public static async resolveAttachments(props: ITgwModuleRequest, logPrefix: string): Promise<ITgwResolvedContext> {
    const config = props.configuration;
    const ssmPrefix = config.dataSources?.ssmParameterPrefix;

    const context: ITgwResolvedContext = {
      transitGatewayIds: new Map(),
      routeTableIds: new Map(),
      attachmentIds: new Map(),
    };

    if (config.transitGateways.length === 0) {
      return context;
    }

    if (!ssmPrefix) {
      return TransitGatewayAttachmentLookup.resolveDescribePath(props, context, logPrefix).then(() => context);
    }

    await TransitGatewayAttachmentLookup.resolveSsmPath(props, ssmPrefix, context, logPrefix);
    return context;
  }

  /**
   * Resolves TGW, route table, VPC attachment, and VPN attachment IDs via SSM parameters
   * using GetSsmParametersValueModule (batch API with auto-grouping by account/region).
   */
  private static async resolveSsmPath(
    props: ITgwModuleRequest,
    ssmPrefix: string,
    context: ITgwResolvedContext,
    logPrefix: string,
  ): Promise<void> {
    const config = props.configuration;
    const tgwByName = new Map(config.transitGateways.map(tgw => [tgw.name, tgw]));

    const tgwEntries: TgwSsmEntry[] = [];
    for (const tgw of config.transitGateways) {
      const assumeRoleArn = TransitGatewayAttachmentLookup.buildAssumeRoleArn(props, tgw.accountId);
      tgwEntries.push({
        key: tgw.name,
        name: `${ssmPrefix}/network/transitGateways/${tgw.name}/id`,
        region: tgw.region,
        assumeRoleArn,
        target: 'tgw',
      });
      for (const rt of tgw.routeTables) {
        tgwEntries.push({
          key: `${tgw.name}_${rt.name}`,
          name: `${ssmPrefix}/network/transitGateways/${tgw.name}/routeTables/${rt.name}/id`,
          region: tgw.region,
          assumeRoleArn,
          target: 'rt',
        });
      }
    }

    const vpcAttachments = config.attachments.filter(a => a.type === 'vpc');
    for (const att of vpcAttachments) {
      const tgw = tgwByName.get(att.transitGateway);
      if (!tgw) {
        throw new Error(
          `TGW '${att.transitGateway}' not found in config — cannot resolve VPC attachment '${att.name}'`,
        );
      }
      const ssmAttachmentName = att.attachmentName ? att.attachmentName : att.name;
      const assumeRoleArn = TransitGatewayAttachmentLookup.buildAssumeRoleArn(props, att.accountId);
      tgwEntries.push({
        key: `${att.transitGateway}_${att.accountId}_${att.name}`,
        name: `${ssmPrefix}/network/vpc/${att.name}/transitGatewayAttachment/${ssmAttachmentName}/id`,
        region: tgw.region,
        assumeRoleArn,
        target: 'attachment',
      });
    }

    logger.info(`Resolving ${tgwEntries.length} SSM parameters for TGW resources`, logPrefix);

    const module = new GetSsmParametersValueModule();
    const ssmResults = await module.handler({
      operation: 'get-parameters',
      partition: props.partition,
      region: props.region,
      solutionId: props.solutionId,
      credentials: props.credentials,
      configuration: tgwEntries,
    });

    // Map results back by caller-provided logical key.
    const resultByName = new Map(ssmResults.map(r => [r.name, r]));
    for (const entry of tgwEntries) {
      const result = resultByName.get(entry.key) ?? resultByName.get(entry.name);
      if (!result?.exists || !result.value) {
        throw new Error(`SSM parameter not found: ${entry.name}`);
      }
      const targetMap =
        entry.target === 'tgw'
          ? context.transitGatewayIds
          : entry.target === 'rt'
            ? context.routeTableIds
            : context.attachmentIds;
      targetMap.set(entry.key, result.value);
    }

    logger.info(
      `Resolved ${context.transitGatewayIds.size} TGW IDs, ${context.routeTableIds.size} route table IDs, and ${context.attachmentIds.size} VPC attachment IDs`,
      logPrefix,
    );

    await TransitGatewayAttachmentLookup.resolveVpnAttachmentsDescribe(props, tgwByName, context, logPrefix);
  }

  /**
   * Builds a full IAM role ARN for cross-account access.
   * Returns undefined if the target account is the invoking account (no assume needed).
   */
  private static buildAssumeRoleArn(props: ITgwModuleRequest, targetAccountId: string): string | undefined {
    if (targetAccountId === props.invokingAccountId) {
      return undefined;
    }
    return `arn:${props.partition}:iam::${targetAccountId}:role/${props.configuration.accountAccessRoleName}`;
  }

  /**
   * Resolves VPN attachment IDs via EC2 Describe API.
   * DescribeVpnConnections runs in the CGW owner account; DescribeTransitGatewayAttachments runs in the TGW owner account.
   */
  private static async resolveVpnAttachmentsDescribe(
    props: ITgwModuleRequest,
    tgwByName: Map<string, ITgwConfig>,
    context: ITgwResolvedContext,
    logPrefix: string,
  ): Promise<void> {
    const vpnAttachments = props.configuration.attachments.filter(a => a.type === 'vpn');
    if (vpnAttachments.length === 0) return;

    logger.info(`Resolving ${vpnAttachments.length} VPN attachment IDs via EC2 Describe API`, logPrefix);

    const byAccountRegion = TransitGatewayAttachmentLookup.groupVpnAttachmentsByAccountRegion(
      vpnAttachments,
      tgwByName,
      context,
    );

    for (const group of byAccountRegion.values()) {
      await TransitGatewayAttachmentLookup.describeVpnAttachmentsForGroup(props, group, context, logPrefix);
    }
  }

  /**
   * Groups VPN attachment configs by owning TGW account and region
   */
  private static groupVpnAttachmentsByAccountRegion(
    vpnAttachments: ITgwModuleRequest['configuration']['attachments'],
    tgwByName: Map<string, ITgwConfig>,
    context: ITgwResolvedContext,
  ): Map<string, IVpnLookupGroup> {
    const groups = new Map<string, IVpnLookupGroup>();

    for (const att of vpnAttachments) {
      const tgw = tgwByName.get(att.transitGateway);
      if (!tgw) {
        throw new Error(
          `TGW '${att.transitGateway}' not found in config — cannot look up VPN attachment '${att.name}'`,
        );
      }
      const tgwId = context.transitGatewayIds.get(att.transitGateway)!;
      const groupKey = `${tgw.accountId}_${tgw.region}`;
      const group = groups.get(groupKey) ?? {
        accountId: tgw.accountId,
        region: tgw.region,
        pending: new Map(),
      };
      const key = `${att.transitGateway}_${att.accountId}_${att.name}`;
      group.pending.set(key, { vpnName: att.name, tgwId, tgwName: att.transitGateway, cgwAccountId: att.accountId });
      groups.set(groupKey, group);
    }

    return groups;
  }

  /**
   * Resolves VPN attachment IDs for a single TGW-owner account/region group.
   */
  private static async describeVpnAttachmentsForGroup(
    props: ITgwModuleRequest,
    group: IVpnLookupGroup,
    context: ITgwResolvedContext,
    logPrefix: string,
  ): Promise<void> {
    const { accountId: tgwAccountId, region, pending: pendingLookups } = group;
    logger.info(
      `Looking up ${pendingLookups.size} VPN attachments in TGW account ${tgwAccountId} region ${region}`,
      logPrefix,
    );

    const cgwGroups = new Map<string, Map<string, IVpnLookupEntry>>();
    for (const [key, entry] of pendingLookups) {
      const cgwMap = cgwGroups.get(entry.cgwAccountId) ?? new Map();
      cgwMap.set(key, entry);
      cgwGroups.set(entry.cgwAccountId, cgwMap);
    }

    const vpnConnectionIdMap = new Map<string, string>();
    for (const [cgwAccountId, cgwPending] of cgwGroups) {
      const cgwCredentials = await TransitGatewayAttachmentLookup.resolveCredentials(
        props,
        cgwAccountId,
        region,
        logPrefix,
      );
      const cgwEc2Client = new EC2Client({
        region,
        customUserAgent: props.solutionId,
        retryStrategy: setRetryStrategy(),
        credentials: cgwCredentials,
      });
      const resolved = await TransitGatewayAttachmentLookup.resolveVpnConnectionIds(
        cgwEc2Client,
        cgwPending,
        logPrefix,
      );
      for (const [k, v] of resolved) {
        vpnConnectionIdMap.set(k, v);
      }
    }

    const tgwCredentials = await TransitGatewayAttachmentLookup.resolveCredentials(
      props,
      tgwAccountId,
      region,
      logPrefix,
    );
    const tgwEc2Client = new EC2Client({
      region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: tgwCredentials,
    });

    const tgwIds = [...new Set([...pendingLookups.values()].map(l => l.tgwId))];

    await TransitGatewayAttachmentLookup.paginateVpnAttachmentLookup(
      tgwEc2Client,
      tgwIds,
      pendingLookups,
      vpnConnectionIdMap,
      context,
      logPrefix,
    );

    if (pendingLookups.size > 0) {
      const missing = [...pendingLookups.values()].map(v => `${v.vpnName} on ${v.tgwName}`).join(', ');
      throw new Error(`VPN TGW attachments not found in ${region}: ${missing}`);
    }

    logger.info(`Resolved VPN attachment IDs in TGW account ${tgwAccountId} region ${region}`, logPrefix);
  }

  /**
   * Resolves credentials for a target account/region, assuming a role if needed
   */
  private static async resolveCredentials(
    props: ITgwModuleRequest,
    accountId: string,
    region: string,
    logPrefix: string,
  ): Promise<AssumeRoleCredentialType | undefined> {
    if (accountId === props.invokingAccountId && region === props.region) {
      return props.credentials;
    }
    const assumed = await getCredentials({
      partition: props.partition,
      accountId,
      region,
      logPrefix,
      solutionId: props.solutionId,
      assumeRoleName: props.configuration.accountAccessRoleName,
      credentials: props.credentials,
      sessionPolicy: props.sessionPolicy,
      requireSessionPolicy: !!props.sessionPolicy,
    });
    return assumed ?? props.credentials;
  }

  /**
   * Paginates through DescribeTransitGatewayAttachments and matches VPN attachments
   * by Name tag, removing matched entries from pendingLookups as they are found.
   */
  private static async paginateVpnAttachmentLookup(
    ec2Client: EC2Client,
    tgwIds: string[],
    pendingLookups: Map<string, IVpnLookupEntry>,
    vpnConnectionIdMap: Map<string, string>,
    context: ITgwResolvedContext,
    logPrefix: string,
  ): Promise<void> {
    const commandName = 'DescribeTransitGatewayAttachmentsCommand';
    let nextToken: string | undefined;

    do {
      const parameters = {
        Filters: [
          { Name: 'resource-type', Values: ['vpn'] },
          { Name: 'transit-gateway-id', Values: tgwIds },
        ],
        NextToken: nextToken,
      };

      const response = await executeApi(
        commandName,
        parameters,
        () => ec2Client.send(new DescribeTransitGatewayAttachmentsCommand(parameters)),
        logger,
        logPrefix,
      );

      for (const attachment of response.TransitGatewayAttachments ?? []) {
        if (attachment.State !== 'available') continue;

        for (const [key, lookup] of pendingLookups) {
          const expectedVpnId = vpnConnectionIdMap.get(key);
          if (
            expectedVpnId &&
            attachment.TransitGatewayId === lookup.tgwId &&
            attachment.ResourceId === expectedVpnId
          ) {
            context.attachmentIds.set(key, attachment.TransitGatewayAttachmentId!);
            pendingLookups.delete(key);
          }
        }
      }

      if (pendingLookups.size === 0) break;
      nextToken = response.NextToken;
    } while (nextToken);
  }

  /**
   * Resolves VPN connection names to VPN connection IDs via a single DescribeVpnConnections call.
   * Batches all VPN names for the group into one API call, then matches results by Name tag.
   */
  private static async resolveVpnConnectionIds(
    ec2Client: EC2Client,
    pendingLookups: Map<string, IVpnLookupEntry>,
    logPrefix: string,
  ): Promise<Map<string, string>> {
    const vpnConnectionIdMap = new Map<string, string>();

    const allVpnNames = [...new Set([...pendingLookups.values()].map(l => l.vpnName))];
    const allTgwIds = [...new Set([...pendingLookups.values()].map(l => l.tgwId))];

    const commandName = 'DescribeVpnConnectionsCommand';
    const parameters = {
      Filters: [
        { Name: 'tag:Name', Values: allVpnNames },
        { Name: 'transit-gateway-id', Values: allTgwIds },
        { Name: 'state', Values: ['available'] },
      ],
    };

    const response = await executeApi(
      commandName,
      parameters,
      () => ec2Client.send(new DescribeVpnConnectionsCommand(parameters)),
      logger,
      logPrefix,
    );

    const vpnConnections = response.VpnConnections ?? [];

    // Index VPN connections by Name tag + TGW ID for O(1) lookup
    const vpnByNameAndTgw = new Map<string, string>();
    for (const vpn of vpnConnections) {
      const nameTag = (vpn.Tags ?? []).find(t => t.Key === 'Name')?.Value;
      const tgwId = vpn.TransitGatewayId;
      if (nameTag && tgwId && vpn.VpnConnectionId) {
        const indexKey = `${nameTag}_${tgwId}`;
        if (vpnByNameAndTgw.has(indexKey)) {
          throw new Error(`Multiple VPN connections found with name '${nameTag}' on TGW ${tgwId}`);
        }
        vpnByNameAndTgw.set(indexKey, vpn.VpnConnectionId);
      }
    }

    for (const [key, lookup] of pendingLookups) {
      const indexKey = `${lookup.vpnName}_${lookup.tgwId}`;
      const vpnConnectionId = vpnByNameAndTgw.get(indexKey);
      if (!vpnConnectionId) {
        throw new Error(`No VPN connection found with name '${lookup.vpnName}' on TGW ${lookup.tgwId}`);
      }
      vpnConnectionIdMap.set(key, vpnConnectionId);
    }

    return vpnConnectionIdMap;
  }

  // TODO: Implement Describe API resolution path for standalone CLI usage
  /* eslint-disable @typescript-eslint/no-unused-vars */
  private static async resolveDescribePath(
    _props: ITgwModuleRequest,
    _context: ITgwResolvedContext,
    _logPrefix: string,
  ): Promise<void> {
    throw new Error('Describe API resolution path not yet implemented. Provide dataSources.ssmParameterPrefix.');
  }
}
