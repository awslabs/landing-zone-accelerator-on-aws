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

import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { PortfolioAssociationConfig, PortfolioConfig, ProductConfig } from '@aws-accelerator/config';
import {
  IdentityCenterGetPermissionRoleArn,
  IdentityCenterGetPermissionRoleArnProvider,
  SharePortfolioWithOrg,
  PropagatePortfolioAssociations,
} from '@aws-accelerator/constructs';

export class CustomizationsStack extends AcceleratorStack {
  /**
   * StackSet Administrator Account Id
   */
  private stackSetAdministratorAccount: string;

  /**
   * KMS Key used to encrypt CloudWatch logs
   */
  private cloudwatchKey: cdk.aws_kms.Key;

  /**
   * Constructor for CustomizationsStack
   *
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);
    this.props = props;
    this.stackSetAdministratorAccount = props.accountsConfig.getManagementAccountId();
    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
      ),
    ) as cdk.aws_kms.Key;

    // Create CloudFormation StackSets
    if (props.customizationsConfig?.customizations?.cloudFormationStackSets) {
      this.deployCustomStackSets();
    }

    // Create Service Catalog Portfolios
    if (props.customizationsConfig?.customizations?.serviceCatalogPortfolios?.length > 0) {
      const serviceToken = this.getPortfolioAssociationsRoleArnProviderServiceToken();
      this.createServiceCatalogResources(serviceToken);
    }

    this.logger.info('Completed stack synthesis');
  }

  private getAssetUrl(stacksetName: string, localPath: string): string {
    const asset = new cdk.aws_s3_assets.Asset(this, pascalCase(`${stacksetName}Asset`), {
      path: path.join(this.props.configDirPath, localPath),
    });
    return asset.httpUrl;
  }

  //
  // Create custom CloudFormation StackSets
  //
  private deployCustomStackSets() {
    this.logger.info(`[customizations-stack] Deploying CloudFormation StackSets`);
    if (
      this.account === this.stackSetAdministratorAccount &&
      this.props.globalConfig.homeRegion == cdk.Stack.of(this).region &&
      this.props.customizationsConfig?.customizations?.cloudFormationStackSets
    ) {
      const customStackSetList = this.props.customizationsConfig.customizations.cloudFormationStackSets;
      for (const stackSet of customStackSetList ?? []) {
        this.logger.info(`New stack set ${stackSet.name}`);
        const deploymentTargetAccounts: string[] | undefined = this.getAccountIdsFromDeploymentTarget(
          stackSet.deploymentTargets,
        );
        const templateUrl = this.getAssetUrl(stackSet.name, stackSet.template);

        const parameters = stackSet.parameters?.map(parameter => {
          return { parameterKey: parameter.name, parameterValue: parameter.value };
        });

        new cdk.aws_cloudformation.CfnStackSet(
          this,
          pascalCase(`${this.props.prefixes.accelerator}-Custom-${stackSet.name}`),
          {
            permissionModel: 'SELF_MANAGED',
            stackSetName: stackSet.name,
            capabilities: stackSet.capabilities,
            description: stackSet.description,
            operationPreferences: {
              failureTolerancePercentage: 25,
              maxConcurrentPercentage: 35,
              regionConcurrencyType: 'PARALLEL',
            },
            stackInstancesGroup: [
              {
                deploymentTargets: {
                  accounts: deploymentTargetAccounts,
                },
                regions: stackSet.regions,
              },
            ],
            templateUrl: templateUrl,
            parameters,
          },
        );
      }
    }
  }

  /**
   * Create Service Catalog resources
   */
  private createServiceCatalogResources(serviceToken: string) {
    const serviceCatalogPortfolios = this.props.customizationsConfig?.customizations?.serviceCatalogPortfolios;
    for (const portfolioItem of serviceCatalogPortfolios ?? []) {
      const regions = portfolioItem.regions.map(item => {
        return item.toString();
      });
      const accountId = this.props.accountsConfig.getAccountId(portfolioItem.account);
      if (accountId === cdk.Stack.of(this).account && regions.includes(cdk.Stack.of(this).region)) {
        // Create portfolios
        const portfolio = this.createPortfolios(portfolioItem);

        // Create portfolio shares
        this.createPortfolioShares(portfolio, portfolioItem);

        // Create products for the portfolio
        this.createPortfolioProducts(portfolio, portfolioItem);

        // Create portfolio associations
        this.createPortfolioAssociations(portfolio, portfolioItem, serviceToken);
      }
    }
  }

  /**
   * Create Service Catalog portfolios
   * @param portfolio
   * @param portfolioItem
   */
  private createPortfolios(portfolioItem: PortfolioConfig): cdk.aws_servicecatalog.Portfolio {
    this.logger.info(`Creating Service Catalog portfolio ${portfolioItem.name}`);

    // Create portfolio TagOptions
    let tagOptions: cdk.aws_servicecatalog.TagOptions | undefined = undefined;
    if (portfolioItem.tagOptions) {
      const tagOptionsTags: { [key: string]: string[] } = {};
      portfolioItem.tagOptions.forEach(tag => (tagOptionsTags[tag.key] = tag.values));
      tagOptions = new cdk.aws_servicecatalog.TagOptions(this, pascalCase(`${portfolioItem.name}TagOptions`), {
        allowedValuesForTags: tagOptionsTags,
      });
    }

    // Create portfolio
    const portfolio = new cdk.aws_servicecatalog.Portfolio(this, pascalCase(`${portfolioItem.name}Portfolio`), {
      displayName: portfolioItem.name,
      providerName: portfolioItem.provider,
      tagOptions,
    });

    this.ssmParameters.push({
      logicalId: pascalCase(`SsmParam${portfolioItem.name}PortfolioId`),
      parameterName: `${this.props.prefixes.ssmParamName}/servicecatalog/portfolios/${portfolioItem.name}/id`,
      stringValue: portfolio.portfolioId,
    });
    return portfolio;
  }

  /**
   * Create account and OU-level Service Catalog portfolio shares
   * @param portfolio
   * @param portfolioItem
   */
  private createPortfolioShares(portfolio: cdk.aws_servicecatalog.Portfolio, portfolioItem: PortfolioConfig): void {
    // Create account shares
    if (portfolioItem.shareTargets) {
      // share portfolio with accounts via native CDK
      for (const account of portfolioItem?.shareTargets?.accounts ?? []) {
        const accountId = this.props.accountsConfig.getAccountId(account);
        if (accountId !== cdk.Stack.of(this).account) {
          portfolio.shareWithAccount(accountId, {
            shareTagOptions: portfolioItem.shareTagOptions ?? false,
          });
        }
      }

      // share portfolio with organizational units via Custom Resource
      const managementAccountId = this.props.accountsConfig.getManagementAccountId();
      if (cdk.Stack.of(this).account === managementAccountId) {
        const organizationalUnitIds: string[] = [];
        let shareToEntireOrg = false;
        for (const ou of portfolioItem?.shareTargets?.organizationalUnits ?? []) {
          if (ou === 'Root') {
            shareToEntireOrg = true;
          } else {
            organizationalUnitIds.push(this.props.organizationConfig.getOrganizationalUnitId(ou));
          }
        }
        if (organizationalUnitIds.length > 0 || shareToEntireOrg) {
          const portfolioOrgShare = new SharePortfolioWithOrg(this, `${portfolioItem.name}-Share`, {
            portfolioId: portfolio.portfolioId,
            organizationalUnitIds: organizationalUnitIds,
            tagShareOptions: portfolioItem.shareTagOptions ?? false,
            organizationId: shareToEntireOrg && this.organizationId ? this.organizationId : '',
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
          portfolioOrgShare.node.addDependency(portfolio);
        }
      }
    }
  }

  /**
   * Create Service Catalog products
   * @param portfolio
   * @param portfolioItem
   */
  private createPortfolioProducts(portfolio: cdk.aws_servicecatalog.Portfolio, portfolioItem: PortfolioConfig): void {
    // Get the Product Version list
    for (const productItem of portfolioItem.products ?? []) {
      const productVersions = this.getPortfolioProductVersions(productItem);

      // Create product TagOptions
      const tagOptions = this.getPortfolioProductTagOptions(productItem);

      //Create a Service Catalog Cloudformation Product.
      this.logger.info(`Creating product ${productItem.name} in Service Catalog portfolio ${portfolioItem.name}`);
      const product = new cdk.aws_servicecatalog.CloudFormationProduct(
        this,
        pascalCase(`${portfolioItem.name}Portfolio${productItem.name}Product`),
        {
          productName: productItem.name,
          owner: productItem.owner,
          distributor: productItem.distributor,
          productVersions,
          description: productItem.description,
          supportDescription: productItem.support?.description,
          supportEmail: productItem.support?.email,
          supportUrl: productItem.support?.url,
          tagOptions,
        },
      );

      //Associate Portfolio with the Product.
      portfolio.addProduct(product);
    }
  }

  /**
   * Get list of Service Catalog portfolio product versions
   * @param portfolio
   * @param portfolioItem
   */
  private getPortfolioProductVersions(
    productItem: ProductConfig,
  ): cdk.aws_servicecatalog.CloudFormationProductVersion[] {
    const productVersions: cdk.aws_servicecatalog.CloudFormationProductVersion[] = [];
    for (const productVersionItem of productItem.versions ?? []) {
      productVersions.push({
        productVersionName: productVersionItem.name,
        description: productVersionItem.description,
        cloudFormationTemplate: cdk.aws_servicecatalog.CloudFormationTemplate.fromAsset(
          path.join(this.props.configDirPath, productVersionItem.template),
        ),
        validateTemplate: true,
      });
    }
    return productVersions;
  }

  /**
   * Get Service Catalog tag options
   * @param portfolio
   * @param portfolioItem
   */
  private getPortfolioProductTagOptions(productItem: ProductConfig): cdk.aws_servicecatalog.TagOptions | undefined {
    let tagOptions: cdk.aws_servicecatalog.TagOptions | undefined = undefined;
    if (productItem.tagOptions) {
      const tagOptionsTags: { [key: string]: string[] } = {};
      productItem.tagOptions.forEach(tag => (tagOptionsTags[tag.key] = tag.values));
      tagOptions = new cdk.aws_servicecatalog.TagOptions(this, pascalCase(`${productItem.name}TagOptions`), {
        allowedValuesForTags: tagOptionsTags,
      });
    }
    return tagOptions;
  }

  /**
   * Get service token of the IdentityCenterGetPermissionRoleArnProvider
   */
  private getPortfolioAssociationsRoleArnProviderServiceToken(): string {
    const provider = new IdentityCenterGetPermissionRoleArnProvider(
      this,
      'Custom::PortfolioAssociationsRoleArnProvider',
    );
    return provider.serviceToken;
  }

  /**
   * Create portfolio principal associations
   * @param portfolio
   * @param portfolioItem
   * @param serviceToken
   */
  private createPortfolioAssociations(
    portfolio: cdk.aws_servicecatalog.Portfolio,
    portfolioItem: PortfolioConfig,
    serviceToken: string,
  ): void {
    // Add portfolio Associations
    let propagateAssociationsFlag = false;
    for (const portfolioAssociation of portfolioItem.portfolioAssociations ?? []) {
      const principalType = 'IAM';

      const principalArn = this.getPrincipalArnForAssociation(portfolioAssociation, portfolioItem.name, serviceToken);
      new cdk.aws_servicecatalog.CfnPortfolioPrincipalAssociation(
        this,
        `${portfolioItem.name}-${portfolioAssociation.name}-${portfolioAssociation.type}`,
        {
          portfolioId: portfolio.portfolioId,
          principalArn: principalArn,
          principalType: principalType,
        },
      );

      if (portfolioAssociation.propagateAssociation) {
        propagateAssociationsFlag = true;
      }
    }

    if (propagateAssociationsFlag) {
      this.propagatePortfolioAssociations(portfolio, portfolioItem);
    }
  }

  /**
   * Get the IAM resource ARN to associate with a portfolio
   * @param portfolioAssociation
   * @param portfolioName
   * @param serviceToken
   */
  private getPrincipalArnForAssociation(
    portfolioAssociation: PortfolioAssociationConfig,
    portfolioName: string,
    serviceToken: string,
  ): string {
    const associationType = portfolioAssociation.type.toLowerCase();
    const account = cdk.Stack.of(this).account;
    const partition = cdk.Stack.of(this).partition;
    let principalArn = '';

    if (associationType === 'permissionset') {
      principalArn = this.getPermissionSetRoleArn(portfolioName, portfolioAssociation.name, account, serviceToken);
      if (principalArn === '') {
        throw new Error(
          `Role ARN for SSO Permission Set ${portfolioAssociation.name} not found for Service Catalog portfolio ${portfolioName}`,
        );
      }
    } else {
      principalArn = `arn:${partition}:iam::${account}:${associationType}/${portfolioAssociation.name}`;
    }
    return principalArn;
  }

  /**
   * Retrieve the ARN of an IAM Role associated with an SSO Permission Set
   * @param permissionSetName
   * @param accountId
   * @param serviceToken
   */
  private getPermissionSetRoleArn(
    portfolioName: string,
    permissionSetName: string,
    accountId: string,
    serviceToken: string,
  ): string {
    this.logger.info(
      `Looking up IAM Role ARN associated with AWS Identity Center Permission Set ${permissionSetName} in account ${accountId}`,
    );
    const permissionSetRoleArn = new IdentityCenterGetPermissionRoleArn(
      this,
      pascalCase(`${portfolioName}-${permissionSetName}-${accountId}`),
      {
        permissionSetName: permissionSetName,
        accountId: accountId,
        serviceToken: serviceToken,
      },
    );
    return permissionSetRoleArn.roleArn;
  }

  /**
   * Propagate the IAM Principal Associations to other AWS accounts the portfolio is shared with
   * @param portfolio
   * @param portfolioItem
   */
  private propagatePortfolioAssociations(
    portfolio: cdk.aws_servicecatalog.Portfolio,
    portfolioItem: PortfolioConfig,
  ): void {
    // propagate portfolio Associations
    if (!portfolioItem.shareTargets) {
      this.logger.warn(
        `Cannot propagate principal associations for portfolio ${portfolioItem.name} because portfolio has no shareTargets`,
      );
      return;
    }

    this.logger.info(`Propagating portfolio associations for portfolio ${portfolioItem.name}`);
    const propagateAssociations = new PropagatePortfolioAssociations(this, `${portfolioItem.name}-Propagation`, {
      shareAccountIds: this.getAccountIdsFromShareTarget(portfolioItem.shareTargets),
      crossAccountRole: this.acceleratorResourceNames.roles.crossAccountServiceCatalogPropagation,
      portfolioId: portfolio.portfolioId,
      portfolioDefinition: portfolioItem,
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
    });
    propagateAssociations.node.addDependency(portfolio);
  }
}
