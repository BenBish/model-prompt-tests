import { createAnthropicAdapter } from "./anthropic";
import { createOpenAICompatibleAdapter } from "./openaiCompatible";
import type { ModelAdapter, ModelMatrixEntry } from "./types";

export function createAdapter(entry: ModelMatrixEntry): ModelAdapter {
  switch (entry.kind) {
    case "anthropic":
      return createAnthropicAdapter(entry);
    case "openai-compatible":
      return createOpenAICompatibleAdapter(entry);
  }
}
