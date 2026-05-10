# JAccount CLI

Local-first Playwright CLI for SJTU jAccount task portal automation. The CLI keeps browser automation deterministic and exposes JSON output that OpenClaw can later consume.

## Install

Local development:

```bash
npm install
npx playwright install chromium
npm run build
```

Build before invoking the stable local CLI:

```bash
npm run build
npm run --silent jaccount -- doctor --json
```

The package exposes the `jaccount` binary from `dist/src/cli.js`. There is also a `npm run dev -- ...` script for direct TypeScript execution, but the built CLI is the preferred path for OpenClaw-style stdout parsing.

To expose `jaccount` globally while developing:

```bash
npm link
jaccount doctor --json
```

Install from source on another machine:

```bash
git clone <repo-url>
cd jaccount-cli
npm ci
npx playwright install chromium
npm run build
npm link
jaccount auth login --profile default --json
```

Future npm install shape, after publishing:

```bash
npm install -g jaccount-cli
npx playwright install chromium
npx skills add <owner>/jaccount-cli/skills/jaccount -y -g
```

The AI skill is stored in `skills/jaccount` so CLI commands and agent instructions evolve together.

## Runtime Data

Runtime data is not stored in the repo. By default it goes to:

```text
~/.jaccount-cli/
  profiles/
  artifacts/
  logs/
  traces/
```

The default runtime directory is `~/.jaccount-cli`. You can move it later by setting `JACCOUNT_HOME`.

```bash
export JACCOUNT_HOME=/path/to/runtime-state
```

QR login does not require a `.env` file. `.env.example` only documents optional local environment overrides and the optional `--method password` prefill variables.

## Commands

```bash
npm run build
npm run --silent jaccount -- auth login --profile default --json
npm run --silent jaccount -- auth login --method password --profile default --json
npm run --silent jaccount -- auth status --profile default --json
npm run --silent jaccount -- auth logout --profile default --yes --json
npm run --silent jaccount -- task open --profile default --json
npm run --silent jaccount -- task enter --entry graduate --profile default --json
npm run --silent jaccount -- task categories --profile default --json
npm run --silent jaccount -- task search --keyword 电费 --profile default --json
npm run --silent jaccount -- task category open --name 生活服务 --profile default --json
npm run --silent jaccount -- electricity balance --profile default --json
npm run --silent jaccount -- reimbursement open --profile default --json
npm run --silent jaccount -- reimbursement appointments --profile default --json
npm run --silent jaccount -- doctor --json
```

When invoking through `npm run`, keep the `--` separator before `auth`; otherwise npm consumes flags like `--method` and `--profile`. After `npm link` or global install, use `jaccount ...` directly without the separator.

`auth login` uses QR login by default. It can run in headless environments, saves the current QR image to the command artifact directory, renders a terminal QR code on stderr, and keeps the browser session alive while you scan and confirm it. Use `--method password` to try filling `JACCOUNT_USERNAME` / `JACCOUNT_PASSWORD` before manual verification, or `--method manual` for a headed browser-only login.

After login succeeds, the CLI saves an explicit auth snapshot at:

```text
~/.jaccount-cli/profiles/<profile>/auth-state.json
```

Later `auth status` and `task` commands restore this snapshot before opening the task page. This covers SSO session cookies that Chrome may otherwise drop when the browser closes.

All command actions write a single JSON object to stdout. Diagnostic text goes to stderr or runtime artifacts.

## QR Login on Headless Servers

QR login is the recommended server bootstrap path:

```bash
jaccount auth login --profile default --json
```

During the run, stderr renders a terminal QR code and also prints the QR image path, for example:

```text
~/.jaccount-cli/artifacts/<runId>/login-qr.png
```

If terminal QR rendering fails, open or copy that image before it expires, scan it with the official SJTU login app, and leave the CLI process running until it returns the final JSON result. Use `--no-show-qr` to skip terminal QR rendering. The QR image is a short-lived sensitive artifact and must not be committed.

## Optional Password Login

QR login is preferred and requires no account/password environment variables. If you explicitly want password prefill, create a local `.env` file:

```bash
cp .env.example .env
```

Then fill:

```text
JACCOUNT_USERNAME=
JACCOUNT_PASSWORD=
```

Run:

```bash
jaccount auth login --method password --profile default --json
```

Captcha, SMS, QR, or other jAccount verification remains manual.

## Entry Config

Copy the example and adjust it locally:

```bash
cp config/entries.example.json config/entries.local.json
```

`config/entries.local.json` is ignored by Git because it may reveal private portal structure.

## Development Conventions

User-facing command usage stays in this README. Development rules live in:

- [Command conventions](docs/COMMAND_CONVENTIONS.md)
- [Task hall navigation](docs/TASK_HALL_NAVIGATION.md)

## Smoke Test

```bash
npm run build
npm run --silent jaccount -- open-page --url https://example.com --json
```

This command verifies that Playwright can open a page, read the title, and save a screenshot without touching jAccount.

## Safety

- Profiles, screenshots, traces, logs, downloads, HAR files, and local entry config are ignored by Git.
- Login-page failures do not save screenshots or traces unless `--debug-sensitive-artifacts` is explicitly passed.
- The CLI does not bypass captcha, SMS, QR-code login, or school risk controls.
