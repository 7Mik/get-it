/**
 * AI provider router — public API for the entire app.
 *
 * This file is the ONLY entry point every agent, API route, and job
 * queue uses for AI calls. It exposes the exact same public surface as
 * the original Codex-only version:
 *
 *   - runJson<T>(prompt, schema, opts?)          → one-shot JSON
 *   - runJsonInThread<T>({ start|resume, … })    → multi-turn JSON
 *   - CodexError, CodexErrorKind                 → structured errors
 *   - getCodexHealth(), classifyCodexError()      → health/error system
 *
 * Internally it reads `loadSettings().provider` and delegates to the
 * active AIProvider implementation (Codex SDK, Gemini CLI, or Claude Code).
 *
 * The health tracking, preflight rate-limit guard, and error classification
 * are provider-agnostic — every provider's thrown errors get classified
 * through the same regex battery and surfaced in the same banner.
 *
 * Note on naming: we keep the "Codex" names (CodexError, CodexHealth, etc.)
 * in the public API so that no downstream file needs import changes.
 */

import { loadSettings } from "./settings-store";
import type { AIProvider, RunOptions as ProviderRunOptions } from "./provider-types";
import type { ProviderName } from "./provider-types";
import { CodexProvider } from "./providers/codex-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import { ClaudeProvider } from "./providers/claude-provider";

// Re-export RunOptions from here so existing imports keep working.
// Add back the threadOverrides for Codex-specific callers.
export type RunOptions = ProviderRunOptions & {
  /** Override default thread options (Codex-specific, ignored by CLI providers). */
  threadOverrides?: Record<string, unknown>;
};

// ── Provider singletons ─────────────────────────────────────────────────
const providers: Record<ProviderName, AIProvider> = {
  codex: new CodexProvider(),
  gemini: new GeminiProvider(),
  claude: new ClaudeProvider(),
};

function activeProvider(): AIProvider {
  const name = loadSettings().provider;
  return providers[name] ?? providers.codex;
}

/** Return the currently-selected provider name. */
export function getActiveProviderName(): ProviderName {
  return loadSettings().provider;
}

// ── Error classification ────────────────────────────────────────────────
/**
 * Error kinds that we want the UI to react to differently. Anything not
 * one of these stays `generic`; the calling code can still surface the
 * raw message but the banner won't claim a rate-limit when there isn't one.
 */
export type CodexErrorKind =
  | "auth_lost" // user is not logged in (or token revoked)
  | "rate_limit" // hit a usage limit
  | "binary_missing" // the CLI binary can't be found
  | "generic";

export class CodexError extends Error {
  readonly kind: CodexErrorKind;
  readonly retryAt?: number;
  readonly window?: "5h" | "weekly" | "unknown";

  constructor(
    kind: CodexErrorKind,
    message: string,
    extras?: { retryAt?: number; window?: "5h" | "weekly" | "unknown" },
  ) {
    super(message);
    this.name = "CodexError";
    this.kind = kind;
    this.retryAt = extras?.retryAt;
    this.window = extras?.window;
  }
}

// ── Health mailbox ──────────────────────────────────────────────────────
export type CodexHealth = {
  ok: boolean;
  kind: CodexErrorKind | null;
  message: string | null;
  retryAt: number | null;
  window: "5h" | "weekly" | "unknown" | null;
  serial: number;
  lastOkAt: number | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __getitCodexHealth: CodexHealth | undefined;
}

const _initialHealth: CodexHealth = {
  ok: true,
  kind: null,
  message: null,
  retryAt: null,
  window: null,
  serial: 0,
  lastOkAt: null,
};

const health: CodexHealth =
  globalThis.__getitCodexHealth ??
  (globalThis.__getitCodexHealth = { ..._initialHealth });

export function getCodexHealth(): CodexHealth {
  if (
    health.kind === "rate_limit" &&
    health.retryAt != null &&
    Date.now() >= health.retryAt
  ) {
    Object.assign(health, _initialHealth, { serial: health.serial });
  }
  return { ...health };
}

function markOk() {
  if (!health.ok) {
    Object.assign(health, _initialHealth, { serial: health.serial + 1 });
  }
  health.lastOkAt = Date.now();
  health.ok = true;
}

function markError(err: CodexError) {
  health.ok = false;
  health.kind = err.kind;
  health.message = err.message;
  health.retryAt = err.retryAt ?? null;
  health.window = err.window ?? null;
  health.serial += 1;
}

function preflightHealth(): CodexError | null {
  if (
    health.kind === "rate_limit" &&
    health.retryAt != null &&
    Date.now() < health.retryAt
  ) {
    return new CodexError("rate_limit", health.message ?? "Rate limit active", {
      retryAt: health.retryAt,
      window: health.window ?? "unknown",
    });
  }
  return null;
}

// ── Error classification regexes ────────────────────────────────────────
// Provider-agnostic: catches messages from Codex SDK, Gemini CLI, and
// Claude Code alike.
const RX_RATE_LIMIT =
  /(rate.?limit|usage limit|too many requests|429|quota|you've hit|you have hit)/i;
const RX_TRY_AGAIN_SECONDS = /try again in\s*(\d+(?:\.\d+)?)\s*(s|ms|seconds?)/i;
const RX_TRY_AGAIN_MIN = /try again in\s*(\d+(?:\.\d+)?)\s*(m|mins?|minutes?)/i;
const RX_TRY_AGAIN_HOUR = /try again in\s*(\d+(?:\.\d+)?)\s*(h|hrs?|hours?)/i;
const RX_AUTH = /(not logged in|please.*log ?in|unauthori[sz]ed|401|invalid api key|token (?:has )?expired|sign in|auth.*required|not authenticated|authentication failed)/i;
const RX_BINARY = /(unable to locate|cannot find module|enoent|not found on \$PATH|not found.*install|CLI not found)/i;
const RX_WEEKLY = /\bweekly\b/i;
const RX_FIVE_H = /\b(5\s*h|5\s*hour|five hour)\b/i;

export function classifyCodexError(err: unknown): CodexError {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "AI call failed";

  if (RX_BINARY.test(msg)) {
    return new CodexError("binary_missing", msg);
  }

  if (RX_AUTH.test(msg)) {
    return new CodexError("auth_lost", msg);
  }

  if (RX_RATE_LIMIT.test(msg)) {
    let retryAt: number | undefined;
    const sec = RX_TRY_AGAIN_SECONDS.exec(msg);
    const min = RX_TRY_AGAIN_MIN.exec(msg);
    const hr = RX_TRY_AGAIN_HOUR.exec(msg);
    if (sec) {
      const unit = sec[2].toLowerCase();
      const value = Number(sec[1]);
      const ms = unit.startsWith("ms") ? value : value * 1000;
      retryAt = Date.now() + ms;
    } else if (min) {
      retryAt = Date.now() + Number(min[1]) * 60_000;
    } else if (hr) {
      retryAt = Date.now() + Number(hr[1]) * 3_600_000;
    }
    const window: "5h" | "weekly" | "unknown" = RX_WEEKLY.test(msg)
      ? "weekly"
      : RX_FIVE_H.test(msg)
        ? "5h"
        : "unknown";
    return new CodexError("rate_limit", msg, { retryAt, window });
  }

  return new CodexError("generic", msg);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Run a single turn that must return JSON conforming to the supplied schema.
 * Retries once if the model returns un-parseable text. Throws CodexError on
 * failure so callers can pattern-match on `.kind`.
 */
export async function runJson<T>(
  prompt: string,
  outputSchema: object,
  opts: RunOptions = {},
): Promise<{ data: T; usage: unknown }> {
  const preflight = preflightHealth();
  if (preflight) throw preflight;

  try {
    const result = await activeProvider().runJson<T>(prompt, outputSchema, opts);
    markOk();
    return result;
  } catch (err) {
    const classified = classifyCodexError(err);
    if (classified.kind !== "generic") {
      markError(classified);
    }
    throw classified;
  }
}

/**
 * Thread-aware JSON runner for multi-turn tools (chat).
 *
 * Two modes, exactly one of which must be supplied:
 *   • start  — open a NEW thread and send the full first-turn prompt
 *   • resume — continue an EXISTING thread by `threadId`
 *
 * Rate-limit / auth / binary errors are classified and thrown immediately in
 * both modes so the health banner takes over.
 */
export async function runJsonInThread<T>(args: {
  outputSchema: object;
  opts?: RunOptions;
  resume?: { threadId: string; input: string };
  start?: { input: string };
}): Promise<{ data: T; usage: unknown; threadId: string | null }> {
  const preflight = preflightHealth();
  if (preflight) throw preflight;

  try {
    const result = await activeProvider().runJsonInThread<T>(args);
    markOk();
    return result;
  } catch (err) {
    const classified = classifyCodexError(err);
    if (classified.kind !== "generic") {
      markError(classified);
    }
    throw classified;
  }
}
