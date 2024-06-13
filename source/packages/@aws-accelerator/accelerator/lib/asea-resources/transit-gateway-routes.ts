import {
  ASEAMappings,
  AseaResourceType,
  CfnResourceType,
  TransitGatewayConfig,
  TransitGatewayRouteEntryConfig,
  TransitGatewayRouteTableConfig,
  TransitGatewayRouteTableDxGatewayEntryConfig,
  TransitGatewayRouteTableTgwPeeringEntryConfig,
  TransitGatewayRouteTableVpcEntryConfig,
  TransitGatewayRouteTableVpnEntryConfig,
  isNetworkType,
} from '@aws-accelerator/config';
import { AseaResource, AseaResourceProps } from './resource';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { ImportStackResources } from '../../utils/import-stack-resources';

enum RESOURCE_TYPE {
  TGW_ROUTE = 'AWS::EC2::TransitGatewayRoute',
  TGW_ROUTE_TABLE = 'AWS::EC2::TransitGatewayRouteTable',
  VPC = 'AWS::EC2::VPC',
  TGW_ATTACHMENT = 'AWS::EC2::TransitGatewayAttachment',
}
const ASEA_PHASE_NUMBERS = ['0', '1', '3'];

export class TransitGatewayRoutes extends AseaResource {
  props: AseaResourceProps;
  private transitGatewayRouteTables: Map<string, string> = new Map<string, string>();
  private allRoutes!: CfnResourceType[];
  private allRouteTables!: CfnResourceType[];
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    this.props = props;
    if (!ASEA_PHASE_NUMBERS.includes(props.stackInfo.phase!)) {
      this.scope.addLogs(LogLevel.INFO, `No Resources to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const stackRoutes = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE.TGW_ROUTE);
    const nestedStackRoutes = this.getTgwRoutesFromNestedStacks();
    this.allRoutes = [...stackRoutes, ...nestedStackRoutes];
    this.scope.addLogs(LogLevel.INFO, `All routes: ${JSON.stringify(this.allRoutes)}`);
    if (this.allRoutes.length === 0) return;
    /**
     * Load tgw stack resources for current account at once
     */
    const mappings = this.props.globalConfig.externalLandingZoneResources?.templateMap || {};
    const tgwStackKey = Object.keys(mappings).find(
      key =>
        // Using accountId instead of accountKey to avoid mismatch of accountKey between ASEA and LZA
        mappings[key].accountId === props.stackInfo.accountId &&
        mappings[key].phase === '0' &&
        mappings[key].region === this.stackInfo.region,
    );
    if (!tgwStackKey) {
      return;
    }
    const tgwStackMapping = mappings[tgwStackKey];
    const tgwResources = ImportStackResources.initSync({ stackMapping: tgwStackMapping });

    this.allRouteTables = tgwResources.getResourcesByType(RESOURCE_TYPE.TGW_ROUTE_TABLE);
    this.scope.addLogs(LogLevel.INFO, `All route tables: ${JSON.stringify(this.allRouteTables)}`);
    for (const tgwItem of props.networkConfig.transitGateways.filter(
      tgw => tgw.account === props.stackInfo.accountKey && tgw.region === props.stackInfo.region,
    ) ?? []) {
      this.setTransitGatewayResourcesMap(tgwItem, tgwResources);
    }
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      for (const routeTableItem of tgwItem.routeTables ?? []) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Creating static route items for tgw ${tgwItem.name} and route table ${routeTableItem.name}`,
        );
        this.scope.addLogs(
          LogLevel.INFO,
          `Routes identified in route table ${routeTableItem.name}: ${JSON.stringify(routeTableItem.routes)}`,
        );
        this.createTransitGatewayStaticRouteItems(tgwItem, routeTableItem);
      }
    }
  }

  /**
   * Sets Given TransitGatewayConfig into maps with physicalResourceId to avoid loading multiple times
   * @param tgwItem
   * @returns
   */
  private setTransitGatewayResourcesMap(tgwItem: TransitGatewayConfig, tgwStackMapping: ImportStackResources) {
    for (const routeTableItem of tgwItem.routeTables ?? []) {
      // ASEA RouteTable name includes TGW Name. No need to use TGW Id since TGW names are unique
      const routeTableResource = tgwStackMapping.getResourceByTypeAndTag(
        RESOURCE_TYPE.TGW_ROUTE_TABLE,
        routeTableItem.name,
      );
      if (!routeTableResource || !routeTableResource.physicalResourceId) {
        continue;
      }
      this.transitGatewayRouteTables.set(
        `${tgwItem.name}_${routeTableItem.name}`,
        routeTableResource.physicalResourceId,
      );
    }
  }

  /**
   * ASEA Creates TransitGatewayAttachment in Phase 1 VPC Stack and only one TGW Attachment is created
   * @param vpcName
   * @param accountKey
   * @param region
   * @returns
   */
  private getTgwAttachmentId(vpcName: string, accountKey: string, region: string, mappings: ASEAMappings) {
    this.scope.addLogs(LogLevel.INFO, `Getting TGW attachment id for vpc ${vpcName} in account ${accountKey}`);
    if (!mappings) {
      return;
    }
    const vpcStackKey = Object.keys(mappings).find(
      key =>
        mappings[key].accountId === this.props.accountsConfig.getAccountId(accountKey) &&
        mappings[key].phase === '1' &&
        mappings[key].region === region &&
        mappings[key].nestedStacks,
    );
    if (!vpcStackKey) {
      return;
    }
    const vpcResourceMapping = mappings[vpcStackKey];
    const vpcResources = ImportStackResources.initSync({ stackMapping: vpcResourceMapping });
    let tgwVpcResources: ImportStackResources | undefined;
    for (const [, vpcStackResources] of Object.entries(vpcResources.nestedStackResources ?? {})) {
      const vpcResource = vpcStackResources.getResourceByTypeAndTag(RESOURCE_TYPE.VPC, vpcName);
      if (vpcResource) {
        tgwVpcResources = vpcStackResources;
        break;
      }
    }
    if (!tgwVpcResources) {
      this.scope.addLogs(LogLevel.INFO, `VPC "${vpcName}" didn't find in ASEA Resource mapping`);
    }
    const tgwAttachmentResources = tgwVpcResources?.getResourcesByType(RESOURCE_TYPE.TGW_ATTACHMENT);
    if (!tgwAttachmentResources || tgwAttachmentResources?.length === 0) {
      return;
    }
    return tgwAttachmentResources[0].physicalResourceId;
  }

  /**
   * Function to get static route attachment configuration
   * @param routeItem {@link TransitGatewayRouteEntryConfig}
   * @param routeTableItem {@link TransitGatewayRouteTableConfig}
   * @param tgwItem {@link TransitGatewayConfig}
   * @returns
   */
  private getStaticRouteAttachmentConfig(
    routeItem: TransitGatewayRouteEntryConfig,
    routeTableItem: TransitGatewayRouteTableConfig,
    tgwItem: TransitGatewayConfig,
  ): {
    routeId: string;
    transitGatewayAttachmentId?: string;
  } {
    const mappings = this.props.globalConfig.externalLandingZoneResources!.templateMap;
    let routeId = '';
    let transitGatewayAttachmentId: string | undefined;
    if (routeItem.attachment) {
      // If route is for VPC attachment
      if (
        isNetworkType<TransitGatewayRouteTableVpcEntryConfig>(
          'ITransitGatewayRouteTableVpcEntryConfig',
          routeItem.attachment,
        )
      ) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.vpcName}-${routeItem.attachment.account}`;
        transitGatewayAttachmentId = this.getTgwAttachmentId(
          routeItem.attachment.vpcName,
          routeItem.attachment.account,
          tgwItem.region,
          mappings,
        );
        if (!transitGatewayAttachmentId) {
          this.scope.addLogs(
            LogLevel.INFO,
            `TGW attachment not found in account ${routeItem.attachment.account}, looking in ${tgwItem.account}`,
          );
          transitGatewayAttachmentId = this.getTgwAttachmentId(
            routeItem.attachment.vpcName,
            tgwItem.account,
            tgwItem.region,
            mappings,
          );
        }
      }

      // If route is for DX Gateway attachment
      if (
        isNetworkType<TransitGatewayRouteTableDxGatewayEntryConfig>(
          'ITransitGatewayRouteTableDxGatewayEntryConfig',
          routeItem.attachment,
        )
      ) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        // routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.directConnectGatewayName}`;
      }

      // If route is for VPN attachment
      if (
        isNetworkType<TransitGatewayRouteTableVpnEntryConfig>(
          'ITransitGatewayRouteTableVpnEntryConfig',
          routeItem.attachment,
        )
      ) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        // routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.vpnConnectionName}`;
      }

      // If route is for TGW peering attachment
      if (
        isNetworkType<TransitGatewayRouteTableTgwPeeringEntryConfig>(
          'ITransitGatewayRouteTableTgwPeeringEntryConfig',
          routeItem.attachment,
        )
      ) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        // routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.transitGatewayPeeringName}`;
      }
    }

    if (routeItem.attachment && !transitGatewayAttachmentId) {
      this.scope.addLogs(
        LogLevel.ERROR,
        `Unable to locate transit gateway attachment ID for route table item ${routeTableItem.name}`,
      );
      throw new Error(`Configuration validation failed at runtime.`);
    }
    return { routeId: routeId, transitGatewayAttachmentId: transitGatewayAttachmentId };
  }

  /**
   * Function to create TGW static route items
   * @param tgwItem {@link TransitGatewayConfig}
   * @param routeTableItem {@link TransitGatewayRouteTableConfig}
   */
  private createTransitGatewayStaticRouteItems(
    tgwItem: TransitGatewayConfig,
    routeTableItem: TransitGatewayRouteTableConfig,
  ): void {
    // Get TGW route table ID
    const routeTableKey = `${tgwItem.name}_${routeTableItem.name}`;
    const transitGatewayRouteTableId = this.transitGatewayRouteTables.get(routeTableKey);
    if (!transitGatewayRouteTableId) {
      this.scope.addLogs(LogLevel.ERROR, `Transit Gateway route table ${routeTableKey} not found`);
      throw new Error(`Configuration validation failed at runtime.`);
    }

    for (const routeItem of routeTableItem.routes ?? []) {
      this.createTransitGatewayStaticRouteItem(routeItem, routeTableItem, tgwItem);
    }
  }

  private createTransitGatewayStaticRouteItem(
    routeItem: TransitGatewayRouteEntryConfig,
    routeTableItem: TransitGatewayRouteTableConfig,
    tgwItem: TransitGatewayConfig,
  ) {
    const attachmentConfig = this.getStaticRouteAttachmentConfig(routeItem, routeTableItem, tgwItem);
    let routeId = attachmentConfig.routeId;
    const transitGatewayAttachmentId = attachmentConfig.transitGatewayAttachmentId;
    if (routeItem.blackhole) {
      this.scope.addLogs(
        LogLevel.INFO,
        `Adding blackhole route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
      );
      routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-blackhole`;
    }
    const routePhysicalId = this.getRouteFromResources(
      this.transitGatewayRouteTables.get(`${tgwItem.name}_${routeTableItem.name}`)!,
      transitGatewayAttachmentId!,
      routeItem.destinationCidrBlock,
      routeItem.blackhole,
    );
    if (!routePhysicalId || !routeId) {
      return;
    }
    this.scope.addAseaResource(AseaResourceType.TRANSIT_GATEWAY_ROUTE, routeId);
  }

  private getRouteFromResources(
    transitGatewayRouteTableId: string,
    transitGatewayAttachmentId: string,
    destination?: string,
    blackhole?: boolean,
  ) {
    const route = this.allRoutes.find(
      ({ resourceMetadata }) =>
        resourceMetadata['Properties'].TransitGatewayRouteTableId === transitGatewayRouteTableId &&
        resourceMetadata['Properties'].TransitGatewayAttachmentId === transitGatewayAttachmentId &&
        ((destination && resourceMetadata['Properties'].DestinationCidrBlock === destination) ||
          (blackhole && resourceMetadata['Properties'].Blackhole)),
    );
    return route?.physicalResourceId;
  }

  private getTgwRoutesFromNestedStacks() {
    const nestedRoutes = [];
    for (const [, nestedStackResources] of Object.entries(this.scope.nestedStackResources ?? {})) {
      this.scope.addLogs(
        LogLevel.INFO,
        `Looking for TGW routes in nested stack ${nestedStackResources.stackMapping.stackName}`,
      );
      const tgwRoutes = nestedStackResources.getResourcesByType(RESOURCE_TYPE.TGW_ROUTE);
      this.scope.addLogs(
        LogLevel.INFO,
        `Found ${tgwRoutes.length} TGW routes in nested stack ${nestedStackResources.stackMapping.stackName}`,
      );
      nestedRoutes.push(...tgwRoutes);
    }
    return nestedRoutes;
  }
}
