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
import { AcceleratorStack, AcceleratorStackProps, NagSuppressionRuleIds } from '../stacks/accelerator-stack';
import {
  EnablePolicyType,
  Policy,
  PolicyAttachment,
  PolicyType,
  PolicyTypeEnum,
  RevertScpChanges,
} from '@aws-accelerator/constructs';
import winston from 'winston';
import { SsmResourceType, createLogger } from '@aws-accelerator/utils';
import path from 'path';
import { ServiceControlPolicyConfig } from '@aws-accelerator/config';
import { pascalCase } from 'pascal-case';

/**
 * Scp Item type
 */
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
 * Scp generated file path type
 */
export type scpGeneratedFilePath = {
  /**
   * Name of the scp
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

export class ScpResource {
  private stack: AcceleratorStack;
  protected logger: winston.Logger;

  readonly props: AcceleratorStackProps;
  readonly cloudwatchKey: cdk.aws_kms.IKey | undefined;
  readonly lambdaKey: cdk.aws_kms.IKey | undefined;
  readonly scpGeneratedFilePathList: scpGeneratedFilePath[] = [];

  constructor(
    stack: AcceleratorStack,
    cloudwatchKey: cdk.aws_kms.IKey | undefined,
    lambdaKey: cdk.aws_kms.IKey | undefined,
    props: AcceleratorStackProps,
  ) {
    this.stack = stack;
    this.logger = createLogger(['scp-resource']);
    this.props = props;
    this.cloudwatchKey = cloudwatchKey;
    this.lambdaKey = lambdaKey;

    //
    // Generate replacements for policy files
    //
    this.loadPolicyReplacements(props);
  }

  /**
   * Create and attach SCPs to OU and Accounts.
   * @param props {@link AccountsStackProps}
   * @returns
   */
  public createAndAttachScps(props: AcceleratorStackProps): scpItem[] {
    const scpItems: scpItem[] = [];
    // SCP is not supported in China Region.
    if (props.organizationConfig.enable && props.partition !== 'aws-cn') {
      const enablePolicyTypeScp = new EnablePolicyType(this.stack, 'enablePolicyTypeScp', {
        policyType: PolicyTypeEnum.SERVICE_CONTROL_POLICY,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });

      // Deploy SCPs
      for (const serviceControlPolicy of props.organizationConfig.serviceControlPolicies) {
        this.logger.info(`Adding service control policy (${serviceControlPolicy.name})`);

        const scp = this.createScp(props, serviceControlPolicy);

        scp.node.addDependency(enablePolicyTypeScp);

        //
        // Attach scp to organization units
        //
        this.attachScpToOu(
          props,
          scp,
          serviceControlPolicy.name,
          serviceControlPolicy.deploymentTargets.organizationalUnits ?? [],
        );

        //
        // Attach scp to accounts
        //
        this.attachScpToAccounts(
          props,
          scp,
          serviceControlPolicy.name,
          serviceControlPolicy.deploymentTargets.accounts ?? [],
        );

        scpItems.push({ name: serviceControlPolicy.name, id: scp.id });
      }
    }

    return scpItems;
  }

  /**
   * Function to create SCP
   * @param props {@link AccountsStackProps}
   * @param serviceControlPolicy
   */
  public createScp(props: AcceleratorStackProps, serviceControlPolicy: ServiceControlPolicyConfig): Policy {
    const scp = new Policy(this.stack, serviceControlPolicy.name, {
      description: serviceControlPolicy.description,
      name: serviceControlPolicy.name,
      partition: props.partition,
      path: this.scpGeneratedFilePathList.find(policy => policy.name === serviceControlPolicy.name)!.tempPath,
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

  /**
   * Function to attach scp to Organization units
   * @param props {@link AccountsStackProps}
   * @param scp
   * @param policyName
   * @param organizationalUnits
   */
  public attachScpToOu(
    props: AcceleratorStackProps,
    scp: Policy,
    policyName: string,
    organizationalUnits: string[],
  ): void {
    for (const organizationalUnit of organizationalUnits) {
      this.logger.info(
        `Attaching service control policy (${policyName}) to organizational unit (${organizationalUnit})`,
      );

      const ouPolicyAttachment = new PolicyAttachment(
        this.stack,
        pascalCase(`Attach_${scp.name}_${organizationalUnit}`),
        {
          policyId: scp.id,
          targetId: props.organizationConfig.getOrganizationalUnitId(organizationalUnit),
          type: PolicyType.SERVICE_CONTROL_POLICY,
          strategy: scp.strategy,
          configPolicyNames: this.stack.getScpNamesForTarget(organizationalUnit, 'ou'),
          acceleratorPrefix: props.prefixes.accelerator,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        },
      );
      ouPolicyAttachment.node.addDependency(scp);
    }
  }

  /**
   * Function to attach scp to accounts
   * @param props {@link AccountsStackProps}
   * @param scp
   * @param policyName
   * @param accounts
   */
  public attachScpToAccounts(props: AcceleratorStackProps, scp: Policy, policyName: string, accounts: string[]) {
    for (const account of accounts) {
      this.logger.info(`Attaching service control policy (${policyName}) to account (${account})`);

      const accountPolicyAttachment = new PolicyAttachment(this.stack, pascalCase(`Attach_${scp.name}_${account}`), {
        policyId: scp.id,
        targetId: props.accountsConfig.getAccountId(account),
        type: PolicyType.SERVICE_CONTROL_POLICY,
        strategy: scp.strategy,
        configPolicyNames: this.stack.getScpNamesForTarget(account, 'account'),
        acceleratorPrefix: props.prefixes.accelerator,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
      accountPolicyAttachment.node.addDependency(scp);
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
        scpFilePaths: this.scpGeneratedFilePathList,
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
        runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
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
   * Function to load replacements within the provided SCP policy documents
   * @param props {@link AccountsStackProps}
   * @returns
   */
  private loadPolicyReplacements(props: AcceleratorStackProps): void {
    for (const serviceControlPolicy of props.organizationConfig.serviceControlPolicies) {
      this.logger.info(`Adding service control policy (${serviceControlPolicy.name})`);

      this.scpGeneratedFilePathList.push({
        name: serviceControlPolicy.name,
        path: serviceControlPolicy.policy,
        tempPath: this.stack.generatePolicyReplacements(
          path.join(props.configDirPath, serviceControlPolicy.policy),
          true,
          this.stack.organizationId,
        ),
      });
    }
  }
}
