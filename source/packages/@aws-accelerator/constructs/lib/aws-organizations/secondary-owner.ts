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

import * as cdk from 'aws-cdk-lib';

/**
 * Lambda environment variable that tells the create-policy and attach-policy handlers to skip
 * every detach and delete on Delete events. Must match the name read by both handlers.
 */
export const SKIP_ORGANIZATIONS_POLICY_DELETE_ENV = 'SKIP_ORGANIZATIONS_POLICY_DELETE';

const secondaryOwnerByStack = new WeakMap<cdk.Stack, Map<string, boolean>>();

/**
 * Returns the provider Lambda environment for a stack that does or does not act as a secondary
 * owner of AWS Organizations policies.
 *
 * The provider Lambda is a singleton per stack, so every construct that shares it must use the same
 * setting. A mismatch throws at synth time instead of silently applying the first construct's setting.
 *
 * Primary owner stacks get no environment, which keeps their provider Lambda template unchanged.
 *
 * @param scope Construct whose stack owns the provider
 * @param providerType Custom resource provider type identifier
 * @param secondaryOwner Whether the stack is a secondary owner of the policies it declares
 * @returns The provider Lambda environment, or undefined for primary owner stacks
 */
export function getSecondaryOwnerProviderEnvironment(
  scope: cdk.Stack,
  providerType: string,
  secondaryOwner: boolean | undefined,
): { [key: string]: string } | undefined {
  const isSecondaryOwner = secondaryOwner === true;
  let providers = secondaryOwnerByStack.get(scope);
  if (!providers) {
    providers = new Map<string, boolean>();
    secondaryOwnerByStack.set(scope, providers);
  }

  const existing = providers.get(providerType);
  if (existing === undefined) {
    providers.set(providerType, isSecondaryOwner);
  } else if (existing !== isSecondaryOwner) {
    throw new Error(
      `All ${providerType} constructs in stack ${scope.stackName} must use the same secondaryOwner setting. ` +
        `Found both ${existing} and ${isSecondaryOwner}.`,
    );
  }

  return isSecondaryOwner ? { [SKIP_ORGANIZATIONS_POLICY_DELETE_ENV]: 'true' } : undefined;
}
