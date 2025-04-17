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
import { AcceleratorStack, AcceleratorStackProps, NagSuppressionRuleIds } from '../stacks/accelerator-stack';
import {
  EnablePolicyType,
  Policy,
  PolicyAttachment,
  PolicyType,
  PolicyTypeEnum,
  RevertScpChanges,
} from '@aws-accelerator/constructs';
import { ResourceControlPolicyConfig, ServiceControlPolicyConfig } from '@aws-accelerator/config';
import winston from 'winston';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import path from 'path';
import { pascalCase } from 'pascal-case';
import { DEFAULT_LAMBDA_RUNTIME, SsmResourceType } from '@aws-accelerator/utils';

export type policyItem = {
  /**
   * Name of the policy
   */
  name: string;
  /**
   * policy id
   */
  id: string;
};

export type scpItem = {
  /**
   * Name of the scp
   */
  name: string;
  /**
   * Scp id
   */
  id: string;
};

/**
 * Generated file path type
 */
export type generatedFilePath = {
  /**
   * Name of the policy
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

export enum deploymentPolicyType {
  /**
   * AWS Organizations Organizational Unit
   */
  ORGANIZATIONAL_UNIT = 'ou',

  /**
   * AWS Account
   */
  ACCOUNT = 'account',
}

interface PolicyResult {
  scpItems: policyItem[];
  rcpItems: policyItem[];
}

interface PolicyConfig {
  policies: Array<ServiceControlPolicyConfig | ResourceControlPolicyConfig>;
  type: PolicyType | PolicyTypeEnum;
  items: policyItem[];
}

export class PolicyResource {
  readonly stack: AcceleratorStack;
  protected logger: winston.Logger;

  readonly props: AcceleratorStackProps;
  readonly cloudwatchKey: cdk.aws_kms.IKey | undefined;
  readonly lambdaKey: cdk.aws_kms.IKey | undefined;
  readonly generatedFilePathList: generatedFilePath[] = [];
  private readonly policyTypeMap: Map<PolicyTypeEnum, EnablePolicyType> = new Map();

  constructor(
    stack: AcceleratorStack,
    cloudwatchKey: cdk.aws_kms.IKey | undefined,
    lambdaKey: cdk.aws_kms.IKey | undefined,
    props: AcceleratorStackProps,
  ) {
    this.stack = stack;
    this.logger = createLogger(['policy']);
    this.props = props;
    this.cloudwatchKey = cloudwatchKey;
    this.lambdaKey = lambdaKey;
    this.loadPolicyReplacements(props);
  }

  public createAndAttachPolicies(props: AcceleratorStackProps): { scpItems: policyItem[]; rcpItems: policyItem[] } {
    const rcpItems: policyItem[] = [];
    const scpItems: policyItem[] = [];

    if (!props.organizationConfig || !props.organizationConfig.enable) {
      this.logger.info('Organization configuration is not enabled. Skipping policy creation.');
      this.getEmptyPolicyResult();
    }
    const policyConfigs = this.initializePolicyConfigs(props);

    for (const { policies, type, items } of policyConfigs) {
      if (policies && policies.length === 0) {
        this.logger.info(`No policies found for type ${type as PolicyTypeEnum}`);
        continue;
      }

      // Enable policy type if not already enabled
      const enablePolicyType = this.enablePolicyType(type as PolicyTypeEnum);

      for (const policy of policies ?? []) {
        try {
          const policyResource = this.createPolicy(type as PolicyTypeEnum, policy);
          policyResource.node.addDependency(enablePolicyType);

          this.attachPolicies(
            policyResource,
            policy!.name,
            policy!.deploymentTargets?.accounts,
            policy!.deploymentTargets?.organizationalUnits,
            type as PolicyType,
            enablePolicyType,
          );

          items.push({ name: policy!.name, id: policyResource.id });
        } catch (error) {
          this.logger.error(`Error creating policy ${policy!.name}: ${error}`);
          throw error;
        }
      }
    }
    return { scpItems, rcpItems };
  }

  /**
   * Create policy based on type
   */
  private createPolicy(type: PolicyTypeEnum, policy: ServiceControlPolicyConfig | ResourceControlPolicyConfig): Policy {
    switch (type) {
      case PolicyTypeEnum.SERVICE_CONTROL_POLICY:
        return this.createScp(this.props, policy as ServiceControlPolicyConfig);
      case PolicyTypeEnum.RESOURCE_CONTROL_POLICY:
        return this.createRcp(this.props, policy as ResourceControlPolicyConfig);
      default:
        throw new Error(`Unsupported policy type: ${type}`);
    }
  }

  public createScp(props: AcceleratorStackProps, serviceControlPolicy: ServiceControlPolicyConfig): Policy {
    const scp = new Policy(this.stack, serviceControlPolicy.name, {
      description: serviceControlPolicy.description,
      name: serviceControlPolicy.name,
      partition: props.partition,
      path: this.generatedFilePathList.find(policy => policy.name === serviceControlPolicy.name)!.tempPath,
      type: PolicyType.SERVICE_CONTROL_POLICY,
      strategy: serviceControlPolicy.strategy,
      acceleratorPrefix: props.prefixes.accelerator,
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    });

    if (
      serviceControlPolicy.name == props.organizationConfig.quarantineNewAccounts?.scpPolicyName &&
      props.partition == 'aws'
    ) {
      this.stack.addSsmParameter({
        logicalId: pascalCase(`SsmParam${scp.name}ScpPolicyId`),
        parameterName: this.stack.getSsmPath(SsmResourceType.SCP, [scp.name]),
        stringValue: scp.id,
      });
    }
    return scp;
  }

  private createRcp(props: AcceleratorStackProps, resourceControlPolicy: ResourceControlPolicyConfig): Policy {
    const rcp = new Policy(this.stack, resourceControlPolicy.name, {
      description: resourceControlPolicy.description,
      name: resourceControlPolicy.name,
      partition: props.partition,
      path: this.generatedFilePathList.find(policy => policy.name === resourceControlPolicy.name)!.tempPath,
      type: PolicyType.RESOURCE_CONTROL_POLICY,
      strategy: resourceControlPolicy.strategy,
      acceleratorPrefix: props.prefixes.accelerator,
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    });
    return rcp;
  }

  /**
   * Function to load replacements within the provided RCP policy documents
   * @param props {@link AccountsStackProps}
   * @returns
   */
  public loadPolicyReplacements(props: AcceleratorStackProps): void {
    const policyConfigs: Array<{
      policies: Array<ServiceControlPolicyConfig | ResourceControlPolicyConfig | undefined> | undefined;
      filePathList: generatedFilePath[];
      type: string;
    }> = [
      {
        policies: props.organizationConfig.serviceControlPolicies ?? [],
        filePathList: this.generatedFilePathList,
        type: 'SCP',
      },
      {
        policies: props.organizationConfig.resourceControlPolicies ?? [],
        filePathList: this.generatedFilePathList,
        type: 'RCP',
      },
    ];

    for (const { policies, filePathList, type } of policyConfigs) {
      for (const policy of policies ?? []) {
        this.logger.info(`Loading ${type} policy replacement for ${policy!.name}`);
        filePathList.push({
          name: policy!.name,
          path: policy!.policy,
          tempPath: this.stack.generatePolicyReplacements(
            path.join(props.configDirPath, policy!.policy),
            true,
            this.stack.organizationId,
          ),
        });
      }
    }
  }

  /**
   * Attach policies to targets
   */
  private attachPolicies(
    policy: Policy,
    policyName: string,
    accounts: string[] | undefined,
    organizationalUnits: string[] | undefined,
    policyType: PolicyType,
    enablePolicyType: EnablePolicyType,
  ): void {
    if (organizationalUnits && organizationalUnits.length > 0) {
      for (const organizationalUnit of organizationalUnits) {
        this.logger.info(
          `Attaching ${policy.type} policy (${policyName}) to organizational unit (${organizationalUnit})`,
        );
        const ouPolicyAttachment = new PolicyAttachment(
          this.stack,
          pascalCase(`Attach_${policyName}_${organizationalUnit}`),
          {
            policyId: policy.id,
            targetId: this.props.organizationConfig.getOrganizationalUnitId(organizationalUnit),
            type: policyType,
            strategy: policy.strategy,
            configPolicyNames: this.stack.getPolicyNamesForTarget(
              organizationalUnit,
              deploymentPolicyType.ORGANIZATIONAL_UNIT,
            ),
            acceleratorPrefix: this.props.prefixes.accelerator,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          },
        );
        ouPolicyAttachment.node.addDependency(policy);
        ouPolicyAttachment.node.addDependency(enablePolicyType);
      }
    }
    if (accounts && accounts.length > 0) {
      for (const account of accounts) {
        this.logger.info(`Attaching resource control policy (${policyName}) to account (${account})`);
        const accountPolicyAttachment = new PolicyAttachment(
          this.stack,
          pascalCase(`Attach_${policy.name}_${account}`),
          {
            policyId: policy.id,
            targetId: this.props.accountsConfig.getAccountId(account),
            type: policyType,
            strategy: policy.strategy,
            configPolicyNames: this.stack.getPolicyNamesForTarget(account, deploymentPolicyType.ACCOUNT),
            acceleratorPrefix: this.props.prefixes.accelerator,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          },
        );
        accountPolicyAttachment.node.addDependency(policy);
      }
    }
  }
  /**
   * Function to configure EventBridge Rule to revert SCP changes made outside of the solution
   * @param props {@link AccountsStackProps}
   */
  public configureRevertScpChanges(props: AcceleratorStackProps) {
    if (props.securityConfig.centralSecurityServices?.scpRevertChangesConfig?.enable) {
      this.logger.info(`Creating resources to revert modifications to scps`);
      new RevertScpChanges(this.stack, 'RevertScpChanges', {
        acceleratorPrefix: props.prefixes.accelerator,
        configDirPath: props.configDirPath,
        homeRegion: props.globalConfig.homeRegion,
        kmsKeyCloudWatch: this.cloudwatchKey,
        kmsKeyLambda: this.lambdaKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        acceleratorTopicNamePrefix: props.prefixes.snsTopicName,
        snsTopicName: props.securityConfig.centralSecurityServices.scpRevertChangesConfig?.snsTopicName,
        scpFilePaths: this.generatedFilePathList,
        singleAccountMode: props.enableSingleAccountMode,
        organizationEnabled: props.organizationConfig.enable,
      });
    }
  }

  /**
   * Function to configure and attach Quarantine Scp
   * @param scpItems {@link scpItem}
   * @param props {@link AccountsStackProps}
   */
  public configureAndAttachQuarantineScp(scpItems: scpItem[], props: AcceleratorStackProps) {
    if (props.organizationConfig.quarantineNewAccounts?.enable === true && props.partition === 'aws') {
      const quarantineScpItem = scpItems.find(
        item => item.name === props.organizationConfig.quarantineNewAccounts?.scpPolicyName,
      );
      let quarantineScpId = '';
      if (quarantineScpItem) {
        quarantineScpId = quarantineScpItem.id;
      }

      // Create resources to attach quarantine scp to
      // new accounts created in organizations
      this.logger.info(`Creating resources to quarantine new accounts`);
      const orgPolicyRead = new cdk.aws_iam.PolicyStatement({
        sid: 'OrgRead',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['organizations:ListPolicies', 'organizations:DescribeCreateAccountStatus'],
        resources: ['*'],
      });

      const orgPolicyWrite = new cdk.aws_iam.PolicyStatement({
        sid: 'OrgWrite',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['organizations:AttachPolicy'],
        resources: [
          `arn:${
            this.stack.partition
          }:organizations::${props.accountsConfig.getManagementAccountId()}:policy/o-*/service_control_policy/${quarantineScpId}`,
          `arn:${this.stack.partition}:organizations::${props.accountsConfig.getManagementAccountId()}:account/o-*/*`,
        ],
      });

      this.logger.info(`Creating function to attach quarantine scp to accounts`);
      const attachQuarantineFunction = new cdk.aws_lambda.Function(this.stack, 'AttachQuarantineScpFunction', {
        code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/attach-quarantine-scp/dist')),
        runtime: DEFAULT_LAMBDA_RUNTIME,
        handler: 'index.handler',
        description: 'Lambda function to attach quarantine scp to new accounts',
        timeout: cdk.Duration.minutes(5),
        environment: {
          SCP_POLICY_NAME: props.organizationConfig.quarantineNewAccounts?.scpPolicyName ?? '',
        },
        environmentEncryption: this.lambdaKey,
        initialPolicy: [orgPolicyRead, orgPolicyWrite],
      });

      // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
      this.stack.addNagSuppression({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stack.stackName}/AttachQuarantineScpFunction/ServiceRole/Resource`,
            reason: 'AWS Custom resource provider framework-role created by cdk.',
          },
        ],
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
      this.stack.addNagSuppression({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stack.stackName}/AttachQuarantineScpFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Allows only specific policy.',
          },
        ],
      });

      const createAccountEventRule = new cdk.aws_events.Rule(this.stack, 'CreateAccountRule', {
        eventPattern: {
          source: ['aws.organizations'],
          detailType: ['AWS API Call via CloudTrail'],
          detail: {
            eventSource: ['organizations.amazonaws.com'],
            eventName: ['CreateAccount'],
          },
        },
        description: 'Rule to notify when a new account is created.',
      });

      createAccountEventRule.addTarget(
        new cdk.aws_events_targets.LambdaFunction(attachQuarantineFunction, {
          maxEventAge: cdk.Duration.hours(4),
          retryAttempts: 2,
        }),
      );

      //If any GovCloud accounts are configured also
      //watch for any GovCloudCreateAccount events
      if (props.accountsConfig.anyGovCloudAccounts()) {
        this.logger.info(`Creating EventBridge rule to attach quarantine scp to accounts when GovCloud is enabled`);
        const createGovCloudAccountEventRule = new cdk.aws_events.Rule(this.stack, 'CreateGovCloudAccountRule', {
          eventPattern: {
            source: ['aws.organizations'],
            detailType: ['AWS API Call via CloudTrail'],
            detail: {
              eventSource: ['organizations.amazonaws.com'],
              eventName: ['CreateGovCloudAccount'],
            },
          },
          description: 'Rule to notify when a new account is created using the create govcloud account api.',
        });

        createGovCloudAccountEventRule.addTarget(
          new cdk.aws_events_targets.LambdaFunction(attachQuarantineFunction, {
            maxEventAge: cdk.Duration.hours(4),
            retryAttempts: 2,
          }),
        );
      }

      new cdk.aws_logs.LogGroup(this.stack, `${attachQuarantineFunction.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${attachQuarantineFunction.functionName}`,
        retention: props.globalConfig.cloudwatchLogRetentionInDays,
        encryptionKey: this.cloudwatchKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    }
  }
  /**
   * Function to initialize the policy configs
   * @param props {@link AccountsStackProps}
   */
  private initializePolicyConfigs(props: AcceleratorStackProps): PolicyConfig[] {
    return [
      {
        policies: props.organizationConfig.serviceControlPolicies,
        type: PolicyType.SERVICE_CONTROL_POLICY,
        items: [],
      },
      {
        policies: props.organizationConfig.resourceControlPolicies ?? [],
        type: PolicyType.RESOURCE_CONTROL_POLICY,
        items: [],
      },
    ].filter(config => config.policies.length > 0);
  }

  /**
   * Function that returns empty array
   * @param props {@link AccountsStackProps}
   */
  private getEmptyPolicyResult(): PolicyResult {
    return { scpItems: [], rcpItems: [] };
  }

  private enablePolicyType(policyType: PolicyTypeEnum): EnablePolicyType {
    if (!this.policyTypeMap.has(policyType)) {
      const enablePolicyType = new EnablePolicyType(this.stack, `enable${policyType}`, {
        policyType: policyType,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
      this.policyTypeMap.set(policyType, enablePolicyType);
      return enablePolicyType;
    }
    return this.policyTypeMap.get(policyType)!;
  }
}
