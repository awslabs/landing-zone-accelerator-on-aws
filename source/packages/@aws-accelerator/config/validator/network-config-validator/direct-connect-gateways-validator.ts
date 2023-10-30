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

import { DxGatewayConfig, DxVirtualInterfaceConfig, NetworkConfig } from '../../lib/network-config';

/**
 * Class to validate direct connect gateways
 */
export class DirectConnectGatewaysValidator {
  constructor(values: NetworkConfig, errors: string[]) {
    //
    // Validate DX gateway configurations
    //
    this.validateDxConfiguration(values, errors);
  }

  /**
   * Function to validate peer IP addresses for virtual interfaces.
   * @param dxgw
   * @param vif
   */
  private validateDxVirtualInterfaceAddresses(dxgw: DxGatewayConfig, vif: DxVirtualInterfaceConfig, errors: string[]) {
    // Catch error if one peer IP is defined and not the other
    if (vif.amazonAddress && !vif.customerAddress) {
      errors.push(
        `[Direct Connect Gateway ${dxgw.name}]: Amazon peer IP defined but customer peer IP undefined for ${vif.name}`,
      );
    }
    if (!vif.amazonAddress && vif.customerAddress) {
      errors.push(
        `[Direct Connect Gateway ${dxgw.name}]: Customer peer IP defined but Amazon peer IP undefined for ${vif.name}`,
      );
    }
    // Catch error if addresses match
    if (vif.amazonAddress && vif.customerAddress) {
      if (vif.amazonAddress === vif.customerAddress) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: Amazon peer IP and customer peer IP match for ${vif.name}`);
      }
    }
  }

  /**
   * Function to validate DX virtual interface configurations.
   * @param dxgw
   */
  private validateDxVirtualInterfaces(dxgw: DxGatewayConfig, errors: string[]) {
    for (const vif of dxgw.virtualInterfaces ?? []) {
      // Catch error for private VIFs with transit gateway associations
      if (vif.type === 'private' && dxgw.transitGatewayAssociations) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: cannot specify private virtual interface ${vif.name} with transit gateway associations`,
        );
      }
      // Catch error if ASNs match
      if (dxgw.asn === vif.customerAsn) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: Amazon ASN and customer ASN match for ${vif.name}`);
      }
      // Catch error if ASN is not in the correct range
      if (vif.customerAsn < 1 || vif.customerAsn > 2147483647) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: ASN ${vif.customerAsn} out of range 1-2147483647 for virtual interface ${vif.name}`,
        );
      }
      // Catch error if VIF VLAN is not in range
      if (vif.vlan < 1 || vif.vlan > 4094) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: VLAN ${vif.vlan} out of range 1-4094 for virtual interface ${vif.name}`,
        );
      }
      // Validate peer IP addresses
      this.validateDxVirtualInterfaceAddresses(dxgw, vif, errors);
    }
  }

  /**
   * Function to validate DX gateway transit gateway assocations.
   * @param values
   * @param dxgw
   */
  private validateDxTransitGatewayAssociations(values: NetworkConfig, dxgw: DxGatewayConfig, errors: string[]) {
    for (const tgwAssociation of dxgw.transitGatewayAssociations ?? []) {
      const tgw = values.transitGateways.find(
        item => item.name === tgwAssociation.name && item.account === tgwAssociation.account,
      );
      // Catch error if TGW isn't found
      if (!tgw) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: cannot find matching transit gateway for TGW association ${tgwAssociation.name}`,
        );
      }
      // Catch error if ASNs match
      if (tgw!.asn === dxgw.asn) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: DX Gateway ASN and TGW ASN match for ${tgw!.name}`);
      }
      // Catch error if TGW and DXGW account don't match and associations/propagations are configured
      if (tgw!.account !== dxgw.account) {
        if (tgwAssociation.routeTableAssociations || tgwAssociation.routeTablePropagations) {
          errors.push(
            `[Direct Connect Gateway ${dxgw.name}]: DX Gateway association proposals cannot have TGW route table associations or propagations defined`,
          );
        }
      }
    }
  }

  /**
   * Function to validate DX gateway configurations.
   * @param values
   */
  private validateDxConfiguration(values: NetworkConfig, errors: string[]) {
    for (const dxgw of values.directConnectGateways ?? []) {
      // Validate virtual interfaces
      this.validateDxVirtualInterfaces(dxgw, errors);
      // Validate transit gateway attachments
      this.validateDxTransitGatewayAssociations(values, dxgw, errors);
    }
  }
}
