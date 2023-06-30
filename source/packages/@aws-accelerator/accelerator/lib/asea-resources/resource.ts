import * as cdk from 'aws-cdk-lib';
import {
  AccountsConfig,
  AseaStackInfo,
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
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    this.scope = scope;
    this.stack = scope.includedStack;
    this.resourceSsmParameters =
      props.globalConfig.externalLandingZoneResources?.resourceParameters[
        `${this.scope.account}-${this.scope.region}`
      ] ?? {};
  }
}
