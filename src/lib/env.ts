import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

// Load .env in non-production; in production, env vars are injected by the host OS
if (process.env.NODE_ENV !== 'production') {
  loadDotenv();
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Auth (plan 01)
  ADMIN_PASSWORD: z.string().min(8),
  SESSION_SECRET: z.string().min(32),

  // Database (plan 02)
  DATABASE_PATH: z.string().default('./data/pipeline.db'),

  // YouTube (plan 04)
  YOUTUBE_API_KEY: z.string().min(20),

  // LLM (plan 05)
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().default('not-needed'),
  LLM_MODEL_THINK: z.string().min(1),
  LLM_MODEL_FAST: z.string().min(1),

  // Pipeline (spec §14)
  PIPELINE_TRIGGER_HOUR: z.coerce.number().int().min(0).max(23).default(4),
  PIPELINE_TRIGGER_MINUTE: z.coerce.number().int().min(0).max(59).default(0),
  PIPELINE_MIN_SUBSCRIBERS: z.coerce.number().int().nonnegative().default(80000),
  PIPELINE_MAX_SUBSCRIBERS: z.coerce.number().int().positive().default(1000000),
  PIPELINE_TARGET_COUNTRY: z.string().length(2).default('IT'),
  PIPELINE_TARGET_LANGUAGE: z.string().length(2).default('it'),
  PIPELINE_KEYWORDS_PER_RUN: z.coerce.number().int().positive().default(30),
  PIPELINE_TARGET_QUALIFIED_PER_RUN: z.coerce.number().int().positive().default(50),
  PIPELINE_INACTIVE_DAYS: z.coerce.number().int().positive().default(60),
  PIPELINE_REQUALIFY_AFTER_DAYS: z.coerce.number().int().positive().default(90),
  PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT: z.coerce.number().int().positive().default(10000),
  PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER: z.coerce.number().int().nonnegative().default(500),

  // Storage
  DATA_DIR: z.string().default('./data'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Public contact form (Resend)
  RESEND_API_KEY: z.string().optional(),
  CONTACT_EMAIL_TO: z.string().email().default('ciao@helmstudio.it'),
  CONTACT_EMAIL_FROM: z.string().default('HELM Studio <onboarding@resend.dev>'),

  // SEO — absolute base URL used in sitemap, canonical links, openGraph, JSON-LD.
  // No trailing slash. In dev it can be http://localhost:3000.
  SITE_URL: z.string().url().default('https://helmstudio.it'),
});

const EnvSchemaRefined = EnvSchema.refine(
  (d) => d.PIPELINE_MIN_SUBSCRIBERS < d.PIPELINE_MAX_SUBSCRIBERS,
  {
    message: 'PIPELINE_MIN_SUBSCRIBERS must be less than PIPELINE_MAX_SUBSCRIBERS',
    path: ['PIPELINE_MIN_SUBSCRIBERS'],
  },
);

export type Env = z.infer<typeof EnvSchema>;

export { EnvSchema, EnvSchemaRefined };

const parsed = EnvSchemaRefined.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
