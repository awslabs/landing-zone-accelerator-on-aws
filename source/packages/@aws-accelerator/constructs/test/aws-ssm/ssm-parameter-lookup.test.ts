import * as cdk from 'aws-cdk-lib';
import { SsmParameterLookup } from '../../index';

const testNamePrefix = 'Construct(SsmParameterLookup): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SsmParameterLookup(stack, 'SsmParameter', {
  name: 'TestParameter',
  accountId: '123123123123',
  roleName: 'TestRole',
  logRetentionInDays: 3653,
});

/**
 * SsmParameterLookup construct test
 */
describe('SsmParameterLookup', () => {
  /**
   * Number of Lambda Function test
   */
  test(`${testNamePrefix} Lambda Function count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of IAM Role test
   */
  test(`${testNamePrefix} IAM Role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Custom resource SsmGetParameterValue test
   */
  test(`${testNamePrefix} Custom resource SsmGetParameterValue count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SsmGetParameterValue', 1);
  });

  /**
   * Custom resource SsmParameterLookup configuration test
   */
  test(`${testNamePrefix} Custom resource SsmParameter configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameter39B3125C: {
          Type: 'Custom::SsmGetParameterValue',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['CustomSsmGetParameterValueCustomResourceProviderLogGroup780D220D'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE', 'Arn'],
            },
            assumeRoleArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::123123123123:role/TestRole',
                ],
              ],
            },
            invokingAccountID: {
              Ref: 'AWS::AccountId',
            },
            parameterAccountID: '123123123123',
            parameterName: 'TestParameter',
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });
});
