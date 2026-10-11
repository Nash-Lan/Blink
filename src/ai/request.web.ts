import { deepSeekGraphResponseSchema, predefinedIcons } from '../domain/ai';
import type { AIRequestAdapter } from './types';

export const aiRequest: AIRequestAdapter = {
  async analyzeIcon({ text, recordType, model, proxyUrl, timeoutMs = 12000 }) {
    const effectiveTimeoutMs = getTestTimeoutMs() ?? timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          recordType,
          model,
          allowedIcons: predefinedIcons.map(({ icon, label }) => ({ icon, label })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await safeErrorMessage(response);
        throw new Error(message || `DeepSeek proxy failed with HTTP ${response.status}.`);
      }
      const raw: unknown = await response.json();
      return deepSeekGraphResponseSchema.parse(raw);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('DeepSeek request timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
};

function getTestTimeoutMs(): number | null {
  const candidate = (globalThis as { __BLINK_AI_TIMEOUT_MS?: unknown }).__BLINK_AI_TIMEOUT_MS;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

async function safeErrorMessage(response: Response): Promise<string | null> {
  try {
    const raw: unknown = await response.json();
    if (raw && typeof raw === 'object' && 'error' in raw && typeof raw.error === 'string') {
      return raw.error;
    }
  } catch {
    return null;
  }
  return null;
}
