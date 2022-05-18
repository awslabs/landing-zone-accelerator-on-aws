import * as cdk from 'aws-cdk-lib';

import { SynthUtils } from '@aws-cdk/assert';

import { HostedZone } from '../../index';

const testNamePrefix = 'Construct(HostedZone): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const hostedZoneName = HostedZone.getHostedZoneNameForService('s3-global.accesspoint', stack.region);

new HostedZone(stack, `TestHostedZone`, {
  hostedZoneName,
  vpcId: 'Test',
});

/**
 * HostedZone construct test
 */
describe('HostedZone', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of hosted zone test
   */
  test(`${testNamePrefix} Hosted zone count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53::HostedZone', 1);
  });

  /**
   * HostedZone resource configuration test
   */
  test(`${testNamePrefix} HostedZone resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestHostedZone68F306E4: {
          Type: 'AWS::Route53::HostedZone',
          Properties: {
            Name: 's3-global.accesspoint.aws.com',
            VPCs: [
              {
                VPCId: 'Test',
                VPCRegion: {
                  Ref: 'AWS::Region',
                },
              },
            ],
          },
        },
      },
    });
  });
});
