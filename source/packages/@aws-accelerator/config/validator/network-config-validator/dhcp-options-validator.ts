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
import { NetworkConfig, DhcpOptsConfig } from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

interface IpAddresses {
  ipv4: string[];
  ipv6: string[];
}

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
    //
    // Validate DNS IP addresses
    set.domainNameServers?.forEach(dnsIp => {
      if (dnsIp !== 'AmazonProvidedDNS' && !helpers.isValidIpv4(dnsIp) && !helpers.isValidIpv6(dnsIp)) {
        errors.push(
          `[DHCP options set ${set.name}]: IP address "${dnsIp}" is invalid. Values for domainNameServers must be either a valid IPv4/v6 address or AmazonProvidedDNS`,
        );
      }
    });
    //
    // Validate NTP IP addresses
    set.ntpServers?.forEach(ntpIp => {
      if (!helpers.isValidIpv4(ntpIp) && !helpers.isValidIpv6(ntpIp)) {
        errors.push(
          `[DHCP options set ${set.name}]: IP address "${ntpIp}" is invalid. Values for ntpServers must be a valid IPv4/v6 address`,
        );
      }
    });
    //
    // Validate NetBIOS name servers (only supports IPv4)
    set.netbiosNameServers?.forEach(netBiosIp => {
      if (!helpers.isValidIpv4(netBiosIp)) {
        errors.push(
          `[DHCP options set ${set.name}]: IP address "${netBiosIp}" is invalid. Values for netbiosNameServers must be a valid IPv4 address`,
        );
      }
    });
    //
    // Filter and store IPs
    const domainNameServers: IpAddresses = {
      ipv4: set.domainNameServers?.filter(dnsIpv4 => helpers.isValidIpv4(dnsIpv4)) ?? [],
      ipv6: set.domainNameServers?.filter(dnsIpv6 => helpers.isValidIpv6(dnsIpv6)) ?? [],
    };
    const ntpServers: IpAddresses = {
      ipv4: set.ntpServers?.filter(ntpIpv4 => helpers.isValidIpv4(ntpIpv4)) ?? [],
      ipv6: set.ntpServers?.filter(ntpIpv6 => helpers.isValidIpv6(ntpIpv6)) ?? [],
    };
    const netbiosNameServers: IpAddresses = {
      ipv4: set.netbiosNameServers?.filter(netBiosIpv4 => helpers.isValidIpv4(netBiosIpv4)) ?? [],
      ipv6: [],
    };
    //
    // Validate length of IP addresses
    this.validateIpAddressLength(domainNameServers, ntpServers, netbiosNameServers, set.name, errors);
  }

  /**
   * Validate length of each IP address type
   * @param domainNameServers
   * @param ntpServers
   * @param netbiosNameServers
   * @param setName
   * @param errors
   */
  private validateIpAddressLength(
    domainNameServers: IpAddresses,
    ntpServers: IpAddresses,
    netbiosNameServers: IpAddresses,
    setName: string,
    errors: string[],
  ) {
    //
    // Validate total length of DNS IPs
    if (domainNameServers.ipv4.length > 4 || domainNameServers.ipv6.length > 4) {
      errors.push(
        `[DHCP options set ${setName}]: maximum domainNameServers server address threshold breached -- IPv4: ${domainNameServers.ipv4.length} IPv6: ${domainNameServers.ipv6.length}. No more than 4 servers of each IP version type may be defined`,
      );
    }
    //
    // Validate total length of NTP IPs
    if (ntpServers.ipv4.length > 4 || ntpServers.ipv6.length > 4) {
      errors.push(
        `[DHCP options set ${setName}]: maximum ntpServers server address threshold breached -- IPv4: ${ntpServers.ipv4.length} IPv6: ${ntpServers.ipv6.length}. No more than 4 servers of each IP version type may be defined`,
      );
    }
    //
    // Validate total length of NetBIOS IPs
    if (netbiosNameServers.ipv4.length > 4) {
      errors.push(
        `[DHCP options set ${setName}]: netbiosNameServers has ${netbiosNameServers.ipv4.length} IPv4 servers defined. A maximum of 4 servers may be defined`,
      );
    }
  }
}
