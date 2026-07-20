export interface RubricEntry {
  score: 1 | 2 | 3 | 4 | 5;
  description: string;
}

export interface RubricDimension {
  id: string;
  weight: number;
  description: string;
}

export interface PromptDefinition {
  id: string;
  filePath: string;
  title: string;
  promptText: string;
  whatThisTests: string[];
  strongSignals: string[];
  weakSignals: string[];
  rubric: RubricEntry[];
  dimensions?: RubricDimension[];
  variants?: {
    easier?: string;
    harder?: string;
    differentAngle?: string;
  };
  notes?: string;
}
