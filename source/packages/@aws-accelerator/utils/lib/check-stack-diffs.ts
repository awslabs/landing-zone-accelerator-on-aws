import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';
import { createLogger } from './logger';

const logger = createLogger(['check-stack-diffs']);

/**
 * Checks stack diff files to identify which stacks have changes
 * @param diffPath - Base path containing cdk.out directory with diff files
 * @param stage - Optional stage name to include in manifest filename
 * @returns Array of stack names that have differences
 */
export async function checkStackDiffs(diffPath: string, stage?: string) {
  logger.debug(`Starting stack diff check at path: ${diffPath}`);

  // Find all .diff files in cdk.out subdirectories
  const diffFiles = globSync(path.join(diffPath, 'cdk.out/*/*.diff'));
  logger.debug(`Found ${diffFiles.length} diff files`);

  const stacksWithDifferences: string[] = [];
  const stacksWithoutDifferences: string[] = [];

  // Parse each diff file to check for changes
  diffFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const stackName = path.basename(file, '.diff');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    // Diff files with no changes contain "There were no differences" on the last line
    if (lines.length > 0 && lines[lines.length - 1].trim() === 'There were no differences') {
      stacksWithoutDifferences.push(stackName);
      logger.debug(`Stack ${stackName}: no differences`);
    } else {
      stacksWithDifferences.push(stackName);
      logger.debug(`Stack ${stackName}: has differences`);
    }
  });

  logger.debug(`Total stacks with differences: ${stacksWithDifferences.length}`);
  logger.debug(`Total stacks without differences: ${stacksWithoutDifferences.length}`);

  // Write stacks with differences to manifest file
  const manifestFileName = stage ? `lza.${stage}.manifest.json` : 'lza.manifest.json';
  const manifestPath = path.join(diffPath, manifestFileName);
  fs.writeFileSync(manifestPath, JSON.stringify(stacksWithDifferences, null, 2));
  logger.debug(`Wrote manifest to: ${manifestPath}`);

  return stacksWithDifferences;
}
