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

import {
  ASEAMapping,
  ASEAMappings,
  AccountsConfig,
  CfnResourceType,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  StackResources,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
  Region,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import fs from 'fs';
import path from 'path';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { getCentralLogBucketKmsKeyArn } from '../lib/accelerator';
import { AcceleratorResourceNames } from '../lib/accelerator-resource-names';
import {
  POLICY_LOOKUP_TYPE,
  POLICY_LOOKUP_SCOPE,
  ACCEL_POLICY_LOOKUP_REGEX,
} from '@aws-accelerator/utils/lib/policy-replacements';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import AWS from 'aws-sdk';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
const logger = createLogger(['app-utils']);
export interface AcceleratorContext {
  /**
   * The AWS partition
   */
  partition: string;
  /**
   * Use existing roles
   */
  useExistingRoles: boolean;
  /**
   * The directory containing the accelerator configuration files
   */
  configDirPath?: string;
  /**
   * The pipeline stage
   *
   * @see {@link AcceleratorStage}
   */
  stage?: string;
  /**
   * The AWS account ID
   */
  account?: string;
  /**
   * The AWS region name
   */
  region?: string;
}

export interface AcceleratorResourcePrefixes {
  /**
   * Accelerator prefix
   */
  accelerator: string;
  /**
   * Accelerator bucket name prefix
   */
  bucketName: string;
  /**
   * Accelerator database name prefix
   */
  databaseName: string;
  /**
   * Accelerator KMS key alias prefix
   */
  kmsAlias: string;
  /**
   * Accelerator config repository name prefix
   */
  repoName: string;
  /**
   * Accelerator Secrets Manager secret name prefix
   */
  secretName: string;
  /**
   * Accelerator SNS topic name prefix
   */
  snsTopicName: string;
  /**
   * Accelerator SSM parameter name prefix for solution defined resources
   */
  ssmParamName: string;
  /**
   * Accelerator SSM parameter name prefix for imported resources
   */
  importResourcesSsmParamName: string;
  /**
   * Accelerator CloudTrail log name prefix
   */
  trailLogName: string;
  /**
   * Accelerator SSM log name prefix
   */
  ssmLogName: string;
}

export interface AcceleratorEnvironment {
  /**
   * Accelerator installer stack name
   */
  installerStackName: string;
  /**
   * Flag indicating diagnostic pack enabled
   */
  isDiagnosticsPackEnabled: string;
  /**
   * Audit (Security-Tooling) account email address
   */
  auditAccountEmail: string;
  /**
   * Location of the LZA configuration files
   */
  configRepositoryLocation: string;
  /**
   * Optional CodeConnection ARN to specify a 3rd-party configuration repository
   */
  codeconnectionArn: string;
  /**
   * Accelerator configuration repository name
   */
  configRepositoryName: string;
  /**
   * Accelerator configuration repository branch name
   *
   * @default 'main'
   */
  configRepositoryBranchName: string;
  /**
   * Accelerator configuration repository owner (CodeConnection only)
   */
  configRepositoryOwner: string;
  /**
   * Whether or not Control Tower is enabled in the accelerator environment
   */
  controlTowerEnabled: string;
  /**
   * Whether or not to enable the manual approval pipeline stage
   *
   * @default true
   */
  enableApprovalStage: boolean;
  /**
   * Whether or not to enable single account mode
   */
  enableSingleAccountMode: boolean;
  /**
   * Log Archive account email address
   */
  logArchiveAccountEmail: string;
  /**
   * Management account email address
   */
  managementAccountEmail: string;
  /**
   * Source code repository branch name
   */
  sourceBranchName: string;
  /**
   * Source code repository bucket name
   */
  sourceBucketName: string;
  /**
   * Source code repository bucket object name
   */
  sourceBucketObject: string;
  /**
   * Source code repository bucket encryption key ARN
   */
  sourceBucketKmsKeyArn?: string;
  /**
   * Source code repository location
   *
   * @default 'github'
   */
  sourceRepository: string;
  /**
   * Source code repository name
   *
   * @default 'landing-zone-accelerator-on-aws'
   */
  sourceRepositoryName: string;
  /**
   * Source code repository owner
   *
   * @default 'awslabs'
   */
  sourceRepositoryOwner: string;
  /**
   * Use a configuration repository that already exists
   */
  useExistingConfigRepo: boolean;
  /**
   * Notification email list for manual approval stage
   */
  approvalStageNotifyEmailList?: string;
  /**
   * Configuration git commit ID
   */
  configCommitId?: string;
  /**
   * AWS account ID for management account
   */
  managementAccountId?: string;
  /**
   * Management account assume role name
   */
  managementAccountRoleName?: string;
  /**
   * Cross-account assume role name
   */
  managementCrossAccountRoleName?: string;
  /**
   * Accelerator qualifier
   */
  qualifier?: string;
  /**
   * Accelerator pipeline account id, for external deployment it will be pipeline account otherwise management account
   */
  pipelineAccountId: string;
  /**
   * Accelerator permission boundary as SSM path
   * If permission boundary is already is applied then it will not overwrite it
   * Only applies if that SSM is present in the account
   */
  acceleratorPermissionBoundary?: string;

  /**
   * Accelerator region by region deploy order
   * All the regions set here need to be in the enabled regions in config file.
   */
  regionByRegionDeploymentOrder?: string;
}

/**
 * Get accelerator app context from CLI input
 * @param app
 * @returns
 */
export function getContext(app: cdk.App): AcceleratorContext {
  const partition = app.node.tryGetContext('partition');
  const useExistingRoles = app.node.tryGetContext('useExistingRoles') === 'true';

  if (!partition) {
    throw new Error('Partition value must be specified in app context');
  }

  return {
    partition,
    configDirPath: app.node.tryGetContext('config-dir'),
    stage: app.node.tryGetContext('stage'),
    account: app.node.tryGetContext('account'),
    region: app.node.tryGetContext('region'),
    useExistingRoles,
  };
}

/**
 * Set accelerator resource prefixes based on provided input
 * from installer stack parameters
 * @param prefix
 * @returns
 */
export function setResourcePrefixes(prefix: string): AcceleratorResourcePrefixes {
  return prefix === 'AWSAccelerator'
    ? {
        accelerator: prefix,
        bucketName: 'aws-accelerator',
        databaseName: 'aws-accelerator',
        kmsAlias: 'alias/accelerator',
        repoName: 'aws-accelerator',
        secretName: '/accelerator',
        snsTopicName: 'aws-accelerator',
        ssmParamName: '/accelerator',
        importResourcesSsmParamName: '/accelerator/imported-resources',
        trailLogName: 'aws-accelerator',
        ssmLogName: 'aws-accelerator',
      }
    : {
        accelerator: prefix,
        bucketName: prefix.toLocaleLowerCase(),
        databaseName: prefix.toLocaleLowerCase(),
        kmsAlias: `alias/${prefix}`,
        repoName: prefix,
        secretName: prefix,
        snsTopicName: prefix,
        ssmParamName: `/${prefix}`,
        importResourcesSsmParamName: `/${prefix}/imported-resources`,
        trailLogName: prefix,
        ssmLogName: prefix,
      };
}

/**
 * Set config repository name based on provided input
 * from installer stack parameters
 * @param repoNamePrefix
 * @param useExisting
 * @param existingRepoName
 * @param existingBranchName
 * @param qualifier
 * @returns
 */
function setConfigRepoName(
  repoNamePrefix: string,
  useExistingConfigRepo?: string,
  existingRepoName?: string,
  existingBranchName?: string,
  qualifier?: string,
): string {
  if (useExistingConfigRepo === 'Yes' && (!existingRepoName || !existingBranchName)) {
    throw new Error(
      'Attempting to deploy pipeline stage(s) and environment variables are not set [EXISTING_CONFIG_REPOSITORY_NAME, EXISTING_CONFIG_REPOSITORY_BRANCH_NAME], when USE_EXISTING_CONFIG_REPO environment is set to Yes',
    );
  }

  let configRepositoryName = `${repoNamePrefix}-config`;
  if (useExistingConfigRepo === 'Yes') {
    configRepositoryName = existingRepoName!;
  } else {
    if (qualifier) {
      configRepositoryName = `${qualifier}-config`;
    }
  }
  return configRepositoryName;
}

/**
 * Set accelerator environment variables
 * @param env
 * @param resourcePrefixes
 * @param stage
 * @returns
 */
export function setAcceleratorEnvironment(
  env: NodeJS.ProcessEnv,
  resourcePrefixes: AcceleratorResourcePrefixes,
  stage?: string,
): AcceleratorEnvironment {
  // Check for mandatory environment variables in PIPELINE stage
  checkMandatoryEnvVariables(env, stage);

  // Set config repo name
  const configRepositoryName = setConfigRepoName(
    resourcePrefixes.repoName,
    env['USE_EXISTING_CONFIG_REPO'],
    env['EXISTING_CONFIG_REPOSITORY_NAME'],
    env['EXISTING_CONFIG_REPOSITORY_BRANCH_NAME'],
    env['ACCELERATOR_QUALIFIER'],
  );

  return {
    installerStackName: env['INSTALLER_STACK_NAME'] ?? '',
    pipelineAccountId: env['PIPELINE_ACCOUNT_ID'] ?? '',
    isDiagnosticsPackEnabled: env['ENABLE_DIAGNOSTICS_PACK'] ?? 'Yes',
    auditAccountEmail: env['AUDIT_ACCOUNT_EMAIL'] ?? '',
    configRepositoryName,
    configRepositoryBranchName: env['EXISTING_CONFIG_REPOSITORY_BRANCH_NAME'] ?? 'main',
    configRepositoryLocation: env['CONFIG_REPOSITORY_LOCATION'] ?? 'codecommit',
    configRepositoryOwner: env['EXISTING_CONFIG_REPOSITORY_OWNER'] ?? '',
    codeconnectionArn: env['CODECONNECTION_ARN'] ?? '',
    controlTowerEnabled: env['CONTROL_TOWER_ENABLED'] ?? '',
    enableApprovalStage: env['ACCELERATOR_ENABLE_APPROVAL_STAGE']
      ? env['ACCELERATOR_ENABLE_APPROVAL_STAGE'] === 'Yes'
      : true,
    enableSingleAccountMode: env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true',
    logArchiveAccountEmail: env['LOG_ARCHIVE_ACCOUNT_EMAIL'] ?? '',
    managementAccountEmail: env['MANAGEMENT_ACCOUNT_EMAIL'] ?? '',
    sourceBranchName: env['ACCELERATOR_REPOSITORY_BRANCH_NAME'] ?? '',
    sourceBucketName: env['ACCELERATOR_REPOSITORY_BUCKET_NAME'] ?? '',
    sourceBucketKmsKeyArn: env['ACCELERATOR_REPOSITORY_BUCKET_KMS_KEY_ARN'],
    sourceBucketObject: env['ACCELERATOR_REPOSITORY_BUCKET_OBJECT'] ?? '',
    sourceRepository: env['ACCELERATOR_REPOSITORY_SOURCE'] ?? 'github',
    sourceRepositoryName: env['ACCELERATOR_REPOSITORY_NAME'] ?? 'landing-zone-accelerator-on-aws',
    sourceRepositoryOwner: env['ACCELERATOR_REPOSITORY_OWNER'] ?? 'awslabs',
    useExistingConfigRepo: env['USE_EXISTING_CONFIG_REPO'] === 'Yes',
    approvalStageNotifyEmailList: env['APPROVAL_STAGE_NOTIFY_EMAIL_LIST'],
    configCommitId: env['CONFIG_COMMIT_ID'],
    managementAccountId: env['MANAGEMENT_ACCOUNT_ID'],
    managementAccountRoleName: env['MANAGEMENT_ACCOUNT_ROLE_NAME'],
    managementCrossAccountRoleName: env['MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME'],
    qualifier: env['ACCELERATOR_QUALIFIER'],
    acceleratorPermissionBoundary: env['ACCELERATOR_PERMISSION_BOUNDARY'],
    regionByRegionDeploymentOrder: env['REGION_BY_REGION_DEPLOYMENT_ORDER'],
  };
}

/**
 * Checks for mandatory environment variables based on accelerator stage and throws
 * an error if any are missing
 * @param env
 * @param stage
 */
function checkMandatoryEnvVariables(env: NodeJS.ProcessEnv, stage?: string) {
  const missingVariables: string[] = [];

  if (stage === AcceleratorStage.PIPELINE) {
    const mandatoryVariables = [
      'AUDIT_ACCOUNT_EMAIL',
      'CONTROL_TOWER_ENABLED',
      'LOG_ARCHIVE_ACCOUNT_EMAIL',
      'MANAGEMENT_ACCOUNT_EMAIL',
      'ACCELERATOR_REPOSITORY_BRANCH_NAME',
    ];

    for (const variable of mandatoryVariables) {
      if (!env[variable]) {
        missingVariables.push(variable);
      }
    }
  }
  // Throw error if any mandatory variables are missing
  if (missingVariables.length > 0) {
    throw new Error(`Missing mandatory environment variables: ${missingVariables.join(', ')}`);
  }
}

/**
 * Set stack properties for accelerator stacks
 * @param context
 * @param acceleratorEnv
 * @param prefixes
 * @param globalRegion
 * @returns
 */
export async function setAcceleratorStackProps(
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  prefixes: AcceleratorResourcePrefixes,
  globalRegion: string,
): Promise<AcceleratorStackProps | undefined> {
  if (!context.configDirPath) {
    return;
  }
  const homeRegion = GlobalConfig.loadRawGlobalConfig(context.configDirPath).homeRegion;
  const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(context.configDirPath).enable;

  const accountsConfig = AccountsConfig.load(context.configDirPath);
  await accountsConfig.loadAccountIds(
    context.partition,
    acceleratorEnv.enableSingleAccountMode,
    orgsEnabled,
    accountsConfig,
  );

  const replacementsConfig = getReplacementsConfig(context.configDirPath, accountsConfig);
  await replacementsConfig.loadReplacementValues({ region: homeRegion }, orgsEnabled);
  const globalConfig = GlobalConfig.load(context.configDirPath, replacementsConfig);
  const organizationConfig = OrganizationConfig.load(context.configDirPath, replacementsConfig);
  await organizationConfig.loadOrganizationalUnitIds(context.partition);

  if (globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources) {
    await globalConfig.loadExternalMapping(accountsConfig);
    await globalConfig.loadLzaResources(context.partition, prefixes.ssmParamName);
  }
  const centralizedLoggingRegion = globalConfig.logging.centralizedLoggingRegion ?? globalConfig.homeRegion;

  const acceleratorResourceNames = new AcceleratorResourceNames({
    prefixes: prefixes,
    centralizedLoggingRegion,
  });

  let centralLogBucketCmkParameter: string = acceleratorResourceNames.parameters.centralLogBucketCmkArn;
  if (globalConfig.logging.centralLogBucket?.importedBucket?.name) {
    centralLogBucketCmkParameter = acceleratorResourceNames.parameters.importedCentralLogBucketCmkArn;
  }

  const centralLogsBucketKmsKeyArn = await getCentralLogBucketKmsKeyArn(
    centralizedLoggingRegion,
    context.partition,
    accountsConfig.getLogArchiveAccountId(),
    globalConfig.managementAccountAccessRole,
    centralLogBucketCmkParameter,
    orgsEnabled,
  );
  logger.debug(`Central logs bucket kms key arn: ${centralLogsBucketKmsKeyArn}`);

  const networkConfig = NetworkConfig.load(context.configDirPath, replacementsConfig);
  const securityConfig = SecurityConfig.load(context.configDirPath, replacementsConfig);
  /**
   * Load VPC/VPCE info for accounts, data perimeter and finalize stage only
   */
  if (
    includeStage(context, {
      stage: AcceleratorStage.FINALIZE,
      account: accountsConfig.getManagementAccountId(),
      region: globalRegion,
    }) ||
    includeStage(context, {
      stage: AcceleratorStage.CUSTOMIZATIONS,
      account: accountsConfig.getManagementAccountId(),
      region: globalRegion,
    }) ||
    includeStage(context, {
      stage: AcceleratorStage.ACCOUNTS,
      account: accountsConfig.getManagementAccountId(),
      region: globalRegion,
    })
  ) {
    const lookupTypeAndAccountIdMap = getLookupTypeAndAccountIdMap(
      organizationConfig,
      securityConfig,
      accountsConfig,
      context.configDirPath,
    );
    const accountVpcIds = await loadVpcIds(
      globalConfig,
      accountsConfig,
      networkConfig,
      globalConfig.managementAccountAccessRole,
      context.partition,
      Array.from(lookupTypeAndAccountIdMap.get(POLICY_LOOKUP_TYPE.VPC_ID) || []),
      securityConfig.resourcePolicyEnforcement?.networkPerimeter?.managedVpcOnly || false,
    );
    const accountVpcEndpointIds = await loadVpcEndpointIds(
      globalConfig.managementAccountAccessRole,
      context.partition,
      Array.from(lookupTypeAndAccountIdMap.get(POLICY_LOOKUP_TYPE.VPCE_ID) || []),
      globalConfig.enabledRegions,
    );
    networkConfig.accountVpcIds = accountVpcIds;
    networkConfig.accountVpcEndpointIds = accountVpcEndpointIds;
  }

  return {
    configDirPath: context.configDirPath,
    accountsConfig: accountsConfig,
    customizationsConfig: getCustomizationsConfig(context.configDirPath, replacementsConfig),
    globalConfig,
    iamConfig: IamConfig.load(context.configDirPath, replacementsConfig),
    networkConfig,
    organizationConfig: organizationConfig,
    securityConfig,
    replacementsConfig: replacementsConfig,
    partition: context.partition,
    globalRegion,
    centralizedLoggingRegion,
    prefixes,
    useExistingRoles: context.useExistingRoles,
    centralLogsBucketKmsKeyArn,
    ...acceleratorEnv,
  };
}

/**
 * Checks if the stage is at or before the bootstrap stage in the LZA pipeline
 * @param command
 * @param stage
 * @returns
 */

export function isBeforeBootstrapStage(command: string, stage?: string): boolean {
  const preBootstrapStages = [
    AcceleratorStage.PREPARE,
    AcceleratorStage.ACCOUNTS,
    AcceleratorStage.BOOTSTRAP,
  ] as string[];
  if (command === 'bootstrap') {
    return true;
  }
  if (!stage) {
    return false;
  }

  return preBootstrapStages.includes(stage);
}

/**
 * Get customizationsConfig object
 * @param configDirPath
 * @returns
 */
export function getCustomizationsConfig(
  configDirPath: string,
  replacementsConfig: ReplacementsConfig,
): CustomizationsConfig {
  let customizationsConfig: CustomizationsConfig;

  // Create empty customizationsConfig if optional configuration file does not exist
  if (fs.existsSync(path.join(configDirPath, CustomizationsConfig.FILENAME))) {
    customizationsConfig = CustomizationsConfig.load(configDirPath, replacementsConfig);
  } else {
    customizationsConfig = new CustomizationsConfig();
  }
  return customizationsConfig;
}

/**
 * Get replacementsConfig object
 * @param configDirPath
 * @returns
 */
export function getReplacementsConfig(configDirPath: string, accountsConfig: AccountsConfig): ReplacementsConfig {
  let replacementsConfig: ReplacementsConfig;

  // Create empty replacementsConfig if optional configuration file does not exist
  if (fs.existsSync(path.join(configDirPath, ReplacementsConfig.FILENAME))) {
    replacementsConfig = ReplacementsConfig.load(configDirPath, accountsConfig);
  } else {
    replacementsConfig = new ReplacementsConfig(undefined, accountsConfig);
  }
  return replacementsConfig;
}

/**
 * Load all the VPC IDs under for accounts and regions
 * @param managementAccountAccessRole
 * @param partition
 * @param accountIds
 * @param managedVpcOnly
 * @returns A map from account Id to VPC IDs in the account
 */
async function loadVpcIds(
  globalConfig: GlobalConfig,
  accountConfig: AccountsConfig,
  networkConfig: NetworkConfig,
  managementAccountAccessRole: string,
  partition: string,
  accountIds: string[],
  managedVpcOnly: boolean,
) {
  const accountVpcIdMap: { [key: string]: string[] } = {};
  const accountNameToVpcNameMap = getManagedVpcNamesByAccountNames(networkConfig);

  for (const accountId of accountIds) {
    const regions = globalConfig.enabledRegions;
    const ec2Clients = await getEc2ClientsByAccountAndRegions(
      partition,
      accountId,
      regions,
      managementAccountAccessRole,
    );

    const accountName = accountConfig.getAccountNameById(accountId);
    const managedVpcNames: Set<string> = accountName ? new Set(accountNameToVpcNameMap.get(accountName)) : new Set();

    const vpcIds = await getVpcIdsByAccount(ec2Clients, managedVpcOnly, managedVpcNames);
    accountVpcIdMap[accountId] = vpcIds;
  }

  return accountVpcIdMap;
}

/**
 * Get all VPC IDs from all enabled regions regions
 * @param ec2Clients
 * @param managedVpcOnly
 * @param managedVpcNames
 * @returns
 */
async function getVpcIdsByAccount(
  ec2Clients: AWS.EC2[],
  managedVpcOnly?: boolean,
  managedVpcNames?: Set<string>,
): Promise<string[]> {
  const vpcIds: string[] = [];

  for (const ec2Client of ec2Clients) {
    // Get all VPC IDs under the region bound to the client
    let nextToken: string | undefined = undefined;
    do {
      const params: AWS.EC2.DescribeVpcsRequest = {};
      if (nextToken) {
        params.NextToken = nextToken;
      }

      const response = await throttlingBackOff(() => ec2Client.describeVpcs(params).promise());
      if (response.Vpcs) {
        let vpcList = response.Vpcs.filter(vpc => vpc.VpcId);
        if (managedVpcOnly) {
          vpcList = vpcList.filter(vpc => isLzaManagedVpc(vpc, managedVpcNames!));
        }
        vpcList.forEach(vpc => vpcIds.push(vpc.VpcId!));
      }

      nextToken = response.NextToken;
    } while (nextToken);
  }

  return vpcIds;
}

/**
 * Get all the VPC Endpoint IDs from the account in all enabled regions
 * @param ec2Clients
 * @param managedVpcOnly
 * @param managedVpcNames
 * @returns
 */
async function getVpcEndpointIdsByAccount(ec2Clients: AWS.EC2[]): Promise<string[]> {
  const vpceIds: string[] = [];

  for (const ec2Client of ec2Clients) {
    // List all VPC Endpoint IDs
    let nextToken: string | undefined = undefined;
    do {
      const params: AWS.EC2.DescribeVpcsRequest = {};
      if (nextToken) {
        params.NextToken = nextToken;
      }

      const response = await throttlingBackOff(() => ec2Client.describeVpcEndpoints(params).promise());
      if (response.VpcEndpoints) {
        response.VpcEndpoints.filter(vpce => vpce.VpcEndpointId).forEach(vpce => vpceIds.push(vpce.VpcEndpointId!));
      }

      nextToken = response.NextToken;
    } while (nextToken);
  }

  return vpceIds;
}

/**
 * Load all the VPC Endpoint IDs for accounts and regions
 * @param managementAccountAccessRole
 * @param partition
 * @param accountIds
 * @param regions
 * @returns
 */
async function loadVpcEndpointIds(
  managementAccountAccessRole: string,
  partition: string,
  accountIds: string[],
  regions: string[],
) {
  const accountVpcEndpointIdMap: { [key: string]: string[] } = {};

  for (const accountId of accountIds) {
    const ec2Clients = await getEc2ClientsByAccountAndRegions(
      partition,
      accountId,
      regions,
      managementAccountAccessRole,
    );

    const vpcEndpointId = await getVpcEndpointIdsByAccount(ec2Clients);
    accountVpcEndpointIdMap[accountId] = vpcEndpointId;
  }

  return accountVpcEndpointIdMap;
}

/**
 * Retrieve the accounts ID for each lookup type by extracting and parsing ACCEL_LOOKUP placeholder from SCPs.
 *
 * @param organizationConfig
 * @param accountsConfig
 * @param configDirPath
 * @returns A map from POLICY_LOOKUP_TYPE to accounts ID
 */
function getLookupTypeAndAccountIdMap(
  organizationConfig: OrganizationConfig,
  securityConfig: SecurityConfig,
  accountsConfig: AccountsConfig,
  configDirPath: string,
) {
  const map: Map<string, Set<string>> = new Map();
  map.set(POLICY_LOOKUP_TYPE.VPC_ID, new Set());
  map.set(POLICY_LOOKUP_TYPE.VPCE_ID, new Set());

  // 1. Get path of all the service control policy and resource based policy templates
  const policyPathSet = new Set<string>();
  organizationConfig.serviceControlPolicies.forEach(scp => policyPathSet.add(scp.policy));
  securityConfig.resourcePolicyEnforcement?.policySets.forEach(policySet =>
    policySet.resourcePolicies.forEach(rcp => policyPathSet.add(rcp.document)),
  );

  // 2. Extra all the dynamic parameters from policy templates
  const dynamicParams = new Set<string>();
  for (const policyPath of policyPathSet) {
    const policyContent: string = fs.readFileSync(path.join(configDirPath, policyPath), 'utf8');
    const matches = policyContent.match(ACCEL_POLICY_LOOKUP_REGEX);
    matches?.forEach(match => dynamicParams.add(match));
  }

  // 3. Get ID of accounts mentioned in dynamic parameters
  for (const dynamicParam of dynamicParams) {
    ACCEL_POLICY_LOOKUP_REGEX.lastIndex = 0;
    const parameterReplacementNeeded = ACCEL_POLICY_LOOKUP_REGEX.exec(dynamicParam);
    if (parameterReplacementNeeded) {
      const replacementArray = parameterReplacementNeeded[1].split(':');
      if (replacementArray.length < 2) {
        throw new Error(`Invalid POLICY_LOOKUP_VALUE: ${parameterReplacementNeeded[1]}`);
      }

      const lookupType = replacementArray[0];
      const lookupScope = replacementArray[1];
      const accountIds = getAccountsByLookupScope(accountsConfig, replacementArray, lookupScope);

      accountIds.forEach(id => map.get(lookupType)?.add(id));
    }
  }

  return map;
}

/**
 *
 * @param replacementArray
 * @param lookupScope
 * @returns
 */
function getAccountsByLookupScope(
  accountsConfig: AccountsConfig,
  replacementArray: string[],
  lookupScope: string,
): string[] {
  if (lookupScope === POLICY_LOOKUP_SCOPE.ORG) {
    return accountsConfig.getAccountIds();
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.ACCOUNT) {
    const accountName = replacementArray[2];
    return [accountsConfig.getAccountId(accountName)];
  } else if (lookupScope === POLICY_LOOKUP_SCOPE.OU) {
    const organizationUnit = replacementArray[2];

    const accounts = accountsConfig.getAccounts(false);
    return accounts
      .filter(account => account.organizationalUnit.startsWith(organizationUnit))
      .map(account => accountsConfig.getAccountId(account.name));
  }

  return [];
}

function includeStage(
  context: AcceleratorContext,
  props: { stage: string; account?: string; region?: string },
): boolean {
  if (!context.stage) {
    // Do not include PIPELINE or TESTER_PIPELINE in full synth/diff
    if (['pipeline', 'tester-pipeline'].includes(props.stage)) {
      return false;
    }
    return true; // No stage, return all other stacks
  }
  if (context.stage === props.stage) {
    if (!context.account && !context.region) {
      return true; // No account or region, return all stacks for synth/diff
    }
    if (props.account === context.account && props.region === context.region) {
      return true;
    }
  }
  return false;
}

function getManagedVpcNamesByAccountNames(networkConfig: NetworkConfig) {
  const map = new Map<string, string[]>();
  for (const vpc of networkConfig.vpcs) {
    const vpcNames = map.get(vpc.account) || [];
    vpcNames.push(vpc.name);
    map.set(vpc.account, vpcNames);
  }

  return map;
}

/**
 * Check if a VPC is a LZA-managed VPC defined in accounts config
 * @param vpc
 * @param managedVpcNames
 * @returns
 */
function isLzaManagedVpc(vpc: AWS.EC2.Vpc, managedVpcNames: Set<string>): boolean {
  const tag = vpc.Tags?.find(tag => tag.Key === 'Name' && tag.Value && managedVpcNames.has(tag.Value));
  return !!tag;
}

/**
 * Get all ec2 clients for the account and regions
 *
 * @param partition
 * @param accountId
 * @param regions
 * @param managementAccountAccessRole
 * @param managedResourceOnly
 * @returns
 */
async function getEc2ClientsByAccountAndRegions(
  partition: string,
  accountId: string,
  regions: string[],
  managementAccountAccessRole: string,
) {
  const stsClient = new AWS.STS({ region: process.env['AWS_REGION'] });
  const cred = await throttlingBackOff(() =>
    stsClient
      .assumeRole({
        RoleArn: `arn:${partition}:iam::${accountId}:role/${managementAccountAccessRole}`,
        RoleSessionName: 'cdk-build-time',
      })
      .promise(),
  );

  const ec2Clients: AWS.EC2[] = [];
  regions.forEach(region =>
    ec2Clients.push(
      new AWS.EC2({
        region: region,
        credentials: {
          accessKeyId: cred.Credentials!.AccessKeyId,
          secretAccessKey: cred.Credentials!.SecretAccessKey,
          sessionToken: cred.Credentials!.SessionToken,
        },
      }),
    ),
  );

  return ec2Clients;
}

export async function writeImportResources(props: {
  credentials: AWS.STS.Credentials | undefined;
  globalConfig: GlobalConfig;
  mapping: ASEAMappings;
  accountsConfig: AccountsConfig;
}) {
  const mappings = props.globalConfig.externalLandingZoneResources?.templateMap;
  const mappingBucket = props.globalConfig.externalLandingZoneResources?.mappingFileBucket;
  const credentials = setCredentials(props.credentials);
  const aseaResourcesPath = path.join('asea-assets', 'new', 'aseaResources.json');
  const aseaResources = (await fs.promises.readFile(aseaResourcesPath, 'utf-8')).toString();
  const s3Client = new S3Client({
    credentials,
    region: props.globalConfig.homeRegion,
  });
  await s3Client.send(
    new PutObjectCommand({
      Bucket: mappingBucket,
      Key: 'aseaResources.json',
      Body: aseaResources,
      ServerSideEncryption: 'AES256',
    }),
  );
  const mappingPromises = [];
  const s3Promises = [];
  if (!mappings || !mappingBucket) {
    return;
  }

  const lzaAccountIds = props.accountsConfig.getAccountIds();
  const lzaRegions = props.globalConfig.enabledRegions;

  // Compare the mapping file to accounts and regions in the LZA, and retrieve only mappings that exist in the LZA config file
  const validLZAMappings = Object.entries(mappings).reduce((acc: ASEAMappings, [key, mapping]) => {
    if (!lzaAccountIds.includes(mapping.accountId)) {
      return acc;
    }
    if (!lzaRegions.includes(mapping.region as Region)) {
      return acc;
    }
    acc[key] = mapping;
    return acc;
  }, {});

  for (const [, mapping] of Object.entries(validLZAMappings)) {
    mappingPromises.push(handleMapping(mapping));
  }
  const updatedMappings = await Promise.all(mappingPromises);
  for (const updatedMapping of updatedMappings) {
    if (updatedMapping) {
      s3Promises.push(
        writeMappingToS3({
          resources: updatedMapping.resources,
          mapping: updatedMapping.mapping,
          stack: updatedMapping.stack,
          s3Client: s3Client,
          mappingBucket: mappingBucket!,
        }),
      );
      if (updatedMapping.nestedStacks) {
        const nestedStackPromises = updatedMapping.nestedStacks.map(nestedStack =>
          writeMappingToS3({
            resources: nestedStack.resources,
            mapping: nestedStack.mapping,
            stack: nestedStack.stack,
            s3Client: s3Client,
            mappingBucket: mappingBucket!,
          }),
        );
        s3Promises.push(...nestedStackPromises);
      }
    }
    // Batch S3 writes to max socket size
    if (s3Promises.length > 49) {
      await Promise.all(s3Promises);
      s3Promises.length = 0;
    }
  }
  await Promise.all(s3Promises);
}

async function handleMapping(mapping: ASEAMapping) {
  let pathSuffix = 'template.json';
  if (mapping.logicalResourceId) {
    pathSuffix = 'nested.template.json';
  }
  const stackPath = `cdk.out/phase${mapping.phase}-${mapping.accountId}-${mapping.region}/${mapping.stackName}.${pathSuffix}`;
  const resourcePath = path.join('asea-assets', 'new', mapping.resourcePath);
  const resourceFile = (await fs.promises.readFile(resourcePath, 'utf8')).toString();
  const stackFile = (await fs.promises.readFile(stackPath, 'utf-8')).toString();
  const resources: CfnResourceType[] = JSON.parse(resourceFile);
  const stack = JSON.parse(stackFile);
  const stackResources: StackResources = stack['Resources'];
  if (!stackResources) {
    return;
  }
  const updatedResources = addNewResourcesFromStack(resources, stackResources);
  const nestedStacks = await handleNestedStacksMapping(mapping);

  return {
    resources: updatedResources,
    stack,
    mapping,
    nestedStacks,
  };
}
async function handleNestedStacksMapping(mapping: ASEAMapping) {
  const nestedStacks = [];
  const nestedStackMappings = mapping.nestedStacks;
  if (!nestedStackMappings) {
    return;
  }
  for (const key of Object.keys(nestedStackMappings)) {
    try {
      const nestedStackLocation = `cdk.out/phase${mapping.phase}-${mapping.accountId}-${mapping.region}`;
      const resourcePath = path.join('asea-assets', 'new', nestedStackMappings[key].resourcePath);
      const resourceFile = (await fs.promises.readFile(resourcePath, 'utf8')).toString();
      const resources: CfnResourceType[] = JSON.parse(resourceFile);
      const nestedStackLogicalId = nestedStackMappings[key].logicalResourceId;
      const directoryList = fs.readdirSync(nestedStackLocation);
      const stackFileName = directoryList.find(
        file => file.includes(nestedStackLogicalId) && file.includes('.nested.template.json'),
      );
      if (!stackFileName) {
        logger.error(
          `Could not find the nested stack that contained the name ${nestedStackLogicalId} in directory ${nestedStackLocation}`,
        );
        continue;
      }
      const stackString = (
        await fs.promises.readFile(path.join(nestedStackLocation, stackFileName), 'utf-8')
      ).toString();
      const stack = JSON.parse(stackString);
      const stackResources: StackResources = stack['Resources'];
      const updatedResources = addNewResourcesFromStack(resources, stackResources);
      nestedStacks.push({
        resources: updatedResources,
        stack,
        mapping: nestedStackMappings[key],
      });
    } catch (err) {
      logger.error(`Couldn't get stack resources`);
      throw err;
    }
  }
  return nestedStacks;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addNewResourcesFromStack(resources: CfnResourceType[], stackResources: StackResources) {
  // Turn into a hash map for faster processing
  const resourceObj = resources.reduce((acc: { [key: string]: CfnResourceType }, resource) => {
    acc[resource.logicalResourceId] = resource;
    return acc;
  }, {});

  for (const [logicalId, stackResource] of Object.entries(stackResources)) {
    if (!resourceObj[logicalId]) {
      resourceObj[logicalId] = {
        logicalResourceId: logicalId,
        resourceType: stackResource['Type'],
        resourceMetadata: {
          Type: stackResource['Type'],
          Properties: stackResource['Properties'],
        },
      };
    } else {
      resourceObj[logicalId].resourceMetadata['Properties'] = stackResource['Properties'];
    }
  }
  //convert back to array
  const updatedResources = Object.keys(resourceObj).map(key => resourceObj[key]);
  return updatedResources;
}

async function writeMappingToS3(props: {
  resources: CfnResourceType[];
  mapping: ASEAMapping;
  stack: unknown;
  s3Client: S3Client;
  mappingBucket: string;
}) {
  const localPath = 'asea-assets';
  const writePromises = [];
  const stackWriteRequest = new PutObjectCommand({
    Bucket: props.mappingBucket,
    Key: props.mapping.templatePath,
    Body: JSON.stringify(props.stack, null, 2),
    ServerSideEncryption: 'AES256',
  });

  const localStackWrite = fs.promises.writeFile(
    path.join(localPath, props.mapping.templatePath),
    JSON.stringify(props.stack, null, 2),
  );

  const resourceWriteRequest = new PutObjectCommand({
    Bucket: props.mappingBucket,
    Key: props.mapping.resourcePath,
    Body: JSON.stringify(props.resources, null, 2),
    ServerSideEncryption: 'AES256',
  });

  const localResourceWrite = fs.promises.writeFile(
    path.join(localPath, props.mapping.resourcePath),
    JSON.stringify(props.resources, null, 2),
  );

  writePromises.push(props.s3Client.send(stackWriteRequest));
  writePromises.push(await props.s3Client.send(resourceWriteRequest));
  writePromises.push(localStackWrite);
  writePromises.push(localResourceWrite);

  return Promise.all(writePromises);
}

function setCredentials(stsCredentials: AWS.STS.Credentials | undefined) {
  let credentials;
  if (stsCredentials && stsCredentials.AccessKeyId && stsCredentials.SecretAccessKey && stsCredentials.SessionToken) {
    credentials = {
      accessKeyId: stsCredentials.AccessKeyId,
      secretAccessKey: stsCredentials.SecretAccessKey,
      sessionToken: stsCredentials.SessionToken,
    };
  }
  return credentials;
}
