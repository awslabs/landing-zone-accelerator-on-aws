import * as cdk from 'aws-cdk-lib';
import { OrganizationalUnit } from '../../index';

const testNamePrefix = 'Construct(OrganizationalUnit): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new OrganizationalUnit(stack, 'OrganizationalUnit', {
  name: 'root',
  path: '/',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 365,
});

/**
 * OrganizationalUnit construct test
 */
describe('OrganizationalUnit', () => {
  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of CreateOrganizationalUnit custom resource test
   */
  test(`${testNamePrefix} CreateOrganizationalUnit custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::CreateOrganizationalUnit', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsCreateOrganizationalUnitCustomResourceProviderHandler1A0ECAD6: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsCreateOrganizationalUnitCustomResourceProviderRoleF6B0D3A0'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsCreateOrganizationalUnitCustomResourceProviderRoleF6B0D3A0', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * IAM role resource configuration test
   */
  test(`${testNamePrefix} IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsCreateOrganizationalUnitCustomResourceProviderRoleF6B0D3A0: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'lambda.amazonaws.com',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            ManagedPolicyArns: [
              {
                'Fn::Sub': 'arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
              },
            ],
            Policies: [
              {
                PolicyDocument: {
                  Statement: [
                    {
                      Action: [
                        'organizations:CreateOrganizationalUnit',
                        'organizations:ListOrganizationalUnitsForParent',
                        'organizations:ListRoots',
                        'organizations:UpdateOrganizationalUnit',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                  ],
                  Version: '2012-10-17',
                },
                PolicyName: 'Inline',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * CreateOrganizationalUnit custom resource configuration test
   */
  test(`${testNamePrefix} CreateOrganizationalUnit custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        OrganizationalUnitCDD34C84: {
          Type: 'Custom::CreateOrganizationalUnit',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsCreateOrganizationalUnitCustomResourceProviderHandler1A0ECAD6', 'Arn'],
            },
            name: 'root',
            path: '/',
          },
        },
      },
    });
  });
});
