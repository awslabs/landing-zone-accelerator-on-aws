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

import * as cdk from 'aws-cdk-lib';
import { ImportAseaResourcesStack } from '../stacks/import-asea-resources-stack';

import { AseaResource, AseaResourceProps } from './resource';

const RESOURCE_TYPE = 'AWS::Lambda::Function';

/**
 * Handles ManagedPolicies created by ASEA.
 * All Managed Policies driven by ASEA configuration are deployed in Phase-1
 */
export class Lambda extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);

    const prefix = this.props.globalConfig.externalLandingZoneResources?.acceleratorPrefix ?? 'ASEA';

    this.replaceLambdaRole(
      `${prefix}-L-SFN-MasterRole`,
      `${prefix}-LZA-Lambda-Execution`,
      props.stackInfo.accountId,
      props.accountsConfig.getManagementAccountId(),
    );
  }

  private setRoleArn(roleName: string, account: string) {
    return `arn:aws:iam::${account}:role/${roleName}`;
  }

  private replaceLambdaRole(
    oldPartialRoleName: string,
    newRoleName: string,
    account: string,
    managementAccount: string,
  ) {
    if (account !== managementAccount) {
      return;
    }
    const newRoleArn = this.setRoleArn(newRoleName, managementAccount);
    const lambdas = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE);

    for (const lambda of lambdas) {
      try {
        const lambdaFunction = this.stack.getResource(lambda.logicalResourceId) as cdk.aws_lambda.CfnFunction;
        if (lambdaFunction.role.includes(oldPartialRoleName)) {
          lambdaFunction.role = newRoleArn;
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
}
