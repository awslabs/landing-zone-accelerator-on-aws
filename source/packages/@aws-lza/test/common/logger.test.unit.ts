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
import { describe, beforeEach, expect, test, afterAll, vi, type Mock } from 'vitest';

const originalEnv = process.env;

// Mock winston at the top level
vi.mock('winston', () => ({
  createLogger: vi.fn(),
  format: {
    combine: vi.fn(),
    colorize: vi.fn(),
    timestamp: vi.fn(),
    printf: vi.fn(),
    align: vi.fn(),
  },
  transports: {
    Console: vi.fn(),
  },
  add: vi.fn(),
}));

describe('LoggerUtil', () => {
  let mockCreateLogger: Mock;
  let mockAdd: Mock;
  let mockFormat: {
    combine: Mock;
    colorize: Mock;
    timestamp: Mock;
    printf: Mock;
    align: Mock;
  };

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };

    // Get the mocked winston module
    const winston = await import('winston');

    mockCreateLogger = vi.fn(() => ({
      child: vi.fn(),
    }));

    mockAdd = vi.fn();

    mockFormat = {
      combine: vi.fn(() => 'mockedCombinedFormat'),
      colorize: vi.fn(() => 'mockedColorize'),
      timestamp: vi.fn(() => 'mockedTimestamp'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      printf: vi.fn((formatter: any) => formatter),
      align: vi.fn(() => 'mockedAlign'),
    };

    // Set up the mock implementations
    vi.mocked(winston.createLogger).mockImplementation(mockCreateLogger);
    vi.mocked(winston.add).mockImplementation(mockAdd);
    vi.mocked(winston.format.combine).mockImplementation(mockFormat.combine);
    vi.mocked(winston.format.colorize).mockImplementation(mockFormat.colorize);
    vi.mocked(winston.format.timestamp).mockImplementation(mockFormat.timestamp);
    vi.mocked(winston.format.printf).mockImplementation(mockFormat.printf);
    vi.mocked(winston.format.align).mockImplementation(mockFormat.align);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Logger', () => {
    test('should create a logger with default settings', async () => {
      delete process.env['LOG_LEVEL'];
      // Execute
      await import('../../common/logger');

      // Verify
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultMeta: { mainLabel: 'accelerator' },
          level: 'info',
          format: 'mockedCombinedFormat',
          transports: [expect.any(Object)],
        }),
      );

      // Verify format configuration
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
      // Setup
      process.env['LOG_LEVEL'] = 'debug';

      // Execute
      await import('../../common/logger');

      // Verify
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        }),
      );

      // Clean up
      delete process.env['LOG_LEVEL'];
    });

    test('should create a logger with the correct format', async () => {
      // Execute
      await import('../../common/logger');

      // Get the printf formatter function
      const printfFormatter = mockFormat.printf.mock.calls[0][0];

      // Test the formatter with different inputs
      expect(
        printfFormatter({
          timestamp: '2023-05-20 10:00:00',
          level: 'info',
          message: 'Test message',
          mainLabel: 'Main',
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
  });

  describe('createLogger', () => {
    test('should create a child logger with the correct label', async () => {
      // Setup
      const mockChild = vi.fn();
      mockCreateLogger.mockReturnValue({ child: mockChild });
      const { createLogger } = await import('../../common/logger');

      // Execute
      createLogger(['test', 'child']);

      // Verify
      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'test | child',
      });
    });
  });

  describe('StatusLogger', () => {
    test('should create and add status logger', async () => {
      // Execute
      await import('../../common/logger');

      // Verify winston.add is called twice (Logger and StatusLogger)
      expect(mockAdd).toHaveBeenCalledTimes(2);
    });

    test('should create status logger without defaultMeta', async () => {
      // Execute
      await import('../../common/logger');

      // Verify StatusLogger (second call) doesn't have defaultMeta
      expect(mockCreateLogger).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          level: 'info',
          format: 'mockedCombinedFormat',
        }),
      );
    });

    test('should create status logger with correct format', async () => {
      // Execute
      await import('../../common/logger');

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

  describe('createStatusLogger', () => {
    test('should create a child status logger with the correct label', async () => {
      // Setup
      const mockChild = vi.fn();
      mockCreateLogger.mockReturnValue({ child: mockChild });
      const { createStatusLogger } = await import('../../common/logger');

      // Execute
      createStatusLogger(['status', 'test']);

      // Verify
      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'status | test',
      });
    });

    test('should throw error when called with empty or null array', async () => {
      const { createStatusLogger } = await import('../../common/logger');

      expect(() => createStatusLogger([])).toThrow('createStatusLogger requires at least one log info item');
      expect(() => createStatusLogger(null)).toThrow('createStatusLogger requires at least one log info item');
    });
  });
});
