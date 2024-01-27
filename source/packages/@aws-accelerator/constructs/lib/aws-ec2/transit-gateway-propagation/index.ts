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
import {
  DisableTransitGatewayRouteTablePropagationCommand,
  EC2Client,
  EnableTransitGatewayRouteTablePropagationCommand,
} from '@aws-sdk/client-ec2';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
interface TgwPropagationOptions {
  /**
   * Transit gateway attachment ID
   */
  readonly transitGatewayAttachmentId: string;
  /**
   * Transit gateway route table ID
   */
  readonly transitGatewayRouteTableId: string;
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

export async function handler(event: CloudFormationCustomResourceEvent): Promise<{ Status: string } | undefined> {
  //
  // Set resource properties
  const options = setOptions(event.ResourceProperties, event.ServiceToken);
  //
  // Set EC2 client
  const ec2Client = await setEc2Client(options, process.env['SOLUTION_ID']);
  //
  // Begin custom resource logic
  switch (event.RequestType) {
    case 'Create':
      await createTgwPropagation(ec2Client, options);
      return {
        Status: 'SUCCESS',
      };
    case 'Update':
      const oldOptions = setOptions(event.OldResourceProperties, event.ServiceToken);
      await deleteTgwPropagation(ec2Client, oldOptions);
      await createTgwPropagation(ec2Client, options);
      return {
        Status: 'SUCCESS',
      };
    case 'Delete':
      await deleteTgwPropagation(ec2Client, options);
      return {
        Status: 'SUCCESS',
      };
  }
}

/**
 * Set TGW propagation options based on event
 * @param resourceProperties { [key: string]: any }
 * @param serviceToken string
 * @returns TgwPropagationOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOptions(resourceProperties: { [key: string]: any }, serviceToken: string): TgwPropagationOptions {
  return {
    transitGatewayAttachmentId: resourceProperties['transitGatewayAttachmentId'],
    transitGatewayRouteTableId: resourceProperties['transitGatewayRouteTableId'],
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
 * @param options options
 * @param solutionId string | undefined
 * @returns Promise<EC2Client>
 */
async function setEc2Client(options: TgwPropagationOptions, solutionId?: string): Promise<EC2Client> {
  const roleArn = `arn:${options.partition}:iam::${options.owningAccountId}:role/${options.roleName}`;
  const stsClient = new STSClient({ region: options.invokingRegion, customUserAgent: solutionId });

  if (options.owningAccountId && options.owningRegion) {
    if (!options.roleName) {
      throw new Error(`Cross-account TGW propagation required but roleName parameter is undefined`);
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
      throw new Error(`Cross-account TGW propagation required but roleName parameter is undefined`);
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
 * Create TGW route table association
 * @param ec2Client
 * @param options
 * @returns Promise<string>
 */
async function createTgwPropagation(ec2Client: EC2Client, options: TgwPropagationOptions): Promise<void> {
  console.log(
    `Enabling attachment propagation for ${options.transitGatewayAttachmentId} to TGW route table ${options.transitGatewayRouteTableId}...`,
  );
  try {
    await throttlingBackOff(() =>
      ec2Client.send(
        new EnableTransitGatewayRouteTablePropagationCommand({
          TransitGatewayAttachmentId: options.transitGatewayAttachmentId,
          TransitGatewayRouteTableId: options.transitGatewayRouteTableId,
        }),
      ),
    );
  } catch (e) {
    throw new Error(`Could not complete AssociateTransitGateway command: ${e}`);
  }
}

/**
 * Delete TGW route table association
 * @param ec2Client
 * @param options
 * @returns Promise<string>
 */
async function deleteTgwPropagation(ec2Client: EC2Client, options: TgwPropagationOptions): Promise<void> {
  console.log(
    `Disabling propagation for attachment ${options.transitGatewayAttachmentId} from TGW route table ${options.transitGatewayRouteTableId}...`,
  );
  try {
    await throttlingBackOff(() =>
      ec2Client.send(
        new DisableTransitGatewayRouteTablePropagationCommand({
          TransitGatewayAttachmentId: options.transitGatewayAttachmentId,
          TransitGatewayRouteTableId: options.transitGatewayRouteTableId,
        }),
      ),
    );
  } catch (e) {
    throw new Error(`Could not complete AssociateTransitGateway command: ${e}`);
  }
}
