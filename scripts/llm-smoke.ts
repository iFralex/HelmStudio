/**
 * Smoke test for the LLM client.
 * Usage: pnpm tsx scripts/llm-smoke.ts
 * Requires LLM_BASE_URL, LLM_MODEL_THINK/LLM_MODEL_FAST in .env, plus a running local proxy.
 * Writes the raw LLM envelope to data/raw/llm/placeholder/... as a side-effect.
 */

import { z } from 'zod';
import { env } from '../src/lib/env';
import { callLLM } from '../src/lib/llm/call';
import { version, system, userTemplate } from '../src/lib/llm/prompts/placeholder';
import { absolutePath } from '../src/lib/storage/paths';

const OkSchema = z.object({ ok: z.literal(true) });

async function checkProxyReachable(): Promise<void> {
  const healthUrl = `${env.LLM_BASE_URL}/models`;
  try {
    const res = await fetch(healthUrl, {
      headers: { Authorization: `Bearer ${env.LLM_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(`Local proxy not reachable at ${healthUrl}: ${String(err)}`);
    process.exit(1);
  }
}

async function main() {
  console.log(`LLM_BASE_URL: ${env.LLM_BASE_URL}`);
  console.log(`LLM_MODEL_THINK: ${env.LLM_MODEL_THINK}`);
  console.log(`LLM_MODEL_FAST: ${env.LLM_MODEL_FAST}`);

  console.log('\nChecking proxy reachability...');
  await checkProxyReachable();
  console.log('Proxy reachable.');

  console.log('\nIssuing callLLM with placeholder prompt...');
  const result = await callLLM({
    tier: 'think',
    promptVersion: version,
    system,
    user: userTemplate({}),
    schema: OkSchema,
    context: { channelId: 'smoke-test', kind: 'placeholder' },
  });

  const { parsed, usage, latencyMs, modelUsed, rawPath } = result;

  if (parsed.ok !== true) {
    console.error('Assertion failed: expected { ok: true }, got:', parsed);
    process.exit(1);
  }

  console.log('\nSmoke test passed.');
  console.log(`  Model used:    ${modelUsed}`);
  console.log(`  Latency:       ${latencyMs.toFixed(0)} ms`);
  console.log(`  Input tokens:  ${usage.inputTokens}`);
  console.log(`  Output tokens: ${usage.outputTokens}`);
  console.log(`  Raw path:      ${absolutePath(rawPath)}`);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
