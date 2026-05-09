export function createRunId(command: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${command.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}`;
}
