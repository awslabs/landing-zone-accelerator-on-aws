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
import fs from 'fs';
import path from 'path';
import { BackupPolicyConfig, OrganizationConfig, TaggingPolicyConfig } from '../lib/organization-config';
import { createLogger } from '@aws-accelerator/utils';
import { ReplacementsConfig } from '../lib/replacements-config';
import { CommonValidatorFunctions } from './common/common-validator-functions';

export class OrganizationConfigValidator {
  private readonly ouScpLimit = Number(process.env['ORGANIZATIONAL_UNIT_SCP_LIMIT']) || 10;
  private readonly accountScpLimit = Number(process.env['ACCOUNT_SCP_LIMIT']) || 10;
  private readonly directAccountPolicyTypeLimit = 10;

  constructor(values: OrganizationConfig, replacementsConfig: ReplacementsConfig | undefined, configDir: string) {
    const errors: string[] = [];

    const logger = createLogger(['organization-config-validator']);

    logger.info(`${OrganizationConfig.FILENAME} file validation started`);

    // Validate presence of service control policy file
    this.validateServiceControlPolicyFile(configDir, values, errors);

    // Validate presence of resource control policy file
    this.validateResourceControlPolicyFile(configDir, values, errors);

    // Validate presence of declarative policy file
    this.validateDeclarativePolicyFile(configDir, values, errors);

    // Validate presence of tagging policy file
    this.validateTaggingPolicyFile(configDir, values, errors);

    // Validate presence of backup policy file
    this.validateBackupPolicyFile(configDir, values, errors);

    this.validateDirectAccountPolicyAttachmentCount(values.taggingPolicies, 'Tag Policy', errors);
    this.validateDirectAccountPolicyAttachmentCount(values.backupPolicies, 'Backup Policy', errors);

    // Validate definition of static parameter in policy file
    this.validateSCPParameters(configDir, values, replacementsConfig, errors);

    if (errors.length) {
      throw new Error(`${OrganizationConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
  }

  /**
   * Function to validate service control policy file existence
   * @param configDir
   * @param values
   */
  private validateServiceControlPolicyFile(configDir: string, values: OrganizationConfig, errors: string[]) {
    type validateScpItem = {
      orgEntity: string;
      orgEntityType: string;
      appliedScpName: string[];
    };
    const validateScpCountForOrg: validateScpItem[] = [];
    const validateScpCountForAcc: validateScpItem[] = [];
    for (const serviceControlPolicy of values.serviceControlPolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, serviceControlPolicy.policy))) {
        errors.push(
          `Invalid policy file ${serviceControlPolicy.policy} for service control policy ${serviceControlPolicy.name} !!!`,
        );
      }

      for (const orgUnitScp of serviceControlPolicy.deploymentTargets.organizationalUnits ?? []) {
        //check in array to see if OU is already there
        const index = validateScpCountForOrg.map(object => object.orgEntity).indexOf(orgUnitScp);
        if (index > -1) {
          validateScpCountForOrg[index].appliedScpName.push(serviceControlPolicy.name);
        } else {
          validateScpCountForOrg.push({
            orgEntity: orgUnitScp,
            orgEntityType: 'Organization Unit',
            appliedScpName: [serviceControlPolicy.name],
          });
        }
      }
      for (const accUnitScp of serviceControlPolicy.deploymentTargets.accounts ?? []) {
        //check in array to see if account is already there
        const index = validateScpCountForAcc.map(object => object.orgEntity).indexOf(accUnitScp);
        if (index > -1) {
          validateScpCountForAcc[index].appliedScpName.push(serviceControlPolicy.name);
        } else {
          validateScpCountForAcc.push({
            orgEntity: accUnitScp,
            orgEntityType: 'Account',
            appliedScpName: [serviceControlPolicy.name],
          });
        }
      }
    }

    for (const validateOrgEntity of validateScpCountForOrg) {
      if (validateOrgEntity.appliedScpName.length > this.ouScpLimit) {
        errors.push(
          `${validateOrgEntity.orgEntityType} - ${validateOrgEntity.orgEntity} has ${validateOrgEntity.appliedScpName.length} out of ${this.ouScpLimit} allowed scps. To validate a against a higher limit add the environment variable ACCELERATOR_MAX_OU_ATTACHED_SCPS to the toolkit build project`,
        );
      }
    }

    for (const validateAccEntity of validateScpCountForAcc) {
      if (validateAccEntity.appliedScpName.length > this.accountScpLimit) {
        errors.push(
          `${validateAccEntity.orgEntityType} - ${validateAccEntity.orgEntity} has ${validateAccEntity.appliedScpName.length} out of ${this.accountScpLimit} allowed scps.  To validate a against a higher limit add the environment variable ACCELERATOR_MAX_ACCOUNT_ATTACHED_SCPS to the toolkit build project`,
        );
      }
    }
  }

  /**
   * Function to validate resource control policy file existence
   * @param configDir
   * @param values
   */
  private validateResourceControlPolicyFile(configDir: string, values: OrganizationConfig, errors: string[]) {
    for (const resourceControlPolicy of values.resourceControlPolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, resourceControlPolicy.policy))) {
        errors.push(
          `Invalid policy file ${resourceControlPolicy.policy} for resource control policy ${resourceControlPolicy.name}!`,
        );
      }
    }
  }

  /**
   * Function to validate Declarative policy file existence
   * @param configDir
   * @param values
   */
  private validateDeclarativePolicyFile(configDir: string, values: OrganizationConfig, errors: string[]) {
    for (const declarativePolicy of values.declarativePolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, declarativePolicy.policy))) {
        errors.push(
          `Invalid policy file ${declarativePolicy.policy} for resource control policy ${declarativePolicy.name}!`,
        );
      }
    }
  }

  /**
   * Function to validate tagging policy file existence
   * @param configDir
   * @param values
   */
  private validateTaggingPolicyFile(configDir: string, values: OrganizationConfig, errors: string[]) {
    for (const taggingPolicy of values.taggingPolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, taggingPolicy.policy))) {
        errors.push(`Invalid policy file ${taggingPolicy.policy} for tagging policy ${taggingPolicy.name}!`);
      }
    }
  }

  /**
   * Function to validate presence of backup policy file existence
   * @param configDir
   * @param values
   */
  private validateBackupPolicyFile(configDir: string, values: OrganizationConfig, errors: string[]) {
    // Validate presence of backup policy file
    for (const backupPolicy of values.backupPolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, backupPolicy.policy))) {
        errors.push(`Invalid policy file ${backupPolicy.policy} for backup policy ${backupPolicy.name}!`);
      }
    }
  }

  /**
   * Validate the AWS Organizations hard limit for policies of one type directly attached to an account.
   *
   * @param policies Configured policies of one Organizations policy type
   * @param policyType Display name for the policy type
   * @param errors Validation errors
   */
  private validateDirectAccountPolicyAttachmentCount(
    policies: ReadonlyArray<TaggingPolicyConfig | BackupPolicyConfig>,
    policyType: 'Tag Policy' | 'Backup Policy',
    errors: string[],
  ): void {
    const policyNamesByAccount = new Map<string, Set<string>>();

    for (const policy of policies) {
      const excludedAccounts = new Set(policy.deploymentTargets.excludedAccounts ?? []);
      for (const account of new Set(policy.deploymentTargets.accounts ?? [])) {
        if (excludedAccounts.has(account)) {
          continue;
        }
        const policyNames = policyNamesByAccount.get(account) ?? new Set<string>();
        policyNames.add(policy.name);
        policyNamesByAccount.set(account, policyNames);
      }
    }

    for (const [account, policyNames] of policyNamesByAccount) {
      if (policyNames.size > this.directAccountPolicyTypeLimit) {
        errors.push(
          `Account - ${account} has ${policyNames.size} configured direct ${policyType} attachments, exceeding the AWS Organizations hard limit of ${this.directAccountPolicyTypeLimit} policies of this type per account. Configured policies: ${[...policyNames].join(', ')}`,
        );
      }
    }
  }

  /**
   * Function to validate if static parameter in policy file is defined in replacements config
   * @param configDir
   * @param organizationConfig
   * @param replacementConfig
   * @param errors
   */
  private validateSCPParameters(
    configDir: string,
    organizationConfig: OrganizationConfig,
    replacementConfig: ReplacementsConfig | undefined,
    errors: string[],
  ) {
    const policyPaths = organizationConfig.serviceControlPolicies.map(scp => scp.policy);
    CommonValidatorFunctions.validateStaticParameters(replacementConfig, configDir, policyPaths, new Set(), errors);
  }
}
