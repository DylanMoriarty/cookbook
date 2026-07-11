import { execSync } from "child_process";

/**
 * Run a shell command, streaming output to the terminal.
 * Throws on non-zero exit so callers can handle errors uniformly.
 */
export function run(cmd, { dryRun = false } = {}) {
  console.log(`\n→ ${cmd}\n`);
  if (dryRun) return;
  execSync(cmd, { stdio: "inherit" });
}
