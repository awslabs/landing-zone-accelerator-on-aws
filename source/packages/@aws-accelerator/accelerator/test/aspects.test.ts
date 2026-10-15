import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { AcceleratorAspects, LambdaDefaultMemoryAspect, PermissionsBoundaryAspect } from '../lib/accelerator-aspects';
import { CustomStack } from '../lib/stacks/custom-stack';
import { afterAll, afterEach, beforeAll, beforeEach, describe, test } from 'vitest';
import { config } from '../../../../package.json';

/**
 * LambdaRuntimeAspect overrides runtimes to `nodejs${getNodeVersion()}.x`, which resolves to the
 * configured default. Derive the expectations from config so a Node upgrade does not require
 * editing every assertion in this file.
 */
const DEFAULT_NODE_RUNTIME = `nodejs${config.node.version.default}.x`;
/** Lowest major still accepted by getNodeVersion(), used to exercise an explicit override. */
const MINIMUM_NODE_RUNTIME = `nodejs${config.node.version.minimum}.x`;

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
    test('should upgrade nodejs14.x to the configured default runtime', () => {
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
        Runtime: DEFAULT_NODE_RUNTIME,
      });
    });

    test('should upgrade nodejs16.x to the configured default runtime', () => {
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
        Runtime: DEFAULT_NODE_RUNTIME,
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
        Runtime: DEFAULT_NODE_RUNTIME,
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

    test('should honor an explicit ACCELERATOR_NODE_VERSION below the default', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
        description: 'AWS CDK resource provider framework test',
      });
      // Must stay >= config.node.version.minimum, otherwise getNodeVersion() throws.
      process.env['ACCELERATOR_NODE_VERSION'] = String(config.node.version.minimum);
      // WHEN
      new AcceleratorAspects(stack, 'aws', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: MINIMUM_NODE_RUNTIME,
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
        Runtime: DEFAULT_NODE_RUNTIME,
        Handler: 'index.handler',
      });

      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: DEFAULT_NODE_RUNTIME,
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
        Runtime: DEFAULT_NODE_RUNTIME,
      });

      childTemplate.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: DEFAULT_NODE_RUNTIME,
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

  describe('AwsSolutionAspect', () => {
    test('should add SOLUTION_ID environment variable when no exclusion predicate is configured', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
      });

      // WHEN
      new AcceleratorAspects(app, 'aws', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            SOLUTION_ID: Match.stringLikeRegexp('AwsSolution/SO0199/.*'),
          },
        },
      });
    });

    test('should add SOLUTION_ID environment variable when the exclusion predicate does not match the stack', () => {
      // GIVEN
      new cdk.aws_lambda.Function(stack, 'TestFunction', {
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: cdk.aws_lambda.Code.fromInline('exports.handler = function() { }'),
      });

      // WHEN
      new AcceleratorAspects(app, 'aws', false, {
        excludeAwsSolutionAspect: candidateStack => candidateStack instanceof CustomStack,
      });

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            SOLUTION_ID: Match.stringLikeRegexp('AwsSolution/SO0199/.*'),
          },
        },
      });
    });

    test('should not inject SOLUTION_ID into Lambda functions in a customization CustomStack (issue #643)', () => {
      // GIVEN - a customer customization template imported verbatim via CfnInclude
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-aspect-test-'));
      const templateFile = 'lambda-edge.yaml';
      fs.writeFileSync(
        path.join(tmpDir, templateFile),
        [
          "AWSTemplateFormatVersion: '2010-09-09'",
          'Resources:',
          '  HelloWorldLambdaFunction:',
          '    Type: AWS::Lambda::Function',
          '    Properties:',
          '      Handler: index.lambda_handler',
          '      Role: arn:aws:iam::111111111111:role/edge-role',
          '      Runtime: python3.12',
          '      Code:',
          '        ZipFile: |',
          '          def lambda_handler(event, context):',
          "              return 'Hello, World!'",
          '',
        ].join('\n'),
      );

      const customStack = new CustomStack(app, 'TestCustomStack', {
        env: { account: '111111111111', region: 'us-east-1' },
        configDirPath: tmpDir,
        accountsConfig: new AccountsConfig({
          managementAccountEmail: 'management@example.com',
          logArchiveAccountEmail: 'logArchive@example.com',
          auditAccountEmail: 'audit@example.com',
        }),
        globalConfig: new GlobalConfig({
          homeRegion: 'us-east-1',
          controlTower: { enable: false },
          managementAccountAccessRole: 'AWSControlTowerExecution',
        }),
        iamConfig: new IamConfig(),
        networkConfig: new NetworkConfig(),
        organizationConfig: new OrganizationConfig(),
        securityConfig: new SecurityConfig(),
        customizationsConfig: new CustomizationsConfig(),
        partition: 'aws',
        centralizedLoggingRegion: 'us-east-1',
        runOrder: 1,
        stackName: 'TestCustomStack',
        templateFile,
        terminationProtection: false,
        ssmParamNamePrefix: '/accelerator',
      });

      // WHEN
      new AcceleratorAspects(app, 'aws', false, {
        excludeAwsSolutionAspect: candidateStack => candidateStack instanceof CustomStack,
      });

      // THEN - only AwsSolutionAspect is excluded; the default memory aspect still applies
      const customTemplate = Template.fromStack(customStack);
      customTemplate.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'index.lambda_handler',
        MemorySize: 512,
        Environment: Match.absent(),
      });

      fs.rmSync(tmpDir, { recursive: true, force: true });
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
    test('should keep KmsKeyId and Tags on LogGroup (issue #5013)', () => {
      // GIVEN
      const key = new cdk.aws_kms.Key(stack, 'TestKey');
      const logGroup = new cdk.aws_logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/test',
        encryptionKey: key,
      });

      cdk.Tags.of(logGroup).add('Environment', 'Production');

      // WHEN
      new AcceleratorAspects(stack, 'aws-us-gov', false);

      // THEN the configured CMK and tags reach the template instead of being stripped
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/test',
        KmsKeyId: stack.resolve(key.keyArn),
        Tags: Match.arrayWith([{ Key: 'Environment', Value: 'Production' }]),
      });
    });

    test('should keep KmsKeyId and Tags on LogGroup in a customization CustomStack', () => {
      // GIVEN - a customer customization template imported verbatim via CfnInclude
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-aspect-test-'));
      const templateFile = 'log-group.yaml';
      const kmsKeyArn = 'arn:aws-us-gov:kms:us-gov-west-1:111111111111:key/11111111-2222-3333-4444-555555555555';
      fs.writeFileSync(
        path.join(tmpDir, templateFile),
        [
          "AWSTemplateFormatVersion: '2010-09-09'",
          'Resources:',
          '  CustomerLogGroup:',
          '    Type: AWS::Logs::LogGroup',
          '    Properties:',
          '      LogGroupName: /customer/app',
          `      KmsKeyId: ${kmsKeyArn}`,
          '      Tags:',
          '        - Key: Owner',
          '          Value: app-team',
          '',
        ].join('\n'),
      );

      const customStack = new CustomStack(app, 'TestCustomStack', {
        env: { account: '111111111111', region: 'us-gov-west-1' },
        configDirPath: tmpDir,
        accountsConfig: new AccountsConfig({
          managementAccountEmail: 'management@example.com',
          logArchiveAccountEmail: 'logArchive@example.com',
          auditAccountEmail: 'audit@example.com',
        }),
        globalConfig: new GlobalConfig({
          homeRegion: 'us-gov-west-1',
          controlTower: { enable: false },
          managementAccountAccessRole: 'AWSControlTowerExecution',
        }),
        iamConfig: new IamConfig(),
        networkConfig: new NetworkConfig(),
        organizationConfig: new OrganizationConfig(),
        securityConfig: new SecurityConfig(),
        customizationsConfig: new CustomizationsConfig(),
        partition: 'aws-us-gov',
        centralizedLoggingRegion: 'us-gov-west-1',
        runOrder: 1,
        stackName: 'TestCustomStack',
        templateFile,
        terminationProtection: false,
        ssmParamNamePrefix: '/accelerator',
      });

      // WHEN
      new AcceleratorAspects(app, 'aws-us-gov', false, {
        excludeAwsSolutionAspect: candidateStack => candidateStack instanceof CustomStack,
      });

      // THEN the customer-authored KmsKeyId and Tags are deployed as written
      const customTemplate = Template.fromStack(customStack);
      customTemplate.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/customer/app',
        KmsKeyId: kmsKeyArn,
        Tags: [{ Key: 'Owner', Value: 'app-team' }],
      });

      fs.rmSync(tmpDir, { recursive: true, force: true });
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
    test('should keep KmsKeyId but remove Tags from LogGroup', () => {
      // GIVEN
      const logGroup = new cdk.aws_logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/test',
        encryptionKey: new cdk.aws_kms.Key(stack, 'TestKey'),
      });

      cdk.Tags.of(logGroup).add('Environment', 'Production');

      // WHEN
      new AcceleratorAspects(stack, 'aws-cn', false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/test',
        KmsKeyId: Match.anyValue(),
        Tags: Match.absent(),
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
      test('should preserve custom format properties but strip MaxAggregationInterval on EC2 FlowLog', () => {
        // GIVEN a flow log configured with a custom LogFormat, MaxAggregationInterval, and Tags
        const vpc = new cdk.aws_ec2.Vpc(stack, 'TestVpc');
        new cdk.aws_ec2.CfnFlowLog(stack, 'TestFlowLog', {
          resourceType: 'VPC',
          resourceId: vpc.vpcId,
          trafficType: 'ALL',
          logDestinationType: 'cloud-watch-logs',
          logFormat: '${version} ${account-id} ${srcaddr} ${dstaddr}',
          maxAggregationInterval: 60,
          tags: [{ key: 'Name', value: 'test-flow-log' }],
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN LogFormat and Tags flow through (issue #4997), but MaxAggregationInterval
        // is stripped because the property is not supported in this partition
        template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::EC2::FlowLog', {
          LogFormat: '${version} ${account-id} ${srcaddr} ${dstaddr}',
          Tags: Match.arrayWith([{ Key: 'Name', Value: 'test-flow-log' }]),
          MaxAggregationInterval: Match.absent(),
        });
      });

      test('should keep KmsKeyId but remove Tags from CfnLogGroup', () => {
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
        template.hasResourceProperties('AWS::Logs::LogGroup', {
          LogGroupName: '/aws/test',
          KmsKeyId: Match.anyValue(),
          Tags: Match.absent(),
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
      test('should preserve custom format properties but strip MaxAggregationInterval on EC2 FlowLog', () => {
        // GIVEN a flow log configured with a custom LogFormat, MaxAggregationInterval, and Tags
        const vpc = new cdk.aws_ec2.Vpc(stack, 'TestVpc');
        new cdk.aws_ec2.CfnFlowLog(stack, 'TestFlowLog', {
          resourceType: 'VPC',
          resourceId: vpc.vpcId,
          trafficType: 'ALL',
          logDestinationType: 'cloud-watch-logs',
          logFormat: '${version} ${account-id} ${srcaddr} ${dstaddr}',
          maxAggregationInterval: 60,
          tags: [{ key: 'Name', value: 'test-flow-log' }],
        });

        // WHEN
        new AcceleratorAspects(stack, partition, false);

        // THEN LogFormat and Tags flow through (issue #4997), but MaxAggregationInterval
        // is stripped because the property is not supported in this partition
        template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::EC2::FlowLog', {
          LogFormat: '${version} ${account-id} ${srcaddr} ${dstaddr}',
          Tags: Match.arrayWith([{ Key: 'Name', Value: 'test-flow-log' }]),
          MaxAggregationInterval: Match.absent(),
        });
      });

      test('should keep KmsKeyId but remove Tags from CfnLogGroup', () => {
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
        template.hasResourceProperties('AWS::Logs::LogGroup', {
          LogGroupName: '/aws/test',
          KmsKeyId: Match.anyValue(),
          Tags: Match.absent(),
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

  describe('LogGroup partition overrides', () => {
    // Expected handling of CloudWatch log group KmsKeyId and Tags per partition
    test.each([
      { partition: 'aws', keepsKmsKeyId: true, keepsTags: true },
      { partition: 'aws-us-gov', keepsKmsKeyId: true, keepsTags: true },
      { partition: 'aws-eusc', keepsKmsKeyId: true, keepsTags: true },
      { partition: 'aws-iso-e', keepsKmsKeyId: true, keepsTags: true },
      { partition: 'aws-iso-f', keepsKmsKeyId: true, keepsTags: true },
      { partition: 'aws-iso', keepsKmsKeyId: true, keepsTags: false },
      { partition: 'aws-iso-b', keepsKmsKeyId: true, keepsTags: false },
      { partition: 'aws-cn', keepsKmsKeyId: true, keepsTags: false },
    ])('$partition: KmsKeyId kept=$keepsKmsKeyId, Tags kept=$keepsTags', ({ partition, keepsKmsKeyId, keepsTags }) => {
      // GIVEN
      const key = new cdk.aws_kms.Key(stack, 'TestKey');
      const logGroup = new cdk.aws_logs.LogGroup(stack, 'TestLogGroup', {
        logGroupName: '/aws/test',
        encryptionKey: key,
      });

      cdk.Tags.of(logGroup).add('Environment', 'Production');

      // WHEN
      new AcceleratorAspects(stack, partition, false);

      // THEN
      template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/test',
        KmsKeyId: keepsKmsKeyId ? stack.resolve(key.keyArn) : Match.absent(),
        Tags: keepsTags ? Match.arrayWith([{ Key: 'Environment', Value: 'Production' }]) : Match.absent(),
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
