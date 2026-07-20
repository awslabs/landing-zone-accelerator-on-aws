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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { mockClient } from 'aws-sdk-client-mock';
import { CodeCommitClient, GetFileCommand } from '@aws-sdk/client-codecommit';
import { GetObjectCommand, GetObjectCommandOutput, S3Client } from '@aws-sdk/client-s3';

import {
  getLzaConfigFiles,
  getLzaGlobalConfigMetadata,
  prepareLzaConfigSource,
} from '../../../../lib/lambdas/diagnostic-pack/resources/functions';

describe('prepareLzaConfigSource', () => {
  it('throws a clear error for the codeconnection config source (not yet supported)', async () => {
    await expect(
      prepareLzaConfigSource({
        homeRegion: 'us-east-1',
        configRepositoryLocation: 'codeconnection',
        repositoryName: 'aws-accelerator-config',
        configBucketName: 'aws-accelerator-config-000000000000-us-east-1',
      }),
    ).rejects.toThrow(/codeconnection/i);
  });

  it('returns a codecommit source without downloading anything from S3', async () => {
    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codecommit',
      repositoryName: 'aws-accelerator-config',
    });

    expect(configSource.configRepositoryLocation).toBe('codecommit');
    expect(configSource.repositoryName).toBe('aws-accelerator-config');
    // No local extraction happens for CodeCommit sources.
    expect(configSource.localConfigDirPath).toBeUndefined();
  });

  it('throws when the S3 config source is missing the config bucket name', async () => {
    await expect(
      prepareLzaConfigSource({
        homeRegion: 'us-east-1',
        configRepositoryLocation: 's3',
        repositoryName: 'aws-accelerator-config',
      }),
    ).rejects.toThrow(/CONFIG_BUCKET_NAME/);
  });
});

describe('getLzaConfigFiles', () => {
  const codeCommitMock = mockClient(CodeCommitClient);
  let tempConfigDir: string;

  beforeEach(() => {
    codeCommitMock.reset();
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lza-diag-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempConfigDir, { recursive: true, force: true });
  });

  it('logs and continues when a config file read fails with a non-FileDoesNotExistException error', async () => {
    const encoder = new TextEncoder();
    const accessDenied = Object.assign(new Error('access denied'), { name: 'AccessDeniedException' });

    // One file fails with a hard error; the rest return content.
    codeCommitMock.on(GetFileCommand).callsFake(input => {
      if (input.filePath === 'network-config.yaml') {
        throw accessDenied;
      }
      return { fileContent: encoder.encode(`# ${input.filePath}\n`) };
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const configSource = {
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codecommit',
      repositoryName: 'aws-accelerator-config',
    };

    // Must not reject despite the access-denied error on one file.
    await expect(getLzaConfigFiles(configSource, [], tempConfigDir)).resolves.toBeUndefined();

    // The remaining 7 of 8 required files should still be written; the failed one is skipped.
    const writtenFiles = fs.readdirSync(tempConfigDir);
    expect(writtenFiles).toHaveLength(7);
    expect(writtenFiles).not.toContain('network-config.yaml');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network-config.yaml'));
  });
});

describe('prepareLzaConfigSource (S3 source)', () => {
  const s3Mock = mockClient(S3Client);
  const extractDir = '/tmp/lza-source-config';

  beforeEach(() => {
    s3Mock.reset();
  });

  afterEach(() => {
    fs.rmSync(extractDir, { recursive: true, force: true });
  });

  it('downloads and extracts the config zip from S3 and reads a config file back from disk', async () => {
    const zip = new AdmZip();
    zip.addFile(
      'global-config.yaml',
      Buffer.from('homeRegion: us-east-1\nenabledRegions:\n  - us-east-1\n  - eu-west-1\n'),
    );
    const zipBytes = new Uint8Array(zip.toBuffer());

    const body = {
      transformToByteArray: async () => zipBytes,
    } as unknown as GetObjectCommandOutput['Body'];
    s3Mock.on(GetObjectCommand).resolves({ Body: body });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 's3',
      repositoryName: 'aws-accelerator-config',
      configBucketName: 'aws-accelerator-config-000000000000-us-east-1',
    });

    // The zip is extracted to a local directory for subsequent disk reads.
    expect(configSource.localConfigDirPath).toBe(extractDir);
    expect(fs.existsSync(path.join(extractDir, 'global-config.yaml'))).toBe(true);

    // The extracted file is read back from disk and parsed.
    const globalConfig = await getLzaGlobalConfigMetadata(configSource);
    expect(globalConfig.enabledRegions).toEqual(['us-east-1', 'eu-west-1']);
  });
});
