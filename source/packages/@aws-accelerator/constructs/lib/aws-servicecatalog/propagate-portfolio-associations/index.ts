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
 * propagate-portfolio-associations - lambda handler
 *
 * @param event
 * @returns
 */

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { getCrossAccountCredentials, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { PortfolioAssociationConfig, PortfolioConfig } from '@aws-accelerator/config';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  AcceptPortfolioShareCommand,
  AssociatePrincipalWithPortfolioCommand,
  DisassociatePrincipalFromPortfolioCommand,
  paginateListPrincipalsForPortfolio,
  paginateListAcceptedPortfolioShares,
  ServiceCatalogClient,
} from '@aws-sdk/client-service-catalog';
import { IAMClient, paginateListRoles } from '@aws-sdk/client-iam';
import { AssumeRoleCommandOutput } from '@aws-sdk/client-sts';

const ssoRolePrefix = '/aws-reserved/sso.amazonaws.com/';

export type CrossAccountClient = {
  serviceCatalog: ServiceCatalogClient;
  iam: IAMClient;
};

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
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

  constructor(event: CloudFormationCustomResourceEvent) {
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
      const crossAccountCredential = await getCrossAccountCredentials(
        accountId,
        this.region,
        this.partition,
        this.crossAccountRole,
      );
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
      console.warn(
        `deletePropagations existingPrincipalArns: ${JSON.stringify(
          existingPrincipalArns,
        )}, principalArn: ${principalArn}`,
      );
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
        client.serviceCatalog.send(
          new AcceptPortfolioShareCommand({
            PortfolioId: this.portfolioId,
            PortfolioShareType: 'IMPORTED',
          }),
        ),
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
        client.serviceCatalog.send(
          new AssociatePrincipalWithPortfolioCommand({
            PortfolioId: this.portfolioId,
            PrincipalARN: principalArn,
            PrincipalType: 'IAM',
          }),
        ),
      );
    } catch (error) {
      console.error(error);
      console.log(`Encountered error attempting to associate ${principalArn} with ${this.portfolioId}. Continuing`);
    }
  }

  private async deletePropagatedAssociation(principalArn: string, client: CrossAccountClient): Promise<void> {
    try {
      await throttlingBackOff(() =>
        client.serviceCatalog.send(
          new DisassociatePrincipalFromPortfolioCommand({
            PortfolioId: this.portfolioId,
            PrincipalARN: principalArn,
          }),
        ),
      );
    } catch (error) {
      console.error(error);
      console.log(`Encountered error attempting to disassociate ${principalArn} from ${this.portfolioId}. Continuing`);
    }
  }

  private async getAssociatedPortfolioPrincipals(client: CrossAccountClient): Promise<string[]> {
    const principalList: string[] = [];
    for await (const page of paginateListPrincipalsForPortfolio(
      { client: client.serviceCatalog },
      { PortfolioId: this.portfolioId },
    )) {
      for (const principal of page.Principals ?? []) {
        if (principal.PrincipalType === 'IAM') {
          principalList.push(principal.PrincipalARN!);
        }
      }
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
    iamClient: IAMClient,
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

  private async getCrossAccountClients(crossAccountCredentials: AssumeRoleCommandOutput) {
    const credentials = {
      accessKeyId: crossAccountCredentials.Credentials!.AccessKeyId!,
      secretAccessKey: crossAccountCredentials.Credentials!.SecretAccessKey!,
      sessionToken: crossAccountCredentials.Credentials!.SessionToken!,
    };
    const iamClient = new IAMClient({
      credentials,
      retryStrategy: setRetryStrategy(),
    });

    const serviceCatalogClient = new ServiceCatalogClient({
      region: this.region,
      credentials,
      retryStrategy: setRetryStrategy(),
    });
    return {
      iam: iamClient,
      serviceCatalog: serviceCatalogClient,
    };
  }
}

export async function getPermissionSetRoleArn(
  permissionSetName: string,
  account: string,
  iamClient: IAMClient,
): Promise<string> {
  const regex = new RegExp(`AWSReservedSSO_${permissionSetName}_([0-9a-fA-F]{16})`);
  const roles = await getIamRoleList(iamClient, ssoRolePrefix);
  const foundRole = roles.find(role => {
    const match = regex.test(role.RoleName!);
    console.log(`Test ${JSON.stringify(role)} for pattern ${regex} result: ${match}`);
    return match;
  });
  const roleArn = foundRole?.Arn ?? undefined;

  if (roleArn) {
    console.log(`Found provisioned role for permission set ${permissionSetName} with ARN: ${roleArn}`);
  } else {
    throw new Error(`Unable to find provisioned role for permission set ${permissionSetName} in account ${account}`);
  }

  return roleArn;
}

export async function getIamRoleList(iamClient: IAMClient, prefix: string) {
  const roleList = [];
  for await (const page of paginateListRoles({ client: iamClient }, { PathPrefix: prefix })) {
    if (page.Roles) {
      roleList.push(...page.Roles);
    }
  }
  return roleList;
}

export async function getAcceptedPortfolioIds(scClient: ServiceCatalogClient): Promise<string[]> {
  const importedShares = await listAcceptedShares(scClient, 'IMPORTED');
  const organizationShares = await listAcceptedShares(scClient, 'AWS_ORGANIZATIONS');

  return [...importedShares, ...organizationShares];
}

export async function listAcceptedShares(
  scClient: ServiceCatalogClient,
  shareType: 'IMPORTED' | 'AWS_ORGANIZATIONS',
): Promise<string[]> {
  const shareList: string[] = [];
  for await (const page of paginateListAcceptedPortfolioShares(
    { client: scClient },
    { PortfolioShareType: shareType },
  )) {
    if (page.PortfolioDetails) {
      shareList.push(...page.PortfolioDetails.map(a => a.Id!));
    }
  }
  return shareList;
}
