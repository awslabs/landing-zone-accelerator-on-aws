/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { Construct } from 'constructs';
const path = require('path');

export interface IDocument extends cdk.IResource {
  readonly documentName: string;
}

export interface DocumentProps {
  readonly name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly content: any | cdk.IResolvable;
  readonly documentType: string;
  readonly sharedWithAccountIds: string[];
}

export class Document extends cdk.Resource implements IDocument {
  readonly documentName: string;

  constructor(scope: Construct, id: string, props: DocumentProps) {
    super(scope, id);

    const resource = new cdk.aws_ssm.CfnDocument(this, 'Resource', {
      name: props.name,
      content: props.content,
      documentType: props.documentType,
    });

    this.documentName = resource.ref;

    // Also need a custom resource to do the share
    if (props.sharedWithAccountIds.length > 0) {
      const SHARE_SSM_DOCUMENT = 'Custom::SSMShareDocument';

      const cr = cdk.CustomResourceProvider.getOrCreateProvider(this, SHARE_SSM_DOCUMENT, {
        codeDirectory: path.join(__dirname, 'share-document/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Sid: 'ShareDocumentActions',
            Effect: 'Allow',
            Action: ['ssm:DescribeDocumentPermission', 'ssm:ModifyDocumentPermission'],
            Resource: cdk.Stack.of(this).formatArn({
              service: 'ssm',
              resource: 'document',
              arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
              resourceName: '*',
            }),
          },
        ],
      });

      new cdk.CustomResource(this, 'ShareDocument', {
        resourceType: SHARE_SSM_DOCUMENT,
        serviceToken: cr.serviceToken,
        properties: {
          name: this.documentName,
          accountIds: props.sharedWithAccountIds,
        },
      });
    }
  }
}
