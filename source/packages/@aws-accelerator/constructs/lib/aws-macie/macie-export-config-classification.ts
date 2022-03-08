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

/**
 * Initialized MacieExportConfigClassificationProps properties
 */
export interface MacieExportConfigClassificationProps {
  readonly region: string;
  readonly bucketName: string;
  readonly keyPrefix: string;
  readonly kmsKeyArn: string;
}

/**
 * Aws MacieSession export configuration classification
 */
export class MacieExportConfigClassification extends Construct {
  public readonly id: string = '';

  constructor(scope: Construct, id: string, props: MacieExportConfigClassificationProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::MaciePutClassificationExportConfiguration';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'put-export-config-classification/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'MaciePutClassificationExportConfigurationTaskMacieActions',
          Effect: 'Allow',
          Action: [
            'macie2:EnableMacie',
            'macie2:GetClassificationExportConfiguration',
            'macie2:GetMacieSession',
            'macie2:PutClassificationExportConfiguration',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        region: props.region,
        bucketName: props.bucketName,
        keyPrefix: props.keyPrefix,
        kmsKeyArn: props.kmsKeyArn,
      },
    });

    this.id = resource.ref;
  }
}
