export interface ModelCallInput {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * When set, adapters attempt a schema-enforced structured response
   * (Anthropic: forced tool call; OpenAI-compatible: response_format json_schema).
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}

export interface ModelCallResult {
  text: string;
  raw: unknown;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  stopReason?: string;
  /** Provider-reported billed cost in USD when available (e.g. OpenRouter usage.cost). */
  costUsd?: number;
}

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

export interface ModelAdapter {
  readonly providerId: string;
  readonly modelName: string;
  call(input: ModelCallInput): Promise<ModelCallResult>;
}

export interface AnthropicAdapterConfig {
  kind: "anthropic";
  id: string;
  modelName: string;
  apiKeyEnvVar: string;
  baseUrl?: string;
  anthropicVersion?: string;
  maxTokens?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
  enabled?: boolean;
  pricing?: ModelPricing;
}

export interface OpenAICompatibleAdapterConfig {
  kind: "openai-compatible";
  id: string;
  providerId: string;
  modelName: string;
  baseUrl: string;
  apiKeyEnvVar?: string;
  extraHeaders?: Record<string, string>;
  reasoningEffort?: string;
  maxTokens?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
  enabled?: boolean;
  pricing?: ModelPricing;
}

export type ModelMatrixEntry = AnthropicAdapterConfig | OpenAICompatibleAdapterConfig;
