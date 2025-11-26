import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkStackDiffs } from '../lib/check-stack-diffs';

const testDir = path.join(__dirname, 'test-diffs');

describe('checkStackDiffs', () => {
  beforeEach(() => {
    // Create test directory structure
    fs.mkdirSync(path.join(testDir, 'cdk.out', 'stage1'), { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('should identify stacks with differences', async () => {
    // Create diff files - "There were no differences" must be on last line
    fs.writeFileSync(path.join(testDir, 'cdk.out', 'stage1', 'stack1.diff'), 'Stack: stack1\nSome changes here');
    fs.writeFileSync(
      path.join(testDir, 'cdk.out', 'stage1', 'stack2.diff'),
      'Stack: stack2\nThere were no differences',
    );
    fs.writeFileSync(path.join(testDir, 'cdk.out', 'stage1', 'stack3.diff'), 'Stack: stack3\nMore changes');

    const result = await checkStackDiffs(testDir);

    expect(result.sort()).toEqual(['stack1', 'stack3']);
  });

  test('should treat stack as having no differences if message is on last line', async () => {
    fs.writeFileSync(
      path.join(testDir, 'cdk.out', 'stage1', 'stack1.diff'),
      'Stack: stack1\nSome text\nThere were no differences',
    );

    const result = await checkStackDiffs(testDir);

    expect(result).toEqual([]);
  });

  test('should write manifest file without stage name', async () => {
    fs.writeFileSync(path.join(testDir, 'cdk.out', 'stage1', 'stack1.diff'), 'Stack: stack1\nSome changes');

    await checkStackDiffs(testDir);

    const manifestPath = path.join(testDir, 'lza.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest).toEqual(['stack1']);
  });

  test('should write manifest file with stage name', async () => {
    fs.writeFileSync(path.join(testDir, 'cdk.out', 'stage1', 'stack1.diff'), 'Stack: stack1\nSome changes');

    await checkStackDiffs(testDir, 'bootstrap');

    const manifestPath = path.join(testDir, 'lza.bootstrap.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest).toEqual(['stack1']);
  });

  test('should return empty array when all stacks have no differences', async () => {
    fs.writeFileSync(
      path.join(testDir, 'cdk.out', 'stage1', 'stack1.diff'),
      'Stack: stack1\nThere were no differences',
    );
    fs.writeFileSync(
      path.join(testDir, 'cdk.out', 'stage1', 'stack2.diff'),
      'Stack: stack2\nThere were no differences',
    );

    const result = await checkStackDiffs(testDir);

    expect(result).toEqual([]);
  });

  test('should write empty manifest with stage name when no differences', async () => {
    fs.writeFileSync(
      path.join(testDir, 'cdk.out', 'stage1', 'stack1.diff'),
      'Stack: stack1\nThere were no differences',
    );

    await checkStackDiffs(testDir, 'prepare');

    const manifestPath = path.join(testDir, 'lza.prepare.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest).toEqual([]);
  });
});
