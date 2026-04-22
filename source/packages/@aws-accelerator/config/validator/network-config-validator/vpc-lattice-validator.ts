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

import { NetworkConfig } from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate VPC Lattice configuration
 */
export class VpcLatticeValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    if (!values.vpcLattice) {
      return;
    }

    // 1. Validate unique Service Networks
    if (helpers.hasDuplicates(values.vpcLattice.serviceNetworks.map(sn => sn.name))) {
      errors.push(`[VPC Lattice]: serviceNetworks contain duplicate names.`);
    }

    // 2. Validate Service Networks accounts
    for (const sn of values.vpcLattice.serviceNetworks) {
      if (!helpers.accountExists(sn.account)) {
        errors.push(
          `[VPC Lattice Service Network ${sn.name}]: Target account ${sn.account} does not exist in accounts-config.yaml file`,
        );
      }
    }

    // 3. Validate Service Associations
    if (values.vpcLattice.serviceAssociations) {
      const associationPairs: string[] = [];

      for (const sa of values.vpcLattice.serviceAssociations) {
        // Validate vpc exists
        if (!helpers.getVpc(sa.vpc)) {
          errors.push(
            `[VPC Lattice Service Association]: Target VPC ${sa.vpc} does not exist in network-config.yaml file`,
          );
        }

        // Validate serviceNetwork points to declared SN
        const snExists = values.vpcLattice.serviceNetworks.find(sn => sn.name === sa.serviceNetwork);
        if (!snExists) {
          errors.push(
            `[VPC Lattice Service Association]: Target Service Network ${sa.serviceNetwork} is not declared in vpcLattice.serviceNetworks`,
          );
        }

        // Push tuple for uniqueness check
        associationPairs.push(`${sa.vpc}-${sa.serviceNetwork}`);
      }

      // Check unique (vpc, serviceNetwork) pairs
      if (helpers.hasDuplicates(associationPairs)) {
        errors.push(`[VPC Lattice]: serviceAssociations contain duplicate (vpc, serviceNetwork) pairs.`);
      }
    }
  }
}
