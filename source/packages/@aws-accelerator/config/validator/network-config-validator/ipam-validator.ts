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

import { IPv4CidrRange } from 'ip-num';
import { NetworkConfig, IpamConfig, IpamPoolConfig } from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate ipam
 */
export class IpamValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate IPAM names are unique
    //
    this.validateIpamNames(values, helpers, errors);
    //
    // Validate IPAM regions are unique
    //
    this.validateIpamRegions(values, helpers, errors);
    //
    // Validate Ipam deployment Ou names
    this.validateIpamPoolShareTargetOUs(values, helpers, errors);
    //
    // Validate Ipam deployment account names
    //
    this.validateIpamPoolShareTargetAccounts(values, helpers, errors);
    //
    // Validate IPAM pools
    //
    this.validateIpamPoolConfigurations(values, helpers, errors);
  }

  /**
   * Method to validate uniqueness of IPAM names
   *
   * @param values
   * @param helpers
   * @param helpers
   */
  private validateIpamNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ipams = values.centralNetworkServices?.ipams;
    if (ipams) {
      const ipamNames = ipams.map(ipam => {
        return ipam.name;
      });

      // Validate IPAM names are unique
      if (helpers.hasDuplicates(ipamNames)) {
        errors.push(`Duplicate IPAM names exist. IPAM names must be unique. IPAM names in file: ${ipamNames}`);
      }

      // Validate scope and pool names
      for (const ipam of ipams) {
        this.validateIpamScopeNames(ipam, helpers, errors);
        this.validateIpamPoolNames(ipam, helpers, errors);
      }
    }
  }

  /**
   * Validate uniqueness of IPAM regions
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamRegions(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ipams = values.centralNetworkServices?.ipams;
    if (ipams) {
      const ipamRegions = ipams.map(ipam => {
        return ipam.region;
      });

      if (helpers.hasDuplicates(ipamRegions)) {
        errors.push(
          `Duplicate IPAM regions exist. You may only deploy one IPAM per region. IPAM regions in file: ${ipamRegions}`,
        );
      }
    }
  }

  /**
   * Validate uniqueness of IPAM scope names
   * @param ipam
   * @param helpers
   * @param errors
   */
  private validateIpamScopeNames(ipam: IpamConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    if (ipam.scopes) {
      const scopeNames = ipam.scopes.map(scope => {
        return scope.name;
      });

      if (helpers.hasDuplicates(scopeNames)) {
        errors.push(
          `[IPAM ${ipam.name}]: duplicate IPAM scope names exist. IPAM scope names must be unique. IPAM scope names for this IPAM: ${scopeNames}`,
        );
      }
    }
  }

  /**
   * Validate uniqueness of IPAM pool names
   * @param ipam
   * @param helpers
   * @param errors
   */
  private validateIpamPoolNames(ipam: IpamConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    if (ipam.pools) {
      const poolNames = ipam.pools.map(pool => {
        return pool.name;
      });

      if (helpers.hasDuplicates(poolNames)) {
        errors.push(
          `[IPAM ${ipam.name}]: duplicate IPAM pool names exist. IPAM pool names must be unique. IPAM pool names for this IPAM: ${poolNames}`,
        );
      }
    }
  }

  /**
   * Function to validate existence of IPAM pool deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamPoolShareTargetOUs(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const ou of pool.shareTargets?.organizationalUnits ?? []) {
          if (!helpers.ouExists(ou)) {
            errors.push(
              `Share target OU ${ou} for IPAM pool ${pool.name} does not exist in organization-config.yaml file`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate existence of IPAM pool deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamPoolShareTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const account of pool.shareTargets?.accounts ?? []) {
          if (!helpers.accountExists(account)) {
            errors.push(
              `Share target account ${account} for IPAM pool ${pool.name} does not exist in accounts-config.yaml file`,
            );
          }
        }
      }
    }
  }

  /**
   * Validate IPAM pool configurations
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamPoolConfigurations(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      const allPools = this.getPools(ipam);
      let allValid = true;

      // Validate provisioned CIDRs
      for (const pool of ipam.pools ?? []) {
        const validCidrs = this.validateProvisionedCidrs(ipam, pool, helpers, errors);
        if (!validCidrs) {
          allValid = false;
        }
      }

      // Validate nested pools
      if (allValid) {
        this.validateNestedPools(ipam, allPools, errors);
      }
    }
  }

  /**
   * Get IPAM pools configured for a given IPAM
   * @param ipam
   * @returns
   */
  private getPools(ipam: IpamConfig): Map<string, IpamPoolConfig> {
    const poolMap = new Map<string, IpamPoolConfig>();
    for (const pool of ipam.pools ?? []) {
      poolMap.set(pool.name, pool);
    }
    return poolMap;
  }

  /**
   * Validate provisioned CIDRs are in CIDR format
   * @param ipam
   * @param pool
   * @param helpers
   * @param errors
   */
  private validateProvisionedCidrs(
    ipam: IpamConfig,
    pool: IpamPoolConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    for (const cidr of pool.provisionedCidrs ?? []) {
      if (!helpers.isValidIpv4Cidr(cidr)) {
        errors.push(
          `[IPAM ${ipam.name} pool ${pool.name}]: provisioned CIDR ${cidr} is invalid. Please enter a valid CIDR`,
        );
        return false;
      }
    }
    return true;
  }

  /**
   * Validate nested IPAM pools
   * @param ipam
   * @param allPools
   * @param errors
   */
  private validateNestedPools(ipam: IpamConfig, allPools: Map<string, IpamPoolConfig>, errors: string[]) {
    for (const pool of ipam.pools ?? []) {
      if (pool.sourceIpamPool) {
        // Validate that the base pool exists
        const basePool = allPools.get(pool.sourceIpamPool);
        if (!basePool) {
          errors.push(`[IPAM ${ipam.name} pool ${pool.name}] source IPAM pool ${pool.sourceIpamPool} does not exist`);
        }

        // Validate that the provisioned CIDRs are contained within the base pool
        if (basePool) {
          this.validateNestedPoolCidrs(ipam, basePool, pool, errors);
        }
      }
    }
  }

  /**
   * Validate CIDRs within nested pools are contained in the base pool
   * @param ipam
   * @param basePool
   * @param nestedPool
   * @param errors
   */
  private validateNestedPoolCidrs(
    ipam: IpamConfig,
    basePool: IpamPoolConfig,
    nestedPool: IpamPoolConfig,
    errors: string[],
  ) {
    const validCidrs: string[] = [];
    if (nestedPool.provisionedCidrs) {
      for (const baseRangeString of basePool.provisionedCidrs ?? []) {
        const baseRange = IPv4CidrRange.fromCidr(baseRangeString);

        for (const nestedRangeString of nestedPool.provisionedCidrs ?? []) {
          const nestedRange = IPv4CidrRange.fromCidr(nestedRangeString);

          if (nestedRange.inside(baseRange) || nestedRange.isEquals(baseRange)) {
            validCidrs.push(nestedRangeString);
          }
        }
      }

      if (validCidrs.length !== nestedPool.provisionedCidrs.length) {
        errors.push(
          `[IPAM ${ipam.name} pool ${nestedPool.name}] nested pool contains provisioned CIDRs that are not within source pool ${basePool.name}. Source pool: ${basePool.provisionedCidrs} Nested pool: ${nestedPool.provisionedCidrs}`,
        );
      }
    }
  }
}
