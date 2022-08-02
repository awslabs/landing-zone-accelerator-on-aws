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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface IDhcpOptions extends cdk.IResource {
  /**
   * The name of the DHCP options set.
   */
  readonly name: string;

  /**
   * The ID of the DHCP options set.
   */
  readonly dhcpOptionsId: string;
}

export interface DhcpOptionsProps {
  /**
   * The name of the DHCP options set.
   */
  readonly name: string;

  /**
   * This value is used to complete unqualified DNS hostnames.
   */
  readonly domainName?: string;

  /**
   * The IPv4 addresses of up to four domain name servers.
   *
   * @default -- AmazonProvidedDNS
   */
  readonly domainNameServers?: string[];

  /**
   * The IPv4 addresses of up to four NetBIOS name servers.
   */
  readonly netbiosNameServers?: string[];

  /**
   * The NetBIOS node type (1, 2, 4, or 8).
   */
  readonly netbiosNodeType?: number;

  /**
   * The IPv4 addresses of up to four Network Time Protocol (NTP) servers.
   */
  readonly ntpServers?: string[];

  /**
   * Any tags assigned to the DHCP options set.
   */
  readonly tags?: cdk.CfnTag[];
}

export class DhcpOptions extends cdk.Resource implements IDhcpOptions {
  public readonly name: string;
  public readonly dhcpOptionsId: string;

  constructor(scope: Construct, id: string, props: DhcpOptionsProps) {
    super(scope, id);

    this.name = props.name;

    const resource = new cdk.aws_ec2.CfnDHCPOptions(this, 'Resource', {
      domainName: props.domainName,
      domainNameServers: props.domainNameServers ?? ['AmazonProvidedDNS'],
      netbiosNameServers: props.netbiosNameServers,
      netbiosNodeType: props.netbiosNodeType,
      ntpServers: props.ntpServers,
      tags: props.tags,
    });
    // Add name tag to tags
    cdk.Tags.of(this).add('Name', this.name);

    this.dhcpOptionsId = resource.ref;
  }
}
