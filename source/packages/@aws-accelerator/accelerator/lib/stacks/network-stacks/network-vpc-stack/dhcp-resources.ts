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

import { DhcpOptions } from '@aws-accelerator/constructs';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel, NetworkStack } from '../network-stack';

export class DhcpResources {
  public readonly dhcpOptionsIds: Map<string, string>;
  private stack: NetworkStack;

  constructor(networkStack: NetworkStack, props: AcceleratorStackProps) {
    this.stack = networkStack;

    // Create DHCP options sets
    this.dhcpOptionsIds = this.createDhcpOptions(props);
  }

  /**
   * Create DHCP options sets for the current stack context
   * @param props
   * @returns
   */
  private createDhcpOptions(props: AcceleratorStackProps): Map<string, string> {
    const dhcpOptionsIds = new Map<string, string>();

    for (const dhcpItem of props.networkConfig.dhcpOptions ?? []) {
      // Check if the set belongs in this account/region
      const accountIds = dhcpItem.accounts.map(item => {
        return props.accountsConfig.getAccountId(item);
      });
      const regions = dhcpItem.regions.map(item => {
        return item.toString();
      });

      if (this.stack.isTargetStack(accountIds, regions)) {
        this.stack.addLogs(LogLevel.INFO, `Adding DHCP options set ${dhcpItem.name}`);

        const optionSet = new DhcpOptions(this.stack, pascalCase(`${dhcpItem.name}DhcpOpts`), {
          name: dhcpItem.name,
          domainName: dhcpItem.domainName,
          domainNameServers: dhcpItem.domainNameServers,
          netbiosNameServers: dhcpItem.netbiosNameServers,
          netbiosNodeType: dhcpItem.netbiosNodeType,
          ntpServers: dhcpItem.ntpServers,
          tags: dhcpItem.tags ?? [], //Default passing an empty array for name tag
        });
        dhcpOptionsIds.set(optionSet.name, optionSet.dhcpOptionsId);
      }
    }
    return dhcpOptionsIds;
  }
}
