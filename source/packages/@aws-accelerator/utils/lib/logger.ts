/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as winston from 'winston';

const Logger = winston.createLogger({
  defaultMeta: { mainLabel: 'accelerator' },
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(({ message, timestamp, level, mainLabel, childLabel }) => {
      return `${timestamp} | ${level} | ${childLabel || mainLabel} | ${message}`;
    }),
    winston.format.align(),
  ),
  transports: [new winston.transports.Console()],
});

winston.add(Logger);

export const createLogger = (logInfo: string[]) => {
  const logInfoString = logInfo.join(' | ');
  return Logger.child({ childLabel: logInfoString });
};
