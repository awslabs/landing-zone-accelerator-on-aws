/**
 * Integration test for GitHub Pipeline CodeConnections permissions (issue #1083)
 *
 * Deploys a minimal pipeline that uses a CodeConnection GitHub source to verify
 * the IAM role has the correct codestar-connections/codeconnections permissions.
 *
 * ## Prerequisites
 *
 * 1. Create a CodeConnection to GitHub in the AWS console:
 *    Console → Developer Tools → Settings → Connections → Create connection → GitHub
 *    Make sure the connection status is "Available".
 *
 * 2. Note the connection ARN, GitHub owner, and repo name.
 *
 * ## Deploy
 *
 *   cd source/packages/@aws-accelerator/installer
 *   yarn cdk deploy --app "yarn ts-node test/github-pipeline-role-connections.integ.ts" \
 *     --context connectionArn=arn:aws:codeconnections:us-east-1:123456789012:connection/xxxx \
 *     --context owner=your-github-org \
 *     --context repo=your-repo \
 *     --context branch=main
 *
 * ## Validate
 *
 * 1. Go to CodePipeline console → find "IntegTest-ConnectionPipeline"
 * 2. Release a change (or wait for it to trigger)
 * 3. The Source stage should succeed — this proves UseConnection permissions work
 * 4. The Build stage runs `echo "success"` and exits
 *
 * ## Cleanup
 *
 *   yarn cdk destroy --app "yarn ts-node test/github-pipeline-role-connections.integ.ts"
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

class ConnectionPipelineTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const connectionArn = this.node.tryGetContext('connectionArn');
    const owner = this.node.tryGetContext('owner');
    const repo = this.node.tryGetContext('repo');
    const branch = this.node.tryGetContext('branch') ?? 'main';

    if (!connectionArn || !owner || !repo) {
      throw new Error('Required context: --context connectionArn=... --context owner=... --context repo=...');
    }

    const sourceOutput = new cdk.aws_codepipeline.Artifact('SourceOutput');

    const pipelineRole = new cdk.aws_iam.Role(this, 'PipelineRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('codepipeline.amazonaws.com'),
      inlinePolicies: {
        connectionPolicy: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              actions: ['codestar-connections:UseConnection', 'codeconnections:UseConnection'],
              resources: [
                `arn:${this.partition}:codestar-connections:${this.region}:${this.account}:connection/*`,
                `arn:${this.partition}:codeconnections:${this.region}:${this.account}:connection/*`,
              ],
            }),
          ],
        }),
      },
    });

    const buildProject = new cdk.aws_codebuild.PipelineProject(this, 'BuildProject', {
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: { commands: ['echo "Source checkout succeeded — UseConnection permissions work"'] },
        },
      }),
    });

    new cdk.aws_codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'IntegTest-ConnectionPipeline',
      role: pipelineRole,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new cdk.aws_codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: 'GitHubSource',
              connectionArn,
              owner,
              repo,
              branch,
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new cdk.aws_codepipeline_actions.CodeBuildAction({
              actionName: 'Build',
              project: buildProject,
              input: sourceOutput,
            }),
          ],
        },
      ],
    });
  }
}

const app = new cdk.App();
new ConnectionPipelineTestStack(app, 'IntegTest-ConnectionPermissions');
