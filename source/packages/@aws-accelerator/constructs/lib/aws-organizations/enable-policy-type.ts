/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { Construct } from 'constructs';

const path = require('path');

export enum PolicyTypeEnum {
  SERVICE_CONTROL_POLICY = 'SERVICE_CONTROL_POLICY',
  TAG_POLICY = 'TAG_POLICY',
  BACKUP_POLICY = 'BACKUP_POLICY',
  AISERVICES_OPT_OUT_POLICY = 'AISERVICES_OPT_OUT_POLICY',
}

/**
 * Initialized EnablePolicyType properties
 */
export interface EnablePolicyTypeProps {
  readonly policyType: PolicyTypeEnum;
}

/**
 * Class to initialize EnablePolicyType
 */
export class EnablePolicyType extends cdk.Resource {
  constructor(scope: Construct, id: string, props: EnablePolicyTypeProps) {
    super(scope, id);

    const ENABLE_POLICY_TYPE = 'Custom::EnablePolicyType';

    const cr = cdk.CustomResourceProvider.getOrCreateProvider(this, ENABLE_POLICY_TYPE, {
      codeDirectory: path.join(__dirname, 'enable-policy-type/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'organizations:DescribeOrganization',
            'organizations:DisablePolicyType',
            'organizations:EnablePolicyType',
            'organizations:ListRoots',
            'organizations:ListPoliciesForTarget',
            'organizations:ListTargetsForPolicy',
            'organizations:DescribeEffectivePolicy',
            'organizations:DescribePolicy',
            'organizations:DisableAWSServiceAccess',
            'organizations:DetachPolicy',
            'organizations:DeletePolicy',
            'organizations:DescribeAccount',
            'organizations:ListAWSServiceAccessForOrganization',
            'organizations:ListPolicies',
            'organizations:ListAccountsForParent',
            'organizations:ListAccounts',
            'organizations:EnableAWSServiceAccess',
            'organizations:ListCreateAccountStatus',
            'organizations:UpdatePolicy',
            'organizations:DescribeOrganizationalUnit',
            'organizations:AttachPolicy',
            'organizations:ListParents',
            'organizations:ListOrganizationalUnitsForParent',
            'organizations:CreatePolicy',
            'organizations:DescribeCreateAccountStatus',
          ],
          Resource: '*',
        },
      ],
    });

    new cdk.CustomResource(this, 'Resource', {
      resourceType: ENABLE_POLICY_TYPE,
      serviceToken: cr.serviceToken,
      properties: {
        partition: cdk.Aws.PARTITION,
        ...props,
      },
    });

    // this.organizationalUnitId = resource.ref;
    // this.organizationalUnitArn = resource.getAttString('arn');
  }
}
