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

//import * as cdk from 'aws-cdk-lib';
//import { CfnResourceType } from '@aws-accelerator/config';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { AseaResourceType } from '@aws-accelerator/config';

const RESOURCE_TYPE = 'AWS::ElasticLoadBalancingV2::LoadBalancer';
const ASEA_PHASE_NUMBER = 3;

/**
 * Handles ALBs created by ASEA.
 */
export class ApplicationLoadBalancerResources extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }

    const existingAlbs = this.filterResourcesByType(props.stackInfo.resources, RESOURCE_TYPE);

    for (const vpcItem of props.networkConfig.vpcs) {
      if (!vpcItem.loadBalancers) continue;
      if (!vpcItem.loadBalancers.applicationLoadBalancers) continue;
      for (const albItem of vpcItem.loadBalancers.applicationLoadBalancers) {
        const albResource = this.findResourceByName(existingAlbs, 'Name', albItem.name);
        if (!albResource) continue;
        // const alb = this.stack.getResource(
        //   albResource.logicalResourceId,
        // ) as cdk.aws_elasticloadbalancingv2.CfnLoadBalancer;
        this.scope.addAseaResource(AseaResourceType.APPLICATION_LOAD_BALANCER, albItem.name);
      }
    }
  }
}
