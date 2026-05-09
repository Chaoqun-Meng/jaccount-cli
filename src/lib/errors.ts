export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_TIMEOUT"
  | "BROWSER_ERROR"
  | "CONFIRMATION_REQUIRED"
  | "ENTRY_CONFIG_NOT_FOUND"
  | "ENTRY_NOT_FOUND"
  | "ENTRY_TARGET_NOT_FOUND"
  | "INVALID_INPUT"
  | "NAVIGATION_TIMEOUT"
  | "PLAYWRIGHT_NOT_READY"
  | "UNEXPECTED_ERROR";

export type ErrorArtifacts = Partial<{
  screenshot: string | null;
  log: string | null;
  trace: string | null;
}>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly detail?: string;
  readonly artifacts?: ErrorArtifacts;

  constructor(code: ErrorCode, message: string, detail?: string, artifacts?: ErrorArtifacts) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
    this.artifacts = artifacts;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError("UNEXPECTED_ERROR", error.message, error.stack);
  }

  return new AppError("UNEXPECTED_ERROR", "Unexpected non-error exception", String(error));
}
