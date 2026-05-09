import { promises as fs } from "node:fs";
import { DEFAULT_PROFILE, DEFAULT_TASK_URL, DEFAULT_TIMEOUT_MS, LOGIN_TIMEOUT_MS } from "../lib/constants.js";
import { AppError } from "../lib/errors.js";
import { safeScreenshot, writeLog } from "../lib/artifacts.js";
import { closeSession, launchProfileSession } from "../lib/browser.js";
import { restoreAuthState, saveAuthState } from "../lib/authState.js";
import { tryFillCredentials } from "../lib/credentials.js";
import { getAuthStatePath, getCommandPaths, getProfileDir, ensureRuntimeDirs } from "../lib/paths.js";
import { isLikelyLoginPage, isTaskPage } from "../lib/url.js";
import type { ArtifactMap } from "../lib/result.js";

export type AuthLoginOptions = {
  profile?: string;
  headed?: boolean;
  timeoutMs?: number;
  debugSensitiveArtifacts?: boolean;
};

export type AuthStatusOptions = {
  profile?: string;
  headed?: boolean;
  timeoutMs?: number;
};

export type AuthLogoutOptions = {
  profile?: string;
  yes?: boolean;
};

export async function authLogin(runId: string, options: AuthLoginOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);

  const profileDir = getProfileDir(profile);
  const session = await launchProfileSession({
    profileDir,
    headless: false,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });

  const artifacts: Partial<ArtifactMap> = {};

  try {
    process.stderr.write("JAccount browser opened. Complete login in the browser window if prompted.\n");
    await session.page.goto(DEFAULT_TASK_URL, { waitUntil: "domcontentloaded" });
    const credentialsFilled = await tryFillCredentials(session.page);
    if (credentialsFilled) {
      process.stderr.write("Filled likely username/password fields from environment. Complete any remaining verification manually.\n");
    }

    await session.page.waitForURL((url) => isTaskPage(url.toString()), {
      timeout: options.timeoutMs ?? LOGIN_TIMEOUT_MS
    });
    await session.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    const authStatePath = await saveAuthState(session.context, profile);

    const currentUrl = session.page.url();
    const title = await session.page.title().catch(() => "");
    return {
      profile,
      data: {
        loggedIn: true,
        currentUrl,
        title,
        profileDir,
        authStatePath,
        credentialsFilled
      },
      artifacts
    };
  } catch (error) {
    const currentUrl = session.page.url();
    const onLoginPage = isLikelyLoginPage(currentUrl);
    const screenshot = await safeScreenshot({
      page: session.page,
      paths,
      name: "auth-login-error",
      allowSensitive: Boolean(options.debugSensitiveArtifacts) && onLoginPage
    }).catch(() => null);
    if (screenshot) {
      artifacts.screenshot = screenshot;
    }

    artifacts.log = await writeLog(
      paths,
      `auth login failed\nurl=${currentUrl}\nerror=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );

    throw new AppError(
      "AUTH_TIMEOUT",
      "Timed out waiting for jAccount login to reach the task page",
      currentUrl,
      artifacts
    );
  } finally {
    await closeSession(session);
  }
}

export async function authStatus(runId: string, options: AuthStatusOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);

  const profileDir = getProfileDir(profile);
  const session = await launchProfileSession({
    profileDir,
    headless: !options.headed,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });

  try {
    const authState = await restoreAuthState(session.context, profile);
    await session.page.goto(DEFAULT_TASK_URL, { waitUntil: "domcontentloaded" });
    const currentUrl = session.page.url();
    const title = await session.page.title().catch(() => "");
    const loggedIn = isTaskPage(currentUrl) && !isLikelyLoginPage(currentUrl);

    return {
      profile,
      data: {
        loggedIn,
        currentUrl,
        title,
        profileDir,
        authStatePath: authState.statePath,
        authStateRestored: authState.restored
      },
      artifacts: {}
    };
  } finally {
    await closeSession(session);
  }
}

export async function authLogout(_runId: string, options: AuthLogoutOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  if (!options.yes) {
    throw new AppError("CONFIRMATION_REQUIRED", "Refusing to delete profile without --yes");
  }

  const profileDir = getProfileDir(profile);
  const authStatePath = getAuthStatePath(profile);
  await fs.rm(profileDir, { recursive: true, force: true });

  return {
    profile,
    data: {
      deleted: true,
      profileDir,
      authStatePath
    },
    artifacts: {}
  };
}
