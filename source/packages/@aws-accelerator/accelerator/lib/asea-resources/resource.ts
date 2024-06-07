import * as cdk from 'aws-cdk-lib';
import {
  ASEAMapping,
  ASEAMappings,
  AccountsConfig,
  CfnResourceType,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
  VpcConfig,
} from '@aws-accelerator/config';
import { ImportAseaResourcesStack } from '../stacks/import-asea-resources-stack';
import { AcceleratorStage } from '../accelerator-stage';
import path from 'path';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';

export interface AseaResourceProps {
  readonly stackInfo: ASEAMapping;
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly customizationsConfig: CustomizationsConfig;
  readonly partition: string;
  readonly mapping: ASEAMappings;
  readonly stage: AcceleratorStage.IMPORT_ASEA_RESOURCES | AcceleratorStage.POST_IMPORT_ASEA_RESOURCES;
}
export class AseaResource {
  readonly scope: ImportAseaResourcesStack;
  readonly stack: cdk.cloudformation_include.CfnInclude;
  readonly resourceSsmParameters: { [key: string]: string } = {};
  readonly stackInfo: ASEAMapping;
  readonly props: AseaResourceProps;
  protected ssmParameters: {
    logicalId: string;
    parameterName: string;
    stringValue: string;
    scope: CfnInclude | ImportAseaResourcesStack;
  }[];
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    this.scope = scope;
    this.stack = scope.includedStack;
    this.stackInfo = props.stackInfo;
    this.props = props;
    this.stackInfo.cfnResources = this.loadResourcesFromFile(this.stackInfo);
    this.resourceSsmParameters =
      props.globalConfig.externalLandingZoneResources?.resourceParameters[
        `${this.scope.account}-${this.scope.region}`
      ] ?? {};
    this.ssmParameters = [];
  }

  findResourceByName(cfnResources: CfnResourceType[], propertyName: string, propertyValue: string) {
    return cfnResources.find(cfnResource => cfnResource.resourceMetadata['Properties'][propertyName] === propertyValue);
  }

  filterResourcesByRef(cfnResources: CfnResourceType[], propertyName: string, logicalId: string) {
    return cfnResources.filter(
      cfnResource => cfnResource.resourceMetadata['Properties'][propertyName].Ref === logicalId,
    );
  }

  filterResourcesByType(cfnResources: CfnResourceType[], resourceType: string) {
    return cfnResources.filter(cfnResource => cfnResource.resourceType === resourceType);
  }

  findResourceByTag(cfnResources: CfnResourceType[], value: string, name = 'Name') {
    return cfnResources.find(cfnResource =>
      cfnResource.resourceMetadata['Properties'].Tags.find(
        (tag: { Key: string; Value: string }) => tag.Key === name && tag.Value === value,
      ),
    );
  }

  findResourceByTypeAndTag(cfnResources: CfnResourceType[], resourceType: string, tagValue: string, tagName = 'Name') {
    return cfnResources.find(
      cfnResource =>
        cfnResource.resourceType === resourceType &&
        cfnResource.resourceMetadata['Properties'].Tags.find(
          (tag: { Key: string; Value: string }) => tag.Key === tagName && tag.Value === tagValue,
        ),
    );
  }

  loadResourcesFromFile(stackInfo: ASEAMapping): CfnResourceType[] {
    let cfnResources = stackInfo.cfnResources;
    if (!stackInfo.cfnResources || stackInfo.cfnResources.length === 0) {
      cfnResources = this.props.globalConfig.loadJsonFromDisk(
        path.join('asea-assets', stackInfo.resourcePath),
      ) as CfnResourceType[];
    }
    return cfnResources;
  }

  getVpcsInScope(vpcItems: VpcConfig[]) {
    return vpcItems.filter(vpcItem => {
      const accountId = this.props.accountsConfig.getAccountId(vpcItem.account);
      return accountId === cdk.Stack.of(this.scope).account && vpcItem.region === cdk.Stack.of(this.scope).region;
    });
  }

  addSsmParameter(props: {
    logicalId: string;
    parameterName: string;
    stringValue: string;
    scope: CfnInclude | ImportAseaResourcesStack;
  }) {
    this.ssmParameters.push({
      logicalId: props.logicalId,
      parameterName: props.parameterName,
      stringValue: props.stringValue,
      scope: props.scope,
    });
  }
}
