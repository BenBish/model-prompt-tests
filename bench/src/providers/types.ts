export interface ModelCallInput {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelCallResult {
  text: string;
  raw: unknown;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  stopReason?: string;
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
}

export type ModelMatrixEntry = AnthropicAdapterConfig | OpenAICompatibleAdapterConfig;
