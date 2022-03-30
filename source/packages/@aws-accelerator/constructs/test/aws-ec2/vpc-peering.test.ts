import * as cdk from 'aws-cdk-lib';

import { VpcPeering } from '../../lib/aws-ec2/vpc-peering';

const testNamePrefix = 'Construct(VpcPeering): ';

//Initialize stack for tests
const stack = new cdk.Stack();

new VpcPeering(stack, 'TestPeering', {
  name: 'Test',
  peerOwnerId: '111111111111',
  peerRegion: 'us-east-1',
  peerVpcId: 'AccepterVpc',
  vpcId: 'RequesterVpc',
  peerRoleName: 'TestRole',
  tags: [],
});

/**
 * VPC peering construct test
 */
describe('VpcPeering', () => {
  /**
   * Number of VPC peering test
   */
  test(`${testNamePrefix} VPC peering count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCPeeringConnection', 1);
  });

  /**
   * VPC peering resource configuration test
   */
  test(`${testNamePrefix} VPC peering resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestPeeringF63C5812: {
          Type: 'AWS::EC2::VPCPeeringConnection',
          Properties: {
            PeerOwnerId: '111111111111',
            PeerRegion: 'us-east-1',
            PeerRoleArn: {
              'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::111111111111:role/TestRole']],
            },
            PeerVpcId: 'AccepterVpc',
            Tags: [
              {
                Key: 'Name',
                Value: 'Test',
              },
            ],
            VpcId: 'RequesterVpc',
          },
        },
      },
    });
  });
});
