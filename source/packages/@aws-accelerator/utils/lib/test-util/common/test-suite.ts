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
 * Integration testing environment name
 *
 * @description
 * Environment name must be started with the word `security`
 *
 * @example
 * - singleAccount
 * - sampleConfig
 */
const environmentName = process.env['ENV_NAME'];

/**
 * Integration testing AWS Region
 */
const region = process.env['AWS_DEFAULT_REGION'];

/**
 * Accelerator regional security environment test suite
 *
 */
export const RegionalTestSuite =
  typeof jest !== 'undefined' // Only export the RegionalTestSuite object if the file is being executed as part of a Jest test
    ? {
        ['sampleConfig:us-east-1']: {
          suite: environmentName === 'sampleConfig' && region === 'us-east-1' ? describe : describe.skip,
          suiteName: '[sampleConfig:us-east-1]',
        },
        ['sampleConfig:us-west-2']: {
          suite: environmentName === 'sampleConfig' && region === 'us-west-2' ? describe : describe.skip,
          suiteName: '[sampleConfig:us-west-2]',
        },
      }
    : {};
