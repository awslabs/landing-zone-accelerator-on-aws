import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';

import { CfnSubnet, CfnVPC } from 'aws-cdk-lib/aws-ec2';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import {
  AseaStackInfo,
  NetworkConfigTypes,
  VpcConfig,
  VpcTemplatesConfig,
  AseaResourceType,
} from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';

const VPC_RESOURCE_TYPE = 'AWS::EC2::VPC';
const SUBNET_RESOURCE_TYPE = 'AWS::EC2::Subnet';
const VPC_CIDR_BLOCK_RESOURCE_TYPE = 'AWS::EC2::VPCCidrBlock';
const ASEA_PHASE_NUMBER = 1;

type NestedAseaStackInfo = AseaStackInfo & { logicalResourceId: string };

export interface VpcResourcesProps extends AseaResourceProps {
  /**
   * Nested Stacks of current phase stack
   */
  nestedStacksInfo: NestedAseaStackInfo[];
}

export class VpcResources extends AseaResource {
  private readonly nestedStacksInfo: NestedAseaStackInfo[] = [];
  private readonly props: VpcResourcesProps;
  constructor(scope: ImportAseaResourcesStack, props: VpcResourcesProps) {
    super(scope, props);
    this.props = props;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${VPC_RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    this.nestedStacksInfo = props.nestedStacksInfo;
    const vpcResources = [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])];
    const vpcsInScope = this.getVpcsInScope(vpcResources);
    for (const vpcInScope of vpcsInScope) {
      const vpcResourceInfo = this.getVpcResourceByTag(vpcInScope.name);
      if (!vpcResourceInfo) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Item Excluded: ${vpcInScope.name} in Account/Region ${props.stackInfo.accountKey}/${props.stackInfo.region}`,
        );
        continue;
      }
      const { stackInfo: vpcStackInfo, resource } = vpcResourceInfo;
      const nestedStack = this.stack.getNestedStack(vpcStackInfo.logicalResourceId);
      const vpc = nestedStack.includedTemplate.getResource(resource.logicalResourceId) as CfnVPC;
      vpc.cidrBlock = vpcInScope.cidrs![0]; // 0th index is always main cidr Block
      vpc.enableDnsHostnames = vpcInScope.enableDnsHostnames;
      vpc.enableDnsSupport = vpcInScope.enableDnsSupport;
      vpc.instanceTenancy = vpcInScope.instanceTenancy;
      // TODO: Add LZA tags if required
      if (vpcInScope.cidrs!.length > 1) {
        const additionalCidrResources = this.getAdditionalCidrs(vpcStackInfo);
        const existingAdditionalCidrBlocks: string[] = additionalCidrResources.map(
          cfnResource => cfnResource.resourceMetadata['Properties'].CidrBlock,
        );
        vpcInScope.cidrs!.slice(1).forEach(cidr => {
          const additionalCidrResource = additionalCidrResources.find(
            cfnResource => cfnResource.resourceMetadata['Properties'].CidrBlock === cidr,
          );
          if (!additionalCidrResource) {
            this.scope.addLogs(
              LogLevel.INFO,
              `Item Excluded: ${vpcInScope.name} CIDR in Account/Region ${props.stackInfo.accountKey}/${props.stackInfo.region}`,
            );
            return;
          }
        });
        const removedAseaCidrs = vpcInScope
          .cidrs!.slice(1)
          .filter(cidr => !existingAdditionalCidrBlocks.includes(cidr));
        this.scope.addLogs(LogLevel.INFO, `Removed Additional CIDR created by ASEA are ${removedAseaCidrs}`);
        // TODO: Remove Additional CIDRs created by ASEA
      }
      this.createSubnets(vpcInScope, vpcStackInfo, nestedStack.includedTemplate);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcInScope.name)}VpcId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.VPC, [vpcInScope.name]),
        stringValue: vpc.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_VPC, vpcInScope.name);
    }
  }

  private createSubnets(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcStackInfo: NestedAseaStackInfo,
    vpcStack: CfnInclude,
  ) {
    for (const subnetItem of vpcItem.subnets ?? []) {
      const subnetResource = this.getSubnetResourceByTag(subnetItem.name, vpcStackInfo);
      if (!subnetResource) continue;
      const subnet = vpcStack.getResource(subnetResource.logicalResourceId) as CfnSubnet;
      subnet.cidrBlock = subnetItem.ipv4CidrBlock;
      subnet.availabilityZone = subnetItem.availabilityZone as string;
      subnet.mapPublicIpOnLaunch = subnetItem.mapPublicIpOnLaunch;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(subnetItem.name)}SubnetId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
        stringValue: subnet.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_SUBNET, `${vpcItem.name}/${subnetItem.name}`);
    }
  }

  /**
   * Get VPCs in current scope of the stack context
   * @param vpcResources
   * @returns
   */
  private getVpcsInScope(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): (VpcConfig | VpcTemplatesConfig)[] {
    const vpcsInScope: (VpcConfig | VpcTemplatesConfig)[] = [];

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        vpcsInScope.push(vpcItem);
      }
    }
    return vpcsInScope;
  }

  /**
   * Returns true if provided account ID and region parameters match contextual values for the current stack
   * @param accountIds
   * @param regions
   * @returns
   */
  public isTargetStack(accountIds: string[], regions: string[]): boolean {
    return accountIds.includes(cdk.Stack.of(this.stack).account) && regions.includes(cdk.Stack.of(this.stack).region);
  }

  public getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
    let vpcAccountIds: string[];

    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      vpcAccountIds = [this.props.accountsConfig.getAccountId(vpcItem.account)];
    } else {
      const excludedAccountIds = this.scope.getExcludedAccountIds(vpcItem.deploymentTargets);
      vpcAccountIds = this.scope
        .getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets)
        .filter(item => !excludedAccountIds.includes(item));
    }

    return vpcAccountIds;
  }

  /**
   * Find VPC Resource by tag and nestedStackInfo of VPC
   * @param vpcName
   * @returns
   */
  private getVpcResourceByTag(vpcName: string) {
    for (const nestedStackInfo of this.nestedStacksInfo) {
      const vpcResources = nestedStackInfo.resources.filter(
        cfnResource => cfnResource.resourceType === VPC_RESOURCE_TYPE,
      );
      const vpcResource = vpcResources.find(cfnResource =>
        cfnResource.resourceMetadata['Properties'].Tags.find(
          (tag: { Key: string; Value: string }) => tag.Key === 'Name' && tag.Value === vpcName,
        ),
      );
      if (vpcResource) {
        return {
          stackInfo: nestedStackInfo,
          resource: vpcResource,
        };
      }
    }
    return;
  }

  /**
   * Find Subnet Resource by tag and nestedStackInfo of VPC
   * @param vpcName
   * @returns
   */
  private getSubnetResourceByTag(subnetName: string, nestedStackInfo: NestedAseaStackInfo) {
    const subnetResources = nestedStackInfo.resources.filter(
      cfnResource => cfnResource.resourceType === SUBNET_RESOURCE_TYPE,
    );
    const subnetResource = subnetResources.find(s =>
      s.resourceMetadata['Properties'].Tags.find(
        (tag: { Key: string; Value: string }) => tag.Key === 'Name' && tag.Value === subnetName,
      ),
    );
    if (subnetResource) {
      return subnetResource;
    }
    return;
  }

  private getAdditionalCidrs(stackInfo: NestedAseaStackInfo) {
    return stackInfo.resources.filter(cfnResource => cfnResource.resourceType === VPC_CIDR_BLOCK_RESOURCE_TYPE);
  }
}
