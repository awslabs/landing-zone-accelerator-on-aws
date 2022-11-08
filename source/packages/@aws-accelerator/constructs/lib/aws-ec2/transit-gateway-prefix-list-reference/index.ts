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

/**
 * aws-ec2-transit-gateway-prefix-list-reference - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
    }
  | undefined
> {
  interface ReferenceProps {
    readonly PrefixListId: string;
    readonly TransitGatewayRouteTableId: string;
    Blackhole?: boolean;
    readonly TransitGatewayAttachmentId?: string;
  }

  const props: ReferenceProps = event.ResourceProperties['prefixListReference'];
  const solutionId = process.env['SOLUTION_ID'];

  const ec2 = new AWS.EC2({ customUserAgent: solutionId });

  // Handle case where boolean is passed as string
  if (props.Blackhole) {
    props.Blackhole = returnBoolean(props.Blackhole.toString());
  }

  switch (event.RequestType) {
    case 'Create':
      await throttlingBackOff(() => ec2.createTransitGatewayPrefixListReference(props).promise());

      return {
        Status: 'SUCCESS',
      };

    case 'Update':
      await throttlingBackOff(() => ec2.modifyTransitGatewayPrefixListReference(props).promise());

      return {
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        ec2
          .deleteTransitGatewayPrefixListReference({
            PrefixListId: props.PrefixListId,
            TransitGatewayRouteTableId: props.TransitGatewayRouteTableId,
          })
          .promise(),
      );

      return {
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
