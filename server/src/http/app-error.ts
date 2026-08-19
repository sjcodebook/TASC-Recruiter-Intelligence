export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "AppError";
  }

  static notFound(message: string, code = "NOT_FOUND"): AppError {
    return new AppError(404, message, code);
  }

  static unprocessable(message: string, code = "UNPROCESSABLE_REQUEST"): AppError {
    return new AppError(422, message, code);
  }

  static conflict(message: string, code = "CONFLICT"): AppError {
    return new AppError(409, message, code);
  }
}
