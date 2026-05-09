import { SCHEMA_VERSION } from "./constants.js";
import { AppError, toAppError } from "./errors.js";

export type ArtifactMap = {
  screenshot: string | null;
  log: string | null;
  trace: string | null;
  screenshots?: Record<string, string>;
  qrCode?: string | null;
};

export type CommandResult<TData extends Record<string, unknown> = Record<string, unknown>> = {
  schemaVersion: typeof SCHEMA_VERSION;
  ok: boolean;
  command: string;
  runId: string;
  profile: string | null;
  data: TData;
  artifacts: ArtifactMap;
  error: null | {
    code: string;
    message: string;
    detail?: string;
  };
};

export function emptyArtifacts(): ArtifactMap {
  return {
    screenshot: null,
    log: null,
    trace: null
  };
}

export function successResult<TData extends Record<string, unknown>>(args: {
  command: string;
  runId: string;
  profile?: string | null;
  data: TData;
  artifacts?: Partial<ArtifactMap>;
}): CommandResult<TData> {
  return {
    schemaVersion: SCHEMA_VERSION,
    ok: true,
    command: args.command,
    runId: args.runId,
    profile: args.profile ?? null,
    data: args.data,
    artifacts: {
      ...emptyArtifacts(),
      ...args.artifacts
    },
    error: null
  };
}

export function failureResult(args: {
  command: string;
  runId: string;
  profile?: string | null;
  error: unknown;
  data?: Record<string, unknown>;
  artifacts?: Partial<ArtifactMap>;
}): CommandResult {
  const appError = args.error instanceof AppError ? args.error : toAppError(args.error);

  return {
    schemaVersion: SCHEMA_VERSION,
    ok: false,
    command: args.command,
    runId: args.runId,
    profile: args.profile ?? null,
    data: args.data ?? {},
    artifacts: {
      ...emptyArtifacts(),
      ...appError.artifacts,
      ...args.artifacts
    },
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.detail ? { detail: appError.detail } : {})
    }
  };
}

export function writeResult(result: CommandResult): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
