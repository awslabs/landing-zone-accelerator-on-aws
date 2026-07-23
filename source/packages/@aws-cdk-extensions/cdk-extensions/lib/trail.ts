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

export interface TrailProps extends cloudtrail.TrailProps {
  readonly isOrganizationTrail: boolean;
  readonly apiCallRateInsight: boolean;
  readonly apiErrorRateInsight: boolean;
}

/**
 * Represents a single field selector condition for an Advanced Event Selector.
 */
export interface AdvancedFieldSelector {
  readonly field: string;
  readonly equals?: string[];
  readonly notEquals?: string[];
  readonly startsWith?: string[];
  readonly notStartsWith?: string[];
  readonly endsWith?: string[];
  readonly notEndsWith?: string[];
}

/**
 * Represents an Advanced Event Selector for CloudTrail.
 */
export interface AdvancedEventSelector {
  readonly name: string;
  readonly fieldSelectors: AdvancedFieldSelector[];
}

export class Trail extends cloudtrail.Trail {
  private readonly cfnTrail: cloudtrail.CfnTrail;

  constructor(scope: Construct, id: string, props: TrailProps) {
    super(scope, id, props);

    const insights: IResolvable | (IResolvable | cloudtrail.CfnTrail.InsightSelectorProperty)[] | undefined = [];

    if (props.apiCallRateInsight) {
      insights.push({ insightType: 'ApiCallRateInsight' });
    }

    if (props.apiErrorRateInsight) {
      insights.push({ insightType: 'ApiErrorRateInsight' });
    }

    this.cfnTrail = this.node.defaultChild as cloudtrail.CfnTrail;
    this.cfnTrail.isOrganizationTrail = props.isOrganizationTrail;
    this.cfnTrail.insightSelectors = insights;
  }

  /**
   * Sets Advanced Event Selectors on the trail, replacing any basic Event Selectors.
   *
   * Advanced Event Selectors support fine-grained filtering including exclusion of
   * specific S3 buckets from data event logging, which is not possible with basic
   * Event Selectors.
   *
   * Note: EventSelectors and AdvancedEventSelectors are mutually exclusive in CloudFormation.
   * This method clears any basic EventSelectors that were previously set.
   *
   * @param selectors - Array of Advanced Event Selectors to apply to the trail
   */
  public setAdvancedEventSelectors(selectors: AdvancedEventSelector[]): void {
    // Clear basic event selectors - they are mutually exclusive with advanced selectors
    this.cfnTrail.eventSelectors = undefined;

    // Map to CfnTrail.AdvancedFieldSelectorProperty format
    this.cfnTrail.advancedEventSelectors = selectors.map(selector => ({
      name: selector.name,
      fieldSelectors: selector.fieldSelectors.map(fs => ({
        field: fs.field,
        equalTo: fs.equals,
        notEquals: fs.notEquals,
        startsWith: fs.startsWith,
        notStartsWith: fs.notStartsWith,
        endsWith: fs.endsWith,
        notEndsWith: fs.notEndsWith,
      })),
    }));
  }
}
