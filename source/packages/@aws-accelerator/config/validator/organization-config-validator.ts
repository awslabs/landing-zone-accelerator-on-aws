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
import fs from 'fs';
import path from 'path';
import { OrganizationConfig } from '../lib/organization-config';
import { createLogger } from '@aws-accelerator/utils';

export class OrganizationConfigValidator {
  constructor(values: OrganizationConfig, configDir: string) {
    const errors: string[] = [];

    const logger = createLogger(['organization-config-validator']);

    logger.info(`${OrganizationConfig.FILENAME} file validation started`);

    // Validate presence of service control policy file
    this.validateServiceControlPolicyFile(configDir, values, errors);

    // Validate presence of tagging policy file
    this.validateTaggingPolicyFile(configDir, values, errors);

    // Validate presence of backup policy file
    this.validateBackupPolicyFile(configDir, values, errors);

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
        const index = validateScpCountForOrg.map(object => object.orgEntity).indexOf(accUnitScp);
        if (index > -1) {
          validateScpCountForOrg[index].appliedScpName.push(serviceControlPolicy.name);
        } else {
          validateScpCountForOrg.push({
            orgEntity: accUnitScp,
            orgEntityType: 'Account',
            appliedScpName: [serviceControlPolicy.name],
          });
        }
      }
    }
    for (const validateOrgEntity of validateScpCountForOrg) {
      if (validateOrgEntity.appliedScpName.length > 5) {
        errors.push(
          `${validateOrgEntity.orgEntityType} - ${validateOrgEntity.orgEntity} has ${validateOrgEntity.appliedScpName.length} out of 5 allowed scps`,
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
        errors.push(`Invalid policy file ${taggingPolicy.policy} for tagging policy ${taggingPolicy.name} !!!`);
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
        errors.push(`Invalid policy file ${backupPolicy.policy} for backup policy ${backupPolicy.name} !!!`);
      }
    }
  }
}
