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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { Credentials } from '@aws-sdk/client-sts';
import {
  EC2Client,
  DescribeTransitGatewaysCommand,
  DescribeTransitGatewayRouteTablesCommand,
  DescribeTransitGatewayAttachmentsCommand,
  TransitGateway,
} from '@aws-sdk/client-ec2';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
/**
 * Config rule compliance value enum
 */
const enum ComplianceType {
  Compliant = 'COMPLIANT',
  Non_Compliant = 'NON_COMPLIANT',
}

/**
 * "validateTransitGateway" test target. Function to validate Transit Gateway.
 * Validates following:
 * <ul>
 * <li>Transit gateway exists
 * <li>Transit gateway has valid route tables
 * <li>Transit gateway attachment accounts are valid
 * </ul>
 * @param configRegion {string}
 * @param managementAccount {Object}
 * @param parameters {string}
 */
export async function validateTransitGateway(
  configRegion: string,
  managementAccount: {
    partition: string;
    id: string;
    crossAccountRoleName: string;
    credentials: Credentials;
  },
  parameters: string,
): Promise<{ complianceResourceType: string; complianceResourceId: string; complianceType: string }> {
  const transitGatewayName = parameters['name'];
  const transitGatewayAccountId = parameters['accountId'];
  const transitGatewayRegion = parameters['region'];
  const amazonSideAsn = parameters['amazonSideAsn'];
  const dnsSupport = parameters['dnsSupport'];
  const vpnEcmpSupport = parameters['vpnEcmpSupport'];
  const autoAcceptSharingAttachments = parameters['autoAcceptSharingAttachments'];
  const defaultRouteTableAssociation = parameters['defaultRouteTableAssociation'];
  const defaultRouteTablePropagation = parameters['defaultRouteTablePropagation'];
  const routeTableNames = parameters['routeTableNames'];
  const shareTargetAccountIds = parameters['shareTargetAccountIds'];

  let ec2Client: EC2Client;

  // Assume role when transit gateway to be evaluated in other account than config account
  if (managementAccount.id !== transitGatewayAccountId) {
    const roleArn = `arn:${managementAccount.partition}:iam::${transitGatewayAccountId}:role/${managementAccount.crossAccountRoleName}`;

    ec2Client = new EC2Client({
      region: transitGatewayRegion,
      retryStrategy: setRetryStrategy(),
      credentials: fromTemporaryCredentials({
        params: {
          RoleArn: roleArn,
          RoleSessionName: 'lza-validate-transit-gateway',
        },
        clientConfig: { retryStrategy: setRetryStrategy(), region: configRegion },
      }),
    });
  } else {
    ec2Client = new EC2Client({
      region: transitGatewayRegion,
      retryStrategy: setRetryStrategy(),
      credentials: {
        accessKeyId: managementAccount.credentials.AccessKeyId!,
        secretAccessKey: managementAccount.credentials.SecretAccessKey!,
        sessionToken: managementAccount.credentials.SessionToken!,
      },
    });
  }

  const complianceResourceType = 'AWS::EC2::TransitGateway';
  let complianceResourceId = transitGatewayAccountId;
  let complianceType = ComplianceType.Non_Compliant;

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      ec2Client.send(new DescribeTransitGatewaysCommand({ NextToken: nextToken })),
    );
    for (const transitGateway of page.TransitGateways ?? []) {
      if (
        await transitGatewayExists(transitGateway, transitGatewayName, {
          amazonSideAsn: parseInt(amazonSideAsn ?? 0),
          dnsSupport,
          vpnEcmpSupport,
          autoAcceptSharedAttachments: autoAcceptSharingAttachments,
          defaultRouteTableAssociation,
          defaultRouteTablePropagation,
        })
      ) {
        complianceResourceId = transitGateway.TransitGatewayId!;
        if (
          (await isRouteTablesValid(
            ec2Client,
            transitGateway.TransitGatewayId!,
            defaultRouteTableAssociation,
            defaultRouteTablePropagation,
            routeTableNames ?? [],
          )) &&
          (await isTransitGatewayAttachmentsValid(
            ec2Client,
            transitGateway.TransitGatewayId!,
            shareTargetAccountIds ?? [],
          ))
        ) {
          // set compliance
          complianceType = ComplianceType.Compliant;
        }
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return {
    complianceResourceType: complianceResourceType,
    complianceResourceId: complianceResourceId,
    complianceType: complianceType,
  };
}

/**
 * Function to check if two arrays are exactly same with number of item and the position
 * @param first
 * @param second
 */
function areArraysEqual(first: string[], second: string[]) {
  return (
    Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((val, index) => val === second[index])
  );
}

/**
 * Function to check if transit gateway exists
 * @param transitGateway
 * @param validatingTransitGatewayName
 * @param amazonSideAsn
 * @param dnsSupport
 * @param vpnEcmpSupport
 * @param autoAcceptSharedAttachments
 * @param defaultRouteTableAssociation
 * @param defaultRouteTablePropagation
 */
async function transitGatewayExists(
  transitGateway: TransitGateway,
  validatingTransitGatewayName: string,
  props: {
    amazonSideAsn: number;
    dnsSupport: string | undefined;
    vpnEcmpSupport: string | undefined;
    autoAcceptSharedAttachments: string | undefined;
    defaultRouteTableAssociation: string | undefined;
    defaultRouteTablePropagation: string | undefined;
  },
): Promise<boolean> {
  if (
    transitGateway.Options!.AmazonSideAsn ===
      (props.amazonSideAsn !== 0 ? props.amazonSideAsn : transitGateway.Options!.AmazonSideAsn) &&
    transitGateway.Options!.DnsSupport === (props.dnsSupport ?? transitGateway.Options!.DnsSupport) &&
    transitGateway.Options!.VpnEcmpSupport === (props.vpnEcmpSupport ?? transitGateway.Options!.VpnEcmpSupport) &&
    transitGateway.Options!.AutoAcceptSharedAttachments ===
      (props.autoAcceptSharedAttachments ?? transitGateway.Options!.AutoAcceptSharedAttachments) &&
    transitGateway.Options!.DefaultRouteTableAssociation ===
      (props.defaultRouteTableAssociation ?? transitGateway.Options!.DefaultRouteTableAssociation) &&
    transitGateway.Options!.DefaultRouteTablePropagation ===
      (props.defaultRouteTablePropagation ?? transitGateway.Options!.DefaultRouteTablePropagation)
  ) {
    for (const tag of transitGateway.Tags ?? []) {
      if (tag.Key === 'Name' && tag.Value === validatingTransitGatewayName) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Function to validate transit gateway route tables
 * @param ec2Client
 * @param transitGatewayId
 * @param defaultRouteTableAssociation
 * @param defaultRouteTablePropagation
 * @param validatingRouteTableNames
 */
async function isRouteTablesValid(
  ec2Client: EC2Client,
  transitGatewayId: string,
  defaultRouteTableAssociation: string | undefined,
  defaultRouteTablePropagation: string | undefined,
  validatingRouteTableNames: string[],
): Promise<boolean> {
  const presentRouteTableNames: string[] = [];

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      ec2Client.send(new DescribeTransitGatewayRouteTablesCommand({ NextToken: nextToken })),
    );
    for (const transitGatewayRouteTable of page.TransitGatewayRouteTables ?? []) {
      if (
        transitGatewayRouteTable.TransitGatewayId === transitGatewayId &&
        transitGatewayRouteTable.State === 'available' &&
        transitGatewayRouteTable.DefaultAssociationRouteTable ===
          ((defaultRouteTableAssociation ?? transitGatewayRouteTable.DefaultAssociationRouteTable) === 'enable') &&
        transitGatewayRouteTable.DefaultPropagationRouteTable ===
          ((defaultRouteTablePropagation ?? transitGatewayRouteTable.DefaultPropagationRouteTable) === 'enable')
      ) {
        for (const tag of transitGatewayRouteTable.Tags ?? []) {
          if (tag.Key === 'Name') {
            presentRouteTableNames.push(tag.Value!);
          }
        }
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  validatingRouteTableNames.sort();
  presentRouteTableNames.sort();
  return validatingRouteTableNames.length === 0
    ? true
    : areArraysEqual(validatingRouteTableNames, presentRouteTableNames);
}

/**
 * Function to validate transit gateway attachments
 * @param ec2Client
 * @param transitGatewayId
 * @param shareTargetAccountIds
 */
async function isTransitGatewayAttachmentsValid(
  ec2Client: EC2Client,
  transitGatewayId: string,
  shareTargetAccountIds: string[],
): Promise<boolean> {
  const resourceOwnerIds: string[] = [];

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      ec2Client.send(new DescribeTransitGatewayAttachmentsCommand({ NextToken: nextToken })),
    );
    for (const transitGatewayAttachment of page.TransitGatewayAttachments ?? []) {
      if (
        transitGatewayAttachment.TransitGatewayId === transitGatewayId &&
        transitGatewayAttachment.State === 'available'
      ) {
        resourceOwnerIds.push(transitGatewayAttachment.ResourceOwnerId!);
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  shareTargetAccountIds.sort();
  resourceOwnerIds.sort();
  return shareTargetAccountIds.length === 0 ? true : areArraysEqual(shareTargetAccountIds, resourceOwnerIds);
}
