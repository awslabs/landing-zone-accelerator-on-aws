import * as cdk from 'aws-cdk-lib';
import {
  AccountsConfig,
  AseaStackInfo,
  CfnResourceType,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { ImportAseaResourcesStack } from '../stacks/import-asea-resources-stack';
import { AcceleratorStage } from '../accelerator-stage';

export interface AseaResourceProps {
  readonly stackInfo: AseaStackInfo;
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly customizationsConfig: CustomizationsConfig;
  readonly partition: string;
  readonly stage: AcceleratorStage.IMPORT_ASEA_RESOURCES | AcceleratorStage.POST_IMPORT_ASEA_RESOURCES;
}
export class AseaResource {
  readonly scope: ImportAseaResourcesStack;
  readonly stack: cdk.cloudformation_include.CfnInclude;
  readonly resourceSsmParameters: { [key: string]: string } = {};
  readonly stackInfo: AseaStackInfo;
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    this.scope = scope;
    this.stack = scope.includedStack;
    this.stackInfo = props.stackInfo;
    this.resourceSsmParameters =
      props.globalConfig.externalLandingZoneResources?.resourceParameters[
        `${this.scope.account}-${this.scope.region}`
      ] ?? {};
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

  findResourceByTypeAndTag(cfnResources: CfnResourceType[], resourceType: string, tagValue: string, tagKame = 'Name') {
    return cfnResources.find(
      cfnResource =>
        cfnResource.resourceType === resourceType &&
        cfnResource.resourceMetadata['Properties'].Tags.find(
          (tag: { Key: string; Value: string }) => tag.Key === tagKame && tag.Value === tagValue,
        ),
    );
  }
}
