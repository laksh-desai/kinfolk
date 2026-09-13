/**
 * Typed errors. Services throw these; the Fastify error handler is the only place that
 * decides how they are presented. Messages are shown to end users — write them in plain
 * language, never a status code or a stack.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields?: Record<string, string>) {
    super(400, 'validation_failed', message, fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Your session has ended. Please sign in again.', code = 'unauthorized') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.", code = 'forbidden') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that.", code = 'not_found') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'conflict', fields?: Record<string, string>) {
    super(409, code, message, fields);
  }
}

export class GoneError extends AppError {
  constructor(message: string, code = 'gone') {
    super(410, code, message);
  }
}
