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

import fs from 'node:fs';
import path from 'node:path';

import { IModuleResponse, MODULE_STATE_CODE } from 'aws-lza';

/**
 * Horizontal rule used to delimit module diff output.
 */
export const SEPARATOR = '='.repeat(70);

/**
 * Custom formatter function type for module-specific diff output.
 * Receives the module response and returns a formatted diff string.
 */
export type ModuleDiffFormatterFn = (response: IModuleResponse) => string;

/**
 * Registry of custom formatters keyed by module name.
 * Modules can register custom formatters for richer diff output.
 */
const customFormatters = new Map<string, ModuleDiffFormatterFn>();

/**
 * Registers a custom diff formatter for a specific module.
 *
 * @param moduleName - The module name (from AcceleratorModules enum value)
 * @param formatter - Function that produces a formatted diff string
 */
export function registerDiffFormatter(moduleName: string, formatter: ModuleDiffFormatterFn): void {
  customFormatters.set(moduleName, formatter);
}

export function formatModuleDiff(response: IModuleResponse): string {
  const custom = customFormatters.get(response.moduleName);
  if (custom) {
    return custom(response);
  }
  return formatGenericDiff(response);
}

function formatGenericDiff(response: IModuleResponse): string {
  const lines: string[] = [SEPARATOR];
  lines.push(`Module: ${response.moduleName}`);

  switch (response.status) {
    case MODULE_STATE_CODE.COMPLETED:
    case MODULE_STATE_CODE.SUCCESS:
      lines.push('Mode: Dry Run');
      lines.push('');
      lines.push(...formatResponseChanges(response.response));
      lines.push('');
      lines.push(response.summary);
      break;

    case MODULE_STATE_CODE.SKIPPED:
      lines.push('Mode: Dry Run — SKIPPED');
      lines.push('');
      lines.push(`Reason: ${response.summary}`);
      lines.push('');
      lines.push('No changes');
      break;

    case MODULE_STATE_CODE.FAILED:
      lines.push('Mode: Dry Run — FAILED');
      lines.push('');
      if (response.error) {
        lines.push(`Error: ${response.error.name}`);
        lines.push(`Message: ${response.error.message}`);
      } else {
        lines.push(response.summary);
      }
      lines.push('');
      lines.push('Dry-run was unavailable for this module. Changes will be visible during deployment.');
      break;
  }

  lines.push(SEPARATOR);
  return lines.join('\n');
}

const CREATE_OPS = new Set(['created', 'enabled']);
const DELETE_OPS = new Set(['deleted', 'disabled']);
const UNCHANGED_OPS = new Set(['exists', 'skipped']);

function formatResponseChanges(responseData: unknown): string[] {
  if (!responseData || typeof responseData !== 'object') {
    return [];
  }

  const lines: string[] = [];
  const data = responseData as Record<string, unknown>;

  for (const [key, value] of Object.entries(data)) {
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }

    const hasOperation = value.some(
      (item: unknown) => item && typeof item === 'object' && 'operation' in (item as Record<string, unknown>),
    );
    if (!hasOperation) {
      continue;
    }

    const created: Record<string, unknown>[] = [];
    const deleted: Record<string, unknown>[] = [];
    let unchangedCount = 0;

    for (const item of value) {
      const op = (item as Record<string, unknown>)['operation'] as string;
      if (CREATE_OPS.has(op)) {
        created.push(item as Record<string, unknown>);
      } else if (DELETE_OPS.has(op)) {
        deleted.push(item as Record<string, unknown>);
      } else if (UNCHANGED_OPS.has(op)) {
        unchangedCount++;
      }
    }

    if (created.length === 0 && deleted.length === 0 && unchangedCount === 0) {
      continue;
    }

    lines.push(`  ${formatKeyName(key)}:`);
    for (const item of created) {
      lines.push(`    [+] ${describeItem(item)}`);
    }
    for (const item of deleted) {
      lines.push(`    [-] ${describeItem(item)}`);
    }
    if (unchangedCount > 0) {
      lines.push(`    [~] ${unchangedCount} unchanged`);
    }
  }

  return lines;
}

function formatKeyName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function describeItem(item: Record<string, unknown>): string {
  const parts: string[] = [];
  const descriptiveKeys = [
    'attachmentName',
    'routeTableName',
    'dxGatewayName',
    'managementAccountId',
    'delegatedAdminAccountId',
    'adminAccountId',
    'memberAccountIds',
    'region',
    'regions',
    'attachmentType',
    'associationType',
    'tgwName',
  ];

  for (const k of descriptiveKeys) {
    if (k in item && item[k] !== undefined) {
      const val = item[k];
      if (Array.isArray(val)) {
        parts.push(`${k}: ${val.join(', ')}`);
      } else {
        parts.push(String(val));
      }
    }
  }

  return parts.length > 0 ? parts.join(' | ') : JSON.stringify(item);
}

/**
 * Builds the diff output filename with stage-order prefix for natural sorting.
 *
 * @param stageRunOrder - Numeric stage execution order (e.g. 6 for ORGANIZATIONS)
 * @param moduleName - Module name (e.g. 'macie')
 * @returns Filename like '06-macie.module.diff'
 */
export function buildDiffFileName(stageRunOrder: number, moduleName: string): string {
  const prefix = String(stageRunOrder).padStart(2, '0');
  return `${prefix}-${moduleName}.module.diff`;
}

/**
 * Writes a module diff file to the specified output directory.
 * Creates the directory if it does not exist.
 *
 * @param outputDir - Directory to write the diff file to
 * @param stageRunOrder - Numeric stage execution order
 * @param response - Module response to format and write
 */
export function writeModuleDiffFile(outputDir: string, stageRunOrder: number, response: IModuleResponse): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = buildDiffFileName(stageRunOrder, response.moduleName);
  const content = formatModuleDiff(response);
  fs.writeFileSync(path.join(outputDir, fileName), content + '\n', 'utf-8');
}
