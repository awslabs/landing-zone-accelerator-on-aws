/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { AseaResourceType, CfnResourceType } from '@aws-accelerator/config';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { pascalCase } from 'pascal-case';
import { SsmResourceType } from '@aws-accelerator/utils';

const VPN_CONNECTION_TYPE = 'AWS::EC2::VPNConnection';

/**
 * Adopts Site-to-Site VPN connections originally created by ASEA (via `firewalls[type=CGW]`).
 *
 * The VPN is attached directly to the ASEA Transit Gateway. During migration it survives
 * functionally (its TGW route-table associations/propagations remain live) but is not
 * represented in `aseaResources.json` or `network-config.yaml`, so LZA cannot reference the
 * attachment for TGW route-table association/propagation (issue #4883).
 *
 * The CloudFormation resource is already adopted into the LZA-managed stack by the
 * {@link ImportAseaResourcesStack} `CfnInclude`. This handler writes the LZA SSM parameter
 * (`/network/vpnConnection/<name>/id`) with the VPN connection id -- matching exactly what the
 * native create path writes in `network-prep-stack/vpn-resources.ts` -- and records the VPN in
 * the ASEA resource mapping. Recording it in the mapping is what lets `isManagedByAsea` suppress
 * native recreation of the adopted VPN.
 *
 * Note: the `tgw-associations-and-propagations` module resolves the VPN's TGW attachment at
 * runtime via `DescribeVpnConnections`/`DescribeTransitGatewayAttachments` matched on the Name
 * tag, not by reading this SSM parameter. The parameter is written for parity with the native
 * create path (and for any consumer that references it by name), not because the lookup depends
 * on it.
 */
export class VpnConnections extends AseaResource {
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    this.processVpnConnections();
  }

  /**
   * Adopt each ASEA VPN connection: write its LZA SSM parameter and record it in the mapping.
   */
  public processVpnConnections(): void {
    const existingVpnConnections = this.scope.importStackResources.getResourcesByType(VPN_CONNECTION_TYPE);
    if (existingVpnConnections.length === 0) {
      return;
    }
    for (const existingVpnConnection of existingVpnConnections) {
      const vpnConnectionName = this.getNameFromTags(existingVpnConnection);
      if (!vpnConnectionName) {
        this.scope.addLogs(
          LogLevel.WARN,
          `Skipping ASEA VPN Connection ${existingVpnConnection.logicalResourceId} - no Name tag found`,
        );
        continue;
      }
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpnConnectionName)}VpnConnection`),
        parameterName: this.scope.getSsmPath(SsmResourceType.TGW_VPN, [vpnConnectionName]),
        stringValue: existingVpnConnection.physicalResourceId!,
      });
      this.scope.addAseaResource(AseaResourceType.VPN_CONNECTION, vpnConnectionName);
    }
  }

  private getNameFromTags(resource: CfnResourceType, tagName = 'Name'): string | undefined {
    const tags = resource.resourceMetadata['Properties']?.Tags as { Key: string; Value: string }[] | undefined;
    return tags?.find(tag => tag.Key === tagName)?.Value;
  }
}
