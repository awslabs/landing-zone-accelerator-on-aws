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

const printf = winston.format.printf(info => `[${info['timestamp']}] - ${info.level}: ${info.message}`);
const timeFormat = 'YYYY-MM-DD HH:mm:ss';

export const Logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'debug',
  format: winston.format.combine(winston.format.timestamp({ format: timeFormat }), winston.format.align(), printf),
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'combined.log',
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: timeFormat }),
        winston.format.align(),
        printf,
      ),
    }),
  ],
});

winston.add(Logger);
