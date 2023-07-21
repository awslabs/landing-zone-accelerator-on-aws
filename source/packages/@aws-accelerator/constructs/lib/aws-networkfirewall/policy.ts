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

import { NfwRuleSourceCustomActionConfig } from '@aws-accelerator/config';
import { transformPolicy } from './utils';

interface INetworkFirewallPolicy extends cdk.IResource {
  /**
   * The Amazon Resource Name (ARN) of the policy.
   */
  readonly policyArn: string;

  /**
   * The ID of the policy.
   */
  readonly policyId: string;

  /**
   * The name of the policy.
   */
  readonly policyName: string;
}

interface StatefulRuleGroupReference {
  resourceArn: string;
  priority?: number;
}

interface StatelessRuleGroupReference {
  priority: number;
  resourceArn: string;
}

export interface FirewallPolicyProperty {
  statelessDefaultActions: string[];
  statelessFragmentDefaultActions: string[];
  statefulDefaultActions?: string[];
  statefulEngineOptions?: string;
  statefulRuleGroupReferences?: StatefulRuleGroupReference[];
  statelessCustomActions?: NfwRuleSourceCustomActionConfig[];
  statelessRuleGroupReferences?: StatelessRuleGroupReference[];
}

interface NetworkFirewallPolicyProps {
  /**
   * The traffic filtering behavior of a firewall policy, defined in a collection of stateless and stateful rule groups and other settings.
   */
  readonly firewallPolicy: FirewallPolicyProperty;

  /**
   * The descriptive name of the firewall policy.
   */
  readonly name: string;

  /**
   * A description of the firewall policy.
   */
  readonly description?: string;

  /**
   * An optional list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

abstract class NetworkFirewallPolicyBase extends cdk.Resource implements INetworkFirewallPolicy {
  public abstract readonly policyArn: string;
  public abstract readonly policyId: string;
  public abstract readonly policyName: string;
}

export class NetworkFirewallPolicy extends NetworkFirewallPolicyBase {
  public readonly policyArn: string;
  public readonly policyId: string;
  public readonly policyName: string;

  /**
   * Returns CfnFirewallPolicy by applying updates to included resource
   * @param scope Stack in which included FirewallPolicy is created/managed
   * @param id logicalId of FirewallPolicy
   * @param attrs
   */
  static includedCfnResource(
    scope: cdk.cloudformation_include.CfnInclude,
    id: string,
    props: NetworkFirewallPolicyProps,
  ) {
    const resource = scope.getResource(id) as cdk.aws_networkfirewall.CfnFirewallPolicy;
    // Transform properties as necessary
    resource.firewallPolicy = transformPolicy(props.firewallPolicy);
    resource.description = props.description;
    return resource;
  }

  static fromAttributes(
    scope: Construct,
    id: string,
    attrs: { policyArn: string; policyName: string },
  ): INetworkFirewallPolicy {
    class Import extends NetworkFirewallPolicyBase {
      public readonly policyArn = attrs.policyArn;
      public readonly policyName = attrs.policyName;
      // policyId is not used anywhere. Need to store in SSM if needed
      public readonly policyId = '';

      constructor(scope: Construct, id: string) {
        super(scope, id);
      }
    }
    return new Import(scope, id);
  }

  constructor(scope: Construct, id: string, props: NetworkFirewallPolicyProps) {
    super(scope, id);

    // Set initial properties
    this.policyName = props.name;

    // Set firewall policy property
    const firewallPolicy = transformPolicy(props.firewallPolicy);

    // Set name tag
    props.tags?.push({ key: 'Name', value: this.policyName });

    const resource = new cdk.aws_networkfirewall.CfnFirewallPolicy(this, 'Resource', {
      firewallPolicy: firewallPolicy,
      firewallPolicyName: this.policyName,
      description: props.description,
      tags: props.tags,
    });

    this.policyArn = resource.ref;
    this.policyId = resource.attrFirewallPolicyId;
  }
}
