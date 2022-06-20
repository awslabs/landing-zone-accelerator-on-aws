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

import { GetNetworkFirewallEndpoint } from './get-network-firewall-endpoint';

interface INetworkFirewall extends cdk.IResource {
  /**
   * The unique IDs of the firewall endpoints for all of the subnets that you attached to the firewall.
   */
  readonly endpointIds: string[];

  /**
   * The Amazon Resource Name (ARN) of the firewall.
   */
  readonly firewallArn: string;

  /**
   * The ID of the firewall.
   */
  readonly firewallId: string;

  /**
   * The name of the policy.
   */
  readonly firewallName: string;
}

interface NetworkFirewallProps {
  /**
   * The Amazon Resource Name (ARN) of the firewall policy.
   */
  readonly firewallPolicyArn: string;

  /**
   * The descriptive name of the firewall.
   */
  readonly name: string;

  /**
   * The subnets that Network Firewall is using for the firewall.
   */
  readonly subnets: string[];

  /**
   * The unique identifier of the VPC where the firewall is in use.
   */
  readonly vpcId: string;

  /**
   * A flag indicating whether it is possible to delete the firewall.
   */
  readonly deleteProtection?: boolean;

  /**
   * A description of the firewall.
   */
  readonly description?: string;

  /**
   * A setting indicating whether the firewall is protected against a change to the firewall policy association.
   */
  readonly firewallPolicyChangeProtection?: boolean;

  /**
   * A setting indicating whether the firewall is protected against changes to the subnet associations.
   */
  readonly subnetChangeProtection?: boolean;

  /**
   * An optional list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

export class NetworkFirewall extends cdk.Resource implements INetworkFirewall {
  public readonly endpointIds: string[];
  public readonly firewallArn: string;
  public readonly firewallId: string;
  public readonly firewallName: string;
  private subnetMapping: cdk.aws_networkfirewall.CfnFirewall.SubnetMappingProperty[];

  constructor(scope: Construct, id: string, props: NetworkFirewallProps) {
    super(scope, id);

    // Set initial properties
    this.firewallName = props.name;
    this.subnetMapping = props.subnets.map(item => {
      return { subnetId: item };
    });

    // Set name tag
    props.tags?.push({ key: 'Name', value: this.firewallName });

    const resource = new cdk.aws_networkfirewall.CfnFirewall(this, 'Resource', {
      firewallName: this.firewallName,
      firewallPolicyArn: props.firewallPolicyArn,
      subnetMappings: this.subnetMapping,
      vpcId: props.vpcId,
      deleteProtection: props.deleteProtection,
      description: props.description,
      firewallPolicyChangeProtection: props.firewallPolicyChangeProtection,
      subnetChangeProtection: props.subnetChangeProtection,
      tags: props.tags,
    });

    // Set remaining properties
    this.endpointIds = resource.attrEndpointIds;
    this.firewallArn = resource.ref;
    this.firewallId = resource.attrFirewallId;
  }

  public addLogging(config: cdk.aws_networkfirewall.CfnLoggingConfiguration.LoggingConfigurationProperty) {
    new cdk.aws_networkfirewall.CfnLoggingConfiguration(this, 'LoggingConfig', {
      firewallArn: this.firewallArn,
      loggingConfiguration: config,
    });
  }

  public addNetworkFirewallRoute(
    id: string,
    destination: string,
    endpointAz: string,
    logGroupKmsKey: cdk.aws_kms.Key,
    logRetentionInDays: number,
    routeTableId: string,
  ): void {
    // Get endpoint ID from custom resource
    const vpcEndpointId = new GetNetworkFirewallEndpoint(this, `${id}Endpoint`, {
      endpointAz: endpointAz,
      firewallArn: this.firewallArn,
      kmsKey: logGroupKmsKey,
      logRetentionInDays: logRetentionInDays,
      region: cdk.Stack.of(this).region,
    }).endpointId;

    new cdk.aws_ec2.CfnRoute(this, id, {
      routeTableId,
      destinationCidrBlock: destination,
      vpcEndpointId,
    });
  }
}
