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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AwsClientFactory } from '../lib/aws-client-factory';

// Mock setRetryStrategy (imported by the factory from ./retry-strategy)
const mockRetryStrategy = { maxAttempts: 800 };
vi.mock('../lib/retry-strategy', () => ({
  setRetryStrategy: vi.fn(() => mockRetryStrategy),
}));

// Mock createLogger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
vi.mock('../lib/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MiddlewareEntry = { middleware: any; options: { step: string } };

/**
 * Minimal fake SDK client that mimics the AWS SDK v3 client shape.
 */
class FakeClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly config: any;
  readonly middlewareStack = {
    handlers: [] as MiddlewareEntry[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add(middleware: any, options: any) {
      this.handlers.push({ middleware, options });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: any) {
    this.config = config;
  }
}

/**
 * Client without middlewareStack to test the no-middleware path.
 */
class BareClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly config: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: any) {
    this.config = config;
  }
}

/**
 * Helper: invoke a middleware entry with a fake next/context, returning the handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invokeMiddleware(entry: MiddlewareEntry, next: any, context: Record<string, any>) {
  return entry.middleware(next, context);
}

describe('AwsClientFactory', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('create', () => {
    it('should create a client with default options from environment', () => {
      process.env['AWS_REGION'] = 'us-west-2';
      process.env['SOLUTION_ID'] = 'SO0199';

      const client = AwsClientFactory.create(FakeClient);

      expect(client).toBeInstanceOf(FakeClient);
      expect(client.config.region).toBe('us-west-2');
      expect(client.config.customUserAgent).toBe('SO0199');
      expect(client.config.retryStrategy).toBe(mockRetryStrategy);
    });

    it('should use explicit region over environment variable', () => {
      process.env['AWS_REGION'] = 'us-west-2';

      const client = AwsClientFactory.create(FakeClient, { region: 'eu-central-1' });

      expect(client.config.region).toBe('eu-central-1');
    });

    it('should set credentials when provided', () => {
      const credentials = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'FwoGZXIvYXdzEBYaDHqa0AP',
      };

      const client = AwsClientFactory.create(FakeClient, { credentials });

      expect(client.config.credentials).toEqual(credentials);
    });

    it('should set endpoint when provided', () => {
      const client = AwsClientFactory.create(FakeClient, {
        endpoint: 'https://sts.us-iso-east-1.c2s.ic.gov',
      });

      expect(client.config.endpoint).toBe('https://sts.us-iso-east-1.c2s.ic.gov');
    });

    it('should NOT set an endpoint when none is provided, so the SDK resolves it natively', () => {
      // Guards the removal of the hardcoded STS endpoint: callers that omit
      // `endpoint` must let the SDK resolve it (which honors AWS_ENDPOINT_URL[_STS]
      // and AWS_USE_FIPS_ENDPOINT). If an endpoint key leaked back in, these break.
      const client = AwsClientFactory.create(FakeClient, { region: 'us-east-1' });

      expect(client.config).not.toHaveProperty('endpoint');
      expect(client.config.endpoint).toBeUndefined();
    });

    it('should not set retryStrategy when useRetryStrategy is false', () => {
      const client = AwsClientFactory.create(FakeClient, { useRetryStrategy: false });

      expect(client.config.retryStrategy).toBeUndefined();
    });

    it('should not set region when not provided and not in environment', () => {
      delete process.env['AWS_REGION'];

      const client = AwsClientFactory.create(FakeClient);

      expect(client.config.region).toBeUndefined();
    });

    it('should not set customUserAgent when SOLUTION_ID is not set and not provided', () => {
      delete process.env['SOLUTION_ID'];

      const client = AwsClientFactory.create(FakeClient);

      expect(client.config.customUserAgent).toBeUndefined();
    });

    it('should use explicit customUserAgent over environment variable', () => {
      process.env['SOLUTION_ID'] = 'SO0199';

      const client = AwsClientFactory.create(FakeClient, { customUserAgent: 'CustomAgent' });

      expect(client.config.customUserAgent).toBe('CustomAgent');
    });

    it('should handle credentials without sessionToken', () => {
      const credentials = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const client = AwsClientFactory.create(FakeClient, { credentials });

      expect(client.config.credentials.accessKeyId).toBe(credentials.accessKeyId);
      expect(client.config.credentials.secretAccessKey).toBe(credentials.secretAccessKey);
      expect(client.config.credentials.sessionToken).toBeUndefined();
    });

    it('should add logging middleware by default', () => {
      const client = AwsClientFactory.create(FakeClient);

      expect(client.middlewareStack.handlers).toHaveLength(1);
      expect(client.middlewareStack.handlers[0].options.step).toBe('finalizeRequest');
    });

    it('should add no middleware when enableLogging is false', () => {
      const client = AwsClientFactory.create(FakeClient, { enableLogging: false });

      expect(client.middlewareStack.handlers).toHaveLength(0);
    });

    it('should not fail when client has no middlewareStack', () => {
      const client = AwsClientFactory.create(BareClient, { enableLogging: false });

      expect(client).toBeInstanceOf(BareClient);
    });

    it('should use a custom logger when provided', () => {
      const customLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ReturnType<
        typeof import('../lib/logger').createLogger
      >;
      const client = AwsClientFactory.create(FakeClient, { logger: customLogger });

      expect(client.middlewareStack.handlers).toHaveLength(1);
    });
  });

  describe('logging middleware', () => {
    it('should log success at info level with duration and request input', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const mockNext = vi.fn().mockResolvedValue({
        response: { headers: { 'x-amzn-requestid': 'req-123' } },
      });
      const context = { clientName: 'S3Client', commandName: 'PutObjectCommand', requestId: 'ctx-req' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await handler({ input: { Bucket: 'my-bucket' } });

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      const logMessage = mockLogger.info.mock.calls[0][0] as string;
      expect(logMessage).toContain('S3Client');
      expect(logMessage).toContain('PutObjectCommand');
      expect(logMessage).toContain('req-123');
      expect(logMessage).toContain('Success');
      expect(logMessage).toContain('my-bucket');
    });

    it('should log error at error level with duration and request input', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const mockNext = vi.fn().mockRejectedValue(new Error('AccessDenied'));
      const context = { clientName: 'S3Client', commandName: 'GetObjectCommand', requestId: 'ctx-req' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: { Key: 'test.txt' } })).rejects.toThrow('AccessDenied');

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const logMessage = mockLogger.error.mock.calls[0][0] as string;
      expect(logMessage).toContain('S3Client');
      expect(logMessage).toContain('GetObjectCommand');
      expect(logMessage).toContain('Error');
      expect(logMessage).toContain('test.txt');
    });

    it('should extract requestId from error $metadata when available', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const sdkError = Object.assign(new Error('NoSuchKey'), {
        $metadata: { requestId: 'err-req-789' },
      });
      const mockNext = vi.fn().mockRejectedValue(sdkError);
      const context = { clientName: 'S3Client', commandName: 'GetObjectCommand', requestId: '' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: { Key: 'missing.txt' } })).rejects.toThrow('NoSuchKey');

      const logMessage = mockLogger.error.mock.calls[0][0] as string;
      expect(logMessage).toContain('err-req-789');
    });

    it('should fall back to context requestId on error when $metadata is absent', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const mockNext = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
      const context = { clientName: 'CFNClient', commandName: 'GetTemplateCommand', requestId: 'ctx-fallback' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: {} })).rejects.toThrow('ENOTFOUND');

      const logMessage = mockLogger.error.mock.calls[0][0] as string;
      expect(logMessage).toContain('ctx-fallback');
    });

    it('should include loggingContext in log output', async () => {
      const client = AwsClientFactory.create(FakeClient, {
        loggingContext: ['123456789012', 'us-east-1'],
      });

      const loggingEntry = client.middlewareStack.handlers[0];
      const mockNext = vi.fn().mockResolvedValue({
        response: { headers: {} },
      });
      const context = { clientName: 'STSClient', commandName: 'AssumeRoleCommand', requestId: 'req-456' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await handler({ input: {} });

      const logMessage = mockLogger.info.mock.calls[0][0] as string;
      expect(logMessage).toContain('123456789012');
      expect(logMessage).toContain('us-east-1');
    });

    it('should fall back to context requestId when response header is missing', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const mockNext = vi.fn().mockResolvedValue({
        response: { headers: {} },
      });
      const context = { clientName: 'STSClient', commandName: 'GetCallerIdentityCommand', requestId: 'fallback-id' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await handler({ input: {} });

      const logMessage = mockLogger.info.mock.calls[0][0] as string;
      expect(logMessage).toContain('fallback-id');
    });

    it('should log throttling errors at warn level (SDKv3 name field)', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const throttleError = Object.assign(new Error('Rate exceeded'), {
        name: 'TooManyRequestsException',
      });
      const mockNext = vi.fn().mockRejectedValue(throttleError);
      const context = {
        clientName: 'OrganizationsClient',
        commandName: 'ListOrganizationalUnitsForParentCommand',
        requestId: 'req-throttle-1',
      };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: { ParentId: 'ou-1234' } })).rejects.toThrow('Rate exceeded');

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
      const logMessage = mockLogger.warn.mock.calls[0][0] as string;
      expect(logMessage).toContain('OrganizationsClient');
      expect(logMessage).toContain('ListOrganizationalUnitsForParentCommand');
      expect(logMessage).toContain('Error');
    });

    it('should log throttling errors at warn level (SDKv2 code field)', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const throttleError = Object.assign(new Error('Throttling'), {
        code: 'ThrottlingException',
      });
      const mockNext = vi.fn().mockRejectedValue(throttleError);
      const context = { clientName: 'EC2Client', commandName: 'DescribeInstancesCommand', requestId: 'req-throttle-2' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: {} })).rejects.toThrow('Throttling');

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log transient network errors at warn level', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const networkError = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      const mockNext = vi.fn().mockRejectedValue(networkError);
      const context = { clientName: 'S3Client', commandName: 'GetObjectCommand', requestId: 'req-network-1' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: { Key: 'file.txt' } })).rejects.toThrow('socket hang up');

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log retryable: true errors at warn level', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const retryableError = Object.assign(new Error('internal'), { retryable: true });
      const mockNext = vi.fn().mockRejectedValue(retryableError);
      const context = { clientName: 'CFNClient', commandName: 'UpdateStackCommand', requestId: 'req-retryable' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: {} })).rejects.toThrow('internal');

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log non-retryable errors at error level (not warn)', async () => {
      const client = AwsClientFactory.create(FakeClient);

      const loggingEntry = client.middlewareStack.handlers[0];
      const nonRetryableError = Object.assign(new Error('Access Denied'), { name: 'AccessDeniedException' });
      const mockNext = vi.fn().mockRejectedValue(nonRetryableError);
      const context = { clientName: 'S3Client', commandName: 'GetObjectCommand', requestId: 'req-denied' };

      const handler = invokeMiddleware(loggingEntry, mockNext, context);
      await expect(handler({ input: { Key: 'secret.txt' } })).rejects.toThrow('Access Denied');

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });
});
