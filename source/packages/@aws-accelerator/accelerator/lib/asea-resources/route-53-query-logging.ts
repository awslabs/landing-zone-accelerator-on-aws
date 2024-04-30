import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { AseaResourceType } from '@aws-accelerator/config';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
const ASEA_PHASE_NUMBER = 1;
const enum RESOURCE_TYPE {
  ROUTE_53_QUERY_LOGGING = 'AWS::Route53Resolver::ResolverQueryLoggingConfig',
  ROUTE_53_QUERY_LOGGING_ASSOCIATION = 'AWS::Route53Resolver::ResolverQueryLoggingConfigAssociation',
  VPC = 'AWS::EC2::VPC',
}

// R53 first part query logging
// another class to do the query logging association (another file); import here to do association if exists
export class Route53ResolverQueryLogging extends AseaResource {
  private readonly props: AseaResourceProps;
  constructor(scope: ImportAseaResourcesStack, route53ResolverQueryLoggingProps: AseaResourceProps) {
    super(scope, route53ResolverQueryLoggingProps);
    this.props = route53ResolverQueryLoggingProps;
    this.scope.acceleratorPrefix;
    if (route53ResolverQueryLoggingProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      // Skip Non-Phase 1 resource stacks
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING}s to handle in stack ${route53ResolverQueryLoggingProps.stackInfo.stackName}`,
      );
      return;
    }
    const existingRoute53QueryLoggingResource = this.filterResourcesByType(
      route53ResolverQueryLoggingProps.stackInfo.resources,
      RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING,
    );
    if (existingRoute53QueryLoggingResource.length === 0) {
      //Return if no existing Query Logs in Resource Mapping
      return;
    }
    for (const vpcItem of this.props.networkConfig.vpcs) {
      if (vpcItem.vpcRoute53Resolver?.queryLogs) {
        const vpcId = this.getVPCId(vpcItem.name);
        // Set Query Logging to VPC
        if (this.findResourceByName(existingRoute53QueryLoggingResource, 'VpcId', vpcId!)) {
          continue;
        }
        const resolverQueryLogCfn = this.findResourceByName(
          existingRoute53QueryLoggingResource,
          'Name',
          `${this.props.globalConfig.externalLandingZoneResources?.acceleratorPrefix}-rql-${vpcItem.name}`.replace(
            '_vpc',
            '',
          ),
        );
        if (resolverQueryLogCfn) {
          // Need to pull the logical ID
          const resolverQueryLog = this.stack.getResource(
            resolverQueryLogCfn?.logicalResourceId,
          ) as cdk.aws_route53resolver.CfnResolverQueryLoggingConfig;
          if (resolverQueryLog.name) {
            console.log(`Updating: Adding Route53 Query Logging: ${resolverQueryLog.name}`);
            this.scope.addSsmParameter({
              logicalId: pascalCase(`SsmParam${resolverQueryLog.name}QueryLog`),
              parameterName: this.scope.getSsmPath(SsmResourceType.QUERY_LOGS, [resolverQueryLog.name]),
              stringValue: resolverQueryLog.name,
            });
            this.scope.addAseaResource(AseaResourceType.ROUTE_53_QUERY_LOGGING, resolverQueryLog.name);
          } else {
            this.scope.addLogs(
              LogLevel.WARN,
              `Route 53 Query Logging for VPC ${vpcItem.name} exists in Mapping but not found in resources`,
            );
            return;
          }
        }
      }
    }
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
}
