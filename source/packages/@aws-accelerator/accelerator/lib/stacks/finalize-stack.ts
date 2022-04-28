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
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { Logger } from '../logger';
import { DetachQuarantineScp } from '../detach-quarantine-scp';
import { KeyStack } from './key-stack';
import { KeyLookup } from '@aws-accelerator/constructs';

export class FinalizeStack extends AcceleratorStack {
  public static readonly CROSS_ACCOUNT_ACCESS_ROLE_NAME = 'AWSAccelerator-CrossAccount-SsmParameter-Role';
  public static readonly ACCELERATOR_KEY_ARN_PARAMETER_NAME = '/accelerator/kms/key-arn';

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    Logger.debug(`[finalize-stack] Region: ${cdk.Stack.of(this).region}`);

    let globalRegion = 'us-east-1';
    if (this.partition === 'aws-us-gov') {
      globalRegion = 'us-gov-west-1';
    }

    if (globalRegion === cdk.Stack.of(this).region) {
      Logger.debug(`[finalize-stack] Retrieving kms key`);
      const key = new KeyLookup(this, 'AcceleratorKeyLookup', {
        accountId: props.accountsConfig.getAuditAccountId(),
        roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
        keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      }).getKey();

      if (props.organizationConfig.quarantineNewAccounts?.enable && props.partition == 'aws') {
        Logger.debug(`[finalize-stack] Creating resources to detach quarantine scp`);
        const policyId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/organizations/scp/${props.organizationConfig.quarantineNewAccounts?.scpPolicyName}/id`,
        );

        new DetachQuarantineScp(this, 'DetachQuarantineScp', {
          scpPolicyId: policyId,
          managementAccountId: props.accountsConfig.getManagementAccountId(),
          partition: props.partition,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
    Logger.info('[finalize-stack] Completed stack synthesis');
  }
}
