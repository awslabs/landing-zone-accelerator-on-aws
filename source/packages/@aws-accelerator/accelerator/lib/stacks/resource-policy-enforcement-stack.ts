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
import {
  ResourcePolicyEnforcementConfig,
  ResourcePolicyConfig,
  ResourcePolicySetConfig,
  SecurityConfigTypes,
} from '@aws-accelerator/config';
import { RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY, ResourceType } from '@aws-accelerator/utils';

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

const SUPPORTED_RESOURCE_TYPE = [
  cdk.aws_config.ResourceType.S3_BUCKET,
  cdk.aws_config.ResourceType.KMS_KEY,
  cdk.aws_config.ResourceType.IAM_ROLE,
  cdk.aws_config.ResourceType.SECRETS_MANAGER_SECRET,
  cdk.aws_config.ResourceType.ECR_REPOSITORY,
  cdk.aws_config.ResourceType.OPENSEARCH_DOMAIN,
  cdk.aws_config.ResourceType.SNS_TOPIC,
  cdk.aws_config.ResourceType.SQS_QUEUE,
  cdk.aws_config.ResourceType.APIGATEWAY_REST_API,
  cdk.aws_config.ResourceType.of('AWS::Lex::Bot'),
  cdk.aws_config.ResourceType.EFS_FILE_SYSTEM,
  cdk.aws_config.ResourceType.EVENTBRIDGE_EVENTBUS,
  cdk.aws_config.ResourceType.BACKUP_BACKUP_VAULT,
  cdk.aws_config.ResourceType.of('AWS::CodeArtifact::Repository'),
  cdk.aws_config.ResourceType.of('AWS::ACMPCA::CertificateAuthority'),
  cdk.aws_config.ResourceType.LAMBDA_FUNCTION,
];

/**
 * Security Perimeter Stack, configures resources to enforce resource policy (Config Rule and SSM)
 */
export class ResourcePolicyEnforcementStack extends AcceleratorStack {
  readonly cloudwatchKey: cdk.aws_kms.IKey | undefined;
  readonly lambdaKey: cdk.aws_kms.IKey | undefined;
  rbpGeneratedFilePathList: rbpGeneratedFilePath[] = [];

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.logger.info('Begin stack synthesis');
    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    this.lambdaKey = this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);

    if (!props.securityConfig.resourcePolicyEnforcement || !props.securityConfig.resourcePolicyEnforcement.enable)
      return;

    //
    // Config Rules
    //
    this.setupConfigRule();

    //
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();

    this.logger.info('End stack synthesis');
  }

  /**
   * Function to setup AWS Config rules
   */
  private setupConfigRule() {
    const applicablePolicySets = [];
    for (const policySet of this.props.securityConfig.resourcePolicyEnforcement?.policySets || []) {
      if (this.isIncluded(policySet.deploymentTargets)) {
        applicablePolicySets.push(policySet);
      }
    }

    // Find the Root policy set and the policy set with the nearest deployment target to the current account
    const rootPolicySet = this.getRootPolicySet(applicablePolicySets);
    const policySet = this.getNearestPolicySet(applicablePolicySets, rootPolicySet);
    if (!policySet) return;

    //
    // Load policy replacement for resource based policy
    //
    this.loadPolicyReplacements(this.props, policySet, rootPolicySet);

    const acceleratorPrefix = this.props.prefixes.accelerator;
    const detectResourcePolicy = new DetectResourcePolicy(this, 'DetectResourcePolicy', {
      acceleratorPrefix,
      configDirPath: this.props.configDirPath,
      homeRegion: this.props.globalConfig.homeRegion,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      rbpFilePaths: this.rbpGeneratedFilePathList,
      kmsKeyCloudWatch: this.cloudwatchKey,
      kmsKeyLambda: this.lambdaKey,
      inputParameters: {
        ...policySet.inputParameters,
        ORG_ID: this.organizationId!,
        ACCOUNT_ID: this.account,
      },
    });

    const ruleName = `${acceleratorPrefix}-${ResourcePolicyEnforcementConfig.DEFAULT_RULE_NAME}`;
    const configRule = new cdk.aws_config.CustomRule(this, pascalCase(ruleName), {
      configRuleName: ruleName,
      lambdaFunction: detectResourcePolicy.lambdaFunction,
      periodic: true,
      description: 'Config rule to detect non-compliant resource based policy',
      ruleScope: {
        resourceTypes: SUPPORTED_RESOURCE_TYPE,
      },
      configurationChanges: true,
    });
    configRule.node.addDependency(detectResourcePolicy.lambdaFunction);

    const documentName = `${this.props.prefixes.accelerator}-${ResourcePolicyEnforcementConfig.DEFAULT_SSM_DOCUMENT_NAME}`;
    const remediationConfig = this.props.securityConfig.resourcePolicyEnforcement!.remediation;

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
      inputParameters: {
        ...policySet.inputParameters,
        ORG_ID: this.organizationId!,
        ACCOUNT_ID: this.account,
      },
    });

    remediationRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [remediateResourcePolicy.lambdaFunction.functionArn],
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

  /**
   * Get the root policy set from applicable policy sets. The policy set will be used as default policy set if there is
   * no policy set with higher priority
   *
   * @param applicablePolicySets
   * @returns
   */
  private getRootPolicySet(applicablePolicySets: ResourcePolicySetConfig[]): ResourcePolicySetConfig | undefined {
    for (const policySet of applicablePolicySets) {
      const organizationalUnits = policySet.deploymentTargets.organizationalUnits;

      if (organizationalUnits && organizationalUnits.includes('Root')) {
        return policySet;
      }
    }

    return undefined;
  }

  /**
   * Get the nearest policy set that can be applied to current account. The priority is ordered by
   *  1. Account level matching
   *  2. Organizational Unit level matching
   *  3. Root
   * @param policySets
   * @param rootPolicySet
   * @returns
   */
  private getNearestPolicySet(
    policySets: ResourcePolicySetConfig[],
    rootPolicySet: ResourcePolicySetConfig | undefined,
  ): ResourcePolicySetConfig | undefined {
    // Find most specific matching policy set -> account level policy set
    const accountLevelPolicySet = policySets.find(policySet =>
      this.isAccountIncluded(policySet.deploymentTargets.accounts),
    );
    if (accountLevelPolicySet) return accountLevelPolicySet;

    // Find 2nd specific matching policy set ->  nearest organization unit
    for (const policySet of policySets) {
      const organizationalUnits = policySet.deploymentTargets.organizationalUnits;
      const accounts = [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts];

      const account = accounts.find(
        item => this.props.accountsConfig.getAccountId(item.name) === cdk.Stack.of(this).account,
      );

      if (account && organizationalUnits.indexOf(account.organizationalUnit) !== -1) {
        return policySet;
      }
    }

    return rootPolicySet;
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
    nearestPolicySet: ResourcePolicySetConfig,
    rootPolicySet: ResourcePolicySetConfig | undefined,
  ): void {
    this.rbpGeneratedFilePathList = [];

    const resourcePolicies = rootPolicySet
      ? this.getResourcePolicies(nearestPolicySet, rootPolicySet.resourcePolicies)
      : nearestPolicySet.resourcePolicies;

    this.validateResourcePolicy(resourcePolicies);
    for (const policy of resourcePolicies) {
      this.logger.info(`Create resource based policy (${policy.resourceType}) from template`);

      this.rbpGeneratedFilePathList.push({
        name: policy.resourceType,
        path: policy.document,
        tempPath: this.generatePolicyReplacements(
          path.join(props.configDirPath, policy.document),
          true,
          this.organizationId,
        ),
      });
    }
  }

  /**
   * Validate if there is template for each resource types for current account
   *
   * @param resourcePolicies
   */
  private validateResourcePolicy(resourcePolicies: ResourcePolicyConfig[]) {
    const requiredResourceTypes = SecurityConfigTypes.resourceTypeEnum.values.filter(
      r => !RESOURCE_TYPE_WITH_ALLOW_ONLY_POLICY.includes(ResourceType[r as keyof typeof ResourceType]),
    );

    const currentResourceTypes = new Set(resourcePolicies.map(r => r.resourceType));
    const missingResourceType = requiredResourceTypes.find(r => !currentResourceTypes.has(r));
    if (missingResourceType) {
      throw new Error(`Missing resource policy type ${missingResourceType} for account ${cdk.Stack.of(this).account}`);
    }
  }

  private getResourcePolicies(
    policySet: ResourcePolicySetConfig,
    defaultPolicies: ResourcePolicyConfig[],
  ): ResourcePolicyConfig[] {
    const resourcePolicies = defaultPolicies.reduce((acc, policy) => {
      acc[policy.resourceType] = {
        resourceType: policy.resourceType,
        document: policy.document,
      };
      return acc;
    }, {} as { [key: string]: ResourcePolicyConfig });

    for (const policy of policySet.resourcePolicies) {
      resourcePolicies[policy.resourceType] = policy;
    }
    return Object.values(resourcePolicies);
  }
}
