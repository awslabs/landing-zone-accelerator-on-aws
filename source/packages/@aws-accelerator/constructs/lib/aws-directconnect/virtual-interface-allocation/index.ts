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

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

import { VirtualInterfaceAllocationAttributes } from './attributes';

/**
 * direct-connect-virtual-interface - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  // Set variables
  const vif = vifInit(event);
  const apiProps = setApiProps(vif);
  const dx = new AWS.DirectConnect({
    region: event.ResourceProperties['region'],
    customUserAgent: process.env['SOLUTION_ID'],
  });

  // Event handler
  switch (event.RequestType) {
    case 'Create':
      let virtualInterfaceId: string | undefined;
      // Create allocations depending on interface type
      if (vif.virtualInterfaceType === 'private') {
        const response = await createPrivateAllocation(
          dx,
          apiProps as AWS.DirectConnect.AllocatePrivateVirtualInterfaceRequest,
        );
        virtualInterfaceId = response.virtualInterfaceId;
      }

      if (vif.virtualInterfaceType === 'transit') {
        const response = await createTransitAllocation(
          dx,
          apiProps as AWS.DirectConnect.AllocateTransitVirtualInterfaceRequest,
        );
        virtualInterfaceId = response.virtualInterface?.virtualInterfaceId;
      }

      if (!virtualInterfaceId) {
        throw new Error(`Unable to create virtual interface allocation.`);
      }

      return {
        PhysicalResourceId: virtualInterfaceId,
        Status: 'SUCCESS',
      };

    case 'Update':
      // Validate new VIF attributes against existing
      const oldVif = oldVifInit(event);
      validateUpdateEvent(vif, oldVif);

      // Update attributes
      if (vif.mtu !== oldVif.mtu) {
        console.log(`Updating ${vif.virtualInterfaceName} MTU from ${oldVif.mtu.toString()} to ${vif.mtu.toString()}`);
        await throttlingBackOff(() =>
          dx
            .updateVirtualInterfaceAttributes({
              virtualInterfaceId: event.PhysicalResourceId,
              mtu: vif.mtu,
            })
            .promise(),
        );
      }
      if (vif.siteLink !== oldVif.siteLink) {
        console.log(`Updating ${vif.virtualInterfaceName} SiteLink from ${oldVif.siteLink} to ${vif.siteLink}`);
        await throttlingBackOff(() =>
          dx
            .updateVirtualInterfaceAttributes({
              virtualInterfaceId: event.PhysicalResourceId,
              enableSiteLink: vif.siteLink,
            })
            .promise(),
        );
      }

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        dx.deleteVirtualInterface({ virtualInterfaceId: event.PhysicalResourceId }).promise(),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Initialize the virtual interface attributes object
 * @param event
 */
function vifInit(event: AWSLambda.CloudFormationCustomResourceEvent): VirtualInterfaceAllocationAttributes {
  // Set variables from event
  const addressFamily: string = event.ResourceProperties['addressFamily'];
  const amazonAddress: string | undefined = event.ResourceProperties['amazonAddress'];
  const asn: number = event.ResourceProperties['customerAsn'];
  const connectionId: string = event.ResourceProperties['connectionId'];
  const customerAddress: string | undefined = event.ResourceProperties['customerAddress'];
  const jumboFrames: boolean | undefined = returnBoolean(event.ResourceProperties['jumboFrames']);
  const ownerAccount: string = event.ResourceProperties['ownerAccount'];
  const siteLink: boolean | undefined = returnBoolean(event.ResourceProperties['enableSiteLink']);
  const virtualInterfaceName: string = event.ResourceProperties['interfaceName'];
  const virtualInterfaceType: 'private' | 'transit' = event.ResourceProperties['type'];
  const vlan: number = event.ResourceProperties['vlan'];
  const tags: AWS.DirectConnect.TagList = event.ResourceProperties['tags'] ?? [];

  // Add Name tag
  tags.push({ key: 'Name', value: virtualInterfaceName });

  return new VirtualInterfaceAllocationAttributes({
    addressFamily,
    amazonAddress,
    asn,
    connectionId,
    customerAddress,
    jumboFrames: jumboFrames ?? false,
    ownerAccount,
    siteLink: siteLink ?? false,
    virtualInterfaceName,
    virtualInterfaceType,
    vlan,
    tags,
  });
}

/**
 * Set API props based on properties passed in to the custom resource
 * @param event
 */
function setApiProps(
  vif: VirtualInterfaceAllocationAttributes,
): AWS.DirectConnect.AllocatePrivateVirtualInterfaceRequest | AWS.DirectConnect.AllocateTransitVirtualInterfaceRequest {
  // Set API props based on virtual interface type
  let apiProps:
    | AWS.DirectConnect.AllocatePrivateVirtualInterfaceRequest
    | AWS.DirectConnect.AllocateTransitVirtualInterfaceRequest;
  switch (vif.virtualInterfaceType) {
    case 'private':
      const newPrivateVirtualInterfaceAllocation = {
        asn: vif.asn,
        virtualInterfaceName: vif.virtualInterfaceName,
        vlan: vif.vlan,
        addressFamily: vif.addressFamily,
        amazonAddress: vif.amazonAddress,
        customerAddress: vif.customerAddress,
        mtu: vif.mtu,
        tags: vif.tags,
      };

      apiProps = {
        connectionId: vif.connectionId,
        ownerAccount: vif.ownerAccount,
        newPrivateVirtualInterfaceAllocation,
      };
      return apiProps;

    case 'transit':
      const newTransitVirtualInterfaceAllocation = {
        asn: vif.asn,
        virtualInterfaceName: vif.virtualInterfaceName,
        vlan: vif.vlan,
        addressFamily: vif.addressFamily,
        amazonAddress: vif.amazonAddress,
        customerAddress: vif.customerAddress,
        mtu: vif.mtu,
        tags: vif.tags,
      };

      apiProps = {
        connectionId: vif.connectionId,
        ownerAccount: vif.ownerAccount,
        newTransitVirtualInterfaceAllocation,
      };
      return apiProps;
  }
}

/**
 * Initialize the virtual interface attributes object
 * @param event
 */
function oldVifInit(event: AWSLambda.CloudFormationCustomResourceUpdateEvent): VirtualInterfaceAllocationAttributes {
  // Set variables from event
  const addressFamily: string = event.OldResourceProperties['addressFamily'];
  const amazonAddress: string | undefined = event.OldResourceProperties['amazonAddress'];
  const asn: number = event.OldResourceProperties['customerAsn'];
  const connectionId: string = event.OldResourceProperties['connectionId'];
  const customerAddress: string | undefined = event.OldResourceProperties['customerAddress'];
  const jumboFrames: boolean | undefined = returnBoolean(event.OldResourceProperties['jumboFrames']);
  const ownerAccount: string = event.OldResourceProperties['ownerAccount'];
  const siteLink: boolean | undefined = returnBoolean(event.OldResourceProperties['enableSiteLink']);
  const virtualInterfaceName: string = event.OldResourceProperties['interfaceName'];
  const virtualInterfaceType: 'private' | 'transit' = event.OldResourceProperties['type'];
  const vlan: number = event.OldResourceProperties['vlan'];
  const tags: AWS.DirectConnect.TagList = event.OldResourceProperties['tags'] ?? [];

  // Add Name tag
  tags.push({ key: 'Name', value: virtualInterfaceName });

  return new VirtualInterfaceAllocationAttributes({
    addressFamily,
    amazonAddress,
    asn,
    connectionId,
    customerAddress,
    jumboFrames: jumboFrames ?? false,
    ownerAccount,
    siteLink: siteLink ?? false,
    virtualInterfaceName,
    virtualInterfaceType,
    vlan,
    tags,
  });
}

/**
 * Compare VIF attribute objects and throw errors for invalid update requests
 * @param vif
 * @param oldVif
 */
function validateUpdateEvent(vif: VirtualInterfaceAllocationAttributes, oldVif: VirtualInterfaceAllocationAttributes) {
  // Error validation
  if (vif.addressFamily !== oldVif.addressFamily) {
    console.warn('Address family cannot be updated. Please delete and recreate the virtual interface instead.');
  }
  if (vif.amazonAddress !== oldVif.amazonAddress || vif.customerAddress !== oldVif.customerAddress) {
    console.warn('Cannot update peer IP addresses. Please delete and recreate the virtual interface instead.');
  }
  if (vif.asn !== oldVif.asn) {
    console.warn('Cannot update customer ASN. Please delete and recreate the virtual interface instead.');
  }
  if (vif.vlan !== oldVif.vlan) {
    console.warn('Cannot update the VLAN tag. Please delete and recreate the virtual interface instead.');
  }
}

async function createPrivateAllocation(
  dx: AWS.DirectConnect,
  apiProps: AWS.DirectConnect.AllocatePrivateVirtualInterfaceRequest,
) {
  return throttlingBackOff(() => dx.allocatePrivateVirtualInterface(apiProps).promise());
}

async function createTransitAllocation(
  dx: AWS.DirectConnect,
  apiProps: AWS.DirectConnect.AllocateTransitVirtualInterfaceRequest,
) {
  return throttlingBackOff(() => dx.allocateTransitVirtualInterface(apiProps).promise());
}

function returnBoolean(input: string): boolean | undefined {
  try {
    return JSON.parse(input.toLowerCase());
  } catch (e) {
    return undefined;
  }
}
