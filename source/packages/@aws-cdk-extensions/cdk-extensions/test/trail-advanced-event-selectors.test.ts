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

import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DataResourceType, ReadWriteType } from 'aws-cdk-lib/aws-cloudtrail';
import { test, describe, expect } from 'vitest';
import * as CdkExtensions from '../index';

describe('CloudTrailExtension advancedEventSelectors', () => {
  test('sets AdvancedEventSelectors and clears EventSelectors when provided', () => {
    const stack = new Stack();
    new CdkExtensions.Trail(stack, 'AdvancedSelectorsTrail', {
      isOrganizationTrail: true,
      apiCallRateInsight: false,
      apiErrorRateInsight: false,
      // The exact combination LZA's config validator requires alongside advancedEventSelectors; the
      // base construct rejects NONE with no basic selectors, so the wrapper must withhold the knob.
      managementEvents: ReadWriteType.NONE,
      advancedEventSelectors: [
        {
          name: 'S3DataEventsExcludingLogBucket',
          fieldSelectors: [
            { field: 'eventCategory', equals: ['Data'] },
            { field: 'resources.type', equals: ['AWS::S3::Object'] },
            { field: 'resources.ARN', notStartsWith: ['arn:aws:s3:::log-archive-bucket/'] },
          ],
        },
      ],
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      AdvancedEventSelectors: [
        {
          Name: 'S3DataEventsExcludingLogBucket',
          FieldSelectors: [
            { Field: 'eventCategory', Equals: ['Data'] },
            { Field: 'resources.type', Equals: ['AWS::S3::Object'] },
            { Field: 'resources.ARN', NotStartsWith: ['arn:aws:s3:::log-archive-bucket/'] },
          ],
        },
      ],
    });

    const resources = template.findResources('AWS::CloudTrail::Trail');
    const trailResource = Object.values(resources)[0] as { Properties: Record<string, unknown> };
    expect(trailResource.Properties.EventSelectors).toBeUndefined();
  });

  test('leaves EventSelectors untouched when advancedEventSelectors is not provided', () => {
    const stack = new Stack();
    const trail = new CdkExtensions.Trail(stack, 'BasicSelectorsTrail', {
      isOrganizationTrail: true,
      apiCallRateInsight: false,
      apiErrorRateInsight: false,
    });
    trail.addEventSelector(DataResourceType.S3_OBJECT, ['arn:aws:s3:::']);

    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::CloudTrail::Trail');
    const trailResource = Object.values(resources)[0] as { Properties: Record<string, unknown> };
    expect(trailResource.Properties.AdvancedEventSelectors).toBeUndefined();
  });
});
