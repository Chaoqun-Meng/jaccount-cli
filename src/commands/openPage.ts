import path from "node:path";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { DEFAULT_TIMEOUT_MS } from "../lib/constants.js";
import { AppError } from "../lib/errors.js";
import { writeLog } from "../lib/artifacts.js";
import { getCommandPaths, ensureRuntimeDirs } from "../lib/paths.js";
import { validateHttpUrl } from "../lib/url.js";
import type { ArtifactMap } from "../lib/result.js";

export async function openPage(runId: string, options: {
  url: string;
  headed?: boolean;
  screenshot?: boolean;
  timeoutMs?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}): Promise<{
  profile: null;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);
  const url = validateHttpUrl(options.url);
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: !options.headed,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    await page.goto(url, { waitUntil: options.waitUntil ?? "domcontentloaded" });
    const title = await page.title();
    const screenshotPath = options.screenshot === false
      ? null
      : path.join(paths.runArtifactDir, "open-page.png");
    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    return {
      profile: null,
      data: {
        url: page.url(),
        title
      },
      artifacts: {
        screenshot: screenshotPath
      }
    };
  } catch (error) {
    const log = await writeLog(
      paths,
      `open-page failed\nurl=${url}\nerror=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );
    throw new AppError(
      "BROWSER_ERROR",
      error instanceof Error ? error.message : "Failed to open page",
      url,
      { log }
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
