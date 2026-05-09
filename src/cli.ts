#!/usr/bin/env node
import { Command } from "commander";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import { doctor } from "./commands/doctor.js";
import { openPage } from "./commands/openPage.js";
import { taskCategories, taskCategoryOpen, taskEnter, taskOpen, taskSearch } from "./commands/task.js";
import { electricityBalance } from "./commands/electricity.js";
import { reimbursementAppointments, reimbursementOpen } from "./commands/reimbursement.js";
import { DEFAULT_PROFILE, DEFAULT_TIMEOUT_MS, LOGIN_TIMEOUT_MS } from "./lib/constants.js";
import { loadDotEnv } from "./lib/env.js";
import { createRunId } from "./lib/runId.js";
import { failureResult, successResult, writeResult, type ArtifactMap } from "./lib/result.js";

loadDotEnv();

type CommandAction<TOptions extends Record<string, unknown>> = (
  runId: string,
  options: TOptions
) => Promise<{
  profile: string | null;
  data: Record<string, unknown>;
  artifacts: Partial<ArtifactMap>;
}>;

async function runJsonCommand<TOptions extends Record<string, unknown>>(
  commandName: string,
  options: TOptions,
  action: CommandAction<TOptions>
): Promise<void> {
  const runId = createRunId(commandName);
  try {
    const output = await action(runId, options);
    writeResult(successResult({
      command: commandName,
      runId,
      profile: output.profile,
      data: output.data,
      artifacts: output.artifacts
    }));
  } catch (error) {
    writeResult(failureResult({
      command: commandName,
      runId,
      profile: typeof options.profile === "string" ? options.profile : null,
      error
    }));
    process.exitCode = 1;
  }
}

const program = new Command();
program
  .name("jaccount")
  .description("Local-first Playwright CLI for SJTU jAccount task automation.")
  .version("0.1.0");

const auth = program.command("auth").description("Manage jAccount browser authentication state.");

auth
  .command("login")
  .description("Start jAccount login. QR login is the default and works in headless server environments.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--method <method>", "Login method: qr, manual, or password", "qr")
  .option("--headed", "Run browser headed; manual/password login always runs headed", false)
  .option("--show-qr", "Render the QR code as terminal text on stderr", true)
  .option("--no-show-qr", "Do not render the QR code in the terminal")
  .option("--timeout-ms <ms>", "Login timeout in milliseconds", parseInteger, LOGIN_TIMEOUT_MS)
  .option("--debug-sensitive-artifacts", "Allow sensitive login-page failure artifacts", false)
  .action((options) => runJsonCommand("auth login", options, authLogin));

auth
  .command("status")
  .description("Check whether a profile can reach the task page.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .action((options) => runJsonCommand("auth status", options, authStatus));

auth
  .command("logout")
  .description("Delete a local persistent browser profile.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--yes", "Confirm profile deletion", false)
  .action((options) => runJsonCommand("auth logout", options, authLogout));

const task = program.command("task").description("Open and navigate the SJTU task portal.");

task
  .command("open")
  .description("Open the task page using an existing logged-in profile.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .action((options) => runJsonCommand("task open", options, taskOpen));

task
  .command("enter")
  .description("Enter a configured task portal entry.")
  .requiredOption("--entry <name>", "Entry key or configured display name")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .action((options) => runJsonCommand("task enter", options, taskEnter));

task
  .command("categories")
  .description("List visible service categories from the task hall.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .action((options) => runJsonCommand("task categories", options, taskCategories));

task
  .command("search")
  .description("Search visible task hall labels by keyword.")
  .requiredOption("--keyword <keyword>", "Keyword to search")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .action((options) => runJsonCommand("task search", options, taskSearch));

const taskCategory = task.command("category").description("Open task hall service categories.");

taskCategory
  .command("open")
  .description("Open a visible service category from the task hall.")
  .requiredOption("--name <name>", "Category name, such as 生活服务")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .action((options) => runJsonCommand("task category open", options, taskCategoryOpen));

program
  .command("doctor")
  .description("Check local runtime prerequisites.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .action((options) => runJsonCommand("doctor", options, doctor));

program
  .command("open-page")
  .description("Smoke-test Playwright by opening a URL and reading its title.")
  .requiredOption("--url <url>", "URL to open")
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--no-screenshot", "Skip screenshot")
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .option("--wait-until <state>", "Playwright waitUntil state", "domcontentloaded")
  .action((options) => runJsonCommand("open-page", options, openPage));

const electricity = program.command("electricity").description("Query dormitory electricity information.");

electricity
  .command("balance")
  .description("Query dormitory electricity balance from the life services portal.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .option("--debug", "Include debug text previews in JSON output", false)
  .action((options) => runJsonCommand("electricity balance", options, electricityBalance));

const reimbursement = program.command("reimbursement").description("Open and inspect finance reimbursement workflows.");

reimbursement
  .command("open")
  .description("Open the Finance → 智能报销 page without clicking any reimbursement action.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .option("--debug", "Include debug text previews in JSON output", false)
  .action((options) => runJsonCommand("reimbursement open", options, reimbursementOpen));

reimbursement
  .command("appointments")
  .description("Open 历史预约单 and read the current appointment table.")
  .option("--profile <name>", "Profile name", DEFAULT_PROFILE)
  .option("--json", "Emit a single JSON result object", true)
  .option("--headed", "Run browser headed", false)
  .option("--timeout-ms <ms>", "Timeout in milliseconds", parseInteger, DEFAULT_TIMEOUT_MS)
  .option("--debug", "Include debug text previews in JSON output", false)
  .action((options) => runJsonCommand("reimbursement appointments", options, reimbursementAppointments));

await program.parseAsync(process.argv);

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}
