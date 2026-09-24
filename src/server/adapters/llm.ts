// LLM boundary (D11 pending): business code depends on LlmAdapter only. Provider calls never run inside a DB transaction.

export interface LlmRequest { system: string; user: string; jsonSchema: object; maxTokens: number; timeoutMs: number }
export interface LlmResult { json: unknown; modelId: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
export interface LlmAdapter { readonly modelId: string; generate(req: LlmRequest): Promise<LlmResult> }

/** Usage the provider reported even though the call failed (e.g. no tool output): still billed, so still costed. */
export interface LlmUsage { modelId: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }

export class LlmError extends Error {
  constructor(public readonly code: "timeout" | "http" | "no_tool_output" | "network", public readonly usage: LlmUsage | null = null) { super(`LLM ${code}`); this.name = "LlmError"; }
}

/**
 * Anthropic Messages API with a forced tool call, so the reply is JSON matching the schema.
 * Plain fetch (no SDK) keeps the dependency surface small; the request body is data-only.
 */
export class AnthropicLlm implements LlmAdapter {
  constructor(private readonly apiKey: string, readonly modelId: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async generate(req: LlmRequest): Promise<LlmResult> {
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: this.modelId,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
          tools: [{ name: "write_reading", description: "Return the finished reading.", input_schema: req.jsonSchema }],
          tool_choice: { type: "tool", name: "write_reading" },
        }),
        signal: AbortSignal.timeout(req.timeoutMs),
      });
    } catch (e) {
      throw new LlmError(e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network");
    }
    if (!res.ok) throw new LlmError("http");
    const body = (await res.json()) as {
      content?: Array<{ type: string; input?: unknown }>; model?: string;
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    };
    const usage: LlmUsage = {
      modelId: body.model ?? this.modelId, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0,
      cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0, cacheWriteTokens: body.usage?.cache_creation_input_tokens ?? 0,
    };
    const tool = body.content?.find((c) => c.type === "tool_use");
    if (!tool || tool.input === undefined) throw new LlmError("no_tool_output", usage);
    return { json: tool.input, ...usage };
  }
}

/** Deterministic stand-in for tests and local demos: returns what the test queued. */
export class FakeLlm implements LlmAdapter {
  readonly modelId = "fake-llm";
  queue: Array<unknown | Error> = [];
  calls: LlmRequest[] = [];
  async generate(req: LlmRequest): Promise<LlmResult> {
    this.calls.push(req);
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    return { json: next, modelId: this.modelId, inputTokens: 1000, outputTokens: 1500, cacheReadTokens: 0, cacheWriteTokens: 0 };
  }
}
