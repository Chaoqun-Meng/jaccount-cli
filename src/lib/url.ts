import { DEFAULT_TASK_URL } from "./constants.js";
import { AppError } from "./errors.js";

export function validateHttpUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("INVALID_INPUT", "Invalid URL", input);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError("INVALID_INPUT", "URL must use http or https", input);
  }

  return url.toString();
}

export function isTaskPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const task = new URL(DEFAULT_TASK_URL);
    return parsed.hostname === task.hostname && parsed.pathname.startsWith(task.pathname);
  } catch {
    return false;
  }
}

export function isLikelyLoginPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("jaccount") || parsed.pathname.toLowerCase().includes("login");
  } catch {
    return false;
  }
}
