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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { CachingCredentialProvider } from '../lib/caching-credential-provider';

let stsMock: AwsClientStub<STSClient>;

const MOCK_CREDENTIALS = {
  AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  SessionToken: 'FwoGZXIvYXdzEBYaDH7example',
  Expiration: new Date(Date.now() + 3600_000),
};

beforeEach(() => {
  stsMock = mockClient(STSClient);
  stsMock.on(AssumeRoleCommand).resolves({ Credentials: MOCK_CREDENTIALS });
});

afterEach(() => {
  stsMock.reset();
  stsMock.restore();
  // Ensure singleton is cleaned up between tests
  try {
    CachingCredentialProvider.get().shutdown();
  } catch {
    // Not initialized, nothing to clean up
  }
});

describe('CachingCredentialProvider', () => {
  describe('init and get', () => {
    it('should initialize the singleton', () => {
      const provider = CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });
      expect(provider).toBeDefined();
      expect(CachingCredentialProvider.get()).toBe(provider);
    });

    it('should return the same instance on subsequent init calls', () => {
      const first = CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });
      const second = CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-west-2'],
      });
      expect(first).toBe(second);
    });

    it('should throw when get() is called before init()', () => {
      expect(() => CachingCredentialProvider.get()).toThrow('CachingCredentialProvider not initialized');
    });
  });

  describe('forRole', () => {
    it('should return valid credentials for a role', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      const credentialsFn = provider.forRole('123456789012', 'TestRole', 'us-east-1');
      const credentials = await credentialsFn();

      expect(credentials.accessKeyId).toBe(MOCK_CREDENTIALS.AccessKeyId);
      expect(credentials.secretAccessKey).toBe(MOCK_CREDENTIALS.SecretAccessKey);
      expect(credentials.sessionToken).toBe(MOCK_CREDENTIALS.SessionToken);
    });

    it('should throw for an unconfigured region', () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      expect(() => provider.forRole('123456789012', 'TestRole', 'eu-west-1')).toThrow(
        'Region "eu-west-1" not configured',
      );
    });

    it('should construct the correct role ARN for aws partition', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      await provider.forRole('123456789012', 'MyRole', 'us-east-1')();

      const call = stsMock.commandCalls(AssumeRoleCommand)[0];
      expect(call.args[0].input.RoleArn).toBe('arn:aws:iam::123456789012:role/MyRole');
    });

    it('should construct the correct role ARN for aws-us-gov partition', async () => {
      CachingCredentialProvider.init({
        partition: 'aws-us-gov',
        regions: ['us-gov-west-1'],
      });

      const provider = CachingCredentialProvider.get();
      await provider.forRole('123456789012', 'GovRole', 'us-gov-west-1')();

      const call = stsMock.commandCalls(AssumeRoleCommand)[0];
      expect(call.args[0].input.RoleArn).toBe('arn:aws-us-gov:iam::123456789012:role/GovRole');
    });

    it('should construct the correct role ARN for aws-cn partition', async () => {
      CachingCredentialProvider.init({
        partition: 'aws-cn',
        regions: ['cn-northwest-1'],
      });

      const provider = CachingCredentialProvider.get();
      await provider.forRole('123456789012', 'ChinaRole', 'cn-northwest-1')();

      const call = stsMock.commandCalls(AssumeRoleCommand)[0];
      expect(call.args[0].input.RoleArn).toBe('arn:aws-cn:iam::123456789012:role/ChinaRole');
    });
  });

  describe('addRegion', () => {
    it('should register a region on demand so forRole no longer throws', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();

      // Region was not provided at init time.
      expect(() => provider.forRole('123456789012', 'TestRole', 'eu-west-1')).toThrow(
        'Region "eu-west-1" not configured',
      );

      // Registering it on demand makes the region usable.
      provider.addRegion('eu-west-1');
      const credentials = await provider.forRole('123456789012', 'TestRole', 'eu-west-1')();
      expect(credentials.accessKeyId).toBe(MOCK_CREDENTIALS.AccessKeyId);
    });

    it('should be idempotent for an already-configured region', () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      provider.addRegion('us-east-1');
      provider.addRegion('us-east-1');

      expect(() => provider.forRole('123456789012', 'TestRole', 'us-east-1')).not.toThrow();
    });
  });

  describe('caching behavior', () => {
    it('should cache credentials and not call STS again for the same role', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      const first = await provider.forRole('123456789012', 'TestRole', 'us-east-1')();
      const second = await provider.forRole('123456789012', 'TestRole', 'us-east-1')();

      expect(first.accessKeyId).toBe(second.accessKeyId);
      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(1);
    });

    it('should make separate STS calls for different accounts', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      await provider.forRole('111111111111', 'TestRole', 'us-east-1')();
      await provider.forRole('222222222222', 'TestRole', 'us-east-1')();

      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(2);
    });

    it('should make separate STS calls for different roles', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      await provider.forRole('123456789012', 'RoleA', 'us-east-1')();
      await provider.forRole('123456789012', 'RoleB', 'us-east-1')();

      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(2);
    });

    it('should make separate STS calls for different regions', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1', 'us-west-2'],
      });

      const provider = CachingCredentialProvider.get();
      await provider.forRole('123456789012', 'TestRole', 'us-east-1')();
      await provider.forRole('123456789012', 'TestRole', 'us-west-2')();

      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(2);
    });

    it('should deduplicate concurrent requests for the same role', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      const [first, second, third] = await Promise.all([
        provider.forRole('123456789012', 'TestRole', 'us-east-1')(),
        provider.forRole('123456789012', 'TestRole', 'us-east-1')(),
        provider.forRole('123456789012', 'TestRole', 'us-east-1')(),
      ]);

      expect(first.accessKeyId).toBe(second.accessKeyId);
      expect(second.accessKeyId).toBe(third.accessKeyId);
      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(1);
    });
  });

  describe('credential refresh', () => {
    it('should refresh credentials when they are near expiration', async () => {
      // Return credentials that expire in 2 minutes (within the 5-minute buffer)
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          ...MOCK_CREDENTIALS,
          Expiration: new Date(Date.now() + 2 * 60 * 1000),
        },
      });

      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();

      // First call fetches
      await provider.forRole('123456789012', 'TestRole', 'us-east-1')();
      // Second call should re-fetch because credentials are within the refresh buffer
      await provider.forRole('123456789012', 'TestRole', 'us-east-1')();

      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should throw when AssumeRole returns no credentials', async () => {
      stsMock.on(AssumeRoleCommand).resolves({ Credentials: undefined });

      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      await expect(provider.forRole('123456789012', 'BadRole', 'us-east-1')()).rejects.toThrow(
        'Failed to assume role BadRole in account 123456789012',
      );
    });

    it('should throw when AssumeRole returns incomplete credentials', async () => {
      stsMock.on(AssumeRoleCommand).resolves({
        Credentials: {
          AccessKeyId: 'AKID',
          SecretAccessKey: undefined as unknown as string,
          SessionToken: 'token',
          Expiration: new Date(),
        },
      });

      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      await expect(provider.forRole('123456789012', 'BadRole', 'us-east-1')()).rejects.toThrow('Failed to assume role');
    });

    it('should propagate STS errors', async () => {
      stsMock.on(AssumeRoleCommand).rejects(new Error('Access denied'));

      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      await expect(provider.forRole('123456789012', 'TestRole', 'us-east-1')()).rejects.toThrow('Access denied');
    });
  });

  describe('addRegion and addRegions', () => {
    it('should allow adding a new region after init', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      provider.addRegion('eu-west-1');

      const credentials = await provider.forRole('123456789012', 'TestRole', 'eu-west-1')();
      expect(credentials.accessKeyId).toBe(MOCK_CREDENTIALS.AccessKeyId);
    });

    it('should be a no-op when adding an already configured region', () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      // Should not throw
      provider.addRegion('us-east-1');
    });

    it('should add multiple regions at once', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      provider.addRegions(['eu-west-1', 'ap-southeast-1']);

      await provider.forRole('123456789012', 'TestRole', 'eu-west-1')();
      await provider.forRole('123456789012', 'TestRole', 'ap-southeast-1')();

      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(2);
    });
  });

  describe('getStsClient', () => {
    it('should return the STS client for a configured region', () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const client = CachingCredentialProvider.get().getStsClient('us-east-1');
      expect(client).toBeInstanceOf(STSClient);
    });

    it('should throw for an unconfigured region', () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      expect(() => CachingCredentialProvider.get().getStsClient('eu-west-1')).toThrow(
        'Region "eu-west-1" not configured',
      );
    });
  });

  describe('STS client endpoint resolution', () => {
    it('should construct STS clients without an explicit endpoint so the SDK resolves it natively', () => {
      // Guards the removal of the hardcoded per-partition STS endpoint. This provider
      // builds its STS clients directly (not via AwsClientFactory), so it needs its own
      // assertion that no endpoint override is set — letting the SDK resolve the regional
      // endpoint and honor AWS_ENDPOINT_URL[_STS] / AWS_USE_FIPS_ENDPOINT. If an explicit
      // endpoint leaked back in, config.endpoint would be a resolver function, not undefined.
      CachingCredentialProvider.init({
        partition: 'aws-eusc',
        regions: ['eusc-de-east-1'],
      });

      const client = CachingCredentialProvider.get().getStsClient('eusc-de-east-1');
      expect(client.config.endpoint).toBeUndefined();
    });
  });

  describe('shutdown', () => {
    it('should clear the singleton so get() throws', () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      CachingCredentialProvider.get().shutdown();

      expect(() => CachingCredentialProvider.get()).toThrow('CachingCredentialProvider not initialized');
    });

    it('should allow re-initialization after shutdown', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });
      CachingCredentialProvider.get().shutdown();

      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-west-2'],
      });

      const credentials = await CachingCredentialProvider.get().forRole('123456789012', 'TestRole', 'us-west-2')();
      expect(credentials.accessKeyId).toBe(MOCK_CREDENTIALS.AccessKeyId);
    });

    it('should clear cached credentials on shutdown', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      const provider = CachingCredentialProvider.get();
      await provider.forRole('123456789012', 'TestRole', 'us-east-1')();
      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(1);

      provider.shutdown();

      // Re-init and fetch again — should make a new STS call
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });
      await CachingCredentialProvider.get().forRole('123456789012', 'TestRole', 'us-east-1')();
      expect(stsMock.commandCalls(AssumeRoleCommand)).toHaveLength(2);
    });
  });

  describe('session name', () => {
    it('should use the default session name prefix', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
      });

      await CachingCredentialProvider.get().forRole('123456789012', 'TestRole', 'us-east-1')();

      const call = stsMock.commandCalls(AssumeRoleCommand)[0];
      expect(call.args[0].input.RoleSessionName).toMatch(/^cached-123456789012-/);
    });

    it('should use a custom session name prefix', async () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
        sessionName: 'lza',
      });

      await CachingCredentialProvider.get().forRole('123456789012', 'TestRole', 'us-east-1')();

      const call = stsMock.commandCalls(AssumeRoleCommand)[0];
      expect(call.args[0].input.RoleSessionName).toMatch(/^lza-123456789012-/);
    });
  });

  describe('debug mode', () => {
    it('should initialize without errors when debug is enabled', () => {
      const provider = CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
        enableDebug: true,
      });
      expect(provider).toBeDefined();
    });

    it('should clean up debug resources on shutdown', () => {
      CachingCredentialProvider.init({
        partition: 'aws',
        regions: ['us-east-1'],
        enableDebug: true,
      });

      // Should not throw
      CachingCredentialProvider.get().shutdown();
      expect(() => CachingCredentialProvider.get()).toThrow();
    });
  });
});
