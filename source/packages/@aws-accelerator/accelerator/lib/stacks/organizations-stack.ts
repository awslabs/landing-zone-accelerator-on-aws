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
  AwsMacie,
  AwsMacieOrganizationAdminAccount,
  OrganizationalUnit,
  Policy,
  PolicyAttachment,
  PolicyType,
  RootOrganizationalUnit,
} from '@aws-accelerator/constructs';
import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'change-case';

const path = require('path');

export interface OrganizationsStackProps extends cdk.StackProps {
  stage: string;
  configDirPath: string;
  accountsConfig: AccountsConfig;
  organizationsConfig: OrganizationConfig;
  globalConfig: GlobalConfig;
  securityConfig: SecurityConfig;
}

/**
 * The Organizations stack is executed in all enabled regions in the
 * Organizations Management (Root) account
 */
export class OrganizationsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: OrganizationsStackProps) {
    super(scope, id, props);

    //On home region specific
    if (cdk.Stack.of(this).region === props.globalConfig['home-region']) {
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
        for (const [key, organizationalUnit] of Object.entries(props.organizationsConfig['organizational-units'])) {
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
        for (const serviceControlPolicy of Object.values(props.organizationsConfig['service-control-policies'])) {
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

    //
    // AWS Macie - This is region service, the delegated administrator must be
    // defined in every region. Use the delegated-admin-account defined in the
    // security-config.yaml macie object.
    //
    if (props.securityConfig['central-security-services'].macie.enable) {
      if (props.securityConfig.getExcludeRegions()?.indexOf(cdk.Stack.of(this).region) == -1) {
        //
        // Need to enable macie in the Organization management account before
        // a delegated account can be defined
        //
        const macieSession = new AwsMacie(this, 'MacieSession', {
          region: cdk.Stack.of(this).region,
          findingPublishingFrequency:
            props.securityConfig['central-security-services'].macie['policy-findings-publishing-frequency'],
          isSensitiveSh: props.securityConfig['central-security-services'].macie['publish-sensitive-data-findings'],
        });

        //
        // Delegate the Organizations administrator account for Macie
        //
        new AwsMacieOrganizationAdminAccount(this, 'MacieOrganizationAdminAccount', {
          region: cdk.Stack.of(this).region,
          adminAccountEmail: props.accountsConfig.getEmail(
            props.securityConfig['central-security-services'].macie['delegated-admin-account'],
          ),
        }).node.addDependency(macieSession);
      } else {
        console.log(`${cdk.Stack.of(this).region} region was in excluded list for Macie`);
      }
    }

    //
    // Move accounts to correct OUs
    //

    //
    // Configure Organizations Trail
    //

    //
    // Configure Trusted Services and Delegated Management Accounts
    //
    //
  }
}
