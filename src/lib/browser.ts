import { chromium, type BrowserContext, type Page } from "playwright";
import { DEFAULT_TIMEOUT_MS } from "./constants.js";

export type BrowserSession = {
  context: BrowserContext;
  page: Page;
};

export async function launchProfileSession(args: {
  profileDir: string;
  headless: boolean;
  timeoutMs?: number;
}): Promise<BrowserSession> {
  const context = await chromium.launchPersistentContext(args.profileDir, {
    headless: args.headless,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    timeout: args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(args.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(args.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  return { context, page };
}

export async function closeSession(session: BrowserSession): Promise<void> {
  await session.context.close();
}
