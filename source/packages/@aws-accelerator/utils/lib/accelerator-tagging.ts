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
 * Partitions where Accelerator tagging is suppressed unless explicitly enabled.
 */
const TAGGING_EXCLUDED_PARTITIONS = ['aws-iso', 'aws-iso-b'];

/**
 * Single source of truth for whether Accelerator tags are applied to resources in a partition.
 *
 * This gate is owned here so that the synth-time tag application (`addAcceleratorTags` in
 * `@aws-accelerator/cdk-utils`) and any config-time prediction of the resulting tag set stay
 * in agreement. `cdk-utils` depends on `@aws-accelerator/config`, so the rule cannot live in
 * either of those packages without creating a dependency cycle.
 *
 * @param partition AWS partition the resources are deployed into
 * @returns true when Accelerator tags are applied
 */
export function isAcceleratorTaggingEnabled(partition: string): boolean {
  const enableTag = process.env['ACCELERATOR_ENABLE_TAG'] === 'true';
  return enableTag || !TAGGING_EXCLUDED_PARTITIONS.includes(partition);
}

/**
 * Resolve the effective tag set a resource carries once Accelerator tagging is applied.
 *
 * Mirrors the precedence that `addAcceleratorTags` produces at synth. Values are written into
 * the map from lowest to highest priority so the last write wins on a key collision: global
 * config tags are the lowest (CDK aspect priority 49), resource-level (prop) tags override them
 * (CDK external tag priority 50), and the generated `Accelerator` tag is highest (cdk.Tag default
 * priority 100) and cannot be overridden.
 *
 * @param props resource-level tags, global config tags, partition and Accelerator prefix
 * @returns map of tag key to the value the deployed resource will carry
 */
export function resolveAcceleratorTags(props: {
  resourceTags?: { key: string; value: string }[];
  globalTags?: { key: string; value: string }[];
  partition: string;
  acceleratorPrefix: string;
}): Map<string, string> {
  const tags = new Map<string, string>();

  const taggingEnabled = isAcceleratorTaggingEnabled(props.partition);

  // Global config tags are overridable defaults at the lowest priority, so write them first.
  if (taggingEnabled) {
    (props.globalTags ?? []).forEach(tag => tags.set(tag.key, tag.value));
  }

  // Resource-level (prop) tags win over global tags on key collision; last key wins among themselves.
  (props.resourceTags ?? []).forEach(tag => tags.set(tag.key, tag.value));

  // The generated Accelerator tag is highest priority and cannot be overridden.
  if (taggingEnabled) {
    tags.set('Accelerator', props.acceleratorPrefix);
  }

  return tags;
}
