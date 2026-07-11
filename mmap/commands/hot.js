/**
 * hot — get around quick
 *
 * Usage: mmap hot <proj> | mmap hot --list | eval "$(mmap hot <proj> --cd)"
 *
 * Prints a project path (or a shell-ready cd command).
 */
import { hotPaths } from '../utils/hot-paths.js';

export const meta = {
  usage: "hot <proj> [--list] [--cd]",
  description: "Show project shortcuts or print a target path for quick cd",
};

export function execute(args, opts) {
  const projects = hotPaths;

  const [proj, ...rest] = args;
  const shouldList = proj === "--list" || proj === "-l";
  const printCd = rest.includes("--cd");

  if (shouldList) {
    console.log("\nProjects:\n");
    for (const [name, path] of Object.entries(projects)) {
      console.log(`  ${name.padEnd(12)} ${path}`);
    }
    console.log();
    return;
  }

  if (!proj) {
    console.error(`Usage: mmap ${meta.usage}`);
    process.exit(1);
  }

  if (!projects[proj]) {
    console.error(`Unknown project: ${proj}`);
    console.error("Run 'mmap hot --list' to see available projects.");
    process.exit(1);
  }

  const target = projects[proj];

  if (printCd) {
    console.log(`cd "${target.replaceAll('"', '\\"')}"`);
    return;
  }

  console.log(target);
}
