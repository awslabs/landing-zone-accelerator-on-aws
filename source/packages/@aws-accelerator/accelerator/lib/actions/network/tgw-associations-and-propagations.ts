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
 * @fileoverview LZA Action for Transit Gateway associations and propagations.
 *
 * Thin adapter that reads LZA config (ModuleParams), builds an ITgwModuleRequest,
 * and delegates to configureTgw() in the aws-lza package. Follows the Macie pattern.
 */

import {
  configureTgw,
  createLogger,
  createStatusLogger,
  IDxGatewayConfig,
  IModuleResponse,
  ITgwAttachmentConfig,
  ITgwConnectConfig,
  ITgwModuleRequest,
  ITgwModuleResponse,
  MODULE_STATE_CODE,
} from 'aws-lza';
import path from 'node:path';
import { AseaResourceType } from '@aws-accelerator/config';
import { isIpAddress } from '../../stacks/network-stacks/utils/validation-utils';
import { AcceleratorModules, ModuleParams } from '../../types';
import { loadOrganizationDataSources } from '../utils/common-config';
import { logModuleExecutionResult } from '../utils/module-logging';
import { hasModuleConfigChanged, saveModuleExecutionState, getModuleExecutionState } from '../utils/module-state';
import { loadOwnedResources, compressOwnedResources } from '../utils/resource-ownership-state';

/**
 * TGW associations and propagations configuration for state comparison.
 */
interface ITgwAssociationsConfigForState {
  readonly transitGateways: {
    readonly name: string;
    readonly account: string;
    readonly region: string;
    readonly routeTables: string[];
  }[];
  readonly vpcAttachments: {
    readonly vpcName: string;
    readonly accountId: string;
    readonly region: string;
    readonly transitGatewayName: string;
    readonly routeTableAssociations: string[];
    readonly routeTablePropagations: string[];
  }[];
  readonly vpnAttachments: {
    readonly vpnName: string;
    readonly transitGatewayName: string;
    readonly routeTableAssociations: string[];
    readonly routeTablePropagations: string[];
  }[];
  readonly dxGatewayAssociations: {
    readonly dxGatewayName: string;
    readonly transitGatewayName: string;
    readonly routeTableAssociations: string[];
    readonly routeTablePropagations: string[];
    readonly allowedPrefixes: string[];
  }[];
  readonly connectAttachments: {
    readonly name: string;
    readonly transitGatewayName: string;
    readonly transportType: string;
    readonly transportName: string;
    readonly routeTableAssociations: string[];
    readonly routeTablePropagations: string[];
  }[];
}

/**
 * LZA Action for Transit Gateway route table associations and propagations.
 */
export abstract class TgwAssociationsAndPropagations {
  private static statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Extracts TGW associations/propagations configuration for state comparison.
   */
  private static extractConfig(params: ModuleParams): ITgwAssociationsConfigForState {
    const { networkConfig, accountsConfig } = params.moduleRunnerParameters.configs;

    const transitGateways = (networkConfig.transitGateways ?? []).map(tgw => ({
      name: tgw.name,
      account: tgw.account,
      region: tgw.region,
      routeTables: (tgw.routeTables ?? []).map(rt => rt.name),
    }));

    const vpcAttachments: ITgwAssociationsConfigForState['vpcAttachments'] = [];
    for (const vpc of [...(networkConfig.vpcs ?? []), ...(networkConfig.vpcTemplates ?? [])]) {
      const accountIds =
        'account' in vpc
          ? [accountsConfig.getAccountId(vpc.account)]
          : [...accountsConfig.getAccountIdsFromDeploymentTarget(vpc.deploymentTargets)].sort();

      for (const attachment of vpc.transitGatewayAttachments ?? []) {
        for (const accountId of accountIds) {
          vpcAttachments.push({
            vpcName: vpc.name,
            accountId,
            region: vpc.region,
            transitGatewayName: attachment.transitGateway.name,
            routeTableAssociations: attachment.routeTableAssociations ?? [],
            routeTablePropagations: attachment.routeTablePropagations ?? [],
          });
        }
      }
    }

    const vpnAttachments: ITgwAssociationsConfigForState['vpnAttachments'] = [];
    for (const cgw of networkConfig.customerGateways ?? []) {
      // Skip firewall VPN connections (non-IP customer gateways) — managed by GWLB stack
      if (!isIpAddress(cgw.ipAddress)) continue;
      for (const vpn of cgw.vpnConnections ?? []) {
        if (vpn.transitGateway) {
          vpnAttachments.push({
            vpnName: vpn.name,
            transitGatewayName: vpn.transitGateway,
            routeTableAssociations: vpn.routeTableAssociations ?? [],
            routeTablePropagations: vpn.routeTablePropagations ?? [],
          });
        }
      }
    }

    const dxGatewayAssociations: ITgwAssociationsConfigForState['dxGatewayAssociations'] = [];
    for (const dxgw of networkConfig.directConnectGateways ?? []) {
      for (const assoc of dxgw.transitGatewayAssociations ?? []) {
        dxGatewayAssociations.push({
          dxGatewayName: dxgw.name,
          transitGatewayName: assoc.name,
          routeTableAssociations: assoc.routeTableAssociations ?? [],
          routeTablePropagations: assoc.routeTablePropagations ?? [],
          allowedPrefixes: assoc.allowedPrefixes ?? [],
        });
      }
    }

    const connectAttachmentsState = (networkConfig.transitGatewayConnects ?? []).map(c => ({
      name: c.name,
      transitGatewayName: c.transitGateway.name,
      transportType: c.vpc ? 'vpc' : 'dxGateway',
      transportName: c.vpc ? c.vpc.vpcName : c.directConnect!,
      routeTableAssociations: c.routeTableAssociations ?? [],
      routeTablePropagations: c.routeTablePropagations ?? [],
    }));

    return {
      transitGateways,
      vpcAttachments,
      vpnAttachments,
      dxGatewayAssociations,
      connectAttachments: connectAttachmentsState,
    };
  }

  /**
   * Builds ITgwModuleRequest from ModuleParams.
   * Filters to TGWs owned by the current account/region and collects their attachments.
   */
  private static async buildTgwRequest(params: ModuleParams, logPrefix: string): Promise<ITgwModuleRequest> {
    const { networkConfig, accountsConfig, globalConfig } = params.moduleRunnerParameters.configs;

    // Include all TGWs — the module assumes roles into owning accounts as needed
    const tgwConfigs = (networkConfig.transitGateways ?? []).map(tgw => ({
      name: tgw.name,
      accountId: accountsConfig.getAccountId(tgw.account),
      region: tgw.region,
      routeTables: (tgw.routeTables ?? []).map(rt => ({ name: rt.name })),
    }));

    const tgwNames = new Set(tgwConfigs.map(t => t.name));

    // Build VPC attachments for these TGWs
    const attachments: ITgwAttachmentConfig[] = [];
    const allVpcs = [...(networkConfig.vpcs ?? []), ...(networkConfig.vpcTemplates ?? [])];
    const aseaResourceList = globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources
      ? (globalConfig.externalLandingZoneResources.resourceList ?? [])
      : [];

    for (const vpc of allVpcs) {
      for (const tgwAtt of vpc.transitGatewayAttachments ?? []) {
        if (!tgwNames.has(tgwAtt.transitGateway.name)) continue;

        // Skip ASEA-managed TGW attachments (matches CDK isManagedByAseaGlobal)
        const attachmentResourceId = `${vpc.name}/${tgwAtt.name}`;
        if (
          aseaResourceList.some(
            r =>
              r.resourceType === AseaResourceType.TRANSIT_GATEWAY_ATTACHMENT &&
              r.resourceIdentifier === attachmentResourceId &&
              !r.isDeleted,
          )
        ) {
          TgwAssociationsAndPropagations.logger.info(
            `TGW Attachment "${attachmentResourceId}" is managed by ASEA. Skipping.`,
          );
          continue;
        }

        const accountIds =
          'account' in vpc
            ? [accountsConfig.getAccountId(vpc.account)]
            : accountsConfig.getAccountIdsFromDeploymentTarget(vpc.deploymentTargets);

        // ASEA predates vpcTemplates, so owningAccount is undefined only for vpcTemplates
        // which cannot have ASEA-managed resources. The guard safely skips filtering in that case.
        const owningAccount = 'account' in vpc ? vpc.account : undefined;
        const tgwConfig = tgwConfigs.find(t => t.name === tgwAtt.transitGateway.name);

        // Filter out ASEA-managed individual associations (matches CDK isManagedByAsea)
        const filteredAssociations = (tgwAtt.routeTableAssociations ?? []).filter(rt => {
          if (!owningAccount || !tgwConfig) return true;
          const lookupId = `${owningAccount}/${tgwAtt.transitGateway.name}/${tgwAtt.name}/${rt}`;
          return !aseaResourceList.some(
            r =>
              r.accountId === tgwConfig.accountId &&
              r.region === tgwConfig.region &&
              r.resourceType === AseaResourceType.TRANSIT_GATEWAY_ASSOCIATION &&
              r.resourceIdentifier === lookupId &&
              !r.isDeleted,
          );
        });

        // Filter out ASEA-managed individual propagations (matches CDK isManagedByAsea)
        const filteredPropagations = (tgwAtt.routeTablePropagations ?? []).filter(rt => {
          if (!owningAccount || !tgwConfig) return true;
          const lookupId = `${owningAccount}/${tgwAtt.transitGateway.name}/${tgwAtt.name}/${rt}`;
          return !aseaResourceList.some(
            r =>
              r.accountId === tgwConfig.accountId &&
              r.region === tgwConfig.region &&
              r.resourceType === AseaResourceType.TRANSIT_GATEWAY_PROPAGATION &&
              r.resourceIdentifier === lookupId &&
              !r.isDeleted,
          );
        });

        for (const accountId of accountIds) {
          attachments.push({
            type: 'vpc',
            name: vpc.name,
            attachmentName: tgwAtt.name,
            accountId,
            transitGateway: tgwAtt.transitGateway.name,
            routeTableAssociations: filteredAssociations,
            routeTablePropagations: filteredPropagations,
          });
        }
      }
    }

    // Build VPN attachments for these TGWs
    for (const cgw of networkConfig.customerGateways ?? []) {
      // Skip firewall VPN connections (non-IP customer gateways) — managed by GWLB stack
      if (!isIpAddress(cgw.ipAddress)) continue;
      for (const vpn of cgw.vpnConnections ?? []) {
        if (vpn.transitGateway && tgwNames.has(vpn.transitGateway)) {
          attachments.push({
            type: 'vpn',
            name: vpn.name,
            accountId: accountsConfig.getAccountId(cgw.account),
            transitGateway: vpn.transitGateway,
            routeTableAssociations: vpn.routeTableAssociations ?? [],
            routeTablePropagations: vpn.routeTablePropagations ?? [],
          });
        }
      }
    }

    // Build DX Gateway configs
    // Include DX Gateways that either have TGW associations targeting our TGWs,
    // OR have an empty transitGatewayAssociations array (signals deletion of existing associations).
    const directConnectGateways: IDxGatewayConfig[] = (networkConfig.directConnectGateways ?? [])
      .filter(dxgw => {
        const assocs = dxgw.transitGatewayAssociations;
        if (assocs === undefined) return false;
        // Include if: has associations targeting our TGWs, OR explicitly empty (deletion intent)
        return assocs.length === 0 || assocs.some(a => tgwNames.has(a.name));
      })
      .map(dxgw => ({
        name: dxgw.name,
        accountId: accountsConfig.getAccountId(dxgw.account),
        transitGatewayAssociations: (dxgw.transitGatewayAssociations ?? [])
          .filter(a => tgwNames.has(a.name))
          .map(a => ({
            name: a.name,
            accountId: accountsConfig.getAccountId(a.account),
            allowedPrefixes: a.allowedPrefixes,
            routeTableAssociations: a.routeTableAssociations ?? [],
            routeTablePropagations: a.routeTablePropagations ?? [],
          })),
      }));

    // Load organization data sources (same pattern as Macie)
    const dataSources = await loadOrganizationDataSources(params, logPrefix);

    // Build Connect attachment configs
    const connectAttachments: ITgwConnectConfig[] = [];
    for (const connectItem of networkConfig.transitGatewayConnects ?? []) {
      if (!tgwNames.has(connectItem.transitGateway.name)) continue;

      const isVpc = !!connectItem.vpc;
      const vpcItem = isVpc ? networkConfig.vpcs.find(v => v.name === connectItem.vpc?.vpcName) : undefined;
      const dxgwItem = !isVpc
        ? networkConfig.directConnectGateways?.find(d => d.name === connectItem.directConnect)
        : undefined;

      if (isVpc && !vpcItem) {
        throw new Error(`VPC '${connectItem.vpc!.vpcName}' not found for Connect '${connectItem.name}'`);
      }
      if (!isVpc && !dxgwItem) {
        throw new Error(`DX Gateway '${connectItem.directConnect}' not found for Connect '${connectItem.name}'`);
      }

      connectAttachments.push({
        name: connectItem.name,
        transitGateway: connectItem.transitGateway.name,
        transportAttachmentType: isVpc ? 'vpc' : 'dxGateway',
        transportName: isVpc ? connectItem.vpc!.vpcName : connectItem.directConnect!,
        transportAccountId: isVpc
          ? accountsConfig.getAccountId(vpcItem!.account)
          : accountsConfig.getAccountId(dxgwItem!.account),
        options: { protocol: connectItem.options?.protocol ?? 'gre' },
        routeTableAssociations: connectItem.routeTableAssociations ?? [],
        routeTablePropagations: connectItem.routeTablePropagations ?? [],
        tags: connectItem.tags?.map(t => ({ key: t.key, value: t.value })),
      });
    }

    return {
      ...params.runnerParameters.sessionContext,
      operation: 'setup',
      moduleName: params.moduleItem.name,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun: params.runnerParameters.dryRun,
      sessionPolicy: params.moduleRunnerParameters.sessionPolicy,
      configuration: {
        enable: true,
        accountAccessRoleName: params.moduleRunnerParameters.accountAccessRoleName,
        homeRegion: globalConfig.homeRegion,
        transitGateways: tgwConfigs,
        attachments,
        directConnectGateways: directConnectGateways.length > 0 ? directConnectGateways : undefined,
        connectAttachments: connectAttachments.length > 0 ? connectAttachments : undefined,
        dataSources: {
          ssmParameterPrefix: params.moduleRunnerParameters.resourcePrefixes.ssmParamName,
          ...(dataSources && { organizations: dataSources.organizations }),
        },
        boundary: { regions: globalConfig.enabledRegions },
      },
    };
  }

  /**
   * Configures Transit Gateway route table associations and propagations.
   * Entry point called by the ModuleRunner.
   */
  public static async configure(params: ModuleParams): Promise<IModuleResponse<ITgwModuleResponse>> {
    const logPrefix = `${params.runnerParameters.sessionContext.invokingAccountId}:${params.runnerParameters.sessionContext.region}`;

    // Early exit if no transit gateways configured
    const networkConfig = params.moduleRunnerParameters.configs.networkConfig;
    if (!networkConfig.transitGateways || networkConfig.transitGateways.length === 0) {
      const message = `Skipping module ${params.moduleItem.name} as no transit gateways are configured.`;
      TgwAssociationsAndPropagations.statusLogger.info(message, logPrefix);
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: message,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
      };
    }

    // Extract current configuration for state comparison
    const currentConfig = this.extractConfig(params);

    // Check if configuration has changed since last execution
    let configChanged: boolean;
    try {
      configChanged = await hasModuleConfigChanged(
        {
          serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
          currentConfig,
          overrideExisting: false,
        },
        params,
        logPrefix,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown state check error';
      TgwAssociationsAndPropagations.statusLogger.error(`State management failure: ${errorMessage}`, logPrefix);

      const failedStatus: IModuleResponse<ITgwModuleResponse> = {
        status: MODULE_STATE_CODE.FAILED,
        summary: `State management failure: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
        error: { name: 'StateManagementError', message: errorMessage },
      };

      logModuleExecutionResult(
        failedStatus,
        params.moduleItem.name,
        logPrefix,
        TgwAssociationsAndPropagations.logger,
        TgwAssociationsAndPropagations.statusLogger,
      );

      return failedStatus;
    }

    // Skip if configuration hasn't changed — unless ownership state needs seeding (upgrade from pre-ownership version)
    if (!configChanged) {
      const state = await getModuleExecutionState(
        AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
        params,
        logPrefix,
      );
      const lastResponse = state?.lastResponse ? JSON.parse(state.lastResponse) : undefined;
      const hasOwnedResources = lastResponse?.response?.ownedResources !== undefined;

      if (hasOwnedResources) {
        const message = `Skipping module ${params.moduleItem.name} as configuration has not changed since last execution.`;
        TgwAssociationsAndPropagations.statusLogger.info(message, logPrefix);
        return {
          status: MODULE_STATE_CODE.SKIPPED,
          summary: message,
          timestamp: new Date().toISOString(),
          moduleName: params.moduleItem.name,
          dryRun: params.runnerParameters.dryRun,
        };
      }
      TgwAssociationsAndPropagations.statusLogger.info(
        'Configuration unchanged but ownership state not yet seeded — executing to seed owned resources (one-time post-upgrade)',
        logPrefix,
      );
    }

    // ========================================
    // Build request and call module
    // ========================================
    TgwAssociationsAndPropagations.statusLogger.info('Building TGW module request', logPrefix);
    const baseRequest = await this.buildTgwRequest(params, logPrefix);

    // Load previously owned resources for safe deletion (first run = empty = add-only)
    const previouslyOwned = await loadOwnedResources(
      params,
      AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
      logPrefix,
    );

    // Merge owned resources into the request configuration (readonly-safe spread)
    const request: ITgwModuleRequest = {
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        ownedResources: previouslyOwned,
      },
    };

    TgwAssociationsAndPropagations.statusLogger.info('Executing TGW module', logPrefix);
    const status = await configureTgw(request);

    // ========================================
    // Save execution state
    // ========================================
    // Compress owned resources for efficient DDB storage (create a copy to avoid mutating the response type)
    const stateResponse = status.response?.ownedResources
      ? {
          ...status,
          response: {
            ...status.response,
            ownedResources: compressOwnedResources(status.response.ownedResources as string[]),
          },
        }
      : status;

    try {
      await saveModuleExecutionState(
        {
          serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
          config: currentConfig,
          status: status.status,
          response: stateResponse,
          dryRun: params.runnerParameters.dryRun,
        },
        params,
        logPrefix,
      );
      TgwAssociationsAndPropagations.statusLogger.info('Module execution state saved successfully', logPrefix);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      TgwAssociationsAndPropagations.statusLogger.error(
        `Module execution state save failed: ${errorMessage}`,
        logPrefix,
      );

      const failedStatus: IModuleResponse<ITgwModuleResponse> = {
        status: MODULE_STATE_CODE.FAILED,
        summary: `Module execution state save failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
        error: { name: 'StateSaveError', message: errorMessage },
      };

      logModuleExecutionResult(
        failedStatus,
        params.moduleItem.name,
        logPrefix,
        TgwAssociationsAndPropagations.logger,
        TgwAssociationsAndPropagations.statusLogger,
      );

      return failedStatus;
    }

    logModuleExecutionResult(
      status,
      params.moduleItem.name,
      logPrefix,
      TgwAssociationsAndPropagations.logger,
      TgwAssociationsAndPropagations.statusLogger,
    );

    return status;
  }
}
