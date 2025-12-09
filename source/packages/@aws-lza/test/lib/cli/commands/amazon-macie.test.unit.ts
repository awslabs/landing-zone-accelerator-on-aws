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

import { describe, expect, test } from 'vitest';
import { MacieCommands } from '../../../../lib/cli/commands/amazon-macie';
import { MacieCommand } from '../../../../lib/cli/handlers/amazon-macie';

describe('MacieCommands', () => {
  test('should have setup command with correct configuration', () => {
    expect(MacieCommands.setup).toBeDefined();
    expect(MacieCommands.setup.description).toBe(
      'Setup Amazon Macie across AWS Organizations with delegated administration and other session settings',
    );
    expect(MacieCommands.setup.execute).toBe(MacieCommand.execute);
  });

  test('should have correct options configuration', () => {
    const options = MacieCommands.setup.options;
    expect(options).toBeDefined();
    expect(Array.isArray(options)).toBe(true);

    // Find configuration option
    const configOption = options.find(opt => opt.configuration);
    expect(configOption).toBeDefined();
    expect(configOption!.configuration.alias).toBe('c');
    expect(configOption!.configuration.type).toBe('string');
    expect(configOption!.configuration.description).toBe(
      'Path to Macie configuration file (file://) or JSON configuration string',
    );
    expect(configOption!.configuration.required).toBe(true);
  });

  test('should include common CLI options', () => {
    const options = MacieCommands.setup.options;

    // Check for verbose option
    const verboseOption = options.find(opt => opt.verbose);
    expect(verboseOption).toBeDefined();
    expect(verboseOption!.verbose.alias).toBe('v');
    expect(verboseOption!.verbose.type).toBe('boolean');

    // Check for dry-run option
    const dryRunOption = options.find(opt => opt['dry-run']);
    expect(dryRunOption).toBeDefined();
    expect(dryRunOption!['dry-run'].type).toBe('boolean');

    // Check for region option
    const regionOption = options.find(opt => opt.region);
    expect(regionOption).toBeDefined();
    expect(regionOption!.region.alias).toBe('r');
    expect(regionOption!.region.type).toBe('string');
  });
});
