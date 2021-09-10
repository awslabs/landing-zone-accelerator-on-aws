/**
 * @module
 * Module comment
 */

import * as cdk from '@aws-cdk/core';
import * as pipeline from './pipeline';

enum RepositorySources {
  GITHUB = 'github',
  CODECOMMIT = 'codecommit',
}

export class InstallerStack extends cdk.Stack {
  // TODO: Add allowedPattern for all CfnParameter uses
  private readonly repositorySource = new cdk.CfnParameter(this, 'RepositorySource', {
    type: 'String',
    description: 'Specify the git host',
    allowedValues: [RepositorySources.GITHUB, RepositorySources.CODECOMMIT],
    default: RepositorySources.GITHUB,
  });
  private readonly repositoryName = new cdk.CfnParameter(this, 'RepositoryName', {
    type: 'String',
    description: 'The name of the git repository hosting the accelerator code',
  });

  private readonly repositoryBranchName = new cdk.CfnParameter(this, 'RepositoryBranchName', {
    type: 'String',
    description: 'The name of the git branch to use for installation',
  });

  private readonly notificationEmail = new cdk.CfnParameter(this, 'NotificationEmail', {
    type: 'String',
    description: 'The notification email that will get Accelerator State Machine execution notifications.',
  });

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Parameter Metadata
    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: [
          {
            Label: { default: 'Git Repository Configuration' },
            Parameters: [
              this.repositorySource.logicalId,
              this.repositoryName.logicalId,
              this.repositoryBranchName.logicalId,
            ],
          },
          {
            Label: { default: 'Accelerator Configuration' },
            Parameters: [this.notificationEmail.logicalId],
          },
        ],
        ParameterLabels: {
          [this.repositorySource.logicalId]: { default: 'Source' },
          [this.repositoryName.logicalId]: { default: 'Repository Name' },
          [this.repositoryBranchName.logicalId]: { default: 'Branch Name' },
          [this.notificationEmail.logicalId]: { default: 'Notification Email' },
        },
      },
    };

    new pipeline.AcceleratorPipeline(this, 'Pipeline', {
      sourceRepositoryName: this.repositoryName.valueAsString,
      sourceBranchName: this.repositoryBranchName.valueAsString,
    });
  }
}
