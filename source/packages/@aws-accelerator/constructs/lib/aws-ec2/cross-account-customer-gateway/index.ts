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
  CreateCustomerGatewayCommand,
  CreateTagsCommand,
  DeleteCustomerGatewayCommand,
  DeleteTagsCommand,
  EC2Client,
  Tag,
} from '@aws-sdk/client-ec2';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

interface CgwOptions {
  /**
   * Gateway IP address for customer gateway
   */
  readonly ipAddress: string;
  /**
   * Gateway ASN for customer gateway
   */
  readonly bgpAsn: number;
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
  /**
   * Tags for the customer gateway
   */
  readonly tags?: Tag[];
}

export async function handler(
  event: CloudFormationCustomResourceEvent,
): Promise<{ PhysicalResourceId: string; Status: string } | undefined> {
  //
  // Set resource properties
  const newCgwOptions = setCgwOptions(event.ResourceProperties, event.ServiceToken);
  //
  // Set EC2 client
  const ec2Client = await setEc2Client(newCgwOptions, process.env['SOLUTION_ID']);
  //
  // Begin custom resource logic
  switch (event.RequestType) {
    case 'Create':
      //
      // Create customer gateway
      const cgwId = await createCustomerGateway(ec2Client, newCgwOptions);
      return { PhysicalResourceId: cgwId, Status: 'SUCCESS' };
    case 'Update':
      //
      // Set old resource properties
      const oldCgwOptions = setCgwOptions(event.OldResourceProperties, event.ServiceToken);
      //
      // Create new CGW if necessary
      if (createNewCgw(oldCgwOptions, newCgwOptions)) {
        const newCgwId = await createCustomerGateway(ec2Client, newCgwOptions);
        return { PhysicalResourceId: newCgwId, Status: 'SUCCESS' };
      } else {
        await updateTags(ec2Client, event.PhysicalResourceId, oldCgwOptions.tags ?? [], newCgwOptions.tags ?? []);
        return { PhysicalResourceId: event.PhysicalResourceId, Status: 'SUCCESS' };
      }
    case 'Delete':
      //
      // Delete the CGW
      await throttlingBackOff(() =>
        ec2Client.send(new DeleteCustomerGatewayCommand({ CustomerGatewayId: event.PhysicalResourceId })),
      );
      return { PhysicalResourceId: event.PhysicalResourceId, Status: 'SUCCESS' };
  }
}

/**
 * Set CGW options based on event
 * @param resourceProperties { [key: string]: any }
 * @returns CgwOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setCgwOptions(resourceProperties: { [key: string]: any }, serviceToken: string): CgwOptions {
  return {
    ipAddress: resourceProperties['ipAddress'] as string,
    bgpAsn: resourceProperties['bgpAsn'] as number,
    invokingAccountId: serviceToken.split(':')[4],
    invokingRegion: serviceToken.split(':')[3],
    partition: serviceToken.split(':')[1],
    owningAccountId: (resourceProperties['owningAccountId'] as string) ?? undefined,
    owningRegion: (resourceProperties['owningRegion'] as string) ?? undefined,
    roleName: (resourceProperties['roleName'] as string) ?? undefined,
    tags: (resourceProperties['tags'] as Tag[]) ?? undefined,
  };
}

/**
 * Returns a local or cross-account/cross-region EC2 client based on input parameters
 * @param cgwOptions CgwOptions
 * @param solutionId string | undefined
 * @returns Promise<EC2Client>
 */
async function setEc2Client(cgwOptions: CgwOptions, solutionId?: string): Promise<EC2Client> {
  const roleArn = `arn:${cgwOptions.partition}:iam::${cgwOptions.owningAccountId}:role/${cgwOptions.roleName}`;
  const stsClient = new STSClient({ region: cgwOptions.invokingRegion, customUserAgent: solutionId });

  if (cgwOptions.owningAccountId && cgwOptions.owningRegion) {
    if (!cgwOptions.roleName) {
      throw new Error(`Cross-account CGW required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return EC2 client
    return new EC2Client({
      region: cgwOptions.owningRegion,
      customUserAgent: solutionId,
      credentials,
    });
  } else if (cgwOptions.owningAccountId && !cgwOptions.owningRegion) {
    if (!cgwOptions.roleName) {
      throw new Error(`Cross-account CGW required but roleName parameter is undefined`);
    }
    //
    // Assume role via STS
    const credentials = await getStsCredentials(stsClient, roleArn);
    //
    // Return EC2 client
    return new EC2Client({
      region: cgwOptions.invokingRegion,
      customUserAgent: solutionId,
      credentials,
    });
  } else {
    return new EC2Client({
      region: cgwOptions.owningRegion ?? cgwOptions.invokingRegion,
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
 * Create a customer gateway
 * @param ec2Client EC2Client
 * @param cgwOptions CgwOptions
 * @returns Promise<string>
 */
async function createCustomerGateway(ec2Client: EC2Client, cgwOptions: CgwOptions): Promise<string> {
  console.log(`Creating customer gateway...`);
  try {
    const response = await throttlingBackOff(() =>
      ec2Client.send(
        new CreateCustomerGatewayCommand({
          BgpAsn: cgwOptions.bgpAsn,
          IpAddress: cgwOptions.ipAddress,
          Type: 'ipsec.1',
          TagSpecifications: [
            {
              ResourceType: 'customer-gateway',
              Tags: cgwOptions.tags,
            },
          ],
        }),
      ),
    );
    //
    // Validate response
    if (!response.CustomerGateway?.CustomerGatewayId) {
      throw new Error(`Customer gateway ID not returned from CreateCustomerGateway command`);
    }
    return response.CustomerGateway.CustomerGatewayId;
  } catch (e) {
    throw new Error(`Could not create customer gateway: ${e}`);
  }
}

/**
 * Determines if a new CGW must be created
 * @param oldCgwOptions CgwOptions
 * @param newCgwOptions CgwOptions
 * @returns boolean
 */
function createNewCgw(oldCgwOptions: CgwOptions, newCgwOptions: CgwOptions): boolean {
  return oldCgwOptions.ipAddress !== newCgwOptions.ipAddress || oldCgwOptions.bgpAsn !== newCgwOptions.bgpAsn;
}

/**
 * Update tags for the customer gateway
 * @param ec2Client EC2Client
 * @param cgwId string
 * @param oldTags Tag[]
 * @param newTags Tag[]
 */
async function updateTags(ec2Client: EC2Client, cgwId: string, oldTags: Tag[], newTags: Tag[]): Promise<void> {
  const newTagKeys = newTags.map(newTag => newTag.Key);
  const removeTags = oldTags.filter(oldTag => !newTagKeys.includes(oldTag.Key));

  try {
    if (removeTags.length > 0) {
      console.log(`Removing tag keys [${removeTags.map(tag => tag.Key)}] from CGW ${cgwId}...`);
      await throttlingBackOff(() => ec2Client.send(new DeleteTagsCommand({ Resources: [cgwId], Tags: removeTags })));
    }
    if (newTags.length > 0) {
      console.log(`Creating/updating tag keys [${newTags.map(tag => tag.Key)}] on CGW ${cgwId}...`);
      await throttlingBackOff(() => ec2Client.send(new CreateTagsCommand({ Resources: [cgwId], Tags: newTags })));
    }
  } catch (e) {
    throw new Error(`Error while updating tags: ${e}`);
  }
}
