import { AseaResourceType } from '@aws-accelerator/config';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';

const ASEA_PHASE_NUMBER = 1;
const enum RESOURCE_TYPE {
  ROUTE_53_QUERY_LOGGING_ASSOCIATION = 'AWS::Route53Resolver::ResolverQueryLoggingConfigAssociation',
  VPC = 'AWS::EC2::VPC',
}
export class Route53ResolverQueryLoggingAssociation extends AseaResource {
  private readonly props: AseaResourceProps;
  //   private ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];
  constructor(scope: ImportAseaResourcesStack, route53ResolverQueryLoggingAssociationProps: AseaResourceProps) {
    super(scope, route53ResolverQueryLoggingAssociationProps);
    this.props = route53ResolverQueryLoggingAssociationProps;
    // this.ssmParameters = [];
    if (route53ResolverQueryLoggingAssociationProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      // Skip Non-Phase 1 resource stacks
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING_ASSOCIATION}s to handle in stack ${route53ResolverQueryLoggingAssociationProps.stackInfo.stackName}`,
      );
      return;
    }
    const existingRoute53QueryLoggingAssociationResources = this.filterResourcesByType(
      route53ResolverQueryLoggingAssociationProps.stackInfo.resources,
      RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING_ASSOCIATION,
    );
    if (existingRoute53QueryLoggingAssociationResources.length === 0) {
      //Return if no existing Query Logs in Resource Mapping
      return;
    }

    // let resolverQueryLogId: string | undefined;
    for (const vpcItem of this.props.networkConfig.vpcs) {
      if (vpcItem.vpcRoute53Resolver?.queryLogs) {
        const queryLogId = existingRoute53QueryLoggingAssociationResources.filter(
          item => item.logicalResourceId === `RqlAssoc${vpcItem.name}`.replace('_vpc', ''),
        );
        const resolverQueryLogAssociation = queryLogId[0]?.physicalResourceId;
        const resolverQueryLogAssociationLogicalId = queryLogId[0]?.logicalResourceId;
        if (resolverQueryLogAssociation) {
          // Need to pull the logical ID
          const CfnResolverQueryLoggingAssociation = this.stack.getResource(
            resolverQueryLogAssociationLogicalId,
          ) as cdk.aws_route53resolver.CfnResolverQueryLoggingConfigAssociation;
          // Set Query Logging Association to VPC
          if (CfnResolverQueryLoggingAssociation.resourceId) {
            console.log(`Updating: Adding Route53 Query Logging Association: ${CfnResolverQueryLoggingAssociation}`);
            this.scope.addSsmParameter({
              logicalId: pascalCase(`SsmParamQueryLogAssociation${vpcItem.name}`),
              parameterName: this.scope.getSsmPath(SsmResourceType.QUERY_LOGS_ASSOCIATION, [vpcItem.name]),
              stringValue: CfnResolverQueryLoggingAssociation.resourceId,
            });
            this.scope.addAseaResource(AseaResourceType.ROUTE_53_QUERY_LOGGING_ASSOCIATION, vpcItem.name);
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
}
