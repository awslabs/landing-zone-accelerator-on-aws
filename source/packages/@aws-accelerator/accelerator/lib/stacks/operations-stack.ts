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
  AseaResourceType,
  Ec2FirewallAutoScalingGroupConfig,
  Ec2FirewallConfig,
  Ec2FirewallInstanceConfig,
  Region,
  RoleConfig,
  RoleSetConfig,
  UserConfig,
  VaultConfig,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import {
  Bucket,
  BucketEncryptionType,
  BudgetDefinition,
  Inventory,
  KeyLookup,
  LimitsDefinition,
  SsmSessionManagerPolicy,
  WarmAccount,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import {
  AcceleratorKeyType,
  AcceleratorStack,
  AcceleratorStackProps,
  NagSuppressionRuleIds,
} from './accelerator-stack';
import { getVpcConfig } from './network-stacks/utils/getter-utils';

export interface OperationsStackProps extends AcceleratorStackProps {
  readonly accountWarming: boolean;
}
export class OperationsStack extends AcceleratorStack {
  /**
   * List of all the defined SAML Providers
   */
  private providers: { [name: string]: cdk.aws_iam.SamlProvider } = {};

  /**
   * List of all the defined IAM Policies
   */
  private policies: { [name: string]: cdk.aws_iam.IManagedPolicy } = {};

  /**
   * List of all the defined IAM Roles
   */
  private roles: { [name: string]: cdk.aws_iam.IRole } = {};

  /**
   * List of all the defined IAM Groups
   */
  private groups: { [name: string]: cdk.aws_iam.IGroup } = {};

  /**
   * List of all the defined IAM Users
   */
  private users: { [name: string]: cdk.aws_iam.IUser } = {};

  /**
   * KMS Key used to encrypt CloudWatch logs, when undefined default AWS managed key will be used
   */
  private cloudwatchKey: cdk.aws_kms.IKey | undefined;

  /**
   * KMS Key for central S3 Bucket
   */
  private centralLogsBucketKey: cdk.aws_kms.IKey;

  /**
   * Constructor for OperationsStack
   *
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: OperationsStackProps) {
    super(scope, id, props);

    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);

    this.centralLogsBucketKey = this.getCentralLogsBucketKey(this.cloudwatchKey);

    //
    // Look up asset bucket KMS key
    const vpcResources = [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])];
    const firewallRoles = this.getFirewallRolesInScope(vpcResources, props.customizationsConfig.firewalls);
    const assetBucketKmsKey = this.lookupAssetBucketKmsKey(props, firewallRoles);

    //
    // Only deploy IAM and CUR resources into the home region
    //
    if (this.isHomeRegion(props.globalConfig.homeRegion)) {
      this.addProviders();
      this.addManagedPolicies();
      this.addRoles();
      this.addGroups();
      this.addUsers();
      this.createStackSetRoles();
      //
      //
      // Budgets
      //
      this.enableBudgetReports();

      // Create Accelerator Access Role in every region
      this.createAssetAccessRole(props, assetBucketKmsKey);

      // Create Cross Account Service Catalog Role
      this.createServiceCatalogPropagationRole();

      // Create Session Manager IAM Policy
      if (
        this.props.globalConfig.logging.sessionManager.sendToCloudWatchLogs ||
        this.props.globalConfig.logging.sessionManager.sendToS3
      ) {
        this.createSessionManagerPolicy();
      }

      // warm account here
      this.warmAccount(props.accountWarming);
    }

    //
    // Service Quota Limits
    //
    this.increaseLimits();

    //
    // Backup Vaults
    //
    this.addBackupVaults();

    if (
      this.props.globalConfig.ssmInventory?.enable &&
      this.isIncluded(this.props.globalConfig.ssmInventory.deploymentTargets)
    ) {
      this.enableInventory();
    }

    //
    // Add SSM Parameters
    //
    this.addSsmParameters();

    //
    // Create firewall configuration S3 bucket
    //
    this.createFirewallConfigBucket(props, firewallRoles, assetBucketKmsKey);

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

  /*
   * Create Session Manager IAM Policy and Attach to IAM Role(s)
   */
  private createSessionManagerPolicy() {
    const cloudWatchLogGroupList: string[] = this.getCloudWatchLogGroupList();
    const sessionManagerCloudWatchLogGroupList: string[] = this.getSessionManagerCloudWatchLogGroupList();
    const s3BucketList: string[] = this.getS3BucketList();

    // Set up Session Manager Logging
    const ssmSessionManagerPolicy = new SsmSessionManagerPolicy(this, 'SsmSessionManagerSettings', {
      roleSets: this.props.iamConfig.roleSets,
      homeRegion: this.props.globalConfig.homeRegion,
      s3BucketName: this.centralLogsBucketName,
      s3BucketKeyArn: this.centralLogsBucketKey.keyArn,
      sendToCloudWatchLogs: this.props.globalConfig.logging.sessionManager.sendToCloudWatchLogs,
      sendToS3: this.props.globalConfig.logging.sessionManager.sendToS3,
      attachPolicyToIamRoles: this.props.globalConfig.logging.sessionManager.attachPolicyToIamRoles,
      region: cdk.Stack.of(this).region,
      enabledRegions: this.props.globalConfig.enabledRegions,
      cloudWatchLogGroupList: cloudWatchLogGroupList ?? undefined,
      sessionManagerCloudWatchLogGroupList: sessionManagerCloudWatchLogGroupList ?? undefined,
      s3BucketList: s3BucketList ?? undefined,
      prefixes: {
        accelerator: this.props.prefixes.accelerator,
        ssmLog: this.props.prefixes.ssmLogName,
      },
      ssmKeyDetails: {
        alias: this.acceleratorResourceNames.customerManagedKeys.ssmKey.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.ssmKey.description,
      },
    });
    const roleNames = this.props.globalConfig.logging.sessionManager.attachPolicyToIamRoles || [];
    roleNames.forEach(roleName => {
      const role = this.roles[roleName];
      if (role) {
        ssmSessionManagerPolicy.node.addDependency(role);
      }
    });

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/SsmSessionManagerSettings/SessionManagerEC2Policy/Resource`,
          reason: 'Policy needed access to all S3 objects for the account to put objects into the access log bucket',
        },
      ],
    });

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/SsmSessionManagerSettings/SessionManagerEC2Role/Resource`,
          reason: 'Create an IAM managed Policy for users to be able to use Session Manager with KMS encryption',
        },
      ],
    });

    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `/${this.stackName}/SsmSessionManagerSettings/SessionManagerPolicy/Resource`,
          reason: 'Allows only specific log group',
        },
      ],
    });
  }

  /* Enable AWS Service Quota Limits
   *
   */
  private increaseLimits() {
    const globalServices = ['account', 'cloudfront', 'iam', 'organizations', 'route53'];

    for (const limit of this.props.globalConfig.limits ?? []) {
      if (this.isIncluded(limit.deploymentTargets ?? [])) {
        // Global Services
        if (globalServices.includes(limit.serviceCode) && this.props.globalRegion === cdk.Stack.of(this).region) {
          this.logger.info(
            `Creating service quota increase for global service ${limit.serviceCode} in ${this.props.globalRegion}`,
          );
          new LimitsDefinition(this, `ServiceQuotaUpdates${limit.quotaCode}` + `${limit.desiredValue}`, {
            serviceCode: limit.serviceCode,
            quotaCode: limit.quotaCode,
            desiredValue: limit.desiredValue,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
          // Specified Regions
        } else if (limit.regions && limit.regions.includes(cdk.Stack.of(this).region as Region)) {
          this.logger.info(
            `Creating service quota increase ${limit.quotaCode} in specified region ${cdk.Stack.of(this).region}`,
          );
          new LimitsDefinition(this, `ServiceQuotaUpdates${limit.quotaCode}` + `${limit.desiredValue}`, {
            serviceCode: limit.serviceCode,
            quotaCode: limit.quotaCode,
            desiredValue: limit.desiredValue,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
          // Non-specified Regions apply to home region
        } else if (!limit.regions && this.isHomeRegion(this.props.globalConfig.homeRegion)) {
          this.logger.info(
            `Regions property not specified, creating service quota increase ${limit.quotaCode} in home region`,
          );
          new LimitsDefinition(this, `ServiceQuotaUpdates${limit.quotaCode}` + `${limit.desiredValue}`, {
            serviceCode: limit.serviceCode,
            quotaCode: limit.quotaCode,
            desiredValue: limit.desiredValue,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
        }
      }
    }
  }

  /**
   * Adds SAML Providers
   */
  private addProviders() {
    for (const providerItem of this.props.iamConfig.providers ?? []) {
      this.logger.info(`Add Provider ${providerItem.name}`);
      this.providers[providerItem.name] = new cdk.aws_iam.SamlProvider(
        this,
        `${pascalCase(providerItem.name)}SamlProvider`,
        {
          name: providerItem.name,
          metadataDocument: cdk.aws_iam.SamlMetadataDocument.fromFile(
            path.join(this.props.configDirPath, providerItem.metadataDocument),
          ),
        },
      );
    }
  }

  /**
   * Adds IAM Managed Policies
   */
  private addManagedPolicies() {
    for (const policySetItem of this.props.iamConfig.policySets ?? []) {
      if (!this.isIncluded(policySetItem.deploymentTargets) || policySetItem.identityCenterDependency) {
        this.logger.info(`Item excluded`);
        continue;
      }

      for (const policyItem of policySetItem.policies) {
        if (this.isManagedByAsea(AseaResourceType.IAM_POLICY, policyItem.name)) {
          this.logger.info(`Customer managed policy ${policyItem.name} is managed by ASEA`);
          this.policies[policyItem.name] = cdk.aws_iam.ManagedPolicy.fromManagedPolicyName(
            this,
            pascalCase(policyItem.name),
            policyItem.name,
          );
          continue;
        }
        this.logger.info(`Add customer managed policy ${policyItem.name}`);

        // Read in the policy document which should be properly formatted json
        const policyDocument = JSON.parse(
          this.generatePolicyReplacements(
            path.join(this.props.configDirPath, policyItem.policy),
            false,
            this.organizationId,
          ),
        );

        // Create a statements list using the PolicyStatement factory
        const statements: cdk.aws_iam.PolicyStatement[] = [];
        for (const statement of policyDocument.Statement) {
          statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
        }

        // Construct the ManagedPolicy
        this.policies[policyItem.name] = new cdk.aws_iam.ManagedPolicy(this, pascalCase(policyItem.name), {
          managedPolicyName: policyItem.name,
          statements,
        });
        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(policyItem.name)}PolicyArn`),
          parameterName: this.getSsmPath(SsmResourceType.IAM_POLICY, [policyItem.name]),
          stringValue: this.policies[policyItem.name].managedPolicyArn,
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
        // rule suppression with evidence for this permission.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/${pascalCase(policyItem.name)}/Resource`,
              reason: 'Policies definition are derived from accelerator iam-config boundary-policy file',
            },
          ],
        });
      }
    }
  }

  /**
   * Generates the list of role principals for the provided roleItem
   *
   * @param roleItem
   * @returns List of cdk.aws_iam.PrincipalBase
   */
  private getRolePrincipals(roleItem: RoleConfig): cdk.aws_iam.PrincipalBase[] {
    const principals: cdk.aws_iam.PrincipalBase[] = [];

    for (const assumedByItem of roleItem.assumedBy ?? []) {
      this.logger.info(`Role - assumed by type(${assumedByItem.type}) principal(${assumedByItem.principal})`);

      switch (assumedByItem.type) {
        case 'service':
          principals.push(new cdk.aws_iam.ServicePrincipal(assumedByItem.principal));
          break;
        case 'account':
          const partition = this.props.partition;
          const accountIdRegex = /^\d{12}$/;
          const accountArnRegex = new RegExp('^arn:' + partition + ':iam::(\\d{12}):root$');

          // test if principal length exceeds IAM Role length limit of 2048 characters.
          // Ref: https://docs.aws.amazon.com/IAM/latest/APIReference/API_Role.html
          // this will mitigate polynomial regular expression used on uncontrolled data
          if (assumedByItem.principal!.length > 2048) {
            throw new Error(`The principal defined in arn ${assumedByItem.principal} is too long`);
          }
          if (accountIdRegex.test(assumedByItem.principal)) {
            principals.push(new cdk.aws_iam.AccountPrincipal(assumedByItem.principal));
          } else if (accountArnRegex.test(assumedByItem.principal)) {
            const accountId = accountArnRegex.exec(assumedByItem.principal);
            principals.push(new cdk.aws_iam.AccountPrincipal(accountId![1]));
          } else {
            principals.push(
              new cdk.aws_iam.AccountPrincipal(this.props.accountsConfig.getAccountId(assumedByItem.principal)),
            );
          }
          break;
        case 'provider':
          // workaround due to https://github.com/aws/aws-cdk/issues/22091
          if (this.props.partition === 'aws-cn') {
            principals.push(
              new cdk.aws_iam.FederatedPrincipal(
                this.providers[assumedByItem.principal].samlProviderArn,
                {
                  StringEquals: {
                    'SAML:aud': 'https://signin.amazonaws.cn/saml',
                  },
                },
                'sts:AssumeRoleWithSAML',
              ),
            );
          } else {
            principals.push(new cdk.aws_iam.SamlConsolePrincipal(this.providers[assumedByItem.principal]));
          }
          break;
        case 'principalArn':
          principals.push(new cdk.aws_iam.ArnPrincipal(assumedByItem.principal));
      }
    }

    return principals;
  }

  /**
   * Generates the list of managed policies for the provided roleItem
   *
   * @param roleItem
   * @returns List of cdk.aws_iam.IManagedPolicy
   */
  private getManagedPolicies(roleItem: RoleConfig): cdk.aws_iam.IManagedPolicy[] {
    const managedPolicies: cdk.aws_iam.IManagedPolicy[] = [];

    for (const policyItem of roleItem.policies?.awsManaged ?? []) {
      this.logger.info(`Role - aws managed policy ${policyItem}`);
      managedPolicies.push(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(policyItem));
    }
    for (const policyItem of roleItem.policies?.customerManaged ?? []) {
      this.logger.info(`Role - customer managed policy ${policyItem}`);
      managedPolicies.push(this.policies[policyItem]);
    }

    return managedPolicies;
  }

  /**
   * Create IAM role
   * @param roleItem {@link RoleConfig}
   * @param roleSetItem {@link RoleSetConfig}
   * @returns role {@link cdk.aws_iam.Role}
   */
  private createRole(roleItem: RoleConfig, roleSetItem: RoleSetConfig): cdk.aws_iam.Role {
    const principals = this.getRolePrincipals(roleItem);
    const managedPolicies = this.getManagedPolicies(roleItem);
    let assumedBy: cdk.aws_iam.IPrincipal;
    if (roleItem.assumedBy.find(item => item.type === 'provider')) {
      // Since a SamlConsolePrincipal creates conditions, we can not
      // use the CompositePrincipal. Verify that it is alone
      if (principals.length > 1) {
        this.logger.error('More than one principal found when adding provider');
        throw new Error(`Configuration validation failed at runtime.`);
      }
      assumedBy = principals[0];
    } else {
      assumedBy = new cdk.aws_iam.CompositePrincipal(...principals);
    }

    const role = new cdk.aws_iam.Role(this, pascalCase(roleItem.name), {
      roleName: roleItem.name,
      externalIds: roleItem.externalIds,
      assumedBy,
      managedPolicies,
      path: roleSetItem.path,
      permissionsBoundary: this.policies[roleItem.boundaryPolicy],
    });

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/${pascalCase(roleItem.name)}/Resource`,
          reason: 'IAM Role created as per accelerator iam-config needs AWS managed policy',
        },
      ],
    });

    return role;
  }

  /**
   * Adds IAM Roles
   */
  private addRoles() {
    for (const roleSetItem of this.props.iamConfig.roleSets ?? []) {
      if (!this.isIncluded(roleSetItem.deploymentTargets)) {
        this.logger.info(`Item excluded`);
        continue;
      }

      for (const roleItem of roleSetItem.roles) {
        if (this.isManagedByAsea(AseaResourceType.IAM_ROLE, roleItem.name)) {
          this.logger.info(`IAM Role ${roleItem.name} is managed by ASEA`);
          this.roles[roleItem.name] = cdk.aws_iam.Role.fromRoleName(this, pascalCase(roleItem.name), roleItem.name);
          continue;
        }
        this.logger.info(`Add role ${roleItem.name}`);

        // Create IAM role
        const role = this.createRole(roleItem, roleSetItem);

        // Create instance profile
        if (roleItem.instanceProfile) {
          this.logger.info(`Role - creating instance profile for ${roleItem.name}`);
          new cdk.aws_iam.CfnInstanceProfile(this, `${pascalCase(roleItem.name)}InstanceProfile`, {
            // Use role object to force use of Ref
            instanceProfileName: role.roleName,
            roles: [role.roleName],
          });
        }

        this.grantManagedActiveDirectorySecretAccess(roleItem.name, role);

        // Add to roles list
        this.roles[roleItem.name] = role;
        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(roleItem.name)}RoleArn`),
          parameterName: this.getSsmPath(SsmResourceType.IAM_ROLE, [roleItem.name]),
          stringValue: role.roleArn,
        });
      }
    }
  }

  /**
   * Function to grant managed active directory secret access to instance role if the role is used in managed ad instance
   * @param role
   */
  private grantManagedActiveDirectorySecretAccess(roleName: string, role: cdk.aws_iam.Role) {
    for (const managedActiveDirectory of this.props.iamConfig.managedActiveDirectories ?? []) {
      const madAccountId = this.props.accountsConfig.getAccountId(managedActiveDirectory.account);
      if (managedActiveDirectory.activeDirectoryConfigurationInstance) {
        if (
          managedActiveDirectory.activeDirectoryConfigurationInstance.instanceRole === roleName &&
          madAccountId === cdk.Stack.of(this).account &&
          managedActiveDirectory.region === cdk.Stack.of(this).region
        ) {
          const madAdminSecretAccountId = this.props.accountsConfig.getAccountId(
            this.props.iamConfig.getManageActiveDirectorySecretAccountName(managedActiveDirectory.name),
          );
          const madAdminSecretRegion = this.props.iamConfig.getManageActiveDirectorySecretRegion(
            managedActiveDirectory.name,
          );

          const secretArn = `arn:${
            cdk.Stack.of(this).partition
          }:secretsmanager:${madAdminSecretRegion}:${madAdminSecretAccountId}:secret:${
            this.props.prefixes.secretName
          }/ad-user/${managedActiveDirectory.name}/*`;
          // Attach MAD instance role access to MAD secrets
          this.logger.info(`Granting mad secret access to ${roleName}`);
          role.attachInlinePolicy(
            new cdk.aws_iam.Policy(
              this,
              `${pascalCase(managedActiveDirectory.name)}${pascalCase(roleName)}SecretsAccess`,
              {
                statements: [
                  new cdk.aws_iam.PolicyStatement({
                    effect: cdk.aws_iam.Effect.ALLOW,
                    actions: ['secretsmanager:GetSecretValue'],
                    resources: [secretArn],
                  }),
                ],
              },
            ),
          );

          // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
          this.nagSuppressionInputs.push({
            id: NagSuppressionRuleIds.IAM5,
            details: [
              {
                path: `${this.stackName}/${pascalCase(managedActiveDirectory.name)}${pascalCase(
                  roleName,
                )}SecretsAccess/Resource`,
                reason: 'MAD instance role need access to more than one mad user secrets',
              },
            ],
          });
        }
      }
    }
  }

  /**
   *  Adds IAM Groups
   */
  private addGroups() {
    for (const groupSetItem of this.props.iamConfig.groupSets ?? []) {
      if (!this.isIncluded(groupSetItem.deploymentTargets)) {
        this.logger.info(`Item excluded`);
        continue;
      }

      for (const groupItem of groupSetItem.groups) {
        if (this.isManagedByAsea(AseaResourceType.IAM_GROUP, groupItem.name)) {
          this.logger.info(`IAM Group ${groupItem.name} is managed by ASEA`);
          this.groups[groupItem.name] = cdk.aws_iam.Group.fromGroupName(
            this,
            pascalCase(groupItem.name),
            groupItem.name,
          );
          continue;
        }
        this.logger.info(`Add group ${groupItem.name}`);

        const managedPolicies: cdk.aws_iam.IManagedPolicy[] = [];
        for (const policyItem of groupItem.policies?.awsManaged ?? []) {
          this.logger.info(`Group - aws managed policy ${policyItem}`);
          managedPolicies.push(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(policyItem));
        }
        for (const policyItem of groupItem.policies?.customerManaged ?? []) {
          this.logger.info(`Group - customer managed policy ${policyItem}`);
          managedPolicies.push(this.policies[policyItem]);
        }

        this.groups[groupItem.name] = new cdk.aws_iam.Group(this, pascalCase(groupItem.name), {
          groupName: groupItem.name,
          managedPolicies,
        });

        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(groupItem.name)}GroupArn`),
          parameterName: this.getSsmPath(SsmResourceType.IAM_GROUP, [groupItem.name]),
          stringValue: this.groups[groupItem.name].groupArn,
        });

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        // rule suppression with evidence for this permission.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM4,
          details: [
            {
              path: `${this.stackName}/${pascalCase(groupItem.name)}/Resource`,
              reason: 'Groups created as per accelerator iam-config needs AWS managed policy',
            },
          ],
        });
      }
    }
  }

  /**
   * Create a secret password for a given user in secretsmanager.
   */
  private createSecretForUser(user: UserConfig, secretPrefix: string): cdk.aws_secretsmanager.Secret {
    const secret = new cdk.aws_secretsmanager.Secret(this, pascalCase(`${user.username}Secret`), {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: user.username }),
        generateStringKey: 'password',
      },
      secretName: `${secretPrefix}/${user.username}`,
    });

    // AwsSolutions-SMG4: The secret does not have automatic rotation scheduled.
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.SMG4,
      details: [
        {
          path: `${this.stackName}/${pascalCase(user.username)}Secret/Resource`,
          reason: 'Accelerator users created as per iam-config file, MFA usage is enforced with boundary policy',
        },
      ],
    });

    return secret;
  }

  /**
   * Adds IAM Users
   */
  private addUsers() {
    for (const userSet of this.props.iamConfig.userSets ?? []) {
      if (!this.isIncluded(userSet.deploymentTargets)) {
        this.logger.info(`Item excluded`);
        continue;
      }

      for (const user of userSet.users ?? []) {
        if (this.isManagedByAsea(AseaResourceType.IAM_USER, user.username)) {
          this.logger.info(`IAM User ${user.username} is managed by ASEA`);
          this.users[user.username] = cdk.aws_iam.User.fromUserName(this, pascalCase(user.username), user.username);
          continue;
        }
        this.logger.info(`Add user ${user.username}`);

        // check if console excess should be created, default to true if value is not set to preserve current behavior.
        const disableConsoleAccess = user.disableConsoleAccess ?? false;
        let password: cdk.SecretValue | undefined = undefined;
        if (!disableConsoleAccess) {
          const secret = this.createSecretForUser(user, this.props.prefixes.secretName);
          password = secret.secretValueFromJson('password');
          this.logger.info(`User - password stored to ${this.props.prefixes.secretName}/${user.username}`);
        }

        this.users[user.username] = new cdk.aws_iam.User(this, pascalCase(user.username), {
          userName: user.username,
          password: password,
          groups: [this.groups[user.group]],
          permissionsBoundary: this.policies[user.boundaryPolicy],
          passwordResetRequired: password === undefined ? false : true,
        });

        this.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(user.username)}UserArn`),
          parameterName: this.getSsmPath(SsmResourceType.IAM_USER, [user.username]),
          stringValue: this.users[user.username].userArn,
        });
      }
    }
  }

  /**
   * Enables budget reports
   */
  private enableBudgetReports() {
    if (this.props.globalConfig.reports?.budgets && this.props.partition != 'aws-us-gov') {
      for (const budget of this.props.globalConfig.reports.budgets ?? []) {
        if (this.isIncluded(budget.deploymentTargets ?? [])) {
          this.logger.info(`Add budget ${budget.name}`);
          new BudgetDefinition(this, `${budget.name}BudgetDefinition`, {
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
            amount: budget.amount,
            includeCredit: budget.includeCredit,
            includeDiscount: budget.includeDiscount,
            includeOtherSubscription: budget.includeOtherSubscription,
            includeRecurring: budget.includeRecurring,
            includeRefund: budget.includeRefund,
            includeSubscription: budget.includeSubscription,
            includeSupport: budget.includeSupport,
            includeTax: budget.includeTax,
            includeUpfront: budget.includeUpfront,
            name: budget.name,
            notifications: budget.notifications,
            timeUnit: budget.timeUnit,
            type: budget.type,
            useAmortized: budget.useAmortized,
            useBlended: budget.useBlended,
            unit: budget.unit,
          });
        }
      }
    }
  }

  /**
   * Adds Backup Vaults as defined in the global-config.yaml. These Vaults can
   * be referenced in AWS Organizations Backup Policies
   */
  private addBackupVaults() {
    let backupKey: cdk.aws_kms.IKey | undefined = undefined;
    for (const vault of this.props.globalConfig.backup?.vaults ?? []) {
      if (this.isIncluded(vault.deploymentTargets)) {
        // Only create the key if a vault is defined for this account
        if (backupKey === undefined) {
          backupKey = new cdk.aws_kms.Key(this, 'BackupKey', {
            alias: this.acceleratorResourceNames.customerManagedKeys.awsBackup.alias,
            description: this.acceleratorResourceNames.customerManagedKeys.awsBackup.description,
            enableKeyRotation: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
          });
        }

        const vaultPolicy = this.getBackupVaultAccessPolicy(vault);
        new cdk.aws_backup.BackupVault(this, `BackupVault_${vault.name}`, {
          accessPolicy: vaultPolicy,
          backupVaultName: vault.name,
          encryptionKey: backupKey,
        });
      }
    }
  }

  private getBackupVaultAccessPolicy(vault: VaultConfig) {
    if (vault.policy) {
      const policyDocument = JSON.parse(
        this.generatePolicyReplacements(path.join(this.props.configDirPath, vault.policy), false, this.organizationId),
      );

      // Create a statements list using the PolicyStatement factory
      const statements: cdk.aws_iam.PolicyStatement[] = [];
      for (const statement of policyDocument.Statement) {
        statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
      }

      return new cdk.aws_iam.PolicyDocument({
        statements: statements,
      });
    } else {
      return undefined;
    }
  }

  private enableInventory() {
    this.logger.info('Enabling SSM Inventory');
    const resourceDataSyncName = `${this.props.prefixes.accelerator}-${cdk.Stack.of(this).account}-Inventory`;
    const associationName = `${this.props.prefixes.accelerator}-${cdk.Stack.of(this).account}-InventoryCollection`;

    if (
      this.isManagedByAsea(AseaResourceType.SSM_RESOURCE_DATA_SYNC, resourceDataSyncName) &&
      this.isManagedByAsea(AseaResourceType.SSM_ASSOCIATION, associationName)
    ) {
      return;
    }
    new Inventory(this, 'AcceleratorSsmInventory', {
      bucketName: this.centralLogsBucketName,
      bucketRegion: this.props.centralizedLoggingRegion,
      accountId: cdk.Stack.of(this).account,
      prefix: this.props.prefixes.bucketName,
    });
  }

  /**
   * Creates CloudFormation roles required for StackSets if stacksets are defined in customizations-config.yaml
   * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacksets-prereqs-self-managed.html#prereqs-self-managed-permissions
   */
  private createStackSetRoles() {
    //skip creation of stackset roles
    if (this.props.customizationsConfig && this.props.customizationsConfig.createCfnStackSetExecutionRole === false) {
      return;
    }
    if (this.props.customizationsConfig?.customizations?.cloudFormationStackSets) {
      const managementAccountId = this.props.accountsConfig.getManagementAccountId();
      if (cdk.Stack.of(this).account == managementAccountId) {
        this.createStackSetAdminRole();
      }
      this.createStackSetExecutionRole(managementAccountId);
    }
  }

  private createStackSetAdminRole() {
    this.logger.info(`Creating StackSet Administrator Role`);
    new cdk.aws_iam.Role(this, 'StackSetAdminRole', {
      roleName: 'AWSCloudFormationStackSetAdministrationRole',
      assumedBy: new cdk.aws_iam.ServicePrincipal('cloudformation.amazonaws.com'),
      description: 'Assumes AWSCloudFormationStackSetExecutionRole in workload accounts to deploy StackSets',
      inlinePolicies: {
        AssumeRole: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['sts:AssumeRole'],
              resources: ['arn:*:iam::*:role/AWSCloudFormationStackSetExecutionRole'],
            }),
          ],
        }),
      },
    });
  }

  private createServiceCatalogPropagationRole() {
    new cdk.aws_iam.Role(this, 'ServiceCatalogPropagationRole', {
      roleName: this.acceleratorResourceNames.roles.crossAccountServiceCatalogPropagation,
      assumedBy: this.getOrgPrincipals(this.organizationId, true),
      inlinePolicies: {
        default: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'iam:GetGroup',
                'iam:GetRole',
                'iam:GetUser',
                'iam:ListRoles',
                'servicecatalog:AcceptPortfolioShare',
                'servicecatalog:AssociatePrincipalWithPortfolio',
                'servicecatalog:DisassociatePrincipalFromPortfolio',
                'servicecatalog:ListAcceptedPortfolioShares',
                'servicecatalog:ListPrincipalsForPortfolio',
              ],
              resources: ['*'],
              conditions: {
                ArnLike: {
                  'aws:PrincipalARN': [
                    `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-*`,
                  ],
                },
              },
            }),
          ],
        }),
      },
    });

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/ServiceCatalogPropagationRole/Resource`,
          reason: 'Policy must have access to all Service Catalog Portfolios and IAM Roles',
        },
      ],
    });
  }

  private createStackSetExecutionRole(managementAccountId: string) {
    this.logger.info(`Creating StackSet Execution Role`);
    new cdk.aws_iam.Role(this, 'StackSetExecutionRole', {
      roleName: 'AWSCloudFormationStackSetExecutionRole',
      assumedBy: new cdk.aws_iam.AccountPrincipal(managementAccountId),
      description: 'Used to deploy StackSets',
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
    });

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/StackSetExecutionRole/Resource`,
          reason: 'IAM Role created as per accelerator iam-config needs AWS managed policy',
        },
      ],
    });

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/StackSetAdminRole/Resource`,
          reason: 'Policies definition are derived from accelerator iam-config boundary-policy file',
        },
      ],
    });
  }

  /**
   * Lookup asset bucket KMS key to use for ACM certificates and
   * EC2 firewall configurations
   * @param props {@link AcceleratorStackProps}
   * @param firewallRoles string[]
   * @returns cdk.aws_kms.Key | undefined
   */
  private lookupAssetBucketKmsKey(props: AcceleratorStackProps, firewallRoles: string[]): cdk.aws_kms.IKey | undefined {
    if (this.isHomeRegion(props.globalConfig.homeRegion) || firewallRoles.length > 0) {
      const assetBucketKmsKeyArnSsmParameterArn = this.props.globalConfig.logging.assetBucket?.importedBucket
        ?.createAcceleratorManagedKey
        ? `${this.acceleratorResourceNames.parameters.importedAssetsBucketCmkArn}`
        : `${this.acceleratorResourceNames.parameters.assetsBucketCmkArn}`;
      return new KeyLookup(this, 'AssetsBucketKms', {
        accountId: this.props.accountsConfig.getManagementAccountId(),
        keyRegion: this.props.globalConfig.homeRegion,
        roleName: this.acceleratorResourceNames.roles.crossAccountAssetsBucketCmkArnSsmParameterAccess,
        keyArnParameterName: assetBucketKmsKeyArnSsmParameterArn,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        acceleratorPrefix: this.props.prefixes.accelerator,
      }).getKey();
    }
    return;
  }

  /**
   * Create ACM certificate asset bucket access role
   * @param assetBucketKmsKey
   */
  private createAssetAccessRole(props: AcceleratorStackProps, assetBucketKmsKey?: cdk.aws_kms.IKey) {
    if (!assetBucketKmsKey) {
      throw new Error(
        `Asset bucket KMS key is undefined. KMS key must be defined so permissions can be added to the custom resource role.`,
      );
    }

    const accessBucketArn = `arn:${this.props.partition}:s3:::${this.getAssetBucketName()}`;
    const accountId = cdk.Stack.of(this).account;
    const managementAccountId = props.accountsConfig.getManagementAccountId();
    const accessRoleResourceName = `AssetAccessRole${accountId}`;
    const assetsAccessRole = new cdk.aws_iam.Role(this, accessRoleResourceName, {
      roleName: `${this.props.prefixes.accelerator}-AssetsAccessRole`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'AWS Accelerator assets access role in workload accounts deploy ACM imported certificates.',
    });
    assetsAccessRole.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    );
    assetsAccessRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        resources: [`${accessBucketArn}`, `${accessBucketArn}/*`],
        actions: ['s3:GetObject*', 's3:ListBucket'],
      }),
    );
    assetsAccessRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        resources: [`arn:${this.props.partition}:acm:*:${accountId}:certificate/*`],
        actions: ['acm:ImportCertificate'],
      }),
    );
    assetsAccessRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        resources: ['*'],
        actions: ['acm:RequestCertificate', 'acm:DeleteCertificate'],
      }),
    );
    assetsAccessRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        resources: [`arn:${this.props.partition}:ssm:*:${managementAccountId}:parameter/*`],
        actions: ['ssm:PutParameter', 'ssm:DeleteParameter', 'ssm:GetParameter'],
      }),
    );
    assetsAccessRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        resources: [`arn:${this.props.partition}:ssm:*:${accountId}:parameter/*`],
        actions: ['ssm:PutParameter', 'ssm:DeleteParameter', 'ssm:GetParameter'],
      }),
    );

    if (
      props.globalConfig.logging.assetBucket?.importedBucket?.createAcceleratorManagedKey &&
      cdk.Stack.of(this).account === managementAccountId
    ) {
      const key = cdk.aws_kms.Key.fromKeyArn(
        this,
        'AcceleratorGetImportAssetsBucketKey',
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.acceleratorResourceNames.parameters.importedAssetsBucketCmkArn,
        ),
      );
      assetsAccessRole.addToPolicy(
        new cdk.aws_iam.PolicyStatement({
          resources: [key.keyArn],
          actions: ['kms:Decrypt'],
        }),
      );
    } else if (
      props.globalConfig.logging.assetBucket?.importedBucket?.createAcceleratorManagedKey &&
      cdk.Stack.of(this).account !== managementAccountId
    ) {
      const key = new KeyLookup(this, 'AcceleratorGetImportAssetsBucketKey', {
        accountId: this.props.accountsConfig.getManagementAccountId(),
        keyRegion: this.props.globalConfig.homeRegion,
        roleName: this.acceleratorResourceNames.roles.crossAccountAssetsBucketCmkArnSsmParameterAccess,
        keyArnParameterName: this.acceleratorResourceNames.parameters.importedAssetsBucketCmkArn,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        acceleratorPrefix: this.props.prefixes.accelerator,
      }).getKey();
      assetsAccessRole.addToPolicy(
        new cdk.aws_iam.PolicyStatement({
          resources: [key.keyArn],
          actions: ['kms:Decrypt'],
        }),
      );
    } else {
      assetsAccessRole.addToPolicy(
        new cdk.aws_iam.PolicyStatement({
          resources: [assetBucketKmsKey.keyArn],
          actions: ['kms:Decrypt'],
        }),
      );
    }

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/${accessRoleResourceName}/DefaultPolicy/Resource`,
          reason: 'Policy permissions are part of managed role and rest is to get access from s3 bucket',
        },
      ],
    });

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/${accessRoleResourceName}/Resource`,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });
  }

  private warmAccount(warm: boolean) {
    if (!warm) {
      return;
    }
    new WarmAccount(this, 'WarmAccount', {
      cloudwatchKmsKey: this.cloudwatchKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      ssmPrefix: this.props.prefixes.ssmParamName,
    });
  }

  /**
   * Creates a bucket for storing third-party firewall configuration and license files
   * @param props {@link AcceleratorStackProps}
   * @param firewallRoles string[]
   * @param assetBucketKmsKey cdk.aws_kms.IKey | undefined
   * @returns Bucket | undefined
   */
  private createFirewallConfigBucket(
    props: AcceleratorStackProps,
    firewallRoles: string[],
    assetBucketKmsKey?: cdk.aws_kms.IKey,
  ): Bucket | undefined {
    if (firewallRoles.length > 0) {
      // Create firewall config bucket
      const serverAccessLogsBucketName = this.getServerAccessLogsBucketName();
      const firewallConfigBucket = new Bucket(this, 'FirewallConfigBucket', {
        s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.firewallConfig}-${cdk.Stack.of(this).account}-${
          cdk.Stack.of(this).region
        }`,
        encryptionType: this.isS3CMKEnabled ? BucketEncryptionType.SSE_KMS : BucketEncryptionType.SSE_S3,
        kmsKey: this.isS3CMKEnabled ? this.getAcceleratorKey(AcceleratorKeyType.S3_KEY)! : undefined,
        serverAccessLogsBucketName,
      });

      if (!serverAccessLogsBucketName) {
        // AwsSolutions-S1: The S3 Bucket has server access logs disabled
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.S1,
          details: [
            {
              path: `/${this.stackName}/FirewallConfigBucket/Resource/Resource`,
              reason: 'Due to configuration settings, server access logs have been disabled.',
            },
          ],
        });
      }

      // Create IAM policy and role for config replacement custom resource
      this.createFirewallConfigCustomResourceRole(props, firewallConfigBucket, assetBucketKmsKey);

      // Grant read access to all firewall roles in scope
      for (const role of firewallRoles) {
        firewallConfigBucket.getS3Bucket().grantRead(this.roles[role]);
        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
        // rule suppression with evidence for this permission.
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.IAM5,
          details: [
            {
              path: `${this.stackName}/${this.roles[role].node.id}/DefaultPolicy/Resource`,
              reason: 'Access to read from the S3 bucket is required for this IAM instance profile',
            },
          ],
        });
        if (this.isManagedByAsea(AseaResourceType.IAM_ROLE, this.roles[role].roleName)) {
          this.nagSuppressionInputs.push({
            id: NagSuppressionRuleIds.IAM5,
            details: [
              {
                path: `${this.stackName}/${this.roles[role].node.id}/Policy/Resource`,
                reason: 'Access to read from the S3 bucket is required for this IAM instance profile',
              },
            ],
          });
        }
      }
      return firewallConfigBucket;
    }
    return;
  }

  /**
   * Returns an array of IAM instance profile names that are in scope of the stack.
   * @param vpcResources ({@link VpcConfig} | {@link VpcTemplatesConfig})[]
   * @param firewallConfig {@link Ec2FirewallConfig}
   * @returns string[]
   */
  private getFirewallRolesInScope(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    firewallConfig?: Ec2FirewallConfig,
  ): string[] {
    const firewalls = [...(firewallConfig?.autoscalingGroups ?? []), ...(firewallConfig?.instances ?? [])];
    const firewallRoles: string[] = [];

    for (const firewall of firewalls) {
      if (
        this.isFirewallInScope(vpcResources, firewall) &&
        firewall.launchTemplate.iamInstanceProfile &&
        (firewall.configFile || firewall.configDir || firewall.licenseFile)
      ) {
        firewallRoles.push(firewall.launchTemplate.iamInstanceProfile);
      }
    }
    return firewallRoles;
  }

  /**
   * Returns true if the firewall is in scope of the stack.
   * @param vpcResources ({@link VpcConfig} | {@link VpcTemplatesConfig})[]
   * @param firewall {@link Ec2FirewallInstanceConfig} | {@link Ec2FirewallAutoScalingGroupConfig}
   * @returns boolean
   */
  private isFirewallInScope(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    firewall: Ec2FirewallInstanceConfig | Ec2FirewallAutoScalingGroupConfig,
  ): boolean {
    const vpc = getVpcConfig(vpcResources, firewall.vpc);
    const vpcAccountIds = this.getVpcAccountIds(vpc);
    // If no account specified in Firewall Config Firewall is in scope of VPC.
    const instanceAccountIds = firewall.account
      ? [this.props.accountsConfig.getAccountId(firewall.account)]
      : vpcAccountIds;
    return instanceAccountIds.includes(cdk.Stack.of(this).account) && vpc.region === cdk.Stack.of(this).region;
  }

  /**
   * Create Lambda custom resource role for firewall config replacements
   * @param props {@link AcceleratorStackProps}
   * @param firewallConfigBucket {@link Bucket}
   * @param assetBucketKmsKey cdk.aws_kms.IKey | undefined
   * @returns cdk.aws_iam.Role
   */
  private createFirewallConfigCustomResourceRole(
    props: AcceleratorStackProps,
    firewallConfigBucket: Bucket,
    assetBucketKmsKey?: cdk.aws_kms.IKey,
  ): cdk.aws_iam.Role {
    if (!assetBucketKmsKey) {
      throw new Error(
        `Asset bucket KMS key is undefined. KMS key must be defined so permissions can be added to the custom resource role.`,
      );
    }

    const assetBucketArn = `arn:${props.partition}:s3:::${
      this.acceleratorResourceNames.bucketPrefixes.assets
    }-${props.accountsConfig.getManagementAccountId()}-${props.globalConfig.homeRegion}`;

    const lambdaExecutionPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole',
    );

    const firewallConfigPolicy = new cdk.aws_iam.ManagedPolicy(this, 'FirewallConfigPolicy', {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['ec2:DescribeInstances', 'ec2:DescribeSubnets', 'ec2:DescribeVpcs', 'ec2:DescribeVpnConnections'],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['s3:GetObject*', 's3:ListBucket'],
          resources: [assetBucketArn, `${assetBucketArn}/*`],
        }),
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: [assetBucketKmsKey.keyArn],
        }),
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:${this.partition}:iam::*:role/${this.acceleratorResourceNames.roles.crossAccountVpnRoleName}`,
          ],
        }),
        //
        // secretsmanager:GetSecretValue and kms:Decrypt permissions to management account resources
        // to apply replacements from management account
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:${this.partition}:secretsmanager:*:${this.props.accountsConfig.getManagementAccountId()}:secret:*`,
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: [`arn:${this.partition}:kms:*:${this.props.accountsConfig.getManagementAccountId()}:key/*`],
        }),
      ],
    });
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/${firewallConfigPolicy.node.id}/Resource`,
          reason: 'Policy permissions are part of managed role and rest is to get access from s3 bucket',
        },
      ],
    });

    const firewallConfigRole = new cdk.aws_iam.Role(this, 'FirewallConfigRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.amazonaws.com`),
      description: 'Landing Zone Accelerator firewall configuration custom resource access role',
      managedPolicies: [firewallConfigPolicy, lambdaExecutionPolicy],
      roleName: this.acceleratorResourceNames.roles.firewallConfigFunctionRoleName,
    });
    firewallConfigBucket.getS3Bucket().grantPut(firewallConfigRole);
    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM5,
      details: [
        {
          path: `${this.stackName}/${firewallConfigRole.node.id}/DefaultPolicy/Resource`,
          reason: 'Policy permissions are part of managed role and rest is to get access from s3 bucket',
        },
      ],
    });
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    // rule suppression with evidence for this permission.
    this.nagSuppressionInputs.push({
      id: NagSuppressionRuleIds.IAM4,
      details: [
        {
          path: `${this.stackName}/${firewallConfigRole.node.id}/Resource`,
          reason: 'IAM Role for lambda needs AWS managed policy',
        },
      ],
    });

    return firewallConfigRole;
  }

  /**
   * Add SSM Parameters
   */
  private addSsmParameters() {
    let index = 1;
    const parameterMap = new Map<number, cdk.aws_ssm.StringParameter>();

    for (const ssmParametersItem of this.props.globalConfig.ssmParameters ?? []) {
      if (!this.isIncluded(ssmParametersItem.deploymentTargets)) {
        continue;
      }

      for (const parameterItem of ssmParametersItem.parameters) {
        this.logger.info(`[operations-stack] Add SSM Parameter ${parameterItem.path}`);
        // Create parameter
        const parameter = new cdk.aws_ssm.StringParameter(this, pascalCase(`SSMParameter-${parameterItem.name}`), {
          parameterName: parameterItem.path,
          stringValue: parameterItem.value,
        });
        parameterMap.set(index, parameter);

        // Add a dependency for every 5 parameters
        if (index > 5) {
          const dependsOnParam = parameterMap.get(index - (index % 5));
          if (!dependsOnParam) {
            this.logger.error(`Error creating SSM parameter ${parameterItem.name}: previous SSM parameter undefined`);
            throw new Error(`Configuration validation failed at runtime.`);
          }
          parameter.node.addDependency(dependsOnParam);
        }
        // Increment index
        index += 1;
      }
    }
  }

  /**
   * Function returns a list of CloudWatch Log Group ARNs
   */
  private getCloudWatchLogGroupList(): string[] {
    const cloudWatchLogGroupListResources: string[] = [];
    for (const regionItem of this.props.globalConfig.enabledRegions ?? []) {
      const logGroupItem = `arn:${cdk.Stack.of(this).partition}:logs:${regionItem}:${
        cdk.Stack.of(this).account
      }:log-group:*`;

      // Already in the list, skip
      if (cloudWatchLogGroupListResources.includes(logGroupItem)) {
        continue;
      }

      // Exclude regions is not used
      if (this.props.globalConfig.logging.sessionManager.excludeRegions) {
        // If exclude regions is defined, ensure not excluded
        if (!this.props.globalConfig.logging.sessionManager.excludeRegions.includes(regionItem)) {
          cloudWatchLogGroupListResources.push(logGroupItem);
        }
      }
      // Exclude regions is not being used, add logGroupItem
      else {
        cloudWatchLogGroupListResources.push(logGroupItem);
      }
    }
    return cloudWatchLogGroupListResources;
  }

  /**
   * Function returns a list of CloudWatch Log Group Name ARNs
   */
  private getSessionManagerCloudWatchLogGroupList(): string[] {
    const logGroupName = `${this.props.prefixes.ssmLogName}-sessionmanager-logs`;
    const cloudWatchLogGroupListResources: string[] = [];
    for (const regionItem of this.props.globalConfig.enabledRegions ?? []) {
      const logGroupItem = `arn:${cdk.Stack.of(this).partition}:logs:${regionItem}:${
        cdk.Stack.of(this).account
      }:log-group:${logGroupName}:*`;
      // Already in the list, skip
      if (cloudWatchLogGroupListResources.includes(logGroupItem)) {
        continue;
      }

      // Exclude regions is not used
      if (this.props.globalConfig.logging.sessionManager.excludeRegions) {
        // If exclude regions is defined, ensure not excluded
        if (!this.props.globalConfig.logging.sessionManager.excludeRegions.includes(regionItem)) {
          cloudWatchLogGroupListResources.push(logGroupItem);
        }
      }
      // Exclude regions is not being used, add logGroupItem
      else {
        cloudWatchLogGroupListResources.push(logGroupItem);
      }
    }
    return cloudWatchLogGroupListResources;
  }

  /**
   * Function returns a list of centralized S3 Bucket ARNs
   */
  private getS3BucketList(): string[] {
    const s3BucketResourcesList: string[] = [];
    for (const regionItem of this.props.globalConfig.enabledRegions ?? []) {
      const s3Item = `arn:${cdk.Stack.of(this).partition}:s3:::${this.centralLogsBucketName}/session/${
        cdk.Stack.of(this).account
      }/${regionItem}/*`;
      // Already in the list, skip
      if (s3BucketResourcesList.includes(s3Item)) {
        continue;
      }

      // Exclude regions is not used
      if (this.props.globalConfig.logging.sessionManager.excludeRegions) {
        // If exclude regions is defined, ensure not excluded
        if (!this.props.globalConfig.logging.sessionManager.excludeRegions.includes(regionItem)) {
          s3BucketResourcesList.push(s3Item);
        }
      }
      // Exclude regions is not being used, add s3Item
      else {
        s3BucketResourcesList.push(s3Item);
      }
    }
    return s3BucketResourcesList;
  }
}
