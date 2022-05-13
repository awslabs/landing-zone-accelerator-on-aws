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

export class NetworkFirewallPolicy extends cdk.Resource implements INetworkFirewallPolicy {
  public readonly policyArn: string;
  public readonly policyId: string;
  public readonly policyName: string;
  private firewallPolicy: cdk.aws_networkfirewall.CfnFirewallPolicy.FirewallPolicyProperty;
  private customActions?: cdk.aws_networkfirewall.CfnFirewallPolicy.CustomActionProperty[];
  private statefulOptions?: cdk.aws_networkfirewall.CfnFirewallPolicy.StatefulEngineOptionsProperty;

  constructor(scope: Construct, id: string, props: NetworkFirewallPolicyProps) {
    super(scope, id);

    // Set initial properties
    this.policyName = props.name;

    // Transform properties as necessary
    if (props.firewallPolicy.statelessCustomActions) {
      this.transformCustom(props.firewallPolicy);
    }
    if (props.firewallPolicy.statefulEngineOptions) {
      this.transformEngineOptions(props.firewallPolicy);
    }

    // Set firewall policy property
    this.firewallPolicy = {
      statelessDefaultActions: props.firewallPolicy.statelessDefaultActions,
      statelessFragmentDefaultActions: props.firewallPolicy.statelessFragmentDefaultActions,
      statefulDefaultActions: props.firewallPolicy.statefulDefaultActions,
      statefulEngineOptions: this.statefulOptions,
      statefulRuleGroupReferences: props.firewallPolicy.statefulRuleGroupReferences,
      statelessCustomActions: this.customActions,
      statelessRuleGroupReferences: props.firewallPolicy.statelessRuleGroupReferences,
    };

    // Set name tag
    props.tags?.push({ key: 'Name', value: this.policyName });

    const resource = new cdk.aws_networkfirewall.CfnFirewallPolicy(this, 'Resource', {
      firewallPolicy: this.firewallPolicy,
      firewallPolicyName: this.policyName,
      description: props.description,
      tags: props.tags,
    });

    this.policyArn = resource.ref;
    this.policyId = resource.attrFirewallPolicyId;
  }

  /**
   * Transform custom actions to conform with L1 construct.
   *
   * @param props
   */
  private transformCustom(props: FirewallPolicyProperty) {
    const property = props.statelessCustomActions;
    this.customActions = [];

    for (const action of property ?? []) {
      this.customActions.push({
        actionDefinition: {
          publishMetricAction: {
            dimensions: action.actionDefinition.publishMetricAction.dimensions.map(item => {
              return { value: item };
            }),
          },
        },
        actionName: action.actionName,
      });
    }
  }

  /**
   * Transform engine options to conform with L1 construct.
   *
   * @param props
   */
  private transformEngineOptions(props: FirewallPolicyProperty) {
    const property = props.statefulEngineOptions;

    if (property) {
      this.statefulOptions = { ruleOrder: property };
    }
  }
}
