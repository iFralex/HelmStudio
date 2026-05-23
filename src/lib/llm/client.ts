import OpenAI from 'openai';
import { env } from '@/lib/env';

let _client: OpenAI | null = null;

export function getLlm(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    timeout: 20 * 60 * 1000, // 20 min — flex tier can take up to 15 min per request
  });
  return _client;
}

export type ModelTier = 'think' | 'fast';

export const MODELS: Record<ModelTier, string> = {
  think: env.LLM_MODEL_THINK,
  fast: env.LLM_MODEL_FAST,
};

export function __setLlmForTest(fakeClient: OpenAI): void {
  _client = fakeClient;
}

export function __resetLlmForTest(): void {
  _client = null;
}
