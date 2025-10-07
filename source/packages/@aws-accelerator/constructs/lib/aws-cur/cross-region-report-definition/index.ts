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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent, Context } from '@aws-accelerator/utils/lib/common-types';
import { getGlobalRegion, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import {
  AdditionalArtifact,
  AWSRegion,
  CompressionFormat,
  CostAndUsageReportServiceClient,
  DeleteReportDefinitionCommand,
  ModifyReportDefinitionCommand,
  PutReportDefinitionCommand,
  ReportFormat,
  ReportVersioning,
  SchemaElement,
  TimeUnit,
} from '@aws-sdk/client-cost-and-usage-report-service';

/**
 * cross-region-report-definition - lambda handler
 *
 * @param event, context
 * @returns
 */

export async function handler(
  event: CloudFormationCustomResourceEvent,
  context: Context,
): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  interface ReportDefinition {
    ReportName: string;
    TimeUnit: TimeUnit;
    Format: ReportFormat;
    Compression: CompressionFormat;
    S3Bucket: string;
    S3Prefix: string;
    S3Region: AWSRegion;
    AdditionalSchemaElements: SchemaElement[];
    AdditionalArtifacts?: AdditionalArtifact[];
    RefreshClosedReports?: boolean;
    ReportVersioning?: ReportVersioning;
    BillingViewArn?: string;
  }

  const partition = context.invokedFunctionArn.split(':')[1];

  const globalRegion = getGlobalRegion(partition);

  const reportDefinition: ReportDefinition = event.ResourceProperties['reportDefinition'];
  const solutionId = process.env['SOLUTION_ID'];
  const curClient = new CostAndUsageReportServiceClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  // Handle case where boolean is passed as string
  if (reportDefinition.RefreshClosedReports) {
    reportDefinition.RefreshClosedReports = returnBoolean(reportDefinition.RefreshClosedReports.toString());
  }

  switch (event.RequestType) {
    case 'Create':
      // Create new report definition
      console.log(`Creating new report definition ${reportDefinition.ReportName}`);
      await throttlingBackOff(() =>
        curClient.send(new PutReportDefinitionCommand({ ReportDefinition: reportDefinition })),
      );

      return {
        PhysicalResourceId: reportDefinition.ReportName,
        Status: 'SUCCESS',
      };

    case 'Update':
      // Modify report definition
      console.log(`Modifying report definition ${reportDefinition.ReportName}`);
      await throttlingBackOff(() =>
        curClient.send(
          new ModifyReportDefinitionCommand({
            ReportName: reportDefinition.ReportName,
            ReportDefinition: reportDefinition,
          }),
        ),
      );
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Delete report definition
      console.log(`Deleting report definition ${event.PhysicalResourceId}`);
      await throttlingBackOff(() =>
        curClient.send(new DeleteReportDefinitionCommand({ ReportName: event.PhysicalResourceId })),
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return undefined;
  }
}
