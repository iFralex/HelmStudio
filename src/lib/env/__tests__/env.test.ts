import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('env module', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.resetModules();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    savedEnv = { ...process.env };
    // Clear all vars and use 'production' to skip dotenv file loading
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, { NODE_ENV: 'production' });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, savedEnv);
  });

  it('calls process.exit(1) when required vars are missing', async () => {
    await import('../../env');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('logs field-level errors for missing required vars', async () => {
    const errors: unknown[] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(...args);
    });
    await import('../../env');
    const output = errors.map((a) => JSON.stringify(a)).join(' ');
    expect(output).toContain('ADMIN_PASSWORD');
    expect(output).toContain('SESSION_SECRET');
    consoleErrorSpy.mockRestore();
  });

  it('does not call process.exit when all required vars are present', async () => {
    process.env.ADMIN_PASSWORD = 'securepassword123';
    process.env.SESSION_SECRET = 'a'.repeat(32);
    process.env.YOUTUBE_API_KEY = 'a'.repeat(20);
    process.env.LLM_BASE_URL = 'http://localhost:11434';
    process.env.LLM_MODEL_THINK = 'deepseek-r1';
    process.env.LLM_MODEL_FAST = 'llama3';

    await import('../../env');

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exports resolved env values when vars are valid', async () => {
    process.env.ADMIN_PASSWORD = 'securepassword123';
    process.env.SESSION_SECRET = 'a'.repeat(32);
    process.env.YOUTUBE_API_KEY = 'a'.repeat(20);
    process.env.LLM_BASE_URL = 'http://localhost:11434';
    process.env.LLM_MODEL_THINK = 'deepseek-r1';
    process.env.LLM_MODEL_FAST = 'llama3';

    const { env } = await import('../../env');

    expect(env.NODE_ENV).toBe('production');
    expect(env.PIPELINE_MIN_SUBSCRIBERS).toBe(80000);
    expect(env.PIPELINE_TARGET_COUNTRY).toBe('IT');
    expect(env.LOG_LEVEL).toBe('info');
  });
});

describe('EnvSchemaRefined cross-field validation', () => {
  const validBase = {
    ADMIN_PASSWORD: 'securepassword123',
    SESSION_SECRET: 'a'.repeat(32),
    YOUTUBE_API_KEY: 'a'.repeat(20),
    LLM_BASE_URL: 'http://localhost:11434',
    LLM_MODEL_THINK: 'deepseek-r1',
    LLM_MODEL_FAST: 'llama3',
  };

  it('fails when PIPELINE_MIN_SUBSCRIBERS >= PIPELINE_MAX_SUBSCRIBERS', async () => {
    const { EnvSchemaRefined } = await import('../../env');
    const result = EnvSchemaRefined.safeParse({
      ...validBase,
      PIPELINE_MIN_SUBSCRIBERS: '1000000',
      PIPELINE_MAX_SUBSCRIBERS: '80000',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.PIPELINE_MIN_SUBSCRIBERS).toBeDefined();
    }
  });

  it('passes when PIPELINE_MIN_SUBSCRIBERS < PIPELINE_MAX_SUBSCRIBERS', async () => {
    const { EnvSchemaRefined } = await import('../../env');
    const result = EnvSchemaRefined.safeParse({
      ...validBase,
      PIPELINE_MIN_SUBSCRIBERS: '80000',
      PIPELINE_MAX_SUBSCRIBERS: '1000000',
    });
    expect(result.success).toBe(true);
  });
});

describe('EnvSchema direct validation', () => {
  it('fails when required vars are missing', async () => {
    const { EnvSchema } = await import('../../env');
    const result = EnvSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.ADMIN_PASSWORD).toBeDefined();
      expect(errors.SESSION_SECRET).toBeDefined();
      expect(errors.YOUTUBE_API_KEY).toBeDefined();
      expect(errors.LLM_BASE_URL).toBeDefined();
      expect(errors.LLM_MODEL_THINK).toBeDefined();
      expect(errors.LLM_MODEL_FAST).toBeDefined();
    }
  });

  it('applies defaults for optional vars', async () => {
    const { EnvSchema } = await import('../../env');
    const result = EnvSchema.safeParse({
      ADMIN_PASSWORD: 'securepassword123',
      SESSION_SECRET: 'a'.repeat(32),
      YOUTUBE_API_KEY: 'a'.repeat(20),
      LLM_BASE_URL: 'http://localhost:11434',
      LLM_MODEL_THINK: 'deepseek-r1',
      LLM_MODEL_FAST: 'llama3',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.PIPELINE_MIN_SUBSCRIBERS).toBe(80000);
      expect(result.data.DATA_DIR).toBe('./data');
    }
  });
});
