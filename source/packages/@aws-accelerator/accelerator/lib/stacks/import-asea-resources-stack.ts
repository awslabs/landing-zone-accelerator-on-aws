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
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

import { AcceleratorStackProps } from './accelerator-stack';
import { AseaStackInfo, CfnResourceType } from '@aws-accelerator/config';
import { ManagedPolicies } from '../asea-resources/managed-policies';
import { Roles } from '../asea-resources/iam-roles';
import { Groups } from '../asea-resources/iam-groups';
import { Users } from '../asea-resources/iam-users';
import { CfnInclude, CfnIncludeProps } from 'aws-cdk-lib/cloudformation-include';

export interface ImportAseaResourcesStackProps extends AcceleratorStackProps {
  /**
   * Current stack info.
   * Retrieved from ASEA CloudFormation stacks
   */
  stackInfo: AseaStackInfo;

  /**
   * Nested Stacks in current stack
   * ASEA creates Nested stacks in Phase1 for VPCs
   */
  nestedStacks?: AseaStackInfo[];
}
export class ImportAseaResourcesStack extends cdk.Stack {
  stack: CfnInclude;
  private readonly stackInfo: AseaStackInfo;
  constructor(scope: Construct, id: string, props: ImportAseaResourcesStackProps) {
    super(scope, id, props);
    this.stackInfo = props.stackInfo;
    const nestedStacks: { [stackName: string]: CfnIncludeProps } = {};
    this.stack = new CfnInclude(this, `stack`, {
      templateFile: this.stackInfo.templatePath,
      preserveLogicalIds: true,
      loadNestedStacks: nestedStacks,
    });
    for (const nestedStack of props.nestedStacks || []) {
      const nestedStackInfo: CfnResourceType | undefined = this.stackInfo.resources.find(
        r => r.resourceType === 'AWS::CloudFormation::Stack' && r.physicalResourceId.includes(nestedStack.stackName),
      );
      if (!nestedStackInfo) {
        throw new Error(`Nested stack "${nestedStack.stackName}" is not found in stack "${props.stackName}"`);
      }
      this.stack.loadNestedStack(nestedStackInfo.logicalResourceId, {
        templateFile: nestedStack.templatePath,
      });
    }
    const { policies } = new ManagedPolicies(this.stack, props);
    new Roles(this.stack, { policies, ...props });
    const { groups } = new Groups(this.stack, { policies, ...props });
    new Users(this.stack, { policies, groups, ...props });
  }
}
