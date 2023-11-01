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
import { pascalCase } from 'change-case';
import * as path from 'path';

import { Construct } from 'constructs';
import { DetectResourcePolicy, RemediateResourcePolicy } from '@aws-accelerator/constructs';

import {
  AcceleratorKeyType,
  AcceleratorStack,
  AcceleratorStackProps,
  NagSuppressionRuleIds,
} from './accelerator-stack';
import { DataPerimeterConfig, ResourcePolicyConfig, ResourcePolicySetConfig } from '@aws-accelerator/config';

/**
 * Resource-based policy generated file path type
 */
type rbpGeneratedFilePath = {
  /**
   * Name of the rbp
   */
  name: string;
  /**
   * The relative path to the file containing the policy document in the config repo
   */
  path: string;
  /**
   * The path to the temp file returned by generatePolicyReplacements()
   */
  tempPath: string;
};

/**
 * Security Perimeter Stack, configures data perimeter resources (Config Rule and SSM)
 */
export class DataPerimeterStack extends AcceleratorStack {
  readonly cloudwatchKey: cdk.aws_kms.IKey;
  readonly lambdaKey: cdk.aws_kms.IKey;
  rbpGeneratedFilePathList: rbpGeneratedFilePath[] = [];

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.logger.info('Begin stack synthesis');
    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    this.lambdaKey = this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);

    if (!props.securityConfig.dataPerimeter || !props.securityConfig.dataPerimeter.enable) return;

    //
    // Config Rules
    //
    this.setupDataPerimeterConfigRules();

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();

    this.logger.info('End stack synthesis');
  }

  /**
   * Function to setup AWS Config rules
   */
  private setupDataPerimeterConfigRules() {
    for (const policySet of this.props.securityConfig.dataPerimeter?.policySets || []) {
      if (!this.isIncluded(policySet.deploymentTargets)) {
        continue;
      }

      //
      // Load policy replacement for resource based policy
      //
      this.loadPolicyReplacements(this.props, policySet, this.props.securityConfig.dataPerimeter!.resourcePolicies);

      const acceleratorPrefix = this.props.prefixes.accelerator;
      const detectResourcePolicy = new DetectResourcePolicy(this, 'DetectResourcePolicy', {
        acceleratorPrefix,
        configDirPath: this.props.configDirPath,
        homeRegion: this.props.globalConfig.homeRegion,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        rbpFilePaths: this.rbpGeneratedFilePathList,
        kmsKeyCloudWatch: this.cloudwatchKey,
        kmsKeyLambda: this.lambdaKey,
      });

      let ruleName = this.props.securityConfig.dataPerimeter!.ruleName || DataPerimeterConfig.DEFAULT_RULE_NAME;
      ruleName = ruleName.startsWith(acceleratorPrefix) ? ruleName : `${acceleratorPrefix}-${ruleName}`;
      const configRule = new cdk.aws_config.CustomRule(this, pascalCase(ruleName), {
        configRuleName: ruleName,
        lambdaFunction: detectResourcePolicy.lambdaFunction,
        periodic: true,
        description: 'Config rule to detect non-compliant resource based policy',
        ruleScope: {
          resourceTypes: [
            cdk.aws_config.ResourceType.S3_BUCKET,
            cdk.aws_config.ResourceType.KMS_KEY,
            cdk.aws_config.ResourceType.IAM_ROLE,
          ],
        },
        configurationChanges: true,
      });
      configRule.node.addDependency(detectResourcePolicy.lambdaFunction);

      let documentName =
        this.props.securityConfig.dataPerimeter!.ssmDocumentName || DataPerimeterConfig.DEFAULT_SSM_DOCUMENT_NAME;
      documentName = documentName.startsWith(this.props.prefixes.accelerator)
        ? documentName
        : `${this.props.prefixes.accelerator}-${documentName}`;
      const remediationConfig = this.props.securityConfig.dataPerimeter!.remediation;

      const remediationRole = this.createRemediationRole(
        ruleName,
        `arn:${cdk.Stack.of(this).partition}:ssm:${
          cdk.Stack.of(this).region
        }:${this.props.accountsConfig.getAuditAccountId()}:document/${documentName}`,
        true,
      );

      const remediateResourcePolicy = new RemediateResourcePolicy(this, 'RemediateResourcePolicy', {
        acceleratorPrefix: this.props.prefixes.accelerator,
        configDirPath: this.props.configDirPath,
        homeRegion: this.props.globalConfig.homeRegion,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        rbpFilePaths: this.rbpGeneratedFilePathList,
        kmsKeyCloudWatch: this.cloudwatchKey,
        kmsKeyLambda: this.lambdaKey,
        role: remediationRole,
      });

      remediationRole.addToPolicy(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: ['*'],
        }),
      );

      new cdk.aws_config.CfnRemediationConfiguration(this, pascalCase('Detect-Res-Remediation'), {
        configRuleName: ruleName,
        targetId: `arn:${cdk.Stack.of(this).partition}:ssm:${
          cdk.Stack.of(this).region
        }:${this.props.accountsConfig.getAuditAccountId()}:document/${documentName}`,
        targetType: 'SSM_DOCUMENT',

        automatic: remediationConfig.automatic,
        maximumAutomaticAttempts: remediationConfig.maximumAutomaticAttempts,
        retryAttemptSeconds: remediationConfig.retryAttemptSeconds,
        parameters: {
          ResourceId: {
            ResourceValue: {
              Value: 'RESOURCE_ID',
            },
          },
          AutomationAssumeRole: {
            StaticValue: {
              Values: [remediationRole.roleArn],
            },
          },
          FunctionName: {
            StaticValue: {
              Values: [remediateResourcePolicy.lambdaFunction.functionArn],
            },
          },
          ConfigRuleName: {
            StaticValue: {
              Values: [ruleName],
            },
          },
        },
      }).node.addDependency(configRule);
    }
  }

  /**
   * Function to create remediation role
   * @param ruleName
   * @param resources
   * @param isLambdaRole
   * @private
   */
  private createRemediationRole(ruleName: string, resources?: string, isLambdaRole = false): cdk.aws_iam.Role {
    const principals: cdk.aws_iam.PrincipalBase[] = [new cdk.aws_iam.ServicePrincipal('ssm.amazonaws.com')];
    if (isLambdaRole) {
      principals.push(new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'));
    }

    const role = new cdk.aws_iam.Role(this, pascalCase(ruleName) + '-RemediationRole', {
      assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
    });

    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'ssm:GetAutomationExecution',
          'ssm:StartAutomationExecution',
          'ssm:GetParameters',
          'ssm:GetParameter',
          'ssm:PutParameter',
        ],
        resources: [resources ?? '*'],
      }),
    );
    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );
    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['iam:getRole', 'iam:updateAssumeRolePolicy'],
        resources: ['*'],
      }),
    );
    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          's3:GetBucketPolicy',
          's3:PutBucketPolicy',
          'kms:GetKeyPolicy',
          'kms:PutKeyPolicy',
          'kms:DescribeKey',
        ],
        resources: ['*'],
      }),
    );
    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['config:BatchGetResourceConfig', 'config:SelectResourceConfig'],
        resources: ['*'],
      }),
    );
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/${pascalCase(ruleName)}-RemediationRole/DefaultPolicy/Resource`,
          reason: 'AWS Config rule remediation role, created by the permission provided in config repository',
        },
      ],
    });

    return role;
  }

  /**
   * Function to load replacements within the provided resource based policy documents
   * @param props {@link AcceleratorStackProps}
   * @returns
   */
  private loadPolicyReplacements(
    props: AcceleratorStackProps,
    policySet: ResourcePolicySetConfig,
    defaultPolicies: ResourcePolicyConfig[],
  ): void {
    this.rbpGeneratedFilePathList = [];
    for (const policy of policySet.resourcePolicies || defaultPolicies) {
      this.logger.info(`Create resource based policy (${policy.name}) from template`);

      this.rbpGeneratedFilePathList.push({
        name: policy.name,
        path: policy.document,
        tempPath: this.generatePolicyReplacements(
          path.join(props.configDirPath, policy.document),
          true,
          this.organizationId,
        ),
      });
    }
  }
}
