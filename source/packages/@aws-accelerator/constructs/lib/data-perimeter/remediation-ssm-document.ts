/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as fs from 'fs';
import { pascalCase } from 'pascal-case';
import { Construct } from 'constructs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { GlobalConfig } from '@aws-accelerator/config';
import { Document } from '../aws-ssm/document';

/**
 * Detect Resource Policy
 * This construct creates a Lambda function which is triggered by AWS Config Rule and
 * detect if a resource policy is compliant to the resource policy template by comparing
 * statements in resource policy.
 */
export interface RemediationSsmDocumentProps {
  documentName: string;
  sharedAccountIds: string[];
  globalConfig: GlobalConfig;
  cloudwatchKey?: cdk.aws_kms.IKey;
}

export class RemediationSsmDocument extends Construct {
  private readonly documentPath = path.join(__dirname, 'attach-resource-based-policy.yaml');

  constructor(scope: Construct, id: string, props: RemediationSsmDocumentProps) {
    super(scope, id);

    // Read in the document which should be properly formatted
    const buffer = fs.readFileSync(this.documentPath, 'utf8');
    const content = yaml.load(buffer);

    // Create the document
    new Document(this, pascalCase(props.documentName), {
      name: props.documentName,
      content,
      documentType: 'Automation',
      sharedWithAccountIds: props.sharedAccountIds,
      kmsKey: props.cloudwatchKey,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      targetType: undefined,
    });
  }
}
