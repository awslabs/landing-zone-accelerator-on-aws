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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * delete-default-vpc - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const requesterAccountId = event.ResourceProperties['requesterAccountId'];
  const requesterRegion = event.ResourceProperties['requesterRegion'];
  const requesterTransitGatewayRouteTableId = event.ResourceProperties['requesterTransitGatewayRouteTableId'];

  const accepterAccountId = event.ResourceProperties['accepterAccountId'];
  const accepterRegion = event.ResourceProperties['accepterRegion'];
  const accepterTransitGatewayId = event.ResourceProperties['accepterTransitGatewayId'];
  const accepterTransitGatewayRouteTableId = event.ResourceProperties['accepterTransitGatewayRouteTableId'];

  const autoAccept: boolean = event.ResourceProperties['autoAccept'] === 'true';
  const peeringTags: { Key: string; Value: string }[] | undefined = event.ResourceProperties['peeringTags'];

  const requesterTransitGatewayAttachmentId = event.ResourceProperties['requesterTransitGatewayAttachmentId'];

  const solutionId = process.env['SOLUTION_ID'];

  const requesterEc2Client = new AWS.EC2({ region: requesterRegion });

  const accepterEc2Client = await getAccepterEc2Client(
    accepterRegion,
    event.ResourceProperties['accepterRoleArn'],
    solutionId,
  );

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const accepterTransitGatewayAttachmentId = await getAccepterTransitGatewayAttachmentID(
        accepterEc2Client,
        accepterTransitGatewayId,
        accepterAccountId,
        requesterTransitGatewayAttachmentId,
      );

      if (autoAccept) {
        console.log(`Starting - Transit Gateway Peering attachment acceptance`);

        let attachmentStatus = await getAttachmentState(requesterEc2Client, requesterTransitGatewayAttachmentId);

        await checkAttachmentInvalidStateForAcceptance(requesterEc2Client, requesterTransitGatewayAttachmentId);

        while (attachmentStatus !== 'pendingAcceptance' && attachmentStatus !== 'available') {
          await delay(1000);
          console.log(
            `Waiting for transit gateway attachment id ${requesterTransitGatewayAttachmentId} to be in pendingAcceptance or available state in requester account ${requesterAccountId}, current state is : ${attachmentStatus}`,
          );
          attachmentStatus = await getAttachmentState(requesterEc2Client, requesterTransitGatewayAttachmentId);
          await checkAttachmentInvalidStateForAcceptance(requesterEc2Client, requesterTransitGatewayAttachmentId);
        }

        console.log(
          `Attachment state is : ${attachmentStatus} in requester account ${requesterAccountId} for transit gateway attachment id ${requesterTransitGatewayAttachmentId}, proceeding with acceptTransitGatewayPeeringAttachment operation in accepter account ${accepterAccountId}`,
        );

        if (!accepterTransitGatewayAttachmentId) {
          throw new Error(
            `Transit gateway attachment id not found in accepter account ${accepterAccountId} for requester transit gateway attachment id ${requesterTransitGatewayAttachmentId}`,
          );
        }

        attachmentStatus = await getAttachmentState(accepterEc2Client, accepterTransitGatewayAttachmentId);

        await checkAttachmentInvalidStateForAcceptance(accepterEc2Client, accepterTransitGatewayAttachmentId);

        while (attachmentStatus !== 'pendingAcceptance' && attachmentStatus !== 'available') {
          await delay(1000);
          console.log(
            `Waiting for transit gateway attachment id ${accepterTransitGatewayAttachmentId} to be in pendingAcceptance or available state in accepter account ${accepterAccountId}, current state is : ${attachmentStatus}`,
          );
          attachmentStatus = await getAttachmentState(accepterEc2Client, accepterTransitGatewayAttachmentId);
          await checkAttachmentInvalidStateForAcceptance(accepterEc2Client, accepterTransitGatewayAttachmentId);
        }

        if (attachmentStatus !== 'available') {
          console.log(
            `Attachment state is : ${attachmentStatus} in accepter account ${accepterAccountId} for transit gateway attachment id ${accepterTransitGatewayAttachmentId}, proceeding with acceptTransitGatewayPeeringAttachment operation`,
          );

          const response = await throttlingBackOff(() =>
            accepterEc2Client
              .acceptTransitGatewayPeeringAttachment({ TransitGatewayAttachmentId: accepterTransitGatewayAttachmentId })
              .promise(),
          );

          console.log(
            `Transit gateway attachment id ${accepterTransitGatewayAttachmentId} acceptTransitGatewayPeeringAttachment operation completed in accepter account ${accepterAccountId}, waiting to be in available state, current state is ${response.TransitGatewayPeeringAttachment?.State}`,
          );

          attachmentStatus = await getAttachmentState(accepterEc2Client, accepterTransitGatewayAttachmentId);
          while (attachmentStatus !== 'available') {
            await delay(60000);
            console.log(
              `Waiting for attachment id ${accepterTransitGatewayAttachmentId} in accepter account ${accepterAccountId} to be in available state, current state is : ${attachmentStatus}`,
            );
            attachmentStatus = await getAttachmentState(accepterEc2Client, accepterTransitGatewayAttachmentId);
          }
        } else {
          console.log(
            `Attachment state is : ${attachmentStatus} in accepter account ${accepterAccountId} for transit gateway attachment id ${accepterTransitGatewayAttachmentId}, acceptTransitGatewayPeeringAttachment operation not needed`,
          );
        }
      }
      console.log(`Starting route table association`);

      // Associate requester attachment to route table
      await associateTransitGatewayRouteTable(
        requesterAccountId,
        requesterTransitGatewayAttachmentId,
        requesterTransitGatewayRouteTableId,
        requesterEc2Client,
      );

      if (accepterTransitGatewayAttachmentId) {
        // Associate accepter attachment to route table
        await associateTransitGatewayRouteTable(
          accepterAccountId,
          accepterTransitGatewayAttachmentId,
          accepterTransitGatewayRouteTableId,
          accepterEc2Client,
        );

        // Create tags in accepter attachment
        await createAccepterAttachmentTags(accepterEc2Client, accepterTransitGatewayAttachmentId, peeringTags);
      }

      return {
        PhysicalResourceId: requesterTransitGatewayAttachmentId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Function to associate transit gateway route table
 * @param account
 * @param transitGatewayAttachmentId
 * @param transitGatewayRouteTableId
 * @param ec2Client
 */
async function associateTransitGatewayRouteTable(
  account: string,
  transitGatewayAttachmentId: string,
  transitGatewayRouteTableId: string,
  ec2Client: AWS.EC2,
): Promise<void> {
  console.log(
    `In Account ${account}: Start of associateTransitGatewayRouteTable, for transitGateway attachment ${transitGatewayAttachmentId} with route table ${transitGatewayRouteTableId}`,
  );

  // Get attachment association information
  const attachmentAssociation = await getAttachmentAssociation(ec2Client, transitGatewayAttachmentId, account);

  //
  // When NO association found OR given route table disassociated
  // Then associate the route table
  if (
    !attachmentAssociation ||
    (attachmentAssociation.State === 'disassociated' &&
      attachmentAssociation.TransitGatewayRouteTableId === transitGatewayRouteTableId)
  ) {
    console.log(
      `Start: Association of transitGateway attachment ${transitGatewayAttachmentId} to route table ${transitGatewayRouteTableId}, in account ${account}`,
    );
    const response = await throttlingBackOff(() =>
      ec2Client
        .associateTransitGatewayRouteTable({
          TransitGatewayAttachmentId: transitGatewayAttachmentId,
          TransitGatewayRouteTableId: transitGatewayRouteTableId,
        })
        .promise(),
    );
    console.log(
      `Completed: Association of transitGateway attachment ${transitGatewayAttachmentId} to route table ${transitGatewayRouteTableId}, in account ${account}, association state is ${response.Association?.State}`,
    );
  } else if (
    attachmentAssociation.State === 'associated' &&
    attachmentAssociation.TransitGatewayRouteTableId !== transitGatewayRouteTableId
  ) {
    // When association found but update requested to change associated route table
    // Disassociate current route table and associate to given route table

    console.log(
      `Route table ${attachmentAssociation.TransitGatewayRouteTableId} already associated with transit gateway attachment ${transitGatewayAttachmentId} in account ${account}`,
    );
    console.log(
      `Start: disassociation of route table ${attachmentAssociation.TransitGatewayRouteTableId} from transit gateway attachment ${transitGatewayAttachmentId} in account ${account}`,
    );
    const disassociationResponse = await throttlingBackOff(() =>
      ec2Client
        .disassociateTransitGatewayRouteTable({
          TransitGatewayAttachmentId: transitGatewayAttachmentId,
          TransitGatewayRouteTableId: attachmentAssociation.TransitGatewayRouteTableId!,
        })
        .promise(),
    );
    console.log(
      `Completed: disassociation of route table ${attachmentAssociation.TransitGatewayRouteTableId} from transit gateway attachment ${transitGatewayAttachmentId} in account ${account}, association state is ${disassociationResponse.Association?.State}`,
    );

    console.log(
      `Start: Re-association of transitGateway attachment ${transitGatewayAttachmentId} to route table ${transitGatewayRouteTableId}, in account ${account}`,
    );

    let reAssociationStatus = await reAssociateRouteTable(
      ec2Client,
      transitGatewayAttachmentId,
      transitGatewayRouteTableId,
      account,
    );

    // Disassociation takes time so sleep and try to re-associate
    while (!reAssociationStatus) {
      console.log(
        'Re-association failed because disassociation still in-progress, sleeping 1 minute before starting again',
      );
      await delay(60000);
      reAssociationStatus = await reAssociateRouteTable(
        ec2Client,
        transitGatewayAttachmentId,
        transitGatewayRouteTableId,
        account,
      );
    }
  }
}

/**
 * Function to re-associate route table
 * @param ec2Client
 * @param transitGatewayAttachmentId
 * @param transitGatewayRouteTableId
 * @param account
 * @returns
 */
async function reAssociateRouteTable(
  ec2Client: AWS.EC2,
  transitGatewayAttachmentId: string,
  transitGatewayRouteTableId: string,
  account: string,
): Promise<boolean> {
  try {
    const associateResponse = await throttlingBackOff(() =>
      ec2Client
        .associateTransitGatewayRouteTable({
          TransitGatewayAttachmentId: transitGatewayAttachmentId,
          TransitGatewayRouteTableId: transitGatewayRouteTableId,
        })
        .promise(),
    );
    console.log(
      `Completed: Re-association of transitGateway attachment ${transitGatewayAttachmentId} to route table ${transitGatewayRouteTableId}, in account ${account}, association state is ${associateResponse.Association?.State}`,
    );
    return true;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (
      // SDKv2 Error Structure
      e.code === 'Resource.AlreadyAssociated' ||
      // SDKv3 Error Structure
      e.name === 'Resource.AlreadyAssociated'
    ) {
      return false;
    }
    throw new Error(e);
  }
}

/**
 * Function to get accepter transit gateway attachment id
 * @param ec2Client
 * @param accepterTransitGatewayId
 * @param accepterAccountId
 * @param requesterTransitGatewayAttachmentId
 * @returns
 */
async function getAccepterTransitGatewayAttachmentID(
  ec2Client: AWS.EC2,
  accepterTransitGatewayId: string,
  accepterAccountId: string,
  requesterTransitGatewayAttachmentId: string,
): Promise<string | undefined> {
  const response = await throttlingBackOff(() =>
    ec2Client
      .describeTransitGatewayAttachments({
        Filters: [
          { Name: 'resource-type', Values: ['peering'] },
          { Name: 'transit-gateway-id', Values: [accepterTransitGatewayId] },
          {
            Name: 'state',
            Values: ['pendingAcceptance', 'pending', 'initiatingRequest', 'initiating', 'modifying', 'available'],
          },
        ],
      })
      .promise(),
  );
  if (response.TransitGatewayAttachments) {
    if (response.TransitGatewayAttachments.length === 1) {
      return response.TransitGatewayAttachments[0].TransitGatewayAttachmentId;
    }

    if (response.TransitGatewayAttachments.length === 0) {
      throw new Error(
        `Transit gateway attachment id not found in accepter account ${accepterAccountId} for requester transit gateway attachment id ${requesterTransitGatewayAttachmentId}`,
      );
    }

    if (response.TransitGatewayAttachments.length > 1) {
      const id: string[] = [];
      for (const item of response.TransitGatewayAttachments) {
        id.push(item.TransitGatewayAttachmentId!);
      }
      throw new Error(
        `Multiple transit gateway attachment ids ${id} found in accepter account ${accepterAccountId} for requester transit gateway attachment id ${requesterTransitGatewayAttachmentId}`,
      );
    }
  }
  return undefined;
}

/**
 * Function to get attachment status
 * @param transitGatewayAttachmentId
 * @param ec2Client
 * @returns
 */
async function getAttachmentState(
  ec2Client: AWS.EC2,
  transitGatewayAttachmentId: string,
): Promise<AWS.EC2.TransitGatewayAttachmentState | undefined> {
  const response = await throttlingBackOff(() =>
    ec2Client
      .describeTransitGatewayPeeringAttachments({
        Filters: [{ Name: 'transit-gateway-attachment-id', Values: [transitGatewayAttachmentId] }],
      })
      .promise(),
  );

  if (response.TransitGatewayPeeringAttachments?.length === 1) {
    console.log(
      `Transit gateway attachment ${transitGatewayAttachmentId} state is ${response.TransitGatewayPeeringAttachments[0].State}`,
    );
    return response.TransitGatewayPeeringAttachments[0].State;
  }

  return undefined;
}

/**
 * Function to check for Invalid attachment state for acceptance
 * @param ec2Client
 * @param transitGatewayAttachmentId
 */
async function checkAttachmentInvalidStateForAcceptance(
  ec2Client: AWS.EC2,
  transitGatewayAttachmentId: string,
): Promise<void> {
  const response = await throttlingBackOff(() =>
    ec2Client
      .describeTransitGatewayPeeringAttachments({
        Filters: [{ Name: 'transit-gateway-attachment-id', Values: [transitGatewayAttachmentId] }],
      })
      .promise(),
  );

  if (response.TransitGatewayPeeringAttachments?.length === 1) {
    if (
      response.TransitGatewayPeeringAttachments[0].State === 'failed' ||
      response.TransitGatewayPeeringAttachments[0].State === 'failing' ||
      response.TransitGatewayPeeringAttachments[0].State === 'deleted' ||
      response.TransitGatewayPeeringAttachments[0].State === 'deleting' ||
      response.TransitGatewayPeeringAttachments[0].State === 'rejected' ||
      response.TransitGatewayPeeringAttachments[0].State === 'rejecting' ||
      response.TransitGatewayPeeringAttachments[0].State === 'rollingBack'
    ) {
      throw new Error(
        `Transit gateway attachment ${transitGatewayAttachmentId} in ${response.TransitGatewayPeeringAttachments[0].State}, acceptance of attachment can not be performed !!!`,
      );
    }
  }
}

/**
 * Function to get transit gateway attachment associated route table id
 * @param ec2Client
 * @param transitGatewayAttachmentId
 * @param account
 * @returns
 */
async function getAttachmentAssociation(
  ec2Client: AWS.EC2,
  transitGatewayAttachmentId: string,
  account: string,
): Promise<AWS.EC2.TransitGatewayAttachmentAssociation | undefined> {
  const response = await throttlingBackOff(() =>
    ec2Client
      .describeTransitGatewayAttachments({
        Filters: [
          { Name: 'resource-type', Values: ['peering'] },
          { Name: 'transit-gateway-attachment-id', Values: [transitGatewayAttachmentId] },
        ],
      })
      .promise(),
  );

  if (response.TransitGatewayAttachments) {
    if (response.TransitGatewayAttachments.length === 1) {
      return response.TransitGatewayAttachments[0].Association;
    } else if (response.TransitGatewayAttachments.length === 0) {
      return undefined;
    } else {
      throw new Error(
        `Multiple transit gateway attachments ${transitGatewayAttachmentId} found in account ${account} !!!`,
      );
    }
  } else {
    throw new Error(`Transit gateway attachment ${transitGatewayAttachmentId} not found in account ${account} !!!`);
  }
}

/**
 * Function to create tags for accepter transit gateway peering attachment
 * @param ec2Client
 * @param accepterTransitGatewayAttachmentId
 */
async function createAccepterAttachmentTags(
  ec2Client: AWS.EC2,
  accepterTransitGatewayAttachmentId: string,
  peeringTags: { Key: string; Value: string }[] | undefined,
): Promise<void> {
  const tags: { Key: string; Value: string }[] = [];

  if (peeringTags) {
    for (const peeringTag of peeringTags ?? []) {
      tags.push(peeringTag as { Key: string; Value: string });
    }

    if (tags.length > 0) {
      await throttlingBackOff(() =>
        ec2Client
          .createTags({
            Resources: [accepterTransitGatewayAttachmentId],
            Tags: tags,
          })
          .promise(),
      );
    }
  }
}

/**
 * Function to create accepter EC2 client
 * @param accepterRegion
 * @param accepterRoleArn
 * @returns
 */
async function getAccepterEc2Client(
  accepterRegion: string,
  accepterRoleArn: string,
  solutionId?: string,
): Promise<AWS.EC2> {
  const stsClient = new AWS.STS({ customUserAgent: solutionId, region: accepterRegion });

  const assumeRoleResponse = await throttlingBackOff(() =>
    stsClient
      .assumeRole({
        RoleArn: accepterRoleArn,
        RoleSessionName: 'AccepterTransitGatewayAttachmentSession',
      })
      .promise(),
  );

  return new AWS.EC2({
    credentials: {
      accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
      secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
      sessionToken: assumeRoleResponse.Credentials?.SessionToken,
    },
    region: accepterRegion,
  });
}

/**
 * Function to sleep process
 * @param ms
 * @returns
 */
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
