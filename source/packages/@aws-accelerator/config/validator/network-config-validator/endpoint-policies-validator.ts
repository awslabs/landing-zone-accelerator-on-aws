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

import path from 'path';
import * as fs from 'fs';
import { NetworkConfig } from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate endpoint policies
 */
export class EndpointPoliciesValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate endpoint policy names are unique
    //
    this.validateEndpointPolicyNames(values, helpers, errors);
    //
    // Validate endpoint policy document exists
    //
    this.validateEndpointPolicyDocumentFile(values, configDir, errors);
  }
  /**
   * Method to validate endpoint policy names are unique
   * @param values
   * @param helpers
   * @param errors
   */
  private validateEndpointPolicyNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const policyNames = values.endpointPolicies.map(policy => {
      return policy.name;
    });
    // Validate names are unique
    if (helpers.hasDuplicates(policyNames)) {
      errors.push(
        `Duplicate endpoint policy names exist. Endpoint policy names must be unique. Endpoint policy names in file: ${policyNames}`,
      );
    }
  }
  /**
   * Function to validate Endpoint policy document file existence
   * @param values
   * @param configDir
   * @param errors
   */
  private validateEndpointPolicyDocumentFile(values: NetworkConfig, configDir: string, errors: string[]) {
    for (const policyItem of values.endpointPolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, policyItem.document))) {
        errors.push(`Endpoint policy ${policyItem.name} document file ${policyItem.document} not found!`);
      }
    }
  }
}
