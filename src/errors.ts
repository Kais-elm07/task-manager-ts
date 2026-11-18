/**
 * Application errors. Every expected failure is an `AppError` with a machine-readable `code`,
 * so callers can tell expected failures (bad input, missing record) from real bugs.
 */

export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT';

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** The input is missing or malformed. */
export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

/** The requested record does not exist. */
export class NotFoundError extends AppError {
  constructor(entity: 'Task' | 'User', id: string) {
    super('NOT_FOUND', `${entity} with id "${id}" was not found`);
  }
}

/** The request is valid but clashes with the current state (duplicate email, task already done). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}

/** Type guard: narrows an unknown `catch` value to `AppError`. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
