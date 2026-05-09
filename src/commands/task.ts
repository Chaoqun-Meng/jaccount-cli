import path from "node:path";
import type { Locator, Page } from "playwright";
import { DEFAULT_PROFILE, DEFAULT_TIMEOUT_MS } from "../lib/constants.js";
import { AppError } from "../lib/errors.js";
import { writeLog } from "../lib/artifacts.js";
import { findEntry, loadEntryConfig, type EntryDefinition } from "../lib/entryConfig.js";
import { ensureRuntimeDirs, getCommandPaths } from "../lib/paths.js";
import { getRenderStats, waitForVisiblePageContent } from "../lib/pageReady.js";
import type { ArtifactMap } from "../lib/result.js";
import {
  closeTaskHall,
  listServiceCategories,
  openServiceCategory,
  openTaskHall,
  screenshotPage,
  searchVisibleText,
  taskHallMetadata,
  type TaskHallSession
} from "../lib/taskHall.js";

export type TaskOpenOptions = {
  profile?: string;
  headed?: boolean;
  timeoutMs?: number;
};

export type TaskEnterOptions = TaskOpenOptions & {
  entry: string;
};

export type TaskCategoriesOptions = TaskOpenOptions;

export type TaskSearchOptions = TaskOpenOptions & {
  keyword: string;
};

export type TaskCategoryOpenOptions = TaskOpenOptions & {
  name: string;
};

export async function taskOpen(runId: string, options: TaskOpenOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);
  let taskHall: TaskHallSession | null = null;

  try {
    taskHall = await openTaskHall(options);
    const page = taskHall.session.page;
    const screenshot = await screenshotPage(page, paths.runArtifactDir, "task-open.png");

    return {
      profile,
      data: {
        page: "task",
        currentUrl: page.url(),
        title: await page.title().catch(() => ""),
        ...taskHallMetadata(taskHall)
      },
      artifacts: { screenshot }
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REQUIRED") {
      throw error;
    }

    const currentUrl = taskHall?.session.page.url() ?? "";
    const screenshot = taskHall
      ? await screenshotPage(taskHall.session.page, paths.runArtifactDir, "task-open-error.png").catch(() => null)
      : null;
    const log = await writeLog(
      paths,
      `task open failed\nurl=${currentUrl}\nerror=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );

    throw new AppError(
      "NAVIGATION_TIMEOUT",
      "Failed to open task page",
      currentUrl,
      { log, screenshot }
    );
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

export async function taskEnter(runId: string, options: TaskEnterOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);

  const { key, entry } = findEntry(await loadEntryConfig(), options.entry);
  let taskHall: TaskHallSession | null = null;

  try {
    taskHall = await openTaskHall(options);
    const page = taskHall.session.page;

    const target = await findEntryTarget(page, entry);
    if (!target) {
      throw new AppError("ENTRY_TARGET_NOT_FOUND", "Entry target was not found on the task page", entry.name);
    }

    const beforeUrl = page.url();
    const popupPromise = taskHall.session.context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
    await target.click();
    const popup = await popupPromise;
    const activePage = popup ?? page;
    await activePage.waitForLoadState("domcontentloaded", { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS }).catch(() => undefined);
    const renderStats = await waitForVisiblePageContent(activePage, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    if (entry.expectedText) {
      await activePage.getByText(entry.expectedText).first().waitFor({ timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    }

    if (entry.urlContains && !activePage.url().includes(entry.urlContains)) {
      throw new AppError("ENTRY_TARGET_NOT_FOUND", "Entry opened but did not reach expected URL", entry.urlContains);
    }

    const screenshot = path.join(paths.runArtifactDir, `task-enter-${key}.png`);
    await activePage.screenshot({ path: screenshot, fullPage: true });

    return {
      profile,
      data: {
        entry: key,
        entryName: entry.name,
        beforeUrl,
        currentUrl: activePage.url(),
        title: await activePage.title().catch(() => ""),
        openedInNewPage: Boolean(popup),
        ...taskHallMetadata(taskHall),
        renderStats
      },
      artifacts: { screenshot }
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REQUIRED") {
      throw error;
    }

    const currentUrl = taskHall?.session.page.url() ?? "";
    const screenshot = taskHall
      ? await screenshotPage(taskHall.session.page, paths.runArtifactDir, "task-enter-error.png").catch(() => null)
      : null;
    const log = await writeLog(
      paths,
      `task enter failed\nentry=${options.entry}\nurl=${currentUrl}\nerror=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );

    throw new AppError(
      error instanceof AppError ? error.code : "UNEXPECTED_ERROR",
      error instanceof Error ? error.message : "Failed to enter task entry",
      error instanceof AppError ? error.detail : undefined,
      { log, screenshot }
    );
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

export async function taskCategories(runId: string, options: TaskCategoriesOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);
  let taskHall: TaskHallSession | null = null;

  try {
    taskHall = await openTaskHall(options);
    const categories = await listServiceCategories(taskHall.session.page);
    const screenshot = await screenshotPage(taskHall.session.page, paths.runArtifactDir, "task-categories.png");

    return {
      profile,
      data: {
        categories,
        count: categories.length,
        currentUrl: taskHall.session.page.url(),
        title: await taskHall.session.page.title().catch(() => ""),
        ...taskHallMetadata(taskHall)
      },
      artifacts: { screenshot }
    };
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

export async function taskSearch(runId: string, options: TaskSearchOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);
  let taskHall: TaskHallSession | null = null;

  try {
    taskHall = await openTaskHall(options);
    const matches = await searchVisibleText(taskHall.session.page, options.keyword);

    return {
      profile,
      data: {
        keyword: options.keyword,
        matches,
        count: matches.length,
        currentUrl: taskHall.session.page.url(),
        title: await taskHall.session.page.title().catch(() => ""),
        ...taskHallMetadata(taskHall)
      },
      artifacts: {}
    };
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

export async function taskCategoryOpen(runId: string, options: TaskCategoryOpenOptions): Promise<{
  profile: string;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);
  let taskHall: TaskHallSession | null = null;

  try {
    taskHall = await openTaskHall(options);
    const opened = await openServiceCategory(taskHall, options.name);
    const screenshot = await screenshotPage(opened.page, paths.runArtifactDir, "task-category-open.png");
    const renderStats = await getRenderStats(opened.page);

    return {
      profile,
      data: {
        category: options.name,
        matchedText: opened.matchedText,
        currentUrl: opened.page.url(),
        title: await opened.page.title().catch(() => ""),
        openedInNewPage: opened.openedInNewPage,
        ...taskHallMetadata(taskHall),
        renderStats,
        taskHallRenderStats: taskHall.renderStats
      },
      artifacts: { screenshot }
    };
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

async function findEntryTarget(page: Page, entry: EntryDefinition): Promise<Locator | null> {
  if (entry.selector) {
    const locator = page.locator(entry.selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  const matchText = entry.matchText ?? entry.name;
  const escapedText = escapeRegex(matchText);
  const roleCandidates = entry.role ? [entry.role] : ["link", "button", "menuitem", "tab"] as const;

  for (const role of roleCandidates) {
    const locator = page.getByRole(role, { name: new RegExp(escapedText, "i") }).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  const textLocator = page.getByText(new RegExp(escapedText, "i")).first();
  if ((await textLocator.count()) > 0) {
    return textLocator;
  }

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
