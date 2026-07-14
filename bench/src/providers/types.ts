export interface ModelCallInput {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * When set, asks the provider to constrain its output to this JSON schema
   * (Anthropic: forced tool call; OpenAI-compatible: response_format json_schema).
   * Adapters that can't honor it should throw so the caller can fall back.
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
  /** Provider-reported cost in USD, when the API returns actual billed cost (e.g. OpenRouter). */
  costUsd?: number;
}

export interface ModelAdapter {
  readonly providerId: string;
  readonly modelName: string;
  call(input: ModelCallInput): Promise<ModelCallResult>;
}

/** USD price per million tokens. Used to compute cost when the provider doesn't report it directly. */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
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
