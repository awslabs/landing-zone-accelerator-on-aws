import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { AseaResourceType } from '@aws-accelerator/config';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
const ASEA_PHASE_NUMBER = '1';
const enum RESOURCE_TYPE {
  ROUTE_53_QUERY_LOGGING = 'AWS::Route53Resolver::ResolverQueryLoggingConfig',
  ROUTE_53_QUERY_LOGGING_ASSOCIATION = 'AWS::Route53Resolver::ResolverQueryLoggingConfigAssociation',
  VPC = 'AWS::EC2::VPC',
}

// R53 first part query logging
// another class to do the query logging association (another file); import here to do association if exists
export class Route53ResolverQueryLogging extends AseaResource {
  readonly props: AseaResourceProps;
  constructor(scope: ImportAseaResourcesStack, route53ResolverQueryLoggingProps: AseaResourceProps) {
    super(scope, route53ResolverQueryLoggingProps);
    this.props = route53ResolverQueryLoggingProps;
    if (route53ResolverQueryLoggingProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      // Skip Non-Phase 1 resource stacks
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING}s to handle in stack ${route53ResolverQueryLoggingProps.stackInfo.stackName}`,
      );
      return;
    }
    const existingRoute53QueryLoggingResource = this.scope.importStackResources.getResourcesByType(
      RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING,
    );
    if (existingRoute53QueryLoggingResource.length === 0) {
      //Return if no existing Query Logs in Resource Mapping
      return;
    }
    const vpcsInScope = this.getVpcsInScope(this.props.networkConfig.vpcs);
    for (const vpcItem of vpcsInScope) {
      const queryLogs = vpcItem.vpcRoute53Resolver?.queryLogs;
      if (!queryLogs) {
        continue;
      }
      const vpcId = this.getVPCId(vpcItem.name);
      if (!vpcId) {
        continue;
      }
      const resolverQueryLogCfn = this.scope.importStackResources.getResourceByName(
        'Name',
        `${this.props.globalConfig.externalLandingZoneResources?.acceleratorPrefix}-rql-${vpcItem.name}`.replace(
          '_vpc',
          '',
        ),
      );
      if (!resolverQueryLogCfn) {
        continue;
      }

      const resolverQueryLog = this.scope.getResource(
        resolverQueryLogCfn?.logicalResourceId,
      ) as cdk.aws_route53resolver.CfnResolverQueryLoggingConfig;
      if (resolverQueryLog?.name) {
        this.scope.addLogs(LogLevel.INFO, `Updating: Adding Route53 Query Logging: ${resolverQueryLog.name}`);
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
  private getVPCId(vpcName: string) {
    if (!this.scope.nestedStackResources) {
      return;
    }
    for (const [, nestedStackResources] of Object.entries(this.scope.nestedStackResources)) {
      const vpc = nestedStackResources.getResourceByTypeAndTag(RESOURCE_TYPE.VPC, vpcName);
      if (vpc) {
        return vpc.physicalResourceId;
      }
    }
    return undefined;
  }
}
