#!/usr/bin/env node
/**
 * scripts/cleanup-orphans.mjs
 *
 * Hunts down zombie processes left behind by previous dev runs and
 * kills them. Specifically: Electron / Next standalone / Codex CLI
 * processes whose paths point inside *this* repo's node_modules or
 * inside this repo's .next/standalone build output.
 *
 * Why this exists: when the user force-quits the desktop app (Ctrl+C
 * on the wrong shell, Force Quit from the dock, Activity Monitor)
 * Electron has no chance to run its `before-quit` handler. The Next
 * server child and any `codex exec` calls in flight get reparented to
 * the init process (launchd on macOS, systemd on Linux) and survive
 * indefinitely — piling up in the dock and racing for the localhost
 * port on the next run. Running this before `npm run dev`
 * sweeps them away.
 *
 * Safe-by-design: we only ever match processes whose argv contains the
 * absolute path of this repo, so we never touch unrelated Electron
 * apps (e.g. VS Code) that happen to be open.
 *
 * Cross-platform: on POSIX we use ps + grep, on Windows we use
 * wmic/tasklist + taskkill.
 */

import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");

const NEEDLES = [
  // Our Electron binary path
  path.join(REPO_ROOT, "node_modules", "electron", "dist"),
  // The standalone Next.js server we spawn
  path.join(REPO_ROOT, ".next", "standalone"),
  // The Codex CLI binary path (per-platform package under node_modules)
  path.join(REPO_ROOT, "node_modules", "@openai", "codex-"),
  // Cross-build binary staging dir
  path.join(REPO_ROOT, "electron", "codex-bin"),
];

const SELF_PID = process.pid;

function listPosixPids() {
  // ps -A -o pid=,command= → "12345 /path/to/binary --args"
  let raw = "";
  try {
    raw = execSync("ps -A -o pid=,command=", { encoding: "utf8" });
  } catch (e) {
    console.warn("[cleanup] ps failed:", e.message);
    return [];
  }
  const hits = [];
  for (const line of raw.split("\n")) {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid === SELF_PID) continue;
    const cmd = m[2];
    if (NEEDLES.some((n) => cmd.includes(n))) hits.push({ pid, cmd });
  }
  return hits;
}

function listWindowsPids() {
  let raw = "";
  try {
    raw = execSync("wmic process get ProcessId,CommandLine /format:csv", {
      encoding: "utf8",
      windowsHide: true,
    });
  } catch (e) {
    console.warn("[cleanup] wmic failed:", e.message);
    return [];
  }
  const hits = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("Node,")) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const cmd = parts.slice(1, -1).join(",");
    const pid = Number(parts[parts.length - 1]);
    if (!cmd || !Number.isFinite(pid) || pid === SELF_PID) continue;
    if (NEEDLES.some((n) => cmd.includes(n))) hits.push({ pid, cmd });
  }
  return hits;
}

function killOne(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/f", "/t"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      // Try the process group first (faster, covers descendants).
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    // Escalate to SIGKILL after a short grace period.
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }, 300);
  }
}

function main() {
  const list =
    process.platform === "win32" ? listWindowsPids() : listPosixPids();
  if (!list.length) {
    console.log("[cleanup] no orphans from previous runs.");
    return;
  }
  console.log(`[cleanup] killing ${list.length} orphan process(es):`);
  for (const { pid, cmd } of list) {
    console.log(`  - ${pid}: ${cmd.slice(0, 100)}`);
    killOne(pid);
  }
  // Wait briefly so SIGKILL escalations land before the script exits.
  setTimeout(() => process.exit(0), 600);
}

main();
