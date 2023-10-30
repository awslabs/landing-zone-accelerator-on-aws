import * as cdk from 'aws-cdk-lib';
import { SsmResourceType } from '@aws-accelerator/utils';
import { AseaResource, AseaResourceProps } from './resource';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';
import { AseaResourceType, TransitGatewayConfig } from '@aws-accelerator/config';

const enum RESOURCE_TYPE {
  TRANSIT_GATEWAY = 'AWS::EC2::TransitGateway',
  TRANSIT_GATEWAY_ROUTE_TABLE = 'AWS::EC2::TransitGatewayRouteTable',
}
const ASEA_PHASE_NUMBER = 0;

/**
 * Handles Transit Gateways created by ASEA.
 * All Transit Gateways driven by ASEA configuration are deployed in Phase-0
 */
export class TransitGateways extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.TRANSIT_GATEWAY}s to handle in stack ${props.stackInfo.stackName}`,
      );
      return;
    }
    const tgwInAsea: string[] = [];
    const existingTransitGatewaysResources = this.filterResourcesByType(
      props.stackInfo.resources,
      RESOURCE_TYPE.TRANSIT_GATEWAY,
    );
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const tgwResource = this.findResourceByTag(existingTransitGatewaysResources, tgwItem.name);
      if (!tgwResource) continue;
      const transitGateway = this.stack.getResource(tgwResource.logicalResourceId) as cdk.aws_ec2.CfnTransitGateway;
      transitGateway.amazonSideAsn = tgwItem.asn;
      transitGateway.autoAcceptSharedAttachments = tgwItem.autoAcceptSharingAttachments;
      transitGateway.defaultRouteTableAssociation = tgwItem.defaultRouteTableAssociation;
      transitGateway.defaultRouteTablePropagation = tgwItem.defaultRouteTablePropagation;
      transitGateway.dnsSupport = tgwItem.dnsSupport;
      transitGateway.vpnEcmpSupport = tgwItem.vpnEcmpSupport;
      this.createTgwRouteTables(tgwItem, tgwResource.logicalResourceId);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${tgwItem.name}TransitGatewayId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.TGW, [tgwItem.name]),
        stringValue: transitGateway.ref,
      });
      this.scope.addAseaResource(AseaResourceType.TRANSIT_GATEWAY, tgwItem.name);
      tgwInAsea.push(tgwResource.logicalResourceId);
    }

    existingTransitGatewaysResources
      .filter(tgwResource => !tgwInAsea.includes(tgwResource.logicalResourceId))
      .forEach(tgwResource => {
        this.scope.addLogs(
          LogLevel.INFO,
          `TGW ${tgwResource.logicalResourceId} is in ASEA Cfn but not found in configuration`,
        );
      });
  }

  private createTgwRouteTables(tgwItem: TransitGatewayConfig, tgwId: string) {
    const allTgwRouteTables = this.filterResourcesByType(
      this.stackInfo.resources,
      RESOURCE_TYPE.TRANSIT_GATEWAY_ROUTE_TABLE,
    );
    const tgwRouteTables = this.filterResourcesByRef(allTgwRouteTables, 'TransitGatewayId', tgwId);
    if (tgwRouteTables.length === 0) return;
    for (const routeTableItem of tgwItem.routeTables ?? []) {
      const tgwRouteTableResource = this.findResourceByTag(tgwRouteTables, routeTableItem.name);
      if (!tgwRouteTableResource) continue;
      const tgwRouteTable = this.stack.getResource(
        tgwRouteTableResource.logicalResourceId,
      ) as cdk.aws_ec2.CfnTransitGatewayRouteTable;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${tgwItem.name}${routeTableItem.name}TransitGatewayRouteTableId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.TGW_ROUTE_TABLE, [tgwItem.name, routeTableItem.name]),
        stringValue: tgwRouteTable.ref,
      });
      this.scope.addAseaResource(
        AseaResourceType.TRANSIT_GATEWAY_ROUTE_TABLE,
        `${tgwItem.name}/${routeTableItem.name}`,
      );
    }
  }
}
