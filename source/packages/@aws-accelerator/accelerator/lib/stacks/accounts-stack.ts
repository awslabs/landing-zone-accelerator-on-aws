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
import { Construct } from 'constructs';
import * as path from 'path';
import {
  EnablePolicyType,
  Policy,
  PolicyAttachment,
  PolicyType,
  PolicyTypeEnum,
  MoveAccountRule,
  RevertScpChanges,
} from '@aws-accelerator/constructs';
import {
  AcceleratorKeyType,
  AcceleratorStack,
  AcceleratorStackProps,
  NagSuppressionRuleIds,
} from './accelerator-stack';
import { ServiceControlPolicyConfig } from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';

/**
 * Scp Item type
 */
type scpItem = {
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
type scpGeneratedFilePath = {
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

export interface AccountsStackProps extends AcceleratorStackProps {
  readonly configDirPath: string;
}

export class AccountsStack extends AcceleratorStack {
  readonly cloudwatchKey: cdk.aws_kms.Key;
  readonly lambdaKey: cdk.aws_kms.Key;
  readonly scpGeneratedFilePathList: scpGeneratedFilePath[] = [];

  constructor(scope: Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props);

    //
    // Generate replacements for policy files
    //
    this.loadPolicyReplacements(props);

    //
    // Get or create cloudwatch key
    //
    this.cloudwatchKey = this.createOrGetCloudWatchKey(props);

    //
    // Get or create lambda key
    //
    this.lambdaKey = this.createOrGetLambdaKey(props);

    //
    // Create MoveAccountRule
    //
    this.createMoveAccountRule(props);

    //
    // Global Organizations actions
    //
    if (props.globalRegion === cdk.Stack.of(this).region) {
      //
      // Create and attach scps
      //
      const scpItems = this.createAndAttachScps(props);

      //
      // Create Access Analyzer Service Linked Role
      //
      this.createAccessAnalyzerServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

      //
      // Create Access GuardDuty Service Linked Role
      //
      this.createGuardDutyServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

      //
      // Create Access SecurityHub Service Linked Role
      //
      this.createSecurityHubServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

      //
      // Create Access Macie Service Linked Role
      //
      this.createMacieServiceLinkedRole(this.cloudwatchKey, this.lambdaKey);

      //
      // Configure revert scp changes rule
      //
      this.configureRevertScpChanges(props);

      //
      // Configure and attach quarantine scp
      //
      this.configureAndAttachQuarantineScp(scpItems, props);

      //
      // End of Stack functionality
      //
      this.logger.debug(`Stack synthesis complete`);
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
   * Function to create or get cloudwatch key
   * @param props {@link AccountsStackProps}
   * @returns cdk.aws_kms.Key
   *
   * @remarks
   * Use existing management account CloudWatch log key if in the home region otherwise create new kms key.
   * CloudWatch key was created in management account region by prepare stack.
   */
  private createOrGetCloudWatchKey(props: AccountsStackProps): cdk.aws_kms.Key {
    if (props.globalConfig.homeRegion == cdk.Stack.of(this).region) {
      return this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    } else {
      const key = new cdk.aws_kms.Key(this, 'AcceleratorCloudWatchKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

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
              }:${cdk.Stack.of(this).account}:log-group:*`,
            },
          },
        }),
      );

      this.ssmParameters.push({
        logicalId: 'AcceleratorCloudWatchKmsArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
        stringValue: key.keyArn,
      });

      return key;
    }
  }

  /**
   * Function to create or get lambda key
   * @param props {@link AccountsStackProps}
   * @returns cdk.aws_kms.Key
   *
   * @remarks
   * Use existing management account Lambda log key if in the home region otherwise create new kms key.
   * Lambda key was created in management account region by prepare stack.
   */
  private createOrGetLambdaKey(props: AccountsStackProps): cdk.aws_kms.Key {
    if (props.globalConfig.homeRegion == cdk.Stack.of(this).region) {
      return this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);
    } else {
      // Create KMS Key for Lambda environment variable encryption
      const key = new cdk.aws_kms.Key(this, 'AcceleratorLambdaKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.lambda.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.lambda.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      this.ssmParameters.push({
        logicalId: 'AcceleratorLambdaKmsArnParameter',
        parameterName: this.acceleratorResourceNames.parameters.lambdaCmkArn,
        stringValue: key.keyArn,
      });

      return key;
    }
  }

  /**
   * Function to load replacements within the provided SCP policy documents
   * @param props {@link AccountsStackProps}
   * @returns
   */
  private loadPolicyReplacements(props: AccountsStackProps): void {
    for (const serviceControlPolicy of props.organizationConfig.serviceControlPolicies) {
      this.logger.info(`Adding service control policy (${serviceControlPolicy.name})`);

      this.scpGeneratedFilePathList.push({
        name: serviceControlPolicy.name,
        path: serviceControlPolicy.policy,
        tempPath: this.generatePolicyReplacements(
          path.join(props.configDirPath, serviceControlPolicy.policy),
          true,
          this.organizationId,
        ),
      });
    }
  }

  /**
   * Function to create MoveAccountRule
   * @param props {@link AccountsStackProps}
   * @returns MoveAccountRule | undefined
   *
   * @remarks
   * Create MoveAccountRule only in global region for ControlTower and Organization is enabled.
   */
  private createMoveAccountRule(props: AccountsStackProps): MoveAccountRule | undefined {
    let moveAccountRule: MoveAccountRule | undefined;
    if (props.globalRegion === cdk.Stack.of(this).region) {
      if (props.organizationConfig.enable && !props.globalConfig.controlTower.enable) {
        moveAccountRule = new MoveAccountRule(this, 'MoveAccountRule', {
          globalRegion: props.globalRegion,
          homeRegion: props.globalConfig.homeRegion,
          moveAccountRoleName: this.acceleratorResourceNames.roles.moveAccountConfig,
          commitId: props.configCommitId ?? '',
          acceleratorPrefix: props.prefixes.accelerator,
          configTableNameParameterName: this.acceleratorResourceNames.parameters.configTableName,
          configTableArnParameterName: this.acceleratorResourceNames.parameters.configTableArn,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/MoveAccountRule/MoveAccountRole/Policy/Resource`,
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        });

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM4,
          details: [
            {
              path: `${this.stackName}/MoveAccountRule/MoveAccountTargetFunction/ServiceRole/Resource`,
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/MoveAccountRule/MoveAccountTargetFunction/ServiceRole/DefaultPolicy/Resource`,
              reason: 'AWS Custom resource provider role created by cdk.',
            },
          ],
        });
      }
    }
    return moveAccountRule;
  }

  /**
   * Create and attach SCPs to OU and Accounts.
   * @param props {@link AccountsStackProps}
   * @returns
   */
  private createAndAttachScps(props: AccountsStackProps): scpItem[] {
    const scpItems: scpItem[] = [];
    // SCP is not supported in China Region.
    if (props.organizationConfig.enable && props.partition !== 'aws-cn') {
      const enablePolicyTypeScp = new EnablePolicyType(this, 'enablePolicyTypeScp', {
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
  private createScp(props: AccountsStackProps, serviceControlPolicy: ServiceControlPolicyConfig): Policy {
    const scp = new Policy(this, serviceControlPolicy.name, {
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
      this.ssmParameters.push({
        logicalId: pascalCase(`SsmParam${scp.name}ScpPolicyId`),
        parameterName: this.getSsmPath(SsmResourceType.SCP, [scp.name]),
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
  private attachScpToOu(
    props: AccountsStackProps,
    scp: Policy,
    policyName: string,
    organizationalUnits: string[],
  ): void {
    for (const organizationalUnit of organizationalUnits) {
      this.logger.info(
        `Attaching service control policy (${policyName}) to organizational unit (${organizationalUnit})`,
      );

      const ouPolicyAttachment = new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${organizationalUnit}`), {
        policyId: scp.id,
        targetId: props.organizationConfig.getOrganizationalUnitId(organizationalUnit),
        type: PolicyType.SERVICE_CONTROL_POLICY,
        strategy: scp.strategy,
        configPolicyNames: this.getScpNamesForTarget(organizationalUnit, 'ou'),
        acceleratorPrefix: props.prefixes.accelerator,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
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
  private attachScpToAccounts(props: AccountsStackProps, scp: Policy, policyName: string, accounts: string[]) {
    for (const account of accounts) {
      this.logger.info(`Attaching service control policy (${policyName}) to account (${account})`);

      const accountPolicyAttachment = new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${account}`), {
        policyId: scp.id,
        targetId: props.accountsConfig.getAccountId(account),
        type: PolicyType.SERVICE_CONTROL_POLICY,
        strategy: scp.strategy,
        configPolicyNames: this.getScpNamesForTarget(account, 'account'),
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
  private configureRevertScpChanges(props: AccountsStackProps) {
    if (props.securityConfig.centralSecurityServices?.scpRevertChangesConfig?.enable) {
      this.logger.info(`Creating resources to revert modifications to scps`);
      new RevertScpChanges(this, 'RevertScpChanges', {
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
      });
    }
  }

  /**
   * Function to configure and attach Quarantine Scp
   * @param scpItems {@link scpItem}
   * @param props {@link AccountsStackProps}
   */
  private configureAndAttachQuarantineScp(scpItems: scpItem[], props: AccountsStackProps) {
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
            this.partition
          }:organizations::${props.accountsConfig.getManagementAccountId()}:policy/o-*/service_control_policy/${quarantineScpId}`,
          `arn:${this.partition}:organizations::${props.accountsConfig.getManagementAccountId()}:account/o-*/*`,
        ],
      });

      this.logger.info(`Creating function to attach quarantine scp to accounts`);
      const attachQuarantineFunction = new cdk.aws_lambda.Function(this, 'AttachQuarantineScpFunction', {
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
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM4,
        details: [
          {
            path: `${this.stackName}/AttachQuarantineScpFunction/ServiceRole/Resource`,
            reason: 'AWS Custom resource provider framework-role created by cdk.',
          },
        ],
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path: `${this.stackName}/AttachQuarantineScpFunction/ServiceRole/DefaultPolicy/Resource`,
            reason: 'Allows only specific policy.',
          },
        ],
      });

      const createAccountEventRule = new cdk.aws_events.Rule(this, 'CreateAccountRule', {
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
        const createGovCloudAccountEventRule = new cdk.aws_events.Rule(this, 'CreateGovCloudAccountRule', {
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

      new cdk.aws_logs.LogGroup(this, `${attachQuarantineFunction.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${attachQuarantineFunction.functionName}`,
        retention: props.globalConfig.cloudwatchLogRetentionInDays,
        encryptionKey: this.cloudwatchKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    }
  }
}
