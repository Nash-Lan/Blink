import type { DeepSeekGraphResponse } from '../domain/ai';

export type AnalyzeIconInput = {
  text: string;
  recordType: 'note' | 'deadline';
  model: string;
  proxyUrl: string;
  timeoutMs?: number;
};

export type AIRequestAdapter = {
  analyzeIcon(input: AnalyzeIconInput): Promise<DeepSeekGraphResponse>;
};
