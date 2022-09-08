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

export class FinalizeStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    Logger.debug(`[finalize-stack] Region: ${cdk.Stack.of(this).region}`);

    if (props.globalRegion === cdk.Stack.of(this).region) {
      Logger.debug(`[finalize-stack] Retrieving CloudWatch kms key`);
      const cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        'AcceleratorGetCloudWatchKey',
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
        ),
      ) as cdk.aws_kms.Key;

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
          kmsKey: cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
    Logger.info('[finalize-stack] Completed stack synthesis');
  }
}
