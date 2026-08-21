/** OpenAI-style function tool definition, passed through verbatim in the request body. */
export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

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
  /** Tool definitions offered to the model, unrelated to jsonSchema's forced-structured-output path. */
  tools?: ToolSpec[];
  /** Default "auto" when tools is set. "required" forces a tool call. */
  toolChoice?: "auto" | "required";
}

export interface ModelToolCall {
  id: string;
  name: string;
  /** Raw JSON-encoded arguments string as returned by the model; not pre-parsed since malformed
   * JSON is itself a real, scorable protocol failure. */
  arguments: string;
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
  /** Present when the model made one or more tool calls. */
  toolCalls?: ModelToolCall[];
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
