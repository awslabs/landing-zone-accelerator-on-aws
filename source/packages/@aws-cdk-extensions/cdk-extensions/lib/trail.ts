/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export interface TrailAdvancedFieldSelectorProps {
  readonly field: string;
  readonly equals?: string[];
  readonly notEquals?: string[];
  readonly startsWith?: string[];
  readonly notStartsWith?: string[];
  readonly endsWith?: string[];
  readonly notEndsWith?: string[];
}

export interface TrailAdvancedEventSelectorProps {
  readonly name?: string;
  readonly fieldSelectors: TrailAdvancedFieldSelectorProps[];
}

export interface TrailProps extends cloudtrail.TrailProps {
  readonly isOrganizationTrail: boolean;
  readonly apiCallRateInsight: boolean;
  readonly apiErrorRateInsight: boolean;
  /**
   * When provided, the trail is configured with these CloudTrail advanced event selectors instead of
   * basic event selectors. CloudTrail treats basic and advanced event selectors as mutually exclusive
   * per trail, so any basic selectors added via {@link cloudtrail.Trail.addEventSelector} are ignored
   * when advanced event selectors are set.
   */
  readonly advancedEventSelectors?: TrailAdvancedEventSelectorProps[];
}

export class Trail extends cloudtrail.Trail {
  constructor(scope: Construct, id: string, props: TrailProps) {
    // The base Trail's managementEvents knob only drives the basic event selectors it emits and its
    // synth-time validation of them ("at least one event selector must be added when management event
    // recording is set to None"). Both are replaced below when advanced event selectors are used, so
    // withhold the knob in that case or the base validation rejects the trail.
    super(scope, id, props.advancedEventSelectors ? { ...props, managementEvents: undefined } : props);

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

    if (props.advancedEventSelectors) {
      cfnRepository.advancedEventSelectors = props.advancedEventSelectors.map(selector => ({
        name: selector.name,
        fieldSelectors: selector.fieldSelectors.map(fieldSelector => ({
          field: fieldSelector.field,
          equalTo: fieldSelector.equals,
          notEquals: fieldSelector.notEquals,
          startsWith: fieldSelector.startsWith,
          notStartsWith: fieldSelector.notStartsWith,
          endsWith: fieldSelector.endsWith,
          notEndsWith: fieldSelector.notEndsWith,
        })),
      }));
      // CloudFormation rejects a trail with both EventSelectors and AdvancedEventSelectors set.
      cfnRepository.eventSelectors = undefined;
    }
  }
}
