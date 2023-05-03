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

import { AcceleratorStackProps } from '../../accelerator-stack';
import { IpamResources } from './ipam-resources';
import { NetworkPrepStack } from './network-prep-stack';
import { NfwResources } from './nfw-resources';
import { ResolverResources } from './resolver-resources';

export class CentralNetworkResources {
  public readonly ipamResources: IpamResources;
  public readonly nfwResources: NfwResources;
  public readonly resolverResources: ResolverResources;
  private stack: NetworkPrepStack;

  constructor(networkPrepStack: NetworkPrepStack, props: AcceleratorStackProps, orgId?: string) {
    this.stack = networkPrepStack;

    // Retrieve central network config and delegated admin account ID
    const centralConfig = props.networkConfig.centralNetworkServices!;
    const delegatedAdminAccountId = props.accountsConfig.getAccountId(centralConfig.delegatedAdminAccount);

    // Create IPAM resources
    this.ipamResources = new IpamResources(
      this.stack,
      delegatedAdminAccountId,
      centralConfig,
      props.globalConfig.homeRegion,
      props.prefixes.ssmParamName,
      orgId,
    );
    // Create Route 53 resolver resources
    this.resolverResources = new ResolverResources(this.stack, delegatedAdminAccountId, centralConfig, props, orgId);
    // Create network firewall resources
    this.nfwResources = new NfwResources(this.stack, delegatedAdminAccountId, centralConfig, props);
  }
}
