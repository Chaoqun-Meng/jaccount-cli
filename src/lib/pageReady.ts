import type { Page } from "playwright";

export type RenderStats = {
  bodyTextLength: number;
  elementCount: number;
  visibleElementCount: number;
};

export async function waitForVisiblePageContent(page: Page, timeoutMs: number): Promise<RenderStats> {
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 15000) }).catch(() => undefined);

  await page.waitForFunction(
    () => {
      const body = globalThis.document.body;
      if (!body) {
        return false;
      }

      const textLength = body.innerText.trim().length;
      const visibleElementCount = Array.from(body.querySelectorAll("*")).filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = globalThis.getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none";
      }).length;

      return textLength > 10 || visibleElementCount > 3;
    },
    undefined,
    { timeout: Math.min(timeoutMs, 20000) }
  ).catch(() => undefined);

  await page.waitForTimeout(500);
  return getRenderStats(page);
}

export async function getRenderStats(page: Page): Promise<RenderStats> {
  return page.evaluate(() => {
    const body = globalThis.document.body;
    if (!body) {
      return {
        bodyTextLength: 0,
        elementCount: 0,
        visibleElementCount: 0
      };
    }

    const elements = Array.from(body.querySelectorAll("*"));
    const visibleElementCount = elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = globalThis.getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none";
    }).length;

    return {
      bodyTextLength: body.innerText.trim().length,
      elementCount: elements.length,
      visibleElementCount
    };
  });
}
