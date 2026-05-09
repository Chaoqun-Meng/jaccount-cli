---
name: jaccount
description: "Use this skill when the user wants an AI agent to query or navigate SJTU jAccount / 交我办 workflows through the local `jaccount` CLI, including auth status, task hall discovery, dormitory electricity balance, and finance reimbursement appointment queries. The skill must call the CLI only; it must not read cookies, auth-state files, or browser profiles directly."
metadata:
  requires:
    bins: ["jaccount"]
  cliHelp: "jaccount --help"
---

# JAccount CLI

Use the local `jaccount` CLI as the only interface to SJTU jAccount / 交我办 workflows.

## Rules

- Always call `jaccount ... --json` and parse stdout as one JSON object.
- Do not read `auth-state.json`, cookies, localStorage, browser profiles, screenshots, or traces unless the user explicitly asks to inspect an artifact path returned by the CLI.
- Treat `auth login` as user-interactive. QR login is the only login path: the CLI renders a terminal QR code on stderr and returns a `qrCode` artifact path. Wait for the user to scan and confirm it. The user completes captcha, SMS, or QR verification when prompted by jAccount.
- Read-only commands may be run directly.
- Any command that submits, pays, deletes, unbinds, modifies profile data, or sends a form must require explicit user confirmation and must use `--dry-run` or `--yes` if such options exist.
- If a command returns `ok: false`, report `error.code`, `error.message`, and relevant artifact paths. Do not guess from page content.

## Common Commands

Check local setup:

```bash
jaccount doctor --json
```

Check login state:

```bash
jaccount auth status --profile default --json
```

Start QR login:

```bash
jaccount auth login --profile default --json
```

Explore the task hall:

```bash
jaccount task categories --profile default --json
jaccount task search --keyword 电费 --profile default --json
jaccount task category open --name 生活服务 --profile default --json
```

Read dormitory electricity balance:

```bash
jaccount electricity balance --profile default --json
```

Open finance reimbursement home:

```bash
jaccount reimbursement open --profile default --json
```

Read reimbursement history appointments:

```bash
jaccount reimbursement appointments --profile default --json
```

## Output Handling

The CLI returns:

```json
{
  "schemaVersion": "1.0",
  "ok": true,
  "command": "reimbursement appointments",
  "runId": "timestamp-command",
  "profile": "default",
  "data": {},
  "artifacts": {
    "screenshot": null,
    "log": null,
    "trace": null
  },
  "error": null
}
```

Use `data` for structured results and `artifacts` only as supporting evidence.

