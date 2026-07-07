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

/**
 * @fileoverview Shared helpers for AWS Organizations modules.
 *
 * @description
 * Per-account orchestration utilities used by Organizations-scoped modules
 * (manage-account-tags, manage-account-alias). These helpers provide the
 * equivalent of what `batch-processor` provides for security services:
 *   - A concurrency-limited fan-out across a set of target accounts
 *   - Per-account error isolation so a single account failure does not
 *     abort the rest of the execution
 *   - A common target-account descriptor so modules can receive "the list
 *     of accounts to operate on" as a single structured input
 */

/**
 * Descriptor for a single account that an Organizations module should act on.
 *
 * @description
 * This is the stable shape passed into Organizations module functions. Actions
 * are responsible for resolving account names to IDs and assembling these
 * descriptors; the module function treats the list as opaque input.
 */
export interface IOrganizationsAccountTarget {
  /** AWS account ID */
  readonly accountId: string;
  /** Human-readable account name from accounts-config.yaml */
  readonly accountName: string;
}

/**
 * Default maximum number of accounts processed concurrently.
 *
 * @description
 * Matches the ceiling used by the new accelerator module runner. Most
 * Organizations APIs (TagResource, UntagResource, ListTagsForResource) can
 * sustain this rate comfortably with the retryStrategy we configure, and IAM
 * CreateAccountAlias is called against distinct accounts so it parallelizes
 * without contention.
 */
const DEFAULT_MAX_CONCURRENT_ACCOUNTS = 50;

/**
 * Run a per-account async operation across many accounts with bounded
 * concurrency and per-account error isolation.
 *
 * @description
 * A single rejected promise in `Promise.all` would abort the whole fan-out and
 * lose successful results from accounts that had already completed. To keep
 * accounts isolated, `operation` must not throw — it is responsible for
 * catching its own errors and returning a structured failure result. This
 * helper preserves each account's returned result and lets the caller
 * aggregate outcomes across the full set.
 *
 * The concurrency limit is a simple sliding window: up to `maxConcurrent`
 * operations run at once, and new work starts as earlier operations settle.
 *
 * @param targets - List of accounts to process
 * @param operation - Async function invoked once per account. Must resolve
 *   (not reject) for every account; catch errors internally and return a
 *   structured failure result so one account's failure does not abort the rest.
 * @param maxConcurrent - Maximum simultaneous account operations (default 50)
 */
export async function runPerAccount<T>(
  targets: ReadonlyArray<IOrganizationsAccountTarget>,
  operation: (target: IOrganizationsAccountTarget) => Promise<T>,
  maxConcurrent: number = DEFAULT_MAX_CONCURRENT_ACCOUNTS,
): Promise<T[]> {
  if (targets.length === 0) {
    return [];
  }

  const results: T[] = new Array(targets.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= targets.length) {
        return;
      }
      results[index] = await operation(targets[index]);
    }
  };

  const workerCount = Math.min(maxConcurrent, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
