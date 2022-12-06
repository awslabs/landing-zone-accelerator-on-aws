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

interface IFMSNotificationChannel extends cdk.IResource {
  /**
   * The SNS role arn for the delivery channel
   */
  readonly snsRoleArn: string;

  /**
   *  The SNS topic arn for the delivery channel
   */
  readonly snsTopicArn: string;
}

interface FMSNotificationChannelProps {
  /**
   * The SNS role arn for the delivery channel
   */
  readonly snsRoleArn: string;
  /**
   *  The SNS topic arn for the delivery channel
   */
  readonly snsTopicArn: string;
}

export class FMSNotificationChannel extends cdk.Resource implements IFMSNotificationChannel {
  public readonly snsRoleArn: string;
  public readonly snsTopicArn: string;

  constructor(scope: Construct, id: string, props: FMSNotificationChannelProps) {
    super(scope, id);

    const resource = new cdk.aws_fms.CfnNotificationChannel(this, 'Resource', {
      snsRoleName: props.snsRoleArn,
      snsTopicArn: props.snsTopicArn,
    });

    this.snsRoleArn = resource.snsRoleName;
    this.snsTopicArn = resource.snsTopicArn;
  }
}
