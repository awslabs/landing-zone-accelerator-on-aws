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

import { OrganizationalUnit, Policy, PolicyAttachment, PolicyType } from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';
import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export interface AccountsStackProps extends AcceleratorStackProps {
  readonly configDirPath: string;
}
export class AccountsStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props);

    Logger.debug(`[accounts-stack] homeRegion: ${props.globalConfig.homeRegion}`);

    //
    // Global Organizations actions, only execute in the home region
    //
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
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
      for (const organizationalUnit of props.organizationConfig.organizationalUnits) {
        const name = organizationalUnit.name;

        Logger.info(`[accounts-stack] Adding organizational unit (${name}) with path (${organizationalUnit.path})`);

        // Create Organizational Unit
        organizationalUnitList[name] = new OrganizationalUnit(this, pascalCase(name), {
          name,
          path: organizationalUnit.path,
        });

        // Add FullAWSAccess SCP, skip Root
        if (name !== 'Root') {
          Logger.info(
            `[accounts-stack] Attaching FullAWSAccess service control policy to organizational unit (${name})`,
          );
          new PolicyAttachment(this, pascalCase(`Attach_FullAWSAccess_${name}`), {
            policyId: 'p-FullAWSAccess',
            targetId: organizationalUnitList[name].organizationalUnitId,
            type: PolicyType.SERVICE_CONTROL_POLICY,
          });
        }
      }

      //
      // Attach FullAWSAccess SCP to all accounts
      //
      for (const account of [...props.accountsConfig.mandatoryAccounts, ...props.accountsConfig.workloadAccounts]) {
        Logger.info(`[accounts-stack] Attaching FullAWSAccess service control policy to account (${account.name})`);
        new PolicyAttachment(this, pascalCase(`Attach_FullAWSAccess_${account.name}`), {
          policyId: 'p-FullAWSAccess',
          targetId: props.accountsConfig.getAccountId(account.name),
          type: PolicyType.SERVICE_CONTROL_POLICY,
        });
      }

      // Deploy SCPs
      for (const serviceControlPolicy of props.organizationConfig.serviceControlPolicies) {
        Logger.info(`[accounts-stack] Adding service control policy (${serviceControlPolicy.name})`);

        const scp = new Policy(this, serviceControlPolicy.name, {
          description: serviceControlPolicy.description,
          name: serviceControlPolicy.name,
          path: path.join(props.configDirPath, serviceControlPolicy.policy),
          type: PolicyType.SERVICE_CONTROL_POLICY,
        });

        for (const organizationalUnit of serviceControlPolicy.deploymentTargets.organizationalUnits ?? []) {
          Logger.info(
            `[accounts-stack] Attaching service control policy (${serviceControlPolicy.name}) to organizational unit (${organizationalUnit})`,
          );

          if (organizationalUnit === 'Root') {
            Logger.error(`[accounts-stack] Attempting to add an SCP to the Root OU`);
            throw new Error(`Attempting to add an SCP to the Root OU`);
          }

          new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${organizationalUnit}`), {
            policyId: scp.id,
            targetId: organizationalUnitList[organizationalUnit].organizationalUnitId,
            type: PolicyType.SERVICE_CONTROL_POLICY,
          });
        }

        for (const account of serviceControlPolicy.deploymentTargets.accounts ?? []) {
          new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${account}`), {
            policyId: scp.id,
            targetId: props.accountsConfig.getAccountId(account),
            type: PolicyType.SERVICE_CONTROL_POLICY,
          });
        }
      }
    }
  }
}
