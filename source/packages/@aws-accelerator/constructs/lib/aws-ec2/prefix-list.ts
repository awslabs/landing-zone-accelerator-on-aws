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

import { CfnTag, IResource, Resource } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface IPrefixList extends IResource {
  /**
   * The ID of the prefix list.
   */
  readonly prefixListId: string;
}

export interface PrefixListProps {
  /**
   * The name of the prefix list.
   */
  readonly name: string;

  /**
   * IP Address Family IPv4 or IPv6.
   * @default -- 'IPv4'
   */
  readonly addressFamily: string;

  /**
   * Maxinum number of CIDR block entries.
   *
   * @default -- 1
   */
  readonly maxEntries: number;

  /**
   * List of CIDR block entries.
   *
   */
  readonly entries: string[];

  /**
   * Any tags assigned to the prefix list.
   */
  readonly tags?: CfnTag[];
}

export class PrefixList extends Resource implements IPrefixList {
  public readonly prefixListId: string;

  constructor(scope: Construct, id: string, props: PrefixListProps) {
    super(scope, id);

    const cidrBlocks: ec2.CfnPrefixList.EntryProperty[] = props.entries.map(item => {
      return { cidr: item };
    });

    const resource = new ec2.CfnPrefixList(this, 'Resource', {
      prefixListName: props.name,
      addressFamily: props.addressFamily,
      maxEntries: props.maxEntries,
      entries: cidrBlocks,
      tags: props.tags,
    });

    this.prefixListId = resource.attrPrefixListId;
  }
}
