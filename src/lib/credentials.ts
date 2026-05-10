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
    "input[name='j_username']",
    "input[id*='user' i]",
    "input[id*='account' i]",
    "input[type='text']"
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
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill(value).catch(() => undefined);
      return true;
    }
  }

  return false;
}
