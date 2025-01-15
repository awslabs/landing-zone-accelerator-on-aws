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
import { describe, beforeEach, expect, test } from '@jest/globals';

const originalEnv = process.env;

describe('Logger', () => {
  let mockCreateLogger: jest.Mock;
  let mockFormat: {
    combine: jest.Mock;
    colorize: jest.Mock;
    timestamp: jest.Mock;
    printf: jest.Mock;
    align: jest.Mock;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    mockCreateLogger = jest.fn(() => ({
      child: jest.fn(),
    }));

    mockFormat = {
      combine: jest.fn(() => 'mockedCombinedFormat'),
      colorize: jest.fn(() => 'mockedColorize'),
      timestamp: jest.fn(() => 'mockedTimestamp'),
      printf: jest.fn(formatter => formatter),
      align: jest.fn(() => 'mockedAlign'),
    };

    jest.mock('winston', () => ({
      createLogger: mockCreateLogger,
      format: mockFormat,
      transports: {
        Console: jest.fn(),
      },
      add: jest.fn(),
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should create a logger with default settings', () => {
    // Execute
    require('../../common/logger');

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

  test('should use LOG_LEVEL environment variable if set', () => {
    // Setup
    process.env['LOG_LEVEL'] = 'debug';

    // Execute
    require('../../common/logger');

    // Verify
    expect(mockCreateLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
      }),
    );

    // Clean up
    delete process.env['LOG_LEVEL'];
  });

  test('should create a logger with the correct format', () => {
    // Execute
    require('../../common/logger');

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

  describe('createLogger', () => {
    test('should create a child logger with the correct label', () => {
      // Setup
      const mockChild = jest.fn();
      mockCreateLogger.mockReturnValue({ child: mockChild });
      const { createLogger } = require('../../common/logger');

      // Execute
      createLogger(['test', 'child']);

      // Verify
      expect(mockChild).toHaveBeenCalledWith({
        childLabel: 'test | child',
      });
    });
  });
});
