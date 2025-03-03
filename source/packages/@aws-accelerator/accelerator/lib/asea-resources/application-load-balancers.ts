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

import { pascalCase } from 'pascal-case';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { AseaResourceType, CfnResourceType, VpcConfig } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';

const LOAD_BALANCER_RESOURCE_TYPE = 'AWS::ElasticLoadBalancingV2::LoadBalancer';
const TARGET_GROUP_RESOURCE_TYPE = 'AWS::ElasticLoadBalancingV2::TargetGroup';
const ASEA_PHASE_NUMBER = '3';

/**
 * Handles ALBs created by ASEA.
 */
export class ApplicationLoadBalancerResources extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(
        LogLevel.INFO,
        `No ${LOAD_BALANCER_RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`,
      );
      return;
    }

    const existingTargetGroups = this.scope.importStackResources.getResourcesByType(TARGET_GROUP_RESOURCE_TYPE);
    const vpcItemsInScope = this.getVpcsInScope(props.networkConfig.vpcs);

    for (const vpcItem of vpcItemsInScope) {
      this.processAlbs(vpcItem);
      this.processTargetGroups(existingTargetGroups, vpcItem);
    }
  }
  private processAlbs(vpcItem: VpcConfig) {
    if (!vpcItem.loadBalancers) return;
    if (!vpcItem.loadBalancers.applicationLoadBalancers) return;
    for (const albItem of vpcItem.loadBalancers.applicationLoadBalancers) {
      const albResource = this.scope.importStackResources.getResourceByName('Name', albItem.name);
      if (!albResource) continue;
      // const alb = this.stack.getResource(
      //   albResource.logicalResourceId,
      // ) as cdk.aws_elasticloadbalancingv2.CfnLoadBalancer;
      this.scope.addAseaResource(AseaResourceType.APPLICATION_LOAD_BALANCER, albItem.name);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(albItem.name)}LoadBalancer`),
        parameterName: this.scope.getSsmPath(SsmResourceType.ALB, [vpcItem.name, albItem.name]),
        stringValue: albResource.physicalResourceId!,
      });
    }
  }

  private processTargetGroups(existingTargetGroups: CfnResourceType[], vpcItem: VpcConfig) {
    if (!vpcItem.targetGroups) return;
    for (const targetGroupItem of vpcItem.targetGroups) {
      const targetGroupResource = existingTargetGroups.find(
        existingTargetGroup => existingTargetGroup.resourceMetadata?.['Properties'].Name === targetGroupItem.name,
      );
      if (!targetGroupResource) continue;
      // const targetGroup = this.stack.getResource(
      //   targetGroupResource.logicalResourceId,
      // ) as  cdk.elasticloadbalancingv2.TargetGroup;
      this.scope.addAseaResource(AseaResourceType.EC2_TARGET_GROUP, targetGroupItem.name);
    }
  }
}
