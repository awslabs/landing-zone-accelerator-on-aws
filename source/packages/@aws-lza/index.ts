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

//
// Common resources
//
export { uploadFileToS3 } from './common/s3-functions';
export {
  IDynamoDBPaginationConfig,
  IDynamoDBQueryResult,
  putItemsBatch,
  queryDynamoDBTable,
} from './lib/common/dynamodb-table-functions';
export {
  AcceleratorModuleName,
  AssumeRoleCredentialType,
  IAssumeRoleCredential,
  IDynamoDBFilter,
  IModuleBoundary,
  IModuleRegionFilters,
  IModuleRequest,
  IModuleResponse,
  ISessionContext,
} from './lib/common/interfaces';
export {
  createLogger,
  createStatusLogger,
  flushLoggers,
  waitForLoggerInitialization,
  type IconLogger,
} from './lib/common/logger';
export {
  getOrganizationAccounts,
  getOrganizationAccountsFromSourceTable,
  getOrganizationDetails,
} from './lib/common/organizations-functions';
export { getParametersValue } from './lib/common/ssm-functions';
export { getCredentials, getCurrentSessionDetails, getS3Endpoint } from './lib/common/sts-functions';
export {
  IModuleSessionPolicy,
  MODULE_SESSION_POLICIES,
  getModuleSessionPolicy,
} from './lib/common/module-session-policies';
export { throttlingBackOff } from './lib/common/throttle';
export { DynamoDBFilterOperator, MODULE_EXCEPTIONS, MODULE_STATE_CODE } from './lib/common/types';
export { executeApi, setRetryStrategy, waitUntil } from './lib/common/utility';

//
// Control Tower Module resources
//
export { setupControlTowerLandingZone } from './executors/accelerator-control-tower';
export { ISetupLandingZoneHandlerParameter } from './interfaces/control-tower/setup-landing-zone';

export { registerOrganizationalUnit } from './executors/accelerator-control-tower';
export { IRegisterOrganizationalUnitHandlerParameter } from './interfaces/control-tower/register-organizational-unit';

export { enrollAccounts } from './executors/accelerator-control-tower';
export { IEnrollAccountsHandlerParameter } from './interfaces/control-tower/enroll-accounts';

//
// AWS Organizations Module resources
//
export {
  createAndRetrieveOrganizationalUnit,
  createOrganizationalUnit,
} from './executors/accelerator-aws-organizations';
export { ICreateOrganizationalUnitHandlerParameter } from './interfaces/aws-organizations/create-organizational-unit';

export {
  inviteAccountsBatchToOrganization,
  inviteAccountToOrganization,
} from './executors/accelerator-aws-organizations';
export {
  IInviteAccountsBatchToOrganizationHandlerParameter,
  IInviteAccountToOrganizationHandlerParameter,
} from './interfaces/aws-organizations/invite-account-to-organization';

export { moveAccount, moveAccountsBatch } from './executors/accelerator-aws-organizations';
export {
  IMoveAccountHandlerParameter,
  IMoveAccountsBatchHandlerParameter,
} from './interfaces/aws-organizations/move-account';

export { getOrganizationalUnitsDetail } from './executors/accelerator-aws-organizations';
export {
  IGetOrganizationalUnitsDetailHandlerParameter,
  IOrganizationalUnitDetailsType,
} from './interfaces/aws-organizations/get-organizational-units-detail';

export { getOrganizationId } from './common/functions';

export {
  IAccountAliasConfig,
  IManageAccountAliasConfiguration,
  IManageAccountAliasModuleRequest,
  IManageAccountAliasModuleResponse,
  IManageAccountAliasPerAccountResult,
  ManageAccountAliasPerAccountStatus,
} from './lib/aws-organizations/interfaces';
export { manageAccountAlias } from './lib/aws-organizations/manage-account-alias';

export { managePolicy } from './executors/accelerator-aws-organizations';
export { IManagePolicyHandlerParameter } from './interfaces/aws-organizations/manage-policy';

export {
  IAccountTagsConfig,
  IManageAccountTagsConfiguration,
  IManageAccountTagsModuleRequest,
  IManageAccountTagsModuleResponse,
  IManageAccountTagsPerAccountResult,
  ManageAccountTagsPerAccountStatus,
} from './lib/aws-organizations/interfaces';
export { manageAccountTags } from './lib/aws-organizations/manage-account-tags';

export {
  IAccountConfig,
  IAccountsConfiguration,
  IAccountsModuleRequest,
  IAccountsModuleResponse,
  IAccountsPerAccountResult,
} from './lib/aws-organizations/interfaces';
export { configureAccounts } from './lib/aws-organizations/accounts';

//
// Amazon EC2 Module resources
//
export { manageEbsDefaultEncryption } from './executors/accelerator-amazon-ec2';
export { IManageEbsDefaultEncryptionHandlerParameter } from './interfaces/amazon-ec2/manage-ebs-default-encryption';

export { deleteDefaultVpc } from './executors/accelerator-amazon-ec2';
export { IDeleteDefaultVpcParameter } from './interfaces/amazon-ec2/delete-default-vpc';

export { manageImageBlockPublicAccess } from './executors/accelerator-amazon-ec2';
export { IManageImageBlockPublicAccessHandlerParameter } from './interfaces/amazon-ec2/manage-image-block-public-access';

//
// AWS CloudFormation resources
//
export { getCloudFormationTemplates } from './executors/accelerator-aws-cloudformation';
export { IGetCloudFormationTemplatesHandlerParameter } from './interfaces/aws-cloudformation/get-cloudformation-templates';

export { createStackPolicy } from './executors/accelerator-aws-cloudformation';
export { IStackPolicyHandlerParameter } from './interfaces/aws-cloudformation/create-stack-policy';

export { deleteDefaultSecurityGroupRules } from './executors/accelerator-amazon-ec2';
export { IDeleteDefaultSecurityGroupRulesParameter } from './interfaces/amazon-ec2/delete-default-security-group-rules';

//
// AWS GuardDuty Module resources
//
export { manageGuardDutyAdminAccount } from './executors/accelerator-aws-guardduty';
export { IGuardDutyManageOrganizationAdminParameter } from './interfaces/aws-guardduty/manage-organization-admin';

// AWS IAM Module resources
export { configureRootUserManagment } from './executors/accelerator-aws-iam';
export { IRootUserManagementHandlerParameter } from './interfaces/aws-iam/root-user-management';

//
// Amazon Detective Module resources
//
export { manageDetectiveOrganizationAdminAccount } from './executors/accelerator-detective';
export { IDetectiveManageOrganizationAdminParameter } from './interfaces/detective/manage-organization-admin';

//
// AWS Macie Module resources
//
export { ClassificationScopeUpdateOperation as MacieClassificationScopeUpdateOperation } from '@aws-sdk/client-macie2';
export { IMacieModuleDataSources, IMacieModuleRequest, IMacieModuleResponse } from './lib/amazon-macie/interfaces';
export { configureMacie } from './lib/amazon-macie/macie';
export { isMacieAvailableInPartition } from './lib/amazon-macie/functions';

//
// AWS Lambda Module Resources
//

export { checkLambdaConcurrency } from './executors/accelerator-aws-lambda';
export { ICheckLambdaConcurrencyParameter } from './interfaces/aws-lambda/check-lambda-concurrency';

//
// Service Quotas Module Resources
//

export { checkServiceQuota } from './executors/accelerator-service-quotas';
export { ICheckServiceQuotaParameter } from './interfaces/service-quotas/check-service-quota';

export { getServiceQuotaCode } from './executors/accelerator-service-quotas';
export { IGetServiceQuotaCodeParameter } from './interfaces/service-quotas/get-service-quota-code';

//
// AWS SSM Module resources
//
export { getSsmParametersValue, manageBlockPublicDocumentSharing } from './executors/accelerator-aws-ssm';
export {
  IGetSsmParametersValueConfiguration,
  IGetSsmParametersValueHandlerParameter,
  ISsmParameterValue,
} from './interfaces/aws-ssm/get-parameters';
export { IBlockPublicDocumentSharingHandlerParameter } from './interfaces/aws-ssm/manage-document-public-access-block';

//
// AWS Security Hub Module resources
//
export { manageSecurityHubOrganizationAdminAccount } from './executors/accelerator-security-hub';
export { ISecurityHubManageOrganizationAdminParameter } from './interfaces/security-hub/manage-organization-admin';

export { manageSecurityHubAutomationRules } from './executors/accelerator-security-hub';
export { ISecurityHubManageAutomationRulesParameter } from './interfaces/security-hub/manage-automation-rules';

export {
  ITgwModuleRequest,
  ITgwModuleResponse,
  ITgwModuleConfiguration,
  ITgwModuleDataSources,
  ITgwConfig,
  ITgwRouteTableConfig,
  ITgwAttachmentConfig,
  IDxGatewayConfig,
  IDxTgwAssociationConfig,
  ITgwConnectConfig,
  ITgwConnectResponse,
  TgwAttachmentType,
  ITgwResolvedContext,
  ITgwAssociationResponse,
  ITgwPropagationResponse,
  TgwOperationResult,
} from './lib/transit-gateway/interfaces';
export { configureTgw } from './lib/transit-gateway/tgw';
