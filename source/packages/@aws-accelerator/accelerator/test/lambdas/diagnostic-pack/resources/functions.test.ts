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
  CodePipelineClient,
  ListActionExecutionsCommand,
  ListPipelineExecutionsCommand,
} from '@aws-sdk/client-codepipeline';

import {
  getEnabledAccounts,
  getLzaConfigFiles,
  getLzaGlobalConfigMetadata,
  prepareLzaConfigSource,
} from '../../../../lib/lambdas/diagnostic-pack/resources/functions';

describe('prepareLzaConfigSource', () => {
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

describe('prepareLzaConfigSource (codeconnection source)', () => {
  const s3Mock = mockClient(S3Client);
  const codePipelineMock = mockClient(CodePipelineClient);
  const extractDir = '/tmp/lza-source-config';

  beforeEach(() => {
    s3Mock.reset();
    codePipelineMock.reset();
  });

  afterEach(() => {
    fs.rmSync(extractDir, { recursive: true, force: true });
  });

  it('resolves the config location from the pipeline artifact and reads a config file back from disk', async () => {
    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [{ pipelineExecutionId: 'exec-1', status: 'Succeeded' }],
    });
    codePipelineMock.on(ListActionExecutionsCommand).resolves({
      actionExecutionDetails: [
        {
          input: {
            inputArtifacts: [
              {
                name: 'Config',
                s3location: {
                  bucket: 'aws-accelerator-pipeline-000000000000-us-east-1',
                  key: 'AWSAccelerator-Pipel/Config/config.zip',
                },
              },
            ],
          },
        },
      ],
    });

    const zip = new AdmZip();
    zip.addFile('global-config.yaml', Buffer.from('homeRegion: us-east-1\nenabledRegions:\n  - us-east-1\n'));
    const zipBytes = new Uint8Array(zip.toBuffer());
    const body = {
      transformToByteArray: async () => zipBytes,
    } as unknown as GetObjectCommandOutput['Body'];
    s3Mock.on(GetObjectCommand).resolves({ Body: body });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codeconnection',
      repositoryName: 'aws-accelerator-config',
      pipelineName: 'AWSAccelerator-Pipeline',
    });

    // The artifact zip is extracted locally for subsequent disk reads.
    expect(configSource.localConfigDirPath).toBe(extractDir);
    expect(fs.existsSync(path.join(extractDir, 'global-config.yaml'))).toBe(true);

    // The extracted file is read back from disk and parsed.
    const globalConfig = await getLzaGlobalConfigMetadata(configSource);
    expect(globalConfig.enabledRegions).toEqual(['us-east-1']);
  });

  it('continues with an empty config source when no successful pipeline execution exists', async () => {
    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({ pipelineExecutionSummaries: [] });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codeconnection',
      repositoryName: 'aws-accelerator-config',
      pipelineName: 'AWSAccelerator-Pipeline',
    });

    // The report must still be producible: no config dir, and config reads
    // degrade to empty rather than throwing and aborting the whole report.
    expect(configSource.localConfigDirPath).toBeUndefined();
    const globalConfig = await getLzaGlobalConfigMetadata(configSource);
    expect(globalConfig.enabledRegions).toEqual([]);
    expect(globalConfig.homeRegion).toBe('us-east-1');
    // A reason is captured so the report can explain the empty config sections.
    expect(configSource.configUnavailableReason).toMatch(/CodeConnection source/);
  });

  it('continues with an empty config source when the Config artifact S3 location is missing', async () => {
    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [{ pipelineExecutionId: 'exec-1', status: 'Succeeded' }],
    });
    // Action executions exist, but none carry a `Config` input artifact.
    codePipelineMock.on(ListActionExecutionsCommand).resolves({
      actionExecutionDetails: [{ input: { inputArtifacts: [{ name: 'Source' }] } }],
    });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codeconnection',
      repositoryName: 'aws-accelerator-config',
      pipelineName: 'AWSAccelerator-Pipeline',
    });

    expect(configSource.localConfigDirPath).toBeUndefined();
    const globalConfig = await getLzaGlobalConfigMetadata(configSource);
    expect(globalConfig.enabledRegions).toEqual([]);
    expect(configSource.configUnavailableReason).toBeDefined();
  });

  it('reads config files even when the artifact zip nests them under a subdirectory', async () => {
    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [{ pipelineExecutionId: 'exec-1', status: 'Succeeded' }],
    });
    codePipelineMock.on(ListActionExecutionsCommand).resolves({
      actionExecutionDetails: [
        {
          input: {
            inputArtifacts: [
              {
                name: 'Config',
                s3location: {
                  bucket: 'aws-accelerator-pipeline-000000000000-us-east-1',
                  key: 'AWSAccelerator-Pipel/Config/config.zip',
                },
              },
            ],
          },
        },
      ],
    });

    // Nest the YAML file under a subdirectory rather than at the zip root.
    const zip = new AdmZip();
    zip.addFile(
      'aws-accelerator-config/global-config.yaml',
      Buffer.from('homeRegion: us-east-1\nenabledRegions:\n  - eu-west-1\n'),
    );
    const zipBytes = new Uint8Array(zip.toBuffer());
    const body = {
      transformToByteArray: async () => zipBytes,
    } as unknown as GetObjectCommandOutput['Body'];
    s3Mock.on(GetObjectCommand).resolves({ Body: body });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codeconnection',
      repositoryName: 'aws-accelerator-config',
      pipelineName: 'AWSAccelerator-Pipeline',
    });

    // The nested file is still located and parsed, not silently skipped.
    const globalConfig = await getLzaGlobalConfigMetadata(configSource);
    expect(globalConfig.enabledRegions).toEqual(['eu-west-1']);
  });

  it('paginates action executions to find the Config artifact on a later page', async () => {
    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [{ pipelineExecutionId: 'exec-1', status: 'Succeeded' }],
    });
    // First page has no Config artifact and returns a nextToken; second page carries it.
    codePipelineMock
      .on(ListActionExecutionsCommand)
      .resolvesOnce({
        actionExecutionDetails: [{ input: { inputArtifacts: [{ name: 'Source' }] } }],
        nextToken: 'page-2',
      })
      .resolvesOnce({
        actionExecutionDetails: [
          {
            input: {
              inputArtifacts: [
                {
                  name: 'Config',
                  s3location: {
                    bucket: 'aws-accelerator-pipeline-000000000000-us-east-1',
                    key: 'AWSAccelerator-Pipel/Config/config.zip',
                  },
                },
              ],
            },
          },
        ],
      });

    const zip = new AdmZip();
    zip.addFile('global-config.yaml', Buffer.from('homeRegion: us-east-1\nenabledRegions:\n  - us-west-2\n'));
    const zipBytes = new Uint8Array(zip.toBuffer());
    const body = {
      transformToByteArray: async () => zipBytes,
    } as unknown as GetObjectCommandOutput['Body'];
    s3Mock.on(GetObjectCommand).resolves({ Body: body });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codeconnection',
      repositoryName: 'aws-accelerator-config',
      pipelineName: 'AWSAccelerator-Pipeline',
    });

    const globalConfig = await getLzaGlobalConfigMetadata(configSource);
    expect(globalConfig.enabledRegions).toEqual(['us-west-2']);
  });

  it('paginates pipeline executions to find a Succeeded execution on a later page', async () => {
    // First page has only a non-Succeeded execution and a nextToken; the newest
    // Succeeded execution is on the second page.
    codePipelineMock
      .on(ListPipelineExecutionsCommand)
      .resolvesOnce({
        pipelineExecutionSummaries: [{ pipelineExecutionId: 'exec-0', status: 'Failed' }],
        nextToken: 'page-2',
      })
      .resolvesOnce({
        pipelineExecutionSummaries: [{ pipelineExecutionId: 'exec-1', status: 'Succeeded' }],
      });
    codePipelineMock.on(ListActionExecutionsCommand).resolves({
      actionExecutionDetails: [
        {
          input: {
            inputArtifacts: [
              {
                name: 'Config',
                s3location: {
                  bucket: 'aws-accelerator-pipeline-000000000000-us-east-1',
                  key: 'AWSAccelerator-Pipel/Config/config.zip',
                },
              },
            ],
          },
        },
      ],
    });

    const zip = new AdmZip();
    zip.addFile('global-config.yaml', Buffer.from('homeRegion: us-east-1\nenabledRegions:\n  - ap-south-1\n'));
    const zipBytes = new Uint8Array(zip.toBuffer());
    const body = {
      transformToByteArray: async () => zipBytes,
    } as unknown as GetObjectCommandOutput['Body'];
    s3Mock.on(GetObjectCommand).resolves({ Body: body });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codeconnection',
      repositoryName: 'aws-accelerator-config',
      pipelineName: 'AWSAccelerator-Pipeline',
    });

    // The Succeeded execution from the second page is used to resolve the config.
    const globalConfig = await getLzaGlobalConfigMetadata(configSource);
    expect(globalConfig.enabledRegions).toEqual(['ap-south-1']);
  });

  it('throws when pipelineName is not provided', async () => {
    await expect(
      prepareLzaConfigSource({
        homeRegion: 'us-east-1',
        configRepositoryLocation: 'codeconnection',
        repositoryName: 'aws-accelerator-config',
        // pipelineName intentionally omitted
      }),
    ).rejects.toThrow(/pipelineName is required/);
  });

  it('returns no enabled accounts when the config file is absent from the extracted archive', async () => {
    codePipelineMock.on(ListPipelineExecutionsCommand).resolves({
      pipelineExecutionSummaries: [{ pipelineExecutionId: 'exec-1', status: 'Succeeded' }],
    });
    codePipelineMock.on(ListActionExecutionsCommand).resolves({
      actionExecutionDetails: [
        {
          input: {
            inputArtifacts: [
              {
                name: 'Config',
                s3location: {
                  bucket: 'aws-accelerator-pipeline-000000000000-us-east-1',
                  key: 'AWSAccelerator-Pipel/Config/config.zip',
                },
              },
            ],
          },
        },
      ],
    });

    // Archive contains only global-config.yaml; accounts-config.yaml is absent.
    const zip = new AdmZip();
    zip.addFile('global-config.yaml', Buffer.from('homeRegion: us-east-1\nenabledRegions:\n  - us-east-1\n'));
    const zipBytes = new Uint8Array(zip.toBuffer());
    const body = {
      transformToByteArray: async () => zipBytes,
    } as unknown as GetObjectCommandOutput['Body'];
    s3Mock.on(GetObjectCommand).resolves({ Body: body });

    const configSource = await prepareLzaConfigSource({
      homeRegion: 'us-east-1',
      configRepositoryLocation: 'codeconnection',
      repositoryName: 'aws-accelerator-config',
      pipelineName: 'AWSAccelerator-Pipeline',
    });

    // resolveConfigFilePath finds no accounts-config.yaml (root or nested) and
    // returns undefined, so the missing file is skipped rather than throwing.
    const enabledAccounts = await getEnabledAccounts(configSource, []);
    expect(enabledAccounts).toEqual([]);
  });
});
