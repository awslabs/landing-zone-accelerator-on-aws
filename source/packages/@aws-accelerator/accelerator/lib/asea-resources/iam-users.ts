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

import { CfnGroup, CfnManagedPolicy, CfnUser } from 'aws-cdk-lib/aws-iam';
import { AseaResourceType, UserConfig } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';
import { AseaResource, AseaResourceProps } from './resource';

const RESOURCE_TYPE = 'AWS::IAM::User';
const ASEA_PHASE_NUMBER = '1';

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

    if (props.globalConfig.homeRegion !== this.scope.region) {
      return;
    }
    const userSetsInScope = props.iamConfig.userSets.filter(userSet =>
      this.scope.isIncluded(userSet.deploymentTargets),
    );
    const userItemsInScope = userSetsInScope.map(userSet => userSet.users).flat();
    this.addDeletionFlagsForUsers(userItemsInScope, RESOURCE_TYPE);
    this.updateUsers(userItemsInScope, props);
  }

  updateUsers(userItems: UserConfig[], props: UsersProps) {
    if (userItems.length === 0) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack.`);
      return;
    }
    for (const userItem of userItems) {
      this.scope.addLogs(LogLevel.INFO, `Add User ${userItem.username}`);
      const importUser = this.scope.importStackResources.getResourceByProperty('UserName', userItem.username);
      if (!importUser) {
        continue;
      }
      const user = this.stack.getResource(importUser.logicalResourceId) as CfnUser;
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
  addDeletionFlagsForUsers(userItems: UserConfig[], resourceType: string) {
    const importUsers = this.scope.importStackResources.getResourcesByType(resourceType);
    for (const importUser of importUsers) {
      const userResource = this.scope.getResource(importUser.logicalResourceId) as CfnUser;
      const userName = userResource.userName;
      if (!userName) {
        continue;
      }

      const userExistsInConfig = userItems.find(item => item.username === userName);
      if (!userExistsInConfig) {
        importUser.isDeleted = true;
        this.scope.addDeleteFlagForAseaResource({
          type: resourceType,
          identifier: userName,
          logicalId: importUser.logicalResourceId,
        });
        // Add the delete flag to the ssm parameter created with the user.
        const ssmResource = this.scope.importStackResources.getSSMParameterByName(
          this.scope.getSsmPath(SsmResourceType.IAM_USER, [userName]),
        );
        if (ssmResource) {
          ssmResource.isDeleted = true;
        }
      }
    }
  }
}
