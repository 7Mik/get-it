/**
 * Gemini CLI provider — invokes `gemini` as a subprocess.
 *
 * CLI invocation:
 *   gemini -p "<prompt>" --output-format json --model gemini-2.5-pro
 *
 * JSON output shape:
 *   { response: string, stats: { prompt_token_count, candidates_token_count, total_token_count, latency_ms } }
 *
 * Thread support:
 *   Uses native --resume <session-id> for session continuation.
 */

import { CODEX_SCRATCH_DIR } from "../paths";
import type {
  AIProvider,
  RunOptions,
  RunJsonResult,
  RunJsonInThreadResult,
} from "../provider-types";
import { whichBinary, runCliBinary, parseJsonResponse } from "./cli-runner";

type GeminiJsonOutput = {
  response: string;
  stats?: {
    prompt_token_count?: number;
    candidates_token_count?: number;
    total_token_count?: number;
    latency_ms?: number;
  };
};

let _binaryPath: string | null | undefined;

function resolveBinary(): string {
  if (_binaryPath === undefined) {
    _binaryPath = whichBinary("gemini");
  }
  if (!_binaryPath) {
    throw new Error(
      "Gemini CLI not found on $PATH. Install it with: npm install -g @google/gemini-cli",
    );
  }
  return _binaryPath;
}

/** Reset the cached binary path (e.g. after install). */
export function resetGeminiBinaryCache(): void {
  _binaryPath = undefined;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  async runJson<T>(
    prompt: string,
    outputSchema: object,
    opts: RunOptions = {},
  ): Promise<RunJsonResult<T>> {
    const bin = resolveBinary();

    // Build the full prompt with schema instructions
    const fullPrompt = buildPromptWithSchema(prompt, outputSchema);

    const args = [
      "-p",
      fullPrompt,
      "--output-format",
      "json",
    ];

    const result = await runCliBinary(bin, args, {
      signal: opts.signal,
      cwd: CODEX_SCRATCH_DIR,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr || result.stdout || `Gemini CLI exited with code ${result.exitCode}`,
      );
    }

    const raw = parseJsonResponse<GeminiJsonOutput>(result.stdout);
    const innerData = parseJsonResponse<T>(raw.response);

    return {
      data: innerData,
      usage: raw.stats ?? null,
    };
  }

  async runJsonInThread<T>(args: {
    outputSchema: object;
    opts?: RunOptions;
    resume?: { threadId: string; input: string };
    start?: { input: string };
  }): Promise<RunJsonInThreadResult<T>> {
    const bin = resolveBinary();
    const opts = args.opts ?? {};

    if (args.resume) {
      // Use --resume <session-id> for thread continuation
      const fullPrompt = buildPromptWithSchema(
        args.resume.input,
        args.outputSchema,
      );
      const cliArgs = [
        "--resume",
        args.resume.threadId,
        "-p",
        fullPrompt,
        "--output-format",
        "json",
      ];

      const result = await runCliBinary(bin, cliArgs, {
        signal: opts.signal,
        cwd: CODEX_SCRATCH_DIR,
      });

      if (result.exitCode !== 0) {
        throw new Error(
          result.stderr ||
            result.stdout ||
            `Gemini CLI resume exited with code ${result.exitCode}`,
        );
      }

      const raw = parseJsonResponse<GeminiJsonOutput>(result.stdout);
      const innerData = parseJsonResponse<T>(raw.response);

      return {
        data: innerData,
        usage: raw.stats ?? null,
        // Gemini doesn't return a new session ID on resume — keep the same one
        threadId: args.resume.threadId,
      };
    }

    if (!args.start)
      throw new Error("runJsonInThread: provide `start` or `resume`");

    const fullPrompt = buildPromptWithSchema(
      args.start.input,
      args.outputSchema,
    );
    const cliArgs = [
      "-p",
      fullPrompt,
      "--output-format",
      "json",
    ];

    const result = await runCliBinary(bin, cliArgs, {
      signal: opts.signal,
      cwd: CODEX_SCRATCH_DIR,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr ||
          result.stdout ||
          `Gemini CLI exited with code ${result.exitCode}`,
      );
    }

    const raw = parseJsonResponse<GeminiJsonOutput>(result.stdout);
    const innerData = parseJsonResponse<T>(raw.response);

    // Gemini CLI doesn't expose a session_id in JSON output — use null
    // (the caller will fall back to start with full context on next turn)
    return {
      data: innerData,
      usage: raw.stats ?? null,
      threadId: null,
    };
  }
}

/**
 * Build a prompt that instructs the model to return JSON matching the schema.
 * Gemini CLI doesn't support --json-schema, so we embed the schema in the prompt.
 */
function buildPromptWithSchema(prompt: string, outputSchema: object): string {
  return `${prompt}

IMPORTANT: You MUST respond with valid JSON only — no markdown fences, no prose.
The JSON MUST conform to this schema:
${JSON.stringify(outputSchema, null, 2)}`;
}
