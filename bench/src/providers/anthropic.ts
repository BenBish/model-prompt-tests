import type {
  AnthropicAdapterConfig,
  ModelAdapter,
  ModelCallInput,
  ModelCallResult,
} from "./types";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

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

      const started = performance.now();
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": anthropicVersion,
          "content-type": "application/json",
        },
        body: JSON.stringify({
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
        }),
      });
      const latencyMs = performance.now() - started;

      const body: any = await response.json();

      if (!response.ok) {
        throw new Error(
          `anthropic API error ${response.status}: ${JSON.stringify(body).slice(0, 500)}`,
        );
      }

      const textBlock = Array.isArray(body.content)
        ? body.content.find((block: { type: string }) => block.type === "text")
        : undefined;

      return {
        text: textBlock?.text ?? "",
        raw: body,
        inputTokens: body.usage?.input_tokens,
        outputTokens: body.usage?.output_tokens,
        latencyMs,
        stopReason: body.stop_reason,
      };
    },
  };
}
