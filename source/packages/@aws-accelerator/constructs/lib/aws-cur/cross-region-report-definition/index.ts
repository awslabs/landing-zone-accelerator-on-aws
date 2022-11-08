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

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

AWS.config.logger = console;

/**
 * cross-region-report-definition - lambda handler
 *
 * @param event, context
 * @returns
 */

export async function handler(
  event: AWSLambda.CloudFormationCustomResourceEvent,
  context: AWSLambda.Context,
): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  interface ReportDefinition {
    ReportName: string;
    TimeUnit: string;
    Format: string;
    Compression: string;
    S3Bucket: string;
    S3Prefix: string;
    S3Region: string;
    AdditionalSchemaElements: string[];
    AdditionalArtifacts?: string[];
    RefreshClosedReports?: boolean;
    ReportVersioning?: string;
    BillingViewArn?: string;
  }

  const partition = context.invokedFunctionArn.split(':')[1];

  let globalRegion = 'us-east-1';
  if (partition === 'aws-cn') {
    globalRegion = 'cn-northwest-1';
  }

  const reportDefinition: ReportDefinition = event.ResourceProperties['reportDefinition'];
  const solutionId = process.env['SOLUTION_ID'];
  const curClient = new AWS.CUR({ region: globalRegion, customUserAgent: solutionId });

  // Handle case where boolean is passed as string
  if (reportDefinition.RefreshClosedReports) {
    reportDefinition.RefreshClosedReports = returnBoolean(reportDefinition.RefreshClosedReports.toString());
  }

  switch (event.RequestType) {
    case 'Create':
      // Create new report definition
      console.log(`Creating new report definition ${reportDefinition.ReportName}`);
      await throttlingBackOff(() => curClient.putReportDefinition({ ReportDefinition: reportDefinition }).promise());

      return {
        PhysicalResourceId: reportDefinition.ReportName,
        Status: 'SUCCESS',
      };

    case 'Update':
      // Modify report definition
      console.log(`Modifying report definition ${reportDefinition.ReportName}`);
      await throttlingBackOff(() =>
        curClient
          .modifyReportDefinition({ ReportName: reportDefinition.ReportName, ReportDefinition: reportDefinition })
          .promise(),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Delete report definition
      console.log(`Deleting report definition ${event.PhysicalResourceId}`);
      await throttlingBackOff(() =>
        curClient.deleteReportDefinition({ ReportName: event.PhysicalResourceId }).promise(),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

function returnBoolean(input: string): boolean | undefined {
  try {
    return JSON.parse(input.toLowerCase());
  } catch (e) {
    return undefined;
  }
}
