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
/**
 * propagate-portfolio-associations - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';
import { throttlingBackOff } from '@aws-accelerator/utils';
import { PortfolioAssociationConfig, PortfolioConfig } from '@aws-accelerator/config';

const ssoRolePrefix = '/aws-reserved/sso.amazonaws.com/';

export type CrossAccountClient = {
  serviceCatalog: AWS.ServiceCatalog;
  iam: AWS.IAM;
};

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(event);
  const portfolioId = event.ResourceProperties['portfolioId'];
  const propagator = new AssociationPropagator(event);

  try {
    await propagator.processPropagations();
  } catch (error) {
    console.error(`Failed to propagate principal associations for portfolio ${portfolioId}`);
    console.error(error);
    return {
      PhysicalResourceId: 'none',
      Status: 'FAILED',
    };
  }

  return {
    PhysicalResourceId: 'none',
    Status: 'SUCCESS',
  };
}

export class AssociationPropagator {
  private portfolioId: string;
  private crossAccountRole: string;
  private portfolioDefinition: PortfolioConfig;
  private shareAccountIds: string[];
  private region: string;
  private partition: string;
  private associationsToPropagate: PortfolioAssociationConfig[];
  private requestType: string;

  constructor(event: AWSLambda.CloudFormationCustomResourceEvent) {
    this.portfolioId = event.ResourceProperties['portfolioId'];
    this.crossAccountRole = event.ResourceProperties['crossAccountRole'];
    this.portfolioDefinition = <PortfolioConfig>JSON.parse(event.ResourceProperties['portfolioDefinition']);
    this.shareAccountIds = event.ResourceProperties['shareAccountIds'].split(',');
    this.region = process.env['AWS_REGION']!;
    this.partition = event.ResourceProperties['partition'];
    this.requestType = event.RequestType;
    this.associationsToPropagate = this.getPrincipalsToPropagate();
  }

  public async processPropagations(): Promise<void> {
    for (const accountId of this.shareAccountIds) {
      console.log(`Assuming role ${this.crossAccountRole} in account ${accountId}`);
      const crossAccountCredential = await this.getCrossAccountCredentials(accountId);
      const clients = await this.getCrossAccountClients(crossAccountCredential);
      await this.preprocessPortfolio(clients);
      const existingPrincipalArns = await this.getAssociatedPortfolioPrincipals(clients);
      if (existingPrincipalArns.length > 0) {
        console.log(
          `Found the following principals already associated to portfolio ${
            this.portfolioDefinition.name
          }: ${existingPrincipalArns.join(', ')}`,
        );
      }

      switch (this.requestType) {
        case 'Create':
        case 'Update':
          await this.createUpdatePropagations(accountId, clients, existingPrincipalArns);
          break;
        case 'Delete':
          await this.deletePropagations(accountId, clients, existingPrincipalArns);
      }
    }
  }

  private async createUpdatePropagations(
    accountId: string,
    clients: CrossAccountClient,
    existingPrincipalArns: string[],
  ): Promise<void> {
    for (const principalAssociation of this.associationsToPropagate) {
      const principalArn = await this.getPrincipalArnToAssociate(principalAssociation, accountId, clients.iam);
      if (!existingPrincipalArns.includes(principalArn)) {
        console.log(`Associating principal ${principalArn} with portfolio ${this.portfolioDefinition.name}`);
        await this.createPropagatedAssociation(principalArn, clients);
      } else {
        console.log(
          `Principal ${principalAssociation.name} already associated with portfolio ${this.portfolioDefinition.name}, skipping creation.`,
        );
      }
    }
  }

  private async deletePropagations(
    accountId: string,
    clients: CrossAccountClient,
    existingPrincipalArns: string[],
  ): Promise<void> {
    for (const principalAssociation of this.associationsToPropagate) {
      const principalArn = await this.getPrincipalArnToAssociate(principalAssociation, accountId, clients.iam);
      if (existingPrincipalArns.includes(principalArn)) {
        await this.deletePropagatedAssociation(principalArn, clients);
      } else {
        console.log(
          `Principal ${principalAssociation.name} not associated with portfolio ${this.portfolioDefinition.name}, skipping deletion.`,
        );
      }
    }
  }

  private async preprocessPortfolio(client: CrossAccountClient): Promise<void> {
    const portfolioImported = await this.doesPortfolioExist(this.portfolioId, client);
    if (!portfolioImported) {
      console.log(`Portfolio ${this.portfolioId} not found. Attempting to accept portfolio share.`);
      await this.importPortfolio(client);
    }
  }

  private async importPortfolio(client: CrossAccountClient): Promise<void> {
    try {
      await throttlingBackOff(() =>
        client.serviceCatalog
          .acceptPortfolioShare({
            PortfolioId: this.portfolioId,
            PortfolioShareType: 'IMPORTED',
          })
          .promise(),
      );
    } catch (error) {
      console.error(error);
      console.log('Encountered error attempting to accept portfolio share. Continuing.');
    }
  }

  private async doesPortfolioExist(portfolioId: string, client: CrossAccountClient): Promise<boolean> {
    const importedPortfolioIds = await getAcceptedPortfolioIds(client.serviceCatalog);
    if (importedPortfolioIds.includes(portfolioId)) {
      return true;
    } else {
      return false;
    }
  }

  private async createPropagatedAssociation(principalArn: string, client: CrossAccountClient): Promise<void> {
    try {
      await throttlingBackOff(() =>
        client.serviceCatalog
          .associatePrincipalWithPortfolio({
            PortfolioId: this.portfolioId,
            PrincipalARN: principalArn,
            PrincipalType: 'IAM',
          })
          .promise(),
      );
    } catch (error) {
      console.error(error);
      console.log(`Encountered error attempting to associate ${principalArn} with ${this.portfolioId}. Continuing`);
    }
  }

  private async deletePropagatedAssociation(principalArn: string, client: CrossAccountClient): Promise<void> {
    try {
      await throttlingBackOff(() =>
        client.serviceCatalog
          .disassociatePrincipalFromPortfolio({
            PortfolioId: this.portfolioId,
            PrincipalARN: principalArn,
          })
          .promise(),
      );
    } catch (error) {
      console.error(error);
      console.log(`Encountered error attempting to disassociate ${principalArn} from ${this.portfolioId}. Continuing`);
    }
  }

  private async getAssociatedPortfolioPrincipals(client: CrossAccountClient): Promise<string[]> {
    const principalList: string[] = [];

    let hasNext = true;
    let pageToken: string | undefined = undefined;

    while (hasNext) {
      const response = await throttlingBackOff(() =>
        client.serviceCatalog
          .listPrincipalsForPortfolio({
            PortfolioId: this.portfolioId,
            PageSize: 20,
            PageToken: pageToken,
          })
          .promise(),
      );

      for (const principal of response.Principals ?? []) {
        if (principal.PrincipalType === 'IAM') {
          principalList.push(principal.PrincipalARN!);
        }
      }

      pageToken = response.NextPageToken;
      hasNext = !!pageToken;
    }
    return principalList;
  }

  private getPrincipalsToPropagate(): PortfolioAssociationConfig[] {
    const principalAssociationList = this.portfolioDefinition.portfolioAssociations.filter(
      a => a.propagateAssociation === true,
    );
    return principalAssociationList;
  }

  private async getPrincipalArnToAssociate(
    association: PortfolioAssociationConfig,
    accountId: string,
    iamClient: AWS.IAM,
  ): Promise<string> {
    const associationType = association.type.toLowerCase();
    let roleArn = '';

    if (associationType === 'permissionset') {
      roleArn = await getPermissionSetRoleArn(association.name, accountId, iamClient);
    } else {
      roleArn = `arn:${this.partition}:iam::${accountId}:${associationType}/${association.name}`;
    }
    return roleArn;
  }

  private async getCrossAccountClients(credentials: AWS.STS.Credentials) {
    const iamClient = new AWS.IAM({
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
        expireTime: credentials.Expiration,
      },
    });

    const serviceCatalogClient = new AWS.ServiceCatalog({
      region: this.region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
        expireTime: credentials.Expiration,
      },
    });
    return {
      iam: iamClient,
      serviceCatalog: serviceCatalogClient,
    };
  }

  private async getCrossAccountCredentials(accountId: string): Promise<AWS.STS.Credentials> {
    const stsClient = new AWS.STS({ region: this.region });

    const roleArn = `arn:${this.partition}:iam::${accountId}:role/${this.crossAccountRole}`;
    const assumeRoleCredential = await throttlingBackOff(() =>
      stsClient
        .assumeRole({
          RoleArn: roleArn,
          RoleSessionName: 'acceleratorAssumeRoleSession',
        })
        .promise(),
    );
    return assumeRoleCredential.Credentials!;
  }
}

export async function getPermissionSetRoleArn(
  permissionSetName: string,
  account: string,
  iamClient: AWS.IAM,
): Promise<string> {
  const iamRoleList = await getIamRoleList(iamClient);
  const roleArn = iamRoleList.find(role => {
    const regex = new RegExp(`AWSReservedSSO_${permissionSetName}_([0-9a-fA-F]{16})`);
    const match = regex.test(role.RoleName);
    console.log(`Test ${role} for pattern ${regex} result: ${match}`);
    return match;
  })?.Arn;

  if (roleArn) {
    console.log(`Found provisioned role for permission set ${permissionSetName} with ARN: ${roleArn}`);
  } else {
    throw new Error(`Unable to find provisioned role for permission set ${permissionSetName} in account ${account}`);
  }

  return roleArn;
}

export async function getIamRoleList(iamClient: AWS.IAM): Promise<AWS.IAM.Role[]> {
  const roleList = [];

  let hasNext = true;
  let marker: string | undefined = undefined;

  while (hasNext) {
    const response = await throttlingBackOff(() =>
      iamClient.listRoles({ PathPrefix: ssoRolePrefix, Marker: marker }).promise(),
    );

    // Add roles returned in this paged response
    roleList.push(...response.Roles);

    marker = response.Marker;
    hasNext = !!marker;
  }
  return roleList;
}

export async function getAcceptedPortfolioIds(scClient: AWS.ServiceCatalog): Promise<string[]> {
  const importedShares = await listAcceptedShares(scClient, 'IMPORTED');
  const organizationShares = await listAcceptedShares(scClient, 'AWS_ORGANIZATIONS');

  return [...importedShares, ...organizationShares];
}

export async function listAcceptedShares(
  scClient: AWS.ServiceCatalog,
  shareType: 'IMPORTED' | 'AWS_ORGANIZATIONS',
): Promise<string[]> {
  const shareList: string[] = [];

  let hasNext = true;
  let marker: string | undefined = undefined;

  while (hasNext) {
    const response = await throttlingBackOff(() =>
      scClient.listAcceptedPortfolioShares({ PageToken: marker, PortfolioShareType: shareType }).promise(),
    );

    response.PortfolioDetails;

    // Add portfolios returned in this paged response
    if (response.PortfolioDetails) {
      shareList.push(...response.PortfolioDetails.map(a => a.Id!));
    }

    marker = response.NextPageToken;
    hasNext = !!marker;
  }
  return shareList;
}
