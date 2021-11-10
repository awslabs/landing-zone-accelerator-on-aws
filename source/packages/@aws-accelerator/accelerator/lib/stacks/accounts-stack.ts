/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { AccountsConfig, GlobalConfig, OrganizationConfig, SecurityConfig } from '@aws-accelerator/config';
import {
  OrganizationalUnit,
  Policy,
  PolicyAttachment,
  PolicyType,
  RootOrganizationalUnit,
} from '@aws-accelerator/constructs';
import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'change-case';
import * as path from 'path';

export interface AccountsStackProps extends cdk.StackProps {
  accountIds: { [name: string]: string };
  configDirPath: string;
  accountsConfig: AccountsConfig;
  organizationConfig: OrganizationConfig;
  globalConfig: GlobalConfig;
  securityConfig: SecurityConfig;
}

export class AccountsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props);

    //
    // Obtain the Root
    //
    const root = RootOrganizationalUnit.fromName(this, 'RootOu', { name: 'Root' });

    //
    // Global Organizations actions, only execute in the home region
    //
    if (props.globalConfig['home-region'] === cdk.Stack.of(this).region) {
      //
      // Loop through list of organizational-units in the configuration file and
      // create them. Associate related SCPs
      //
      // Note: The Accelerator will only create new Organizational Units if they
      //       do not already exist. If Organizational Units are found outside of
      //       those that are listed in the configuration file, they are ignored
      //       and left in place
      //
      const organizationalUnitList: { [key: string]: OrganizationalUnit } = {};
      for (const [key, organizationalUnit] of Object.entries(props.organizationConfig['organizational-units'])) {
        // Create Organizational Unit
        organizationalUnitList[key] = new OrganizationalUnit(this, pascalCase(organizationalUnit.name), {
          name: organizationalUnit.name,
          parentId: root.id,
        });

        console.log(`adding for ${organizationalUnit.name}`);

        // Add FullAWSAccess SCP
        new PolicyAttachment(this, pascalCase(`Attach_FullAWSAccess_${organizationalUnit.name}`), {
          policyId: 'p-FullAWSAccess',
          targetId: organizationalUnitList[key].id,
          type: PolicyType.SERVICE_CONTROL_POLICY,
        });
      }

      //
      // Create Accounts
      //
      for (const account of Object.values(props.accountsConfig['mandatory-accounts'])) {
        console.log(account['account-name']);
        // new AwsAccount()
      }
      for (const account of Object.values(props.accountsConfig['workload-accounts'])) {
        console.log(account['account-name']);
        // new AwsAccount()
      }

      // Deploy SCPs
      for (const serviceControlPolicy of Object.values(props.organizationConfig['service-control-policies'])) {
        const scp = new Policy(this, serviceControlPolicy.name, {
          description: serviceControlPolicy.description,
          name: serviceControlPolicy.name,
          path: path.join(props.configDirPath, 'service-control-policies', serviceControlPolicy.policy),
          type: PolicyType.SERVICE_CONTROL_POLICY,
        });

        for (const organizationalUnit of serviceControlPolicy['organizational-units'] ?? []) {
          let targetId = root.id;
          if (organizationalUnit !== 'root') {
            targetId = organizationalUnitList[organizationalUnit].id;
          }

          new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${organizationalUnit}`), {
            policyId: scp.id,
            targetId,
            type: PolicyType.SERVICE_CONTROL_POLICY,
          });
        }

        for (const account of serviceControlPolicy.accounts ?? []) {
          new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${account}`), {
            policyId: scp.id,
            email: props.accountsConfig.getEmail(account),
            type: PolicyType.SERVICE_CONTROL_POLICY,
          });
        }
      }
    }
  }
}
