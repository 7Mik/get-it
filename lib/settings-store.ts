/**
 * Persistent app settings.
 *
 * Source-of-truth for runtime knobs the user can toggle from the
 * Settings popover. Reads:
 *   1. Saved JSON at <DATA_DIR>/settings.json (if it exists — i.e. the
 *      user has touched the controls at some point).
 *   2. Otherwise, the build-time defaults from `.env` (NEXT_PUBLIC_*).
 *   3. Otherwise, hardcoded fallbacks.
 *
 * Saved settings survive app restarts, OS reboots, and (in the packaged
 * Electron app) the dynamic localhost port that changes between launches
 * — that's why we don't lean on localStorage here.
 */

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";
import { AUTO_GENERATE_VIZ, MAX_VIZ_GEN_RETRIES } from "./config";
import type { ProviderName } from "./provider-types";

export type AppSettings = {
  provider: ProviderName;
  autoGenerate: boolean;
  maxRetries: number;
  geminiApiKey?: string;
  geminiModel?: string; // legacy support
  geminiModelFast?: string;
  geminiModelSmart?: string;
  claudeModel?: string; // legacy support
  claudeModelFast?: string;
  claudeModelSmart?: string;
  byokUrl?: string;
  byokApiKey?: string;
  byokModel?: string; // legacy support
  byokModelFast?: string;
  byokModelSmart?: string;
};

const VERSION = 2 as const;
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

/** Default provider from env, fallback to "codex". */
const DEFAULT_PROVIDER: ProviderName = (() => {
  const raw = process.env.NEXT_PUBLIC_DEFAULT_PROVIDER;
  if (raw === "gemini" || raw === "claude" || raw === "byok") return raw;
  return "codex";
})();

function defaultsFromEnv(): AppSettings {
  return {
    provider: DEFAULT_PROVIDER,
    autoGenerate: AUTO_GENERATE_VIZ,
    maxRetries: MAX_VIZ_GEN_RETRIES,
    geminiModelFast: "gemini-3.5-flash",
    geminiModelSmart: "gemini-2.5-pro",
    claudeModelFast: "claude-3-5-haiku-20241022",
    claudeModelSmart: "claude-3-7-sonnet-20250219",
    byokUrl: process.env.OPENAI_BASE_URL || "http://localhost:11434/v1",
    byokApiKey: process.env.OPENAI_API_KEY || "",
    byokModelFast: process.env.OPENAI_MODEL || "llama3.2",
    byokModelSmart: process.env.OPENAI_MODEL || "llama3.2",
  };
}

function isValidProvider(v: unknown): v is ProviderName {
  return v === "codex" || v === "gemini" || v === "claude" || v === "byok";
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { v: number } & Partial<AppSettings>;
    if (parsed && (parsed.v === VERSION || parsed.v === 1)) {
      const env = defaultsFromEnv();
      const legacyGemini = parsed.geminiModel || env.geminiModelFast;
      const legacyClaude = parsed.claudeModel || env.claudeModelSmart;
      const legacyByok = parsed.byokModel || env.byokModelSmart;

      return {
        provider: isValidProvider(parsed.provider)
          ? parsed.provider
          : env.provider,
        autoGenerate:
          typeof parsed.autoGenerate === "boolean"
            ? parsed.autoGenerate
            : env.autoGenerate,
        maxRetries:
          typeof parsed.maxRetries === "number" && parsed.maxRetries >= 0
            ? Math.min(10, Math.floor(parsed.maxRetries))
            : env.maxRetries,
        geminiApiKey: typeof parsed.geminiApiKey === "string" ? parsed.geminiApiKey : env.geminiApiKey,
        geminiModelFast: typeof parsed.geminiModelFast === "string" ? parsed.geminiModelFast : legacyGemini,
        geminiModelSmart: typeof parsed.geminiModelSmart === "string" ? parsed.geminiModelSmart : legacyGemini,
        claudeModelFast: typeof parsed.claudeModelFast === "string" ? parsed.claudeModelFast : legacyClaude,
        claudeModelSmart: typeof parsed.claudeModelSmart === "string" ? parsed.claudeModelSmart : legacyClaude,
        byokUrl: typeof parsed.byokUrl === "string" ? parsed.byokUrl : env.byokUrl,
        byokApiKey: typeof parsed.byokApiKey === "string" ? parsed.byokApiKey : env.byokApiKey,
        byokModelFast: typeof parsed.byokModelFast === "string" ? parsed.byokModelFast : legacyByok,
        byokModelSmart: typeof parsed.byokModelSmart === "string" ? parsed.byokModelSmart : legacyByok,
      };
    }
  } catch {
    /* file missing or malformed — fall through to env defaults */
  }
  return defaultsFromEnv();
}

export function saveSettings(s: AppSettings): void {
  const file = {
    v: VERSION,
    savedAt: Date.now(),
    provider: isValidProvider(s.provider) ? s.provider : "codex",
    autoGenerate: !!s.autoGenerate,
    maxRetries: Math.min(10, Math.max(0, Math.floor(s.maxRetries))),
    geminiApiKey: s.geminiApiKey,
    geminiModelFast: s.geminiModelFast,
    geminiModelSmart: s.geminiModelSmart,
    claudeModelFast: s.claudeModelFast,
    claudeModelSmart: s.claudeModelSmart,
    byokUrl: s.byokUrl,
    byokApiKey: s.byokApiKey,
    byokModelFast: s.byokModelFast,
    byokModelSmart: s.byokModelSmart,
  };
  const tmp = `${SETTINGS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, SETTINGS_PATH);
}
