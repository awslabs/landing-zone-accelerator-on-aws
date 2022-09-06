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

import { VirtualInterfaceAttributes } from './attributes';

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
  const dx = new AWS.DirectConnect({ region: event.ResourceProperties['region'] });

  // Event handler
  switch (event.RequestType) {
    case 'Create':
      let virtualInterfaceId: string | undefined;
      // Create interfaces if based on interface type
      if (vif.virtualInterfaceType === 'private') {
        const response = await createPrivateInterface(
          dx,
          apiProps as AWS.DirectConnect.CreatePrivateVirtualInterfaceRequest,
        );
        virtualInterfaceId = response.virtualInterfaceId;
      }

      if (vif.virtualInterfaceType === 'transit') {
        const response = await createTransitInterface(
          dx,
          apiProps as AWS.DirectConnect.CreateTransitVirtualInterfaceRequest,
        );
        virtualInterfaceId = response.virtualInterface?.virtualInterfaceId;
      }

      if (!virtualInterfaceId) {
        throw new Error(`Unable to create virtual interface.`);
      }

      return {
        PhysicalResourceId: virtualInterfaceId,
        Status: 'SUCCESS',
      };

    case 'Update':
      // Validate new VIF attributes against existing
      const oldVif = oldVifInit(event);
      validateUpdateEvent(vif, oldVif);

      // Determine tag updates
      const vifArn = generateVifArn(event);
      await processTagUpdates(dx, vifArn, vif, oldVif);

      // Update attributes if necessary
      if (vif.virtualInterfaceName !== oldVif.virtualInterfaceName) {
        console.log(
          `Updating virtual interface name from ${oldVif.virtualInterfaceName} to ${vif.virtualInterfaceName}`,
        );
        await throttlingBackOff(() =>
          dx
            .updateVirtualInterfaceAttributes({
              virtualInterfaceId: event.PhysicalResourceId,
              virtualInterfaceName: vif.virtualInterfaceName,
            })
            .promise(),
        );
      }
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
function vifInit(event: AWSLambda.CloudFormationCustomResourceEvent): VirtualInterfaceAttributes {
  // Set variables from event
  const addressFamily: string = event.ResourceProperties['addressFamily'];
  const amazonAddress: string | undefined = event.ResourceProperties['amazonAddress'];
  const asn: number = event.ResourceProperties['customerAsn'];
  const connectionId: string = event.ResourceProperties['connectionId'];
  const customerAddress: string | undefined = event.ResourceProperties['customerAddress'];
  const directConnectGatewayId: string = event.ResourceProperties['directConnectGatewayId'];
  const jumboFrames: boolean | undefined = returnBoolean(event.ResourceProperties['jumboFrames']);
  const siteLink: boolean | undefined = returnBoolean(event.ResourceProperties['enableSiteLink']);
  const virtualInterfaceName: string = event.ResourceProperties['interfaceName'];
  const virtualInterfaceType: 'private' | 'transit' = event.ResourceProperties['type'];
  const vlan: number = event.ResourceProperties['vlan'];
  const tags: AWS.DirectConnect.TagList = event.ResourceProperties['tags'] ?? [];

  // Add Name tag
  tags.push({ key: 'Name', value: virtualInterfaceName });

  return new VirtualInterfaceAttributes({
    addressFamily,
    amazonAddress,
    asn,
    connectionId,
    customerAddress,
    directConnectGatewayId,
    jumboFrames: jumboFrames ?? false,
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
  vif: VirtualInterfaceAttributes,
): AWS.DirectConnect.CreatePrivateVirtualInterfaceRequest | AWS.DirectConnect.CreateTransitVirtualInterfaceRequest {
  // Set API props based on virtual interface type
  let apiProps:
    | AWS.DirectConnect.CreatePrivateVirtualInterfaceRequest
    | AWS.DirectConnect.CreateTransitVirtualInterfaceRequest;
  const attributes = {
    asn: vif.asn,
    virtualInterfaceName: vif.virtualInterfaceName,
    vlan: vif.vlan,
    addressFamily: vif.addressFamily,
    amazonAddress: vif.amazonAddress,
    customerAddress: vif.customerAddress,
    directConnectGatewayId: vif.directConnectGatewayId,
    enableSiteLink: vif.siteLink,
    mtu: vif.mtu,
    tags: vif.tags,
  };

  switch (vif.virtualInterfaceType) {
    case 'private':
      apiProps = {
        connectionId: vif.connectionId,
        newPrivateVirtualInterface: attributes,
      };

      return apiProps;

    case 'transit':
      apiProps = {
        connectionId: vif.connectionId,
        newTransitVirtualInterface: attributes,
      };

      return apiProps;
  }
}

/**
 * Initialize the old virtual interface attributes object
 * @param event
 * @returns
 */
function oldVifInit(event: AWSLambda.CloudFormationCustomResourceUpdateEvent) {
  // Set variables from event
  const addressFamily: string = event.OldResourceProperties['addressFamily'];
  const amazonAddress: string | undefined = event.OldResourceProperties['amazonAddress'];
  const asn: number = event.OldResourceProperties['customerAsn'];
  const connectionId: string = event.OldResourceProperties['connectionId'];
  const customerAddress: string | undefined = event.OldResourceProperties['customerAddress'];
  const directConnectGatewayId: string = event.OldResourceProperties['directConnectGatewayId'];
  const jumboFrames: boolean | undefined = returnBoolean(event.OldResourceProperties['jumboFrames']);
  const siteLink: boolean | undefined = returnBoolean(event.OldResourceProperties['enableSiteLink']);
  const virtualInterfaceName: string = event.OldResourceProperties['interfaceName'];
  const virtualInterfaceType: 'private' | 'transit' = event.OldResourceProperties['type'];
  const vlan: number = event.OldResourceProperties['vlan'];
  const tags: AWS.DirectConnect.TagList = event.OldResourceProperties['tags'] ?? [];

  // Add Name tag
  tags.push({ key: 'Name', value: virtualInterfaceName });

  return new VirtualInterfaceAttributes({
    addressFamily,
    amazonAddress,
    asn,
    connectionId,
    customerAddress,
    directConnectGatewayId,
    jumboFrames: jumboFrames ?? false,
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
function validateUpdateEvent(vif: VirtualInterfaceAttributes, oldVif: VirtualInterfaceAttributes) {
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

async function createPrivateInterface(
  dx: AWS.DirectConnect,
  apiProps: AWS.DirectConnect.CreatePrivateVirtualInterfaceRequest,
) {
  return throttlingBackOff(() => dx.createPrivateVirtualInterface(apiProps).promise());
}

async function createTransitInterface(
  dx: AWS.DirectConnect,
  apiProps: AWS.DirectConnect.CreateTransitVirtualInterfaceRequest,
) {
  return throttlingBackOff(() => dx.createTransitVirtualInterface(apiProps).promise());
}

function generateVifArn(event: AWSLambda.CloudFormationCustomResourceUpdateEvent): string {
  const accountId = event.ServiceToken.split(':')[4];
  const partition = event.ServiceToken.split(':')[1];
  const region = event.ResourceProperties['region'];
  const vifId = event.PhysicalResourceId;

  return `arn:${partition}:directconnect:${region}:${accountId}:dxvif/${vifId}`;
}

async function processTagUpdates(
  dx: AWS.DirectConnect,
  resourceArn: string,
  vif: VirtualInterfaceAttributes,
  oldVif: VirtualInterfaceAttributes,
): Promise<void> {
  // Filter tags to remove
  let removeTagKeys: AWS.DirectConnect.TagKeyList = [];
  if (vif.tags && oldVif.tags) {
    const updateTagKeys = vif.tags.map(item => {
      return item.key;
    });
    const oldTagKeys = oldVif.tags.map(item => {
      return item.key;
    });
    removeTagKeys = oldTagKeys.filter(item => !updateTagKeys.includes(item));
  }

  // Update tags as necessary
  if (vif.tags && vif.tags.length > 0) {
    await throttlingBackOff(() => dx.tagResource({ resourceArn, tags: vif.tags! }).promise());
  }

  if (removeTagKeys.length > 0) {
    await throttlingBackOff(() => dx.untagResource({ resourceArn, tagKeys: removeTagKeys }).promise());
  }
}

function returnBoolean(input: string): boolean | undefined {
  try {
    return JSON.parse(input.toLowerCase());
  } catch (e) {
    return undefined;
  }
}
