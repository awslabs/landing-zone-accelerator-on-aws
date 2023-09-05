import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';
import { AseaResourceType } from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import { HostedZone } from '@aws-accelerator/constructs';
import { CfnHostedZone } from 'aws-cdk-lib/aws-route53';
const ASEA_PHASE_NUMBER = 2;
const enum RESOURCE_TYPE {
  VPC_ENDPOINT_TYPE = 'AWS::EC2::VPCEndpoint',
  VPC = 'AWS::EC2::VPC',
  RECORD_SET = 'AWS::Route53::RecordSet',
  HOSTED_ZONE = 'AWS::Route53::HostedZone',
}

export class VpcEndpoints extends AseaResource {
  private readonly props: AseaResourceProps;
  private ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];
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

    const existingVpcEndpointResources = this.filterResourcesByType(
      vpcEndpointsProps.stackInfo.resources,
      RESOURCE_TYPE.VPC_ENDPOINT_TYPE,
    );

    const existingHostedZoneResources = this.filterResourcesByType(
      vpcEndpointsProps.stackInfo.resources,
      RESOURCE_TYPE.HOSTED_ZONE,
    );
    const existingRecordSetResources = this.filterResourcesByType(
      vpcEndpointsProps.stackInfo.resources,
      RESOURCE_TYPE.RECORD_SET,
    );

    if (existingVpcEndpointResources.length === 0) {
      //Return if no existing VPC Endpoints found in Resource Mapping
      return;
    }

    for (const vpcItem of this.scope.vpcResources) {
      // Set interface endpoint DNS names
      const vpcId = this.getVPCId(vpcItem.name);
      if (!this.findResourceByName(existingVpcEndpointResources, 'VpcId', vpcId!)) {
        continue;
      }
      for (const endpointItem of vpcItem.interfaceEndpoints?.endpoints ?? []) {
        const endpointCfn = this.findResourceByName(
          existingVpcEndpointResources,
          'ServiceName',
          this.interfaceVpcEndpointForRegionAndEndpointName(endpointItem.service),
        );
        if (!endpointCfn) continue;
        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(endpointItem.service)}EndpointId`),
          parameterName: this.scope.getSsmPath(SsmResourceType.VPC_ENDPOINT, [vpcItem.name, endpointItem.service]),
          stringValue: endpointCfn.physicalResourceId,
        });
        this.scope.addAseaResource(AseaResourceType.VPC_ENDPOINT, `${vpcItem.name}/${endpointItem.service}`);
        const hostedZoneName =
          HostedZone.getHostedZoneNameForService(endpointItem.service, this.stackInfo.region) + `.`;
        const hostedZoneCfn = this.findResourceByName(existingHostedZoneResources, 'Name', hostedZoneName);
        if (!hostedZoneCfn) continue;
        const hostedZone = this.stack.getResource(hostedZoneCfn.logicalResourceId) as CfnHostedZone;
        this.addSsmParameter({
          logicalId: `SsmParam${pascalCase(vpcItem.name)}Vpc${pascalCase(endpointItem.service)}EpHostedZone`,
          parameterName: this.scope.getSsmPath(SsmResourceType.PHZ_ID, [vpcItem.name, endpointItem.service]),
          stringValue: hostedZone.attrId,
        });
        this.scope.addAseaResource(AseaResourceType.ROUTE_53_PHZ_ID, `${vpcItem.name}/${endpointItem.service}`);
        const recordSetCfn = this.findResourceByName(existingRecordSetResources, 'Name', hostedZoneName);
        if (!recordSetCfn) {
          this.scope.addLogs(
            LogLevel.WARN,
            `Interface Endpoint "${vpcItem.name}/${endpointItem.serviceName}" is managed by ASEA but no RecordSet found in stack `,
          );
          continue;
        }
        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Dns`),
          parameterName: this.scope.getSsmPath(SsmResourceType.ENDPOINT_DNS, [vpcItem.name, endpointItem.service]),
          stringValue: recordSetCfn.resourceMetadata['Properties'].AliasTarget.DNSName,
        });
        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${vpcItem.name}${endpointItem.service}Phz`),
          parameterName: this.scope.getSsmPath(SsmResourceType.ENDPOINT_ZONE_ID, [vpcItem.name, endpointItem.service]),
          stringValue: recordSetCfn.resourceMetadata['Properties'].AliasTarget.HostedZoneId,
        });
      }
    }
    this.createSsmParameters();
  }
  private getVPCId(vpcName: string) {
    if (!this.props.globalConfig.externalLandingZoneResources?.templateMap) {
      return;
    }
    const vpcStacksInfo = this.props.globalConfig.externalLandingZoneResources.templateMap.filter(
      stack =>
        stack.accountKey === this.stackInfo.accountKey &&
        stack.phase === 1 &&
        stack.region === this.stackInfo.region &&
        stack.nestedStack,
    );
    let vpcId: string | undefined;
    for (const vpcStackInfo of vpcStacksInfo) {
      const vpcResource = this.findResourceByTypeAndTag(vpcStackInfo.resources, RESOURCE_TYPE.VPC, vpcName);
      if (vpcResource) {
        vpcId = vpcResource.physicalResourceId;
        break;
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

  private addSsmParameter(props: { logicalId: string; parameterName: string; stringValue: string }) {
    this.ssmParameters.push({
      logicalId: props.logicalId,
      parameterName: props.parameterName,
      stringValue: props.stringValue,
    });
  }

  private createSsmParameters(): void {
    let index = 1;
    const parameterMap = new Map<number, cdk.aws_ssm.StringParameter>();

    for (const parameterItem of this.ssmParameters) {
      // Create parameter
      const parameter = new cdk.aws_ssm.StringParameter(this.scope, parameterItem.logicalId, {
        parameterName: parameterItem.parameterName,
        stringValue: parameterItem.stringValue,
      });
      parameterMap.set(index, parameter);

      // Add a dependency for every 5 parameters
      if (index > 5) {
        const dependsOnParam = parameterMap.get(index - (index % 5));
        if (!dependsOnParam) {
          this.scope.addLogs(
            LogLevel.INFO,
            `No ${RESOURCE_TYPE.VPC_ENDPOINT_TYPE}s to handle in stack ${this.props.stackInfo.stackName}`,
          );
          throw new Error(`Configuration validation failed at runtime.`);
        }
        parameter.node.addDependency(dependsOnParam);
      }
      // Increment index
      index += 1;
    }
  }
}
