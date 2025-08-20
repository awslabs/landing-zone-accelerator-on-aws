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
export { MODULE_EXCEPTIONS } from './common/enums';
export { createLogger, createStatusLogger } from './common/logger';

//
// Control Tower Module resources
//
export { ISetupLandingZoneHandlerParameter } from './interfaces/control-tower/setup-landing-zone';
export { setupControlTowerLandingZone } from './executors/accelerator-control-tower';

export { IRegisterOrganizationalUnitHandlerParameter } from './interfaces/control-tower/register-organizational-unit';
export { registerOrganizationalUnit } from './executors/accelerator-control-tower';

//
// AWS Organizations Module resources
//
export { ICreateOrganizationalUnitHandlerParameter } from './interfaces/aws-organizations/create-organizational-unit';
export {
  createOrganizationalUnit,
  createAndRetrieveOrganizationalUnit,
} from './executors/accelerator-aws-organizations';

export {
  IInviteAccountToOrganizationHandlerParameter,
  IInviteAccountsBatchToOrganizationHandlerParameter,
} from './interfaces/aws-organizations/invite-account-to-organization';
export {
  inviteAccountToOrganization,
  inviteAccountsBatchToOrganization,
} from './executors/accelerator-aws-organizations';

export {
  IMoveAccountHandlerParameter,
  IMoveAccountsBatchHandlerParameter,
} from './interfaces/aws-organizations/move-account';
export { moveAccount, moveAccountsBatch } from './executors/accelerator-aws-organizations';

export {
  IGetOrganizationalUnitsDetailHandlerParameter,
  IOrganizationalUnitDetailsType,
} from './interfaces/aws-organizations/get-organizational-units-detail';
export { getOrganizationalUnitsDetail } from './executors/accelerator-aws-organizations';

export { getOrganizationId } from './common/functions';

//
// Amazon EC2 Module resources
//

export { IManageEbsDefaultEncryptionHandlerParameter } from './interfaces/amazon-ec2/manage-ebs-default-encryption';
export { manageEbsDefaultEncryption } from './executors/accelerator-amazon-ec2';

export { IGetCloudFormationTemplatesHandlerParameter } from './interfaces/aws-cloudformation/get-cloudformation-templates';
export { getCloudFormationTemplates } from './executors/accelerator-aws-cloudformation';

export { IStackPolicyHandlerParameter } from './interfaces/aws-cloudformation/create-stack-policy';
export { createStackPolicy } from './executors/accelerator-aws-cloudformation';

//
// AWS GuardDuty Module resources
//
export { IGuardDutyManageOrganizationAdminParameter } from './interfaces/aws-guardduty/manage-organization-admin';
export { manageGuardDutyAdminAccount } from './executors/accelerator-aws-guardduty';

// AWS IAM Module resources
export { IRootUserManagementHandlerParameter } from './interfaces/aws-iam/root-user-management';
export { configureRootUserManagment } from './executors/accelerator-aws-iam';

//
// Amazon Detective Module resources
//
export { IDetectiveManageOrganizationAdminParameter } from './interfaces/detective/manage-organization-admin';
export { manageDetectiveOrganizationAdminAccount } from './executors/accelerator-detective';
// AWS Macie Module resource

export { IMacieManageOrganizationAdminParameter } from './interfaces/macie/manage-organization-admin';
export { manageOrganizationAdmin } from './executors/accelerator-macie';

//
// AWS Lambda Module Resources
//

export { ICheckLambdaConcurrencyParameter } from './interfaces/aws-lambda/check-lambda-concurrency';
export { checkLambdaConcurrency } from './executors/accelerator-aws-lambda';

//
// Service Quotas Module Resources
//

export { ICheckServiceQuotaParameter } from './interfaces/service-quotas/check-service-quota';
export { checkServiceQuota } from './executors/accelerator-service-quotas';

//
// AWS SSM Module resources
//
export { IBlockPublicDocumentSharingHandlerParameter } from './interfaces/aws-ssm/manage-document-public-access-block';
export { manageBlockPublicDocumentSharing } from './executors/accelerator-aws-ssm';
export {
  IGetSsmParametersValueHandlerParameter,
  IGetSsmParametersValueConfiguration,
  ISsmParameterValue,
} from './interfaces/aws-ssm/get-parameters';
export { getSsmParametersValue } from './executors/accelerator-aws-ssm';
