import type { Page } from "playwright";

export async function tryFillCredentials(page: Page, env = process.env): Promise<boolean> {
  const username = env.JACCOUNT_USERNAME;
  const password = env.JACCOUNT_PASSWORD;
  if (!username || !password) {
    return false;
  }

  const userFilled = await tryFillFirst(page, [
    "input[name='user']",
    "input[name='username']",
    "input[name='loginName']",
    "input[id*='user' i]",
    "input[placeholder*='账号']",
    "input[placeholder*='用户名']"
  ], username);

  const passwordFilled = await tryFillFirst(page, [
    "input[type='password']",
    "input[name='password']",
    "input[id*='password' i]"
  ], password);

  return userFilled && passwordFilled;
}

async function tryFillFirst(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        await locator.fill(value);
        return true;
      }
    } catch {
      // Try the next likely field shape.
    }
  }

  return false;
}
