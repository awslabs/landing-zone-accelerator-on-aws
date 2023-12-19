import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { DependenciesStack } from './dependencies-stack';
import { AcceleratorStackProps } from '../accelerator-stack';

/**
 * There is a class for diagnostics pack dependent resources.
 *
 * @remarks
 * The Diagnostics Pack will be deployed for multi-account environments without utilizing existing roles for deployment.
 */
export class DiagnosticsPack {
  private stack: DependenciesStack;
  constructor(dependenciesStack: DependenciesStack, props: AcceleratorStackProps) {
    this.stack = dependenciesStack;

    //
    // Diagnostics pack assume role creation
    //
    this.createDiagnosticsPackAssumeRole(props);
  }

  /**
   * Function to deploy diagnostics pack assume role
   * @param props
   * @returns
   */
  private createDiagnosticsPackAssumeRole(props: AcceleratorStackProps) {
    const isDiagnosticsPackEnabled = props.isDiagnosticsPackEnabled === 'Yes' ? true : false;

    const managementAccountId = props.accountsConfig.getManagementAccountId();

    // For non external deployment diagnostics resources are deployed in management account by installer pipeline, no need to create the role in this case
    if (this.stack.account === managementAccountId && !this.stack.isExternalDeployment) {
      return;
    }

    const assumeByAccountId =
      props.pipelineAccountId !== managementAccountId ? props.pipelineAccountId : managementAccountId;

    // Create diagnostic role in every account home region except management account for non external deployment
    if (isDiagnosticsPackEnabled && this.stack.region === props.globalConfig.homeRegion) {
      const role = new cdk.aws_iam.Role(this.stack, 'DiagnosticsPackAssumeRole', {
        roleName: this.stack.acceleratorResourceNames.roles.diagnosticsPackAssumeRoleName,
        assumedBy: new cdk.aws_iam.ArnPrincipal(
          `arn:${cdk.Stack.of(this.stack).partition}:iam::${assumeByAccountId}:role/${
            props.qualifier === 'aws-accelerator' ? props.prefixes.accelerator : props.qualifier
          }-DiagnosticsPackLambdaRole`,
        ),
      });

      role.addToPrincipalPolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudformationAccess',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['cloudformation:DescribeStackEvents', 'cloudformation:DescribeStacks'],
          resources: [
            `arn:${cdk.Stack.of(this.stack).partition}:cloudformation:${cdk.Stack.of(this.stack).region}:${
              cdk.Stack.of(this.stack).account
            }:stack/${props.prefixes.accelerator}*`,
          ],
        }),
      );

      if (this.stack.account === managementAccountId) {
        role.addToPrincipalPolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'OrganizationsAccess',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['organizations:ListAccounts'],
            resources: ['*'],
          }),
        );
      }

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this.stack,
        `${this.stack.stackName}/DiagnosticsPackAssumeRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Diagnostics pack role needs access to every accelerator stacks.',
          },
        ],
      );
    }
  }
}
