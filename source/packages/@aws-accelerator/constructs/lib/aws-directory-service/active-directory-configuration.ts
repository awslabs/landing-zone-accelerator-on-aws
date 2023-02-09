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
import { Construct } from 'constructs';

import * as fs from 'fs';
import * as path from 'path';

import { pascalCase } from 'change-case';

/**
 * UserData scripts type
 */
export type UserDataScriptsType = {
  /**
   * Friendly name for the script
   */
  name: string;
  /**
   * Relative script path in config repo
   */
  path: string;
};

/**
 * Initialized ActiveDirectoryConfigurationProps properties
 */
export interface ActiveDirectoryConfigurationProps {
  /**
   * AD configuration EC2 instance type
   */
  readonly instanceType: string;
  /**
   * AD configuration EC2 instance image ssm parameter path
   */
  readonly imagePath: string;
  /**
   * Friendly name for the managed active directory
   */
  readonly managedActiveDirectoryName: string;
  /**
   * Managed active directory secret account id
   */
  readonly managedActiveDirectorySecretAccountId: string;
  /**
   * Managed active directory secret region
   */
  readonly managedActiveDirectorySecretRegion: string;
  /**
   * Managed active directory dns name
   */
  readonly dnsName: string;
  /**
   * Managed active directory netBiosDomainName name
   */
  readonly netBiosDomainName: string;
  /**
   * Managed active directory admin password secret arn
   */
  readonly adminPwdSecretArn: string;
  /**
   * Managed active directory secret ksm key arn
   */
  readonly secretKeyArn: string;

  /**
   * AD configuration EC2 instance subnet id
   */
  readonly subnetId: string;
  /**
   * AD configuration EC2 instance security group id
   */
  readonly securityGroupId: string;
  /**
   * AD configuration EC2 instance role name
   */
  readonly instanceRoleName: string;
  /**
   * Flag for AD configuration EC2 instance enable api termination protection
   */
  readonly enableTerminationProtection: boolean;
  /**
   * AD configuration EC2 instance user data scripts
   */
  readonly userDataScripts: UserDataScriptsType[];
  /**
   * Managed active directory user groups
   */
  readonly adGroups: string[];
  /**
   *  Managed active directory groups per account user
   */
  readonly adPerAccountGroups: string[];
  /**
   * Managed active directory connector group
   */
  readonly adConnectorGroup: string;
  /**
   * Managed active directory user list
   */
  readonly adUsers: { name: string; email: string; groups: string[] }[];
  /**
   * Managed active directory user password policy
   */
  readonly adPasswordPolicy: {
    history: number;
    maximumAge: number;
    minimumAge: number;
    minimumLength: number;
    complexity: boolean;
    reversible: boolean;
    failedAttempts: number;
    lockoutDuration: number;
    lockoutAttemptsReset: number;
  };
  /**
   * Managed active directory group account list
   */
  readonly accountNames: string[];
}

/**
 * Managed active directory configuration class.
 * This construct creates EC2 instances and executes configuration scripts using user data to configure active directory
 * Active directory configuration such as joining domain, ad user, group creation etc. are performed.
 */
export class ActiveDirectoryConfiguration extends Construct {
  public readonly activeDirectoryConfigurationProps: ActiveDirectoryConfigurationProps;

  constructor(scope: Construct, id: string, props: ActiveDirectoryConfigurationProps) {
    super(scope, id);

    this.activeDirectoryConfigurationProps = props;

    const keyPair = new cdk.aws_ec2.CfnKeyPair(this, pascalCase(`${props.managedActiveDirectoryName}InstanceKeyPair`), {
      keyName: pascalCase(`${props.managedActiveDirectoryName}InstanceKeyPair`),
    });

    const role = cdk.aws_iam.Role.fromRoleName(
      this,
      pascalCase(`${props.managedActiveDirectoryName}InstanceRole`),
      props.instanceRoleName,
    );

    role.attachInlinePolicy(
      new cdk.aws_iam.Policy(this, pascalCase(`${props.managedActiveDirectoryName}KmsPolicy`), {
        statements: [
          new cdk.aws_iam.PolicyStatement({
            actions: ['kms:Decrypt'],
            resources: [props.secretKeyArn],
          }),
        ],
      }),
    );

    const instance = new cdk.aws_ec2.CfnInstance(this, pascalCase(`${props.managedActiveDirectoryName}Instance`), {
      instanceType: props.instanceType,
      iamInstanceProfile: role.roleName,
      imageId: cdk.aws_ssm.StringParameter.valueForStringParameter(this, props.imagePath),
      keyName: keyPair.keyName,
      subnetId: props.subnetId,
      securityGroupIds: [props.securityGroupId],
      blockDeviceMappings: [
        {
          deviceName: '/dev/sda1',
          ebs: {
            volumeSize: 50,
            volumeType: 'gp2',
            encrypted: true,
          },
        },
      ],
      tags: [{ key: 'Name', value: pascalCase(`${props.managedActiveDirectoryName}-ConfiguringInstance`) }],
      disableApiTermination: props.enableTerminationProtection,
    });

    instance.node.addDependency(keyPair);

    instance.cfnOptions.creationPolicy = { resourceSignal: { count: 1, timeout: 'PT30M' } };

    // Add instance user data
    instance.userData = cdk.Fn.base64(
      `<script>\n cfn-init.exe -v -c config -s ${cdk.Stack.of(this).stackId} -r ${instance.logicalId} --region ${
        cdk.Stack.of(this).region
      } \n # Signal the status from cfn-init\n cfn-signal -e $? --stack ${cdk.Stack.of(this).stackName} --resource ${
        instance.logicalId
      } --region ${cdk.Aws.REGION}\n </script>\n`,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setupFiles: { [p: string]: { content: any } } = {
      'c:\\cfn\\cfn-hup.conf': {
        content: `[main]\n stack=${cdk.Stack.of(this).stackName}\n region=${cdk.Stack.of(this).region}\n`,
      },
      'c:\\cfn\\hooks.d\\cfn-auto-reloader.conf': {
        content: `[cfn-auto-reloader-hook]\n triggers=post.update\n path=Resources.${
          instance.logicalId
        }.Metadata.AWS::CloudFormation::Init\n action=cfn-init.exe -v -c config -s ${cdk.Stack.of(this).stackId} -r ${
          instance.logicalId
        } --region ${cdk.Stack.of(this).region}\n`,
      },
    };

    // Add UserData script files to the setup file list
    let joinDomainScriptName = 'Join-Domain.ps1';
    let adGroupSetupScriptName = 'AD-group-setup.ps1';
    let adConnectorPermissionSetupScriptName = 'AD-connector-permissions-setup.ps1';
    let adUserSetupScriptName = 'AD-user-setup.ps1';
    let adUserGroupSetupScriptName = 'AD-user-group-setup.ps1';
    let configurePasswordPolicyScriptName = 'Configure-password-policy.ps1';
    for (const userDataScript of props.userDataScripts ?? []) {
      const fileName = path.basename(userDataScript.path);
      const fileExtension = path.extname(userDataScript.path);

      let destPath = 'c:\\cfn\\scripts\\';
      if (fileExtension === '.psm1') {
        destPath = 'C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules\\AWSQuickStart\\';
      }
      setupFiles[`${destPath}` + fileName] = {
        content: fs.readFileSync(userDataScript.path, 'utf8'),
      };

      if (userDataScript.name === 'JoinDomain') {
        joinDomainScriptName = fileName;
      }

      if (userDataScript.name === 'ADGroupSetup') {
        adGroupSetupScriptName = fileName;
      }

      if (userDataScript.name === 'ADConnectorPermissionsSetup') {
        adConnectorPermissionSetupScriptName = fileName;
      }

      if (userDataScript.name === 'ADUserSetup') {
        adUserSetupScriptName = fileName;
      }

      if (userDataScript.name === 'ADUserGroupSetup') {
        adUserGroupSetupScriptName = fileName;
      }

      if (userDataScript.name === 'ConfigurePasswordPolicy') {
        configurePasswordPolicyScriptName = fileName;
      }
    }

    // Creating AD Users scripts
    const adUsersScripts = this.getAdUsersScripts(adUserSetupScriptName);

    const accountNames = props.accountNames;

    const configGroups = props.adGroups.concat(props.adPerAccountGroups).concat(props.adConnectorGroup);

    const adGroups = this.prepareGroups(configGroups, accountNames);

    // Mapping Users to Groups command
    const adUserGroups: { user: string; groups: string[] }[] = props.adUsers.map(a => {
      const groups = this.prepareGroups(a.groups, accountNames);
      return { user: a.name, groups };
    });

    const adUserGroupsCommand: string[] = adUserGroups.map(
      userGroup =>
        `C:\\cfn\\scripts\\${adUserGroupSetupScriptName} -GroupNames '${userGroup.groups.join(',')}' -UserName ${
          userGroup.user
        } -DomainAdminUser ${props.netBiosDomainName}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${
          props.adminPwdSecretArn
        }).SecretString)`,
    );

    instance.addOverride('Metadata.AWS::CloudFormation::Init', {
      configSets: {
        config: ['setup', 'join', 'installRDS', 'createADConnectorUser', 'configurePasswordPolicy', 'finalize'],
      },
      setup: {
        files: { ...setupFiles },
        commands: {
          'a-set-execution-policy': {
            command: 'powershell.exe -Command "Set-ExecutionPolicy RemoteSigned -Force"',
            waitAfterCompletion: '0',
          },
          'b-init-quickstart-module': {
            command: `powershell.exe -Command "New-AWSQuickStartResourceSignal -Stack ${
              cdk.Stack.of(this).stackName
            }  -Resource ${instance.logicalId} -Region ${cdk.Stack.of(this).region}"`,
            waitAfterCompletion: '0',
          },
        },
        services: {
          windows: {
            'cfn-hup': {
              enabled: 'true',
              ensureRunning: 'true',
              files: ['c:\\cfn\\cfn-hup.conf', 'c:\\cfn\\hooks.d\\cfn-auto-reloader.conf'],
            },
          },
        },
      },
      join: {
        commands: {
          'a-join-domain': {
            command: `powershell.exe -Command "C:\\cfn\\scripts\\${joinDomainScriptName} -DomainName ${props.dnsName} -UserName ${props.netBiosDomainName}\\admin -Password ((Get-SECSecretValue -SecretId ${props.adminPwdSecretArn}).SecretString)"`,
            waitAfterCompletion: 'forever',
          },
        },
      },
      installRDS: {
        commands: {
          'a-install-rds': {
            command: 'powershell.exe -Command "Install-WindowsFeature RSAT-RDS-Gateway,RSAT-AD-Tools"',
            waitAfterCompletion: '0',
          },
        },
      },
      createADConnectorUser: {
        commands: {
          'a-create-ad-users': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned ${adUsersScripts.join('; ')}`,
            waitAfterCompletion: '0',
          },
          'b-create-ad-groups': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\${adGroupSetupScriptName} -GroupNames '${adGroups.join(
              ',',
            )}' -DomainAdminUser ${
              props.netBiosDomainName
            }\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${props.adminPwdSecretArn}).SecretString)`,
            waitAfterCompletion: '0',
          },
          'c-configure-ad-users-groups': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned ${adUserGroupsCommand.join('; ')}`,
            waitAfterCompletion: '0',
          },
          'd-configure-ad-group-permissions': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\${adConnectorPermissionSetupScriptName} -GroupName ${props.adConnectorGroup} -DomainAdminUser ${props.netBiosDomainName}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${props.adminPwdSecretArn}).SecretString)`,
            waitAfterCompletion: '0',
          },
        },
      },
      configurePasswordPolicy: {
        commands: {
          'a-set-password-policy': {
            command: `powershell.exe -ExecutionPolicy RemoteSigned C:\\cfn\\scripts\\${configurePasswordPolicyScriptName} -DomainAdminUser admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${
              props.adminPwdSecretArn
            }).SecretString) -ComplexityEnabled:$${pascalCase(
              String(props.adPasswordPolicy.complexity),
            )} -LockoutDuration 00:${props.adPasswordPolicy.lockoutDuration}:00 -LockoutObservationWindow 00:${
              props.adPasswordPolicy.lockoutAttemptsReset
            }:00 -LockoutThreshold ${props.adPasswordPolicy.failedAttempts} -MaxPasswordAge:${
              props.adPasswordPolicy.maximumAge
            }.00:00:00 -MinPasswordAge:${props.adPasswordPolicy.minimumAge}.00:00:00 -MinPasswordLength:${
              props.adPasswordPolicy.minimumLength
            } -PasswordHistoryCount:${props.adPasswordPolicy.history} -ReversibleEncryptionEnabled:$${
              props.adPasswordPolicy.reversible
            }`,
            waitAfterCompletion: '0',
          },
        },
      },
      finalize: {
        commands: {
          '1-signal-success': {
            command: 'powershell.exe -Command "Write-AWSQuickStartStatus"',
            waitAfterCompletion: '0',
          },
        },
      },
    });
  }

  private prepareGroups(configGroups: string[], accounts: string[]): string[] {
    const groups: string[] = [];
    configGroups.forEach(a => {
      if (a.startsWith('*')) {
        Object.values(accounts).forEach(b => groups.push(`aws-${b}${a.substring(1)}`));
      } else {
        groups.push(a);
      }
    });
    return groups;
  }

  /**
   * Function to get Ad user creation scripts
   */
  private getAdUsersScripts(adUserSetupScriptName: string): string[] {
    const adUsersCommand: string[] = [];
    for (const adUser of this.activeDirectoryConfigurationProps.adUsers ?? []) {
      const secretName = `/accelerator/ad-user/${this.activeDirectoryConfigurationProps.managedActiveDirectoryName}/${adUser.name}`;
      const secretArn = `arn:${cdk.Stack.of(this).partition}:secretsmanager:${
        this.activeDirectoryConfigurationProps.managedActiveDirectorySecretRegion
      }:${this.activeDirectoryConfigurationProps.managedActiveDirectorySecretAccountId}:secret:${secretName}`;

      adUsersCommand.push(
        `C:\\cfn\\scripts\\${adUserSetupScriptName} -UserName ${adUser.name} -Password ((Get-SECSecretValue -SecretId ${secretArn}).SecretString) -DomainAdminUser ${this.activeDirectoryConfigurationProps.netBiosDomainName}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${this.activeDirectoryConfigurationProps.adminPwdSecretArn}).SecretString) -PasswordNeverExpires Yes -UserEmailAddress ${adUser.email}`,
      );
    }

    // Below script to set admin password to never expire
    adUsersCommand.push(
      `C:\\cfn\\scripts\\${adUserSetupScriptName} -UserName admin -Password ((Get-SECSecretValue -SecretId ${this.activeDirectoryConfigurationProps.adminPwdSecretArn}).SecretString) -DomainAdminUser ${this.activeDirectoryConfigurationProps.netBiosDomainName}\\admin -DomainAdminPassword ((Get-SECSecretValue -SecretId ${this.activeDirectoryConfigurationProps.adminPwdSecretArn}).SecretString) -PasswordNeverExpires Yes`,
    );

    return adUsersCommand;
  }
}
