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
import { ActiveDirectoryConfiguration } from '../../index';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ActiveDirectoryConfiguration): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ActiveDirectoryConfiguration(stack, 'ActiveDirectoryConfiguration', {
  instanceType: 't3.large',
  imagePath: '/aws/service/ami-windows-latest/Windows_Server-2016-English-Full-Base',
  managedActiveDirectoryName: 'AcceleratorManagedActiveDirectory',
  managedActiveDirectorySecretAccountId: '111111111111',
  managedActiveDirectorySecretRegion: 'us-east-1',
  dnsName: 'example.com',
  netBiosDomainName: 'example',
  adminPwdSecretArn: 'adminPwdSecretArn',
  secretKeyArn: 'secretKeyArn',
  subnetId: 'subnetId',
  securityGroupId: 'securityGroupId',
  instanceRoleName: 'instanceRoleName',
  enableTerminationProtection: false,
  userDataScripts: [
    {
      name: 'JoinDomain',
      path: `${__dirname}/../../../accelerator/test/configs/all-enabled/ad-config-scripts/Join-Domain.ps1`,
    },
    {
      name: 'AWSQuickStart',
      path: `${__dirname}/../../../accelerator/test/configs/all-enabled/ad-config-scripts/AWSQuickStart.psm1`,
    },
    {
      name: 'ADGroupSetup',
      path: `${__dirname}/../../../accelerator/test/configs/all-enabled/ad-config-scripts/AD-group-setup.ps1`,
    },
  ],
  adGroups: ['aws-Provisioning', 'aws-Billing'],
  adPerAccountGroups: ['*-Admin', '*-PowerUser', '*-View'],
  adConnectorGroup: 'ADConnector-grp',
  adUsers: [
    { name: 'user1', email: 'example-user1@example.com', groups: ['aws-Provisioning', '*-PowerUser'] },
    {
      name: 'user2',
      email: 'example-user2@example.com',
      groups: ['aws-Provisioning', '*-PowerUser', 'AWS Delegated Administrators'],
    },
  ],
  adPasswordPolicy: {
    history: 24,
    maximumAge: 90,
    minimumAge: 1,
    minimumLength: 14,
    complexity: true,
    reversible: false,
    failedAttempts: 6,
    lockoutDuration: 30,
    lockoutAttemptsReset: 30,
  },
  accountNames: ['Management', 'Audit', 'LogArchive'],
});
/**
 * ActiveDirectoryConfiguration construct test
 */
describe('ActiveDirectoryConfiguration', () => {
  snapShotTest(testNamePrefix, stack);
});
