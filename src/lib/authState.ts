import { promises as fs } from "node:fs";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { getAuthStatePath } from "./paths.js";

type OriginState = {
  origin: string;
  localStorage?: Array<{ name: string; value: string }>;
};

type SavedAuthState = {
  cookies?: Parameters<BrowserContext["addCookies"]>[0];
  origins?: OriginState[];
};

export async function saveAuthState(context: BrowserContext, profile: string): Promise<string> {
  const statePath = getAuthStatePath(profile);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await context.storageState({ path: statePath });
  return statePath;
}

export async function restoreAuthState(context: BrowserContext, profile: string): Promise<{
  restored: boolean;
  statePath: string;
}> {
  const statePath = getAuthStatePath(profile);
  const state = await readAuthState(statePath);
  if (!state) {
    return { restored: false, statePath };
  }

  if (state.cookies && state.cookies.length > 0) {
    await context.addCookies(state.cookies);
  }

  if (state.origins && state.origins.length > 0) {
    await context.addInitScript({
      content: `
        (() => {
          const origins = ${JSON.stringify(state.origins)};
          const matched = origins.find((origin) => origin.origin === window.location.origin);
          if (!matched || !matched.localStorage) return;
          for (const item of matched.localStorage) {
            window.localStorage.setItem(item.name, item.value);
          }
        })();
      `
    });
  }

  return { restored: true, statePath };
}

async function readAuthState(statePath: string): Promise<SavedAuthState | null> {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as SavedAuthState;
    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}
