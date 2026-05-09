import { homedir } from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { AppError } from "./errors.js";

export type RuntimePaths = {
  home: string;
  profilesDir: string;
  artifactsDir: string;
  logsDir: string;
  tracesDir: string;
};

export type CommandPaths = RuntimePaths & {
  runArtifactDir: string;
  runLogPath: string;
  runTracePath: string;
};

export function getJaccountHome(env = process.env): string {
  return path.resolve(env.JACCOUNT_HOME ?? path.join(homedir(), ".jaccount-cli"));
}

export function sanitizeProfileName(profile: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(profile) || profile.includes("..")) {
    throw new AppError(
      "INVALID_INPUT",
      "Invalid profile name",
      "Profile names may only contain letters, numbers, dot, underscore, and dash."
    );
  }

  return profile;
}

export function getRuntimePaths(home = getJaccountHome()): RuntimePaths {
  const resolvedHome = path.resolve(home);
  return {
    home: resolvedHome,
    profilesDir: path.join(resolvedHome, "profiles"),
    artifactsDir: path.join(resolvedHome, "artifacts"),
    logsDir: path.join(resolvedHome, "logs"),
    tracesDir: path.join(resolvedHome, "traces")
  };
}

export function getProfileDir(profile: string, home = getJaccountHome()): string {
  const safeProfile = sanitizeProfileName(profile);
  return path.join(getRuntimePaths(home).profilesDir, safeProfile);
}

export function getAuthStatePath(profile: string, home = getJaccountHome()): string {
  return path.join(getProfileDir(profile, home), "auth-state.json");
}

export function getCommandPaths(runId: string, home = getJaccountHome()): CommandPaths {
  const runtime = getRuntimePaths(home);
  return {
    ...runtime,
    runArtifactDir: path.join(runtime.artifactsDir, runId),
    runLogPath: path.join(runtime.logsDir, `${runId}.log`),
    runTracePath: path.join(runtime.tracesDir, `${runId}.zip`)
  };
}

export async function ensureRuntimeDirs(paths: RuntimePaths | CommandPaths): Promise<void> {
  await Promise.all([
    fs.mkdir(paths.profilesDir, { recursive: true }),
    fs.mkdir(paths.artifactsDir, { recursive: true }),
    fs.mkdir(paths.logsDir, { recursive: true }),
    fs.mkdir(paths.tracesDir, { recursive: true }),
    "runArtifactDir" in paths ? fs.mkdir(paths.runArtifactDir, { recursive: true }) : Promise.resolve()
  ]);
}
