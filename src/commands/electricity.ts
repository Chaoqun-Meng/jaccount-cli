import type { Page } from "playwright";
import { DEFAULT_PROFILE, DEFAULT_TIMEOUT_MS } from "../lib/constants.js";
import { AppError } from "../lib/errors.js";
import { writeLog } from "../lib/artifacts.js";
import { ensureRuntimeDirs, getCommandPaths } from "../lib/paths.js";
import { getRenderStats } from "../lib/pageReady.js";
import type { ArtifactMap } from "../lib/result.js";
import {
  closeTaskHall,
  openServiceCategory,
  openServiceEntry,
  openTaskHall,
  screenshotPage,
  taskHallMetadata,
  type TaskHallSession
} from "../lib/taskHall.js";

export type ElectricityOptions = {
  profile?: string;
  headed?: boolean;
  timeoutMs?: number;
  debug?: boolean;
};

export async function electricityBalance(runId: string, options: ElectricityOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);
  let taskHall: TaskHallSession | null = null;
  let activePage: Page | null = null;

  try {
    taskHall = await openTaskHall(options);
    const servicePage = await openServiceCategory(taskHall, "生活服务");
    activePage = servicePage.page;
    const step1Screenshot = await screenshotPage(servicePage.page, paths.runArtifactDir, "step1-life-services.png");

    const electricityPage = await openServiceEntry(
      servicePage.page,
      ["宿舍电费", "电费"],
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    activePage = electricityPage.page;
    const step2Screenshot = await screenshotPage(electricityPage.page, paths.runArtifactDir, "step2-electricity-page.png");
    const renderStats = await getRenderStats(electricityPage.page);

    // Try to extract balance information from the page
    const bodyText = await electricityPage.page.locator("body").innerText().catch(() => "");
    const pageTitle = await electricityPage.page.title().catch(() => "");
    const pageUrl = electricityPage.page.url();

    // Try to find balance-related numbers
    const balanceData = await extractElectricityBalance(electricityPage.page);

    return {
      profile,
      data: {
        step: "electricity-page",
        pageTitle,
        pageUrl,
        categoryMatchedText: servicePage.matchedText,
        entryMatchedText: electricityPage.matchedText,
        ...balanceData,
        ...(options.debug ? { bodyTextPreview: bodyText.slice(0, 1000) } : {}),
        ...taskHallMetadata(taskHall),
        renderStats,
        taskHallRenderStats: taskHall.renderStats
      },
      artifacts: {
        screenshot: step2Screenshot,
        screenshots: {
          lifeServices: step1Screenshot,
          electricityPage: step2Screenshot
        }
      }
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REQUIRED") {
      throw error;
    }

    const currentUrl = activePage?.url() ?? taskHall?.session.page.url() ?? "";
    const screenshot = activePage
      ? await screenshotPage(activePage, paths.runArtifactDir, "electricity-error.png").catch(() => null)
      : null;
    const log = await writeLog(
      paths,
      `electricity balance failed\nurl=${currentUrl}\nerror=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );

    throw new AppError(
      error instanceof AppError ? error.code : "UNEXPECTED_ERROR",
      error instanceof Error ? error.message : "Failed to query electricity balance",
      error instanceof AppError ? error.detail : undefined,
      { log, screenshot }
    );
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

async function extractElectricityBalance(page: Page): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  const bodyText = await page.locator("body").innerText().catch(() => "");

  // Extract room info (e.g., "北9楼1721")
  const roomMatch = bodyText.match(/([东南西北]\d+楼\d+)/);
  if (roomMatch) {
    result.room = roomMatch[1];
  }

  // Extract balance (e.g., "余额61.72 元" or "余额 61.72 元")
  const balanceMatch = bodyText.match(/余额\s*([\d.]+)\s*元/);
  if (balanceMatch) {
    result.balance = balanceMatch[1];
    result.balanceUnit = "元";
  }

  // Extract remaining kWh (e.g., "剩余度数:97.04度" or "剩余度数：97.04度")
  const remainingMatch = bodyText.match(/剩余度数[：:]\s*([\d.]+)\s*度/);
  if (remainingMatch) {
    result.remainingKwh = remainingMatch[1];
    result.remainingKwhUnit = "度";
  }

  // Extract monthly usage (e.g., "当月用电量：8.84度")
  const usageMatch = bodyText.match(/当月用电量[：:]\s*([\d.]+)\s*度/);
  if (usageMatch) {
    result.monthlyUsage = usageMatch[1];
    result.monthlyUsageUnit = "度";
  }

  return result;
}
