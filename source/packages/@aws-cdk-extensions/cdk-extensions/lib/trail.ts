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

import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import { IResolvable } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

export interface TrailProps extends cloudtrail.TrailProps {
  readonly isOrganizationTrail: boolean;
  readonly apiCallRateInsight: boolean;
  readonly apiErrorRateInsight: boolean;
}

export class Trail extends cloudtrail.Trail {
  constructor(scope: Construct, id: string, props: TrailProps) {
    super(scope, id, props);

    const insights: IResolvable | (IResolvable | cloudtrail.CfnTrail.InsightSelectorProperty)[] | undefined = [];

    if (props.apiCallRateInsight) {
      insights.push({ insightType: 'ApiCallRateInsight' });
    }

    if (props.apiErrorRateInsight) {
      insights.push({ insightType: 'ApiErrorRateInsight' });
    }

    const cfnRepository = this.node.defaultChild as cloudtrail.CfnTrail;
    cfnRepository.isOrganizationTrail = props.isOrganizationTrail;
    cfnRepository.insightSelectors = insights;
  }
}
