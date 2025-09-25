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
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { CfnResourceType } from '@aws-accelerator/config';

import { AseaResource, AseaResourceProps } from './resource';

interface ResourceProcessingParams {
  account: string;
  managementAccount: string;
  stackName: string;
  resources: CfnResourceType[];
}

const RESOURCE_TYPE = 'AWS::Lambda::Function';
const PERMISSION_RESOURCE_TYPE = 'AWS::Lambda::Permission';
const EVENTS_RULE_RESOURCE_TYPE = 'AWS::Events::Rule';
const IAM_ROLE_RESOURCE_TYPE = 'AWS::IAM::Role';
const IAM_POLICY_RESOURCE_TYPE = 'AWS::IAM::Policy';
const STEP_FUNCTIONS_RESOURCE_TYPE = 'AWS::StepFunctions::StateMachine';

/**
 * Handles ManagedPolicies created by ASEA.
 * All Managed Policies driven by ASEA configuration are deployed in Phase-1
 */
export class Lambda extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);

    const prefix = this.props.globalConfig.externalLandingZoneResources?.acceleratorPrefix ?? 'ASEA';
    const lambdas = this.scope.importStackResources.getResourcesByType(RESOURCE_TYPE);
    const lambdaPermissions = this.scope.importStackResources.getResourcesByType(PERMISSION_RESOURCE_TYPE);
    const eventsRules = this.scope.importStackResources.getResourcesByType(EVENTS_RULE_RESOURCE_TYPE);
    const iamRoles = this.scope.importStackResources.getResourcesByType(IAM_ROLE_RESOURCE_TYPE);
    const iamPolicies = this.scope.importStackResources.getResourcesByType(IAM_POLICY_RESOURCE_TYPE);
    const stepFunctions = this.scope.importStackResources.getResourcesByType(STEP_FUNCTIONS_RESOURCE_TYPE);
    const customResources = this.scope.importStackResources.cfnResources.filter(r =>
      r.resourceType.startsWith('Custom::'),
    );

    this.replaceLambdaRole(
      `${prefix}-L-SFN-MasterRole`,
      `${prefix}-LZA-Lambda-Execution`,
      props.stackInfo.accountId,
      props.accountsConfig.getManagementAccountId(),
      lambdas,
    );

    const baseParams = {
      account: props.stackInfo.accountId,
      managementAccount: props.accountsConfig.getManagementAccountId(),
      stackName: props.stackInfo.stackName,
    };

    // Only process/delete resources for management account and Phase5 stacks
    if (baseParams.account !== baseParams.managementAccount || !baseParams.stackName.includes('Management-Phase5')) {
      return;
    }

    // Process all resources first
    this.processLambdas({ ...baseParams, resources: lambdas });
    this.processLambdaPermissions({ ...baseParams, resources: lambdaPermissions });
    this.processEventsRules({ ...baseParams, resources: eventsRules });
    this.processStepFunctions({ ...baseParams, resources: stepFunctions });
    this.processCustomResources({ ...baseParams, resources: customResources });

    // Then delete resources
    this.deleteLambdas({ ...baseParams, resources: lambdas });
    this.deleteLambdaPermissions({ ...baseParams, resources: lambdaPermissions });
    this.deleteEventsRules({ ...baseParams, resources: eventsRules });
    this.deleteStepFunctions({ ...baseParams, resources: stepFunctions });
    this.deleteIamRoles({ ...baseParams, resources: iamRoles });
    this.deleteIamPolicies({ ...baseParams, resources: iamPolicies });
    this.deleteCustomResources({ ...baseParams, resources: customResources });
  }

  private processLambdas(params: ResourceProcessingParams) {
    for (const lambda of params.resources) {
      try {
        const lambdaFunction = this.stack.getResource(lambda.logicalResourceId) as cdk.aws_lambda.CfnFunction;
        if (!lambdaFunction) {
          continue;
        }
        this.scope.addAseaResource(RESOURCE_TYPE, lambda.physicalResourceId!);
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private deleteLambdas(params: ResourceProcessingParams) {
    for (const lambda of params.resources) {
      try {
        const lambdaFunction = this.stack.getResource(lambda.logicalResourceId) as cdk.aws_lambda.CfnFunction;
        if (!lambdaFunction) {
          continue;
        }
        this.scope.addLogs(LogLevel.WARN, `Deleting Lambda function: ${lambda.physicalResourceId}`);
        this.scope.addDeleteFlagForAseaResource({
          type: RESOURCE_TYPE,
          identifier: lambda.physicalResourceId,
          logicalId: lambda.logicalResourceId,
        });
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private setRoleArn(roleName: string, account: string) {
    return `arn:aws:iam::${account}:role/${roleName}`;
  }

  private replaceLambdaRole(
    oldPartialRoleName: string,
    newRoleName: string,
    account: string,
    managementAccount: string,
    lambdas: CfnResourceType[],
  ) {
    if (account !== managementAccount) {
      return;
    }
    const newRoleArn = this.setRoleArn(newRoleName, managementAccount);

    for (const lambda of lambdas) {
      if (this.hasMatchingRole(lambda, oldPartialRoleName)) {
        this.updateLambdaRole(lambda, newRoleArn);
      }
    }
  }

  private hasMatchingRole(lambda: CfnResourceType, roleName: string): boolean {
    const roleJoin = lambda.resourceMetadata['Properties']?.Role?.['Fn::Join'];
    if (!roleJoin || !roleJoin[1]) {
      return false;
    }
    const roleArray = JSON.stringify(roleJoin[1]);
    return roleArray.includes(roleName);
  }

  private updateLambdaRole(lambda: CfnResourceType, newRoleArn: string): void {
    try {
      const lambdaFunction = this.stack.getResource(lambda.logicalResourceId) as cdk.aws_lambda.CfnFunction;
      lambdaFunction.role = newRoleArn;
    } catch (e) {
      this.scope.addLogs(LogLevel.ERROR, String(e));
    }
  }

  private processLambdaPermissions(params: ResourceProcessingParams) {
    for (const permission of params.resources) {
      try {
        const lambdaPermission = this.stack.getResource(permission.logicalResourceId) as cdk.aws_lambda.CfnPermission;
        if (!lambdaPermission) {
          continue;
        }
        this.scope.addAseaResource(PERMISSION_RESOURCE_TYPE, permission.physicalResourceId!);
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private deleteLambdaPermissions(params: ResourceProcessingParams) {
    for (const permission of params.resources) {
      try {
        const lambdaPermission = this.stack.getResource(permission.logicalResourceId) as cdk.aws_lambda.CfnPermission;
        if (!lambdaPermission) {
          continue;
        }
        this.scope.addLogs(LogLevel.WARN, `Deleting Lambda permission: ${permission.physicalResourceId}`);
        this.scope.addDeleteFlagForAseaResource({
          type: PERMISSION_RESOURCE_TYPE,
          identifier: permission.physicalResourceId,
          logicalId: permission.logicalResourceId,
        });
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private processEventsRules(params: ResourceProcessingParams) {
    for (const rule of params.resources) {
      try {
        const eventsRule = this.stack.getResource(rule.logicalResourceId) as cdk.aws_events.CfnRule;
        if (!eventsRule) {
          continue;
        }
        this.scope.addAseaResource(EVENTS_RULE_RESOURCE_TYPE, rule.physicalResourceId!);
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private deleteEventsRules(params: ResourceProcessingParams) {
    for (const rule of params.resources) {
      try {
        const eventsRule = this.stack.getResource(rule.logicalResourceId) as cdk.aws_events.CfnRule;
        if (!eventsRule) {
          continue;
        }
        this.scope.addLogs(LogLevel.WARN, `Deleting Events rule: ${rule.physicalResourceId}`);
        this.scope.addDeleteFlagForAseaResource({
          type: EVENTS_RULE_RESOURCE_TYPE,
          identifier: rule.physicalResourceId,
          logicalId: rule.logicalResourceId,
        });
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private processStepFunctions(params: ResourceProcessingParams) {
    for (const stateMachine of params.resources) {
      try {
        const stepFunction = this.stack.getResource(
          stateMachine.logicalResourceId,
        ) as cdk.aws_stepfunctions.CfnStateMachine;
        if (!stepFunction) {
          continue;
        }
        this.scope.addAseaResource(STEP_FUNCTIONS_RESOURCE_TYPE, stateMachine.physicalResourceId!);
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private processCustomResources(params: ResourceProcessingParams) {
    for (const resource of params.resources) {
      try {
        const customResource = this.stack.getResource(resource.logicalResourceId) as cdk.CfnCustomResource;
        if (!customResource) {
          continue;
        }
        this.scope.addAseaResource(resource.resourceType, resource.physicalResourceId!);
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private deleteStepFunctions(params: ResourceProcessingParams) {
    for (const stateMachine of params.resources) {
      try {
        const stepFunction = this.stack.getResource(
          stateMachine.logicalResourceId,
        ) as cdk.aws_stepfunctions.CfnStateMachine;
        if (!stepFunction) {
          continue;
        }
        this.scope.addLogs(LogLevel.WARN, `Deleting Step Functions state machine: ${stateMachine.physicalResourceId}`);
        this.scope.addDeleteFlagForAseaResource({
          type: STEP_FUNCTIONS_RESOURCE_TYPE,
          identifier: stateMachine.physicalResourceId,
          logicalId: stateMachine.logicalResourceId,
        });
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private deleteIamRoles(params: ResourceProcessingParams) {
    for (const role of params.resources) {
      try {
        const iamRole = this.stack.getResource(role.logicalResourceId) as cdk.aws_iam.CfnRole;
        if (!iamRole) {
          continue;
        }
        this.scope.addLogs(LogLevel.WARN, `Deleting IAM role: ${role.physicalResourceId}`);
        this.scope.addDeleteFlagForAseaResource({
          type: IAM_ROLE_RESOURCE_TYPE,
          identifier: role.physicalResourceId,
          logicalId: role.logicalResourceId,
        });
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private deleteIamPolicies(params: ResourceProcessingParams) {
    for (const policy of params.resources) {
      try {
        const iamPolicy = this.stack.getResource(policy.logicalResourceId) as cdk.aws_iam.CfnPolicy;
        if (!iamPolicy) {
          continue;
        }
        this.scope.addLogs(LogLevel.WARN, `Deleting IAM policy: ${policy.physicalResourceId}`);
        this.scope.addDeleteFlagForAseaResource({
          type: IAM_POLICY_RESOURCE_TYPE,
          identifier: policy.physicalResourceId,
          logicalId: policy.logicalResourceId,
        });
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }

  private deleteCustomResources(params: ResourceProcessingParams) {
    for (const resource of params.resources) {
      try {
        const customResource = this.stack.getResource(resource.logicalResourceId) as cdk.CfnCustomResource;
        if (!customResource) {
          continue;
        }
        this.scope.addLogs(LogLevel.WARN, `Deleting custom resource: ${resource.physicalResourceId}`);
        this.scope.addDeleteFlagForAseaResource({
          type: resource.resourceType,
          identifier: resource.physicalResourceId,
          logicalId: resource.logicalResourceId,
        });
      } catch (e) {
        this.scope.addLogs(LogLevel.ERROR, String(e));
      }
    }
  }
}
