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

import {
  Account,
  EnablePolicyType,
  Policy,
  PolicyAttachment,
  PolicyType,
  PolicyTypeEnum,
} from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import * as path from 'path';
import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { PrepareStack } from './prepare-stack';

export interface AccountsStackProps extends AcceleratorStackProps {
  readonly configDirPath: string;
}
export class AccountsStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props);

    Logger.debug(`[accounts-stack] homeRegion: ${props.globalConfig.homeRegion}`);

    const keyArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
      this,
      PrepareStack.MANAGEMENT_KEY_ARN_PARAMETER_NAME,
    );
    const key = cdk.aws_kms.Key.fromKeyArn(this, 'ManagementKey', keyArn) as cdk.aws_kms.Key;

    //
    // Global Organizations actions, only execute in the home region
    //
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      if (props.organizationConfig.enable) {
        const enablePolicyTypeScp = new EnablePolicyType(this, 'enablePolicyTypeScp', {
          policyType: PolicyTypeEnum.SERVICE_CONTROL_POLICY,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        // Invite Accounts to Organization (GovCloud)
        const accountMap: Map<string, Account> = new Map<string, Account>();
        for (const account of [...props.accountsConfig.mandatoryAccounts, ...props.accountsConfig.workloadAccounts]) {
          Logger.info(`[accounts-stack] Ensure ${account.name} is part of the Organization`);

          const organizationAccount = new Account(this, pascalCase(`${account.name}OrganizationAccount`), {
            accountId: props.accountsConfig.getAccountId(account.name),
            assumeRoleName: props.globalConfig.managementAccountAccessRole,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });

          accountMap.set(account.name, organizationAccount);

          // TODO: Move Account to desired OU
        }

        //
        // Attach FullAWSAccess SCP to all accounts
        //
        for (const account of [...props.accountsConfig.mandatoryAccounts, ...props.accountsConfig.workloadAccounts]) {
          Logger.info(`[accounts-stack] Attaching FullAWSAccess service control policy to account (${account.name})`);
          const policyAttachment = new PolicyAttachment(this, pascalCase(`Attach_FullAWSAccess_${account.name}`), {
            policyId: 'p-FullAWSAccess',
            targetId: props.accountsConfig.getAccountId(account.name),
            type: PolicyType.SERVICE_CONTROL_POLICY,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });

          // Add dependency to ensure that account is part of the OU before
          // attempting to add the SCP
          const organizationAccount = accountMap.get(account.name);
          if (organizationAccount) {
            policyAttachment.node.addDependency(organizationAccount);
          }
        }

        // Deploy SCPs

        for (const serviceControlPolicy of props.organizationConfig.serviceControlPolicies) {
          Logger.info(`[accounts-stack] Adding service control policy (${serviceControlPolicy.name})`);

          const scp = new Policy(this, serviceControlPolicy.name, {
            description: serviceControlPolicy.description,
            name: serviceControlPolicy.name,
            path: path.join(props.configDirPath, serviceControlPolicy.policy),
            type: PolicyType.SERVICE_CONTROL_POLICY,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });

          scp.node.addDependency(enablePolicyTypeScp);

          for (const organizationalUnit of serviceControlPolicy.deploymentTargets.organizationalUnits ?? []) {
            Logger.info(
              `[accounts-stack] Attaching service control policy (${serviceControlPolicy.name}) to organizational unit (${organizationalUnit})`,
            );

            new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${organizationalUnit}`), {
              policyId: scp.id,
              targetId: props.organizationConfig.getOrganizationalUnitId(organizationalUnit),
              type: PolicyType.SERVICE_CONTROL_POLICY,
              kmsKey: key,
              logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
            });
          }

          for (const account of serviceControlPolicy.deploymentTargets.accounts ?? []) {
            const policyAttachment = new PolicyAttachment(this, pascalCase(`Attach_${scp.name}_${account}`), {
              policyId: scp.id,
              targetId: props.accountsConfig.getAccountId(account),
              type: PolicyType.SERVICE_CONTROL_POLICY,
              kmsKey: key,
              logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
            });

            // Add dependency to ensure that account is part of the OU before
            // attempting to add the SCP
            const organizationAccount = accountMap.get(account);
            if (organizationAccount) {
              policyAttachment.node.addDependency(organizationAccount);
            }
          }
        }
      }
    }
  }
}
