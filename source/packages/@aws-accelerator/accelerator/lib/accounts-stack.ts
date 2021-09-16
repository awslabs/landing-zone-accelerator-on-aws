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

/**
 * @module
 * Module comment
 */

import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';

export interface AccountsStackProps extends cdk.StackProps {
  stage: string;
}

export class AccountsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props);

    new ssm.StringParameter(this, 'Parameter', {
      parameterName: `/accelerator/accounts-stack/${props.stage}`,
      stringValue: 'value',
    });
  }
}
