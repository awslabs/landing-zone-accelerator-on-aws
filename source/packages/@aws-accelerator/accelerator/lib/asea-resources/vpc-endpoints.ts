import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { ASEAMappings, AseaResourceType, NestedStack } from '@aws-accelerator/config';
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

      // remove endpoints that are not in config
      const configuredEndpoints: { service: string; serviceName: string }[] = [];
      for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
        configuredEndpoints.push({
          service: endpointItem.service,
          serviceName: this.interfaceVpcEndpointForRegionAndEndpointName(endpointItem.service),
        });
      }

      for (const endpoint of existingVpcEndpointResources) {
        const configuredEndpoint = configuredEndpoints.find(
          ep => ep.serviceName === endpoint.resourceMetadata['Properties'].ServiceName,
        );
        if (!configuredEndpoint) {
          this.scope.addLogs(
            LogLevel.WARN,
            `VPC Endpoint "${vpcItem.name}/${endpoint.resourceMetadata['Properties'].ServiceName}" is managed by ASEA but no Endpoint found in config`,
          );
          const configEndpointName = this.interfaceVpcEndpointConfigNameFromServiceName(
            endpoint.resourceMetadata['Properties'].ServiceName,
          );
          this.scope.addDeleteFlagForAseaResource({
            type: RESOURCE_TYPE.VPC_ENDPOINT_TYPE,
            identifier: configEndpointName,
            logicalId: endpoint.logicalResourceId,
          });

          const ssmResource = this.scope.importStackResources.getSSMParameterByName(
            this.scope.getSsmPath(SsmResourceType.VPC_ENDPOINT, [vpcItem.name, configEndpointName]),
          );
          if (ssmResource) {
            ssmResource.isDeleted = true;
          }

          // delete security group
          const epSecurityGroupName = `ep_${configEndpointName}_sg`;
          const epSecurityGroup = this.scope.importStackResources.getResourceByName('GroupName', epSecurityGroupName);
          if (epSecurityGroup) {
            this.scope.addDeleteFlagForAseaResource({
              type: AseaResourceType.EC2_SECURITY_GROUP,
              identifier: epSecurityGroupName,
              logicalId: epSecurityGroup?.logicalResourceId,
            });
          }

          // remove route53 hosted zone for endpoint
          let hostedZoneName = this.getHostedZoneNameForService(configEndpointName, this.stackInfo.region);
          if (!hostedZoneName.endsWith('.')) {
            hostedZoneName += '.';
          }
          const hostedZoneCfnName = this.getCfnHostedZoneName(hostedZoneName);

          const hostedZoneCfn = this.findResourceByName(existingHostedZoneResources, 'Name', hostedZoneCfnName);
          if (!hostedZoneCfn) {
            continue;
          }

          // route53 hosted zone
          this.scope.addDeleteFlagForAseaResource({
            type: RESOURCE_TYPE.HOSTED_ZONE,
            identifier: hostedZoneCfnName,
            logicalId: hostedZoneCfn.logicalResourceId,
          });

          const ssmResourcePhz = this.scope.importStackResources.getSSMParameterByName(
            this.scope.getSsmPath(SsmResourceType.PHZ_ID, [vpcItem.name, configEndpointName]),
          );
          if (ssmResourcePhz) {
            ssmResourcePhz.isDeleted = true;
          }

          // route53 recordset
          const recordSetName = this.getRecordSetName(hostedZoneName);
          const recordSetCfn = this.findResourceByName(existingRecordSetResources, 'Name', recordSetName);
          if (recordSetCfn) {
            this.scope.addDeleteFlagForAseaResource({
              type: RESOURCE_TYPE.RECORD_SET,
              identifier: recordSetName,
              logicalId: recordSetCfn.logicalResourceId,
            });
          }

          const ssmResourceDns = this.scope.importStackResources.getSSMParameterByName(
            this.scope.getSsmPath(SsmResourceType.ENDPOINT_DNS, [vpcItem.name, configEndpointName]),
          );
          if (ssmResourceDns) {
            ssmResourceDns.isDeleted = true;
          }

          const ssmResourceEndpointZone = this.scope.importStackResources.getSSMParameterByName(
            this.scope.getSsmPath(SsmResourceType.ENDPOINT_ZONE_ID, [vpcItem.name, configEndpointName]),
          );
          if (ssmResourceEndpointZone) {
            ssmResourceEndpointZone.isDeleted = true;
          }

          continue;
        }
      }

      // updating existing configured endpoints
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
        let hostedZoneName = this.getHostedZoneNameForService(endpointItem.service, this.stackInfo.region);
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

  private interfaceVpcEndpointConfigNameFromServiceName(name: string): string {
    if (name.startsWith('aws.sagemaker')) {
      return 'notebook';
    }
    return name.split(/[.]+/).pop() ?? '';
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
      case 'sms-voice':
        hostedZoneNameArr.unshift('pinpoint-sms-voice-v2');
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
      case 'sms-voice':
        hostedZoneNameArr.unshift('pinpoint-sms-voice-v2');
        break;
      default:
        hostedZoneNameArr.unshift(hostedZonePrefix);
    }
    return hostedZoneNameArr.join('.');
  }

  // This code needs to be maintained separately from the hosted zone class due to compatibility issues with ca-central-1
  private getHostedZoneNameForService(service: string, region: string): string {
    let hostedZoneName = `${service}.${region}.amazonaws.com`;

    if (service.indexOf('.') > 0 && !this.ignoreServiceEndpoint(service)) {
      const tmp = service.split('.').reverse().join('.');
      hostedZoneName = `${tmp}.${region}.amazonaws.com.`;
    }
    switch (service) {
      case 'appstream.api':
        hostedZoneName = `appstream2.${region}.amazonaws.com`;
        break;
      case 'deviceadvisor.iot':
        hostedZoneName = `deviceadvisor.iot.${region}.amazonaws.com`;
        break;
      case 'pinpoint-sms-voice-v2':
        hostedZoneName = `sms-voice.${region}.amazonaws.com`;
        break;
      case 'rum-dataplane':
        hostedZoneName = `dataplane.rum.${region}.amazonaws.com`;
        break;
      case 's3-global.accesspoint':
        hostedZoneName = `${service}.amazonaws.com`;
        break;
      case 'ecs-agent':
        hostedZoneName = `ecs-a.${region}.amazonaws.com`;
        break;
      case 'ecs-telemetry':
        hostedZoneName = `ecs-t.${region}.amazonaws.com`;
        break;
      case 'codeartifact.api':
        hostedZoneName = `codeartifact.${region}.amazonaws.com`;
        break;
      case 'codeartifact.repositories':
        hostedZoneName = `d.codeartifact.${region}.amazonaws.com`;
        break;
      case 'notebook':
        hostedZoneName = `${service}.${region}.sagemaker.aws`;
        break;
      case 'studio':
        hostedZoneName = `${service}.${region}.sagemaker.aws`;
        break;
    }
    return hostedZoneName;
  }

  private ignoreServiceEndpoint(service: string): boolean {
    const ignoreServicesArray = [
      'appstream.api',
      'deviceadvisor.iot',
      'rum-dataplane',
      's3-global.accesspoint',
      'ecs-agent',
      'ecs-telemetry',
      'notebook',
      'studio',
      'codeartifact.api',
      'codeartifact.repositories',
    ];
    return ignoreServicesArray.includes(service);
  }
}
