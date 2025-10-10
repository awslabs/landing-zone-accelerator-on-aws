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

import { CustomResourceProviderRuntime } from 'aws-cdk-lib';
import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import { getNodeVersion } from './common-functions';

function getCustomResourceProviderRuntime(): CustomResourceProviderRuntime {
  const runtimeKey = `NODEJS_${getNodeVersion()}_X` as keyof typeof CustomResourceProviderRuntime;
  const runtime = CustomResourceProviderRuntime[runtimeKey];
  if (runtime) {
    return runtime;
  } else {
    throw new Error(`Unsupported Node.js version: ${getNodeVersion()}`);
  }
}

/**
 * Custom resource provider runtime
 */
export const CUSTOM_RESOURCE_PROVIDER_RUNTIME = getCustomResourceProviderRuntime();

export class LzaLambdaRuntime {
  public static readonly DEFAULT_RUNTIME = new Runtime(`nodejs${getNodeVersion()}.x`, RuntimeFamily.NODEJS, {
    supportsInlineCode: true,
  });

  // this has to be string as the helper function is used in installer stack and
  // if its number then function runtime show as `"Runtime": "nodejsNaN.x",`
  public static getLambdaRuntime(nodeVersion: string): Runtime {
    return new Runtime(`nodejs${nodeVersion}.x`, RuntimeFamily.NODEJS, { supportsInlineCode: true });
  }
}

export const DEFAULT_LAMBDA_RUNTIME = LzaLambdaRuntime.DEFAULT_RUNTIME;
