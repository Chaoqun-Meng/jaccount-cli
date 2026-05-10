import { promises as fs } from "node:fs";
import path from "node:path";
import type { ElementHandle, Page } from "playwright";
import { DEFAULT_PROFILE, DEFAULT_TASK_URL, DEFAULT_TIMEOUT_MS, LOGIN_TIMEOUT_MS } from "../lib/constants.js";
import { AppError } from "../lib/errors.js";
import { safeScreenshot, writeLog } from "../lib/artifacts.js";
import { closeSession, launchProfileSession } from "../lib/browser.js";
import { restoreAuthState, saveAuthState } from "../lib/authState.js";
import { tryFillCredentials } from "../lib/credentials.js";
import { getAuthStatePath, getCommandPaths, getProfileDir, ensureRuntimeDirs, type CommandPaths } from "../lib/paths.js";
import { isLikelyLoginPage, isTaskPage } from "../lib/url.js";
import type { ArtifactMap } from "../lib/result.js";
import { writeQrPngToStderr } from "../lib/terminalQr.js";

export const LOGIN_METHODS = ["qr", "manual", "password"] as const;
export type LoginMethod = typeof LOGIN_METHODS[number];

const QR_CAPTURE_TIMEOUT_MS = 15000;

export type AuthLoginOptions = {
  profile?: string;
  method?: string;
  headed?: boolean;
  timeoutMs?: number;
  debugSensitiveArtifacts?: boolean;
  showQr?: boolean;
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
  const loginMethod = normalizeLoginMethod(options.method);
  const paths = getCommandPaths(runId);
  await ensureRuntimeDirs(paths);

  const profileDir = getProfileDir(profile);
  const session = await launchProfileSession({
    profileDir,
    headless: loginMethod === "qr" ? !options.headed : false,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });

  const artifacts: Partial<ArtifactMap> = {};
  let credentialsFilled = false;

  try {
    if (loginMethod === "qr") {
      process.stderr.write("JAccount QR login started. The browser may run headless; scan the terminal QR code or saved image when prompted.\n");
    } else {
      process.stderr.write("JAccount browser opened. Complete jAccount verification in the browser window if prompted.\n");
    }

    await session.page.goto(DEFAULT_TASK_URL, { waitUntil: "domcontentloaded" });
    await session.page.waitForLoadState("domcontentloaded").catch(() => undefined);

    if (!isTaskPage(session.page.url()) && loginMethod === "qr") {
      const qrCodePath = await prepareQrLogin(session.page, paths);
      artifacts.qrCode = qrCodePath;
      process.stderr.write("JAccount QR code saved to: " + qrCodePath + "\n");
      const terminalQrResult = await writeQrPngToStderr({ imagePath: qrCodePath, enabled: options.showQr !== false });
      if (terminalQrResult.displayed) {
        process.stderr.write("JAccount QR code rendered in the terminal.\n");
      } else {
        process.stderr.write("Terminal QR rendering skipped: " + terminalQrResult.reason + ". Open the image path above if needed.\n");
      }
      process.stderr.write("Scan it before it expires. Waiting for jAccount to return to the task page...\n");
    }

    if (!isTaskPage(session.page.url()) && loginMethod === "password") {
      credentialsFilled = await tryFillCredentials(session.page);
      if (credentialsFilled) {
        process.stderr.write("Filled likely username/password fields from environment. Complete any remaining verification manually.\n");
      }
    }

    await waitForTaskPage(session.page, options.timeoutMs ?? LOGIN_TIMEOUT_MS);
    await session.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    const authStatePath = await saveAuthState(session.context, profile);

    const currentUrl = session.page.url();
    const title = await session.page.title().catch(() => "");
    return {
      profile,
      data: {
        loggedIn: true,
        loginMethod,
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
      "auth login failed\nmethod=" + loginMethod + "\nurl=" + currentUrl + "\nerror=" + (error instanceof Error ? error.stack ?? error.message : String(error)) + "\n"
    );

    if (error instanceof AppError) {
      throw new AppError(error.code, error.message, error.detail ?? currentUrl, {
        ...error.artifacts,
        ...artifacts
      });
    }

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

export function normalizeLoginMethod(method: string | undefined): LoginMethod {
  const normalized = method?.trim().toLowerCase() || "qr";
  if (normalized === "qr" || normalized === "manual" || normalized === "password") {
    return normalized;
  }

  throw new AppError(
    "INVALID_INPUT",
    "Invalid login method",
    "Expected one of: " + LOGIN_METHODS.join(", ")
  );
}

async function waitForTaskPage(page: Page, timeoutMs: number): Promise<void> {
  if (isTaskPage(page.url())) {
    return;
  }

  await page.waitForURL((url) => isTaskPage(url.toString()), { timeout: timeoutMs });
}

async function prepareQrLogin(page: Page, paths: CommandPaths): Promise<string> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await activateQrLogin(page);

  const qrCodePath = path.join(paths.runArtifactDir, "login-qr.png");
  const directImageSaved = await saveKnownQrImage(page, qrCodePath);
  if (directImageSaved) {
    return qrCodePath;
  }

  const candidate = await waitForQrCandidate(page, QR_CAPTURE_TIMEOUT_MS);
  const viewport = page.viewportSize() ?? { width: 1440, height: 1000 };
  const clip = expandClip(candidate, viewport, 12);
  await page.screenshot({ path: qrCodePath, clip });
  return qrCodePath;
}

async function saveKnownQrImage(page: Page, qrCodePath: string): Promise<boolean> {
  const handle = await getKnownQrImageHandle(page);
  if (!handle) {
    return false;
  }

  const src = await handle.getAttribute("src");
  if (!src) {
    await handle.dispose();
    return false;
  }

  try {
    const imageUrl = new URL(src, page.url()).toString();
    const response = await page.request.get(imageUrl, {
      headers: {
        referer: page.url()
      },
      timeout: QR_CAPTURE_TIMEOUT_MS
    });

    if (!response.ok()) {
      return false;
    }

    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.toLowerCase().includes("image")) {
      return false;
    }

    const body = await response.body();
    await fs.writeFile(qrCodePath, body);
    return true;
  } finally {
    await handle.dispose();
  }
}

async function getKnownQrImageHandle(page: Page): Promise<ElementHandle<HTMLElement> | null> {
  const selectors = ["#qr-img", "#qr-mask img", "img[src*='qrcode']", "img[src*='qr']"];
  for (const selector of selectors) {
    const handle = await page.$(selector);
    if (!handle) {
      continue;
    }

    const visible = await handle.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const ratio = rect.width / rect.height;
      return rect.width >= 80 &&
        rect.height >= 80 &&
        ratio >= 0.72 &&
        ratio <= 1.38 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0;
    }).catch(() => false);

    if (visible) {
      return handle as ElementHandle<HTMLElement>;
    }

    await handle.dispose();
  }

  return null;
}

type QrCandidate = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  tag: string;
};

async function activateQrLogin(page: Page): Promise<void> {
  if (await readQrCandidate(page)) {
    return;
  }

  if (await clickQrIconTrigger(page)) {
    await page.waitForTimeout(700);
    if (await readQrCandidate(page)) {
      return;
    }
  }

  const triggers = [
    page.getByRole("tab", { name: /扫码|二维码|扫一扫|QR|My SJTU/i }),
    page.getByRole("button", { name: /扫码|二维码|扫一扫|QR|My SJTU/i }),
    page.getByRole("link", { name: /扫码|二维码|扫一扫|QR|My SJTU/i }),
    page.getByText(/扫码登录|二维码登录|扫码|二维码|扫一扫|My SJTU/i)
  ];

  for (const trigger of triggers) {
    const count = Math.min(await trigger.count().catch(() => 0), 5);
    for (let index = 0; index < count; index += 1) {
      const item = trigger.nth(index);
      if (!(await item.isVisible().catch(() => false))) {
        continue;
      }

      await item.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      if (await readQrCandidate(page)) {
        return;
      }
    }
  }
}

async function clickQrIconTrigger(page: Page): Promise<boolean> {
  const trigger = await readQrTriggerCandidate(page);
  if (!trigger) {
    return false;
  }

  await page.mouse.click(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
  return true;
}

async function waitForQrCandidate(page: Page, timeoutMs: number): Promise<QrCandidate> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidate = await readQrCandidate(page);
    if (candidate) {
      return candidate;
    }

    await page.waitForTimeout(500);
  }

  throw new AppError(
    "QR_CODE_NOT_FOUND",
    "Could not find a visible jAccount QR code on the login page",
    page.url()
  );
}

async function readQrTriggerCandidate(page: Page): Promise<QrCandidate | null> {
  return readQrCandidateByMode(page, "trigger");
}

async function readQrCandidate(page: Page): Promise<QrCandidate | null> {
  return readQrCandidateByMode(page, "code");
}

async function readQrCandidateByMode(page: Page, mode: "code" | "trigger"): Promise<QrCandidate | null> {
  return page.evaluate((candidateMode) => {
    type BrowserQrCandidate = {
      x: number;
      y: number;
      width: number;
      height: number;
      score: number;
      tag: string;
    };

    function isVisibleQrElement(rect: DOMRect, style: CSSStyleDeclaration): boolean {
      return !(
        rect.width < 24 ||
        rect.height < 24 ||
        rect.width > 520 ||
        rect.height > 520 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      );
    }

    function isSquareLike(width: number, height: number): boolean {
      const ratio = width / height;
      return ratio >= 0.72 && ratio <= 1.38;
    }

    function qrEvidence(element: HTMLElement, style: CSSStyleDeclaration): string {
      const parts: string[] = [];
      let current: HTMLElement | null = element;

      for (let depth = 0; current && depth < 4; depth += 1) {
        const currentStyle = window.getComputedStyle(current);
        parts.push(
          current.tagName,
          current.id,
          typeof current.className === "string" ? current.className : "",
          current.getAttribute("aria-label") ?? "",
          current.getAttribute("title") ?? "",
          current.getAttribute("alt") ?? "",
          current.getAttribute("data-type") ?? "",
          current.getAttribute("data-mode") ?? "",
          current.getAttribute("href") ?? "",
          current instanceof HTMLImageElement ? current.currentSrc || current.src : "",
          currentStyle.backgroundImage ?? "",
          (current.textContent ?? "").slice(0, 160)
        );
        current = current.parentElement;
      }

      const previousText = element.previousElementSibling?.textContent ?? "";
      const nextText = element.nextElementSibling?.textContent ?? "";
      parts.push(previousText.slice(0, 120), nextText.slice(0, 120), style.backgroundImage ?? "");

      return parts.join(" ").replace(/\s+/g, " ").toLowerCase();
    }

    function knownQrCandidate(): BrowserQrCandidate | null {
      if (candidateMode !== "code") {
        return null;
      }

      const selectors = ["#qr-img", "#qr-mask img", "img[src*='qrcode']", "img[src*='qr']"];
      for (const selector of selectors) {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (!isVisibleQrElement(rect, style) || !isSquareLike(rect.width, rect.height)) {
          continue;
        }

        return {
          x: Math.max(0, rect.x),
          y: Math.max(0, rect.y),
          width: rect.width,
          height: rect.height,
          score: 10000,
          tag: element.tagName.toLowerCase()
        };
      }

      return null;
    }

    function findBestQrCandidate(): BrowserQrCandidate | null {
      const known = knownQrCandidate();
      if (known) {
        return known;
      }

      const elements = Array.from(document.querySelectorAll<HTMLElement>(
        "img, canvas, svg, iframe, button, a, div, span, section, i"
      ));
      const candidates: BrowserQrCandidate[] = [];

      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (!isVisibleQrElement(rect, style)) {
          continue;
        }

        const tag = element.tagName.toLowerCase();
        const background = style.backgroundImage ?? "";
        const isDrawable = tag === "img" || tag === "canvas" || tag === "svg" || tag === "iframe" || background.includes("url(");
        const isSquareish = isSquareLike(rect.width, rect.height);
        const evidence = qrEvidence(element, style);
        const hasQrHint = /qr|qrcode|ewm|erweima|二维码|扫码|扫一扫|my sjtu/.test(evidence);

        if (!hasQrHint || !isSquareish) {
          continue;
        }

        if (candidateMode === "code") {
          const largeEnough = rect.width >= 120 && rect.height >= 120;
          if (!largeEnough || !isDrawable) {
            continue;
          }
        } else {
          const smallEnough = rect.width <= 180 && rect.height <= 180;
          if (!smallEnough) {
            continue;
          }
        }

        let score = rect.width * rect.height / 1000;
        if (isDrawable) score += 80;
        if (tag === "canvas" || tag === "svg") score += 90;
        if (tag === "img") score += 70;
        if (background.includes("url(")) score += 60;
        if (/二维码|扫码|扫一扫|qrcode|qr/.test(evidence)) score += 180;
        if (/my sjtu/.test(evidence)) score += 80;
        if (candidateMode === "trigger" && rect.width <= 120 && rect.height <= 120) score += 80;

        candidates.push({
          x: Math.max(0, rect.x),
          y: Math.max(0, rect.y),
          width: rect.width,
          height: rect.height,
          score,
          tag
        });
      }

      candidates.sort((a, b) => b.score - a.score);
      return candidates[0] ?? null;
    }

    return findBestQrCandidate();
  }, mode);
}

function expandClip(
  candidate: QrCandidate,
  viewport: { width: number; height: number },
  margin: number
): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, candidate.x - margin);
  const y = Math.max(0, candidate.y - margin);
  const right = Math.min(viewport.width, candidate.x + candidate.width + margin);
  const bottom = Math.min(viewport.height, candidate.y + candidate.height + margin);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}
