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
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as winston from 'winston';

import {
  AccountsConfig,
  BlockDeviceMappingItem,
  CustomizationsConfig,
  DeploymentTargets,
  EbsItemConfig,
  GlobalConfig,
  IamConfig,
  LifeCycleRule,
  NetworkConfig,
  NetworkConfigTypes,
  OrganizationConfig,
  Region,
  SecurityConfig,
  ShareTargets,
  VpcConfig,
  VpcTemplatesConfig,
} from '@aws-accelerator/config';
import { Organization, S3LifeCycleRule } from '@aws-accelerator/constructs';
import { createLogger, policyReplacements, SsmParameterPath, SsmResourceType } from '@aws-accelerator/utils';

import { version } from '../../../../../package.json';
import { AcceleratorResourceNames } from '../accelerator-resource-names';

export interface AcceleratorStackProps extends cdk.StackProps {
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly customizationsConfig: CustomizationsConfig;
  readonly partition: string;
  readonly configRepositoryName: string;
  readonly qualifier?: string;
  readonly configCommitId?: string;
  readonly globalRegion: string;
  readonly centralizedLoggingRegion: string;
  /**
   * Accelerator resource name prefixes
   */
  readonly prefixes: {
    /**
     * Use this prefix value to name resources like -
     AWS IAM Role names, AWS Lambda Function names, AWS Cloudwatch log groups names, AWS CloudFormation stack names, AWS CodePipeline names, AWS CodeBuild project names
     *
     */
    readonly accelerator: string;
    /**
     * Use this prefix value to name AWS CodeCommit repository
     */
    readonly repoName: string;
    /**
     * Use this prefix value to name AWS S3 bucket
     */
    readonly bucketName: string;
    /**
     * Use this prefix value to name AWS SSM parameter
     */
    readonly ssmParamName: string;
    /**
     * Use this prefix value to name AWS KMS alias
     */
    readonly kmsAlias: string;
    /**
     * Use this prefix value to name AWS SNS topic
     */
    readonly snsTopicName: string;
    /**
     * Use this prefix value to name AWS Secrets
     */
    readonly secretName: string;
    /**
     * Use this prefix value to name AWS CloudTrail CloudWatch log group
     */
    readonly trailLogName: string;
    /**
     * Use this prefix value to name AWS Glue database
     */
    readonly databaseName: string;
  };
  readonly enableSingleAccountMode: boolean;
}

process.on('uncaughtException', err => {
  const logger = createLogger(['accelerator']);
  logger.error(err);
  throw new Error('Synthesis failed');
});

export abstract class AcceleratorStack extends cdk.Stack {
  protected logger: winston.Logger;
  protected props: AcceleratorStackProps;

  /**
   * Accelerator SSM parameters
   * This array is used to store SSM parameters that are created per-stack.
   */
  protected ssmParameters: { logicalId: string; parameterName: string; stringValue: string }[];

  public acceleratorResourceNames: AcceleratorResourceNames;

  protected constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.logger = createLogger([cdk.Stack.of(this).stackName]);
    this.props = props;
    this.ssmParameters = [];

    //
    // Initialize resource names
    this.acceleratorResourceNames = new AcceleratorResourceNames({ prefixes: props.prefixes });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: this.getSsmPath(SsmResourceType.STACK_ID, [cdk.Stack.of(this).stackName]),
      stringValue: cdk.Stack.of(this).stackId,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: this.getSsmPath(SsmResourceType.VERSION, [cdk.Stack.of(this).stackName]),
      stringValue: version,
    });
  }

  /**
   * This method creates SSM parameters stored in the `AcceleratorStack.ssmParameters` array.
   * If more than five parameters are defined, the method adds a `dependsOn` statement
   * to remaining parameters in order to avoid API throttling issues.
   */
  protected createSsmParameters(): void {
    let index = 1;
    const parameterMap = new Map<number, cdk.aws_ssm.StringParameter>();

    for (const parameterItem of this.ssmParameters) {
      // Create parameter
      const parameter = new cdk.aws_ssm.StringParameter(this, parameterItem.logicalId, {
        parameterName: parameterItem.parameterName,
        stringValue: parameterItem.stringValue,
      });
      parameterMap.set(index, parameter);

      // Add a dependency for every 5 parameters
      if (index > 5) {
        const dependsOnParam = parameterMap.get(index - (index % 5));
        if (!dependsOnParam) {
          this.logger.error(
            `Error creating SSM parameter ${parameterItem.parameterName}: previous SSM parameter undefined`,
          );
          throw new Error(`Configuration validation failed at runtime.`);
        }
        parameter.node.addDependency(dependsOnParam);
      }
      // Increment index
      index += 1;
    }
  }

  public isIncluded(deploymentTargets: DeploymentTargets): boolean {
    // Explicit Denies
    if (
      this.isRegionExcluded(deploymentTargets.excludedRegions) ||
      this.isAccountExcluded(deploymentTargets.excludedAccounts)
    ) {
      return false;
    }

    // Explicit Allows
    if (
      this.isAccountIncluded(deploymentTargets.accounts) ||
      this.isOrganizationalUnitIncluded(deploymentTargets.organizationalUnits)
    ) {
      return true;
    }

    // Implicit Deny
    return false;
  }
  protected getAccountNamesFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountNames: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          accountNames.push(account.name);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            accountNames.push(account.name);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      accountNames.push(account);
    }

    return [...new Set(accountNames)];
  }

  // Helper function to add an account id to the list
  private _addAccountId(ids: string[], accountId: string) {
    if (!ids.includes(accountId)) {
      ids.push(accountId);
    }
  }

  public getAccountIdsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      // debug: processing ou
      if (ou === 'Root') {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          const accountId = this.props.accountsConfig.getAccountId(account.name);
          this._addAccountId(accountIds, accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            this._addAccountId(accountIds, accountId);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      this._addAccountId(accountIds, accountId);
    }

    const excludedAccountIds = this.getExcludedAccountIds(deploymentTargets);
    const filteredAccountIds = accountIds.filter(item => !excludedAccountIds.includes(item));

    return filteredAccountIds;
  }

  protected getExcludedAccountIds(deploymentTargets: DeploymentTargets): string[] {
    const accountIds: string[] = [];

    if (deploymentTargets.excludedAccounts) {
      deploymentTargets.excludedAccounts.forEach(account =>
        this._addAccountId(accountIds, this.props.accountsConfig.getAccountId(account)),
      );
    }

    return accountIds;
  }

  public getRegionsFromDeploymentTarget(deploymentTargets: DeploymentTargets): Region[] {
    const regions: Region[] = [];
    const enabledRegions = this.props.globalConfig.enabledRegions;
    regions.push(
      ...enabledRegions.filter(region => {
        return !deploymentTargets?.excludedRegions?.includes(region);
      }),
    );
    return regions;
  }

  public getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
    let vpcAccountIds: string[];

    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      vpcAccountIds = [this.props.accountsConfig.getAccountId(vpcItem.account)];
    } else {
      const excludedAccountIds = this.getExcludedAccountIds(vpcItem.deploymentTargets);
      vpcAccountIds = this.getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets).filter(
        item => !excludedAccountIds.includes(item),
      );
    }

    return vpcAccountIds;
  }

  public getAccountIdsFromShareTarget(shareTargets: ShareTargets): string[] {
    const accountIds: string[] = [];

    for (const ou of shareTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          const accountId = this.props.accountsConfig.getAccountId(account.name);
          this._addAccountId(accountIds, accountId);
        }
      } else {
        for (const account of [
          ...this.props.accountsConfig.mandatoryAccounts,
          ...this.props.accountsConfig.workloadAccounts,
        ]) {
          if (ou === account.organizationalUnit) {
            const accountId = this.props.accountsConfig.getAccountId(account.name);
            this._addAccountId(accountIds, accountId);
          }
        }
      }
    }

    for (const account of shareTargets.accounts ?? []) {
      const accountId = this.props.accountsConfig.getAccountId(account);
      this._addAccountId(accountIds, accountId);
    }

    return accountIds;
  }

  protected isRegionExcluded(regions: string[]): boolean {
    if (regions?.includes(cdk.Stack.of(this).region)) {
      this.logger.info(`${cdk.Stack.of(this).region} region explicitly excluded`);
      return true;
    }
    return false;
  }

  public isAccountExcluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        this.logger.info(`${account} account explicitly excluded`);
        return true;
      }
    }
    return false;
  }

  protected isAccountIncluded(accounts: string[]): boolean {
    for (const account of accounts ?? []) {
      if (cdk.Stack.of(this).account === this.props.accountsConfig.getAccountId(account)) {
        const accountConfig = this.props.accountsConfig.getAccount(account);
        if (this.props.organizationConfig.isIgnored(accountConfig.organizationalUnit)) {
          this.logger.info(`Account ${account} was not included as it is a member of an ignored organizational unit.`);
          return false;
        }
        this.logger.info(`${account} account explicitly included`);
        return true;
      }
    }
    return false;
  }

  protected isOrganizationalUnitIncluded(organizationalUnits: string[]): boolean {
    if (organizationalUnits) {
      // Full list of all accounts
      const accounts = [...this.props.accountsConfig.mandatoryAccounts, ...this.props.accountsConfig.workloadAccounts];

      // Find the account with the matching ID
      const account = accounts.find(
        item => this.props.accountsConfig.getAccountId(item.name) === cdk.Stack.of(this).account,
      );

      if (account) {
        if (organizationalUnits.indexOf(account.organizationalUnit) != -1 || organizationalUnits.includes('Root')) {
          const ignored = this.props.organizationConfig.isIgnored(account.organizationalUnit);
          if (ignored) {
            this.logger.info(`${account.organizationalUnit} is ignored and not included`);
          }
          this.logger.info(`${account.organizationalUnit} organizational unit included`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Function to get S3 life cycle rules
   * @param lifecycleRules
   * @returns
   */
  protected getS3LifeCycleRules(lifecycleRules: LifeCycleRule[] | undefined): S3LifeCycleRule[] {
    const rules: S3LifeCycleRule[] = [];
    for (const lifecycleRule of lifecycleRules ?? []) {
      const noncurrentVersionTransitions = [];
      for (const noncurrentVersionTransition of lifecycleRule.noncurrentVersionTransitions ?? []) {
        noncurrentVersionTransitions.push({
          storageClass: noncurrentVersionTransition.storageClass,
          transitionAfter: noncurrentVersionTransition.transitionAfter,
        });
      }
      const transitions = [];
      for (const transition of lifecycleRule.transitions ?? []) {
        transitions.push({
          storageClass: transition.storageClass,
          transitionAfter: transition.transitionAfter,
        });
      }
      const rule: S3LifeCycleRule = {
        abortIncompleteMultipartUploadAfter: lifecycleRule.abortIncompleteMultipartUpload,
        enabled: lifecycleRule.enabled,
        expiration: lifecycleRule.expiration,
        expiredObjectDeleteMarker: lifecycleRule.expiredObjectDeleteMarker,
        id: lifecycleRule.id,
        noncurrentVersionExpiration: lifecycleRule.noncurrentVersionExpiration,
        noncurrentVersionTransitions,
        transitions,
      };
      rules.push(rule);
    }
    return rules;
  }

  /**
   * Returns the ID of the AWS Organization, if enabled
   * @returns
   */
  protected getOrganizationId(): string | undefined {
    if (this.props.organizationConfig.enable) {
      return new Organization(this, 'Organization').id;
    }
    return undefined;
  }

  /**
   * Returns the SSM parameter path for the given resource type and replacement strings.
   * @see {@link SsmParameterPath} for resource type schema
   *
   * @param resourceType
   * @param replacements
   * @returns
   */
  public getSsmPath(resourceType: SsmResourceType, replacements: string[]) {
    // Prefix applied to all SSM parameters
    // Static for now, but leaving option to modify for future iterations
    const ssmPrefix = this.props.prefixes.ssmParamName;
    return new SsmParameterPath(ssmPrefix, resourceType, replacements).parameterPath;
  }

  /**
   * Function to get list of targets by type organization unit or account for given scp
   * @param targetName
   * @param targetType
   * @returns
   */
  protected getScpNamesForTarget(targetName: string, targetType: 'ou' | 'account'): string[] {
    const scps: string[] = [];

    for (const serviceControlPolicy of this.props.organizationConfig.serviceControlPolicies) {
      if (targetType === 'ou' && serviceControlPolicy.deploymentTargets.organizationalUnits) {
        if (serviceControlPolicy.deploymentTargets.organizationalUnits.indexOf(targetName) !== -1) {
          scps.push(serviceControlPolicy.name);
        }
      }
      if (targetType === 'account' && serviceControlPolicy.deploymentTargets.accounts) {
        if (serviceControlPolicy.deploymentTargets.accounts.indexOf(targetName) !== -1) {
          scps.push(serviceControlPolicy.name);
        }
      }
    }
    return scps;
  }

  /**
   * Get the IAM condition context key for the organization.
   */
  protected getPrincipalOrgIdCondition(organizationId: string | undefined): { [key: string]: string | string[] } {
    if (this.props.partition === 'aws-cn' || !this.props.organizationConfig.enable) {
      const accountIds = this.props.accountsConfig.getAccountIds();
      if (accountIds) {
        return {
          'aws:PrincipalAccount': accountIds,
        };
      }
    }
    if (organizationId) {
      return {
        'aws:PrincipalOrgID': organizationId,
      };
    }
    this.logger.error('Organization ID not found or account IDs not found');
    throw new Error(`Configuration validation failed at runtime.`);
  }

  /**
   * Get the IAM principals for the organization.
   */
  public getOrgPrincipals(organizationId: string | undefined): cdk.aws_iam.IPrincipal {
    if (this.props.partition === 'aws-cn' || !this.props.organizationConfig.enable) {
      const accountIds = this.props.accountsConfig.getAccountIds();
      if (accountIds) {
        const principals: cdk.aws_iam.PrincipalBase[] = [];
        accountIds.forEach(accountId => {
          principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
        });
        return new cdk.aws_iam.CompositePrincipal(...principals);
      }
    }
    if (organizationId) {
      return new cdk.aws_iam.OrganizationPrincipal(organizationId);
    }
    this.logger.error('Organization ID not found or account IDs not found');
    throw new Error(`Configuration validation failed at runtime.`);
  }

  /**
   * Generate policy replacements and optionally return a temp path
   * to the transformed document
   * @param policyPath
   * @param returnTempPath
   * @param organizationId
   * @returns
   */
  protected generatePolicyReplacements(policyPath: string, returnTempPath: boolean, organizationId?: string): string {
    // Transform policy document
    let policyContent: string = JSON.stringify(require(policyPath));
    const acceleratorPrefix = this.props.prefixes.accelerator;
    const acceleratorPrefixNoDash = acceleratorPrefix.endsWith('-')
      ? acceleratorPrefix.slice(0, -1)
      : acceleratorPrefix;

    const additionalReplacements: { [key: string]: string | string[] } = {
      '\\${ACCELERATOR_DEFAULT_PREFIX_SHORTHAND}': acceleratorPrefix.substring(0, 4).toUpperCase(),
      '\\${ACCELERATOR_PREFIX_ND}': acceleratorPrefixNoDash,
      '\\${ACCELERATOR_PREFIX_LND}': acceleratorPrefixNoDash.toLowerCase(),
      '\\${ACCOUNT_ID}': cdk.Stack.of(this).account,
      '\\${AUDIT_ACCOUNT_ID}': this.props.accountsConfig.getAuditAccountId(),
      '\\${HOME_REGION}': this.props.globalConfig.homeRegion,
      '\\${LOGARCHIVE_ACCOUNT_ID}': this.props.accountsConfig.getLogArchiveAccountId(),
      '\\${MANAGEMENT_ACCOUNT_ID}': this.props.accountsConfig.getManagementAccountId(),
      '\\${REGION}': cdk.Stack.of(this).region,
    };

    if (organizationId) {
      additionalReplacements['\\${ORG_ID}'] = organizationId;
    }

    policyContent = policyReplacements({
      content: policyContent,
      acceleratorPrefix,
      managementAccountAccessRole: this.props.globalConfig.managementAccountAccessRole,
      partition: this.props.partition,
      additionalReplacements,
    });

    if (returnTempPath) {
      return this.createTempFile(policyContent);
    } else {
      return policyContent;
    }
  }

  /**
   * Create a temp file of a transformed policy document
   * @param policyContent
   * @returns
   */
  private createTempFile(policyContent: string): string {
    // Generate unique file path in temporary directory
    let tempDir: string;
    if (process.platform === 'win32') {
      try {
        fs.accessSync(process.env['Temp']!, fs.constants.W_OK);
      } catch (e) {
        this.logger.error(`Unable to write files to temp directory: ${e}`);
      }
      tempDir = path.join(process.env['Temp']!, 'temp-accelerator-policies');
    } else {
      try {
        fs.accessSync('/tmp', fs.constants.W_OK);
      } catch (e) {
        this.logger.error(`Unable to write files to temp directory: ${e}`);
      }
      tempDir = path.join('/tmp', 'temp-accelerator-policies');
    }
    const tempPath = path.join(tempDir, `${uuidv4()}.json`);

    // Write transformed file
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    fs.writeFileSync(tempPath, policyContent, 'utf-8');

    return tempPath;
  }

  protected generateManagedPolicyReferences(customerManagedPolicyReferencesList: string[]) {
    let customerManagedPolicyReferences: cdk.aws_sso.CfnPermissionSet.CustomerManagedPolicyReferenceProperty[] = [];
    if (customerManagedPolicyReferencesList) {
      customerManagedPolicyReferences = customerManagedPolicyReferencesList.map(x => ({
        name: x,
      }));
    }
    return customerManagedPolicyReferences;
  }

  protected convertMinutesToIso8601(s: number) {
    const days = Math.floor(s / 1440);
    s = s - days * 1440;
    const hours = Math.floor(s / 60);
    s = s - hours * 60;

    let dur = 'PT';
    if (days > 0) {
      dur += days + 'D';
    }
    if (hours > 0) {
      dur += hours + 'H';
    }
    dur += s + 'M';

    return dur.toString();
  }

  protected processBlockDeviceReplacements(blockDeviceMappings: BlockDeviceMappingItem[], appName: string) {
    const mappings: BlockDeviceMappingItem[] = [];
    blockDeviceMappings.forEach(device =>
      mappings.push({
        deviceName: device.deviceName,
        ebs: device.ebs ? this.processKmsKeyReplacements(device, appName) : undefined,
      }),
    );

    return mappings;
  }

  protected processKmsKeyReplacements(device: BlockDeviceMappingItem, appName: string): EbsItemConfig {
    if (device.ebs!.kmsKeyId) {
      return this.replaceKmsKeyIdProvided(device, appName);
    }
    if (device.ebs!.encrypted && this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable) {
      return this.replaceKmsKeyDefaultEncryption(device, appName);
    }

    return {
      deleteOnTermination: device.ebs!.deleteOnTermination,
      encrypted: device.ebs!.encrypted,
      iops: device.ebs!.iops,
      kmsKeyId: device.ebs!.kmsKeyId,
      snapshotId: device.ebs!.snapshotId,
      throughput: device.ebs!.throughput,
      volumeSize: device.ebs!.volumeSize,
      volumeType: device.ebs!.volumeType,
    };
  }

  protected replaceKmsKeyDefaultEncryption(device: BlockDeviceMappingItem, appName: string): EbsItemConfig {
    let ebsEncryptionKey: cdk.aws_kms.Key;
    // user set encryption as true and has default ebs encryption enabled
    // user defined kms key is provided
    if (this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey) {
      ebsEncryptionKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        pascalCase(this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey) +
          pascalCase(`AcceleratorGetKey-${appName}-${device.deviceName}`) +
          `-KmsKey`,
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `${this.props.prefixes.ssmParamName}/kms/${this.props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey}/key-arn`,
        ),
      ) as cdk.aws_kms.Key;
    } else {
      // user set encryption as true and has default ebs encryption enabled
      // no kms key is provided
      ebsEncryptionKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        pascalCase(`AcceleratorGetKey-${appName}-${device.deviceName}-${device.ebs!.kmsKeyId}`),
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `${this.props.prefixes.ssmParamName}/security-stack/ebsDefaultVolumeEncryptionKeyArn`,
        ),
      ) as cdk.aws_kms.Key;
    }
    return {
      deleteOnTermination: device.ebs!.deleteOnTermination,
      encrypted: device.ebs!.encrypted,
      iops: device.ebs!.iops,
      kmsKeyId: ebsEncryptionKey.keyId,
      snapshotId: device.ebs!.snapshotId,
      throughput: device.ebs!.throughput,
      volumeSize: device.ebs!.volumeSize,
      volumeType: device.ebs!.volumeType,
    };
  }

  protected replaceKmsKeyIdProvided(device: BlockDeviceMappingItem, appName: string): EbsItemConfig {
    const kmsKeyEntity = cdk.aws_kms.Key.fromKeyArn(
      this,
      pascalCase(`AcceleratorGetKey-${appName}-${device.deviceName}-${device.ebs!.kmsKeyId}`),
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `${this.props.prefixes.ssmParamName}/kms/${device.ebs!.kmsKeyId}/key-arn`,
      ),
    ) as cdk.aws_kms.Key;
    return {
      deleteOnTermination: device.ebs!.deleteOnTermination,
      encrypted: device.ebs!.encrypted,
      iops: device.ebs!.iops,
      kmsKeyId: kmsKeyEntity.keyId,
      snapshotId: device.ebs!.snapshotId,
      throughput: device.ebs!.throughput,
      volumeSize: device.ebs!.volumeSize,
      volumeType: device.ebs!.volumeType,
    };
  }

  protected replaceImageId(imageId: string) {
    if (imageId.match('\\${ACCEL_LOOKUP::ImageId:(.*)}')) {
      const imageIdMatch = imageId.match('\\${ACCEL_LOOKUP::ImageId:(.*)}');
      return cdk.aws_ssm.StringParameter.valueForStringParameter(this, imageIdMatch![1]);
    } else {
      return imageId;
    }
  }
}
