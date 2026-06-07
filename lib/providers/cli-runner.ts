/**
 * Shared subprocess runner for CLI-based AI providers (Gemini, Claude).
 *
 * Spawns a child process, feeds it a prompt, captures structured JSON
 * output, and handles timeouts + error classification. Both
 * gemini-provider.ts and claude-provider.ts build on this.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CliRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

/**
 * Locate a binary on $PATH. Returns the absolute path or null.
 * Uses `which` on macOS/Linux, `where.exe` on Windows.
 */
export function whichBinary(name: string): string | null {
  const { spawnSync } = require("node:child_process");
  const cmd = process.platform === "win32" ? "where.exe" : "which";
  try {
    const r = spawnSync(cmd, [name], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
      // Ensure we can find binaries installed via npm -g on macOS.
      // Terminal shells populate PATH via profile, but Electron apps
      // inherit a minimal PATH. Merge common install dirs.
      env: {
        ...process.env,
        PATH: augmentedPath(),
      },
    });
    if (r.status !== 0) return null;
    const line = (r.stdout || "").trim().split(/\r?\n/)[0]?.trim();
    return line || null;
  } catch {
    return null;
  }
}

/**
 * PATH augmented with common global npm / Homebrew binary locations.
 * Electron apps on macOS often get a bare-bones PATH that doesn't
 * include /usr/local/bin, ~/.npm-global/bin, or nvm shims.
 */
function augmentedPath(): string {
  const base = process.env.PATH || "";
  const extras: string[] = [];
  const home = process.env.HOME || "";
  if (process.platform !== "win32") {
    extras.push(
      "/usr/local/bin",
      "/opt/homebrew/bin",
      `${home}/.npm-global/bin`,
      `${home}/.nvm/current/bin`,
      `${home}/.local/bin`,
    );
  }
  const existing = new Set(base.split(":"));
  const additions = extras.filter((p) => !existing.has(p));
  return additions.length ? `${base}:${additions.join(":")}` : base;
}

export { augmentedPath };

/**
 * Run a CLI binary with the given arguments and return structured output.
 *
 * - Accepts an optional AbortSignal for cancellation.
 * - Has a generous 120-second default timeout (LLM calls can be slow).
 * - Returns stderr and exit code for error classification.
 */
export async function runCliBinary(
  binPath: string,
  args: string[],
  opts?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    cwd?: string;
  },
): Promise<CliRunResult> {
  const timeout = opts?.timeoutMs ?? 120_000;
  try {
    const p = execFileAsync(binPath, args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10 MB — model responses can be large
      encoding: "utf8",
      cwd: opts?.cwd,
      signal: opts?.signal,
      env: {
        ...process.env,
        PATH: augmentedPath(),
        GEMINI_CLI_TRUST_WORKSPACE: "true",
      },
    });

    // Close stdin immediately so Claude doesn't wait 3s for input
    if (p.child && p.child.stdin) {
      p.child.stdin.end();
    }

    const { stdout, stderr } = await p;
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };
    // execFile rejects on non-zero exit but still provides stdout/stderr
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode:
        typeof e.code === "number"
          ? e.code
          : e.killed || e.signal === "SIGTERM"
            ? -1
            : 1,
    };
  }
}

/** Strip markdown code fences the model sometimes wraps JSON in, then parse. */
export function parseJsonResponse<T>(raw: string): T {
  let text = raw.trim();
  if (!text) throw new Error("Empty response from CLI");

  // Attempt to strip standard markdown fences just in case
  text = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    // If exact parsing fails (e.g. because of CLI warnings on stdout),
    // try to extract the outermost JSON object
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const extracted = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(extracted) as T;
      } catch (innerErr) {
        throw new Error(
          `Failed to parse extracted JSON: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`
        );
      }
    }
    throw new Error(
      `Failed to parse JSON response: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
