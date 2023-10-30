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

import { CfnGroup, CfnManagedPolicy, CfnUser } from 'aws-cdk-lib/aws-iam';
import { AseaResourceType } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';
import { AseaResource, AseaResourceProps } from './resource';

const RESOURCE_TYPE = 'AWS::IAM::User';
const ASEA_PHASE_NUMBER = 1;

export interface UsersProps extends AseaResourceProps {
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
export class Users extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: UsersProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const existingResources = this.filterResourcesByType(props.stackInfo.resources, RESOURCE_TYPE);
    for (const userSetItem of props.iamConfig.userSets ?? []) {
      if (!this.scope.isIncluded(userSetItem.deploymentTargets)) {
        this.scope.addLogs(LogLevel.INFO, `Users excluded`);
        continue;
      }

      for (const userItem of userSetItem.users) {
        this.scope.addLogs(LogLevel.INFO, `Add User ${userItem.username}`);
        const resource = existingResources.find(
          cfnResource => cfnResource.resourceMetadata['Properties'].UserName === userItem.username,
        );
        if (!resource) {
          continue;
        }
        const user = this.stack.getResource(resource.logicalResourceId) as CfnUser;
        const group =
          props.groups[userItem.group]?.ref ??
          this.resourceSsmParameters[this.scope.getSsmPath(SsmResourceType.IAM_GROUP, [userItem.group])];
        if (group) {
          user.groups = [group];
        }
        if (userItem.boundaryPolicy) {
          const boundaryPolicy =
            props.policies[userItem.boundaryPolicy]?.ref ??
            this.resourceSsmParameters[this.scope.getSsmPath(SsmResourceType.IAM_POLICY, [userItem.boundaryPolicy])];
          if (boundaryPolicy) {
            user.permissionsBoundary = boundaryPolicy;
          }
        } else if (user.permissionsBoundary) {
          user.permissionsBoundary = undefined;
        }
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(userItem.username)}UserArn`),
          parameterName: this.scope.getSsmPath(SsmResourceType.IAM_USER, [userItem.username]),
          stringValue: user.attrArn,
        });
        this.scope.addAseaResource(AseaResourceType.IAM_USER, userItem.username);
      }
    }
  }
}
