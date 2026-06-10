/**
 * Codex CLI provider — uses the @openai/codex-sdk npm package.
 *
 * This is a direct extraction of the Codex SDK logic that previously
 * lived in lib/codex.ts. It implements the AIProvider interface so the
 * router can delegate to it when `provider === "codex"`.
 */

import { Codex } from "@openai/codex-sdk";
import type { ThreadOptions } from "@openai/codex-sdk";
import { CODEX_SCRATCH_DIR } from "../paths";
import type {
  AIProvider,
  RunOptions,
  RunJsonResult,
  RunJsonInThreadResult,
} from "../provider-types";

let _codex: Codex | null = null;

function getCodex(): Codex {
  if (_codex) return _codex;
  const codexPathOverride = process.env.CODEX_BINARY_PATH;
  _codex = new Codex({
    ...(codexPathOverride ? { codexPathOverride } : {}),
    config: {
      // disable image generation so we can use 'low' reasoning; the demo is
      // text-only so there is nothing to lose.
      tools: { image_gen: false },
    },
  });
  return _codex;
}

function threadOptions(opts: RunOptions = {}): ThreadOptions {
  return {
    sandboxMode: "read-only",
    approvalPolicy: "never",
    skipGitRepoCheck: true,
    workingDirectory: CODEX_SCRATCH_DIR,
    modelReasoningEffort: opts.reasoning ?? "low",
    webSearchEnabled: opts.webSearch ?? false,
  };
}

function buildThread(opts: RunOptions = {}) {
  return getCodex().startThread(threadOptions(opts));
}

/** Strip markdown code fences the model sometimes wraps JSON in, then parse. */
function parseTurnJson<T>(finalResponse: string | undefined): T {
  const text = finalResponse?.trim();
  if (!text) throw new Error("Empty finalResponse from codex");
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

export class CodexProvider implements AIProvider {
  readonly name = "codex" as const;

  async runJson<T>(
    prompt: string,
    outputSchema: object,
    opts: RunOptions = {},
  ): Promise<RunJsonResult<T>> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const thread = buildThread(opts);
      try {
        const turn = await thread.run(prompt, {
          outputSchema,
          signal: opts.signal,
        });
        const parsed = parseTurnJson<T>(turn.finalResponse);
        return { data: parsed, usage: turn.usage };
      } catch (err) {
        lastErr = err;
        // Don't retry on parse failures — only on non-generic errors.
        // The caller (the router) handles classification.
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

    if (args.resume) {
      const thread = getCodex().resumeThread(
        args.resume.threadId,
        threadOptions(opts),
      );
      const turn = await thread.run(args.resume.input, {
        outputSchema: args.outputSchema,
        signal: opts.signal,
      });
      const parsed = parseTurnJson<T>(turn.finalResponse);
      return {
        data: parsed,
        usage: turn.usage,
        threadId: thread.id ?? args.resume.threadId,
      };
    }

    if (!args.start)
      throw new Error("runJsonInThread: provide `start` or `resume`");

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const thread = buildThread(opts);
      try {
        const turn = await thread.run(args.start.input, {
          outputSchema: args.outputSchema,
          signal: opts.signal,
        });
        const parsed = parseTurnJson<T>(turn.finalResponse);
        return { data: parsed, usage: turn.usage, threadId: thread.id };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
}
