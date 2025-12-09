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
import { Commands } from '../../../../lib/cli/commands/registry';
import { MacieCommands } from '../../../../lib/cli/commands/amazon-macie';
import { ControlTowerCommands } from '../../../../lib/cli/commands/aws-control-tower';

describe('Commands registry', () => {
  test('should have setup command with correct structure', () => {
    expect(Commands.setup).toBeDefined();
    expect(Commands.setup.description).toBe('Setup and configure AWS services across organizations');
    expect(Commands.setup.resources).toBeDefined();
  });

  test('should include macie resource', () => {
    expect(Commands.setup.resources.macie).toBeDefined();
    expect(Commands.setup.resources.macie).toBe(MacieCommands.setup);
  });

  test('should include control-tower resource', () => {
    expect(Commands.setup.resources['control-tower']).toBeDefined();
    expect(Commands.setup.resources['control-tower']).toBe(ControlTowerCommands.setup);
  });

  test('should have correct resources count', () => {
    const resourceKeys = Object.keys(Commands.setup.resources);
    expect(resourceKeys).toHaveLength(2);
    expect(resourceKeys).toContain('macie');
    expect(resourceKeys).toContain('control-tower');
  });
});
