import winston from 'winston';

function stringifyMeta(meta: Record<string, unknown>): string {
  const entries = Object.entries(meta).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return '';
  }

  try {
    return ` ${JSON.stringify(Object.fromEntries(entries))}`;
  } catch {
    return ' [meta-unserializable]';
  }
}

export const logger = winston.createLogger({
  level: 'info', // default log level
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const { level, message, timestamp, stack, ...meta } = info;
      const metaText = stringifyMeta(meta as Record<string, unknown>);
      const stackText = typeof stack === 'string' ? `\n${stack}` : '';

      return `${timestamp} [${level}]: ${message}${metaText}${stackText}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});
