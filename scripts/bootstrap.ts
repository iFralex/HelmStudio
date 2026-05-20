import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, join } from 'path';
import { config as loadDotenv } from 'dotenv';

const ROOT = resolve(process.cwd());
const envPath = join(ROOT, '.env');
const envExamplePath = join(ROOT, '.env.example');

// Ensure .env exists
if (!existsSync(envPath)) {
  if (!existsSync(envExamplePath)) {
    console.error('❌ Neither .env nor .env.example found. Cannot bootstrap.');
    process.exit(1);
  }
  copyFileSync(envExamplePath, envPath);
  console.warn(
    '⚠️  .env not found — copied from .env.example. Fill in real values before starting the app.',
  );
} else {
  console.log('✓ .env found');
}

loadDotenv({ path: envPath });

const dataDir = resolve(process.env.DATA_DIR ?? './data');
const dirs = [dataDir, join(dataDir, 'logs'), join(dataDir, 'raw')];

for (const dir of dirs) {
  mkdirSync(dir, { recursive: true });
  console.log(`✓ Directory ready: ${dir}`);
}

console.log('\nRunning db:init...');
try {
  execSync('npm run db:init', { stdio: 'inherit', cwd: ROOT });
} catch {
  console.error('❌ db:init failed');
  process.exit(1);
}

const SECRET_KEYS = new Set(['ADMIN_PASSWORD', 'SESSION_SECRET', 'YOUTUBE_API_KEY', 'LLM_API_KEY']);

const DISPLAY_KEYS = [
  'NODE_ENV',
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'DATABASE_PATH',
  'YOUTUBE_API_KEY',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL_THINK',
  'LLM_MODEL_FAST',
  'PIPELINE_TRIGGER_HOUR',
  'PIPELINE_TRIGGER_MINUTE',
  'PIPELINE_MIN_SUBSCRIBERS',
  'PIPELINE_MAX_SUBSCRIBERS',
  'PIPELINE_TARGET_COUNTRY',
  'PIPELINE_TARGET_LANGUAGE',
  'PIPELINE_KEYWORDS_PER_RUN',
  'PIPELINE_TARGET_QUALIFIED_PER_RUN',
  'PIPELINE_INACTIVE_DAYS',
  'PIPELINE_REQUALIFY_AFTER_DAYS',
  'PIPELINE_YOUTUBE_QUOTA_DAILY_LIMIT',
  'PIPELINE_YOUTUBE_QUOTA_SAFETY_BUFFER',
  'DATA_DIR',
  'LOG_LEVEL',
];

console.log('\nResolved environment:');
for (const key of DISPLAY_KEYS) {
  const raw = process.env[key];
  const display = raw === undefined ? '(unset)' : SECRET_KEYS.has(key) ? '***' : raw;
  console.log(`  ${key}=${display}`);
}

console.log('\n✅ Bootstrap complete. Run `pnpm dev` to start the development server.');
