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

import path from 'path';
import * as cdk from 'aws-cdk-lib';
import { CfnManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { AseaResourceType, CfnResourceType, PolicyConfig } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { pascalCase } from 'pascal-case';
import { AseaResource, AseaResourceProps } from './resource';

const RESOURCE_TYPE = 'AWS::IAM::ManagedPolicy';
const ASEA_PHASE_NUMBER = '1';

/**
 * Handles ManagedPolicies created by ASEA.
 * All Managed Policies driven by ASEA configuration are deployed in Phase-1
 */
export class ManagedPolicies extends AseaResource {
  readonly policies: { [key: string]: CfnManagedPolicy } = {};
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    if (this.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }

    if (props.globalConfig.homeRegion !== this.scope.region) {
      return;
    }

    const policySetsInScope = props.iamConfig.policySets.filter(policySet =>
      this.scope.isIncluded(policySet.deploymentTargets),
    );
    const policiesInScope = policySetsInScope.map(policySetItem => policySetItem.policies).flat();
    this.addDeletionFlagsForPolicies(policiesInScope, RESOURCE_TYPE);
    this.updatePolicies(policiesInScope, props.configDirPath);
  }

  updatePolicies(policyItems: PolicyConfig[], configPath: string) {
    if (policyItems.length === 0) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE}s to handle in stack`);
      return;
    }

    for (const policyItem of policyItems) {
      const existingPolicy = this.scope.importStackResources.getResourceByPropertyByPartialMatch(
        'ManagedPolicyName',
        policyItem.name,
      );
      if (!existingPolicy) {
        continue;
      }
      this.scope.addLogs(LogLevel.INFO, `Add customer managed policy ${policyItem.name}`);
      let resource;
      try {
        resource = this.stack.getResource(existingPolicy.logicalResourceId) as cdk.aws_iam.CfnManagedPolicy;
      } catch (e) {
        this.scope.addLogs(
          LogLevel.WARN,
          `Could not find resource ${existingPolicy.logicalResourceId} in stack. Skipping update managed policy.`,
        );
        continue;
      }

      // Read in the policy document which should be properly formatted json
      const policyDocument = JSON.parse(
        this.scope.generatePolicyReplacements(path.join(configPath, policyItem.policy), false),
      );
      const existingPolicyName = existingPolicy['resourceMetadata']['Properties']['ManagedPolicyName'];
      resource.managedPolicyName = existingPolicy['resourceMetadata']['Properties']['ManagedPolicyName'];
      resource.policyDocument = policyDocument;
      this.policies[existingPolicyName] = resource;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(policyItem.name)}PolicyArn`),
        parameterName: this.scope.getSsmPath(SsmResourceType.IAM_POLICY, [policyItem.name]),
        stringValue: resource.ref,
      });
      this.scope.addAseaResource(AseaResourceType.IAM_POLICY, policyItem.name);
    }
  }
  private addDeletionFlagsForPolicies(policyItems: PolicyConfig[], resourceType: string) {
    const importPolicies = this.scope.importStackResources.getResourcesByType(resourceType);
    for (const importPolicy of importPolicies) {
      const policyResource = this.getPolicyResource(importPolicy);
      if (!policyResource) {
        continue;
      }
      const policyName = policyResource.managedPolicyName;
      if (!policyName) {
        continue;
      }
      const policyExistsInConfig = policyItems.find(item => policyName.includes(item.name));
      if (!policyExistsInConfig) {
        this.addDeletionFlagForPolicy({
          type: resourceType,
          identifier: policyName,
          logicalId: importPolicy.logicalResourceId,
        });
      }
    }
  }
  getPolicyResource(importPolicy: CfnResourceType) {
    let policyResource;
    try {
      policyResource = this.scope.getResource(importPolicy.logicalResourceId) as cdk.aws_iam.CfnManagedPolicy;
    } catch (e) {
      this.scope.addLogs(LogLevel.WARN, `Could not find resource ${importPolicy.logicalResourceId}`);
      const policyName = importPolicy.resourceMetadata['Properties']['ManagedPolicyName'];
      this.addDeletionFlagForPolicy({
        type: importPolicy.resourceType,
        identifier: policyName,
        logicalId: importPolicy.logicalResourceId,
      });
    }
    return policyResource;
  }
  addDeletionFlagForPolicy(props: { type: string; identifier: string; logicalId: string }) {
    this.scope.addDeleteFlagForAseaResource({
      type: props.type,
      identifier: props.identifier,
      logicalId: props.logicalId,
    });
    const ssmResource = this.scope.importStackResources.getSSMParameterByName(
      this.scope.getSsmPath(SsmResourceType.IAM_POLICY, [props.identifier]),
    );
    if (ssmResource) {
      this.scope.addDeleteFlagForAseaResource({
        logicalId: ssmResource.logicalResourceId,
      });
    }
  }
}
