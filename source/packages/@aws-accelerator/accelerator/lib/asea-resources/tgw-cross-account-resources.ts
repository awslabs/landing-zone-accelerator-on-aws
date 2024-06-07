import * as cdk from 'aws-cdk-lib';
import {
  ASEAMapping,
  ASEAMappings,
  AseaResourceType,
  CfnResourceType,
  TransitGatewayAttachmentConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { AseaResource, AseaResourceProps } from './resource';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';

const enum RESOURCE_TYPE {
  VPC = 'AWS::EC2::VPC',
  TGW_ASSOCIATION = 'AWS::EC2::TransitGatewayRouteTableAssociation',
  TGW_PROPAGATION = 'AWS::EC2::TransitGatewayRouteTablePropagation',
  TGW_ATTACHMENT = 'AWS::EC2::TransitGatewayAttachment',
  TRANSIT_GATEWAY_ROUTE_TABLE = 'AWS::EC2::TransitGatewayRouteTable',
}
const ASEA_PHASE_NUMBER = '2';

export class TgwCrossAccountResources extends AseaResource {
  readonly props: AseaResourceProps;
  private readonly propagationResources: CfnResourceType[] = [];
  private readonly associationResources: CfnResourceType[] = [];
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    this.props = props;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No Resources to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    if (!props.mapping) {
      throw new Error('ASEA Mapping is undefined');
    }

    this.propagationResources = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE.TGW_PROPAGATION);
    this.associationResources = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE.TGW_ASSOCIATION);
    for (const vpcItem of this.scope.vpcResources) {
      const [accountNames] = this.scope.getTransitGatewayAttachmentAccounts(vpcItem);
      this.createTransitGatewayRouteTableAssociationPropagations(vpcItem, accountNames, props.mapping);
    }
  }

  private createTransitGatewayRouteTableAssociationPropagations(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    accountNames: string[],
    mapping: ASEAMappings,
  ) {
    if (this.propagationResources.length === 0) return;
    if (vpcItem.transitGatewayAttachments?.length === 0) {
      this.scope.addLogs(LogLevel.WARN, `TGW Attachment is removed from VPC "${vpcItem.name}" configuration`);
      return;
    }
    for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
      const transitGatewayAttachments: { [name: string]: string } = {};
      this.setTransitGatewayIds(vpcItem, tgwAttachmentItem, accountNames, transitGatewayAttachments);
      this.createTransitGatewayRouteTableAssociationPropagation(
        accountNames,
        mapping,
        tgwAttachmentItem,
        transitGatewayAttachments,
      );
    }
  }

  private setTransitGatewayIds(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    tgwAttachmentItem: TransitGatewayAttachmentConfig,
    accountNames: string[],
    transitGatewayAttachments: { [name: string]: string },
  ) {
    // Loop through attachment owner accounts
    for (const owningAccount of accountNames) {
      const attachmentKey = `${tgwAttachmentItem.transitGateway.name}_${owningAccount}_${vpcItem.name}`;
      const tgwAttachmentId = this.getTgwAttachmentId(
        vpcItem.name,
        tgwAttachmentItem.name,
        this.props.mapping,
        owningAccount,
        vpcItem.region,
      );
      if (tgwAttachmentId) transitGatewayAttachments[attachmentKey] = tgwAttachmentId;
    }
  }

  /**
   * ASEA Creates TransitGatewayAttachment in Phase 1 VPC Stack and only one TGW Attachment is created
   * @param vpcName
   * @param accountKey
   * @param region
   * @returns
   */
  private getTgwAttachmentId(
    vpcName: string,
    tgwAttachmentName: string,
    mapping: ASEAMappings,
    accountKey: string,
    region: string,
  ) {
    const vpcStacksInfo: ASEAMapping[] = [];
    Object.keys(mapping).forEach(key => {
      const stack = mapping[key];
      if (stack.accountKey === accountKey && stack.phase === '1' && stack.region === region) {
        stack.cfnResources = this.loadResourcesFromFile(stack);
        vpcStacksInfo.push(stack);
      }
    });

    let vpcStack: ASEAMapping | undefined;
    for (const vpcStackInfo of vpcStacksInfo) {
      const vpcResource = this.findResourceByTypeAndTag(vpcStackInfo.cfnResources, RESOURCE_TYPE.VPC, vpcName);
      if (vpcResource) {
        vpcStack = vpcStackInfo;
        break;
      }
    }
    if (!vpcStack) {
      this.scope.addLogs(LogLevel.INFO, `VPC "${vpcName}" didn't find in ASEA Resource mapping`);
      return;
    }
    const tgwAttachmentResources = this.filterResourcesByType(vpcStack.cfnResources, RESOURCE_TYPE.TGW_ATTACHMENT);
    if (tgwAttachmentResources.length === 0) return;
    const tgwAttachment = tgwAttachmentResources.find(tgwAttachResource =>
      tgwAttachResource.resourceMetadata['Properties'].Tags.find(
        (tag: { Key: string; Value: string }) => tag.Key === 'Name' && tag.Value === tgwAttachmentName,
      ),
    );
    if (!tgwAttachment) return;
    return tgwAttachment.physicalResourceId;
  }

  private getTgwRouteTableId(routeTableName: string, mapping: ASEAMappings) {
    const tgwStackMappingKey = Object.keys(mapping).find(
      key =>
        mapping[key].accountKey === this.stackInfo.accountKey &&
        mapping[key].region === this.stackInfo.region &&
        mapping[key].phase === '0',
    );

    if (!tgwStackMappingKey) {
      return;
    }
    const tgwStackMapping = mapping[tgwStackMappingKey];
    tgwStackMapping.cfnResources = this.loadResourcesFromFile(tgwStackMapping);
    const tgwRouteTableResources = this.filterResourcesByType(
      tgwStackMapping.cfnResources ?? [],
      RESOURCE_TYPE.TRANSIT_GATEWAY_ROUTE_TABLE,
    );
    const tgwRouteTableResource = this.findResourceByTag(tgwRouteTableResources, routeTableName);
    return tgwRouteTableResource?.physicalResourceId;
  }

  private createTransitGatewayRouteTableAssociationPropagation(
    accountNames: string[],
    mapping: ASEAMappings,
    tgwAttachmentItem: TransitGatewayAttachmentConfig,
    transitGatewayAttachments: { [name: string]: string },
  ) {
    for (const owningAccount of accountNames) {
      this.createTgwPropagations(owningAccount, mapping, tgwAttachmentItem, transitGatewayAttachments);
      this.createTgwAssociation(owningAccount, mapping, tgwAttachmentItem, transitGatewayAttachments);
    }
  }

  private createTgwAssociation(
    accountName: string,
    mapping: ASEAMappings,
    tgwAttachmentItem: TransitGatewayAttachmentConfig,
    transitGatewayAttachments: { [name: string]: string },
  ) {
    for (const routeTableItem of tgwAttachmentItem.routeTableAssociations ?? []) {
      const tgwAssociationRes = this.associationResources.find(
        association =>
          association.resourceMetadata['Properties'].TransitGatewayAttachmentId.Ref ===
            transitGatewayAttachments[tgwAttachmentItem.name] &&
          association.resourceMetadata['Properties'].TransitGatewayRouteTableId ===
            this.getTgwRouteTableId(routeTableItem, mapping),
      );
      if (!tgwAssociationRes) continue;
      const association = this.scope.getResource(
        tgwAssociationRes.logicalResourceId,
      ) as cdk.aws_ec2.CfnTransitGatewayRouteTableAssociation;
      if (!association) {
        this.scope.addLogs(
          LogLevel.WARN,
          `TGW Association for "${tgwAttachmentItem.name}/${routeTableItem}" exists in Mapping but not found in resources`,
        );
      }
      // Propagation resourceId is not used anywhere in LZA. No need of SSM Parameter.
      this.scope.addAseaResource(
        AseaResourceType.TRANSIT_GATEWAY_ASSOCIATION,
        `${accountName}/${tgwAttachmentItem.transitGateway.name}/${tgwAttachmentItem.name}/${routeTableItem}`,
      );
    }
  }

  private createTgwPropagations(
    accountName: string,
    mapping: ASEAMappings,
    tgwAttachmentItem: TransitGatewayAttachmentConfig,
    transitGatewayAttachments: { [name: string]: string },
  ) {
    for (const routeTableItem of tgwAttachmentItem.routeTablePropagations ?? []) {
      const tgwPropagationRes = this.propagationResources.find(
        propagation =>
          propagation.resourceMetadata['Properties'].TransitGatewayAttachmentId.Ref ===
            transitGatewayAttachments[tgwAttachmentItem.name] &&
          propagation.resourceMetadata['Properties'].TransitGatewayRouteTableId ===
            this.getTgwRouteTableId(routeTableItem, mapping),
      );
      if (!tgwPropagationRes) continue;
      const propagation = this.stack.getResource(
        tgwPropagationRes.logicalResourceId,
      ) as cdk.aws_ec2.CfnTransitGatewayRouteTablePropagation;
      if (!propagation) {
        this.scope.addLogs(
          LogLevel.WARN,
          `TGW Propagation for "${tgwAttachmentItem.name}/${routeTableItem}" exists in Mapping but not found in resources`,
        );
      }
      // Propagation resourceId is not used anywhere in LZA. No need of SSM Parameter.
      this.scope.addAseaResource(
        AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
        `${accountName}/${tgwAttachmentItem.transitGateway.name}/${tgwAttachmentItem.name}/${routeTableItem}`,
      );
    }
  }
}
