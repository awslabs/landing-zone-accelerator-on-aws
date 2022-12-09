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
import { FirewallProps, IFirewall, Firewall } from './firewall';

export interface IFirewallInstance extends IFirewall {
  /**
   * The instance ID of the firewall instance
   */
  readonly instanceId: string;
}

interface FirewallInstanceProps extends FirewallProps {
  /**
   * Enable detailed monitoring for the firewall instance
   */
  readonly detailedMonitoring?: boolean;
  /**
   * Enable termination protection for the firewall instance
   */
  readonly terminationProtection?: boolean;
}

export class FirewallInstance extends Firewall implements IFirewallInstance {
  public readonly instanceId: string;
  constructor(scope: Construct, id: string, props: FirewallInstanceProps) {
    super(scope, id, props);

    // Create instance
    const instance = new cdk.aws_ec2.CfnInstance(this, 'Resource', {
      launchTemplate: {
        launchTemplateId: this.launchTemplate.launchTemplateId,
        version: this.launchTemplate.version,
      },
      disableApiTermination: props.terminationProtection,
      monitoring: props.detailedMonitoring,
      tags: props.tags,
    });
    cdk.Tags.of(instance).add('Name', this.name);

    this.instanceId = instance.ref;
  }
}
