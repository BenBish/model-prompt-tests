import type {
  AnthropicAdapterConfig,
  ModelAdapter,
  ModelCallInput,
  ModelCallResult,
} from "./types";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;

export function createAnthropicAdapter(config: AnthropicAdapterConfig): ModelAdapter {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const anthropicVersion = config.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;

  return {
    providerId: "anthropic",
    modelName: config.modelName,

    async call(input: ModelCallInput): Promise<ModelCallResult> {
      const apiKey = process.env[config.apiKeyEnvVar];
      if (!apiKey) {
        throw new Error(`missing env var ${config.apiKeyEnvVar} for anthropic model ${config.modelName}`);
      }

      const requestBody: Record<string, unknown> = {
        model: config.modelName,
        max_tokens: input.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: input.temperature,
        system: input.systemPrompt,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: input.userPrompt }],
          },
        ],
      };
      if (input.jsonSchema) {
        requestBody.tools = [
          {
            name: input.jsonSchema.name,
            description: "Submit the structured result for this request.",
            input_schema: input.jsonSchema.schema,
          },
        ];
        requestBody.tool_choice = { type: "tool", name: input.jsonSchema.name };
      }

      const started = performance.now();
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": anthropicVersion,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const latencyMs = performance.now() - started;

      const responseText = await response.text();
      let body: any;
      try {
        body = JSON.parse(responseText);
      } catch {
        body = undefined;
      }

      if (!response.ok) {
        const detail = body === undefined ? responseText : JSON.stringify(body);
        const error = new Error(
          `anthropic API error ${response.status}: ${detail.slice(0, 500)}`,
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      if (body === undefined) {
        throw new Error("anthropic API returned a non-JSON success response");
      }

      if (input.jsonSchema) {
        const toolUseBlock = Array.isArray(body.content)
          ? body.content.find((block: { type: string }) => block.type === "tool_use")
          : undefined;
        if (typeof toolUseBlock?.input !== "object" || toolUseBlock.input === null) {
          throw new Error("anthropic API response did not contain the expected tool_use block");
        }
        return {
          text: JSON.stringify(toolUseBlock.input),
          raw: body,
          inputTokens: body.usage?.input_tokens,
          outputTokens: body.usage?.output_tokens,
          latencyMs,
          stopReason: body.stop_reason,
        };
      }

      const textBlock = Array.isArray(body.content)
        ? body.content.find((block: { type: string }) => block.type === "text")
        : undefined;
      if (typeof textBlock?.text !== "string") {
        throw new Error("anthropic API response did not contain a text block");
      }

      return {
        text: textBlock.text,
        raw: body,
        inputTokens: body.usage?.input_tokens,
        outputTokens: body.usage?.output_tokens,
        latencyMs,
        stopReason: body.stop_reason,
      };
    },
  };
}
