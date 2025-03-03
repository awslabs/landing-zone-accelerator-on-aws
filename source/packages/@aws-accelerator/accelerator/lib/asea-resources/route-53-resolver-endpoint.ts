import { AseaResourceType } from '@aws-accelerator/config';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';

const ASEA_PHASE_NUMBER = '3';
const enum RESOURCE_TYPE {
  ROUTE_53_RESOLVER_ENDPOINT = 'AWS::Route53Resolver::ResolverEndpoint',
  ROUTE_53_QUERY_LOGGING_ASSOCIATION = 'AWS::Route53Resolver::ResolverQueryLoggingConfigAssociation',
  VPC = 'AWS::EC2::VPC',
}
export class Route53ResolverEndpoint extends AseaResource {
  readonly props: AseaResourceProps;
  //   private ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];
  constructor(scope: ImportAseaResourcesStack, route53ResolverEndpointProps: AseaResourceProps) {
    super(scope, route53ResolverEndpointProps);
    this.props = route53ResolverEndpointProps;

    if (route53ResolverEndpointProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      // Skip Non-Phase 1 resource stacks
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.ROUTE_53_RESOLVER_ENDPOINT}s to handle in stack ${route53ResolverEndpointProps.stackInfo.stackName}`,
      );
      return;
    }
    const existingRoute53ResolverEndpointResources = this.scope.importStackResources.getResourcesByType(
      RESOURCE_TYPE.ROUTE_53_RESOLVER_ENDPOINT,
    );

    if (existingRoute53ResolverEndpointResources.length === 0) {
      //Return if no existing Query Logs in Resource Mapping
      return;
    }
    for (const vpcItem of this.props.networkConfig.vpcs) {
      for (const endpointItem of vpcItem.vpcRoute53Resolver?.endpoints ?? []) {
        if (endpointItem.type === 'OUTBOUND') {
          // Set Resolver Endpoint
          const resolverEndpointCfn = this.scope.importStackResources.getResourceByName(
            'Name',
            `${vpcItem.name} Outbound Endpoint`.replace('_vpc', ''),
          );
          if (resolverEndpointCfn) {
            // Need to pull the logical ID
            const resolverEndpoint = this.scope.getResource(
              resolverEndpointCfn?.logicalResourceId,
            ) as cdk.aws_route53resolver.CfnResolverEndpoint;
            // Handle change to type
            resolverEndpoint.direction = endpointItem.type;
            if (resolverEndpoint.name) {
              this.scope.addLogs(LogLevel.INFO, `Update: Adding Outbound Resolver Endpoint ${resolverEndpoint.name}`);
              this.scope.addSsmParameter({
                logicalId: pascalCase(`SsmParam${vpcItem.name}${resolverEndpoint.name}EndpointName`),
                parameterName: this.scope.getSsmPath(SsmResourceType.RESOLVER_ENDPOINT, [
                  resolverEndpoint.name.replace(/ /g, ''),
                ]),
                stringValue: resolverEndpoint.ref,
              });
              this.scope.addAseaResource(
                AseaResourceType.ROUTE_53_RESOLVER_ENDPOINT,
                `${resolverEndpoint.name.replace(/ /g, '')}`,
              );
            }
          }
        }
        if (endpointItem.type === 'INBOUND') {
          // Set Resolver Endpoint
          const resolverEndpointCfn = this.scope.importStackResources.getResourceByName(
            'Name',
            `${vpcItem.name} Inbound Endpoint`.replace('_vpc', ''),
          );
          if (resolverEndpointCfn) {
            // Need to pull the logical ID
            const resolverEndpoint = this.scope.getResource(
              resolverEndpointCfn?.logicalResourceId,
            ) as cdk.aws_route53resolver.CfnResolverEndpoint;
            // Handle change to type
            resolverEndpoint.direction = endpointItem.type;
            if (resolverEndpoint.name) {
              this.scope.addLogs(LogLevel.INFO, `Update: Adding Inbound Resolver Endpoint ${resolverEndpoint.name}`);
              this.scope.addSsmParameter({
                logicalId: pascalCase(`SsmParam${vpcItem.name}${resolverEndpoint.name}EndpointName`),
                parameterName: this.scope.getSsmPath(SsmResourceType.RESOLVER_ENDPOINT, [
                  resolverEndpoint.name.replace(/ /g, ''),
                ]),
                stringValue: resolverEndpoint.ref,
              });
              this.scope.addAseaResource(
                AseaResourceType.ROUTE_53_RESOLVER_ENDPOINT,
                `${resolverEndpoint.name.replace(/ /g, '')}`,
              );
            }
          }
        }
      }
    }
  }
}
