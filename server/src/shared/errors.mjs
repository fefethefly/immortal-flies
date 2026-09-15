/** 可预期的业务错误 → RFC 9457。 */
export class AppError extends Error {
  constructor(code, status, detail, extras = {}) {
    super(detail || code);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = detail || code;
    this.extras = extras;
    this.isOperational = true;
  }
}

export function notFound(resource, id) {
  return new AppError("NOT_FOUND", 404, `${resource} not found: ${id}`);
}

export function unauthorized(detail = "Missing or invalid owner token") {
  return new AppError("UNAUTHORIZED", 401, detail);
}

export function conflict(code, detail) {
  return new AppError(code, 409, detail);
}

export function badRequest(code, detail) {
  return new AppError(code, 400, detail);
}

export function tooMany(detail = "Too many requests", extras = {}) {
  return new AppError("RATE_LIMITED", 429, detail, extras);
}

export function problemBody(err, requestId) {
  if (err instanceof AppError) {
    return {
      type: "about:blank",
      title: err.code,
      status: err.status,
      detail: err.detail,
      request_id: requestId,
      ...err.extras,
    };
  }
  return {
    type: "about:blank",
    title: "INTERNAL_ERROR",
    status: 500,
    detail: "Unexpected server error",
    request_id: requestId,
  };
}
