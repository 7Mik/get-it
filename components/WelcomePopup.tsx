"use client";

/**
 * First-launch welcome card.
 *
 * Shown on every app boot until the user clicks "Don't show again",
 * at which point the dismissal is pinned to the current app version
 * via /api/welcome. A future update bumps the version → the popup
 * reappears for the new release.
 *
 * Renders nothing if `/api/welcome` says the user has already
 * dismissed this version, or if the fetch hasn't completed yet.
 */

import { useCallback, useEffect, useState } from "react";
import {
  APP_VERSION,
  GITHUB_URL,
  FEEDBACK_EMAIL,
  TEAM,
} from "@/lib/version";
import { X, ExternalLink, Mail } from "lucide-react";

type WelcomeState = {
  dismissedVersion: string | null;
  currentVersion: string;
  shouldShow: boolean;
};

export default function WelcomePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/welcome", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: WelcomeState) => {
        if (cancelled) return;
        setOpen(!!s.shouldShow);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const dismissForever = useCallback(async () => {
    try {
      await fetch("/api/welcome", { method: "POST" });
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(17,17,19,0.18)]">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-[var(--ink-400)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--ink-900)]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-2 pt-7">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-700)]">
            VERSION {APP_VERSION}
          </div>
          <h2 className="mt-2 text-[22px] font-bold tracking-tight text-[var(--ink-900)]">
            Welcome to{" "}
            <span className="font-black text-[var(--ink-900)]">Get It.</span>
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-700)]">
            Built in 24 hours at <strong>GDG AI Hack 2026, Milan</strong> by
            four students, then polished into a desktop app you can install
            in one click.
          </p>
        </div>

        <ul className="mx-6 mt-3 space-y-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-4 py-3">
          {TEAM.map((m) => (
            <li
              key={m.name}
              className="flex items-baseline justify-between text-[12.5px]"
            >
              <span className="font-medium text-[var(--ink-900)]">{m.name}</span>
              <span className="text-[10.5px] text-[var(--ink-500)]">
                {m.affiliation}
              </span>
            </li>
          ))}
        </ul>

        <div className="mx-6 my-4 rounded-xl border border-[var(--border-subtle)] bg-white px-4 py-3 text-[12px] leading-relaxed text-[var(--ink-700)]">
          <p>
            Get It. is <strong>free and open source</strong> under the MIT
            license. Fork it, ship a feature, send a PR — that's the whole
            point of releasing it this way.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-700)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {GITHUB_URL.replace(/^https?:\/\//, "")}
            </a>
            <a
              href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
                `Get It. ${APP_VERSION} — feedback`,
              )}`}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-700)] hover:underline"
            >
              <Mail className="h-3.5 w-3.5" />
              {FEEDBACK_EMAIL}
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-6 py-3">
          <button
            type="button"
            onClick={dismissForever}
            className="text-[11.5px] font-medium text-[var(--ink-500)] underline-offset-2 hover:text-[var(--ink-900)] hover:underline"
          >
            Don&apos;t show again
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-md bg-[var(--ink-900)] px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-black"
          >
            Let&apos;s go
          </button>
        </div>
      </div>
    </div>
  );
}
