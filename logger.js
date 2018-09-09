const { createLogger, format, transports } = require('winston')
require('winston-daily-rotate-file');


const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.simple(),
    format.printf(nfo => {
      return `${nfo.timestamp} [${nfo.level}] : ${nfo.message}`;
    })
  ),
  exceptionHandlers: [
    new transports.File({ filename: 'logs/exceptions.log' })
  ],
  exitOnError: false,
  transports: [
    new transports.File({
      filename: 'logs/error.log', 
      level: 'error',
    }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp(),
        format.simple(),
        format.printf(nfo => {
          return `${nfo.timestamp} [${nfo.level}] : ${nfo.message}`;
        })
      )
    }),
    new transports.DailyRotateFile({
      filename: 'logs/TraderBirdBot-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'debug'
    })
  ]
});

module.exports = { logger };

