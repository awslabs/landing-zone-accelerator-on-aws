import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import path from 'path';

export interface DiagnosticsPackStackProps extends cdk.StackProps {
  readonly acceleratorPrefix: string;
  readonly ssmParamPrefix: string;
  readonly bucketNamePrefix: string;
  readonly installerStackName: string;
  readonly configRepositoryName: string;
  readonly qualifier?: string;
}

export class DiagnosticsPackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DiagnosticsPackStackProps) {
    super(scope, id, props);

    let keyParameterName = `${props.ssmParamPrefix}/installer/kms/key-arn`;
    let reportDestinationBucketName = `${props.bucketNamePrefix}-installer-${cdk.Stack.of(this).account}-${
      cdk.Stack.of(this).region
    }`;
    let pipelineAccountResourcesPrefix = props.acceleratorPrefix;
    let diagnosticsPackLambdaRoleNamePrefix = props.acceleratorPrefix;

    if (props.qualifier) {
      keyParameterName = `${props.ssmParamPrefix}/${props.qualifier}/installer/kms/key-arn`;
      reportDestinationBucketName = `${props.qualifier}-installer-${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }`;
      pipelineAccountResourcesPrefix = props.qualifier;
      diagnosticsPackLambdaRoleNamePrefix = props.qualifier;
    }

    const destinationBucket = cdk.aws_s3.Bucket.fromBucketName(this, 'DestinationBucket', reportDestinationBucketName);
    const diagnosticsPackAccessRole = `${props.acceleratorPrefix}-DiagnosticsPackAccessRole`;

    const diagnosticsPackLambdaRole = new cdk.aws_iam.Role(this, 'DiagnosticsPackLambdaRole', {
      roleName: `${diagnosticsPackLambdaRoleNamePrefix}-DiagnosticsPackLambdaRole`,
      assumedBy: new cdk.aws_iam.ServicePrincipal(`lambda.${this.urlSuffix}`),
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    });

    diagnosticsPackLambdaRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${diagnosticsPackAccessRole}`],
      }),
    );

    diagnosticsPackLambdaRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'AllowStsCallerIdentityActions',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:GetCallerIdentity'],
        resources: ['*'],
      }),
    );

    diagnosticsPackLambdaRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'CloudformationAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['cloudformation:DescribeStackEvents', 'cloudformation:DescribeStacks'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:cloudformation:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:stack/${pipelineAccountResourcesPrefix}*`,
        ],
      }),
    );

    if (!props.qualifier) {
      diagnosticsPackLambdaRole.addToPrincipalPolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'OrganizationsAccess',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['organizations:ListAccounts'],
          resources: ['*'],
        }),
      );
    }

    diagnosticsPackLambdaRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'CodecommitAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['codecommit:GetFile'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:codecommit:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${
            props.configRepositoryName
          }`,
        ],
      }),
    );

    diagnosticsPackLambdaRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'CodepipelineAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['codepipeline:GetPipelineState'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:codepipeline:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:${pipelineAccountResourcesPrefix}*`,
        ],
      }),
    );

    diagnosticsPackLambdaRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'CloudwatchLogsAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['logs:FilterLogEvents'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:log-group:/aws/codebuild/${pipelineAccountResourcesPrefix}*`,
          `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:log-group:/aws/lambda/${pipelineAccountResourcesPrefix}*`,
        ],
      }),
    );

    diagnosticsPackLambdaRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'DiagnosticsBucketWriteAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:GetObject',
          's3:AbortMultipartUpload',
          's3:ListBucket',
          's3:DeleteObject',
          's3:GetObjectVersion',
          's3:ListMultipartUploadParts',
        ],
        resources: [destinationBucket.bucketArn, destinationBucket.arnForObjects('*')],
      }),
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/DiagnosticsPackLambdaRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'Custom resource Lambda role policy.',
      },
    ]);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/DiagnosticsPackLambdaRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Custom resource Lambda role policy.',
        },
      ],
    );

    const diagnosticFunction = new cdk.aws_lambda.Function(this, 'DiagnosticsFunction', {
      role: diagnosticsPackLambdaRole,
      description: 'Accelerator diagnostics report lambda function.',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../lambdas/diagnostic-pack/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      handler: 'index.handler',
      environment: {
        INSTALLER_STACK_NAME: props.installerStackName,
        HOME_REGION: cdk.Stack.of(this).region,
        PIPELINE_ACCOUNT_ID: cdk.Stack.of(this).account,
        PARTITION: cdk.Stack.of(this).partition,
        DAYS_PIPELINE_IN_FAILED_STATUS: '1',
        REPORT_BUCKET_NAME: destinationBucket.bucketName,
        CONFIG_REPO_NAME: props.configRepositoryName,
        MANAGEMENT_ACCOUNT_ROLE_NAME: diagnosticsPackAccessRole,
      },
    });

    new cdk.aws_logs.LogGroup(this, `${diagnosticFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${diagnosticFunction.functionName}`,
      retention: 30,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const key = cdk.aws_kms.Key.fromKeyArn(
      this,
      'DiagnosticsProjectEncryptionKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(this, keyParameterName).toString(),
    );

    const buildProject = new cdk.aws_codebuild.Project(this, 'DiagnosticsProject', {
      projectName: `${pipelineAccountResourcesPrefix}-DiagnosticProject`,
      encryptionKey: key,
      description: `Accelerator diagnostic project. You can execute this project to generate an error report and store it into the ${destinationBucket.bucketName} bucket.`,
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({
        version: '0.2',
        phases: {
          build: {
            commands: [
              `set -e`,
              `aws lambda update-function-configuration --function-name  ${diagnosticFunction.functionArn}  --region ${
                cdk.Stack.of(this).region
              } --environment Variables="{INSTALLER_STACK_NAME=${props.installerStackName},HOME_REGION=${
                cdk.Stack.of(this).region
              },PIPELINE_ACCOUNT_ID=${cdk.Stack.of(this).account},PARTITION=${
                cdk.Stack.of(this).partition
              },DAYS_PIPELINE_IN_FAILED_STATUS=$DAYS_PIPELINE_IN_FAILED_STATUS,REPORT_BUCKET_NAME=${
                destinationBucket.bucketName
              },CONFIG_REPO_NAME=${
                props.configRepositoryName
              },MANAGEMENT_ACCOUNT_ROLE_NAME=${diagnosticsPackAccessRole}}" --output text`,
              `aws lambda wait function-updated --function-name ${diagnosticFunction.functionArn} --region ${
                cdk.Stack.of(this).region
              }`,
              `aws lambda invoke --function-name ${diagnosticFunction.functionArn} --region ${
                cdk.Stack.of(this).region
              } --payload {} /tmp/response.json`,
              `error_count=$(grep "error"  /tmp/response.json | wc -l)`,
              `echo $error_count`,
              `if [ $error_count -gt 0 ]; then 
                echo "Diagnostics Lambda execution failed with below error !!!!"; 
                cat /tmp/response.json; 
                exit 1; 
                fi`,
            ],
          },
        },
      }),
      environment: {
        buildImage: cdk.aws_codebuild.LinuxBuildImage.STANDARD_6_0,
        privileged: false,
        computeType: cdk.aws_codebuild.ComputeType.SMALL,
        environmentVariables: {
          DAYS_PIPELINE_IN_FAILED_STATUS: {
            type: cdk.aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: '1',
          },
        },
      },
    });

    buildProject.role?.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'AllowLambdaAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction', 'lambda:UpdateFunctionConfiguration', 'lambda:GetFunctionConfiguration'],
        resources: [diagnosticFunction.functionArn],
      }),
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/DiagnosticsProject/Role/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Diagnostic CodeBuild project role.',
        },
      ],
    );
  }
}
