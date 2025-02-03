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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils/lib/logger';

import { AccountsConfig } from './accounts-config';
import * as t from './common';
import * as i from './models/iam-config';
import { ReplacementsConfig } from './replacements-config';

const logger = createLogger(['iam-config']);

export class ManagedActiveDirectorySharedOuConfig implements i.IManagedActiveDirectorySharedOuConfig {
  readonly organizationalUnits: string[] = [];
  readonly excludedAccounts: string[] | undefined = undefined;
}

export class ManagedActiveDirectorySecretConfig implements i.IManagedActiveDirectorySecretConfig {
  readonly adminSecretName: string | undefined = undefined;
  readonly account: string | undefined = undefined;
  readonly region: t.Region = 'us-east-1';
}

export class ActiveDirectoryConfigurationInstanceUserDataConfig
  implements i.IActiveDirectoryConfigurationInstanceUserDataConfig
{
  readonly scriptName = '';
  readonly scriptFilePath = '';
}

export class ActiveDirectoryPasswordPolicyConfig implements i.IActiveDirectoryPasswordPolicyConfig {
  readonly history = 24;
  readonly maximumAge = 90;
  readonly minimumAge = 1;
  readonly minimumLength = 14;
  readonly complexity = true;
  readonly reversible = false;
  readonly failedAttempts = 6;
  readonly lockoutDuration = 30;
  readonly lockoutAttemptsReset = 30;
}

export class ActiveDirectoryUserConfig implements i.IActiveDirectoryUserConfig {
  readonly name = '';
  readonly email = '';
  readonly groups = [];
}

export class ActiveDirectoryConfigurationInstanceConfig implements i.IActiveDirectoryConfigurationInstanceConfig {
  readonly instanceType = '';
  readonly vpcName = '';
  readonly imagePath = '';
  readonly securityGroupInboundSources = [];
  readonly instanceRole = '';
  readonly enableTerminationProtection: boolean | undefined = undefined;
  readonly subnetName = '';
  readonly userDataScripts: ActiveDirectoryConfigurationInstanceUserDataConfig[] = [];
  readonly adGroups: string[] = [];
  readonly adPerAccountGroups: string[] = [];
  readonly adConnectorGroup = '';
  readonly adUsers: ActiveDirectoryUserConfig[] = [];
  readonly adPasswordPolicy: ActiveDirectoryPasswordPolicyConfig = new ActiveDirectoryPasswordPolicyConfig();
}

export class ManagedActiveDirectoryLogConfig implements i.IManagedActiveDirectoryLogConfig {
  readonly groupName = '';
  readonly retentionInDays: number | undefined = undefined;
}

export class ManagedActiveDirectoryVpcSettingsConfig implements i.IManagedActiveDirectoryVpcSettingsConfig {
  readonly vpcName = '';
  readonly subnets = [];
}

export class ManagedActiveDirectoryConfig implements i.IManagedActiveDirectoryConfig {
  readonly name = '';
  readonly account = '';
  readonly region: t.Region = 'us-east-1';
  readonly dnsName = '';
  readonly netBiosDomainName = '';
  readonly description: string | undefined = undefined;
  readonly edition = 'Standard';
  readonly vpcSettings: ManagedActiveDirectoryVpcSettingsConfig = new ManagedActiveDirectoryVpcSettingsConfig();
  readonly resolverRuleName = '';
  readonly secretConfig: ManagedActiveDirectorySecretConfig | undefined = undefined;
  readonly sharedOrganizationalUnits: ManagedActiveDirectorySharedOuConfig | undefined = undefined;
  readonly sharedAccounts: string[] | undefined = undefined;
  readonly logs: ManagedActiveDirectoryLogConfig | undefined = undefined;
  readonly activeDirectoryConfigurationInstance: ActiveDirectoryConfigurationInstanceConfig | undefined = undefined;
}

export class SamlProviderConfig implements i.ISamlProviderConfig {
  readonly name: string = '';
  readonly metadataDocument: string = '';
}

export class UserConfig implements i.IUserConfig {
  readonly username: string = '';
  readonly boundaryPolicy: string = '';
  readonly group: string = '';
  readonly disableConsoleAccess?: boolean | undefined = undefined;
}

export class UserSetConfig implements i.IUserSetConfig {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly users: UserConfig[] = [];
}

export class PoliciesConfig implements i.IPoliciesConfig {
  readonly awsManaged: string[] | undefined = undefined;
  readonly customerManaged: string[] | undefined = undefined;
}

export class GroupConfig implements i.IGroupConfig {
  readonly name: string = '';
  readonly policies: PoliciesConfig | undefined = undefined;
}

export class GroupSetConfig implements i.IGroupSetConfig {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly groups: GroupConfig[] = [];
}

export class AssumedByConfig implements i.IAssumedByConfig {
  readonly principal: string = '';
  readonly type!: t.AssumedByType;
}

export class RoleConfig implements i.IRoleConfig {
  readonly assumedBy: AssumedByConfig[] = [];
  readonly externalIds?: string[] | undefined;
  readonly instanceProfile: boolean | undefined = undefined;
  readonly boundaryPolicy: string = '';
  readonly name: string = '';
  readonly policies: PoliciesConfig | undefined = undefined;
}

export class IdentityCenterConfig implements i.IIdentityCenterConfig {
  readonly name: string = '';
  readonly delegatedAdminAccount: string | undefined = undefined;
  readonly identityCenterPermissionSets: IdentityCenterPermissionSetConfig[] | undefined = undefined;
  readonly identityCenterAssignments: IdentityCenterAssignmentConfig[] | undefined = undefined;
}

export class PolicyConfig implements i.IPolicyConfig {
  readonly name: string = '';
  readonly policy: string = '';
}

export class CustomerManagedPolicyReferenceConfig implements i.ICustomerManagedPolicyReferenceConfig {
  readonly name: string = '';
  readonly path: string | undefined = undefined;
}

export class PermissionsBoundaryConfig implements i.IPermissionsBoundaryConfig {
  readonly awsManagedPolicyName: string | undefined = undefined;
  readonly customerManagedPolicy: CustomerManagedPolicyReferenceConfig | undefined = undefined;
}

export class IdentityCenterPoliciesConfig implements i.IIdentityCenterPoliciesConfig {
  readonly awsManaged: string[] | undefined = undefined;
  readonly customerManaged: string[] | undefined = undefined;
  readonly acceleratorManaged: string[] | undefined = undefined;
  readonly inlinePolicy: string | undefined = undefined;
  readonly permissionsBoundary: PermissionsBoundaryConfig | undefined = undefined;
}

export class IdentityCenterPermissionSetConfig implements i.IIdentityCenterPermissionSetConfig {
  readonly name: string = '';
  readonly policies: IdentityCenterPoliciesConfig | undefined = undefined;
  readonly sessionDuration: number | undefined = undefined;
  readonly description: string | undefined = undefined;
}

export class IdentityCenterAssignmentPrincipalConfig implements i.IIdentityCenterAssignmentPrincipalConfig {
  readonly type: string = '';
  readonly name: string = '';
}

export class IdentityCenterAssignmentConfig implements i.IIdentityCenterAssignmentConfig {
  readonly name: string = '';
  readonly permissionSetName: string = '';
  readonly principalId: string | undefined = undefined;
  readonly principalType: t.PrincipalType | undefined = undefined;
  readonly principals: IdentityCenterAssignmentPrincipalConfig[] | undefined = undefined;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class RoleSetConfig implements i.IRoleSetConfig {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly path: string | undefined = undefined;
  readonly roles: RoleConfig[] = [];
}

export class PolicySetConfig implements i.IPolicySetConfig {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly identityCenterDependency: boolean | undefined = undefined;
  readonly policies: PolicyConfig[] = [];
}

export class IamConfig implements i.IIamConfig {
  /**
   * A name for the iam config file in config repository
   *
   * @default iam-config.yaml
   */
  static readonly FILENAME = 'iam-config.yaml';

  readonly providers: SamlProviderConfig[] = [];
  readonly policySets: PolicySetConfig[] = [];
  readonly roleSets: RoleSetConfig[] = [];
  readonly groupSets: GroupSetConfig[] = [];
  readonly userSets: UserSetConfig[] = [];
  readonly identityCenter: IdentityCenterConfig | undefined = undefined;
  readonly managedActiveDirectories: ManagedActiveDirectoryConfig[] | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: i.IIamConfig) {
    Object.assign(this, values);
  }

  /**
   * Load from config file content
   * @param dir
   * @param replacementsConfig
   * @returns
   */

  static load(dir: string, replacementsConfig?: ReplacementsConfig): IamConfig {
    const initialBuffer = fs.readFileSync(path.join(dir, IamConfig.FILENAME), 'utf8');
    const buffer = replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
    const values = t.parseIamConfig(yaml.load(buffer));
    return new IamConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): IamConfig | undefined {
    try {
      const values = t.parseIamConfig(yaml.load(content));
      return new IamConfig(values);
    } catch (e) {
      logger.error('Error parsing input, iam config undefined');
      logger.error(`${e}`);
      throw new Error('Could not load iam configuration');
    }
  }

  public getManageActiveDirectoryAdminSecretName(directoryName: string): string {
    let directoryFound = false;
    for (const managedActiveDirectory of this.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.name === directoryName) {
        directoryFound = true;
        if (managedActiveDirectory.secretConfig) {
          if (managedActiveDirectory.secretConfig.adminSecretName) {
            return managedActiveDirectory.secretConfig.adminSecretName;
          }
        }
      }
    }
    if (directoryFound) {
      return 'admin';
    }
    logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
    throw new Error('configuration validation failed.');
  }

  public getManageActiveDirectorySecretAccountName(directoryName: string): string {
    let directoryFound = false;
    let directoryAccount = '';
    for (const managedActiveDirectory of this.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.name === directoryName) {
        directoryFound = true;
        directoryAccount = managedActiveDirectory.account;
        if (managedActiveDirectory.secretConfig) {
          if (managedActiveDirectory.secretConfig.account) {
            return managedActiveDirectory.secretConfig.account;
          } else {
            managedActiveDirectory.account;
          }
        }
      }
    }
    if (directoryFound) {
      return directoryAccount;
    }
    logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
    throw new Error('configuration validation failed.');
  }

  public getManageActiveDirectorySecretRegion(directoryName: string): string {
    for (const managedActiveDirectory of this.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.name === directoryName) {
        if (managedActiveDirectory.secretConfig) {
          if (managedActiveDirectory.secretConfig.region) {
            return managedActiveDirectory.secretConfig.region;
          } else {
            return managedActiveDirectory.region;
          }
        }
      }
    }
    logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
    throw new Error('configuration validation failed.');
  }

  public getManageActiveDirectorySharedAccountNames(directoryName: string, configDir: string): string[] {
    const activeDirectories = this.managedActiveDirectories ?? [];
    const managedActiveDirectory = activeDirectories.find(
      managedActiveDirectory => managedActiveDirectory.name === directoryName,
    );
    if (!managedActiveDirectory) {
      logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
      throw new Error('configuration validation failed.');
    }
    const accountsConfig = AccountsConfig.load(configDir);

    const sharedOuAccounts =
      managedActiveDirectory.sharedOrganizationalUnits?.organizationalUnits
        .map(ou => this.getAccountsByOU(ou, accountsConfig))
        .flat() ?? [];
    const sharedAccounts = managedActiveDirectory.sharedAccounts ?? [];
    const excludedAccounts = managedActiveDirectory.sharedOrganizationalUnits?.excludedAccounts ?? [];
    const accounts = [...sharedAccounts, ...sharedOuAccounts];
    const filteredAccounts = accounts.filter(account => !excludedAccounts.includes(account));
    return [...new Set(filteredAccounts)];
  }

  private getAccountsByOU(ouName: string, accountsConfig: AccountsConfig) {
    const allAccountItems = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts];
    const allAccounts = allAccountItems.map(accountItem => accountItem.name);
    if (ouName === 'Root') {
      return allAccounts;
    }
    return allAccountItems
      .filter(accountItem => accountItem.organizationalUnit === ouName)
      .map(accountItem => accountItem.name);
  }
}
