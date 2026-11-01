export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (message = "Invalid request", details?: unknown) => new AppError(400, "BAD_REQUEST", message, details),
  validation: (details: unknown, message = "Validation failed") => new AppError(422, "VALIDATION_ERROR", message, details),
  unauthorized: (message = "Authentication required") => new AppError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You do not have permission to perform this action") => new AppError(403, "FORBIDDEN", message),
  notFound: (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`),
  conflict: (message: string, details?: unknown) => new AppError(409, "CONFLICT", message, details),
  business: (code: string, message: string, details?: unknown) => new AppError(422, code, message, details),
  tooMany: (message = "Too many requests. Please try again later.") => new AppError(429, "RATE_LIMITED", message),
};

