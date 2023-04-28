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

import { PrefixList } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel, NetworkStack } from '../network-stack';

export class PrefixListResources {
  public readonly prefixListMap: Map<string, PrefixList>;
  private stack: NetworkStack;

  constructor(networkStack: NetworkStack, props: AcceleratorStackProps) {
    this.stack = networkStack;

    // Create prefix lists
    this.prefixListMap = this.createPrefixLists(props);
  }

  /**
   * Create prefix lists for the current stack context
   * @param props
   * @returns
   */
  private createPrefixLists(props: AcceleratorStackProps): Map<string, PrefixList> {
    const prefixListMap = new Map<string, PrefixList>();
    for (const prefixListItem of props.networkConfig.prefixLists ?? []) {
      const prefixListTargets = this.stack.getPrefixListTargets(prefixListItem);
      if (this.stack.isTargetStack(prefixListTargets.accountIds, prefixListTargets.regions)) {
        this.stack.addLogs(LogLevel.INFO, `Adding Prefix List ${prefixListItem.name}`);

        const prefixList = new PrefixList(this.stack, pascalCase(`${prefixListItem.name}PrefixList`), {
          name: prefixListItem.name,
          addressFamily: prefixListItem.addressFamily,
          maxEntries: prefixListItem.maxEntries,
          entries: prefixListItem.entries,
          tags: prefixListItem.tags ?? [],
        });
        prefixListMap.set(prefixListItem.name, prefixList);

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(prefixListItem.name)}PrefixList`),
          parameterName: this.stack.getSsmPath(SsmResourceType.PREFIX_LIST, [prefixListItem.name]),
          stringValue: prefixList.prefixListId,
        });
      }
    }
    return prefixListMap;
  }
}
