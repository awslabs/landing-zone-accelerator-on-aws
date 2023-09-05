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

import { Tag } from '@aws-sdk/client-ec2';
import * as diff from 'diff';

export interface VpnTunnelOptions {
  /**
   * DPD timeout action
   */
  readonly dpdTimeoutAction?: string;
  /**
   * DPD timeout in seconds
   */
  readonly dpdTimeoutSeconds?: number;
  /**
   * IKE versions
   */
  readonly ikeVersions?: number[];
  /**
   * VPN tunnel logging
   */
  readonly logging?: {
    readonly enable?: boolean;
    readonly logGroupArn?: string;
    readonly outputFormat?: string;
  };
  /**
   * Phase 1 config
   */
  readonly phase1?: {
    readonly dhGroups?: number[];
    readonly encryptionAlgorithms?: string[];
    readonly integrityAlgorithms?: string[];
    readonly lifetimeSeconds?: number;
  };
  /**
   * Phase 2 config
   */
  readonly phase2?: {
    readonly dhGroups?: number[];
    readonly encryptionAlgorithms?: string[];
    readonly integrityAlgorithms?: string[];
    readonly lifetimeSeconds?: number;
  };
  /**
   * A Secrets Manager secret name
   */
  readonly preSharedKey?: string;
  /**
   * IKE rekey fuzz percentage
   */
  readonly rekeyFuzzPercentage?: number;
  /**
   * IKE rekey margin time in seconds
   */
  readonly rekeyMarginTimeSeconds?: number;
  /**
   * IKE replay window size
   */
  readonly replayWindowSize?: number;
  /**
   * The startup action for the VPN connection
   */
  readonly startupAction?: string;
  /**
   * An IP address that is a size /30 CIDR block from the 169.254.0.0/16.
   */
  readonly tunnelInsideCidr?: string;
  /**
   * Enable tunnel lifecycle control
   */
  readonly tunnelLifecycleControl?: boolean;
}

/**
 * Custom deserialization interface for VPN options
 */
export interface VpnOptions {
  /**
   * Customer Gateway ID
   */
  readonly customerGatewayId: string;
  /**
   * Enable VPN acceleration
   */
  readonly enableVpnAcceleration: boolean;
  /**
   * Invoking account ID for the custom resource
   */
  readonly invokingAccountId: string;
  /**
   * Invoking region for the custom resource
   */
  readonly invokingRegion: string;
  /**
   * Custom resource partition
   */
  readonly partition: string;
  /**
   * Static routes only for the VPN connection
   */
  readonly staticRoutesOnly: boolean;
  /**
   * Amazon-side IPv4 CIDR
   */
  readonly amazonIpv4NetworkCidr?: string;
  /**
   * Customer-side IPv4 CIDR
   */
  readonly customerIpv4NetworkCidr?: string;
  /**
   * Owning account ID for cross-account customer gateways
   */
  readonly owningAccountId?: string;
  /**
   * Owning region for cross-account customer gateways
   */
  readonly owningRegion?: string;
  /**
   * Role name for cross-account customer gateways
   */
  readonly roleName?: string;
  /**
   * Tags to apply to the VPN connection
   */
  readonly tags?: Tag[];
  /**
   * The ID of the Transit Gateway to terminate the VPN Connection.
   */
  readonly transitGatewayId?: string;
  /**
   * The ID of the Virtual Private Gateway to terminate the VPN Connection.
   */
  readonly vpnGatewayId?: string;
  /**
   * The advanced tunnel options for the VPN
   */
  readonly vpnTunnelOptions?: VpnTunnelOptions[];
}

/**
 * A helper class that determines the differences between two VPN option configurations
 */
export class VpnConnectionDiff {
  /**
   * Create a new VPN connection based on options diff
   */
  public readonly createNewVpnConnection: boolean;
  /**
   * Modify VPN connection options based on diff
   */
  public readonly vpnConnectionOptionsModified: boolean;
  /**
   * Modify VPN tunnel options based on diff
   */
  public readonly vpnTunnelOptionsModified: boolean[];
  /**
   * The previous VPN options configuration
   */
  private oldVpnOptions: VpnOptions;
  /**
   * The new VPN options configuration
   */
  private newVpnOptions: VpnOptions;

  constructor(oldVpnOptions: VpnOptions, newVpnOptions: VpnOptions) {
    //
    // Set initial props
    this.oldVpnOptions = oldVpnOptions;
    this.newVpnOptions = newVpnOptions;
    //
    // Determine VPN options diff
    this.createNewVpnConnection = this.setCreateConnectionFlag(this.oldVpnOptions, this.newVpnOptions);
    this.vpnConnectionOptionsModified = this.setVpnOptionsModifiedFlag(this.oldVpnOptions, this.newVpnOptions);
    this.vpnTunnelOptionsModified = this.setTunnelOptionsModifiedFlags(this.oldVpnOptions, this.newVpnOptions);
    //
    // Validate options to update. Throw errors if more than one mutating option.
    this.validateModifications(this.vpnConnectionOptionsModified, this.vpnTunnelOptionsModified);
  }

  /**
   * Determines if a new VPN connection should be created on update
   * @param oldVpnOptions VpnOptions
   * @param newVpnOptions VpnOptions
   * @returns boolean
   */
  private setCreateConnectionFlag(oldVpnOptions: VpnOptions, newVpnOptions: VpnOptions): boolean {
    return (
      oldVpnOptions.customerGatewayId !== newVpnOptions.customerGatewayId ||
      oldVpnOptions.enableVpnAcceleration !== newVpnOptions.enableVpnAcceleration ||
      oldVpnOptions.staticRoutesOnly !== newVpnOptions.staticRoutesOnly ||
      oldVpnOptions.transitGatewayId !== newVpnOptions.transitGatewayId ||
      oldVpnOptions.vpnGatewayId !== newVpnOptions.vpnGatewayId
    );
  }

  /**
   * Determines if VPN options have been modified
   * @param oldVpnOptions VpnOptions
   * @param newVpnOptions VpnOptions
   * @returns boolean
   */
  private setVpnOptionsModifiedFlag(oldVpnOptions: VpnOptions, newVpnOptions: VpnOptions): boolean {
    return (
      oldVpnOptions.amazonIpv4NetworkCidr !== newVpnOptions.amazonIpv4NetworkCidr ||
      oldVpnOptions.customerIpv4NetworkCidr !== newVpnOptions.customerIpv4NetworkCidr
    );
  }

  /**
   * Returns an array of booleans indicating if VPN tunnel options have been modified for either tunnel
   * @param oldVpnOptions VpnOptions
   * @param newVpnOptions VpnOptions
   * @returns boolean[]
   */
  private setTunnelOptionsModifiedFlags(oldVpnOptions: VpnOptions, newVpnOptions: VpnOptions): boolean[] {
    const tunnelUpdates: boolean[] = [];

    for (const [index, tunnel] of oldVpnOptions.vpnTunnelOptions?.entries() ?? []) {
      const oldJsonOptions = JSON.stringify(tunnel);
      const newJsonOptions = JSON.stringify(newVpnOptions.vpnTunnelOptions?.[index] ?? {});
      const tunnelDiff = diff.diffJson(oldJsonOptions, newJsonOptions);
      tunnelUpdates.push(this.tunnelOptionsModified(tunnelDiff));
    }
    return tunnelUpdates;
  }

  /**
   * Searches the diff array for any changes to the tunnel options
   * @param tunnelDiff diff.Change[]
   * @returns boolean
   */
  private tunnelOptionsModified(tunnelDiff: diff.Change[]): boolean {
    for (const part of tunnelDiff) {
      if (part.added || part.removed) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate there is only one mutating VPN option
   * @param vpnOptionsUpdate boolean
   * @param vpnTunnelOptionsUpdate boolean[]
   */
  private validateModifications(connectionOptionsUpdate: boolean, tunnelOptionsUpdate: boolean[]): void {
    if (connectionOptionsUpdate && tunnelOptionsUpdate.includes(true)) {
      throw new Error(
        `
        VPN connection options and tunnel options cannot both be modified in the same pipeline run. Please revert one change and run the pipeline again. Note: you may need to continue rolling back the CloudFormation stack manually. 
        See the following reference: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-continueupdaterollback.html`,
      );
    }
    if (!connectionOptionsUpdate && tunnelOptionsUpdate[0] && tunnelOptionsUpdate[1]) {
      throw new Error(
        `
        Only one VPN tunnel option can be modified per pipeline run. Please revert one change and run the pipeline again. Note: you may need to continue rolling back the CloudFormation stack manually.
        See the following reference: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-continueupdaterollback.html`,
      );
    }
  }
}
