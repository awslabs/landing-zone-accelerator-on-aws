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
import { loadOrganizationalUnits } from '@aws-accelerator/utils/lib/load-organization-config';

import * as t from './common';
import * as i from './models/organization-config';
import { ReplacementsConfig } from './replacements-config';
import { AccountsConfig } from './accounts-config';

const logger = createLogger(['organization-config']);

export abstract class OrganizationalUnitConfig implements i.IOrganizationalUnitConfig {
  readonly name: string = '';
  readonly ignore: boolean | undefined = undefined;
}

export abstract class OrganizationalUnitIdConfig implements i.IOrganizationalUnitIdConfig {
  readonly name: string = '';
  readonly id: string = '';
  readonly arn: string = '';
}

export abstract class QuarantineNewAccountsConfig implements i.IQuarantineNewAccountsConfig {
  readonly enable: boolean = true;
  readonly scpPolicyName: string = 'QuarantineAccounts';
}

export abstract class ServiceControlPolicyConfig implements i.IServiceControlPolicyConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly policy: string = '';
  readonly type = 'customerManaged';
  readonly strategy = 'deny-list';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export abstract class TaggingPolicyConfig implements i.ITaggingPolicyConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly policy: string = '';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export abstract class ChatbotPolicyConfig implements i.IChatbotPolicyConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly policy: string = '';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export abstract class BackupPolicyConfig implements i.IBackupPolicyConfig {
  readonly name: string = '';
  readonly description: string = '';
  readonly policy: string = '';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class OrganizationConfig implements i.IOrganizationConfig {
  /**
   * A name for the organization config file in config repository
   *
   * @default organization-config.yaml
   */
  static readonly FILENAME = 'organization-config.yaml';

  readonly enable = true;
  readonly organizationalUnits: OrganizationalUnitConfig[] = [
    {
      name: 'Security',
      ignore: undefined,
    },
    {
      name: 'Infrastructure',
      ignore: undefined,
    },
  ];

  public organizationalUnitIds: OrganizationalUnitIdConfig[] | undefined = undefined;
  readonly quarantineNewAccounts: QuarantineNewAccountsConfig | undefined = undefined;
  readonly serviceControlPolicies: ServiceControlPolicyConfig[] = [];
  readonly taggingPolicies: TaggingPolicyConfig[] = [];
  readonly chatbotPolicies?: ChatbotPolicyConfig[] = [];
  readonly backupPolicies: BackupPolicyConfig[] = [];

  /**
   *
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(values?: i.IOrganizationConfig) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Load from config file content
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string, replacementsConfig?: ReplacementsConfig): OrganizationConfig {
    const initialBuffer = fs.readFileSync(path.join(dir, OrganizationConfig.FILENAME), 'utf8');
    const buffer = replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
    const values = t.parseOrganizationConfig(yaml.load(buffer));
    return new OrganizationConfig(values);
  }

  /**
   * Loads the file raw with default replacements placeholders to determine if organizations is enabled.
   */
  static loadRawOrganizationsConfig(dir: string): OrganizationConfig {
    const accountsConfig = AccountsConfig.load(dir);
    const orgConfig = OrganizationConfig.load(dir);
    let replacementsConfig: ReplacementsConfig;

    if (fs.existsSync(path.join(dir, ReplacementsConfig.FILENAME))) {
      replacementsConfig = ReplacementsConfig.load(dir, accountsConfig, true);
    } else {
      replacementsConfig = new ReplacementsConfig();
    }

    replacementsConfig.loadReplacementValues({}, orgConfig.enable);
    return OrganizationConfig.load(dir, replacementsConfig);
  }

  /**
   * Load from string
   * @param initialBuffer
   * @param replacementsConfig
   * @returns
   */
  static loadFromString(initialBuffer: string, replacementsConfig?: ReplacementsConfig): OrganizationConfig {
    const buffer = replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
    const values = t.parseOrganizationConfig(yaml.load(buffer));
    return new OrganizationConfig(values);
  }

  /**
   * Load from buffer
   * @param dir
   * @param replacementsConfig
   * @returns
   */
  static loadBuffer(dir: string, replacementsConfig?: ReplacementsConfig): string {
    const initialBuffer = fs.readFileSync(path.join(dir, OrganizationConfig.FILENAME), 'utf8');
    return replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
  }

  /**
   * Load from string content
   * @param partition string
   * @param managementAccountCredentials {@link AWS.Credentials}
   * @returns
   */
  public async loadOrganizationalUnitIds(
    partition: string,
    managementAccountCredentials?: AWS.Credentials,
  ): Promise<void> {
    if (!this.enable) {
      // do nothing
      return;
    } else {
      this.organizationalUnitIds = [];
    }
    if (this.organizationalUnitIds?.length == 0) {
      this.organizationalUnitIds = await loadOrganizationalUnits(
        partition,
        this.organizationalUnits,
        managementAccountCredentials,
      );
    }
  }

  public getOrganizationId(): string | undefined {
    if (!this.enable) {
      return undefined;
    } else {
      // We can get the AWS Organization Id without an API call here
      // because we already retrieved OU ARNs which contain the Organization Id.
      // We know every organization has at least one OU so we
      // can get the Organization Id from parsing the first OU ARN.
      const orgId = this.organizationalUnitIds![0].arn.split('/')[1];
      if (orgId) {
        return orgId;
      }
    }
    logger.error('Organizations not enabled or error getting Organization Id');
    throw new Error('configuration validation failed.');
  }

  public getOrganizationalUnitId(name: string): string {
    if (!this.enable) {
      // do nothing
    } else {
      const ou = this.organizationalUnitIds?.find(item => item.name === name);
      if (ou) {
        return ou.id;
      }
    }
    logger.error(`Could not get Organization ID for name: ${name}. Organizations not enabled or OU doesn't exist`);
    throw new Error('configuration validation failed.');
  }

  public getOrganizationalUnitArn(name: string): string {
    if (!this.enable) {
      // do nothing
    } else {
      const ou = this.organizationalUnitIds?.find(item => item.name === name);
      if (ou) {
        return ou.arn;
      }
    }
    logger.error(`Could not get Organization Arn for name: ${name}. Organizations not enabled or OU doesn't exist`);
    throw new Error('configuration validation failed.');
  }

  public isIgnored(name: string): boolean {
    if (!this.enable) {
      return false;
    }
    const ou = this.organizationalUnits?.find(item => item.name === name);
    if (ou?.ignore) {
      return true;
    }
    return false;
  }

  public getPath(name: string): string {
    //get the parent path
    const pathIndex = name.lastIndexOf('/');
    const ouPath = name.slice(0, pathIndex + 1).slice(0, -1);
    if (ouPath === '') {
      return '/';
    }
    return '/' + ouPath;
  }

  public getOuName(name: string): string {
    const result = name.split('/').pop();
    if (result === undefined) {
      return name;
    }
    return result;
  }

  public getParentOuName(name: string): string {
    const parentOuPath = this.getPath(name);
    const result = parentOuPath.split('/').pop();
    if (result === undefined) {
      return '/';
    }
    return result;
  }
}
