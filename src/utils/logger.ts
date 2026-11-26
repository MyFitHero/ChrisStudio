import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'apiKey',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'FAL_KEY',
      'ELEVENLABS_API_KEY',
      'PEXELS_API_KEY',
      'secret',
      'token',
      'accessToken',
      'refreshToken'
    ],
    censor: '[REDACTED]'
  }
});

export const createRequestLogger = (requestId: string) => {
  return logger.child({ requestId });
};

export default logger;
