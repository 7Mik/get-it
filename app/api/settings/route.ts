/**
 * GET  /api/settings    → current persisted AppSettings (or env defaults)
 * POST /api/settings    → merge body into persisted settings
 *
 * The viewer reads this once at mount and writes on every toggle. Settings
 * survive app restarts because they live at <DATA_DIR>/settings.json.
 */

import { NextResponse } from "next/server";
import { loadSettings, saveSettings, type AppSettings } from "@/lib/settings-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(loadSettings());
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const b = (body && typeof body === "object" ? body : {}) as Partial<AppSettings>;
  const current = loadSettings();
  const next: AppSettings = {
    provider:
      b.provider === "codex" || b.provider === "gemini" || b.provider === "claude" || b.provider === "byok"
        ? b.provider
        : current.provider,
    autoGenerate:
      typeof b.autoGenerate === "boolean" ? b.autoGenerate : current.autoGenerate,
    maxRetries:
      typeof b.maxRetries === "number" && b.maxRetries >= 0
        ? b.maxRetries
        : current.maxRetries,
    geminiApiKey: typeof b.geminiApiKey === "string" ? b.geminiApiKey : current.geminiApiKey,
    geminiModelFast: typeof b.geminiModelFast === "string" ? b.geminiModelFast : current.geminiModelFast,
    geminiModelSmart: typeof b.geminiModelSmart === "string" ? b.geminiModelSmart : current.geminiModelSmart,
    claudeModelFast: typeof b.claudeModelFast === "string" ? b.claudeModelFast : current.claudeModelFast,
    claudeModelSmart: typeof b.claudeModelSmart === "string" ? b.claudeModelSmart : current.claudeModelSmart,
    byokUrl: typeof b.byokUrl === "string" ? b.byokUrl : current.byokUrl,
    byokApiKey: typeof b.byokApiKey === "string" ? b.byokApiKey : current.byokApiKey,
    byokModelFast: typeof b.byokModelFast === "string" ? b.byokModelFast : current.byokModelFast,
    byokModelSmart: typeof b.byokModelSmart === "string" ? b.byokModelSmart : current.byokModelSmart,
  };
  saveSettings(next);
  return NextResponse.json(next);
}
