import { setTimeout as delay } from "node:timers/promises";
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

export type ReimbursementOpenOptions = {
  profile?: string;
  headed?: boolean;
  timeoutMs?: number;
  debug?: boolean;
};

export type ReimbursementAppointmentsOptions = ReimbursementOpenOptions;

export async function reimbursementOpen(runId: string, options: ReimbursementOpenOptions): Promise<{
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
    const financePage = await openServiceCategory(taskHall, "财务");
    activePage = financePage.page;
    const financeScreenshot = await screenshotPage(financePage.page, paths.runArtifactDir, "step1-finance.png");

    const reimbursementPage = await openServiceEntry(
      financePage.page,
      ["智能报销"],
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    activePage = reimbursementPage.page;
    await waitForReimbursementHome(reimbursementPage.page, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const reimbursementScreenshot = await screenshotPage(
      reimbursementPage.page,
      paths.runArtifactDir,
      "step2-reimbursement.png"
    );

    const { bodyTextPreview, ...pageInfo } = await extractReimbursementHome(reimbursementPage.page);
    const renderStats = await getRenderStats(reimbursementPage.page);

    return {
      profile,
      data: {
        step: "reimbursement-home",
        pageTitle: await reimbursementPage.page.title().catch(() => ""),
        pageUrl: reimbursementPage.page.url(),
        categoryMatchedText: financePage.matchedText,
        entryMatchedText: reimbursementPage.matchedText,
        openedInNewPage: reimbursementPage.openedInNewPage,
        ...pageInfo,
        ...(options.debug ? { bodyTextPreview } : {}),
        ...taskHallMetadata(taskHall),
        renderStats,
        taskHallRenderStats: taskHall.renderStats
      },
      artifacts: {
        screenshot: reimbursementScreenshot,
        screenshots: {
          finance: financeScreenshot,
          reimbursement: reimbursementScreenshot
        }
      }
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REQUIRED") {
      throw error;
    }

    const currentUrl = activePage?.url() ?? taskHall?.session.page.url() ?? "";
    const screenshot = activePage
      ? await screenshotPage(activePage, paths.runArtifactDir, "reimbursement-open-error.png").catch(() => null)
      : null;
    const log = await writeLog(
      paths,
      `reimbursement open failed\nurl=${currentUrl}\nerror=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );

    throw new AppError(
      error instanceof AppError ? error.code : "UNEXPECTED_ERROR",
      error instanceof Error ? error.message : "Failed to open reimbursement page",
      error instanceof AppError ? error.detail : undefined,
      { log, screenshot }
    );
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

export async function reimbursementAppointments(runId: string, options: ReimbursementAppointmentsOptions): Promise<{
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
    const financePage = await openServiceCategory(taskHall, "财务");
    activePage = financePage.page;
    const financeScreenshot = await screenshotPage(financePage.page, paths.runArtifactDir, "step1-finance.png");

    const reimbursementPage = await openServiceEntry(
      financePage.page,
      ["智能报销"],
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    activePage = reimbursementPage.page;
    await waitForReimbursementHome(reimbursementPage.page, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const reimbursementScreenshot = await screenshotPage(
      reimbursementPage.page,
      paths.runArtifactDir,
      "step2-reimbursement.png"
    );

    const financeFrame = await openHistoryAppointments(reimbursementPage.page, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const historyScreenshot = await screenshotPage(
      reimbursementPage.page,
      paths.runArtifactDir,
      "step3-history-appointments.png"
    );
    const table = await extractHistoryAppointments(financeFrame);
    const renderStats = await getRenderStats(reimbursementPage.page);
    const bodyTextPreview = options.debug ? await collectFrameText(reimbursementPage.page) : "";

    return {
      profile,
      data: {
        step: "history-appointments",
        pageTitle: await reimbursementPage.page.title().catch(() => ""),
        pageUrl: reimbursementPage.page.url(),
        categoryMatchedText: financePage.matchedText,
        entryMatchedText: reimbursementPage.matchedText,
        openedInNewPage: reimbursementPage.openedInNewPage,
        ...table,
        ...(options.debug ? { bodyTextPreview: bodyTextPreview.slice(0, 1600) } : {}),
        ...taskHallMetadata(taskHall),
        renderStats,
        taskHallRenderStats: taskHall.renderStats
      },
      artifacts: {
        screenshot: historyScreenshot,
        screenshots: {
          finance: financeScreenshot,
          reimbursement: reimbursementScreenshot,
          historyAppointments: historyScreenshot
        }
      }
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "AUTH_REQUIRED") {
      throw error;
    }

    const currentUrl = activePage?.url() ?? taskHall?.session.page.url() ?? "";
    const screenshot = activePage
      ? await screenshotPage(activePage, paths.runArtifactDir, "reimbursement-appointments-error.png").catch(() => null)
      : null;
    const log = await writeLog(
      paths,
      `reimbursement appointments failed\nurl=${currentUrl}\nerror=${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
    );

    throw new AppError(
      error instanceof AppError ? error.code : "UNEXPECTED_ERROR",
      error instanceof Error ? error.message : "Failed to read reimbursement appointments",
      error instanceof AppError ? error.detail : undefined,
      { log, screenshot }
    );
  } finally {
    if (taskHall) {
      await closeTaskHall(taskHall);
    }
  }
}

async function extractReimbursementHome(page: Page): Promise<Record<string, unknown> & { bodyTextPreview: string }> {
  const bodyText = await collectFrameText(page);
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = unique(lines.filter((line) => [
    "申请报销",
    "我申请的",
    "我审批的",
    "票据管理",
    "校外人员信息维护",
    "历史助研预约单"
  ].includes(line)));

  const actionLabels = unique(lines.filter((line) => [
    "申请报销",
    "待审批",
    "已审批",
    "已退回",
    "退单待反馈",
    "历史预约单",
    "报销进度",
    "待我审批",
    "我已审批",
    "分享票据给他人",
    "分享票据历史记录",
    "发票查询",
    "校外人员信息维护"
  ].includes(line)));

  return {
    sections,
    actionLabels,
    hasHistoryAppointments: actionLabels.includes("历史预约单"),
    frameTextLength: bodyText.length,
    bodyTextPreview: bodyText.slice(0, 1200)
  };
}

async function openHistoryAppointments(page: Page, timeoutMs: number) {
  const frame = await findReimbursementFrame(page, timeoutMs);
  const card = frame.locator("#result12661").first();
  if ((await card.count()) > 0) {
    await card.click({ force: true, timeout: Math.min(timeoutMs, 10000) });
  } else {
    const fallback = frame.locator(".card").filter({ hasText: "历史预约单" }).first();
    if ((await fallback.count()) === 0) {
      throw new AppError("ENTRY_TARGET_NOT_FOUND", "Could not find 历史预约单 card");
    }

    await fallback.click({ force: true, timeout: Math.min(timeoutMs, 10000) });
  }

  await waitForHistoryAppointments(frame, timeoutMs);
  return frame;
}

async function waitForReimbursementHome(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + Math.min(timeoutMs, 20000);
  while (Date.now() < deadline) {
    const text = await collectFrameText(page);
    if (text.includes("历史预约单") || text.includes("申请报销")) {
      return;
    }

    await delay(500);
  }
}

async function findReimbursementFrame(page: Page, timeoutMs: number) {
  const deadline = Date.now() + Math.min(timeoutMs, 20000);
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().includes("WF_YB5_SHJD"));
    if (frame) {
      return frame;
    }

    await delay(500);
  }

  throw new AppError("ENTRY_TARGET_NOT_FOUND", "Could not find reimbursement content frame");
}

async function waitForHistoryAppointments(frame: Awaited<ReturnType<typeof findReimbursementFrame>>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + Math.min(timeoutMs, 20000);
  while (Date.now() < deadline) {
    const text = await frame.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    if (text.includes("预约单查询条件") && text.includes("预约号")) {
      return;
    }

    await delay(500);
  }

  throw new AppError("NAVIGATION_TIMEOUT", "Timed out waiting for history appointments table");
}

async function extractHistoryAppointments(frame: Awaited<ReturnType<typeof findReimbursementFrame>>): Promise<Record<string, unknown>> {
  return frame.evaluate(() => {
    const fieldMap: Record<string, string> = {
      "yta.req_no": "appointmentNo",
      "yta.b_type": "businessCategory",
      "yta.bu_operator": "applicant",
      "yta.uni_prj_code": "projectNo",
      "yta.remark": "summary",
      "yta.amount": "claimedAmount",
      "yta.cw_jamount": "reimbursedAmount",
      "yta.status": "status",
      "yta.apply_date": "applicationDate",
      "yta.account_date": "accountingDate",
      "yta.pz_unino": "voucherNo",
      "yta.maker": "appointmentMethod",
      "yta.msg": "financeMessage",
      "yta.has_bankfile": "hasBankFile"
    };

    const numericFields = new Set(["claimedAmount", "reimbursedAmount"]);
    const grid = document.querySelector("table.ui-jqgrid-btable");
    const header = document.querySelector("table.ui-jqgrid-htable");
    const pagerText = (document.querySelector(".ui-paging-info")?.textContent ?? document.body.innerText).trim();
    const columns = Array.from(header?.querySelectorAll("th[role='columnheader']") ?? [])
      .map((th) => (th.textContent ?? "").trim())
      .filter(Boolean);

    const records = Array.from(grid?.querySelectorAll("tr.jqgrow") ?? []).map((row, index) => {
      const record: Record<string, string | number | boolean | null> = {
        rowIndex: index + 1
      };

      for (const cell of Array.from(row.querySelectorAll("td[role='gridcell']"))) {
        const aria = cell.getAttribute("aria-describedby") ?? "";
        const suffix = Object.keys(fieldMap).find((field) => aria.endsWith(field));
        if (!suffix) {
          continue;
        }

        const key = fieldMap[suffix];
        const raw = (cell.getAttribute("title") ?? cell.textContent ?? "").trim();
        if (key === "hasBankFile") {
          record[key] = raw === "T";
        } else if (numericFields.has(key)) {
          record[key] = raw === "" ? null : Number(raw);
        } else {
          record[key] = raw;
        }
      }

      return record;
    });

    const totalMatch = pagerText.match(/共\s*(\d+)\s*条/);
    const pageMatch = document.body.innerText.match(/共\s*(\d+)\s*页/);

    return {
      columns,
      records,
      recordCount: records.length,
      totalCount: totalMatch ? Number(totalMatch[1]) : records.length,
      pageCount: pageMatch ? Number(pageMatch[1]) : null
    };
  });
}

async function collectFrameText(page: Page): Promise<string> {
  const texts = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.locator("body").innerText({ timeout: 2000 });
    } catch {
      return "";
    }
  }));

  return texts.filter(Boolean).join("\n");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
