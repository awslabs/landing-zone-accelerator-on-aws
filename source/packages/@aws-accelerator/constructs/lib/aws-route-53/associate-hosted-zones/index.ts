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
import { STSClient, AssumeRoleCommand, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import { DescribeVpcsCommandInput, EC2Client, Filter, paginateDescribeVpcs } from '@aws-sdk/client-ec2';
import {
  AssociateVPCWithHostedZoneCommand,
  CreateVPCAssociationAuthorizationCommand,
  CreateVPCAssociationAuthorizationRequest,
  DeleteVPCAssociationAuthorizationCommand,
  GetHostedZoneCommand,
  GetHostedZoneResponse,
  Route53Client,
} from '@aws-sdk/client-route-53';

import type {
  AssumeRoleAccountCredentials,
  AllAccountsCredentialParams,
  AssumeRoleParams,
  AWSClients,
  DescribeVpcByTagFiltersParams,
  VpcItem,
  SetClientsParams,
  TagFilter,
  VpcAssociation,
  CfnResponse,
  VpcAssociationItem,
} from './interfaces';

import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * associate-hosted-zones - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: CloudFormationCustomResourceEvent): Promise<CfnResponse | undefined> {
  const solutionId = process.env['SOLUTION_ID'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const accountIds: string[] = event.ResourceProperties['accountIds'];
      const hostedZoneIds: string[] = event.ResourceProperties['hostedZoneIds'];
      const hostedZoneAccountId = event.ResourceProperties['hostedZoneAccountId'];
      const partition = event.ResourceProperties['partition'];
      const region = event.ResourceProperties['region'];
      const roleName = event.ResourceProperties['roleName'];
      const roleSessionName = 'AssociateHostedZone';
      const tagFilters: TagFilter[] = event.ResourceProperties['tagFilters'];

      const assumeRoleResponses = await getAllAssumeRoleCredentials({
        accountIds,
        roleName,
        solutionId,
        region,
        partition,
        roleSessionName,
        hostedZoneAccountId,
      });

      const awsClients = setAwsClients({
        assumeRoleCredentials: assumeRoleResponses,
        hostedZoneAccountId,
        solutionId,
      });

      const hostedZoneRoute53Client = awsClients[hostedZoneAccountId].route53Client;
      if (!hostedZoneRoute53Client) {
        throw new Error(`Could not get clients for account ${hostedZoneAccountId}`);
      }

      const describeVpcsPromises: Promise<VpcItem[]>[] = Object.keys(awsClients).map(account =>
        describeVpcsByTagFilters({ account, ec2Client: awsClients[account].ec2Client, tagFilters }),
      );

      const hostedZonePromises = hostedZoneIds.map(hostedZoneId =>
        getHostedZone(hostedZoneRoute53Client, hostedZoneId),
      );

      const vpcsToAssociate = (await Promise.all(describeVpcsPromises)).flat();

      console.log('Retrieved VPC information for the following vpcs');
      vpcsToAssociate.forEach(vpc => {
        console.log(vpc.account, vpc.vpc.VpcId);
      });

      const hostedZoneItems = await Promise.all(hostedZonePromises);

      console.log('Retrieved Information for the following hosted zones:');
      hostedZoneItems.forEach(hostedZoneItem => {
        console.log(hostedZoneItem.HostedZone);
      });

      const nonAssociatedVpcs = findNonAssociatedVpcs(vpcsToAssociate, hostedZoneItems, hostedZoneAccountId, region);

      console.log('Vpcs not associated with hosted zones:');
      console.log(JSON.stringify(nonAssociatedVpcs, null, 2));

      await associateVpcs(nonAssociatedVpcs, awsClients);

      return {
        PhysicalResourceId: 'associate-hosted-zones',
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

async function getAllAssumeRoleCredentials(
  allAccountsCredentialParams: AllAccountsCredentialParams,
): Promise<AssumeRoleAccountCredentials[]> {
  const assumeRoleAccounts = allAccountsCredentialParams.accountIds.filter(
    account => account !== allAccountsCredentialParams.hostedZoneAccountId,
  );
  const assumeRoleAccountPromises = assumeRoleAccounts.map(accountId =>
    getAssumeRoleCredentials({
      accountId,
      roleName: allAccountsCredentialParams.roleName,
      solutionId: allAccountsCredentialParams.solutionId,
      region: allAccountsCredentialParams.region,
      partition: allAccountsCredentialParams.partition,
      roleSessionName: allAccountsCredentialParams.roleSessionName,
    }),
  );

  return Promise.all(assumeRoleAccountPromises);
}

async function getAssumeRoleCredentials(assumeRoleParams: AssumeRoleParams): Promise<AssumeRoleAccountCredentials> {
  try {
    console.log(
      `Retrieving Credentials for account ${assumeRoleParams.accountId} with role ${assumeRoleParams.roleName}`,
    );
    const stsClient = new STSClient({
      customUserAgent: assumeRoleParams.solutionId,
      region: assumeRoleParams.region,
    });
    const assumeRoleRequestParams = new AssumeRoleCommand({
      RoleArn: `arn:${assumeRoleParams.partition}:iam::${assumeRoleParams.accountId}:role/${assumeRoleParams.roleName}`,
      RoleSessionName: assumeRoleParams.roleSessionName,
    });

    const stsResponse: AssumeRoleCommandOutput = await throttlingBackOff(() => stsClient.send(assumeRoleRequestParams));
    if (
      !stsResponse.Credentials ||
      !stsResponse.Credentials.AccessKeyId ||
      !stsResponse.Credentials.SecretAccessKey ||
      !stsResponse.Credentials.SessionToken
    ) {
      throw new Error(
        `Could Not retrieve credentials for account ${assumeRoleParams.accountId} in region ${assumeRoleParams.region} for role ${assumeRoleParams.roleName}`,
      );
    }
    return {
      account: assumeRoleParams.accountId,
      credentials: {
        accessKeyId: stsResponse.Credentials.AccessKeyId,
        secretAccessKey: stsResponse.Credentials.SecretAccessKey,
        sessionToken: stsResponse.Credentials.SessionToken,
      },
    };
  } catch (err) {
    console.log(err);
    throw err;
  }
}

function setAwsClients(setClientsParams: SetClientsParams): AWSClients {
  const awsClients: AWSClients = setClientsParams.assumeRoleCredentials.reduce(
    (clients: AWSClients, assumeRoleResponse) => {
      const config = {
        credentials: assumeRoleResponse.credentials,
        customUserAgent: setClientsParams.solutionId,
      };

      clients[assumeRoleResponse.account] = {
        ec2Client: new EC2Client(config),
        route53Client: new Route53Client(config),
      };

      return clients;
    },
    {},
  );
  awsClients[setClientsParams.hostedZoneAccountId] = {
    ec2Client: new EC2Client(),
    route53Client: new Route53Client(),
  };

  return awsClients;
}

async function describeVpcsByTagFilters(
  describeVpcByTagFiltersParams: DescribeVpcByTagFiltersParams,
): Promise<VpcItem[]> {
  let filters: Filter[] = [];
  if (describeVpcByTagFiltersParams.tagFilters && describeVpcByTagFiltersParams.tagFilters.length > 0) {
    filters = describeVpcByTagFiltersParams.tagFilters.map(tagFilter => {
      return {
        Name: `tag:${tagFilter.key}`,
        Values: [tagFilter.value],
      };
    });
  }

  const vpcs = await describeVpcsWithFilter(describeVpcByTagFiltersParams.ec2Client, filters);

  return vpcs.map(vpc => {
    const hostedZoneAccountTag = vpc.Tags?.find(tag => tag.Key === 'accelerator:central-endpoints-account-id');
    return {
      account: describeVpcByTagFiltersParams.account,
      hostedZoneAccount: hostedZoneAccountTag?.Value,
      vpc,
    };
  });
}

async function describeVpcsWithFilter(ec2Client: EC2Client, filters: Filter[]) {
  const vpcs = [];
  const describeVpcsInput: DescribeVpcsCommandInput = {
    Filters: filters,
  };
  const describeVpcPagination = paginateDescribeVpcs({ client: ec2Client }, describeVpcsInput);
  for await (const page of describeVpcPagination) {
    if (page.Vpcs) {
      vpcs.push(...page.Vpcs);
    }
  }

  return vpcs;
}

async function getHostedZone(route53Client: Route53Client, hostedZoneId: string): Promise<GetHostedZoneResponse> {
  const getHostedZoneCommand = new GetHostedZoneCommand({
    Id: hostedZoneId,
  });

  return throttlingBackOff(() => route53Client.send(getHostedZoneCommand));
}

async function associateVpcs(vpcsToAssociate: VpcAssociation, awsClients: AWSClients): Promise<void> {
  const hostedZoneAssociationPromises = Object.keys(vpcsToAssociate).map(hostedZoneId =>
    associateVpcsPerHostedZone(vpcsToAssociate[hostedZoneId], awsClients),
  );

  await Promise.all(hostedZoneAssociationPromises);
}

async function associateVpcsPerHostedZone(
  vpcAssociationItem: VpcAssociationItem[],
  clients: AWSClients,
): Promise<void> {
  for (const associationItem of vpcAssociationItem) {
    const route53Client = clients[associationItem.account].route53Client;
    if (associationItem.account === associationItem.hostedZoneAccountId) {
      console.log(`Associating VPC: ${JSON.stringify(associationItem, null, 2)}`);
      await associateVpc(route53Client, associationItem.hostedZoneParams);
    } else {
      console.log(`Associating CrossAccount VPC: ${JSON.stringify(associationItem, null, 2)}`);
      const hostedZoneRoute53Client = clients[associationItem.hostedZoneAccountId].route53Client;
      await associateCrossAccountVpc(hostedZoneRoute53Client, route53Client, associationItem.hostedZoneParams);
    }
  }
}

async function associateVpc(
  route53Client: Route53Client,
  hostedZoneParams: CreateVPCAssociationAuthorizationRequest,
): Promise<void> {
  await throttlingBackOff(() => route53Client.send(new AssociateVPCWithHostedZoneCommand(hostedZoneParams)));
}

async function associateCrossAccountVpc(
  hostedZoneRoute53Client: Route53Client,
  route53Client: Route53Client,
  hostedZoneParams: CreateVPCAssociationAuthorizationRequest,
): Promise<void> {
  await throttlingBackOff(() =>
    hostedZoneRoute53Client.send(new CreateVPCAssociationAuthorizationCommand(hostedZoneParams)),
  );
  // associate VPC with Hosted zones
  console.log(`Associating hosted zone ${hostedZoneParams.HostedZoneId} with VPC ${hostedZoneParams.VPC?.VPCId}...`);
  await throttlingBackOff(() => route53Client.send(new AssociateVPCWithHostedZoneCommand(hostedZoneParams)));
  // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
  await throttlingBackOff(() =>
    hostedZoneRoute53Client.send(new DeleteVPCAssociationAuthorizationCommand(hostedZoneParams)),
  );
}

function findNonAssociatedVpcs(
  vpcs: VpcItem[],
  hostedZones: GetHostedZoneResponse[],
  hostedZoneAccountId: string,
  region: string,
): VpcAssociation {
  const nonAssociatedVpcs: VpcAssociation = {};
  for (const hostedZone of hostedZones) {
    if (!hostedZone.HostedZone?.Id || !hostedZone.VPCs) {
      continue;
    }
    if (!nonAssociatedVpcs[hostedZone.HostedZone.Id]) {
      nonAssociatedVpcs[hostedZone.HostedZone.Id] = [];
    }
    const hostedZoneVpcIds = hostedZone.VPCs.map(vpc => vpc.VPCId);
    const vpcsToAssociate = vpcs.filter(vpc => vpc.vpc.VpcId && !hostedZoneVpcIds.includes(vpc.vpc.VpcId));
    const vpcItemsToAssociate = vpcsToAssociate.map(vpc => {
      return {
        account: vpc.account,
        hostedZoneAccountId,
        hostedZoneParams: {
          HostedZoneId: hostedZone.HostedZone!.Id!,
          VPC: {
            VPCId: vpc.vpc.VpcId!,
            VPCRegion: region,
          },
        },
      };
    });
    if (vpcItemsToAssociate.length > 0) {
      nonAssociatedVpcs[hostedZone.HostedZone.Id].push(...vpcItemsToAssociate);
    }
  }

  return nonAssociatedVpcs;
}
