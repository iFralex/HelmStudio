import OpenAI from 'openai';
import { env } from '@/lib/env';

let _client: OpenAI | null = null;

export function getLlm(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    baseURL: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
  });
  return _client;
}

export const MODELS = {
  think: () => env.LLM_MODEL_THINK,
  fast: () => env.LLM_MODEL_FAST,
} as const;

export type ModelTier = keyof typeof MODELS;

export function __setLlmForTest(fakeClient: OpenAI): void {
  _client = fakeClient;
}

export function __resetLlmForTest(): void {
  _client = null;
}
