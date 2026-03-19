import type { ErrorRequestHandler } from 'express';
import { logger } from 'config';
import { AppError } from '@/errors/AppError';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const message =
    error instanceof AppError ? error.message : 'Internal server error';

  logger.error('Request failed', {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    error: error instanceof Error ? error.message : String(error),
  });

  res.status(statusCode).json({ error: message });
};
