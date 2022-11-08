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
import {
  DetectiveClient,
  UpdateOrganizationConfigurationCommand,
  ListGraphsCommand,
  ListMembersCommand,
  ListMembersCommandOutput,
} from '@aws-sdk/client-detective';
/**
 * DetectiveUpdateGraph - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const detectiveClient = new DetectiveClient({ region: region, customUserAgent: solutionId });
  const graphArn = await getGraphArn(detectiveClient);
  let nextToken: string | undefined = undefined;
  do {
    const page: ListMembersCommandOutput = await detectiveClient.send(
      new ListMembersCommand({ GraphArn: graphArn!, NextToken: nextToken }),
    );
    nextToken = page.NextToken;
  } while (nextToken);
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');
      await detectiveClient.send(new UpdateOrganizationConfigurationCommand({ AutoEnable: true, GraphArn: graphArn! }));
      return { Status: 'Success', StatusCode: 200 };
    case 'Delete':
      console.log('deleting - CreateMembersCommand');
      await detectiveClient.send(
        new UpdateOrganizationConfigurationCommand({ AutoEnable: false, GraphArn: graphArn! }),
      );
      return { Status: 'Success', StatusCode: 200 };
  }
}
async function getGraphArn(detectiveClient: DetectiveClient): Promise<string | undefined> {
  const response = await detectiveClient.send(new ListGraphsCommand({}));
  console.log(response);
  if (response.GraphList!.length === 0) {
    throw new Error(
      'Could not find graph. It does not look like this account has been set as the delegated administrator for AWS Detective.',
    );
  }
  return response.GraphList!.length === 1 ? response.GraphList![0].Arn : undefined;
}
