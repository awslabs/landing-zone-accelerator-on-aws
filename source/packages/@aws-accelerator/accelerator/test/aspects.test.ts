import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AcceleratorAspects, LambdaDefaultMemoryAspect, PermissionsBoundaryAspect } from '../lib/accelerator-aspects';
import { afterAll, afterEach, beforeAll, beforeEach, describe, test } from 'vitest';

describe('AcceleratorAspects', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
  });

  afterEach(() => {
    delete process.env['ACCELERATOR_NODE_VERSION'];
  });

  describe('LambdaRuntimeAspect', () => {
    test('should upgrade nodejs14.x to nodejs20.x', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws', false);

      // THEN
      template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
      });
    });

    test('should upgrade nodejs16.x to nodejs20.x', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
      });
    });

    test('should not modify supported runtimes', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
      });
    });

    test('should not take action for functions not managed by LZA', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'My custom function',
      });
      // WHEN
      new AcceleratorAspects(stack, 'aws', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs16.x',
      });
    });

    test('should not update if environment variable is set to a lower version', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });
      process.env['ACCELERATOR_NODE_VERSION'] = '18';
      // WHEN
      new AcceleratorAspects(stack, 'aws', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs18.x',
      });
    });

    test('should handle multiple Lambda functions in the same stack', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction1', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });

      new cdk.aws_lambda.Function(stack, 'TestFunction2', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('def handler(event, context): pass'),
        description: 'AWS CDK resource provider framework test',
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws', false);

      // THEN
      template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Lambda::Function', 2);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
      });

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
      });
    });

    test('should apply aspects at different scopes', () => {
      // GIVEN
      const parentStack = new cdk.Stack(app, 'ParentStack');
      const childStack = new cdk.Stack(parentStack, 'ChildStack');

      new cdk.aws_lambda.Function(parentStack, 'ParentFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });

      new cdk.aws_lambda.Function(childStack, 'ChildFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });

      // WHEN
      new AcceleratorAspects(app, 'aws', false);

      // THEN
      const parentTemplate = Template.fromStack(parentStack);
      const childTemplate = Template.fromStack(childStack);

      parentTemplate.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
      });

      childTemplate.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
      });
    });
  });

  describe('LambdaDefaultMemoryAspect', () => {
    test('should set minimum memory to 512MB if not specified', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        memorySize: 128,
      });

      // WHEN
      cdk.Aspects.of(stack).add(new LambdaDefaultMemoryAspect());

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 512,
      });
    });

    test('should not modify memory if already above 512MB', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        memorySize: 1024,
      });

      // WHEN
      cdk.Aspects.of(stack).add(new LambdaDefaultMemoryAspect());

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 1024,
      });
    });
  });

  describe('PermissionsBoundaryAspect', () => {
    beforeAll(() => {
      process.env['PIPELINE_ACCOUNT_ID'] = '123456789012';
      process.env['ACCELERATOR_PERMISSION_BOUNDARY'] = 'test-boundary';
    });

    afterAll(() => {
      delete process.env['PIPELINE_ACCOUNT_ID'];
      delete process.env['ACCELERATOR_PERMISSION_BOUNDARY'];
    });

    test('should add permissions boundary to IAM roles', () => {
      // GIVEN
      new cdk.aws_iam.Role(stack, 'TestRole', {
        assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      });

      // WHEN
      const permissionsBoundaryAspect = new PermissionsBoundaryAspect('123456789012', 'aws');
      cdk.Aspects.of(stack).add(permissionsBoundaryAspect);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        PermissionsBoundary: 'arn:aws:iam::123456789012:policy/test-boundary',
      });
    });

    test('should not add permissions boundary if already exists', () => {
      // GIVEN
      new cdk.aws_iam.Role(stack, 'TestRole', {
        assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
        permissionsBoundary: cdk.aws_iam.ManagedPolicy.fromManagedPolicyArn(
          stack,
          'ExistingBoundary',
          'arn:aws:iam::123456789012:policy/existing-boundary',
        ),
      });

      // WHEN
      const permissionsBoundaryAspect = new PermissionsBoundaryAspect('123456789012', 'aws');
      cdk.Aspects.of(stack).add(permissionsBoundaryAspect);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        PermissionsBoundary: 'arn:aws:iam::123456789012:policy/existing-boundary',
      });
    });
  });

  describe('GovCloudOverrides', () => {
    test('should remove KmsKeyId and Tags from LogGroup', () => {
      // GIVEN
      new cdk.aws_logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/test',
        encryptionKey: new cdk.aws_kms.Key(stack, 'TestKey'),
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws-us-gov', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/test',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template.hasResource('AWS::Logs::LogGroup', (resource: any) => {
        return !resource.Properties.KmsKeyId && !resource.Properties.Tags;
      });
    });

    test('should modify SAML provider URL for GovCloud', () => {
      // GIVEN
      new cdk.aws_iam.Role(stack, 'TestRole', {
        assumedBy: new cdk.aws_iam.SamlConsolePrincipal(
          cdk.aws_iam.SamlProvider.fromSamlProviderArn(
            stack,
            'SamlProvider',
            'arn:aws:iam::123456789012:saml-provider/ADFS',
          ),
        ),
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws-us-gov', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Condition: {
                StringEquals: {
                  'SAML:aud': 'https://signin.amazonaws-us-gov.com/saml',
                },
              },
            },
          ],
        },
      });
    });
  });

  describe('CnOverrides', () => {
    test('should remove Tags from LogGroup', () => {
      // GIVEN
      new cdk.aws_logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/test',
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws-cn', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/test',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template.hasResource('AWS::Logs::LogGroup', (resource: any) => {
        return !resource.Properties.KmsKeyId && !resource.Properties.Tags;
      });
    });

    test('should remove properties from CloudTrail', () => {
      // GIVEN
      new cdk.aws_cloudtrail.Trail(stack, 'TestTrail', {
        isOrganizationTrail: true,
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws-cn', false);

      // THEN
      template = Template.fromStack(stack);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      template.hasResource('AWS::CloudTrail::Trail', (resource: any) => {
        return !resource.Properties.IsOrganizationTrail;
      });
    });
  });

  describe('IsoOverrides', () => {
    describe('IsoOverrides', () => {
      const partition = 'aws-iso';
      test('should remove properties from EC2 FlowLog', () => {
        // GIVEN
        const vpc = new cdk.aws_ec2.Vpc(stack, 'TestVpc');
        new cdk.aws_ec2.FlowLog(stack, 'TestFlowLog', {
          destination: cdk.aws_ec2.FlowLogDestination.toCloudWatchLogs(),
          resourceType: cdk.aws_ec2.FlowLogResourceType.fromVpc(vpc),
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::EC2::FlowLog', (resource: any) => {
          return (
            !resource.Properties.LogFormat && !resource.Properties.Tags && !resource.Properties.MaxAggregationInterval
          );
        });
      });

      test('should remove properties from CfnLogGroup', () => {
        // GIVEN
        const logGroup = new cdk.aws_logs.LogGroup(stack, 'TestLogGroup', {
          logGroupName: '/aws/test',
          encryptionKey: new cdk.aws_kms.Key(stack, 'TestKey'),
        });

        cdk.Tags.of(logGroup).add('Environment', 'Production');

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::Logs::LogGroup', (resource: any) => {
          return !resource.Properties.KmsKeyId && !resource.Properties.Tags;
        });
      });

      test('should remove properties from CfnEcrRepo', () => {
        // GIVEN
        new cdk.aws_ecr.Repository(stack, 'TestEcrRepo', {
          repositoryName: 'testrepo',
          imageTagMutability: cdk.aws_ecr.TagMutability.IMMUTABLE,
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::ECR::Repository', (resource: any) => {
          return !resource.Properties.ImageTagMutability;
        });
      });

      test('should remove properties from CloudTrail', () => {
        // GIVEN
        new cdk.aws_cloudtrail.Trail(stack, 'TestTrail', {
          isOrganizationTrail: true,
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::CloudTrail::Trail', (resource: any) => {
          return !resource.Properties.InsightSelectors && !resource.Properties.IsOrganizationTrail;
        });
      });

      test('should modify SAML provider URL for Iso', () => {
        // GIVEN
        new cdk.aws_iam.Role(stack, 'TestRole', {
          assumedBy: new cdk.aws_iam.SamlConsolePrincipal(
            cdk.aws_iam.SamlProvider.fromSamlProviderArn(
              stack,
              'SamlProvider',
              'arn:aws:iam::123456789012:saml-provider/ADFS',
            ),
          ),
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::IAM::Role', {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Condition: {
                  StringEquals: {
                    'SAML:aud': 'https://signin.c2shome.ic.gov/saml',
                  },
                },
              },
            ],
          },
        });
      });
    });

    describe('IsobOverrides', () => {
      const partition = 'aws-iso-b';
      test('should remove properties from EC2 FlowLog', () => {
        // GIVEN
        const vpc = new cdk.aws_ec2.Vpc(stack, 'TestVpc');
        new cdk.aws_ec2.FlowLog(stack, 'TestFlowLog', {
          destination: cdk.aws_ec2.FlowLogDestination.toCloudWatchLogs(),
          resourceType: cdk.aws_ec2.FlowLogResourceType.fromVpc(vpc),
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::EC2::FlowLog', (resource: any) => {
          return (
            !resource.Properties.LogFormat && !resource.Properties.Tags && !resource.Properties.MaxAggregationInterval
          );
        });
      });

      test('should remove properties from CfnLogGroup', () => {
        // GIVEN
        const logGroup = new cdk.aws_logs.LogGroup(stack, 'TestLogGroup', {
          logGroupName: '/aws/test',
          encryptionKey: new cdk.aws_kms.Key(stack, 'TestKey'),
        });

        cdk.Tags.of(logGroup).add('Environment', 'Production');

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::Logs::LogGroup', (resource: any) => {
          return !resource.Properties.KmsKeyId && !resource.Properties.Tags;
        });
      });

      test('should remove properties from CfnEcrRepo', () => {
        // GIVEN
        new cdk.aws_ecr.Repository(stack, 'TestEcrRepo', {
          repositoryName: 'testrepo',
          imageTagMutability: cdk.aws_ecr.TagMutability.IMMUTABLE,
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::ECR::Repository', (resource: any) => {
          return !resource.Properties.ImageTagMutability;
        });
      });

      test('should remove properties from CloudTrail', () => {
        // GIVEN
        new cdk.aws_cloudtrail.Trail(stack, 'TestTrail', {
          isOrganizationTrail: true,
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template.hasResource('AWS::CloudTrail::Trail', (resource: any) => {
          return !resource.Properties.InsightSelectors && !resource.Properties.IsOrganizationTrail;
        });
      });

      test('should modify SAML provider URL for Iso-b', () => {
        // GIVEN
        new cdk.aws_iam.Role(stack, 'TestRole', {
          assumedBy: new cdk.aws_iam.SamlConsolePrincipal(
            cdk.aws_iam.SamlProvider.fromSamlProviderArn(
              stack,
              'SamlProvider',
              'arn:aws:iam::123456789012:saml-provider/ADFS',
            ),
          ),
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN
        template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::IAM::Role', {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Condition: {
                  StringEquals: {
                    'SAML:aud': 'https://signin.sc2shome.sgov.gov/saml',
                  },
                },
              },
            ],
          },
        });
      });
    });

    describe('IsoeOverrides', () => {
      test('should modify SAML provider URL for iso-e', () => {
        // GIVEN
        new cdk.aws_iam.Role(stack, 'TestRole', {
          assumedBy: new cdk.aws_iam.SamlConsolePrincipal(
            cdk.aws_iam.SamlProvider.fromSamlProviderArn(
              stack,
              'SamlProvider',
              'arn:aws:iam::123456789012:saml-provider/ADFS',
            ),
          ),
        });

        // WHEN
        new AcceleratorAspects(stack, 'aws-iso-e', false);

        // THEN
        template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::IAM::Role', {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Condition: {
                  StringEquals: {
                    'SAML:aud': 'https://console.csphome.adc-e.uk/saml',
                  },
                },
              },
            ],
          },
        });
      });
    });

    describe('IsofOverrides', () => {
      test('should modify SAML provider URL for iso-f', () => {
        // GIVEN
        new cdk.aws_iam.Role(stack, 'TestRole', {
          assumedBy: new cdk.aws_iam.SamlConsolePrincipal(
            cdk.aws_iam.SamlProvider.fromSamlProviderArn(
              stack,
              'SamlProvider',
              'arn:aws:iam::123456789012:saml-provider/ADFS',
            ),
          ),
        });

        // WHEN
        new AcceleratorAspects(stack, 'aws-iso-f', false);

        // THEN
        template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::IAM::Role', {
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Condition: {
                  StringEquals: {
                    'SAML:aud': 'https://signin.csphome.hci.ic.gov/saml',
                  },
                },
              },
            ],
          },
        });
      });
    });
  });

  describe('ExistingRoleOverrides', () => {
    beforeAll(() => {
      process.env['ACCELERATOR_PREFIX'] = 'AWSAccelerator';
    });

    afterAll(() => {
      delete process.env['ACCELERATOR_PREFIX'];
    });

    test('should replace CloudTrail CloudWatch logs role', () => {
      // GIVEN
      new cdk.aws_cloudtrail.Trail(stack, 'TestTrail', {
        sendToCloudWatchLogs: true,
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws', true);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::CloudTrail::Trail', {
        CloudWatchLogsRoleArn: {
          'Fn::Sub': 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/AWSAcceleratorCloudTrailCloudWatchRole',
        },
      });
    });

    test('should replace Lambda function role', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
      });

      // WHEN
      new AcceleratorAspects(stack, 'aws', true);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Role: {
          'Fn::Sub': 'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/AWSAcceleratorLambdaRole',
        },
      });
    });
  });
});
