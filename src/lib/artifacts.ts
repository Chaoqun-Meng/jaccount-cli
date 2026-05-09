import { promises as fs } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import type { CommandPaths } from "./paths.js";

export async function writeLog(paths: CommandPaths, content: string): Promise<string> {
  await fs.writeFile(paths.runLogPath, content, "utf8");
  return paths.runLogPath;
}

export async function safeScreenshot(args: {
  page: Page;
  paths: CommandPaths;
  name: string;
  allowSensitive: boolean;
}): Promise<string | null> {
  if (!args.allowSensitive) {
    return null;
  }

  const screenshotPath = path.join(args.paths.runArtifactDir, `${args.name}.png`);
  await args.page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

export async function pageSnapshotData(page: Page): Promise<Record<string, unknown>> {
  return {
    currentUrl: page.url(),
    title: await page.title().catch(() => "")
  };
}
