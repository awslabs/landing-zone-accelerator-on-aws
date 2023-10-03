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

import path from 'path';
import * as cdk from 'aws-cdk-lib';

import { CfnManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { AseaResourceType } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';
import { AseaResource, AseaResourceProps } from './resource';

const RESOURCE_TYPE = 'AWS::IAM::ManagedPolicy';
const ASEA_PHASE_NUMBER = 1;

/**
 * Handles ManagedPolicies created by ASEA.
 * All Managed Policies driven by ASEA configuration are deployed in Phase-1
 */
export class ManagedPolicies extends AseaResource {
  readonly policies: { [key: string]: CfnManagedPolicy } = {};
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const existingPolicyResources = this.filterResourcesByType(props.stackInfo.resources, RESOURCE_TYPE);
    for (const policySetItem of props.iamConfig.policySets ?? []) {
      if (!this.scope.isIncluded(policySetItem.deploymentTargets) || policySetItem.identityCenterDependency) {
        this.scope.addLogs(LogLevel.INFO, `Policies excluded`);
        continue;
      }

      for (const policyItem of policySetItem.policies) {
        const existingPolicy = existingPolicyResources.find(
          cfnResource => cfnResource.resourceMetadata['Properties'].ManagedPolicyName === policyItem.name,
        );
        if (!existingPolicy) {
          continue;
        }
        this.scope.addLogs(LogLevel.INFO, `Add customer managed policy ${policyItem.name}`);
        const resource = this.stack.getResource(existingPolicy.logicalResourceId) as cdk.aws_iam.CfnManagedPolicy;
        // Read in the policy document which should be properly formatted json
        const policyDocument = JSON.parse(
          this.scope.generatePolicyReplacements(path.join(props.configDirPath, policyItem.policy), false),
        );
        resource.managedPolicyName = policyItem.name;
        resource.policyDocument = policyDocument;
        this.policies[policyItem.name] = resource;
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(policyItem.name)}PolicyArn`),
          parameterName: this.scope.getSsmPath(SsmResourceType.IAM_POLICY, [policyItem.name]),
          stringValue: resource.ref,
        });
        this.scope.addAseaResource(AseaResourceType.IAM_POLICY, policyItem.name);
      }
    }
  }
}
