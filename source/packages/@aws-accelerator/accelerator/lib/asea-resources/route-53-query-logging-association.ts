import { AseaResourceType, VpcConfig } from '@aws-accelerator/config';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';

const ASEA_PHASE_NUMBER = '1';
const enum RESOURCE_TYPE {
  ROUTE_53_QUERY_LOGGING_ASSOCIATION = 'AWS::Route53Resolver::ResolverQueryLoggingConfigAssociation',
}
export class Route53ResolverQueryLoggingAssociation extends AseaResource {
  readonly props: AseaResourceProps;
  //   private ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];
  constructor(scope: ImportAseaResourcesStack, route53ResolverQueryLoggingAssociationProps: AseaResourceProps) {
    super(scope, route53ResolverQueryLoggingAssociationProps);
    this.props = route53ResolverQueryLoggingAssociationProps;
    if (route53ResolverQueryLoggingAssociationProps.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING_ASSOCIATION}s to handle in stack ${route53ResolverQueryLoggingAssociationProps.stackInfo.stackName}`,
      );
      return;
    }

    const vpcsInScope = this.getVpcsInScope(this.props.networkConfig.vpcs);
    // The config converter does not handle RQL yet
    // this.addRQLDeletionFlags(vpcsInScope, RESOURCE_TYPE.ROUTE_53_QUERY_LOGGING_ASSOCIATION);
    this.updateRQLAssociation(vpcsInScope);
  }

  updateRQLAssociation(vpcItems: VpcConfig[]) {
    if (vpcItems.length === 0) {
      return;
    }
    for (const vpcItem of vpcItems) {
      if (!vpcItem.vpcRoute53Resolver?.queryLogs) {
        continue;
      }
      const associationLogicalIdWithReplacedVpc = `RqlAssoc${vpcItem.name}`.replace('_vpc', '');
      const associationLogicalId = `${associationLogicalIdWithReplacedVpc}`.replace(/-/g, '');

      const importResource = this.scope.importStackResources.getResourceByLogicalId(associationLogicalId);
      const cfnResolverQueryLoggingAssociation = this.scope.getResource(
        associationLogicalId,
      ) as cdk.aws_route53resolver.CfnResolverQueryLoggingConfigAssociation;
      if (importResource?.isDeleted) {
        continue;
      }
      if (!cfnResolverQueryLoggingAssociation || !cfnResolverQueryLoggingAssociation.resourceId) {
        continue;
      }
      this.scope.addLogs(
        LogLevel.INFO,
        `Updating: Adding Route53 Query Logging Association: ${cfnResolverQueryLoggingAssociation}`,
      );
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParamQueryLogAssociation${vpcItem.name}`),
        parameterName: this.scope.getSsmPath(SsmResourceType.QUERY_LOGS_ASSOCIATION, [vpcItem.name]),
        stringValue: cfnResolverQueryLoggingAssociation.resourceId,
      });
      this.scope.addAseaResource(AseaResourceType.ROUTE_53_QUERY_LOGGING_ASSOCIATION, vpcItem.name);
    }
  }

  // Can't add deletion flags until config converter includes vpcItem.vpcRoute53Resolver?.queryLogs

  // addRQLDeletionFlags(vpcItems: VpcConfig[], resourceType: string) {
  //   const importItems = this.scope.importStackResources.getResourcesByType(resourceType);
  //   for (const importItem of importItems) {
  //     const vpcName = `${importItem.logicalResourceId.replace('RqlAssoc', '')}_vpc`;
  //     const resourceExistsInConfig = vpcItems.find(item => item.name === vpcName && item.vpcRoute53Resolver?.queryLogs);
  //     const ssmPhysicalID = this.scope.getSsmPath(SsmResourceType.QUERY_LOGS_ASSOCIATION, [vpcName]);
  //     if (!resourceExistsInConfig) {
  //       importItem.isDeleted = true;
  //       const ssmResource = this.scope.importStackResources.getSSMParameterByName(ssmPhysicalID);
  //       if (ssmResource) {
  //         ssmResource.isDeleted = true;
  //       }
  //     }
  //   }
  // }
}
