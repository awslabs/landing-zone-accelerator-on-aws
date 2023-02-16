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
import { NetworkConfig, DhcpOptsConfig } from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate DHCP options sets
 */
export class DhcpOptionsValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate DHCP options names
    //
    this.validateDhcpOptNames(values, helpers, errors);
    //
    // Validate DHCP options names
    //
    this.validateDhcpOptAccountNames(values, helpers, errors);
    //
    // Validate DHCP configuration
    //
    this.validateDhcpOptConfiguration(values, helpers, errors);
  }

  private validateDhcpOptNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const setNames: string[] = [];
    values.dhcpOptions?.forEach(set => setNames.push(set.name));

    if (helpers.hasDuplicates(setNames)) {
      errors.push(
        `Duplicate DHCP options set names exist. DHCP options set names must be unique. DHCP options set names in file: ${setNames}`,
      );
    }
  }

  /**
   * Validate DHCP options account names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateDhcpOptAccountNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.dhcpOptions?.forEach(set => {
      set.accounts.forEach(account => {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Target account ${account} for DHCP options set ${set.name} does not exist in accounts-config.yaml file`,
          );
        }
      });
    });
  }

  private validateDhcpOptConfiguration(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.dhcpOptions?.forEach(set => {
      // Validate domain name
      this.validateDomainName(set, helpers, errors);
      // Validate IP addresses
      this.validateIpAddresses(set, helpers, errors);
    });
  }

  /**
   * Validate DHCP option set domain name
   * @param set
   * @param helpers
   * @param errors
   */
  private validateDomainName(set: DhcpOptsConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    // Validate regex
    if (set.domainName && !helpers.matchesRegex(set.domainName, '^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$')) {
      errors.push(
        `[DHCP options set ${set.name}]: domainName "${set.domainName}" is invalid. Domain names must match the pattern "^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$"`,
      );
    }
    // Validate regional domain names are not deployed to more than one region
    const isRegionalName = set.domainName
      ? set.domainName === 'ec2.internal' || helpers.matchesRegex(set.domainName, '^.+\\.compute\\.internal$')
      : false;
    if (set.regions.length > 1 && set.domainName && isRegionalName) {
      errors.push(
        `[DHCP options set ${set.name}]: domainName "${set.domainName}" is invalid. Domain name is deployed to multiple regions but specified Amazon-provided regional domain name`,
      );
    }
  }

  /**
   * Validate IP addresses defined for DHCP options set
   * @param set
   * @param helpers
   * @param errors
   */
  private validateIpAddresses(set: DhcpOptsConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    // Validate IP addresses are valid
    const ips = [...(set.domainNameServers ?? []), ...(set.netbiosNameServers ?? []), ...(set.ntpServers ?? [])];
    ips.forEach(ip => {
      if (ip !== 'AmazonProvidedDNS' && !helpers.isValidIpv4(ip)) {
        errors.push(
          `[DHCP options set ${set.name}]: IP address "${ip}" is invalid. Values must be either a valid IPv4 address or AmazonProvidedDNS`,
        );
      }
    });

    // Validate number of servers defined
    if (set.domainNameServers && set.domainNameServers.length > 4) {
      errors.push(
        `[DHCP options set ${set.name}]: domainNameServers has ${set.domainNameServers.length} servers defined. A maximum of 4 servers may be defined`,
      );
    }
    if (set.netbiosNameServers && set.netbiosNameServers.length > 4) {
      errors.push(
        `[DHCP options set ${set.name}]: netbiosNameServers has ${set.netbiosNameServers.length} servers defined. A maximum of 4 servers may be defined`,
      );
    }
    if (set.ntpServers && set.ntpServers.length > 4) {
      errors.push(
        `[DHCP options set ${set.name}]: ntpServers has ${set.ntpServers.length} servers defined. A maximum of 4 servers may be defined`,
      );
    }
  }
}
