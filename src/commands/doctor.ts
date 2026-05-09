import { access, constants, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { DEFAULT_PROFILE } from "../lib/constants.js";
import { ensureRuntimeDirs, getCommandPaths, getJaccountHome, getProfileDir, getRuntimePaths } from "../lib/paths.js";

export async function doctor(runId: string, options: { profile?: string }): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Record<string, never>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const home = getJaccountHome();
  const runtimePaths = getRuntimePaths(home);
  const commandPaths = getCommandPaths(runId, home);
  await ensureRuntimeDirs(commandPaths);

  const tempWritePath = path.join(runtimePaths.logsDir, `.doctor-${process.pid}.tmp`);
  await writeFile(tempWritePath, "ok", "utf8");
  await rm(tempWritePath, { force: true });

  const executablePath = chromium.executablePath();
  const chromiumInstalled = await exists(executablePath);
  const profileDir = getProfileDir(profile, home);
  const profileExists = await exists(profileDir);

  return {
    profile,
    data: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      jaccountHome: home,
      runtimeWritable: true,
      chromiumExecutablePath: executablePath,
      chromiumInstalled,
      profileDir,
      profileExists
    },
    artifacts: {}
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
