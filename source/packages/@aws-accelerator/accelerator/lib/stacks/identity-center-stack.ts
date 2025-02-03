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
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';

import {
  IdentityCenterAssignmentConfig,
  IdentityCenterConfig,
  IdentityCenterPermissionSetConfig,
} from '@aws-accelerator/config';
import { IdentityCenterAssignments, IdentityCenterInstance } from '@aws-accelerator/constructs';
import { AcceleratorKeyType, AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

interface PermissionSetMapping {
  name: string;
  arn: string;
  permissionSet: cdk.aws_sso.CfnPermissionSet;
}
export class IdentityCenterStack extends AcceleratorStack {
  /**
   * KMS Key used to encrypt CloudWatch logs, when undefined default AWS managed key will be used
   */
  private cloudwatchKey: cdk.aws_kms.IKey | undefined;
  /**
   * KMS Key used to encrypt custom resource Lambda environment variables, when undefined default AWS managed key will be used
   */
  private lambdaKey: cdk.aws_kms.IKey | undefined;
  /**
   * Identity Center Instance ARN
   */
  private identityCenterInstanceArn: string | undefined;
  /**
   * Identity Center Identity Store Id
   */
  private identityCenterIdentityStoreId: string | undefined;

  /**
   * Constructor for Identity-Center Stack
   *
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    this.lambdaKey = this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);

    //
    // Only deploy Identity Center resources into the home region
    //
    if (
      props.globalConfig.homeRegion === cdk.Stack.of(this).region &&
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId()
    ) {
      this.getIdentityCenterProperties();
      this.addIdentityCenterResources();
    }

    //
    // Create SSM parameters
    //
    this.createSsmParameters();

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Function to create Identity Center Permission Sets
   * @param identityCenterItem
   * @param identityCenterInstanceArn
   * @returns
   */
  private addIdentityCenterPermissionSets(
    identityCenterItem: IdentityCenterConfig,
    identityCenterInstanceArn: string,
  ): PermissionSetMapping[] {
    const permissionSetMap: PermissionSetMapping[] = [];

    for (const identityCenterPermissionSet of identityCenterItem.identityCenterPermissionSets ?? []) {
      const permissionSet = this.createPermissionsSet(
        identityCenterPermissionSet,
        identityCenterInstanceArn,
        permissionSetMap,
      );
      permissionSetMap.push(permissionSet);
    }

    return permissionSetMap;
  }

  /**
   * Function to get CustomerManaged Policy References List
   * @param identityCenterPermissionSet {@link IdentityCenterPermissionSetConfig}
   * @returns customerManagedPolicyReferencesList {@link cdk.aws_sso.CfnPermissionSet.CustomerManagedPolicyReferenceProperty}[]
   */
  private getCustomerManagedPolicyReferencesList(
    identityCenterPermissionSet: IdentityCenterPermissionSetConfig,
  ): cdk.aws_sso.CfnPermissionSet.CustomerManagedPolicyReferenceProperty[] {
    const customerManagedPolicyReferencesList: cdk.aws_sso.CfnPermissionSet.CustomerManagedPolicyReferenceProperty[] =
      [];

    if (identityCenterPermissionSet.policies) {
      this.logger.info(`Adding Identity Center Permission Set ${identityCenterPermissionSet.name}`);

      // Add Customer managed and LZA managed policies
      for (const policy of [
        ...(identityCenterPermissionSet.policies.customerManaged ?? []),
        ...(identityCenterPermissionSet.policies.acceleratorManaged ?? []),
      ]) {
        customerManagedPolicyReferencesList.push({ name: policy });
      }
    }

    return customerManagedPolicyReferencesList;
  }

  /**
   * Function to get AWS Managed permissionsets
   * @param identityCenterPermissionSet {@link IdentityCenterPermissionSetConfig}
   * @returns awsManagedPolicies string[]
   */
  private getAwsManagedPolicies(identityCenterPermissionSet: IdentityCenterPermissionSetConfig): string[] {
    const awsManagedPolicies: string[] = [];

    for (const awsManagedPolicy of identityCenterPermissionSet?.policies?.awsManaged ?? []) {
      if (awsManagedPolicy.startsWith('arn:')) {
        awsManagedPolicies.push(awsManagedPolicy);
      } else {
        awsManagedPolicies.push(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(awsManagedPolicy).managedPolicyArn);
      }
    }

    return awsManagedPolicies;
  }

  /**
   * Function to get permission boundary
   * @param identityCenterPermissionSet {@link IdentityCenterPermissionSetConfig}
   * @returns permissionsBoundary {@link cdk.aws_sso.CfnPermissionSet.PermissionsBoundaryProperty} | undefined
   */
  private getPermissionBoundary(
    identityCenterPermissionSet: IdentityCenterPermissionSetConfig,
  ): cdk.aws_sso.CfnPermissionSet.PermissionsBoundaryProperty | undefined {
    let permissionsBoundary: cdk.aws_sso.CfnPermissionSet.PermissionsBoundaryProperty | undefined;

    if (identityCenterPermissionSet.policies?.permissionsBoundary) {
      if (identityCenterPermissionSet.policies.permissionsBoundary.customerManagedPolicy) {
        permissionsBoundary = {
          customerManagedPolicyReference: {
            name: identityCenterPermissionSet.policies.permissionsBoundary.customerManagedPolicy.name,
            path: identityCenterPermissionSet.policies.permissionsBoundary.customerManagedPolicy.path,
          },
        };
      }
      if (identityCenterPermissionSet.policies.permissionsBoundary.awsManagedPolicyName) {
        permissionsBoundary = {
          managedPolicyArn: cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
            identityCenterPermissionSet.policies.permissionsBoundary.awsManagedPolicyName,
          ).managedPolicyArn,
        };
      }
    }

    return permissionsBoundary;
  }

  /**
   * Create Identity Center Permission sets
   * @param identityCenterPermissionSet
   * @param identityCenterInstanceArn
   * @returns
   */
  private createPermissionsSet(
    identityCenterPermissionSet: IdentityCenterPermissionSetConfig,
    identityCenterInstanceArn: string,
    permissionSetMap: PermissionSetMapping[],
  ): PermissionSetMapping {
    const customerManagedPolicyReferencesList =
      this.getCustomerManagedPolicyReferencesList(identityCenterPermissionSet);

    let convertedSessionDuration: string | undefined;

    if (identityCenterPermissionSet.sessionDuration) {
      convertedSessionDuration = this.convertMinutesToIso8601(identityCenterPermissionSet.sessionDuration);
    }

    const awsManagedPolicies = this.getAwsManagedPolicies(identityCenterPermissionSet);

    const permissionsBoundary = this.getPermissionBoundary(identityCenterPermissionSet);

    let permissionSetProps: cdk.aws_sso.CfnPermissionSetProps = {
      name: identityCenterPermissionSet.name,
      instanceArn: identityCenterInstanceArn,
      managedPolicies: awsManagedPolicies.length > 0 ? awsManagedPolicies : undefined,
      customerManagedPolicyReferences:
        customerManagedPolicyReferencesList.length > 0 ? customerManagedPolicyReferencesList : undefined,
      sessionDuration: convertedSessionDuration,
      permissionsBoundary: permissionsBoundary,
      description: identityCenterPermissionSet.description,
    };

    if (identityCenterPermissionSet.policies?.inlinePolicy) {
      // Read in the policy document which should be properly formatted json
      const inlinePolicyDocument = JSON.parse(
        this.generatePolicyReplacements(
          path.join(this.props.configDirPath, identityCenterPermissionSet.policies?.inlinePolicy),
          false,
          this.organizationId,
        ),
      );
      permissionSetProps = {
        name: identityCenterPermissionSet.name,
        instanceArn: identityCenterInstanceArn,
        managedPolicies: awsManagedPolicies.length > 0 ? awsManagedPolicies : undefined,
        customerManagedPolicyReferences:
          customerManagedPolicyReferencesList.length > 0 ? customerManagedPolicyReferencesList : undefined,
        sessionDuration: convertedSessionDuration ?? undefined,
        inlinePolicy: inlinePolicyDocument,
        permissionsBoundary: permissionsBoundary,
        description: identityCenterPermissionSet.description,
      };
    }

    const permissionSet = new cdk.aws_sso.CfnPermissionSet(
      this,
      `${pascalCase(identityCenterPermissionSet.name)}IdentityCenterPermissionSet`,
      permissionSetProps,
    );

    // Create dependency for CfnPermissionSet
    for (const item of permissionSetMap) {
      permissionSet.node.addDependency(item.permissionSet);
    }

    return { name: permissionSet.name, arn: permissionSet.attrPermissionSetArn, permissionSet: permissionSet };
  }

  private addIdentityCenterAssignments(
    identityCenterItem: IdentityCenterConfig,
    identityCenterInstanceArn: string,
    permissionSetMap: PermissionSetMapping[],
  ) {
    for (const assignment of identityCenterItem.identityCenterAssignments ?? []) {
      this.createAssignment(
        assignment,
        permissionSetMap,
        identityCenterInstanceArn,
        this.identityCenterIdentityStoreId!,
      );
    }
  }

  private createAssignment(
    assignment: IdentityCenterAssignmentConfig,
    permissionSetMap: PermissionSetMapping[],
    identityCenterInstanceArn: string,
    identityStoreId: string,
  ) {
    const targetAccountIds = this.getAccountIdsFromDeploymentTargets(assignment.deploymentTargets);
    const permissionSetArnValue = this.getPermissionSetArn(permissionSetMap, assignment.permissionSetName);
    new IdentityCenterAssignments(this, `${pascalCase(`IdentityCenterAssignment-${assignment.name}`)}`, {
      identityStoreId: identityStoreId,
      identityCenterInstanceArn: identityCenterInstanceArn,
      principals: assignment.principals,
      principalType: assignment.principalType,
      principalId: assignment.principalId,
      permissionSetArnValue: permissionSetArnValue,
      accountIds: targetAccountIds,
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
    });
  }

  private getPermissionSetArn(permissionSetMap: PermissionSetMapping[], name: string) {
    let permissionSetArn = '';
    for (const permissionSet of permissionSetMap) {
      if (permissionSet.name == name && permissionSet.arn) {
        permissionSetArn = permissionSet.arn;
      }
    }
    return permissionSetArn;
  }

  /**
   * Function to add Identity Center Resources
   * @param securityAdminAccountId
   */
  private addIdentityCenterResources() {
    if (this.props.iamConfig.identityCenter) {
      const permissionSetList = this.addIdentityCenterPermissionSets(
        this.props.iamConfig.identityCenter,
        this.identityCenterInstanceArn!,
      );

      this.addIdentityCenterAssignments(
        this.props.iamConfig.identityCenter,
        this.identityCenterInstanceArn!,
        permissionSetList,
      );
    }
  }

  /**
   * Function to retrieve IDC instance ARN
   * @param securityAdminAccountId
   */
  private getIdentityCenterProperties() {
    if (this.props.iamConfig.identityCenter) {
      const identityCenterInstance = new IdentityCenterInstance(this, 'IdentityCenterInstance', {
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey!,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });

      this.identityCenterInstanceArn = identityCenterInstance.instanceArn;
      this.identityCenterIdentityStoreId = identityCenterInstance.instanceStoreId;

      new cdk.aws_ssm.StringParameter(this, 'IdentityCenterInstanceArnSsmParameter', {
        parameterName: this.acceleratorResourceNames.parameters.identityCenterInstanceArn,
        stringValue: this.identityCenterInstanceArn,
      });

      new cdk.aws_ssm.StringParameter(this, 'IdentityCenterIdentityStoreIdSsmParameter', {
        parameterName: this.acceleratorResourceNames.parameters.identityStoreId,
        stringValue: this.identityCenterIdentityStoreId,
      });
    }
  }
}
