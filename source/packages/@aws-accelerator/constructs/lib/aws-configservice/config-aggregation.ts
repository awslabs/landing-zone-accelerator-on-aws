/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export interface ConfigAggregationProps {
  acceleratorPrefix: string;
}

export class ConfigAggregation extends Construct {
  constructor(scope: Construct, id: string, props: ConfigAggregationProps) {
    super(scope, id);

    const configAggregatorRole = new cdk.aws_iam.Role(this, 'ConfigAggregatorRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
      description: 'Role used by the AWS Config Service aggregation to use organization resources',
    });

    configAggregatorRole.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRoleForOrganizations'),
    );

    new cdk.aws_config.CfnConfigurationAggregator(this, 'ConfigAggregator', {
      configurationAggregatorName: `${props.acceleratorPrefix}-Aggregator`,
      organizationAggregationSource: {
        roleArn: configAggregatorRole.roleArn,
        allAwsRegions: true,
      },
    });
  }
}
