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
import { CfnGroup, CfnManagedPolicy, CfnUser } from 'aws-cdk-lib/aws-iam';

const RESOURCE_TYPE = 'AWS::IAM::User';
const ASEA_PHASE_NUMBER = 1;

export interface UsersProps extends AseaResourceHelperProps {
  /**
   * Group constructs defined in configuration
   */
  groups: { [key: string]: CfnGroup };

  /**
   * Policy constructs defined in configuration
   */
  policies: { [key: string]: CfnManagedPolicy };
}
/**
 * Handles IAM Roles created by ASEA.
 * All IAM Roles driven by ASEA configuration are deployed in Phase-1
 */
export class Users extends AseaResourceHelper {
  private readonly groups: { [key: string]: CfnGroup };
  private readonly policies: { [key: string]: CfnManagedPolicy };
  constructor(scope: cdk.cloudformation_include.CfnInclude, props: UsersProps) {
    super(scope, props);
    this.groups = props.groups;
    this.policies = props.policies;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.logger.info(`No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const existingResources = this.getResourcesByType(RESOURCE_TYPE);
    for (const userSetItem of this.props.iamConfig.userSets ?? []) {
      if (!this.isIncluded(userSetItem.deploymentTargets)) {
        this.logger.info(`Item excluded`);
        continue;
      }

      for (const userItem of userSetItem.users) {
        this.logger.info(`Add User ${userItem.username}`);
        const resource = existingResources.find(r => r.resourceMetadata['Properties'].UserName === userItem.username);
        if (!resource) {
          continue;
        }
        const user = scope.getResource(resource.logicalResourceId) as CfnUser;
        user.groups = [this.groups[userItem.group].ref];
        if (userItem.boundaryPolicy) {
          user.permissionsBoundary = this.policies[userItem.boundaryPolicy].ref;
        }
      }
    }
  }
}
