import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { ResourceShare } from '../../index';

const testNamePrefix = 'Construct(ResourceShare): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ResourceShare(stack, 'ResourceShare', {
  name: 'TestResourceShare',
  allowExternalPrincipals: true,
  permissionArns: [
    `arn:${stack.partition}:s3:::test-bucket-1-${stack.account}-${stack.region}`,
    `arn:${stack.partition}:s3:::test-bucket-2-${stack.account}-${stack.region}`,
  ],

  principals: ['accountID', 'organizationUnitId'],
  resourceArns: ['ec2:TransitGateway'],
});

/**
 * ResourceShare construct test
 */
describe('ResourceShare', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of ResourceShare resource test
   */
  test(`${testNamePrefix} ResourceShare resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::RAM::ResourceShare', 1);
  });

  /**
   * ResourceShare resource configuration test
   */
  test(`${testNamePrefix} ResourceShare resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        ResourceShareTestResourceShareResourceShare8D7B67C7: {
          Type: 'AWS::RAM::ResourceShare',
          Properties: {
            AllowExternalPrincipals: true,
            Name: 'TestResourceShare',
            PermissionArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':s3:::test-bucket-1-',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '-',
                    {
                      Ref: 'AWS::Region',
                    },
                  ],
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':s3:::test-bucket-2-',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '-',
                    {
                      Ref: 'AWS::Region',
                    },
                  ],
                ],
              },
            ],
            Principals: ['accountID', 'organizationUnitId'],
            ResourceArns: ['ec2:TransitGateway'],
          },
        },
      },
    });
  });

  //End of file
});
