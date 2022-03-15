import * as cdk from 'aws-cdk-lib';

import { SynthUtils } from '@aws-cdk/assert';

import { PrefixList } from '../../lib/aws-ec2/prefix-list';

const testNamePrefix = 'Construct(PrefixList): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new PrefixList(stack, 'TestPrefixList', {
  name: 'Test',
  addressFamily: 'IPv4',
  maxEntries: 1,
  entries: ['1.1.1.1/32'],
  tags: [],
});

/**
 * Prefix List construct test
 */
describe('PrefixList', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of DHCP options test
   */
  test(`${testNamePrefix} Prefix List count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::PrefixList', 1);
  });

  /**
   * DHCP options resource configuration test
   */
  test(`${testNamePrefix} Prefix List resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestPrefixListF3A076C9: {
          Type: 'AWS::EC2::PrefixList',
          Properties: {
            AddressFamily: 'IPv4',
            MaxEntries: 1,
            Entries: [{ Cidr: '1.1.1.1/32' }],
          },
        },
      },
    });
  });
});
