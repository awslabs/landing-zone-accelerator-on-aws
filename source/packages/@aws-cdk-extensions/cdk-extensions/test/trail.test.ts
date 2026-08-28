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

import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ReadWriteType } from 'aws-cdk-lib/aws-cloudtrail';
import { test, describe, expect } from 'vitest';
import * as CdkExtensions from '../index';

const s3DataEventsSelector: CdkExtensions.AdvancedEventSelector = {
  name: 'S3 data events excluding central logs bucket',
  fieldSelectors: [
    { field: 'eventCategory', equals: ['Data'] },
    { field: 'resources.type', equals: ['AWS::S3::Object'] },
    { field: 'resources.ARN', notStartsWith: ['arn:aws:s3:::central-logs-bucket/'] },
  ],
};

const managementEventsSelector: CdkExtensions.AdvancedEventSelector = {
  name: 'Management events',
  fieldSelectors: [{ field: 'eventCategory', equals: ['Management'] }],
};

function newTrail(stack: Stack, props?: Partial<CdkExtensions.TrailProps>): CdkExtensions.Trail {
  return new CdkExtensions.Trail(stack, 'Trail', {
    isOrganizationTrail: false,
    apiCallRateInsight: false,
    apiErrorRateInsight: false,
    ...props,
  });
}

describe('Trail setAdvancedEventSelectors', () => {
  /**
   * Regression: with managementEvents set to NONE, the base cloudtrail.Trail construct validates
   * that at least one basic EventSelector exists. Advanced selectors express management events via
   * an eventCategory field selector instead, so synth must not throw for this valid combination.
   */
  test('synthesizes without throwing when managementEvents is NONE and only data events are set', () => {
    const app = new App();
    const stack = new Stack(app, 'Stack');
    const trail = newTrail(stack, { managementEvents: ReadWriteType.NONE });
    trail.setAdvancedEventSelectors([s3DataEventsSelector]);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      AdvancedEventSelectors: [
        {
          Name: 'S3 data events excluding central logs bucket',
          FieldSelectors: [
            { Field: 'eventCategory', Equals: ['Data'] },
            { Field: 'resources.type', Equals: ['AWS::S3::Object'] },
            { Field: 'resources.ARN', NotStartsWith: ['arn:aws:s3:::central-logs-bucket/'] },
          ],
        },
      ],
    });
  });

  test('clears basic EventSelectors when advanced selectors are applied', () => {
    const app = new App();
    const stack = new Stack(app, 'Stack');
    const trail = newTrail(stack, { managementEvents: ReadWriteType.ALL });
    trail.setAdvancedEventSelectors([managementEventsSelector, s3DataEventsSelector]);

    const template = Template.fromStack(stack);
    const trails = template.findResources('AWS::CloudTrail::Trail');
    const properties = Object.values(trails)[0].Properties;
    expect(properties.EventSelectors).toBeUndefined();
    expect(properties.AdvancedEventSelectors).toHaveLength(2);
  });
});
