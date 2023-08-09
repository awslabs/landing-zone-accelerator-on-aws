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

import { PolicyStatementType, throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
import * as path from 'path';
AWS.config.logger = console;

/**
 * put-bucket-prefix - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string | undefined;
    }
  | undefined
> {
  const kmsArn: string = event.ResourceProperties['kmsArn'];
  const policyFilePaths: string[] = event.ResourceProperties['policyFilePaths'];
  const organizationId: string | undefined = event.ResourceProperties['organizationId'];

  const solutionId = process.env['SOLUTION_ID'];
  const kmsClient = new AWS.KMS({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const generatedPolicyString = generatePolicy(policyFilePaths);

      let replacedPolicyString = generatedPolicyString;
      if (organizationId) {
        replacedPolicyString = generatedPolicyString.replace(/\${ORG_ID}/g, organizationId);
      }

      await throttlingBackOff(() =>
        kmsClient.putKeyPolicy({ KeyId: kmsArn, PolicyName: 'default', Policy: replacedPolicyString }).promise(),
      );

      return {
        PhysicalResourceId: kmsArn,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Skip deleting policy
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

function generatePolicy(policyFilePaths: string[]): string {
  const policyStatements: PolicyStatementType[] = [];

  for (const bucketPolicyFilePath of policyFilePaths) {
    const policyFile = path.join(__dirname, bucketPolicyFilePath);
    const policyContent: { Version?: string; Statement: PolicyStatementType[] } = JSON.parse(
      JSON.stringify(require(policyFile)),
    );

    for (const statement of policyContent.Statement) {
      policyStatements.push(statement);
    }
  }

  const policyDocument: { Version: string; Statement: PolicyStatementType[] } = {
    Version: '2012-10-17',
    Statement: policyStatements,
  };

  return JSON.stringify(policyDocument);
}
