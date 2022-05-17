import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';
import * as path from 'path';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';

const testNamePrefix = 'Construct(OperationsStack): ';

/**
 * OperationsStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const env = {
  account: '333333333333',
  region: 'us-east-1',
};

const props: AcceleratorStackProps = {
  env,
  configDirPath,
  accountsConfig: ACCOUNT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  iamConfig: IAM_CONFIG,
  networkConfig: NETWORK_CONFIG,
  organizationConfig: ORGANIZATION_CONFIG,
  securityConfig: SECURITY_CONFIG,
  partition: 'aws',
};

const stack = new OperationsStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.OPERATIONS]}-${env.account}-${env.region}`,
  props,
);

/**
 * OperationsStack construct test
 */
describe('OperationsStack', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of IAM group resource test
   */
  test(`${testNamePrefix} IAM group resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Group', 1);
  });

  /**
   * Number of IAM user resource test
   */
  test(`${testNamePrefix} IAM user resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::User', 2);
  });

  /**
   * Number of SecretsManager secret resource test
   */
  test(`${testNamePrefix} SecretsManager secret resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SecretsManager::Secret', 2);
  });

  /**
   * Number of IAM managedPolicy resource test
   */
  test(`${testNamePrefix} IAM managedPolicy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::ManagedPolicy', 1);
  });

  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of IAM InstanceProfile resource test
   */
  test(`${testNamePrefix} IAM InstanceProfile resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::InstanceProfile', 1);
  });

  /**
   * Number of IAM SAMLProvider resource test
   */
  test(`${testNamePrefix} IAM SAMLProvider resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::SAMLProvider', 1);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 2);
  });

  /**
   * IAM group Administrators resource configuration test
   */
  test(`${testNamePrefix} IAM group Administrators resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AdministratorsA37EF73A: {
          Type: 'AWS::IAM::Group',
          Properties: {
            GroupName: 'Administrators',
            ManagedPolicyArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/AdministratorAccess',
                  ],
                ],
              },
            ],
          },
        },
      },
    });
  });

  /**
   * IAM user BreakGlassUser01 resource configuration test
   */
  test(`${testNamePrefix} IAM user BreakGlassUser01 resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser01AA051328: {
          Type: 'AWS::IAM::User',
          Properties: {
            Groups: [
              {
                Ref: 'AdministratorsA37EF73A',
              },
            ],
            LoginProfile: {
              Password: {
                'Fn::Join': [
                  '',
                  [
                    '{{resolve:secretsmanager:',
                    {
                      Ref: 'BreakGlassUser01Secret8A54324D',
                    },
                    ':SecretString:::}}',
                  ],
                ],
              },
            },
            PermissionsBoundary: {
              Ref: 'DefaultBoundaryPolicy489A8D26',
            },
            UserName: 'breakGlassUser01',
          },
        },
      },
    });
  });

  /**
   * SecretsManager secret BreakGlassUser01Secret resource configuration test
   */
  test(`${testNamePrefix} SecretsManager secret BreakGlassUser01Secret resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser01Secret8A54324D: {
          Type: 'AWS::SecretsManager::Secret',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            GenerateSecretString: {
              GenerateStringKey: 'password',
              SecretStringTemplate: '{"username":"breakGlassUser01"}',
            },
            Name: '/accelerator/breakGlassUser01',
          },
        },
      },
    });
  });

  /**
   * IAM user BreakGlassUser02 resource configuration test
   */
  test(`${testNamePrefix} IAM user BreakGlassUser02 resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser02DFF444C8: {
          Type: 'AWS::IAM::User',
          Properties: {
            Groups: [
              {
                Ref: 'AdministratorsA37EF73A',
              },
            ],
            LoginProfile: {
              Password: {
                'Fn::Join': [
                  '',
                  [
                    '{{resolve:secretsmanager:',
                    {
                      Ref: 'BreakGlassUser02Secret4D200D8D',
                    },
                    ':SecretString:::}}',
                  ],
                ],
              },
            },
            PermissionsBoundary: {
              Ref: 'DefaultBoundaryPolicy489A8D26',
            },
            UserName: 'breakGlassUser02',
          },
        },
      },
    });
  });

  /**
   * SecretsManager secret BreakGlassUser02Secret resource configuration test
   */
  test(`${testNamePrefix} SecretsManager secret BreakGlassUser02Secret resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        BreakGlassUser02Secret4D200D8D: {
          Type: 'AWS::SecretsManager::Secret',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            GenerateSecretString: {
              GenerateStringKey: 'password',
              SecretStringTemplate: '{"username":"breakGlassUser02"}',
            },
            Name: '/accelerator/breakGlassUser02',
          },
        },
      },
    });
  });

  /**
   * IAM managedPolicy DefaultBoundaryPolicy resource configuration test
   */
  test(`${testNamePrefix} IAM managedPolicy DefaultBoundaryPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DefaultBoundaryPolicy489A8D26: {
          Type: 'AWS::IAM::ManagedPolicy',
          Properties: {
            Description: '',
            ManagedPolicyName: 'Default-Boundary-Policy',
            Path: '/',
            PolicyDocument: {
              Statement: [
                {
                  Action: '*',
                  Effect: 'Allow',
                  Resource: '*',
                },
              ],
              Version: '2012-10-17',
            },
          },
        },
      },
    });
  });

  /**
   * IAM role Ec2DefaultSsmAdRole resource configuration test
   */
  test(`${testNamePrefix} IAM role Ec2DefaultSsmAdRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Ec2DefaultSsmAdRoleADFFA4C6: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'ec2.amazonaws.com',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            ManagedPolicyArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/AmazonSSMManagedInstanceCore',
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
                    ':iam::aws:policy/AmazonSSMDirectoryServiceAccess',
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
                    ':iam::aws:policy/CloudWatchAgentServerPolicy',
                  ],
                ],
              },
            ],
            PermissionsBoundary: {
              Ref: 'DefaultBoundaryPolicy489A8D26',
            },
            RoleName: 'EC2-Default-SSM-AD-Role',
          },
        },
      },
    });
  });

  /**
   * IAM InstanceProfile Ec2DefaultSsmAdRoleInstanceProfile resource configuration test
   */
  test(`${testNamePrefix} IAM InstanceProfile Ec2DefaultSsmAdRoleInstanceProfile resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Ec2DefaultSsmAdRoleInstanceProfile: {
          Type: 'AWS::IAM::InstanceProfile',
          Properties: {
            InstanceProfileName: {
              Ref: 'Ec2DefaultSsmAdRoleADFFA4C6',
            },
            Roles: [
              {
                Ref: 'Ec2DefaultSsmAdRoleADFFA4C6',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * IAM SAMLProvider ProviderSamlProvider resource configuration test
   */
  test(`${testNamePrefix} IAM SAMLProvider ProviderSamlProvider resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        ProviderSamlProviderDA84AD16: {
          Type: 'AWS::IAM::SAMLProvider',
          Properties: {
            Name: 'provider',
            SamlMetadataDocument: '',
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamStackId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamStackId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamStackId521A78D3: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-OperationsStack-333333333333-us-east-1/stack-id',
            Type: 'String',
            Value: {
              Ref: 'AWS::StackId',
            },
          },
        },
      },
    });
  });
});
