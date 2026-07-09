import type {
  ModelAdapter,
  ModelCallInput,
  ModelCallResult,
  OpenAICompatibleAdapterConfig,
} from "./types";

const DEFAULT_MAX_TOKENS = 4096;

export function createOpenAICompatibleAdapter(
  config: OpenAICompatibleAdapterConfig,
): ModelAdapter {
  return {
    providerId: config.providerId,
    modelName: config.modelName,

    async call(input: ModelCallInput): Promise<ModelCallResult> {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...config.extraHeaders,
      };

      if (config.apiKeyEnvVar) {
        const apiKey = process.env[config.apiKeyEnvVar];
        if (apiKey) {
          headers.authorization = `Bearer ${apiKey}`;
        }
      }

      const messages = [];
      if (input.systemPrompt) {
        messages.push({ role: "system", content: input.systemPrompt });
      }
      messages.push({ role: "user", content: input.userPrompt });

      const started = performance.now();
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.modelName,
          messages,
          max_tokens: input.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: input.temperature,
        }),
      });
      const latencyMs = performance.now() - started;

      const body: any = await response.json();

      if (!response.ok) {
        throw new Error(
          `${config.providerId} API error ${response.status}: ${JSON.stringify(body).slice(0, 500)}`,
        );
      }

      const choice = body.choices?.[0];

      return {
        text: choice?.message?.content ?? "",
        raw: body,
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
        latencyMs,
        stopReason: choice?.finish_reason,
      };
    },
  };
}
