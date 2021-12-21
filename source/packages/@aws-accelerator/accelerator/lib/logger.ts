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
  ],
});

if (process.env['NODE_ENV'] !== 'production') {
  Logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: timeFormat }),
        winston.format.align(),
        printf,
      ),
    }),
  );
}

winston.add(Logger);
