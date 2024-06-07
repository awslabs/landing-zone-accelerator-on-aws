import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { ASEAMappings, AseaResourceType, NestedStack } from '@aws-accelerator/config';
import { HostedZone } from '@aws-accelerator/constructs';
import { CfnHostedZone } from 'aws-cdk-lib/aws-route53';
const ASEA_PHASE_NUMBER = '2';
const enum RESOURCE_TYPE {
  VPC_ENDPOINT_TYPE = 'AWS::EC2::VPCEndpoint',
  VPC = 'AWS::EC2::VPC',
  RECORD_SET = 'AWS::Route53::RecordSet',
  HOSTED_ZONE = 'AWS::Route53::HostedZone',
}

export class VpcEndpoints extends AseaResource {
  readonly props: AseaResourceProps;
  constructor(scope: ImportAseaResourcesStack, vpcEndpointsProps: AseaResourceProps) {
    super(scope, vpcEndpointsProps);
    this.props = vpcEndpointsProps;
    this.ssmParameters = [];
    if (vpcEndpointsProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      // Skip Non-Phase 2 resource stacks
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.VPC_ENDPOINT_TYPE}s to handle in stack ${vpcEndpointsProps.stackInfo.stackName}`,
      );
      return;
    }

    if (!this.props.globalConfig.externalLandingZoneResources?.templateMap) {
      throw new Error('No template map found in global config');
    }

    const existingVpcEndpointResources = this.scope.importStackResources.getResourcesByType(
      RESOURCE_TYPE.VPC_ENDPOINT_TYPE,
    );
    const existingHostedZoneResources = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE.HOSTED_ZONE);
    const existingRecordSetResources = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE.RECORD_SET);

    if (!existingVpcEndpointResources || existingVpcEndpointResources.length === 0) {
      //Return if no existing VPC Endpoints found in Resource Mapping
      return;
    }

    for (const vpcItem of this.scope.vpcResources) {
      // Set interface endpoint DNS names
      const vpcId = this.getVPCId(vpcItem.name, this.props.globalConfig.externalLandingZoneResources.templateMap);
      if (!this.findResourceByName(existingVpcEndpointResources, 'VpcId', vpcId!)) {
        continue;
      }
      for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
        const endpointCfn = this.findResourceByName(
          existingVpcEndpointResources,
          'ServiceName',
          this.interfaceVpcEndpointForRegionAndEndpointName(endpointItem.service),
        );
        if (!endpointCfn || !endpointCfn.physicalResourceId) {
          continue;
        }
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(endpointItem.service)}EndpointId`),
          parameterName: this.scope.getSsmPath(SsmResourceType.VPC_ENDPOINT, [vpcItem.name, endpointItem.service]),
          stringValue: endpointCfn.physicalResourceId,
        });
        this.scope.addAseaResource(AseaResourceType.VPC_ENDPOINT, `${vpcItem.name}/${endpointItem.service}`);
        let hostedZoneName = HostedZone.getHostedZoneNameForService(endpointItem.service, this.stackInfo.region);
        if (!hostedZoneName.endsWith('.')) {
          hostedZoneName += '.';
        }

        const hostedZoneCfnName = this.getCfnHostedZoneName(hostedZoneName);

        const hostedZoneCfn = this.findResourceByName(existingHostedZoneResources, 'Name', hostedZoneCfnName);
        if (!hostedZoneCfn) {
          continue;
        }
        const hostedZone = this.stack.getResource(hostedZoneCfn.logicalResourceId) as CfnHostedZone;
        this.scope.addSsmParameter({
          logicalId: `SsmParam${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpHostedZone`,
          parameterName: this.scope.getSsmPath(SsmResourceType.PHZ_ID, [vpcItem.name, endpointItem.service]),
          stringValue: hostedZone.attrId,
        });
        this.scope.addAseaResource(AseaResourceType.ROUTE_53_PHZ_ID, `${vpcItem.name}/${endpointItem.service}`);
        const recordSetName = this.getRecordSetName(hostedZoneName);
        const recordSetCfn = this.findResourceByName(existingRecordSetResources, 'Name', recordSetName);
        if (!recordSetCfn) {
          this.scope.addLogs(
            LogLevel.WARN,
            `Interface Endpoint "${vpcItem.name}/${endpointItem.serviceName}" is managed by ASEA but no RecordSet found in stack `,
          );
          continue;
        }

        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Dns`),
          parameterName: this.scope.getSsmPath(SsmResourceType.ENDPOINT_DNS, [vpcItem.name, endpointItem.service]),
          stringValue: recordSetCfn.resourceMetadata['Properties'].AliasTarget.DNSName,
        });
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Phz`),
          parameterName: this.scope.getSsmPath(SsmResourceType.ENDPOINT_ZONE_ID, [vpcItem.name, endpointItem.service]),
          stringValue: recordSetCfn.resourceMetadata['Properties'].AliasTarget.HostedZoneId,
        });
      }
    }
  }

  private getVPCId(vpcName: string, mapping: ASEAMappings) {
    let vpcId: string | undefined;
    const parentStackKeys = Object.keys(mapping).filter(key => {
      const stack = mapping[key];
      return (
        stack.accountKey === this.stackInfo.accountKey &&
        stack.phase === '1' &&
        stack.region === this.stackInfo.region &&
        stack.nestedStacks
      );
    });
    const allNestedStacks = parentStackKeys.map(key => mapping[key].nestedStacks);
    const nestedStackList: NestedStack[] = [];
    for (const nestedStacks of allNestedStacks) {
      if (!nestedStacks) {
        continue;
      }
      Object.entries(nestedStacks).forEach(([, nestedStack]) => {
        nestedStackList.push(nestedStack);
      });
    }
    for (const nestedStack of nestedStackList) {
      nestedStack.cfnResources = this.loadResourcesFromFile(nestedStack);
      const vpcResource = this.findResourceByTypeAndTag(nestedStack.cfnResources, RESOURCE_TYPE.VPC, vpcName);
      if (vpcResource) {
        return vpcResource.physicalResourceId;
      }
    }
    return vpcId;
  }

  private interfaceVpcEndpointForRegionAndEndpointName(name: string): string {
    if (name === 'notebook') {
      return `aws.sagemaker.${this.stackInfo.region}.${name}`;
    }
    return `com.amazonaws.${this.stackInfo.region}.${name}`;
  }

  private getCfnHostedZoneName(hostedZoneName: string): string {
    const hostedZoneNameArr = hostedZoneName.split('.');
    const hostedZonePrefix = hostedZoneNameArr.shift();
    if (!hostedZonePrefix) {
      return hostedZoneName;
    }

    switch (hostedZonePrefix) {
      case 'ecs-t':
        hostedZoneNameArr.unshift('ecs-telemetry');
        break;
      case 'ecs-a':
        hostedZoneNameArr.unshift('ecs-agent');
        break;
      default:
        hostedZoneNameArr.unshift(hostedZonePrefix);
    }

    return hostedZoneNameArr.join('.');
  }

  private getRecordSetName(hostedZoneName: string): string {
    const hostedZoneNameArr = hostedZoneName.split('.');
    const hostedZonePrefix = hostedZoneNameArr.shift();
    if (!hostedZonePrefix) {
      return hostedZoneName;
    }

    switch (hostedZonePrefix) {
      case 'dkr':
        hostedZoneNameArr.unshift('dkr');
        hostedZoneNameArr.unshift('*');
        break;
      case 'ecs-a':
        hostedZoneNameArr.unshift('ecs-agent');
        break;
      case 'ecs-t':
        hostedZoneNameArr.unshift('ecs-telemetry');
        break;
      default:
        hostedZoneNameArr.unshift(hostedZonePrefix);
    }
    return hostedZoneNameArr.join('.');
  }
}
