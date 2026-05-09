# Command Conventions

This CLI should expose stable business commands, not raw browser steps.

## Naming

Use:

```text
jaccount <domain> <action>
```

Examples:

```bash
jaccount auth login
jaccount task open
jaccount task categories
jaccount task category open --name 生活服务
jaccount electricity balance
jaccount reimbursement open
jaccount reimbursement appointments
```

Rules:

- `auth` is only for login state.
- `task` is only for task hall discovery and generic navigation.
- Business domains use nouns such as `electricity`, `library`, or `campus-card`.
- Read-only commands use names such as `balance`, `status`, `list`, `search`, or `open`.
- Mutating commands use explicit verbs such as `submit`, `pay`, `bind`, or `recharge`, and must require `--yes` or provide a safe `--dry-run` default.

## Required Options

Every browser-backed command should support:

```text
--profile <name>
--json
--headed
--timeout-ms <ms>
```

`--json` exists for command consistency. Commands must always write exactly one JSON object to stdout when invoked through the stable CLI path.

## Output

All command results use the shared schema:

```json
{
  "schemaVersion": "1.0",
  "ok": true,
  "command": "domain action",
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

Guidelines:

- Put stable parsed values in `data`.
- Put files in `artifacts`, using absolute paths.
- Keep stdout clean; progress text goes to stderr.
- Avoid returning long page text by default. Use `--debug` for text previews.
- Do not return passwords, cookies, localStorage contents, or auth-state file contents.

## Errors

Prefer explicit error codes:

```text
AUTH_REQUIRED
ENTRY_TARGET_NOT_FOUND
ENTRY_NOT_FOUND
INVALID_INPUT
NAVIGATION_TIMEOUT
BROWSER_ERROR
UNEXPECTED_ERROR
```

If a required page element is missing, return `ok: false`. Do not return `ok: true` with a message unless the state is a legitimate business outcome.

## New Command Checklist

Before adding a new business command:

1. Reuse `src/lib/taskHall.ts` for authenticated task hall navigation.
2. Keep domain parsing in a domain command or domain folder.
3. Return stable structured fields, not only body text.
4. Save at least the final screenshot.
5. Add parsing unit tests for fragile text extraction.
6. Document the command in README if it is user-facing.
7. Keep sensitive/debug fields behind `--debug`.
