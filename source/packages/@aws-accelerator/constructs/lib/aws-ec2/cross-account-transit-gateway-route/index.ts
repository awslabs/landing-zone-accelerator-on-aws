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
import { CreateTransitGatewayRouteCommand, DeleteTransitGatewayRouteCommand, EC2Client } from '@aws-sdk/client-ec2';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

interface TgwStaticRouteOptions {
  /**
   * API props
   */
  readonly props: {
    /**
     * The CIDR block for the route.
     */
    readonly DestinationCidrBlock: string;
    /**
     * The ID of the transit gateway route table.
     */
    readonly TransitGatewayRouteTableId: string;
    /**
     * Determines if route is blackholed.
     */
    readonly Blackhole?: boolean;
    /**
     * The identifier of the Transit Gateway Attachment
     */
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

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
    }
  | undefined
> {
  //
  // Set TGW route options and EC2 client
  const options = setOptions(event.ResourceProperties, event.ServiceToken);
  const ec2Client = await setEc2Client(options, process.env['SOLUTION_ID']);
  //
  // Begin custom resource handler logic
  switch (event.RequestType) {
    case 'Create':
      await createRoute(ec2Client, options);

      return {
        Status: 'SUCCESS',
      };
    case 'Update':
      const oldOptions = setOptions(event.OldResourceProperties, event.ServiceToken);
      await deleteRoute(ec2Client, oldOptions);
      await createRoute(ec2Client, options);

      return {
        Status: 'SUCCESS',
      };
    case 'Delete':
      await deleteRoute(ec2Client, options);

      return {
        Status: 'SUCCESS',
      };
  }
}

/**
 * Set TGW static route options based on event
 * @param resourceProperties { [key: string]: any }
 * @param serviceToken string
 * @returns TgwStaticRouteOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOptions(resourceProperties: { [key: string]: any }, serviceToken: string): TgwStaticRouteOptions {
  return {
    props: {
      TransitGatewayRouteTableId: resourceProperties['transitGatewayRouteTableId'],
      Blackhole: resourceProperties['blackhole'] === 'true' ?? undefined,
      DestinationCidrBlock: resourceProperties['destinationCidrBlock'],
      TransitGatewayAttachmentId: resourceProperties['transitGatewayAttachmentId'],
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
 * @param options TgwStaticRouteOptions
 * @param solutionId string | undefined
 * @returns Promise<EC2Client>
 */
async function setEc2Client(options: TgwStaticRouteOptions, solutionId?: string): Promise<EC2Client> {
  const roleArn = `arn:${options.partition}:iam::${options.owningAccountId}:role/${options.roleName}`;
  const stsClient = new STSClient({ region: options.invokingRegion, customUserAgent: solutionId });

  if (options.owningAccountId && options.owningRegion) {
    if (!options.roleName) {
      throw new Error(`Cross-account TGW static route required but roleName parameter is undefined`);
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
      throw new Error(`Cross-account TGW static route required but roleName parameter is undefined`);
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

/**
 * Create TGW static route
 * @param ec2Client EC2Client
 * @param options TgwStaticRouteOptions
 */
async function createRoute(ec2Client: EC2Client, options: TgwStaticRouteOptions) {
  console.log(
    `Creating TGW static route for TGW route table ${options.props.TransitGatewayRouteTableId} with destination ${
      options.props.DestinationCidrBlock
    } to target ${options.props.TransitGatewayAttachmentId ?? 'blackhole'}...`,
  );
  try {
    await throttlingBackOff(() => ec2Client.send(new CreateTransitGatewayRouteCommand(options.props)));
  } catch (e) {
    throw new Error(`Error calling CreateTransitGatewayRoute command: ${e}`);
  }
}

/**
 * Delete TGW static route
 * @param ec2Client EC2Client
 * @param options TgwStaticRouteOptions
 */
async function deleteRoute(ec2Client: EC2Client, options: TgwStaticRouteOptions) {
  console.log(
    `Removing TGW static route for TGW route table ${options.props.TransitGatewayRouteTableId} with destination ${
      options.props.DestinationCidrBlock
    } to target ${options.props.TransitGatewayAttachmentId ?? 'blackhole'}...`,
  );
  try {
    await throttlingBackOff(() =>
      ec2Client.send(
        new DeleteTransitGatewayRouteCommand({
          DestinationCidrBlock: options.props.DestinationCidrBlock,
          TransitGatewayRouteTableId: options.props.TransitGatewayRouteTableId,
        }),
      ),
    );
  } catch (e) {
    throw new Error(`Error calling DeleteTransitGatewayRoute command: ${e}`);
  }
}
