/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { version } from '../../../../package.json';

/**
 * Property overrides for GovCloud environments
 */
class GovCloudOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('KmsKeyId');
      node.addPropertyDeletionOverride('Tags');
    }
    if (node instanceof cdk.aws_iam.CfnRole) {
      const trustPolicyDoc = node.assumeRolePolicyDocument as cdk.aws_iam.SamlConsolePrincipal;
      if (JSON.stringify(trustPolicyDoc).includes('signin.aws.amazon.com')) {
        node.addPropertyOverride(
          'AssumeRolePolicyDocument.Statement.0.Condition.StringEquals.SAML:aud',
          'https://signin.amazonaws-us-gov.com/saml',
        );
      }
    }
  }
}

/**
 * Property overrides for ISO-B environments
 */
class IsobOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_ec2.CfnFlowLog) {
      node.addPropertyDeletionOverride('LogFormat');
      node.addPropertyDeletionOverride('Tags');
      node.addPropertyDeletionOverride('MaxAggregationInterval');
    }
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('KmsKeyId');
      node.addPropertyDeletionOverride('Tags');
    }
    if (node instanceof cdk.aws_s3.CfnBucket) {
      node.addPropertyDeletionOverride('PublicAccessBlockConfiguration');
      node.addPropertyDeletionOverride('OwnershipControls');
    }
    if (node instanceof cdk.aws_cloudtrail.CfnTrail) {
      node.addPropertyDeletionOverride('InsightSelectors');
      node.addPropertyDeletionOverride('IsOrganizationTrail');
    }
    if (node instanceof cdk.aws_ec2.CfnVPCEndpoint) {
      const ServiceName = node.serviceName.replace('com.amazonaws.us', 'gov.sgov.sc2s.us');
      node.addPropertyOverride('ServiceName', ServiceName);
    }
    if (node instanceof cdk.aws_ecr.CfnRepository) {
      node.addPropertyDeletionOverride('ImageTagMutability');
    }
    if (node instanceof cdk.aws_iam.CfnRole) {
      const trustPolicyDoc = node.assumeRolePolicyDocument as cdk.aws_iam.SamlConsolePrincipal;
      if (JSON.stringify(trustPolicyDoc).includes('signin.aws.amazon.com')) {
        node.addPropertyOverride(
          'AssumeRolePolicyDocument.Statement.0.Condition.StringEquals.SAML:aud',
          'https://signin.sc2shome.sgov.gov/saml',
        );
      }
    }
  }
}

/**
 * Property overrides for ISO environments
 */
class IsoOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_ec2.CfnFlowLog) {
      node.addPropertyDeletionOverride('LogFormat');
      node.addPropertyDeletionOverride('Tags');
      node.addPropertyDeletionOverride('MaxAggregationInterval');
    }
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('KmsKeyId');
      node.addPropertyDeletionOverride('Tags');
    }
    if (node instanceof cdk.aws_s3.CfnBucket) {
      node.addPropertyDeletionOverride('PublicAccessBlockConfiguration');
      node.addPropertyDeletionOverride('OwnershipControls');
    }
    if (node instanceof cdk.aws_cloudtrail.CfnTrail) {
      node.addPropertyDeletionOverride('InsightSelectors');
      node.addPropertyDeletionOverride('IsOrganizationTrail');
    }
    if (node instanceof cdk.aws_ec2.CfnVPCEndpoint) {
      const ServiceName = node.serviceName.replace('com.amazonaws.us', 'gov.ic.c2s.us');
      node.addPropertyOverride('ServiceName', ServiceName);
    }
    if (node instanceof cdk.aws_ecr.CfnRepository) {
      node.addPropertyDeletionOverride('ImageTagMutability');
    }

    if (node instanceof cdk.aws_iam.CfnRole) {
      const trustPolicyDoc = node.assumeRolePolicyDocument as cdk.aws_iam.SamlConsolePrincipal;
      if (JSON.stringify(trustPolicyDoc).includes('signin.aws.amazon.com')) {
        node.addPropertyOverride(
          'AssumeRolePolicyDocument.Statement.0.Condition.StringEquals.SAML:aud',
          'https://signin.c2shome.ic.gov/saml',
        );
      }
    }
  }
}

/**
 * Property overrides for CN environments
 */
class CnOverrides implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof cdk.aws_logs.CfnLogGroup) {
      node.addPropertyDeletionOverride('Tags');
    }
    if (node instanceof cdk.aws_cloudtrail.CfnTrail) {
      node.addPropertyDeletionOverride('IsOrganizationTrail');
    }
  }
}

/**
 * Default memory override for Lambda resources
 */
class LambdaDefaultMemoryAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      if (node.cfnResourceType === 'AWS::Lambda::Function') {
        const cfnProps = (node as cdk.aws_lambda.CfnFunction)['_cfnProperties'];
        let memorySize = cfnProps['MemorySize']?.toString();

        if (!memorySize) {
          memorySize = (node as cdk.aws_lambda.CfnFunction).memorySize;
        }

        if (!memorySize || memorySize < 256) {
          node.addPropertyOverride('MemorySize', 256);
        }
      }
    }
  }
}
/**
 * Default deletion override for Service linked role resources
 */
class IamServiceLinkedRoleAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      if (node.cfnResourceType === 'AWS::IAM::ServiceLinkedRole') {
        node.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      }
    }
  }
}

/**
 * Solution ID override for Lambda resources
 */
class AwsSolutionAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      if (node.cfnResourceType === 'AWS::Lambda::Function') {
        node.addPropertyOverride('Environment.Variables.SOLUTION_ID', `AwsSolution/SO0199/${version}`);
      }
    }
  }
}

/**
 * Existing Role Overrides
 */
class ExistingRoleOverrides implements cdk.IAspect {
  public visit(construct: IConstruct): void {
    const acceleratorPrefix = process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator';

    if (construct instanceof cdk.CfnResource && construct.cfnResourceType === 'AWS::CloudTrail::Trail') {
      this.replaceCloudTrailCloudWatchLogsRole(construct, acceleratorPrefix);
    } else if (construct instanceof cdk.CfnResource && construct.cfnResourceType === 'AWS::Lambda::Function') {
      this.replaceLambdaFunctionRole(construct, acceleratorPrefix);
    } else if (
      construct instanceof cdk.CfnResource &&
      (construct.cfnResourceType === 'AWS::IAM::Role' ||
        construct.cfnResourceType === 'AWS::IAM::Policy' ||
        construct.cfnResourceType === 'AWS::IAM::InstanceProfile' ||
        construct.cfnResourceType === 'AWS::IAM::ManagedPolicy')
    ) {
      for (const x of construct.obtainResourceDependencies()) {
        construct.removeDependency(x);
      }
      construct.node.scope?.node.tryRemoveChild(construct.node.id);
    }
  }
  private replaceCloudTrailCloudWatchLogsRole(construct: cdk.CfnResource, acceleratorPrefix: string) {
    for (const eachDependency of construct.node.dependencies) {
      // in cloudtrail look for logsRole
      // this is only created when sendToCloudWatchLogs is set to true
      // replace this with pre-existing role
      if (eachDependency.node.path.includes('LogsRole')) {
        construct.addPropertyDeletionOverride('CloudWatchLogsRoleArn');
        construct.addPropertyOverride(
          'CloudWatchLogsRoleArn.Fn::Sub',
          'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + acceleratorPrefix + 'CloudTrailCloudWatchRole',
        );
      }
    }
  }
  private replaceLambdaFunctionRole(construct: cdk.CfnResource, acceleratorPrefix: string) {
    for (const x of construct.obtainResourceDependencies()) {
      construct.removeDependency(x);
      const parentConstruct = construct.node.scope;
      parentConstruct?.node.tryRemoveChild(x.node.id);
    }
    construct.addPropertyDeletionOverride('Role');
    construct.addPropertyOverride(
      'Role.Fn::Sub',
      'arn:${AWS::Partition}:iam::${AWS::AccountId}:role/' + acceleratorPrefix + 'LambdaRole',
    );
  }
}
/**
 * Add accelerator specific aspects to the application based on partition
 */
export class AcceleratorAspects {
  /**
   * The region for global API endpoints
   * based on AWS partition
   */
  public readonly globalRegion: string;

  constructor(app: cdk.App, partition: string, useExistingRoles: boolean) {
    let globalRegion = 'us-east-1';
    // Add partition specific overrides
    switch (partition) {
      case 'aws-us-gov':
        globalRegion = 'us-gov-west-1';
        cdk.Aspects.of(app).add(new GovCloudOverrides());
        break;
      case 'aws-iso':
        globalRegion = 'us-iso-east-1';
        cdk.Aspects.of(app).add(new IsoOverrides());
        break;
      case 'aws-iso-b':
        globalRegion = 'us-isob-east-1';
        cdk.Aspects.of(app).add(new IsobOverrides());
        break;
      case 'aws-cn':
        globalRegion = 'cn-northwest-1';
        cdk.Aspects.of(app).add(new CnOverrides());
        break;
    }
    // Add default aspects
    cdk.Aspects.of(app).add(new LambdaDefaultMemoryAspect());
    cdk.Aspects.of(app).add(new IamServiceLinkedRoleAspect());
    if (useExistingRoles) {
      cdk.Aspects.of(app).add(new ExistingRoleOverrides());
    } else {
      /**
       * when existing roles are recreated the Lambda, invoke fails on custom resource as environment variable is encrypted and it cannot access it with the error below
       * @example
       * Calling the invoke API action failed with this message: Lambda was unable to decrypt the environment variables because KMS access was denied. Please check the function's KMS key settings. KMS Exception: AccessDeniedExceptionKMS Message: The ciphertext refers to a customer master key that does not exist, does not exist in this region, or you are not allowed to access
       */
      // removing solutions aspect to prevent this error
      cdk.Aspects.of(app).add(new AwsSolutionAspect());
    }

    // Set global region
    this.globalRegion = globalRegion;
  }
}
