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

import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface ValidateStackProps extends cdk.StackProps {
  stage: string;
}

export class ValidateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ValidateStackProps) {
    super(scope, id, props);

    new ssm.StringParameter(this, 'Parameter', {
      parameterName: `/accelerator/validate-stack/${props.stage}`,
      stringValue: 'value',
    });
  }
}
