/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import { AcceleratorStackProps } from './accelerator-stack';
import {
  DeploymentTargets,
  AseaResourceMapping,
  VpcConfig,
  VpcTemplatesConfig,
  isNetworkType,
  ASEAMapping,
  ASEAMappings,
} from '@aws-accelerator/config';
import { ManagedPolicies } from '../asea-resources/managed-policies';
import { Roles } from '../asea-resources/iam-roles';
import { Groups } from '../asea-resources/iam-groups';
import { Users } from '../asea-resources/iam-users';
import { VpcResources } from '../asea-resources/vpc-resources';
import { AcceleratorStage } from '../accelerator-stage';
import { TransitGateways } from '../asea-resources/transit-gateways';
import { VpcPeeringConnection } from '../asea-resources/vpc-peering-connection';
import { SharedSecurityGroups } from '../asea-resources/shared-security-groups';
import { NetworkStack } from './network-stacks/network-stack';
import { TgwCrossAccountResources } from '../asea-resources/tgw-cross-account-resources';
import { TransitGatewayRoutes } from '../asea-resources/transit-gateway-routes';
import { VpcEndpoints } from '../asea-resources/vpc-endpoints';
import { SsmInventory } from '../asea-resources/ssm-inventory';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { FirewallResources } from '../asea-resources/firewall-resources';
import { Route53ResolverQueryLogging } from '../asea-resources/route-53-query-logging';
import { Route53ResolverQueryLoggingAssociation } from '../asea-resources/route-53-query-logging-association';
import { Route53ResolverEndpoint } from '../asea-resources/route-53-resolver-endpoint';
import { ManagedAdResources } from '../asea-resources/managed-ad-resources';
import { ApplicationLoadBalancerResources } from '../asea-resources/application-load-balancers';
import path from 'path';
import { ImportStackResources } from '../../utils/import-stack-resources';
import { NestedStack } from '@aws-accelerator/config';

/**
 * Enum for log level
 */
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface ImportAseaResourcesStackProps extends AcceleratorStackProps {
  /**
   * Current stack info.
   * Retrieved from ASEA CloudFormation stacks
   */
  stackInfo: ASEAMapping;

  /**
   * Nested Stacks in current stack
   * ASEA creates Nested stacks in Phase1 for VPCs
   */

  mapping: ASEAMappings;

  stage: AcceleratorStage.IMPORT_ASEA_RESOURCES | AcceleratorStage.POST_IMPORT_ASEA_RESOURCES;
}

export interface ImportAseaResourcesStackConstructorProps extends ImportAseaResourcesStackProps {
  importStackResources: ImportStackResources;
}

export interface NestedStacks extends ASEAMapping {
  logicalResourceId: string;
}
/**
 * Extending from NetworkStack since most of the reusable functions are from NetworkStack
 */
export class ImportAseaResourcesStack extends NetworkStack {
  includedStack: cdk.cloudformation_include.CfnInclude;
  readonly ssmParameters: {
    logicalId: string;
    parameterName: string;
    stringValue: string;
    scope?: string;
  }[];
  private readonly stackInfo: ASEAMapping;
  public resourceMapping: AseaResourceMapping[] = [];
  public firewallBucket: cdk.aws_s3.IBucket;
  public importStackResources: ImportStackResources;
  public nestedStackResources?: { [key: string]: ImportStackResources };
  public nestedStacks: { [key: string]: cdk.cloudformation_include.IncludedNestedStack } = {};
  constructor(scope: Construct, id: string, props: ImportAseaResourcesStackConstructorProps) {
    super(scope, id, props);
    this.ssmParameters = [];
    this.logger = createLogger([
      `${cdk.Stack.of(this).account}-${cdk.Stack.of(this).stackName}-${cdk.Stack.of(this).region}`,
    ]);
    this.stackInfo = props.stackInfo;
    this.importStackResources = props.importStackResources;
    this.nestedStackResources = props.importStackResources.nestedStackResources;
    this.firewallBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'FirewallLogsBucket', this.centralLogsBucketName);
    this.includedStack = new cdk.cloudformation_include.CfnInclude(this, `stack`, {
      templateFile: path.join('asea-assets', this.stackInfo.templatePath),
      preserveLogicalIds: true,
      loadNestedStacks: {},
    });
    this.loadNestedStacks(this.stackInfo.nestedStacks);
    const { policies } = new ManagedPolicies(this, props);
    new Roles(this, { ...props, policies });
    const { groups } = new Groups(this, { ...props, policies });
    new Users(this, { ...props, policies, groups });
    new TransitGateways(this, props);
    new VpcResources(this, { ...props });
    new VpcPeeringConnection(this, props);
    new SharedSecurityGroups(this, { ...props });
    new TgwCrossAccountResources(this, props);
    new TransitGatewayRoutes(this, { ...props });
    new VpcEndpoints(this, props);
    new SsmInventory(this, props);
    new ManagedAdResources(this, props);
    new FirewallResources(this, props);
    new Route53ResolverQueryLogging(this, props);
    new Route53ResolverQueryLoggingAssociation(this, props);
    new Route53ResolverEndpoint(this, props);
    new ApplicationLoadBalancerResources(this, props);

    this.addSsmParameter({
      logicalId: `SSMParamLZAUpgrade`,
      parameterName: `/${this.acceleratorPrefix}/LZAUpgrade/${cdk.Stack.of(this).stackName}`,
      stringValue: 'true',
    });

    this.createSsmParameters();
    this.deleteResources();
  }

  public static async init(scope: Construct, id: string, props: ImportAseaResourcesStackProps) {
    const importStackResources = await ImportStackResources.init({ stackMapping: props.stackInfo });

    const constructorProps: ImportAseaResourcesStackConstructorProps = {
      ...props,
      importStackResources,
    };

    return new ImportAseaResourcesStack(scope, id, constructorProps);
  }
  /**
   * Get account names and excluded account IDs for transit gateway attachments
   * @param vpcItem
   * @returns
   */
  getTransitGatewayAttachmentAccounts(vpcItem: VpcConfig | VpcTemplatesConfig): [string[], string[]] {
    let accountNames: string[];
    let excludedAccountIds: string[] = [];
    if (isNetworkType<VpcConfig>('IVpcConfig', vpcItem)) {
      accountNames = [vpcItem.account];
    } else {
      accountNames = this.getAccountNamesFromDeploymentTarget(vpcItem.deploymentTargets);
      excludedAccountIds = this.getExcludedAccountIds(vpcItem.deploymentTargets);
    }
    return [accountNames, excludedAccountIds];
  }

  /**
   * Public accessor method to add ASEA Resource Mapping
   * @param type
   * @param identifier
   */
  public addAseaResource(type: string, identifier: string) {
    this.resourceMapping.push({
      accountId: this.stackInfo.accountId,
      region: this.stackInfo.region,
      resourceType: type,
      resourceIdentifier: identifier,
    });
  }

  public addDeleteFlagForAseaResource(props: { type?: string; identifier?: string; logicalId: string }) {
    const mappingResource = this.resourceMapping.find(
      resource =>
        resource.resourceType === props.type &&
        resource.resourceIdentifier === props.identifier &&
        resource.accountId === cdk.Stack.of(this).account &&
        resource.region === cdk.Stack.of(this).region,
    );
    const importResource = this.importStackResources.getResourceByLogicalId(props.logicalId);
    if (mappingResource) {
      mappingResource.isDeleted = true;
    }
    if (importResource) {
      importResource.isDeleted = true;
    }
  }

  /**
   * Public accessor method to add logs to logger
   * @param logLevel
   * @param message
   */
  public addLogs(logLevel: LogLevel, message: string) {
    switch (logLevel) {
      case 'info':
        this.logger.info(message);
        break;

      case 'warn':
        this.logger.warn(message);
        break;

      case 'error':
        this.logger.error(message);
        break;
    }
  }

  getExcludedAccountIds(deploymentTargets: DeploymentTargets): string[] {
    return super.getExcludedAccountIds(deploymentTargets);
  }

  protected createSsmParameters() {
    this.createMainSsmParameters(this.ssmParameters);
    this.createNestedStackSSMParameters(this.ssmParameters);
  }

  protected createMainSsmParameters(
    parameterItems: { logicalId: string; parameterName: string; stringValue: string; scope?: string }[],
  ): void {
    const parameters: (cdk.aws_ssm.StringParameter | cdk.aws_ssm.CfnParameter)[] = [];
    for (const parameterItem of parameterItems) {
      if (parameterItem.scope) {
        continue;
      }
      let cfnParameter;
      const parameter = this.importStackResources.getResourceByPropertyIgnoreDeletionFlag(
        'Name',
        parameterItem.parameterName,
      );
      if (parameter?.isDeleted) {
        continue;
      }
      if (!parameter) {
        cfnParameter = new cdk.aws_ssm.CfnParameter(this, parameterItem.logicalId, {
          name: parameterItem.parameterName,
          value: parameterItem.stringValue,
          type: 'String',
        });
      } else {
        try {
          cfnParameter = this.getResource(parameter.logicalResourceId) as cdk.aws_ssm.CfnParameter;
          this.logger.debug(`Updating ${parameterItem.logicalId} ssm Parameter`);
          cfnParameter.addPropertyOverride('Name', parameterItem.parameterName);
          cfnParameter.addPropertyOverride('Value', parameterItem.stringValue);
        } catch (err) {
          this.logger.debug(`${parameterItem.logicalId} not found creating new ssm Parameter`);
          cfnParameter = new cdk.aws_ssm.CfnParameter(this, parameterItem.logicalId, {
            name: parameterItem.parameterName,
            value: parameterItem.stringValue,
            type: 'String',
          });
        }
      }

      if (cfnParameter) {
        parameters.push(cfnParameter);
      }
    }
    this.setSSMDependencies(parameters as cdk.CfnResource[], 2);
  }

  private createNestedStackSSMParameters(
    parameterItems: { logicalId: string; parameterName: string; stringValue: string; scope?: string }[],
  ) {
    if (!this.nestedStackResources) {
      return;
    }
    const scopes = Object.keys(this.nestedStackResources);
    const parametersPerStack: { [key: string]: (cdk.aws_ssm.StringParameter | cdk.aws_ssm.CfnParameter)[] } = {};
    scopes.forEach(scope => {
      parametersPerStack[scope] = [];
    });

    for (const parameterItem of parameterItems) {
      if (!parameterItem.scope) {
        continue;
      }
      const nestedStackImportResources = this.nestedStackResources[parameterItem.scope];
      const nestedStack = this.nestedStacks[parameterItem.scope];
      let cfnParameter;
      const parameter = nestedStackImportResources.getSSMParameterByName(parameterItem.parameterName);
      if (parameter?.isDeleted) {
        continue;
      }
      if (!parameter) {
        cfnParameter = new cdk.aws_ssm.CfnParameter(nestedStack.stack, parameterItem.logicalId, {
          name: parameterItem.parameterName,
          value: parameterItem.stringValue,
          type: 'String',
        });
      } else {
        try {
          cfnParameter = nestedStack.includedTemplate.getResource(
            parameter.logicalResourceId,
          ) as cdk.aws_ssm.CfnParameter;
          this.logger.debug(`Updating ${parameterItem.logicalId} ssm Parameter`);
          cfnParameter.addPropertyOverride('Name', parameterItem.parameterName);
          cfnParameter.addPropertyOverride('Value', parameterItem.stringValue);
        } catch (err) {
          this.logger.debug(`${parameterItem.logicalId} not found creating new ssm Parameter`);
          cfnParameter = new cdk.aws_ssm.CfnParameter(nestedStack.stack, parameterItem.logicalId, {
            name: parameterItem.parameterName,
            value: parameterItem.stringValue,
            type: 'String',
          });
        }
      }
      if (cfnParameter) {
        parametersPerStack[parameterItem.scope].push(cfnParameter);
      }
    }
    for (const scope of Object.keys(parametersPerStack)) {
      this.setSSMDependencies(parametersPerStack[scope] as cdk.CfnResource[], 2);
    }
  }

  private setSSMDependencies(resources: cdk.CfnResource[], dependencyFrequency: number) {
    if (resources.length === 0) {
      return;
    }

    if (dependencyFrequency === 0) {
      return;
    }

    let dependency: cdk.CfnResource = resources[0];
    for (let i = 0; i < resources.length; i++) {
      if (i === 0) {
        resources[i].addOverride('DependsOn', undefined);
        continue;
      }
      if (i % dependencyFrequency === 0) {
        resources[i].addOverride('DependsOn', dependency.logicalId);
        dependency = resources[i];
      } else {
        resources[i].addOverride('DependsOn', dependency.logicalId);
      }
    }
  }

  private loadNestedStacks(nestedStacks: { [key: string]: NestedStack } | undefined) {
    if (nestedStacks) {
      Object.keys(nestedStacks).forEach(key => {
        const nestedStack = nestedStacks[key];
        this.nestedStacks[key] = this.includedStack.loadNestedStack(nestedStack.logicalResourceId, {
          templateFile: path.join('asea-assets', nestedStack.templatePath),
          preserveLogicalIds: true,
        });
      });
    }
  }
  private deleteResources() {
    this.deleteMainResources();
    this.deleteNestedStackResources();
  }
  private deleteMainResources() {
    const logicalIdsToDelete = this.importStackResources.cfnResources
      .filter(importResource => importResource.isDeleted)
      .map(importResource => importResource.logicalResourceId);
    for (const logicalId of logicalIdsToDelete) {
      this.includedStack.node.tryRemoveChild(logicalId);
    }
  }
  private deleteNestedStackResources() {
    if (!this.nestedStackResources) {
      return;
    }
    for (const nestedStackKey of Object.keys(this.nestedStackResources)) {
      const nestedStack = this.nestedStackResources[nestedStackKey];
      const logicalIdsToDelete = nestedStack.cfnResources
        .filter(importResource => importResource.isDeleted)
        .map(importResource => importResource.logicalResourceId);
      for (const logicalId of logicalIdsToDelete) {
        this.nestedStacks[nestedStackKey].includedTemplate.node.tryRemoveChild(logicalId);
      }
    }
  }

  public getResource(logicalId: string): cdk.CfnResource | undefined {
    return this.includedStack.getResource(logicalId);
  }
  public addDeleteFlagForNestedResource(nestedStackKey: string, logicalId: string) {
    const resource = this.nestedStackResources?.[nestedStackKey].cfnResources.find(
      resource => resource.logicalResourceId === logicalId,
    );
    if (resource) {
      resource.isDeleted = true;
    }
  }
  public getNestedStack(stackKey: string): cdk.cloudformation_include.IncludedNestedStack {
    return this.nestedStacks[stackKey];
  }

  public async saveLocalResourceFile() {
    const resourcePathArr = this.stackInfo.resourcePath.split('/');
    const resourceFileName = resourcePathArr.pop();
    resourcePathArr.unshift('new');
    resourcePathArr.unshift('asea-assets');
    const newResourcePath = resourcePathArr.join('/');
    await fs.promises.mkdir(newResourcePath, { recursive: true });
    await fs.promises.writeFile(
      path.join(newResourcePath, resourceFileName!),
      JSON.stringify(this.importStackResources.cfnResources, null, 2),
      'utf8',
    );
    if (this.stackInfo.nestedStacks) {
      for (const nestedStackKey of Object.keys(this.stackInfo.nestedStacks)) {
        const nestedStack = this.stackInfo.nestedStacks[nestedStackKey];
        const nestedStackResources = this.nestedStackResources?.[nestedStackKey].cfnResources;
        if (!nestedStackResources) {
          continue;
        }
        const nestedResourcePathArr = nestedStack.resourcePath.split('/');
        const nestedResourceFileName = nestedResourcePathArr.pop();
        nestedResourcePathArr.unshift('new');
        nestedResourcePathArr.unshift('asea-assets');
        const newNestedResourcePath = nestedResourcePathArr.join('/');
        await fs.promises.mkdir(newNestedResourcePath, { recursive: true });
        await fs.promises.writeFile(
          path.join(newNestedResourcePath, nestedResourceFileName!),
          JSON.stringify(nestedStackResources, null, 2),
          'utf8',
        );
      }
    }
  }
}
