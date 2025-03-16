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

import {
  DescribeTransitGatewayAttachmentsCommand,
  DescribeVpnConnectionsCommand,
  EC2Client,
  TransitGatewayAttachment,
} from '@aws-sdk/client-ec2';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

interface TgwAttachmentOptions {
  /**
   * The transit gateway attachment type
   */
  readonly attachmentType: string;
  /**
   * Invoking account ID for the custom resource
   */
  readonly invokingAccountId: string;
  /**
   * Invoking region for the custom resource
   */
  readonly invokingRegion: string;
  /**
   * The name of the TGW attachment
   */
  readonly name: string;
  /**
   * Custom resource partition
   */
  readonly partition: string;
  /**
   * The owning account ID if looking up a cross-account VPC attachment
   */
  readonly vpcOwningAccountId: string;
  /**
   * The transit gateway ID
   */
  readonly transitGatewayId: string;
  /**
   * The role ARN to assume if looking up a cross-account VPC attachment
   */
  readonly vpcLookupRoleArn?: string;
  /**
   * Determine if this is logic is handling the same account and region for accepter side on
   * a Transit Gateway Peering Attachment.
   */
  readonly isSameAccountRegionAccepter?: boolean;
  /**
   * Cross-account lookup options
   *
   * @remarks
   * These options should only be used for cross-account VPN attachment
   * lookups. Currently the only use case is for dynamic EC2 firewall
   * VPN connections
   */
  readonly crossAccountVpnOptions?: {
    /**
     * Owning account ID of the VPN attachment
     */
    readonly owningAccountId?: string;
    /**
     * Owning region of the VPN attachment
     */
    readonly owningRegion?: string;
    /**
     * Role name to assume
     */
    readonly roleName?: string;
  };
}

/**
 * get-transit-gateway-attachment - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const options = setOptions(event.ResourceProperties, event.ServiceToken);
  const ec2Client = await setEc2Client(options, process.env['SOLUTION_ID']);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          ec2Client.send(
            new DescribeTransitGatewayAttachmentsCommand({
              Filters: [{ Name: 'resource-type', Values: [options.attachmentType] }],
              NextToken: nextToken,
            }),
          ),
        );
        for (const attachment of page.TransitGatewayAttachments ?? []) {
          if (
            attachment.TransitGatewayId === options.transitGatewayId &&
            attachment.State === 'available' &&
            (await validateAttachment(
              attachment,
              options.name,
              options.attachmentType,
              options.transitGatewayId,
              ec2Client,
            ))
          ) {
            return {
              PhysicalResourceId: attachment.TransitGatewayAttachmentId,
              Status: 'SUCCESS',
            };
          }
          // Logic for same region and account for TGW peering attachment as acceptor side attachment
          // doesn't contain the Accelerator tag.
          else if (options.isSameAccountRegionAccepter) {
            if (
              attachment.TransitGatewayId === options.transitGatewayId &&
              attachment.State === 'available' &&
              attachment.ResourceType === 'peering' &&
              attachment.Tags &&
              attachment.Tags.find(tag => tag.Key !== 'Accelerator')
            ) {
              return {
                PhysicalResourceId: attachment.TransitGatewayAttachmentId,
                Status: 'SUCCESS',
              };
            }
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      throw new Error(`Attachment ${options.name} for ${options.transitGatewayId} not found`);

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Validates whether or not the attachment ID is valid based on the lookup request metadata
 * @param attachment TransitGatewayAttachment
 * @param name string
 * @param attachmentType string
 * @param tgwId string
 * @param ec2Client EC2Client
 * @returns Promise<boolean>
 */
async function validateAttachment(
  attachment: TransitGatewayAttachment,
  name: string,
  attachmentType: string,
  tgwId: string,
  ec2Client: EC2Client,
): Promise<boolean> {
  switch (attachmentType) {
    case 'vpc':
    case 'peering':
      const nameTag = attachment.Tags?.find(t => t.Key === 'Name');
      if (nameTag && nameTag.Value === name) {
        return true;
      }
      return false;

    case 'vpn':
      try {
        const vpnResponse = await throttlingBackOff(() =>
          ec2Client.send(
            new DescribeVpnConnectionsCommand({
              Filters: [
                { Name: 'tag:Name', Values: [name] },
                { Name: 'transit-gateway-id', Values: [tgwId] },
                { Name: 'state', Values: ['available'] },
              ],
            }),
          ),
        );

        if (vpnResponse.VpnConnections) {
          if (vpnResponse.VpnConnections.length > 1) {
            throw new Error(`Multiple VPN connections found with name ${name} connected to TGW ${tgwId}`);
          }
          if (vpnResponse.VpnConnections.length === 0) {
            throw new Error(`No VPN connections found with name ${name} connected to TGW ${tgwId}`);
          }
          if (vpnResponse.VpnConnections[0].VpnConnectionId === attachment.ResourceId) {
            return true;
          }
        }
        return false;
      } catch (e) {
        throw new Error(`Unable to find VPN attachment ${name}: ${e}`);
      }
  }
  return false;
}

/**
 * Set TGW attachment lookup options based on event
 * @param resourceProperties { [key: string]: any }
 * @param serviceToken string
 * @returns TgwAttachmentOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOptions(resourceProperties: { [key: string]: any }, serviceToken: string): TgwAttachmentOptions {
  return {
    attachmentType: resourceProperties['type'],
    invokingAccountId: serviceToken.split(':')[4],
    invokingRegion: serviceToken.split(':')[3],
    name: resourceProperties['name'],
    partition: serviceToken.split(':')[1],
    transitGatewayId: resourceProperties['transitGatewayId'],
    vpcOwningAccountId: resourceProperties['owningAccountId'],
    vpcLookupRoleArn: resourceProperties['roleArn'],
    crossAccountVpnOptions: resourceProperties['crossAccountVpnOptions'],
  };
}

/**
 * Returns a local or cross-account/cross-region EC2 client based on input parameters
 * @param options TgwAttachmentOptions
 * @param solutionId string | undefined
 * @returns Promise<EC2Client>
 */
async function setEc2Client(options: TgwAttachmentOptions, solutionId?: string): Promise<EC2Client> {
  const roleArn = options.vpcLookupRoleArn
    ? options.vpcLookupRoleArn
    : `arn:${options.partition}:iam::${options.crossAccountVpnOptions?.owningAccountId}:role/${options.crossAccountVpnOptions?.roleName}`;
  const stsClient = new STSClient({ region: options.invokingRegion, customUserAgent: solutionId });

  if (options.vpcLookupRoleArn) {
    return await setVpcLookupEc2Client(stsClient, roleArn, solutionId);
  } else if (options.crossAccountVpnOptions) {
    return await setCrossAccountVpnEc2Client(stsClient, roleArn, options, solutionId);
  } else {
    return new EC2Client({ customUserAgent: solutionId });
  }
}

/**
 * Returns STS credentials for a given role ARN
 * @param stsClient STSClient
 * @param roleArn string
 * @returns `Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }>`
 */
async function getStsCredentials(
  stsClient: STSClient,
  roleArn: string,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }> {
  console.log(`Assuming role ${roleArn}...`);
  try {
    const response = await throttlingBackOff(() =>
      stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'AcceleratorAssumeRole' })),
    );
    //
    // Validate response
    if (!response.Credentials?.AccessKeyId) {
      throw new Error(`Access key ID not returned from AssumeRole command`);
    }
    if (!response.Credentials.SecretAccessKey) {
      throw new Error(`Secret access key not returned from AssumeRole command`);
    }
    if (!response.Credentials.SessionToken) {
      throw new Error(`Session token not returned from AssumeRole command`);
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
    };
  } catch (e) {
    throw new Error(`Could not assume role: ${e}`);
  }
}

/**
 * Returns a local or cross-account EC2 client for VPC attachment lookups based on input parameters
 * @param stsClient STSClient
 * @param roleArn string
 * @param solutionId string | undefined
 * @returns Promise<EC2Client>
 */
async function setVpcLookupEc2Client(stsClient: STSClient, roleArn: string, solutionId?: string): Promise<EC2Client> {
  const credentials = await getStsCredentials(stsClient, roleArn);

  return new EC2Client({
    customUserAgent: solutionId,
    credentials,
  });
}

/**
 * Returns a local or cross-account/cross-region EC2 client for cross-account VPN attachment lookups based on input parameters
 * @param stsClient STSClient
 * @param roleArn string
 * @param options TgwAttachmentOptions
 * @param solutionId string | undefined
 * @returns Promise<EC2Client>
 */
async function setCrossAccountVpnEc2Client(
  stsClient: STSClient,
  roleArn: string,
  options: TgwAttachmentOptions,
  solutionId?: string,
): Promise<EC2Client> {
  if (options.crossAccountVpnOptions?.owningAccountId && options.crossAccountVpnOptions?.owningRegion) {
    if (!options.crossAccountVpnOptions?.roleName) {
      throw new Error(`Cross-account VPN attachment lookup required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return EC2 client
    return new EC2Client({
      region: options.crossAccountVpnOptions.owningRegion,
      customUserAgent: solutionId,
      credentials,
    });
  } else if (options.crossAccountVpnOptions?.owningAccountId && !options.crossAccountVpnOptions?.owningRegion) {
    if (!options.crossAccountVpnOptions?.roleName) {
      throw new Error(`Cross-account VPN attachment lookup required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return EC2 client
    return new EC2Client({
      region: options.invokingRegion,
      customUserAgent: solutionId,
      credentials,
    });
  } else {
    return new EC2Client({
      region: options.crossAccountVpnOptions?.owningRegion ?? options.invokingRegion,
      customUserAgent: solutionId,
    });
  }
}
