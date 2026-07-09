import type {
  ModelAdapter,
  ModelCallInput,
  ModelCallResult,
  OpenAICompatibleAdapterConfig,
} from "./types";

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;

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
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        headers,
        body: JSON.stringify({
          model: config.modelName,
          messages,
          max_tokens: input.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: input.temperature,
        }),
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
          `${config.providerId} API error ${response.status}: ${detail.slice(0, 500)}`,
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      if (body === undefined) {
        throw new Error(`${config.providerId} API returned a non-JSON success response`);
      }

      const choice = body.choices?.[0];
      if (typeof choice?.message?.content !== "string") {
        throw new Error(`${config.providerId} API response did not contain message content`);
      }

      return {
        text: choice.message.content,
        raw: body,
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
        latencyMs,
        stopReason: choice?.finish_reason,
      };
    },
  };
}
