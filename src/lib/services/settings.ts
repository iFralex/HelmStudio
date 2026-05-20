import { getSetting, setSetting } from '../db/queries';
import { getDb } from '../db/client';
import { env } from '../env';

export type FiltersSetting = {
  minSubscribers: number;
  maxSubscribers: number;
  country: string;
  language: string;
  requalifyAfterDays: number;
  inactiveDays: number;
};

export type PipelineConfigSetting = {
  keywordsPerRun: number;
  targetQualifiedPerRun: number;
};

const CACHE_TTL_MS = 30_000;

type Db = ReturnType<typeof getDb>;
type CacheEntry<T> = { value: T; expiresAt: number };

let filtersCache: CacheEntry<FiltersSetting> | null = null;
let pipelineConfigCache: CacheEntry<PipelineConfigSetting> | null = null;

export function _resetSettingsCache(): void {
  filtersCache = null;
  pipelineConfigCache = null;
}

function envFilterDefaults(): FiltersSetting {
  return {
    minSubscribers: env.PIPELINE_MIN_SUBSCRIBERS,
    maxSubscribers: env.PIPELINE_MAX_SUBSCRIBERS,
    country: env.PIPELINE_TARGET_COUNTRY,
    language: env.PIPELINE_TARGET_LANGUAGE,
    requalifyAfterDays: env.PIPELINE_REQUALIFY_AFTER_DAYS,
    inactiveDays: env.PIPELINE_INACTIVE_DAYS,
  };
}

function envPipelineConfigDefaults(): PipelineConfigSetting {
  return {
    keywordsPerRun: env.PIPELINE_KEYWORDS_PER_RUN,
    targetQualifiedPerRun: env.PIPELINE_TARGET_QUALIFIED_PER_RUN,
  };
}

export async function getFilters(db: Db = getDb()): Promise<FiltersSetting> {
  const now = Date.now();
  if (filtersCache && filtersCache.expiresAt > now) return filtersCache.value;

  let value = await getSetting<FiltersSetting>('filters', db);
  if (!value) {
    value = envFilterDefaults();
    await setSetting('filters', value, db);
  }

  filtersCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function updateFilters(
  patch: Partial<FiltersSetting>,
  db: Db = getDb(),
): Promise<FiltersSetting> {
  const current = await getFilters(db);
  const updated = { ...current, ...patch };
  await setSetting('filters', updated, db);
  filtersCache = { value: updated, expiresAt: Date.now() + CACHE_TTL_MS };
  return updated;
}

export async function getPipelineConfig(db: Db = getDb()): Promise<PipelineConfigSetting> {
  const now = Date.now();
  if (pipelineConfigCache && pipelineConfigCache.expiresAt > now) return pipelineConfigCache.value;

  let value = await getSetting<PipelineConfigSetting>('pipeline_config', db);
  if (!value) {
    value = envPipelineConfigDefaults();
    await setSetting('pipeline_config', value, db);
  }

  pipelineConfigCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function updatePipelineConfig(
  patch: Partial<PipelineConfigSetting>,
  db: Db = getDb(),
): Promise<PipelineConfigSetting> {
  const current = await getPipelineConfig(db);
  const updated = { ...current, ...patch };
  await setSetting('pipeline_config', updated, db);
  pipelineConfigCache = { value: updated, expiresAt: Date.now() + CACHE_TTL_MS };
  return updated;
}
