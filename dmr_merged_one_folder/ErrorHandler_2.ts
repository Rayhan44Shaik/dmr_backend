import { logger } from '../logger/logger';

export class AppError extends Error {
  public code?: string;
  public status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export const handleError = (error: unknown): string => {
  if (error instanceof AppError) {
    logger.error(`[${error.code || 'APP_ERROR'}] ${error.message}`);
    return error.message;
  }
  if (error instanceof Error) {
    logger.error(error.message);
    return error.message;
  }
  logger.error('An unknown error occurred');
  return 'Something went wrong. Please try again.';
};