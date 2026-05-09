import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "./errors.js";

export type EntryDefinition = {
  name: string;
  matchText?: string;
  role?: "link" | "button" | "menuitem" | "tab";
  selector?: string;
  urlContains?: string;
  expectedText?: string;
};

export type EntryConfig = {
  entries: Record<string, EntryDefinition>;
};

export function getEntryConfigPath(projectRoot = process.cwd()): string {
  return path.join(projectRoot, "config", "entries.local.json");
}

export function getExampleEntryConfigPath(projectRoot = process.cwd()): string {
  return path.join(projectRoot, "config", "entries.example.json");
}

export async function loadEntryConfig(projectRoot = process.cwd()): Promise<EntryConfig> {
  const localPath = getEntryConfigPath(projectRoot);
  const examplePath = getExampleEntryConfigPath(projectRoot);
  const configPath = (await fileExists(localPath)) ? localPath : examplePath;

  if (!(await fileExists(configPath))) {
    throw new AppError(
      "ENTRY_CONFIG_NOT_FOUND",
      "Entry config not found",
      `Create ${localPath} or restore ${examplePath}.`
    );
  }

  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return normalizeEntryConfig(parsed);
}

export function findEntry(config: EntryConfig, requested: string): { key: string; entry: EntryDefinition } {
  const direct = config.entries[requested];
  if (direct) {
    return { key: requested, entry: direct };
  }

  const found = Object.entries(config.entries).find(([, entry]) => entry.name === requested);
  if (!found) {
    throw new AppError("ENTRY_NOT_FOUND", "Entry not found", requested);
  }

  return { key: found[0], entry: found[1] };
}

function normalizeEntryConfig(value: unknown): EntryConfig {
  if (!value || typeof value !== "object" || !("entries" in value)) {
    throw new AppError("INVALID_INPUT", "Invalid entry config", "Expected an object with an entries map.");
  }

  const entries = (value as { entries: unknown }).entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new AppError("INVALID_INPUT", "Invalid entry config", "entries must be an object.");
  }

  for (const [key, entry] of Object.entries(entries)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AppError("INVALID_INPUT", "Invalid entry definition", key);
    }

    const name = (entry as { name?: unknown }).name;
    if (typeof name !== "string" || name.trim() === "") {
      throw new AppError("INVALID_INPUT", "Entry definition missing name", key);
    }
  }

  return value as EntryConfig;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
