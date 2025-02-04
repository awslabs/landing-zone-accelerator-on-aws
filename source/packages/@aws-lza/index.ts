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

export { IInviteAccountToOrganizationHandlerParameter } from './interfaces/aws-organizations/invite-account-to-organization';
export { inviteAccountToOrganization } from './executors/accelerator-aws-organizations';

export { IMoveAccountHandlerParameter } from './interfaces/aws-organizations/move-account';
export { moveAccount } from './executors/accelerator-aws-organizations';

export { getOrganizationId } from './common/functions';

export { IManageEbsDefaultEncryptionHandlerParameter } from './interfaces/amazon-ec2/manage-ebs-default-encryption';
export { manageEbsDefaultEncryption } from './executors/accelerator-amazon-ec2';
