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

import { AseaResourceHelper, AseaResourceHelperProps } from '../resource-helper';
import { CfnManagedPolicy } from 'aws-cdk-lib/aws-iam';

const RESOURCE_TYPE = 'AWS::IAM::ManagedPolicy';
const ASEA_PHASE_NUMBER = 1;

/**
 * Handles ManagedPolicies created by ASEA.
 * All Managed Policies driven by ASEA configuration are deployed in Phase-1
 * TODO: Finish delete on configuration remove
 */
export class ManagedPolicies extends AseaResourceHelper {
  readonly policies: { [key: string]: CfnManagedPolicy } = {};
  constructor(scope: cdk.cloudformation_include.CfnInclude, props: AseaResourceHelperProps) {
    super(scope, props);
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.logger.info(`No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const existingPolicyResources = props.stackInfo.resources.filter(r => r.resourceType === RESOURCE_TYPE);
    for (const policySetItem of this.props.iamConfig.policySets ?? []) {
      if (!this.isIncluded(policySetItem.deploymentTargets) || policySetItem.identityCenterDependency) {
        this.logger.info(`Item excluded`);
        continue;
      }

      for (const policyItem of policySetItem.policies) {
        const existingPolicy = existingPolicyResources.find(
          p => p.resourceMetadata['Properties'].ManagedPolicyName === policyItem.name,
        );
        if (!existingPolicy) {
          continue;
        }
        this.logger.info(`Add customer managed policy ${policyItem.name}`);
        const resource = scope.getResource(existingPolicy.logicalResourceId) as cdk.aws_iam.CfnManagedPolicy;
        // Read in the policy document which should be properly formatted json
        const policyDocument = JSON.parse(
          this.generatePolicyReplacements(path.join(this.props.configDirPath, policyItem.policy), false),
        );
        resource.managedPolicyName = policyItem.name;
        resource.policyDocument = policyDocument;
        this.policies[policyItem.name] = resource;
      }
    }
  }
}
