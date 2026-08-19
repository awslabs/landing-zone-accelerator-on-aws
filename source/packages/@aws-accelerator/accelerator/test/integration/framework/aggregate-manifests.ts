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
 * @fileoverview Aggregates a module's integration-test scenario manifests into a single JSON
 * document.
 *
 * This is a build/reporting helper only — it does NOT change test execution or logic. It reads the
 * existing `test/integration/modules/<module>/manifests/*.manifest.json` files (the single source of
 * truth authored alongside the tests) and emits an aggregated summary to stdout:
 *
 *   {
 *     "module": "guardduty",
 *     "displayName": "Amazon GuardDuty",
 *     "scenarios": [ { "name", "order", "description" }, ... ]  // sorted by order
 *   }
 *
 * Usage (from the accelerator package directory):
 *   npx ts-node --transpile-only test/integration/framework/aggregate-manifests.ts <module> [displayName] > integ-manifest-<module>.json
 *
 * Example:
 *   npx ts-node --transpile-only test/integration/framework/aggregate-manifests.ts guardduty "Amazon GuardDuty"
 *
 * Pass/fail status is intentionally NOT included here — that comes from the JUnit report
 * (integration-results.xml). This artifact only supplies the
 * human-readable scenario descriptions.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface ScenarioSummary {
  name: string;
  order: number;
  description: string;
}

function aggregate(moduleName: string, displayName: string): void {
  const manifestsDir = path.resolve(__dirname, '..', 'modules', moduleName, 'manifests');

  let files: string[];
  try {
    files = readdirSync(manifestsDir).filter(file => file.endsWith('.manifest.json'));
  } catch (error) {
    process.stderr.write(`No manifests directory for module "${moduleName}" at ${manifestsDir}: ${error}\n`);
    process.exit(1);
  }

  const scenarios: ScenarioSummary[] = files
    .map(file => {
      const parsed = JSON.parse(readFileSync(path.join(manifestsDir, file), 'utf-8'));
      return {
        name: parsed.name ?? path.basename(file, '.manifest.json'),
        order: typeof parsed.order === 'number' ? parsed.order : Number.MAX_SAFE_INTEGER,
        description: parsed.description ?? '',
      };
    })
    .sort((a, b) => a.order - b.order);

  process.stdout.write(JSON.stringify({ module: moduleName, displayName, scenarios }, null, 2) + '\n');
}

const moduleName = process.argv[2];
const displayName = process.argv[3] ?? moduleName;

if (!moduleName) {
  process.stderr.write('Usage: aggregate-manifests.ts <module> [displayName]\n');
  process.exit(1);
}

aggregate(moduleName, displayName);
