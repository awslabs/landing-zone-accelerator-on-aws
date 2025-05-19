import { ASEAMappings, CfnResourceType, TransitGatewayPeeringConfig, AseaResourceType } from '@aws-accelerator/config';
import { AseaResource, AseaResourceProps } from './resource';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { ImportStackResources } from '../../utils/import-stack-resources';
import { SsmResourceType } from '@aws-accelerator/utils';
import { pascalCase } from 'pascal-case';

enum RESOURCE_TYPE {
  TGW_PEERING_ATTACHMENT = 'Custom::TGWCreatePeeringAttachment',
}

//Phase 1 has Custom::TGWCreatePeeringAttachment
const ASEA_PHASE_NUMBERS = ['1'];

export class TransitGatewayPeeringAttachments extends AseaResource {
  props: AseaResourceProps;
  private transitGatewayPeeringAttachments: Map<string, string> = new Map<string, string>();
  private allGlobalTgwPeeringAttachments!: CfnResourceType[];
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    this.props = props;
    if (!ASEA_PHASE_NUMBERS.includes(props.stackInfo.phase!)) {
      this.scope.addLogs(LogLevel.INFO, `No Resources to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    this.allGlobalTgwPeeringAttachments = [];
    /**
     * Load tgw stack resources for current account at once
     */
    const mappings = this.props.globalConfig.externalLandingZoneResources?.templateMap || {};

    //If TGW Peering Exists Cross Region we need to create Cross Region Route Table Lookup
    if (this.props.networkConfig.transitGatewayPeering) {
      const tgwPeeringConfigs = this.props.networkConfig.transitGatewayPeering;
      const aseaPrefix = this.props.globalConfig.externalLandingZoneResources?.acceleratorPrefix;
      for (const tgwPeeringConfig of tgwPeeringConfigs) {
        this.setGlobalTgwPeeringResourceMaps(tgwPeeringConfig, aseaPrefix!, mappings, props);
      }
      this.createTgwPeeringResources(tgwPeeringConfigs);
    }
  }

  /**
   * Add SSM Params and ASEA Resource entries for tgwPeeringAttachments owned by ASEA
   */
  private createTgwPeeringResources(tgwPeeringConfigs: TransitGatewayPeeringConfig[]) {
    for (const tgwPeeringConfig of tgwPeeringConfigs) {
      if (this.transitGatewayPeeringAttachments.has(tgwPeeringConfig.name)) {
        const tgwPeeringPhysicalId = this.transitGatewayPeeringAttachments.get(tgwPeeringConfig.name);
        if (!tgwPeeringPhysicalId || this.scope.region !== tgwPeeringConfig.requester.region) {
          return;
        }

        this.scope.addAseaResource(
          AseaResourceType.TRANSIT_GATEWAY_PEERING_REQUESTER,
          `${tgwPeeringConfig.requester.transitGatewayName}/${tgwPeeringConfig.name}`,
        );

        // Create SSM parameter for peering attachment ID in requester region
        this.scope.addSsmParameter({
          logicalId: pascalCase(
            `SsmParam${tgwPeeringConfig.requester.transitGatewayName}${tgwPeeringConfig.name}PeeringAttachmentId`,
          ),
          parameterName: this.scope.getSsmPath(SsmResourceType.TGW_PEERING, [
            tgwPeeringConfig.requester.transitGatewayName,
            tgwPeeringConfig.name,
          ]),
          stringValue: tgwPeeringPhysicalId,
        });
      }
    }
  }

  /**
   * Sets Global TGW Peering Mapping Resource Maps for TGW Attachment Ids and Route Tables Ids
   * @param tgwPeeringConfig
   * @returns
   */
  private setGlobalTgwPeeringResourceMaps(
    tgwPeeringConfig: TransitGatewayPeeringConfig,
    aseaPrefix: string,
    mappings: ASEAMappings,
    props: AseaResourceProps,
  ) {
    const tgwPeeringAttachmentStackMapping = `${props.stackInfo.accountId}|${tgwPeeringConfig.requester.region}|${aseaPrefix}-SharedNetwork-Phase1`;
    const tgwPeeringAttachmentMapping = mappings[tgwPeeringAttachmentStackMapping];
    if (!tgwPeeringAttachmentMapping) {
      return;
    }
    const tgwPeeringAttachmentResources = ImportStackResources.initSync({
      stackMapping: tgwPeeringAttachmentMapping,
    });
    const tgwPeeringAttachments = tgwPeeringAttachmentResources.getResourcesByType(
      RESOURCE_TYPE.TGW_PEERING_ATTACHMENT,
    );
    this.allGlobalTgwPeeringAttachments.push(...tgwPeeringAttachments);

    this.allGlobalTgwPeeringAttachments.forEach(allGlobalTgwPeeringAttachment => {
      const tgwAttachmentId = allGlobalTgwPeeringAttachment.physicalResourceId;
      const tgwAttachmentName = allGlobalTgwPeeringAttachment.resourceMetadata['Properties'].tagValue;
      if (tgwAttachmentId) {
        this.transitGatewayPeeringAttachments.set(tgwAttachmentName, tgwAttachmentId);
      }
    });
  }
}
