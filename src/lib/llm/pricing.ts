type ModelPricing = { inputPer1M: number; outputPer1M: number };

// Cost per 1M tokens (USD). Prefix-matched against the model name returned by the API.
// Sorted longest-prefix-first so more specific names win.
const PRICING: Array<[string, ModelPricing]> = [
  // Gemini
  ['gemini-2.5-pro',       { inputPer1M: 1.25,  outputPer1M: 10.00 }],
  ['gemini-2.5-flash',     { inputPer1M: 0.15,  outputPer1M: 0.60  }],
  ['gemini-2.0-flash-lite',{ inputPer1M: 0.075, outputPer1M: 0.30  }],
  ['gemini-2.0-flash',     { inputPer1M: 0.10,  outputPer1M: 0.40  }],
  ['gemini-1.5-pro',       { inputPer1M: 1.25,  outputPer1M: 5.00  }],
  ['gemini-1.5-flash',     { inputPer1M: 0.075, outputPer1M: 0.30  }],
  ['gemini-3.1-flash',     { inputPer1M: 0.075, outputPer1M: 0.30  }],
  ['gemini-3-flash',       { inputPer1M: 0.30,  outputPer1M: 2.50  }],
  // Claude
  ['claude-opus-4',        { inputPer1M: 15.00, outputPer1M: 75.00 }],
  ['claude-sonnet-4',      { inputPer1M: 3.00,  outputPer1M: 15.00 }],
  ['claude-haiku-4',       { inputPer1M: 0.80,  outputPer1M: 4.00  }],
  ['claude-3-5-sonnet',    { inputPer1M: 3.00,  outputPer1M: 15.00 }],
  ['claude-3-5-haiku',     { inputPer1M: 0.80,  outputPer1M: 4.00  }],
  ['claude-3-opus',        { inputPer1M: 15.00, outputPer1M: 75.00 }],
  ['claude-3-haiku',       { inputPer1M: 0.25,  outputPer1M: 1.25  }],
];

export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  serviceTier?: string | null,
): number | null {
  const lower = model.toLowerCase();
  const entry = PRICING.find(([prefix]) => lower.startsWith(prefix));
  if (!entry) return null;
  const { inputPer1M, outputPer1M } = entry[1];
  const raw = (inputTokens * inputPer1M + outputTokens * outputPer1M) / 1_000_000;
  return serviceTier === 'flex' ? raw * 0.5 : raw;
}
