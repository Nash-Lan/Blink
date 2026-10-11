import * as SecureStore from 'expo-secure-store';
import { deepSeekGraphResponseSchema, predefinedIcons } from '../domain/ai';
import type { AIRequestAdapter } from './types';

const DEEPSEEK_KEY_NAME = 'blink.deepseek.apiKey';

export const aiRequest: AIRequestAdapter = {
  async analyzeIcon({ text, recordType, model, timeoutMs = 12000 }) {
    const apiKey = await SecureStore.getItemAsync(DEEPSEEK_KEY_NAME);
    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured on this device.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildDeepSeekBody({ text, recordType, model })),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DeepSeek failed with HTTP ${response.status}.`);
      }
      const raw = await response.json();
      const content = raw?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('DeepSeek returned an empty response.');
      }
      return deepSeekGraphResponseSchema.parse(JSON.parse(content));
    } finally {
      clearTimeout(timeout);
    }
  },
};

function buildDeepSeekBody({ text, recordType, model }: { text: string; recordType: 'note' | 'deadline'; model: string }) {
  return {
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 120,
    messages: [
      {
        role: 'system',
        content: [
          'You choose one semantic icon for a private productivity app.',
          'For notes with clear steps, cause/effect, or process flow, you may return a basic Mermaid flowchart.',
          'For ordinary notes and all deadlines, return an icon.',
          'Return only JSON. Icon shape: {"kind":"icon","version":1,"icon":"...","label":"..."}. Mermaid shape: {"kind":"mermaid","version":1,"definition":"flowchart TD\\n  A[Step] --> B[Step]"}',
          'Mermaid must use only flowchart TD, flowchart LR, graph TD, or graph LR. No click, links, HTML, styles, init directives, or scripts.',
          `Allowed icons: ${predefinedIcons.map(({ icon, label }) => `${icon}=${label}`).join(', ')}`,
        ].join('\n'),
      },
      { role: 'user', content: `Record type: ${recordType}\nText:\n${text.slice(0, 2000)}` },
    ],
  };
}
