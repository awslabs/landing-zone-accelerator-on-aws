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

import { CustomizationsConfig } from '../../lib/customizations-config';
import { NetworkConfig } from '../../lib/network-config';
import { GatewayLoadBalancersValidator } from './gateway-load-balancers-validator';
import { IpamValidator } from './ipam-validator';
import { NetworkFirewallValidator } from './network-firewall-validator';
import { NetworkValidatorFunctions } from './network-validator-functions';
import { Route53ResolverValidator } from './route53-resolver-validator';

/**
 * Class to validate central network services
 */
export class CentralNetworkValidator {
  constructor(
    values: NetworkConfig,
    configDir: string,
    helpers: NetworkValidatorFunctions,
    errors: string[],
    customizationsConfig?: CustomizationsConfig,
  ) {
    // Validate delegated admin account name
    this.validateDelegatedAdmin(values, helpers, errors);

    // Validate central network services
    new GatewayLoadBalancersValidator(values, helpers, errors, customizationsConfig);
    new IpamValidator(values, helpers, errors);
    new NetworkFirewallValidator(values, configDir, helpers, errors);
    new Route53ResolverValidator(values, configDir, helpers, errors);
  }

  /**
   * Validate delegated admin account exists
   * @param values
   * @param helpers
   * @param errors
   */
  private validateDelegatedAdmin(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    if (values.centralNetworkServices) {
      const delegatedAdmin = values.centralNetworkServices.delegatedAdminAccount;
      if (!helpers.accountExists(delegatedAdmin)) {
        errors.push(
          `Central network services delegated admin account ${delegatedAdmin} does not exist in accounts-config.yaml`,
        );
      }
    }
  }
}
