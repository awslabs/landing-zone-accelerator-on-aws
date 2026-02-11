import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { createSchema } from '../../lib/common/parse';

vi.mock('fs');
vi.mock('path');

describe('createSchema with !include and replacement tokens', () => {
  const testDir = '/mock/test/dir';
  const mockFs = vi.mocked(fs);
  const mockPath = vi.mocked(path);

  beforeEach(() => {
    vi.clearAllMocks();

    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation(p => p.split('/').slice(0, -1).join('/'));
  });

  it('processes replacement tokens in included files when replacementsConfig is provided', () => {
    const vpcContent = 'name: {{ TestName }}\nvalue: {{ TestValue }}\n';
    const networkContent = 'data: !include vpc-with-tokens.yaml\n';

    mockFs.readFileSync.mockImplementation(filePath => {
      const pathStr = String(filePath);
      if (pathStr.includes('vpc-with-tokens.yaml')) return vpcContent;
      if (pathStr.includes('network-with-include.yaml')) return networkContent;
      throw new Error(`Unexpected file read: ${pathStr}`);
    });

    const replacementsConfig = {
      preProcessBuffer: (content: string) => {
        return content.replace(/{{ TestName }}/g, 'ReplacedName').replace(/{{ TestValue }}/g, 'ReplacedValue');
      },
    };

    const schema = createSchema(testDir, replacementsConfig);
    const result = yaml.load(networkContent, { schema }) as { data: { name: string; value: string } };

    expect(result.data.name).toBe('ReplacedName');
    expect(result.data.value).toBe('ReplacedValue');
  });

  it('loads included files without preprocessing when replacementsConfig is not provided', () => {
    const vpcContent = 'name: TestName\nvalue: TestValue\n';
    const networkContent = 'data: !include vpc-plain.yaml\n';

    mockFs.readFileSync.mockImplementation(filePath => {
      const pathStr = String(filePath);
      if (pathStr.includes('vpc-plain.yaml')) return vpcContent;
      if (pathStr.includes('network-plain.yaml')) return networkContent;
      throw new Error(`Unexpected file read: ${pathStr}`);
    });

    const schema = createSchema(testDir);
    const result = yaml.load(networkContent, { schema }) as { data: { name: string; value: string } };

    expect(result.data.name).toBe('TestName');
    expect(result.data.value).toBe('TestValue');
  });
});
