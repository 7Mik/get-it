"use client";

/**
 * Top-bar Settings button + popover.
 *
 * Three runtime knobs:
 *   1. AI Provider selector (Codex CLI, Gemini CLI, Claude Code)
 *   2. Auto-generate toggle
 *   3. Viz repair budget (max retries)
 *
 * Persisted to `/api/settings`. Stateless from the parent's POV — every
 * popover open does a fresh fetch, every change POSTs back, and a
 * `getit:settings` CustomEvent is dispatched so other components on the
 * page can react mid-session without polling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2 } from "lucide-react";
import { AUTO_GENERATE_VIZ, MAX_VIZ_GEN_RETRIES } from "@/lib/config";
import { APP_VERSION } from "@/lib/version";

type ProviderName = "codex" | "gemini" | "claude" | "byok";

const PROVIDER_OPTIONS: { value: ProviderName; label: string; note: string }[] = [
  { value: "codex", label: "Codex CLI", note: "OpenAI Codex SDK" },
  { value: "gemini", label: "Gemini CLI", note: "Requires gemini CLI installed" },
  { value: "claude", label: "Claude Code", note: "Requires claude CLI installed" },
  { value: "byok", label: "BYOK", note: "Bring Your Own Key (OpenAI Compatible API)" },
];

export type SettingsPayload = {
  provider: ProviderName;
  autoGenerate: boolean;
  maxRetries: number;
  geminiApiKey?: string;
  geminiModelFast?: string;
  geminiModelSmart?: string;
  claudeModelFast?: string;
  claudeModelSmart?: string;
  byokUrl?: string;
  byokApiKey?: string;
  byokModelFast?: string;
  byokModelSmart?: string;
};

export const SETTINGS_EVENT = "getit:settings";

type TabName = "general" | "setup" | "models";

export default function SettingsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <span className="viz-tooltip-anchor relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="tab-icon-btn"
          aria-label="Settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        {!open && (
          <span className="viz-tooltip" role="tooltip">
            Settings — provider, visualization preferences.
          </span>
        )}
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            key="settings-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-30 mt-1.5 w-[22rem] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white shadow-[0_8px_24px_rgba(17,17,19,0.08)]"
          >
            <SettingsPanel refreshKey={open ? "open" : "closed"} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsPanel({ refreshKey }: { refreshKey: string }) {
  const [tab, setTab] = useState<TabName>("general");
  const [provider, setProvider] = useState<ProviderName>("codex");
  const [autoGenerate, setAutoGenerate] = useState<boolean>(AUTO_GENERATE_VIZ);
  const [maxRetries, setMaxRetries] = useState<number>(MAX_VIZ_GEN_RETRIES);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [needGeminiKey, setNeedGeminiKey] = useState<boolean>(false);
  const [geminiModelFast, setGeminiModelFast] = useState<string>("gemini-3.5-flash");
  const [geminiModelSmart, setGeminiModelSmart] = useState<string>("gemini-2.5-pro");
  const [claudeModelFast, setClaudeModelFast] = useState<string>("claude-3-5-haiku-20241022");
  const [claudeModelSmart, setClaudeModelSmart] = useState<string>("claude-3-7-sonnet-20250219");
  const [byokUrl, setByokUrl] = useState<string>("http://localhost:11434/v1");
  const [byokApiKey, setByokApiKey] = useState<string>("");
  const [byokModelFast, setByokModelFast] = useState<string>("llama3.2");
  const [byokModelSmart, setByokModelSmart] = useState<string>("llama3.2");
  const hydratedRef = useRef(false);

  // Fetch fresh on every popover open so external changes (CLI edits,
  // a previous run-through-the-wizard, etc.) show up.
  useEffect(() => {
    if (refreshKey !== "open") return;
    hydratedRef.current = false;
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: SettingsPayload) => {
        if (cancelled) return;
        if (s.provider === "codex" || s.provider === "gemini" || s.provider === "claude" || s.provider === "byok")
          setProvider(s.provider);
        if (typeof s.autoGenerate === "boolean") setAutoGenerate(s.autoGenerate);
        if (typeof s.maxRetries === "number") setMaxRetries(s.maxRetries);
        if (typeof s.geminiApiKey === "string") setGeminiApiKey(s.geminiApiKey);
        if (typeof s.geminiModelFast === "string") setGeminiModelFast(s.geminiModelFast);
        if (typeof s.geminiModelSmart === "string") setGeminiModelSmart(s.geminiModelSmart);
        if (typeof s.claudeModelFast === "string") setClaudeModelFast(s.claudeModelFast);
        if (typeof s.claudeModelSmart === "string") setClaudeModelSmart(s.claudeModelSmart);
        if (typeof s.byokUrl === "string") setByokUrl(s.byokUrl);
        if (typeof s.byokApiKey === "string") setByokApiKey(s.byokApiKey);
        if (typeof s.byokModelFast === "string") setByokModelFast(s.byokModelFast);
        if (typeof s.byokModelSmart === "string") setByokModelSmart(s.byokModelSmart);
        hydratedRef.current = true;
      })
      .catch(() => {
        hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const persist = useCallback((delta: Partial<SettingsPayload>) => {
    if (!hydratedRef.current) return;
    void fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(delta),
      keepalive: true,
    })
      .then((r) => r.json())
      .then((next: SettingsPayload) => {
        // Broadcast so siblings on this page (the viewer) can react.
        try {
          window.dispatchEvent(
            new CustomEvent(SETTINGS_EVENT, { detail: next }),
          );
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  const onProvider = useCallback(
    (v: ProviderName) => {
      setProvider(v);
      persist({ provider: v });
      if (v === "gemini" && !geminiApiKey.trim()) {
        setNeedGeminiKey(true);
        setTab("setup");
      } else {
        setNeedGeminiKey(false);
      }
    },
    [persist, geminiApiKey],
  );

  const onAutoGenerate = useCallback(
    (v: boolean) => {
      setAutoGenerate(v);
      persist({ autoGenerate: v });
    },
    [persist],
  );

  const onMaxRetries = useCallback(
    (v: number) => {
      const clamped = Math.min(10, Math.max(0, Math.floor(v)));
      setMaxRetries(clamped);
      persist({ maxRetries: clamped });
    },
    [persist],
  );

  const onGeminiApiKey = useCallback((v: string) => {
    setGeminiApiKey(v);
    persist({ geminiApiKey: v });
    if (v.trim()) setNeedGeminiKey(false);
  }, [persist]);

  const onGeminiModelFast = useCallback((v: string) => {
    setGeminiModelFast(v);
    persist({ geminiModelFast: v });
  }, [persist]);

  const onGeminiModelSmart = useCallback((v: string) => {
    setGeminiModelSmart(v);
    persist({ geminiModelSmart: v });
  }, [persist]);

  const onClaudeModelFast = useCallback((v: string) => {
    setClaudeModelFast(v);
    persist({ claudeModelFast: v });
  }, [persist]);

  const onClaudeModelSmart = useCallback((v: string) => {
    setClaudeModelSmart(v);
    persist({ claudeModelSmart: v });
  }, [persist]);

  const onByokUrl = useCallback((v: string) => {
    setByokUrl(v);
    persist({ byokUrl: v });
  }, [persist]);

  const onByokApiKey = useCallback((v: string) => {
    setByokApiKey(v);
    persist({ byokApiKey: v });
  }, [persist]);

  const onByokModelFast = useCallback((v: string) => {
    setByokModelFast(v);
    persist({ byokModelFast: v });
  }, [persist]);

  const onByokModelSmart = useCallback((v: string) => {
    setByokModelSmart(v);
    persist({ byokModelSmart: v });
  }, [persist]);

  return (
    <>
      <div className="border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-500)]">
            Settings
          </p>
          <p
            className="text-[10.5px] font-medium tabular-nums text-[var(--ink-400)]"
            aria-label={`Get It. version ${APP_VERSION}`}
          >
            v{APP_VERSION}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-400)]">
          Saved automatically. Your choice survives app restarts.
        </p>
      </div>

      <div className="flex border-b border-[var(--border-subtle)] px-3 pt-2 gap-4 text-[12px]">
        <button
          className={`pb-2 ${tab === "general" ? "font-semibold text-[var(--ink-900)] border-b-2 border-[var(--ink-900)]" : "text-[var(--ink-500)] hover:text-[var(--ink-700)]"}`}
          onClick={() => setTab("general")}
        >
          General
        </button>
        <button
          className={`pb-2 ${tab === "setup" ? "font-semibold text-[var(--ink-900)] border-b-2 border-[var(--ink-900)]" : "text-[var(--ink-500)] hover:text-[var(--ink-700)]"}`}
          onClick={() => setTab("setup")}
        >
          Setup
        </button>
        <button
          className={`pb-2 ${tab === "models" ? "font-semibold text-[var(--ink-900)] border-b-2 border-[var(--ink-900)]" : "text-[var(--ink-500)] hover:text-[var(--ink-700)]"}`}
          onClick={() => setTab("models")}
        >
          Models
        </button>
      </div>

      <div className="p-1 min-h-[160px]">
        {tab === "general" && (
          <>
            {/* AI Provider selector */}
            <div className="border-b border-[var(--border-subtle)] px-2 py-2.5">
              <p className="mb-1.5 text-[12.5px] font-medium text-[var(--ink-900)]">
                AI Provider
              </p>
              <div className="flex gap-1 rounded-lg bg-[var(--surface-sunken)] p-0.5">
                {PROVIDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onProvider(opt.value)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                      provider === opt.value
                        ? "bg-white text-[var(--ink-900)] shadow-sm ring-1 ring-[var(--border-subtle)]"
                        : "text-[var(--ink-500)] hover:text-[var(--ink-700)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10.5px] text-[var(--ink-400)]">
                {PROVIDER_OPTIONS.find((o) => o.value === provider)?.note}
              </p>
            </div>

            {/* Auto-generate toggle */}
            <div className="flex items-start gap-2.5 px-2 py-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={autoGenerate}
                onClick={() => onAutoGenerate(!autoGenerate)}
                className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                  autoGenerate
                    ? "bg-[var(--accent-600)]"
                    : "bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--border-default)]"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                    autoGenerate ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-[var(--ink-900)]">
                  Auto-generate visualizations
                </p>
                <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
                  {autoGenerate
                    ? "Every detected tag fires its viz generation in parallel."
                    : "Tags appear after detection but only render on click."}
                </p>
              </div>
            </div>

            {/* Max retries number input */}
            <div className="flex items-start gap-2.5 border-t border-[var(--border-subtle)] px-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-[var(--ink-900)]">
                  Max viz repair attempts
                </p>
                <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
                  Extra calls after a runtime error. Total attempts per tag = 1 + this.
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                value={maxRetries}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) onMaxRetries(n);
                }}
                className="h-7 w-14 shrink-0 rounded-md border border-[var(--border-subtle)] bg-white px-2 text-right text-[12.5px] font-medium tabular-nums text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
              />
            </div>
          </>
        )}

        {tab === "setup" && (
          <div className="px-2 py-2.5 max-h-[260px] overflow-y-auto">
            <p className="mb-2 text-[12.5px] font-medium text-[var(--ink-900)]">
              {PROVIDER_OPTIONS.find((o) => o.value === provider)?.label} Setup
            </p>
            {provider === "codex" && (
              <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
                The Codex CLI manages its own authentication via browser login. 
                If you encounter connection issues, you can restart the app to launch the setup wizard again.
              </p>
            )}
            {provider === "gemini" && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
                  Provide your Google Gemini API Key to authorize the CLI.
                </p>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiApiKey}
                  onChange={(e) => onGeminiApiKey(e.target.value)}
                  autoFocus={needGeminiKey}
                  className={`w-full rounded-md border bg-white px-2.5 py-1.5 text-[12px] text-[var(--ink-900)] focus:outline-none ${needGeminiKey ? "border-[var(--danger-500,#dc2626)] focus:border-[var(--danger-500,#dc2626)]" : "border-[var(--border-subtle)] focus:border-[var(--accent-500)]"}`}
                />
                {needGeminiKey && (
                  <p className="text-[11px] leading-relaxed text-[var(--danger-500,#dc2626)]">
                    A Gemini API key is required to use the Gemini CLI. Please paste it above.
                  </p>
                )}
              </div>
            )}
            {provider === "claude" && (
              <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
                Claude Code uses a terminal-based login. To authenticate, please open a terminal and run:<br />
                <code className="mt-1 block rounded bg-[var(--surface-sunken)] p-1">claude auth login</code>
                <br />
                Once authenticated, requests will automatically succeed.
              </p>
            )}
            {provider === "byok" && (
              <div className="flex flex-col gap-2.5">
                <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
                  Configure your custom OpenAI-compatible API endpoint (e.g. Ollama, OpenRouter, LocalAI).
                </p>
                <div className="flex flex-col gap-1">
                  <label className="text-[10.5px] font-semibold text-[var(--ink-600)]">Base URL</label>
                  <input
                    type="text"
                    placeholder="http://localhost:11434/v1"
                    value={byokUrl}
                    onChange={(e) => onByokUrl(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10.5px] font-semibold text-[var(--ink-600)]">API Key (optional)</label>
                  <input
                    type="password"
                    placeholder="None or API Key..."
                    value={byokApiKey}
                    onChange={(e) => onByokApiKey(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "models" && (
          <div className="px-2 py-2.5 max-h-[280px] overflow-y-auto flex flex-col gap-3.5">
            <p className="text-[12.5px] font-semibold text-[var(--ink-900)]">
              Model Selection
            </p>
            {provider === "codex" && (
              <p className="text-[11px] leading-relaxed text-[var(--ink-500)]">
                Codex automatically selects the best available model for your task based on your ChatGPT plan.
              </p>
            )}
            {provider === "gemini" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[var(--ink-700)]">
                    Fast Model (Concept Detection)
                  </label>
                  <select
                    value={geminiModelFast}
                    onChange={(e) => onGeminiModelFast(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  >
                    <option value="gemini-3.5-flash">gemini-3.5-flash (default)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[var(--ink-700)]">
                    Smart Model (Visualization & Chat)
                  </label>
                  <select
                    value={geminiModelSmart}
                    onChange={(e) => onGeminiModelSmart(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  >
                    <option value="gemini-2.5-pro">gemini-2.5-pro (default)</option>
                    <option value="gemini-2.0-pro-exp-02-05">gemini-2.0-pro-exp</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  </select>
                </div>
              </div>
            )}
            {provider === "claude" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[var(--ink-700)]">
                    Fast Model (Concept Detection)
                  </label>
                  <select
                    value={claudeModelFast}
                    onChange={(e) => onClaudeModelFast(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  >
                    <option value="claude-3-5-haiku-20241022">claude-3-5-haiku (default)</option>
                    <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[var(--ink-700)]">
                    Smart Model (Visualization & Chat)
                  </label>
                  <select
                    value={claudeModelSmart}
                    onChange={(e) => onClaudeModelSmart(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  >
                    <option value="claude-3-7-sonnet-20250219">claude-3-7-sonnet (default)</option>
                    <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                    <option value="claude-3-opus-20240229">claude-3-opus</option>
                    <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
                  </select>
                </div>
              </div>
            )}
            {provider === "byok" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[var(--ink-700)]">
                    Fast Model (Concept Detection)
                  </label>
                  <input
                    type="text"
                    placeholder="llama3.2"
                    value={byokModelFast}
                    onChange={(e) => onByokModelFast(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[var(--ink-700)]">
                    Smart Model (Visualization & Chat)
                  </label>
                  <input
                    type="text"
                    placeholder="llama3.2"
                    value={byokModelSmart}
                    onChange={(e) => onByokModelSmart(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
