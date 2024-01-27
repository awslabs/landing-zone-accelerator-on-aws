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
  CreateTagsCommand,
  CreateVpnConnectionCommand,
  CreateVpnConnectionCommandInput,
  DeleteTagsCommand,
  DeleteVpnConnectionCommand,
  DescribeVpnConnectionsCommand,
  EC2Client,
  ModifyVpnConnectionOptionsCommand,
  ModifyVpnTunnelOptionsCommand,
  Tag,
  VpnConnection,
  VpnTunnelOptionsSpecification,
} from '@aws-sdk/client-ec2';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { VpnConnectionDiff, VpnOptions, VpnTunnelOptions } from './vpn-types';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string | undefined;
    }
  | undefined
> {
  //
  // Set VPN options
  const newVpnOptions = setVpnOptions(event.ResourceProperties, event.ServiceToken);
  //
  // Set up clients
  const [ec2Client, secretsClient] = await setAwsClients(newVpnOptions, process.env['SOLUTION_ID']);
  //
  // Begin custom resource logic
  switch (event.RequestType) {
    case 'Create':
      //
      // Create VPN
      const vpnConnectionId = await createVpnConnection(ec2Client, await setVpnProps(secretsClient, newVpnOptions));
      //
      // Wait for VPN to be in a stable state
      await vpnConnectionStatus(ec2Client, vpnConnectionId, 'available');

      return {
        PhysicalResourceId: vpnConnectionId,
        Status: 'SUCCESS',
      };
    case 'Update':
      //
      // Set VPN props
      const oldVpnOptions = setVpnOptions(event.OldResourceProperties, event.ServiceToken);
      //
      // Update VPN connection
      const updateVpnConnectionId = await updateVpnConnection(
        ec2Client,
        secretsClient,
        event.PhysicalResourceId,
        oldVpnOptions,
        newVpnOptions,
      );

      return {
        PhysicalResourceId: updateVpnConnectionId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      //
      // Delete VPN
      await throttlingBackOff(() =>
        ec2Client.send(new DeleteVpnConnectionCommand({ VpnConnectionId: event.PhysicalResourceId })),
      );
      //
      // Wait for VPN to be deleted
      await vpnConnectionStatus(ec2Client, event.PhysicalResourceId, 'deleted');

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Deserialize the VPN options from the CloudFormation Custom Resource event
 * @param resourceProperties { [key: string]: any }
 * @returns VpnOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setVpnOptions(resourceProperties: { [key: string]: any }, serviceToken: string): VpnOptions {
  return {
    customerGatewayId: resourceProperties['customerGatewayId'] as string,
    amazonIpv4NetworkCidr: (resourceProperties['amazonIpv4NetworkCidr'] as string) ?? undefined,
    customerIpv4NetworkCidr: (resourceProperties['customerIpv4NetworkCidr'] as string) ?? undefined,
    enableVpnAcceleration: resourceProperties['enableVpnAcceleration'] === 'true',
    invokingAccountId: serviceToken.split(':')[4],
    invokingRegion: serviceToken.split(':')[3],
    partition: serviceToken.split(':')[1],
    owningAccountId: (resourceProperties['owningAccountId'] as string) ?? undefined,
    owningRegion: (resourceProperties['owningRegion'] as string) ?? undefined,
    roleName: (resourceProperties['roleName'] as string) ?? undefined,
    staticRoutesOnly: resourceProperties['staticRoutesOnly'] === 'true',
    tags: (resourceProperties['tags'] as Tag[]) ?? undefined,
    transitGatewayId: (resourceProperties['transitGatewayId'] as string) ?? undefined,
    vpnGatewayId: (resourceProperties['vpnGatewayId'] as string) ?? undefined,
    vpnTunnelOptions: (resourceProperties['vpnTunnelOptions'] as VpnTunnelOptions[]) ?? undefined,
  };
}

/**
 * Returns local or cross-account/cross-region AWS API clients based on input parameters
 * @param vpnOptions VpnOptions
 * @param solutionId string | undefined
 * @returns Promise<[EC2Client, SecretsManagerClient]>
 */
async function setAwsClients(vpnOptions: VpnOptions, solutionId?: string): Promise<[EC2Client, SecretsManagerClient]> {
  const roleArn = `arn:${vpnOptions.partition}:iam::${vpnOptions.owningAccountId}:role/${vpnOptions.roleName}`;
  const stsClient = new STSClient({ region: vpnOptions.invokingRegion, customUserAgent: solutionId });

  if (vpnOptions.owningAccountId && vpnOptions.owningRegion) {
    if (!vpnOptions.roleName) {
      throw new Error(`Cross-account VPN required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return clients
    const clientSettings = {
      region: vpnOptions.owningRegion,
      customUserAgent: solutionId,
      credentials,
    };
    return [new EC2Client(clientSettings), new SecretsManagerClient(clientSettings)];
  } else if (vpnOptions.owningAccountId && !vpnOptions.owningRegion) {
    if (!vpnOptions.roleName) {
      throw new Error(`Cross-account VPN required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return clients
    const clientSettings = {
      region: vpnOptions.invokingRegion,
      customUserAgent: solutionId,
      credentials,
    };
    return [new EC2Client(clientSettings), new SecretsManagerClient(clientSettings)];
  } else {
    const clientSettings = {
      region: vpnOptions.owningRegion ?? vpnOptions.invokingRegion,
      customUserAgent: solutionId,
    };
    return [new EC2Client(clientSettings), new SecretsManagerClient(clientSettings)];
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
 * Convert the configured VPN options to the CreateVpnConnectionCommandInput format
 * @param vpnOptions
 * @returns
 */
async function setVpnProps(
  secretsClient: SecretsManagerClient,
  vpnOptions: VpnOptions,
): Promise<CreateVpnConnectionCommandInput> {
  return {
    CustomerGatewayId: vpnOptions.customerGatewayId,
    Type: 'ipsec.1',
    Options: {
      EnableAcceleration: vpnOptions.enableVpnAcceleration,
      LocalIpv4NetworkCidr: vpnOptions.customerIpv4NetworkCidr,
      RemoteIpv4NetworkCidr: vpnOptions.amazonIpv4NetworkCidr,
      StaticRoutesOnly: vpnOptions.staticRoutesOnly,
      TunnelOptions: await setVpnTunnelProps(secretsClient, vpnOptions.vpnTunnelOptions),
    },
    TransitGatewayId: vpnOptions.transitGatewayId,
    VpnGatewayId: vpnOptions.vpnGatewayId,
    TagSpecifications: [
      {
        ResourceType: 'vpn-connection',
        Tags: vpnOptions.tags,
      },
    ],
  };
}

/**
 * Convert the configured VPN tunnel options to the VpnTunnelOptionsSpecification format
 * @param tunnelOptions VpnTunnelOptions[]
 * @returns VpnTunnelOptionsSpecification[] | undefined
 */
async function setVpnTunnelProps(
  secretsClient: SecretsManagerClient,
  tunnelOptions?: VpnTunnelOptions[],
): Promise<VpnTunnelOptionsSpecification[] | undefined> {
  if (!tunnelOptions) {
    return;
  }

  const vpnTunnelOptions: VpnTunnelOptionsSpecification[] = [];

  for (const tunnel of tunnelOptions) {
    vpnTunnelOptions.push({
      DPDTimeoutAction: tunnel.dpdTimeoutAction,
      DPDTimeoutSeconds: tunnel.dpdTimeoutSeconds,
      EnableTunnelLifecycleControl: tunnel.tunnelLifecycleControl,
      IKEVersions: tunnel.ikeVersions?.map(version => {
        return { Value: `ikev${version}` };
      }),
      LogOptions: {
        CloudWatchLogOptions: {
          LogEnabled: tunnel.logging?.enable,
          LogGroupArn: tunnel.logging?.logGroupArn,
          LogOutputFormat: tunnel.logging?.outputFormat,
        },
      },
      Phase1DHGroupNumbers: tunnel.phase1?.dhGroups?.map(p1DhGroup => {
        return { Value: p1DhGroup };
      }),
      Phase1EncryptionAlgorithms: tunnel.phase1?.encryptionAlgorithms?.map(p1Enc => {
        return { Value: p1Enc };
      }),
      Phase1IntegrityAlgorithms: tunnel.phase1?.integrityAlgorithms?.map(p1Int => {
        return { Value: p1Int };
      }),
      Phase1LifetimeSeconds: tunnel.phase1?.lifetimeSeconds,
      Phase2DHGroupNumbers: tunnel.phase2?.dhGroups?.map(p2DhGroup => {
        return { Value: p2DhGroup };
      }),
      Phase2EncryptionAlgorithms: tunnel.phase2?.encryptionAlgorithms?.map(p2Enc => {
        return { Value: p2Enc };
      }),
      Phase2IntegrityAlgorithms: tunnel.phase2?.integrityAlgorithms?.map(p2Int => {
        return { Value: p2Int };
      }),
      Phase2LifetimeSeconds: tunnel.phase2?.lifetimeSeconds,
      PreSharedKey: tunnel.preSharedKey ? await getSecretValue(secretsClient, tunnel.preSharedKey) : undefined,
      RekeyFuzzPercentage: tunnel.rekeyFuzzPercentage,
      RekeyMarginTimeSeconds: tunnel.rekeyMarginTimeSeconds,
      ReplayWindowSize: tunnel.replayWindowSize,
      StartupAction: tunnel.startupAction,
      TunnelInsideCidr: tunnel.tunnelInsideCidr,
    });
  }
  return vpnTunnelOptions;
}

/**
 * Retrieves a pre-shared key value from Secrets Manager
 * @param secretsClient SecretsManagerClient
 * @param secretName string
 * @returns string
 */
async function getSecretValue(secretsClient: SecretsManagerClient, secretName: string): Promise<string> {
  console.log(`Retrieving pre-shared key value ${secretName} from Secrets Manager...`);
  try {
    const response = await throttlingBackOff(() =>
      secretsClient.send(new GetSecretValueCommand({ SecretId: secretName })),
    );

    if (!response.SecretString) {
      throw new Error(`GetSecretValue command did not return a value`);
    }
    return response.SecretString;
  } catch (e) {
    throw new Error(`Error while retrieving secret: ${e}`);
  }
}

/**
 * Create VPN connection
 * @param ec2Client EC2Client
 * @param vpnProps CreateVpnConnectionCommandInput
 * @returns Promise<string>
 */
async function createVpnConnection(ec2Client: EC2Client, vpnProps: CreateVpnConnectionCommandInput): Promise<string> {
  let logMessage = `Creating VPN connection between customer gateway ${vpnProps.CustomerGatewayId}`;
  logMessage += vpnProps.TransitGatewayId
    ? ` and transit gateway ${vpnProps.TransitGatewayId}...`
    : ` and virtual private gateway ${vpnProps.VpnGatewayId}...`;
  console.info(logMessage);

  try {
    const response = await throttlingBackOff(() => ec2Client.send(new CreateVpnConnectionCommand(vpnProps)));

    if (!response.VpnConnection?.VpnConnectionId) {
      throw new Error('VPN connection ID was not returned from CreateVpnConnection command');
    }
    return response.VpnConnection.VpnConnectionId;
  } catch (e) {
    throw new Error(`Error when creating VPN connection: ${e}`);
  }
}

/**
 * Checks VPN connection status against a desired state
 * @param ec2Client EC2Client
 * @param vpnConnectionId string
 * @param desiredState string
 */
async function vpnConnectionStatus(ec2Client: EC2Client, vpnConnectionId: string, desiredState: string): Promise<void> {
  let currentState: string | undefined = undefined;
  let retries = 0;

  console.info(`Awaiting VPN connection ${vpnConnectionId} to be in ${desiredState} state...`);
  try {
    do {
      const vpnDetails = await describeVpnConnection(ec2Client, vpnConnectionId);
      //
      // Get current VPN connection state
      currentState = vpnDetails.State;

      if (!currentState) {
        throw new Error('VPN connection state was not returned from DescribeVpnConnections command');
      }
      //
      // Wait and iterate retries if state is not desired
      if (currentState !== desiredState) {
        await sleep(30000);
        retries += 1;
      }
      //
      // Throw error if state is not desired after maximum retries
      if (retries === 28) {
        throw new Error('VPN connection state did not stabilize after maximum number of retries');
      }
    } while (currentState !== desiredState);
  } catch (e) {
    throw new Error(`Error while checking VPN connection status: ${e}`);
  }
}

/**
 * Returns a VpnConnection object from the EC2 API
 * @param ec2Client EC2Client
 * @param vpnConnectionId string
 * @returns VpnConnection
 */
async function describeVpnConnection(ec2Client: EC2Client, vpnConnectionId: string): Promise<VpnConnection> {
  const response = await throttlingBackOff(() =>
    ec2Client.send(new DescribeVpnConnectionsCommand({ VpnConnectionIds: [vpnConnectionId] })),
  );

  if (!response.VpnConnections) {
    throw new Error('VPN connection details were not returned from DescribeVpnConnections command');
  }
  return response.VpnConnections[0];
}

/**
 * Update VPN connection based on changed values
 * @param ec2Client EC2Client
 * @param secretsClient SecretsManagerClient
 * @param vpnConnectionId string
 * @param oldVpnOptions VpnOptions
 * @param newVpnOptions VpnOptions
 * @returns Promise<string>
 */
async function updateVpnConnection(
  ec2Client: EC2Client,
  secretsClient: SecretsManagerClient,
  vpnConnectionId: string,
  oldVpnOptions: VpnOptions,
  newVpnOptions: VpnOptions,
): Promise<string> {
  const vpnDiff = new VpnConnectionDiff(oldVpnOptions, newVpnOptions);
  //
  // If CGW, TGW, or VGW changed, create a new connection
  if (vpnDiff.createNewVpnConnection) {
    const newVpnConnectionId = await createVpnConnection(ec2Client, await setVpnProps(secretsClient, newVpnOptions));
    await vpnConnectionStatus(ec2Client, newVpnConnectionId, 'available');
    return newVpnConnectionId;
  } else {
    //
    // Modify VPN based on diff
    if (vpnDiff.vpnConnectionOptionsModified) {
      await modifyVpnOptions(ec2Client, newVpnOptions, vpnConnectionId);
    }
    if (vpnDiff.vpnTunnelOptionsModified.includes(true)) {
      await modifyVpnTunnelOptions(
        ec2Client,
        secretsClient,
        newVpnOptions,
        vpnDiff.vpnTunnelOptionsModified.indexOf(true),
        vpnConnectionId,
      );
    }
    //
    // Update tags
    await updateTags(ec2Client, vpnConnectionId, oldVpnOptions.tags ?? [], newVpnOptions.tags ?? []);

    return vpnConnectionId;
  }
}

/**
 * Modify VPN connection options
 * @param ec2Client EC2Client
 * @param vpnOptions VpnOptions
 * @param vpnConnectionId string
 */
async function modifyVpnOptions(ec2Client: EC2Client, vpnOptions: VpnOptions, vpnConnectionId: string): Promise<void> {
  console.log(`Modifying VPN connection options for ${vpnConnectionId}...`);
  try {
    const response = await throttlingBackOff(() =>
      ec2Client.send(
        new ModifyVpnConnectionOptionsCommand({
          VpnConnectionId: vpnConnectionId,
          LocalIpv4NetworkCidr: vpnOptions.customerIpv4NetworkCidr,
          RemoteIpv4NetworkCidr: vpnOptions.amazonIpv4NetworkCidr,
        }),
      ),
    );

    if (!response.VpnConnection?.VpnConnectionId) {
      throw new Error('VPN connection ID was not returned by ModifyVpnConnectionOptions command');
    }
    //
    // Wait for VPN connection to stabilize
    await vpnConnectionStatus(ec2Client, response.VpnConnection.VpnConnectionId, 'available');
  } catch (e) {
    throw new Error(`Error while modifying VPN connection options: ${e}`);
  }
}

/**
 * Modify VPN tunnel options
 * @param ec2Client EC2Client
 * @param secretsClient SecretsManagerClient
 * @param vpnOptions VpnOptions
 * @param vpnTunnelIndex number
 * @param vpnConnectionId string
 */
async function modifyVpnTunnelOptions(
  ec2Client: EC2Client,
  secretsClient: SecretsManagerClient,
  vpnOptions: VpnOptions,
  vpnTunnelIndex: number,
  vpnConnectionId: string,
): Promise<void> {
  try {
    //
    // Retrieve VPN tunnel details
    const vpnDetails = await describeVpnConnection(ec2Client, vpnConnectionId);

    if (!vpnDetails.Options?.TunnelOptions) {
      throw new Error('VPN tunnel option details were not returned from DescribeVpnConnections command');
    }
    //
    // Modify VPN tunnel options
    const tunnelOutsideIp = vpnDetails.Options.TunnelOptions[vpnTunnelIndex].OutsideIpAddress;
    const tunnelProps = await setVpnTunnelProps(secretsClient, vpnOptions.vpnTunnelOptions);

    if (!tunnelOutsideIp) {
      throw new Error('VPN tunnel outside IP was not returned from DescribeVpnConnections command');
    }

    const response = await throttlingBackOff(() =>
      ec2Client.send(
        new ModifyVpnTunnelOptionsCommand({
          VpnConnectionId: vpnConnectionId,
          VpnTunnelOutsideIpAddress: tunnelOutsideIp,
          TunnelOptions: tunnelProps ? tunnelProps[vpnTunnelIndex] : undefined,
        }),
      ),
    );

    if (!response.VpnConnection?.VpnConnectionId) {
      throw new Error('VPN connection ID was not returned by ModifyVpnTunnelOptions command');
    }
    //
    // Wait for VPN connection to stabilize
    await vpnConnectionStatus(ec2Client, response.VpnConnection.VpnConnectionId, 'available');
  } catch (e) {
    throw new Error(`Error while modifying VPN tunnel options: ${e}`);
  }
}

/**
 * Update tags for the VPN connection
 * @param ec2Client EC2Client
 * @param vpnConnectionId string
 * @param oldTags Tag[]
 * @param newTags Tag[]
 */
async function updateTags(
  ec2Client: EC2Client,
  vpnConnectionId: string,
  oldTags: Tag[],
  newTags: Tag[],
): Promise<void> {
  const newTagKeys = newTags.map(newTag => newTag.Key);
  const removeTags = oldTags.filter(oldTag => !newTagKeys.includes(oldTag.Key));

  try {
    if (removeTags.length > 0) {
      console.log(`Removing tag keys [${removeTags.map(tag => tag.Key)}] from VPN connection ${vpnConnectionId}...`);
      await throttlingBackOff(() =>
        ec2Client.send(new DeleteTagsCommand({ Resources: [vpnConnectionId], Tags: removeTags })),
      );
    }
    if (newTags.length > 0) {
      console.log(
        `Creating/updating tag keys [${newTags.map(tag => tag.Key)}] on VPN connection ${vpnConnectionId}...`,
      );
      await throttlingBackOff(() =>
        ec2Client.send(new CreateTagsCommand({ Resources: [vpnConnectionId], Tags: newTags })),
      );
    }
  } catch (e) {
    throw new Error(`Error while updating tags: ${e}`);
  }
}

/**
 * Sleep function
 * @param ms number
 * @returns Promise<void>
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
