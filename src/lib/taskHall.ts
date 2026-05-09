import path from "node:path";
import type { BrowserContext, Locator, Page } from "playwright";
import { DEFAULT_PROFILE, DEFAULT_TASK_URL, DEFAULT_TIMEOUT_MS } from "./constants.js";
import { AppError } from "./errors.js";
import { restoreAuthState } from "./authState.js";
import { closeSession, launchProfileSession, type BrowserSession } from "./browser.js";
import { getProfileDir } from "./paths.js";
import { waitForVisiblePageContent, type RenderStats } from "./pageReady.js";
import { isLikelyLoginPage, isTaskPage } from "./url.js";

export type TaskHallSession = {
  profile: string;
  profileDir: string;
  session: BrowserSession;
  authStatePath: string;
  authStateRestored: boolean;
  renderStats: RenderStats;
  timeoutMs: number;
};

export type TaskHallOptions = {
  profile?: string;
  headed?: boolean;
  timeoutMs?: number;
};

export type OpenedPage = {
  page: Page;
  openedInNewPage: boolean;
  matchedText: string;
};

type VisibleTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const TASK_HALL_EXCLUDED_LABELS = new Set([
  "办事",
  "应用",
  "日程",
  "消息",
  "AI 应用专区",
  "服务大厅",
  "待办事项",
  "已办事项",
  "抄送事项",
  "我的收藏",
  "最近使用",
  "我的信息资源",
  "更换头像",
  "EN",
  "关注我们",
  "交我办APP",
  "联系我们",
  "隐私保护",
  "开发者平台",
  "关注我们交我办APP"
]);

export async function openTaskHall(options: TaskHallOptions): Promise<TaskHallSession> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const profileDir = getProfileDir(profile);
  const session = await launchProfileSession({
    profileDir,
    headless: !options.headed,
    timeoutMs
  });

  const authState = await restoreAuthState(session.context, profile);
  await session.page.goto(DEFAULT_TASK_URL, { waitUntil: "domcontentloaded" });
  const currentUrl = session.page.url();

  if (!isTaskPage(currentUrl) || isLikelyLoginPage(currentUrl)) {
    await closeSession(session);
    throw new AppError("AUTH_REQUIRED", "Profile is not logged in", currentUrl);
  }

  const renderStats = await waitForVisiblePageContent(session.page, timeoutMs);

  return {
    profile,
    profileDir,
    session,
    authStatePath: authState.statePath,
    authStateRestored: authState.restored,
    renderStats,
    timeoutMs
  };
}

export async function closeTaskHall(taskHall: TaskHallSession): Promise<void> {
  await closeSession(taskHall.session);
}

export function taskHallMetadata(taskHall: TaskHallSession): Record<string, unknown> {
  return {
    profileDir: taskHall.profileDir,
    authStatePath: taskHall.authStatePath,
    authStateRestored: taskHall.authStateRestored,
    renderStats: taskHall.renderStats
  };
}

export async function listServiceCategories(page: Page): Promise<string[]> {
  const items = await getVisibleTextItems(page);
  const viewportHeight = page.viewportSize()?.height ?? Number.POSITIVE_INFINITY;
  const contentBottom = viewportHeight - 120;
  return dedupe(items
    .filter((item) => item.x > 80 && item.y > 220 && item.y < contentBottom)
    .map((item) => normalizeLabel(item.text))
    .filter(isLikelyServiceCategory));
}

export async function searchVisibleText(page: Page, keyword: string): Promise<string[]> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    throw new AppError("INVALID_INPUT", "Search keyword is required");
  }

  const items = await getVisibleTextItems(page);
  return dedupe(items
    .map((item) => normalizeLabel(item.text))
    .filter((text) => text.includes(normalizedKeyword)));
}

export async function openServiceCategory(taskHall: TaskHallSession, categoryName: string): Promise<OpenedPage> {
  return clickTextOpeningMaybeNewPage(
    taskHall.session.context,
    taskHall.session.page,
    [categoryName],
    taskHall.timeoutMs
  );
}

export async function openServiceEntry(page: Page, candidates: string[], timeoutMs: number): Promise<OpenedPage> {
  const cleanedCandidates = candidates.map((candidate) => candidate.trim()).filter(Boolean);
  if (cleanedCandidates.length === 0) {
    throw new AppError("INVALID_INPUT", "At least one service entry candidate is required");
  }

  return clickTextOpeningMaybeNewPage(page.context(), page, cleanedCandidates, timeoutMs);
}

export async function screenshotPage(page: Page, artifactDir: string, filename: string): Promise<string> {
  const screenshot = path.join(artifactDir, filename);
  await page.screenshot({ path: screenshot, fullPage: true });
  return screenshot;
}

async function clickTextOpeningMaybeNewPage(
  context: BrowserContext,
  page: Page,
  candidates: string[],
  timeoutMs: number
): Promise<OpenedPage> {
  for (const candidate of candidates) {
    const target = await findVisibleTextTarget(page, candidate);
    if (!target) {
      continue;
    }

    await target.waitFor({ state: "visible", timeout: Math.min(timeoutMs, 10000) });
    const popupPromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
    await target.click();
    const popup = await popupPromise;
    const openedPage = popup ?? page;
    await openedPage.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    await waitForVisiblePageContent(openedPage, timeoutMs);

    return {
      page: openedPage,
      openedInNewPage: Boolean(popup),
      matchedText: candidate
    };
  }

  throw new AppError("ENTRY_TARGET_NOT_FOUND", "Could not find service entry", candidates.join(", "));
}

async function findVisibleTextTarget(page: Page, text: string): Promise<Locator | null> {
  const exact = page.getByText(text, { exact: true }).first();
  if ((await exact.count()) > 0) {
    return exact;
  }

  const contains = page.getByText(text).first();
  if ((await contains.count()) > 0) {
    return contains;
  }

  const regex = page.locator(`text=/${escapeRegex(text)}/`).first();
  if ((await regex.count()) > 0) {
    return regex;
  }

  return null;
}

async function getVisibleTextItems(page: Page): Promise<VisibleTextItem[]> {
  return page.evaluate(() => {
    const items: VisibleTextItem[] = [];
    const elements = Array.from(document.querySelectorAll("a,button,[role=button],[role=tab],li,span,p,div"));

    for (const element of elements) {
      const text = (element.textContent ?? "").trim().replace(/\s+/g, " ");
      if (!text || text.length > 40) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 1 || rect.height <= 1 || style.display === "none" || style.visibility === "hidden") {
        continue;
      }

      items.push({
        text,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      });
    }

    return items;
  });
}

function normalizeLabel(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function isLikelyServiceCategory(text: string): boolean {
  if (!/^[\u4e00-\u9fa5A-Za-z0-9 ]{2,12}$/.test(text)) {
    return false;
  }

  if (TASK_HALL_EXCLUDED_LABELS.has(text) || /\d/.test(text)) {
    return false;
  }

  return true;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
