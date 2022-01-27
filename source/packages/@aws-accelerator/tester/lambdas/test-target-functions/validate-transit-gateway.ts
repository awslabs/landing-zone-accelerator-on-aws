/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
  EC2Client,
  paginateDescribeTransitGatewayRouteTables,
  paginateDescribeTransitGatewayAttachments,
  paginateDescribeTransitGateways,
  TransitGateway,
} from '@aws-sdk/client-ec2';
import { throttlingBackOff } from '@aws-accelerator/utils';
import { AssumeRoleCommand, Credentials, STSClient } from '@aws-sdk/client-sts';

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
  managementAccount: { partition: string; id: string; crossAccountRoleName: string; credential: Credentials },
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

  let eC2Client: EC2Client;

  // Assume role when transit gateway to be evaluated in other account than config account
  if (managementAccount.id !== transitGatewayAccountId) {
    const roleArn = `arn:${managementAccount.partition}:iam::${transitGatewayAccountId}:role/${managementAccount.crossAccountRoleName}`;
    const stsClient = new STSClient({
      region: configRegion,
      credentials: {
        accessKeyId: managementAccount.credential.AccessKeyId!,
        secretAccessKey: managementAccount.credential.SecretAccessKey!,
        sessionToken: managementAccount.credential.SessionToken,
        expiration: managementAccount.credential.Expiration,
      },
    });

    const response = await throttlingBackOff(() =>
      stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'acceleratorAssumeRoleSession' })),
    );

    eC2Client = new EC2Client({
      region: transitGatewayRegion,
      credentials: {
        accessKeyId: response.Credentials!.AccessKeyId!,
        secretAccessKey: response.Credentials!.SecretAccessKey!,
        expiration: response.Credentials!.Expiration,
        sessionToken: response.Credentials!.SessionToken,
      },
    });
  } else {
    eC2Client = new EC2Client({
      region: transitGatewayRegion,
      credentials: {
        accessKeyId: managementAccount.credential.AccessKeyId!,
        secretAccessKey: managementAccount.credential.SecretAccessKey!,
        sessionToken: managementAccount.credential.SessionToken,
        expiration: managementAccount.credential.Expiration,
      },
    });
  }

  const complianceResourceType = 'AWS::EC2::TransitGateway';
  let complianceResourceId = transitGatewayAccountId;
  let complianceType = ComplianceType.Non_Compliant;

  for await (const tgwPage of paginateDescribeTransitGateways({ client: eC2Client }, {})) {
    for (const transitGateway of tgwPage.TransitGateways ?? []) {
      if (
        await transitGatewayExists(
          transitGateway,
          transitGatewayName,
          parseInt(amazonSideAsn ?? 0),
          dnsSupport,
          vpnEcmpSupport,
          autoAcceptSharingAttachments,
          defaultRouteTableAssociation,
          defaultRouteTablePropagation,
        )
      ) {
        complianceResourceId = transitGateway.TransitGatewayId!;
        if (
          (await isRouteTablesValid(
            eC2Client,
            transitGateway.TransitGatewayId!,
            defaultRouteTableAssociation,
            defaultRouteTablePropagation,
            routeTableNames ?? [],
          )) &&
          (await isTransitGatewayAttachmentsValid(
            eC2Client,
            transitGateway.TransitGatewayId!,
            shareTargetAccountIds ?? [],
          ))
        ) {
          // set compliance
          complianceType = ComplianceType.Compliant;
        }
      }
    }
  }
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
  amazonSideAsn: number,
  dnsSupport: string | undefined,
  vpnEcmpSupport: string | undefined,
  autoAcceptSharedAttachments: string | undefined,
  defaultRouteTableAssociation: string | undefined,
  defaultRouteTablePropagation: string | undefined,
): Promise<boolean> {
  if (
    transitGateway.Options!.AmazonSideAsn ===
      (amazonSideAsn !== 0 ? amazonSideAsn : transitGateway.Options!.AmazonSideAsn) &&
    transitGateway.Options!.DnsSupport === (dnsSupport ?? transitGateway.Options!.DnsSupport) &&
    transitGateway.Options!.VpnEcmpSupport === (vpnEcmpSupport ?? transitGateway.Options!.VpnEcmpSupport) &&
    transitGateway.Options!.AutoAcceptSharedAttachments ===
      (autoAcceptSharedAttachments ?? transitGateway.Options!.AutoAcceptSharedAttachments) &&
    transitGateway.Options!.DefaultRouteTableAssociation ===
      (defaultRouteTableAssociation ?? transitGateway.Options!.DefaultRouteTableAssociation) &&
    transitGateway.Options!.DefaultRouteTablePropagation ===
      (defaultRouteTablePropagation ?? transitGateway.Options!.DefaultRouteTablePropagation)
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
 * @param eC2Client
 * @param transitGatewayId
 * @param defaultRouteTableAssociation
 * @param defaultRouteTablePropagation
 * @param validatingRouteTableNames
 */
async function isRouteTablesValid(
  eC2Client: EC2Client,
  transitGatewayId: string,
  defaultRouteTableAssociation: string | undefined,
  defaultRouteTablePropagation: string | undefined,
  validatingRouteTableNames: string[],
): Promise<boolean> {
  const presentRouteTableNames: string[] = [];
  for await (const page of paginateDescribeTransitGatewayRouteTables({ client: eC2Client }, {})) {
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
  }
  return validatingRouteTableNames.length === 0
    ? true
    : areArraysEqual(validatingRouteTableNames.sort(), presentRouteTableNames.sort());
}

/**
 * Function to validate transit gateway attachments
 * @param eC2Client
 * @param transitGatewayId
 * @param shareTargetAccountIds
 */
async function isTransitGatewayAttachmentsValid(
  eC2Client: EC2Client,
  transitGatewayId: string,
  shareTargetAccountIds: string[],
): Promise<boolean> {
  const resourceOwnerIds: string[] = [];
  for await (const page of paginateDescribeTransitGatewayAttachments({ client: eC2Client }, {})) {
    for (const transitGatewayAttachment of page.TransitGatewayAttachments ?? []) {
      if (
        transitGatewayAttachment.TransitGatewayId === transitGatewayId &&
        transitGatewayAttachment.State === 'available'
      ) {
        resourceOwnerIds.push(transitGatewayAttachment.ResourceOwnerId!);
      }
    }
  }
  return shareTargetAccountIds.length === 0
    ? true
    : areArraysEqual(shareTargetAccountIds.sort(), resourceOwnerIds.sort());
}
