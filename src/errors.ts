export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request") {
    super(message, 400, "INVALID_REQUEST");
  }
}

export class InvalidUrlError extends AppError {
  constructor(message = "Valid http/https URL required") {
    super(message, 400, "INVALID_URL");
  }
}

export class InvalidCursorError extends AppError {
  constructor(message = "Malformed cursor") {
    super(message, 400, "INVALID_CURSOR");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Short URL not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class CodeExhaustedError extends AppError {
  constructor(message = "Failed to generate unique short code") {
    super(message, 503, "CODE_EXHAUSTED");
  }
}
