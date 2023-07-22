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
import { SSMClient, GetParameterCommandInput, GetParameterCommand } from '@aws-sdk/client-ssm';

export async function getSSMParameter(path: string): Promise<string | undefined> {
  const client = new SSMClient({});
  const parameterInput: GetParameterCommandInput = {
    Name: path,
  };
  const command = new GetParameterCommand(parameterInput);
  try {
    const response = await client.send(command);
    return response.Parameter?.Value;
  } catch (err) {
    return undefined;
  }
}

export async function isAseaMigrationEnabled(): Promise<boolean> {
  const aseaMigrationParameter = await getSSMParameter('/accelerator/migration');
  if (aseaMigrationParameter === 'true') {
    return true;
  }
  return false;
}
