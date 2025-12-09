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

import { describe, beforeEach, expect, test, afterAll, vi, type MockedFunction } from 'vitest';

const originalEnv = process.env;

// Mock winston at the top level
const mockLoggerMethods = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockChild = vi.fn(() => mockLoggerMethods);

const mockLogger = {
  child: mockChild,
  ...mockLoggerMethods,
};

vi.mock('winston', () => ({
  createLogger: vi.fn(() => mockLogger),
  format: {
    combine: vi.fn(() => 'mockedCombinedFormat'),
    colorize: vi.fn(() => 'mockedColorize'),
    timestamp: vi.fn(() => 'mockedTimestamp'),
    printf: vi.fn((formatter: (info: Record<string, string>) => string) => formatter),
    align: vi.fn(() => 'mockedAlign'),
  },
  transports: {
    Console: vi.fn(),
  },
  add: vi.fn(),
}));

describe('logger', () => {
  let mockCreateLogger: MockedFunction<() => typeof mockLogger>;
  let mockAdd: MockedFunction<(logger: typeof mockLogger) => void>;
  let mockFormat: {
    combine: MockedFunction<(...args: string[]) => string>;
    colorize: MockedFunction<() => string>;
    timestamp: MockedFunction<(options: { format: string }) => string>;
    printf: MockedFunction<
      (formatter: (info: Record<string, string>) => string) => (info: Record<string, string>) => string
    >;
    align: MockedFunction<() => string>;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    // Get the mocked winston module
    const winston = await import('winston');

    mockCreateLogger = vi.mocked(winston.createLogger);
    mockAdd = vi.mocked(winston.add);
    mockFormat = {
      combine: vi.mocked(winston.format.combine),
      colorize: vi.mocked(winston.format.colorize),
      timestamp: vi.mocked(winston.format.timestamp),
      printf: vi.mocked(winston.format.printf),
      align: vi.mocked(winston.format.align),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Logger initialization', () => {
    test('should create main logger with default settings', async () => {
      delete process.env['LOG_LEVEL'];

      // Import to trigger logger creation
      await import('../../../lib/common/logger');

      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultMeta: { mainLabel: 'accelerator' },
          level: 'info',
          format: 'mockedCombinedFormat',
          transports: [expect.any(Object)],
        }),
      );

      expect(mockFormat.combine).toHaveBeenCalledWith(
        'mockedColorize',
        'mockedTimestamp',
        expect.any(Function),
        'mockedAlign',
      );

      expect(mockFormat.timestamp).toHaveBeenCalledWith({
        format: 'YYYY-MM-DD HH:mm:ss.SSS',
      });
    });

    test('should use LOG_LEVEL environment variable if set', async () => {
      process.env['LOG_LEVEL'] = 'debug';

      await import('../../../lib/common/logger');

      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        }),
      );
    });

    test('should create status logger', async () => {
      await import('../../../lib/common/logger');

      // Verify winston.add is called (at least once for each logger)
      expect(mockAdd).toHaveBeenCalled();
    });

    test('should create main logger with correct format', async () => {
      await import('../../../lib/common/logger');

      // Get the printf formatter function
      const printfFormatter = mockFormat.printf.mock.calls[0][0];

      // Test the formatter with different inputs
      expect(
        printfFormatter({
          timestamp: '2023-05-20 10:00:00',
          level: 'info',
          message: 'Test message',
          mainLabel: 'Main',
          childLabel: '',
        }),
      ).toBe('2023-05-20 10:00:00 | info | Main | Test message');

      expect(
        printfFormatter({
          timestamp: '2023-05-20 10:00:00',
          level: 'error',
          message: 'Error message',
          mainLabel: 'Main',
          childLabel: 'Child',
        }),
      ).toBe('2023-05-20 10:00:00 | error | Child | Error message');
    });

    test('should create status logger with correct format', async () => {
      await import('../../../lib/common/logger');

      // Get the second printf formatter function (StatusLogger)
      const statusPrintfFormatter = mockFormat.printf.mock.calls[1][0];

      // Test the formatter - should show hardcoded "status" level and only childLabel
      expect(
        statusPrintfFormatter({
          timestamp: '2023-05-20 10:00:00',
          message: 'Status message',
          childLabel: 'module-name',
        }),
      ).toBe('2023-05-20 10:00:00 | status | module-name | Status message');
    });
  });

  describe('createLogger', () => {
    test('should create a child logger with the correct label', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test', 'child']);

      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'test | child',
      });

      // Test that logger methods are available
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.processStart).toBeDefined();
      expect(logger.processEnd).toBeDefined();
      expect(logger.dryRun).toBeDefined();
      expect(logger.commandExecution).toBeDefined();
      expect(logger.commandSuccess).toBeDefined();
    });

    test('should log info message with icon', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.info('Test message');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('ℹ️  Test message');
    });

    test('should log info message with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.info('Test message', 'Account1:us-east-1');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('[Account1:us-east-1] ℹ️  Test message');
    });

    test('should log warn message with icon', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.warn('Warning message');

      expect(mockLoggerMethods.warn).toHaveBeenCalledWith('⚠️  Warning message');
    });

    test('should log warn message with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.warn('Warning message', 'Account2:us-west-2');

      expect(mockLoggerMethods.warn).toHaveBeenCalledWith('[Account2:us-west-2] ⚠️  Warning message');
    });

    test('should log error message with icon', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.error('Error message');

      expect(mockLoggerMethods.error).toHaveBeenCalledWith('❌  Error message');
    });

    test('should log error message with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.error('Error message', 'Account3:eu-west-1');

      expect(mockLoggerMethods.error).toHaveBeenCalledWith('[Account3:eu-west-1] ❌  Error message');
    });

    test('should log process start message with icon', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.processStart('Starting process');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('🚀  Starting process');
    });

    test('should log process start message with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.processStart('Starting process', 'Batch1');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('[Batch1] 🚀  Starting process');
    });

    test('should log process end message with icon', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.processEnd('Process completed');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('✅  Process completed');
    });

    test('should log process end message with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.processEnd('Process completed', 'Batch2');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('[Batch2] ✅  Process completed');
    });

    test('should log dry run messages', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      const parameters = { accountId: '123456789012', region: 'us-east-1' };

      logger.dryRun('EnableMacieCommand', parameters);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('🔍  Dry run is true, so not executing EnableMacieCommand');
      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        '🔍  Would have executed EnableMacieCommand with arguments: {"accountId":"123456789012","region":"us-east-1"}',
      );
    });

    test('should log dry run messages with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      const parameters = { findingFrequency: 'FIFTEEN_MINUTES' };

      logger.dryRun('EnableMacieCommand', parameters, 'Account1:us-east-1');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        '[Account1:us-east-1] 🔍  Dry run is true, so not executing EnableMacieCommand',
      );
      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        '[Account1:us-east-1] 🔍  Would have executed EnableMacieCommand with arguments: {"findingFrequency":"FIFTEEN_MINUTES"}',
      );
    });

    test('should log command execution message', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      const parameters = { bucketName: 'test-bucket', region: 'us-west-2' };

      logger.commandExecution('CreateBucketCommand', parameters);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        'ℹ️  Executing CreateBucketCommand with arguments: {"bucketName":"test-bucket","region":"us-west-2"}',
      );
    });

    test('should log command execution message with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      const parameters = { tableName: 'test-table' };

      logger.commandExecution('CreateTableCommand', parameters, 'Account2:ap-southeast-1');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        '[Account2:ap-southeast-1] ℹ️  Executing CreateTableCommand with arguments: {"tableName":"test-table"}',
      );
    });

    test('should log command success message', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      const parameters = { roleArn: 'arn:aws:iam::123456789012:role/TestRole' };

      logger.commandSuccess('AssumeRoleCommand', parameters);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        'ℹ️  Successfully executed AssumeRoleCommand with arguments: {"roleArn":"arn:aws:iam::123456789012:role/TestRole"}',
      );
    });

    test('should log command success message with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      const parameters = { policyArn: 'arn:aws:iam::aws:policy/ReadOnlyAccess' };

      logger.commandSuccess('AttachPolicyCommand', parameters, 'Account3:eu-central-1');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        '[Account3:eu-central-1] ℹ️  Successfully executed AttachPolicyCommand with arguments: {"policyArn":"arn:aws:iam::aws:policy/ReadOnlyAccess"}',
      );
    });

    test('should handle single label', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      createLogger(['single']);

      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'single',
      });
    });

    test('should handle multiple labels', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      createLogger(['service', 'module', 'operation']);

      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'service | module | operation',
      });
    });
  });

  describe('createStatusLogger', () => {
    test('should create a child status logger with the correct label', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      createStatusLogger(['status', 'test']);

      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'status | test',
      });
    });

    test('should throw error when called with empty array', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      expect(() => createStatusLogger([])).toThrow('createStatusLogger requires at least one log info item');
    });

    test('should throw error when called with null', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      expect(() => createStatusLogger(null as unknown as string[])).toThrow(
        'createStatusLogger requires at least one log info item',
      );
    });

    test('should throw error when called with undefined', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      expect(() => createStatusLogger(undefined as unknown as string[])).toThrow(
        'createStatusLogger requires at least one log info item',
      );
    });

    test('should log status info message with icon', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      const statusLogger = createStatusLogger(['deployment']);
      statusLogger.info('Deployment completed');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('ℹ️  Deployment completed');
    });

    test('should log status warn message with icon', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      const statusLogger = createStatusLogger(['system']);
      statusLogger.warn('System warning');

      expect(mockLoggerMethods.warn).toHaveBeenCalledWith('⚠️  System warning');
    });

    test('should log status error message with icon', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      const statusLogger = createStatusLogger(['critical']);
      statusLogger.error('Critical error');

      expect(mockLoggerMethods.error).toHaveBeenCalledWith('❌  Critical error');
    });

    test('should log status process messages', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      const statusLogger = createStatusLogger(['module']);

      statusLogger.processStart('Module starting');
      statusLogger.processEnd('Module completed');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('🚀  Module starting');
      expect(mockLoggerMethods.info).toHaveBeenCalledWith('✅  Module completed');
    });

    test('should log status dry run messages', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      const statusLogger = createStatusLogger(['test']);
      const parameters = { testParam: 'value' };

      statusLogger.dryRun('TestCommand', parameters);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('🔍  Dry run is true, so not executing TestCommand');
      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        '🔍  Would have executed TestCommand with arguments: {"testParam":"value"}',
      );
    });

    test('should log status command execution and success', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      const statusLogger = createStatusLogger(['api']);
      const parameters = { apiVersion: '2023-01-01' };

      statusLogger.commandExecution('ApiCommand', parameters);
      statusLogger.commandSuccess('ApiCommand', parameters);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        'ℹ️  Executing ApiCommand with arguments: {"apiVersion":"2023-01-01"}',
      );
      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        'ℹ️  Successfully executed ApiCommand with arguments: {"apiVersion":"2023-01-01"}',
      );
    });

    test('should handle single status label', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      createStatusLogger(['deployment']);

      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'deployment',
      });
    });

    test('should handle multiple status labels', async () => {
      const { createStatusLogger } = await import('../../../lib/common/logger');
      createStatusLogger(['system', 'critical', 'alert']);

      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'system | critical | alert',
      });
    });
  });

  describe('logMessage helper function coverage', () => {
    test('should handle messages without prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.info('Simple message');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('ℹ️  Simple message');
    });

    test('should handle messages with prefix', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      logger.info('Prefixed message', 'TestPrefix');

      expect(mockLoggerMethods.info).toHaveBeenCalledWith('[TestPrefix] ℹ️  Prefixed message');
    });

    test('should handle complex parameter objects in commands', async () => {
      const { createLogger } = await import('../../../lib/common/logger');
      const logger = createLogger(['test']);
      const complexParams = {
        nested: { object: { with: 'values' } },
        array: [1, 2, 3],
        boolean: true,
        null: null,
        undefined: undefined,
      };

      logger.commandExecution('ComplexCommand', complexParams);

      expect(mockLoggerMethods.info).toHaveBeenCalledWith(
        'ℹ️  Executing ComplexCommand with arguments: {"nested":{"object":{"with":"values"}},"array":[1,2,3],"boolean":true,"null":null}',
      );
    });
  });
});
