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

import { Construct } from 'constructs';

import { AcceleratorStackProps } from '../../accelerator-stack';
import { NetworkStack } from '../network-stack';
import { CentralNetworkResources } from './central-network-resources';
import { DxResources } from './dx-resources';
import { FmsResources } from './fms-resources';
import { MadResources } from './mad-resources';
import { TgwResources } from './tgw-resources';
import { VpnResources } from './vpn-resources';

export class NetworkPrepStack extends NetworkStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    //
    // Generate Transit Gateways and
    // Transit Gateway peering role
    //
    const tgwResources = new TgwResources(this, props);

    //
    // Create Managed active directory accept share role
    //
    new MadResources(this, props);

    //
    // Create Site-to-Site VPN connections
    //
    new VpnResources(this, tgwResources.transitGatewayMap, props);

    //
    // Create Direct Connect Gateways and virtual interfaces
    //
    new DxResources(this, props);

    //
    // Central network services
    //
    if (props.networkConfig.centralNetworkServices) {
      // Retrieve org ID
      const organizationId = this.organizationId;
      new CentralNetworkResources(this, props, organizationId);
    }
    //
    // FMS Notification Channel
    //
    new FmsResources(this, props);
    //
    // Create SSM Parameters
    //
    this.createSsmParameters();

    this.logger.info('Completed stack synthesis');
  }
}
