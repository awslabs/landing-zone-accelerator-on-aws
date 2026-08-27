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

import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';

/**
 * Builds the accelerator's standard AWS SDK retry strategy.
 *
 * Lives in its own dependency-free module so that both `common-functions` and
 * `aws-client-factory` can import it without depending on each other, avoiding
 * an import cycle between those two modules.
 *
 * The attempt count is configurable via the `ACCELERATOR_SDK_MAX_ATTEMPTS`
 * environment variable (default 800), with a linear backoff of
 * `100 + attempt * 1000` milliseconds.
 *
 * @returns A configured {@link ConfiguredRetryStrategy}
 */
export function setRetryStrategy() {
  const numberOfRetries = Number(process.env['ACCELERATOR_SDK_MAX_ATTEMPTS'] ?? 800);
  return new ConfiguredRetryStrategy(numberOfRetries, (attempt: number) => 100 + attempt * 1000);
}
