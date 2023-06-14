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
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class KeyStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    if (cdk.Stack.of(this).account === props.accountsConfig.getAuditAccountId()) {
      const accountIds = props.accountsConfig.getAccountIds();

      const key = new cdk.aws_kms.Key(this, 'AcceleratorKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.acceleratorKey.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.acceleratorKey.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      if (props.organizationConfig.enable) {
        // Allow Accelerator Role to use the encryption key
        key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow Accelerator Role to use the encryption key`,
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
              ArnLike: {
                'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.prefixes.accelerator}-*`],
              },
            },
          }),
        );
      }

      // Allow Cloudwatch logs to use the encryption key
      key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Cloudwatch logs to use the encryption key`,
          principals: [
            new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`),
          ],
          actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
                cdk.Stack.of(this).region
              }:*:log-group:*`,
            },
          },
        }),
      );

      // Add all services we want to allow usage
      const allowedServicePrincipals: { name: string; principal: string }[] = [
        { name: 'Sns', principal: 'sns.amazonaws.com' },
        { name: 'Lambda', principal: 'lambda.amazonaws.com' },
        { name: 'Cloudwatch', principal: 'cloudwatch.amazonaws.com' },
        { name: 'Sqs', principal: 'sqs.amazonaws.com' },
        // Add similar objects for any other service principal needs access to this key
      ];

      // Deprecated
      if (props.securityConfig.centralSecurityServices.macie.enable) {
        allowedServicePrincipals.push({ name: 'Macie', principal: 'macie.amazonaws.com' });
      }
      // Deprecated
      if (props.securityConfig.centralSecurityServices.guardduty.enable) {
        allowedServicePrincipals.push({ name: 'Guardduty', principal: 'guardduty.amazonaws.com' });
      }
      // Deprecated
      if (props.securityConfig.centralSecurityServices.auditManager?.enable) {
        allowedServicePrincipals.push({ name: 'AuditManager', principal: 'auditmanager.amazonaws.com' });
        key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow Audit Manager service to provision encryption key grants`,
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['kms:CreateGrant'],
            conditions: {
              StringLike: {
                'kms:ViaService': 'auditmanager.*.amazonaws.com',
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
              Bool: { 'kms:GrantIsForAWSResource': 'true' },
            },
            resources: ['*'],
          }),
        );
      }

      allowedServicePrincipals.forEach(item => {
        key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow ${item.name} service to use the encryption key`,
            principals: [new cdk.aws_iam.ServicePrincipal(item.principal)],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
            resources: ['*'],
          }),
        );
      });

      this.ssmParameters.push({
        logicalId: 'AcceleratorKmsArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.acceleratorCmkArn,

        stringValue: key.keyArn,
      });

      // IAM Role to get access to accelerator organization level SSM parameters
      // Only create this role in the home region stack
      if (cdk.Stack.of(this).region === props.globalConfig.homeRegion) {
        if (props.organizationConfig.enable) {
          new cdk.aws_iam.Role(this, 'CrossAccountAcceleratorSsmParamAccessRole', {
            roleName: this.acceleratorResourceNames.roles.crossAccountCmkArnSsmParameterAccess,
            assumedBy: this.getOrgPrincipals(this.organizationId),
            inlinePolicies: {
              default: new cdk.aws_iam.PolicyDocument({
                statements: [
                  new cdk.aws_iam.PolicyStatement({
                    effect: cdk.aws_iam.Effect.ALLOW,
                    actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                    resources: [
                      `arn:${cdk.Stack.of(this).partition}:ssm:*:${cdk.Stack.of(this).account}:parameter${
                        this.acceleratorResourceNames.parameters.acceleratorCmkArn
                      }`,
                      `arn:${cdk.Stack.of(this).partition}:ssm:*:${cdk.Stack.of(this).account}:parameter${
                        this.acceleratorResourceNames.parameters.s3CmkArn
                      }`,
                    ],
                    conditions: {
                      StringEquals: {
                        ...this.getPrincipalOrgIdCondition(this.organizationId),
                      },
                      ArnLike: {
                        'aws:PrincipalARN': [
                          `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.prefixes.accelerator}-*`,
                        ],
                      },
                    },
                  }),
                  new cdk.aws_iam.PolicyStatement({
                    effect: cdk.aws_iam.Effect.ALLOW,
                    actions: ['ssm:DescribeParameters'],
                    resources: ['*'],
                    conditions: {
                      StringEquals: {
                        ...this.getPrincipalOrgIdCondition(this.organizationId),
                      },
                      ArnLike: {
                        'aws:PrincipalARN': [
                          `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.prefixes.accelerator}-*`,
                        ],
                      },
                    },
                  }),
                ],
              }),
            },
          });
        } else {
          const principals: cdk.aws_iam.PrincipalBase[] = [];
          accountIds.forEach(accountId => {
            principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
          });
          new cdk.aws_iam.Role(this, 'CrossAccountAcceleratorSsmParamAccessRole', {
            roleName: this.acceleratorResourceNames.roles.crossAccountCmkArnSsmParameterAccess,
            assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
            inlinePolicies: {
              default: new cdk.aws_iam.PolicyDocument({
                statements: [
                  new cdk.aws_iam.PolicyStatement({
                    effect: cdk.aws_iam.Effect.ALLOW,
                    actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                    resources: [
                      `arn:${cdk.Stack.of(this).partition}:ssm:*:${cdk.Stack.of(this).account}:parameter${
                        this.acceleratorResourceNames.parameters.acceleratorCmkArn
                      }`,
                      `arn:${cdk.Stack.of(this).partition}:ssm:*:${cdk.Stack.of(this).account}:parameter${
                        this.acceleratorResourceNames.parameters.s3CmkArn
                      }`,
                    ],
                    conditions: {
                      StringEquals: {
                        'aws:PrincipalAccount': [...accountIds],
                      },
                      ArnLike: {
                        'aws:PrincipalARN': [
                          `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.prefixes.accelerator}-*`,
                        ],
                      },
                    },
                  }),
                  new cdk.aws_iam.PolicyStatement({
                    effect: cdk.aws_iam.Effect.ALLOW,
                    actions: ['ssm:DescribeParameters'],
                    resources: ['*'],
                    conditions: {
                      StringEquals: {
                        'aws:PrincipalAccount': [...accountIds],
                      },
                      ArnLike: {
                        'aws:PrincipalARN': [
                          `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.prefixes.accelerator}-*`,
                        ],
                      },
                    },
                  }),
                ],
              }),
            },
          });
        }

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/CrossAccountAcceleratorSsmParamAccessRole/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason:
                'This policy is required to give access to ssm parameters in every region where accelerator deployed. Various accelerator roles need permission to describe SSM parameters.',
            },
          ],
        );
      }

      //
      // Create SSM Parameters
      //
      this.createSsmParameters();
    }
  }
}
