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

/**
 * aws-ec2-transit-gateway-prefix-list-reference - lambda handler
 *
 * @param event
 * @returns
 */

import {
  CreateTransitGatewayPrefixListReferenceCommand,
  DeleteTransitGatewayPrefixListReferenceCommand,
  EC2Client,
  ModifyTransitGatewayPrefixListReferenceCommand,
} from '@aws-sdk/client-ec2';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
interface ReferenceOptions {
  /**
   * API props
   */
  readonly props: {
    readonly PrefixListId: string;
    readonly TransitGatewayRouteTableId: string;
    readonly Blackhole?: boolean;
    readonly TransitGatewayAttachmentId?: string;
  };
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
}

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
    }
  | undefined
> {
  const options = setOptions(event.ResourceProperties, event.ServiceToken);
  const ec2Client = await setEc2Client(options, process.env['SOLUTION_ID']);

  switch (event.RequestType) {
    case 'Create':
      await throttlingBackOff(() => ec2Client.send(new CreateTransitGatewayPrefixListReferenceCommand(options.props)));

      return {
        Status: 'SUCCESS',
      };

    case 'Update':
      await throttlingBackOff(() => ec2Client.send(new ModifyTransitGatewayPrefixListReferenceCommand(options.props)));

      return {
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        ec2Client.send(
          new DeleteTransitGatewayPrefixListReferenceCommand({
            PrefixListId: options.props.PrefixListId,
            TransitGatewayRouteTableId: options.props.TransitGatewayRouteTableId,
          }),
        ),
      );

      return {
        Status: 'SUCCESS',
      };
  }
}

/**
 * Set TGW prefix list reference options based on event
 * @param resourceProperties { [key: string]: any }
 * @param serviceToken string
 * @returns ReferenceOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOptions(resourceProperties: { [key: string]: any }, serviceToken: string): ReferenceOptions {
  return {
    props: {
      PrefixListId: resourceProperties['prefixListReference']['PrefixListId'],
      TransitGatewayRouteTableId: resourceProperties['prefixListReference']['TransitGatewayRouteTableId'],
      Blackhole: resourceProperties['prefixListReference']['Blackhole'] === 'true',
      TransitGatewayAttachmentId: resourceProperties['prefixListReference']['TransitGatewayAttachmentId'],
    },
    invokingAccountId: serviceToken.split(':')[4],
    invokingRegion: serviceToken.split(':')[3],
    partition: serviceToken.split(':')[1],
    owningAccountId: (resourceProperties['owningAccountId'] as string) ?? undefined,
    owningRegion: (resourceProperties['owningRegion'] as string) ?? undefined,
    roleName: (resourceProperties['roleName'] as string) ?? undefined,
  };
}

/**
 * Returns a local or cross-account/cross-region EC2 client based on input parameters
 * @param options ReferenceOptions
 * @param solutionId string | undefined
 * @returns Promise<EC2Client>
 */
async function setEc2Client(options: ReferenceOptions, solutionId?: string): Promise<EC2Client> {
  const roleArn = `arn:${options.partition}:iam::${options.owningAccountId}:role/${options.roleName}`;
  const stsClient = new STSClient({ region: options.invokingRegion, customUserAgent: solutionId });

  if (options.owningAccountId && options.owningRegion) {
    if (!options.roleName) {
      throw new Error(`Cross-account TGW prefix list reference required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return EC2 client
    return new EC2Client({
      region: options.owningRegion,
      customUserAgent: solutionId,
      credentials,
    });
  } else if (options.owningAccountId && !options.owningRegion) {
    if (!options.roleName) {
      throw new Error(`Cross-account TGW prefix list reference required but roleName parameter is undefined`);
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
      region: options.owningRegion ?? options.invokingRegion,
      customUserAgent: solutionId,
    });
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
