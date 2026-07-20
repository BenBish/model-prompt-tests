import { afterEach, describe, expect, test } from "bun:test";
import { createAnthropicAdapter } from "./anthropic";
import { createOpenAICompatibleAdapter } from "./openaiCompatible";

const originalFetch = globalThis.fetch;
const originalAnthropicKey = process.env.TEST_ANTHROPIC_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalAnthropicKey === undefined) {
    delete process.env.TEST_ANTHROPIC_API_KEY;
  } else {
    process.env.TEST_ANTHROPIC_API_KEY = originalAnthropicKey;
  }
});

describe("provider adapters", () => {
  test("passes a configured timeout signal", async () => {
    process.env.TEST_ANTHROPIC_API_KEY = "test";
    let requestSignal: AbortSignal | null | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestSignal = init?.signal;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "ok" }],
          usage: {},
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const adapter = createAnthropicAdapter({
      kind: "anthropic",
      id: "test",
      modelName: "test",
      apiKeyEnvVar: "TEST_ANTHROPIC_API_KEY",
      timeoutMs: 50,
    });
    await adapter.call({ userPrompt: "test" });

    expect(requestSignal).toBeInstanceOf(AbortSignal);
  });

  test("rejects a malformed Anthropic success response", async () => {
    process.env.TEST_ANTHROPIC_API_KEY = "test";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ content: [] }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createAnthropicAdapter({
      kind: "anthropic",
      id: "test",
      modelName: "test",
      apiKeyEnvVar: "TEST_ANTHROPIC_API_KEY",
    });

    await expect(adapter.call({ userPrompt: "test" })).rejects.toThrow(
      "did not contain a text block",
    );
  });

  test("rejects a malformed OpenAI-compatible success response", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 })) as unknown as typeof fetch;
    const adapter = createOpenAICompatibleAdapter({
      kind: "openai-compatible",
      id: "test",
      providerId: "test",
      modelName: "test",
      baseUrl: "https://example.test/v1",
    });

    await expect(adapter.call({ userPrompt: "test" })).rejects.toThrow(
      "did not contain message content",
    );
  });

  test("preserves HTTP status and non-JSON error bodies", async () => {
    globalThis.fetch = (async () =>
      new Response("upstream unavailable", { status: 503 })) as unknown as typeof fetch;
    const adapter = createOpenAICompatibleAdapter({
      kind: "openai-compatible",
      id: "test",
      providerId: "test",
      modelName: "test",
      baseUrl: "https://example.test/v1",
    });

    try {
      await adapter.call({ userPrompt: "test" });
      throw new Error("expected adapter call to fail");
    } catch (error) {
      expect((error as Error & { status?: number }).status).toBe(503);
      expect((error as Error).message).toContain("upstream unavailable");
    }
  });

  test("passes configured OpenAI-compatible reasoning effort", async () => {
    let requestBody: any;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {},
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = createOpenAICompatibleAdapter({
      kind: "openai-compatible",
      id: "openrouter:test",
      providerId: "openrouter",
      modelName: "provider/model",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoningEffort: "medium",
    });

    await adapter.call({ userPrompt: "test" });

    expect(requestBody.reasoning).toEqual({ effort: "medium" });
  });

  test("OpenAI-compatible adapter passes through usage.cost as costUsd", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0042 },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const adapter = createOpenAICompatibleAdapter({
      kind: "openai-compatible",
      id: "openrouter:test",
      providerId: "openrouter",
      modelName: "provider/model",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    const result = await adapter.call({ userPrompt: "test" });
    expect(result.costUsd).toBe(0.0042);
  });

  test("Anthropic adapter sends a forced tool call for jsonSchema and decodes the tool_use block", async () => {
    process.env.TEST_ANTHROPIC_API_KEY = "test";
    let requestBody: any;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "submit_score", input: { score: 4, rationale: "Good" } }],
          usage: {},
          stop_reason: "tool_use",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const adapter = createAnthropicAdapter({
      kind: "anthropic",
      id: "test",
      modelName: "test",
      apiKeyEnvVar: "TEST_ANTHROPIC_API_KEY",
    });
    const result = await adapter.call({
      userPrompt: "test",
      jsonSchema: { name: "submit_score", schema: { type: "object" } },
    });

    expect(requestBody.tool_choice).toEqual({ type: "tool", name: "submit_score" });
    expect(result.text).toBe(JSON.stringify({ score: 4, rationale: "Good" }));
  });

  test("OpenAI-compatible adapter sends response_format json_schema for jsonSchema", async () => {
    let requestBody: any;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"score":3}' }, finish_reason: "stop" }],
          usage: {},
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const adapter = createOpenAICompatibleAdapter({
      kind: "openai-compatible",
      id: "openrouter:test",
      providerId: "openrouter",
      modelName: "provider/model",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    await adapter.call({
      userPrompt: "test",
      jsonSchema: { name: "submit_score", schema: { type: "object" } },
    });

    expect(requestBody.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "submit_score",
        schema: { type: "object" },
        strict: true,
      },
    });
  });
});
