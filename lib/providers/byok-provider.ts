import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CODEX_SCRATCH_DIR } from "../paths";
import { loadSettings } from "../settings-store";
import type {
  AIProvider,
  RunOptions,
  RunJsonResult,
  RunJsonInThreadResult,
} from "../provider-types";

function buildPromptWithSchema(prompt: string, outputSchema: object): string {
  return `${prompt}

IMPORTANT: You MUST respond with valid JSON only — no markdown fences, no prose.
The JSON MUST conform to this schema:
${JSON.stringify(outputSchema, null, 2)}`;
}

function parseTurnJson<T>(text: string | undefined): T {
  if (!text) throw new Error("Empty response from BYOK provider");
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

const THREADS_DIR = path.join(CODEX_SCRATCH_DIR, "byok-threads");

function getThreadFile(threadId: string): string {
  return path.join(THREADS_DIR, `${threadId}.json`);
}

function loadThread(threadId: string): Array<{role: string, content: string}> {
  try {
    const raw = fs.readFileSync(getThreadFile(threadId), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveThread(threadId: string, messages: Array<{role: string, content: string}>): void {
  fs.mkdirSync(THREADS_DIR, { recursive: true });
  fs.writeFileSync(getThreadFile(threadId), JSON.stringify(messages, null, 2), "utf8");
}

export class ByokProvider implements AIProvider {
  readonly name = "byok" as const;

  private async fetchCompletion(messages: any[], opts: RunOptions) {
    const settings = loadSettings();
    const baseUrl = (settings.byokUrl || "http://localhost:11434/v1").replace(/\/$/, "");
    const model =
      opts.reasoning === "low"
        ? settings.byokModelFast || "llama3.2"
        : settings.byokModelSmart || "llama3.2";
    const apiKey = settings.byokApiKey || "empty";

    const payload = {
      model,
      messages,
      temperature: opts.reasoning === "high" ? 0.7 : 0.0,
    };

    const controller = new AbortController();
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => controller.abort());
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey && apiKey !== "empty") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`BYOK Provider error ${res.status}: ${txt}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("BYOK Provider returned no content");
    }

    return { content, usage: data.usage || null };
  }

  async runJson<T>(
    prompt: string,
    outputSchema: object,
    opts: RunOptions = {}
  ): Promise<RunJsonResult<T>> {
    const fullPrompt = buildPromptWithSchema(prompt, outputSchema);
    const messages = [{ role: "user", content: fullPrompt }];

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { content, usage } = await this.fetchCompletion(messages, opts);
        const parsed = parseTurnJson<T>(content);
        return { data: parsed, usage };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async runJsonInThread<T>(args: {
    outputSchema: object;
    opts?: RunOptions;
    resume?: { threadId: string; input: string };
    start?: { input: string };
  }): Promise<RunJsonInThreadResult<T>> {
    const opts = args.opts ?? {};
    
    let threadId: string;
    let messages: Array<{role: string, content: string}> = [];

    if (args.resume) {
      threadId = args.resume.threadId;
      messages = loadThread(threadId);
      const fullPrompt = buildPromptWithSchema(args.resume.input, args.outputSchema);
      messages.push({ role: "user", content: fullPrompt });
    } else if (args.start) {
      threadId = crypto.randomUUID();
      const fullPrompt = buildPromptWithSchema(args.start.input, args.outputSchema);
      messages.push({ role: "user", content: fullPrompt });
    } else {
      throw new Error("runJsonInThread: provide `start` or `resume`");
    }

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { content, usage } = await this.fetchCompletion(messages, opts);
        const parsed = parseTurnJson<T>(content);
        
        // Save the successful thread continuation
        messages.push({ role: "assistant", content });
        saveThread(threadId, messages);

        return { data: parsed, usage, threadId };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
}
