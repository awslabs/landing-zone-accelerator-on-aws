/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from 'aws-cdk-lib';

import { AseaResourceHelper, AseaResourceHelperProps } from '../resource-helper';
import { CfnGroup, CfnManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { GroupConfig } from '@aws-accelerator/config';

const RESOURCE_TYPE = 'AWS::IAM::Group';
const ASEA_PHASE_NUMBER = 1;

export interface GroupsProps extends AseaResourceHelperProps {
  /**
   * Policy constructs defined in configuration
   */
  policies: { [key: string]: CfnManagedPolicy };
}

/**
 * Handles IAM Groups created by ASEA.
 * All IAM Groups driven by ASEA configuration are deployed in Phase-1
 */
export class Groups extends AseaResourceHelper {
  private readonly policies: { [key: string]: CfnManagedPolicy };
  readonly groups: { [key: string]: CfnGroup } = {};
  constructor(scope: cdk.cloudformation_include.CfnInclude, props: GroupsProps) {
    super(scope, props);
    this.policies = props.policies;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.logger.info(`No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const existingResources = this.getResourcesByType(RESOURCE_TYPE);
    for (const groupSetItem of this.props.iamConfig.groupSets ?? []) {
      if (!this.isIncluded(groupSetItem.deploymentTargets)) {
        this.logger.info(`Item excluded`);
        continue;
      }

      for (const groupItem of groupSetItem.groups) {
        const existingResource = existingResources.find(
          p => p.resourceMetadata['Properties'].GroupName === groupItem.name,
        );
        if (!existingResource) {
          continue;
        }
        this.logger.info(`Add customer managed policy ${groupItem.name}`);
        const resource = scope.getResource(existingResource!.logicalResourceId) as CfnGroup;
        resource.groupName = groupItem.name;
        resource.managedPolicyArns = this.getManagedPolicies(groupItem);
        this.groups[resource.groupName] = resource;
      }
    }
  }

  private getManagedPolicies(groupItem: GroupConfig) {
    const managedPolicies: string[] = [];
    for (const policyItem of groupItem.policies?.awsManaged ?? []) {
      this.logger.info(`Role - aws managed policy ${policyItem}`);
      managedPolicies.push(`arn:${cdk.Aws.PARTITION}:iam::aws:policy/${policyItem}`);
    }
    for (const policyItem of groupItem.policies?.customerManaged ?? []) {
      this.logger.info(`Role - customer managed policy ${policyItem}`);
      managedPolicies.push(this.policies[policyItem].ref);
    }
    return managedPolicies;
  }
}
