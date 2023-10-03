import {
  AseaResourceType,
  AseaStackInfo,
  CfnResourceType,
  NetworkConfigTypes,
  TransitGatewayConfig,
  TransitGatewayRouteEntryConfig,
  TransitGatewayRouteTableConfig,
} from '@aws-accelerator/config';
import { AseaResource, AseaResourceProps } from './resource';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';

enum RESOURCE_TYPE {
  TGW_ROUTE = 'AWS::EC2::TransitGatewayRoute',
  TGW_ROUTE_TABLE = 'AWS::EC2::TransitGatewayRouteTable',
  VPC = 'AWS::EC2::VPC',
  TGW_ATTACHMENT = 'AWS::EC2::TransitGatewayAttachment',
}
const ASEA_PHASE_NUMBER = 3;

export class TransitGatewayRoutes extends AseaResource {
  private readonly props: AseaResourceProps;
  private transitGatewayRouteTables: Map<string, string> = new Map<string, string>();
  private allRoutes!: CfnResourceType[];
  private allRouteTables!: CfnResourceType[];
  private tgwStackInfo: AseaStackInfo | undefined;
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    this.props = props;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No Resources to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    this.allRoutes = this.filterResourcesByType(props.stackInfo.resources, RESOURCE_TYPE.TGW_ROUTE);
    if (this.allRoutes.length === 0) return;
    /**
     * Load tgw stack resources for current account at once
     */
    this.tgwStackInfo = this.props.globalConfig.externalLandingZoneResources!.templateMap.find(
      stack =>
        // Using accountId instead of accountKey to avoid mismatch of accountKey between ASEA and LZA
        stack.accountId === props.stackInfo.accountId && stack.phase === 0 && stack.region === this.stackInfo.region,
    );
    if (!this.tgwStackInfo) return;
    this.allRouteTables = this.filterResourcesByType(this.tgwStackInfo.resources, RESOURCE_TYPE.TGW_ROUTE_TABLE);
    for (const tgwItem of props.networkConfig.transitGateways.filter(
      tgw => tgw.account === props.stackInfo.accountKey && tgw.region === props.stackInfo.region,
    ) ?? []) {
      this.setTransitGatewayResourcesMap(tgwItem);
    }
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      for (const routeTableItem of tgwItem.routeTables ?? []) {
        this.createTransitGatewayStaticRouteItems(tgwItem, routeTableItem);
      }
    }
  }

  /**
   * Sets Given TransitGatewayConfig into maps with physicalResourceId to avoid loading multiple times
   * @param tgwItem
   * @returns
   */
  private setTransitGatewayResourcesMap(tgwItem: TransitGatewayConfig) {
    for (const routeTableItem of tgwItem.routeTables ?? []) {
      // ASEA RouteTable name includes TGW Name. No need to use TGW Id since TGW names are unique
      const routeTableResource = this.findResourceByTag(this.allRouteTables, routeTableItem.name);
      if (!routeTableResource) continue;
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
  private getTgwAttachmentId(vpcName: string, accountKey: string, region: string) {
    if (!this.props.globalConfig.externalLandingZoneResources?.templateMap) {
      return;
    }
    const vpcStacksInfo = this.props.globalConfig.externalLandingZoneResources.templateMap.filter(
      stack =>
        stack.accountId === this.props.accountsConfig.getAccountId(accountKey) &&
        stack.phase === 1 &&
        stack.region === region &&
        stack.nestedStack,
    );
    let vpcStack: AseaStackInfo | undefined;
    for (const vpcStackInfo of vpcStacksInfo) {
      const vpcResource = this.findResourceByTypeAndTag(vpcStackInfo.resources, RESOURCE_TYPE.VPC, vpcName);
      if (vpcResource) {
        vpcStack = vpcStackInfo;
        break;
      }
    }
    if (!vpcStack) {
      this.scope.addLogs(LogLevel.INFO, `VPC "${vpcName}" didn't find in ASEA Resource mapping`);
      return;
    }
    const tgwAttachmentResources = this.filterResourcesByType(vpcStack.resources, RESOURCE_TYPE.TGW_ATTACHMENT);
    if (tgwAttachmentResources.length === 0) return;
    // ASEA Only supports one tgw-attach for vpc
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
    let routeId = '';
    let transitGatewayAttachmentId: string | undefined;
    if (routeItem.attachment) {
      // If route is for VPC attachment
      if (NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig.is(routeItem.attachment)) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.vpcName}-${routeItem.attachment.account}`;
        transitGatewayAttachmentId = this.getTgwAttachmentId(
          routeItem.attachment.vpcName,
          routeItem.attachment.account,
          tgwItem.region,
        );
      }

      // If route is for DX Gateway attachment
      if (NetworkConfigTypes.transitGatewayRouteTableDxGatewayEntryConfig.is(routeItem.attachment)) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        // routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.directConnectGatewayName}`;
      }

      // If route is for VPN attachment
      if (NetworkConfigTypes.transitGatewayRouteTableVpnEntryConfig.is(routeItem.attachment)) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Adding route ${routeItem.destinationCidrBlock} to TGW route table ${routeTableItem.name} for TGW ${tgwItem.name} in account: ${tgwItem.account}`,
        );
        // routeId = `${routeTableItem.name}-${routeItem.destinationCidrBlock}-${routeItem.attachment.vpnConnectionName}`;
      }

      // If route is for TGW peering attachment
      if (NetworkConfigTypes.transitGatewayRouteTableTgwPeeringEntryConfig.is(routeItem.attachment)) {
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
    if (!routePhysicalId) {
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
}
