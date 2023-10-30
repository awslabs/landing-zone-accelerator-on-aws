import { DependenciesStack, LogLevel } from './dependencies-stack';
import path from 'path';
import { NagSuppressions } from 'cdk-nag';
import * as cdk from 'aws-cdk-lib';
import { AcceleratorStackProps } from '../accelerator-stack';
import { pascalCase } from 'pascal-case';
export class IdentityCenter {
  public acceleratorManagedPolicies: Map<string, cdk.aws_iam.ManagedPolicy>[] = [];
  private stack: DependenciesStack;
  constructor(dependenciesStack: DependenciesStack, props: AcceleratorStackProps) {
    this.stack = dependenciesStack;

    if (this.stack.region === props.globalConfig.homeRegion) {
      //
      // Create Identity Center Permission Set Accelerator managed policies in home region only
      //
      this.acceleratorManagedPolicies = this.createIdentityCenterPermissionSetAcceleratorManagedPolicies(props);
    }
  }

  /**
   * Function to create Identity Center Permission Set Accelerator managed policies
   * @param props
   */
  private createIdentityCenterPermissionSetAcceleratorManagedPolicies(
    props: AcceleratorStackProps,
  ): Map<string, cdk.aws_iam.ManagedPolicy>[] {
    const policies: Map<string, cdk.aws_iam.ManagedPolicy>[] = [];
    for (const policySetItem of props.iamConfig.policySets ?? []) {
      if (!this.stack.isIncluded(policySetItem.deploymentTargets) || !policySetItem.identityCenterDependency) {
        this.stack.addLogs(LogLevel.INFO, `Item excluded`);
        continue;
      }

      for (const policyItem of policySetItem.policies) {
        this.stack.addLogs(LogLevel.INFO, `Add customer managed policy ${policyItem.name}`);

        // Read in the policy document which should be properly formatted json
        const policyDocument = JSON.parse(
          this.stack.generatePolicyReplacements(path.join(props.configDirPath, policyItem.policy), false),
        );

        // Create a statements list using the PolicyStatement factory
        const statements: cdk.aws_iam.PolicyStatement[] = [];
        for (const statement of policyDocument.Statement) {
          statements.push(cdk.aws_iam.PolicyStatement.fromJson(statement));
        }

        const policy = new Map<string, cdk.aws_iam.ManagedPolicy>();
        policy.set(
          policyItem.name,
          new cdk.aws_iam.ManagedPolicy(this.stack, pascalCase(policyItem.name), {
            managedPolicyName: policyItem.name,
            statements,
          }),
        );

        policies.push(policy);

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this.stack,
          `${this.stack.stackName}/${pascalCase(policyItem.name)}/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason: 'Policies definition are derived from accelerator iam-config boundary-policy file',
            },
          ],
        );
      }
    }
    return policies;
  }
}
