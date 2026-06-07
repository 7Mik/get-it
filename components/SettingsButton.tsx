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

type ProviderName = "codex" | "gemini" | "claude";

const PROVIDER_OPTIONS: { value: ProviderName; label: string; note: string }[] = [
  { value: "codex", label: "Codex CLI", note: "OpenAI Codex SDK" },
  { value: "gemini", label: "Gemini CLI", note: "Requires gemini CLI installed" },
  { value: "claude", label: "Claude Code", note: "Requires claude CLI installed" },
];

export type SettingsPayload = {
  provider: ProviderName;
  autoGenerate: boolean;
  maxRetries: number;
};

export const SETTINGS_EVENT = "getit:settings";

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
  const [provider, setProvider] = useState<ProviderName>("codex");
  const [autoGenerate, setAutoGenerate] = useState<boolean>(AUTO_GENERATE_VIZ);
  const [maxRetries, setMaxRetries] = useState<number>(MAX_VIZ_GEN_RETRIES);
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
        if (s.provider === "codex" || s.provider === "gemini" || s.provider === "claude")
          setProvider(s.provider);
        if (typeof s.autoGenerate === "boolean") setAutoGenerate(s.autoGenerate);
        if (typeof s.maxRetries === "number") setMaxRetries(s.maxRetries);
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
    },
    [persist],
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

      {/* AI Provider selector */}
      <div className="border-b border-[var(--border-subtle)] px-3 py-2.5">
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
      <div className="flex items-start gap-2.5 px-3 py-2.5">
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
      <div className="flex items-start gap-2.5 border-t border-[var(--border-subtle)] px-3 py-2.5">
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
  );
}
