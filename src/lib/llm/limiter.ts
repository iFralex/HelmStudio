import pLimit from 'p-limit';

const llmLimit = pLimit(3);

export const withLlmLimit = <T>(fn: () => Promise<T>) => llmLimit(fn);
