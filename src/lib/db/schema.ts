import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const channels = sqliteTable(
  'channels',
  {
    id: text('id').primaryKey(),
    handle: text('handle'),
    title: text('title').notNull(),
    description: text('description'),
    country: text('country'),
    defaultLanguage: text('default_language'),
    customUrl: text('custom_url'),

    subscriberCount: integer('subscriber_count'),
    viewCount: integer('view_count'),
    videoCount: integer('video_count'),

    uploadsPlaylistId: text('uploads_playlist_id'),
    thumbnailUrl: text('thumbnail_url'),
    channelPublishedAt: text('channel_published_at'),

    discoveryStatus: text('discovery_status', {
      enum: ['candidate', 'enriched', 'rejected_pre_qual', 'qualified', 'rejected_post_qual'],
    })
      .notNull()
      .default('candidate'),
    rejectionReason: text('rejection_reason'),
    discoverySource: text('discovery_source'),

    outreachStatus: text('outreach_status', {
      enum: ['none', 'email_added', 'drafted', 'sent', 'replied', 'no_reply', 'ignored'],
    })
      .notNull()
      .default('none'),
    email: text('email'),
    emailAddedAt: integer('email_added_at', { mode: 'timestamp' }),
    outreachSentAt: integer('outreach_sent_at', { mode: 'timestamp' }),
    outreachNotes: text('outreach_notes'),

    latestQualificationId: integer('latest_qualification_id'),
    latestAutomationScore: integer('latest_automation_score'),

    rawMetaPath: text('raw_meta_path'),

    discoveredAt: integer('discovered_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    lastFetchedAt: integer('last_fetched_at', { mode: 'timestamp' }),
    lastQualifiedAt: integer('last_qualified_at', { mode: 'timestamp' }),
  },
  (t) => ({
    idxDiscoveryStatus: index('idx_channels_discovery_status').on(t.discoveryStatus),
    idxOutreachStatus: index('idx_channels_outreach_status').on(t.outreachStatus),
    idxScore: index('idx_channels_score').on(t.latestAutomationScore),
    idxCountry: index('idx_channels_country').on(t.country),
  }),
);

export const videos = sqliteTable(
  'videos',
  {
    id: text('id').primaryKey(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
    duration: text('duration'),
    durationSeconds: integer('duration_seconds'),
    viewCount: integer('view_count'),
    likeCount: integer('like_count'),
    commentCount: integer('comment_count'),
    thumbnailUrl: text('thumbnail_url'),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    categoryId: text('category_id'),
    defaultLanguage: text('default_language'),
    defaultAudioLanguage: text('default_audio_language'),
    rawPath: text('raw_path'),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxChannel: index('idx_videos_channel').on(t.channelId),
    idxPublished: index('idx_videos_published').on(t.publishedAt),
  }),
);

export const videoSelections = sqliteTable(
  'video_selections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    runId: integer('run_id').references(() => pipelineRuns.id),

    videoClassifications: text('video_classifications', { mode: 'json' }).notNull(),
    selectedVideoIds: text('selected_video_ids', { mode: 'json' }).notNull(),
    formatConsistencySummary: text('format_consistency_summary'),
    selectionRationale: text('selection_rationale'),

    modelUsed: text('model_used').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: real('cost_usd'),
    latencyMs: integer('latency_ms'),
    rawResponsePath: text('raw_response_path').notNull(),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxChannel: index('idx_vselect_channel').on(t.channelId),
  }),
);

export const transcripts = sqliteTable(
  'transcripts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),

    language: text('language'),
    source: text('source', { enum: ['youtube_transcript', 'captions_api'] }).notNull(),
    text: text('text'),
    segments: text('segments', { mode: 'json' }).$type<{ text: string; start: number; duration: number }[] | null>(),
    characterCount: integer('character_count'),
    fetchSucceeded: integer('fetch_succeeded', { mode: 'boolean' }).notNull().default(true),
    fetchError: text('fetch_error'),
    rawPath: text('raw_path'),

    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqVideoId: uniqueIndex('uniq_transcripts_video_id').on(t.videoId),
    idxChannel: index('idx_transcripts_channel').on(t.channelId),
  }),
);

export const qualifications = sqliteTable(
  'qualifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    runId: integer('run_id').references(() => pipelineRuns.id),
    videoSelectionId: integer('video_selection_id').references(() => videoSelections.id),

    modelUsed: text('model_used').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: real('cost_usd'),
    latencyMs: integer('latency_ms'),

    nicheClassification: text('niche_classification'),
    formatType: text('format_type'),
    automationPotentialScore: integer('automation_potential_score'),
    workflowRepeatabilityScore: integer('workflow_repeatability_score'),
    evidenceStrengthScore: integer('evidence_strength_score'),
    commercialViabilityScore: integer('commercial_viability_score'),
    analysisMode: text('analysis_mode', { enum: ['evidence_driven', 'inferred'] }),
    automatableWorkflows: text('automatable_workflows', { mode: 'json' }),
    suggestedSolution: text('suggested_solution'),
    pitchAngle: text('pitch_angle'),
    pitchLanguage: text('pitch_language', { enum: ['it', 'en'] }),
    signals: text('signals', { mode: 'json' }),
    disqualifiers: text('disqualifiers', { mode: 'json' }),
    disqualifierScoreImpact: text('disqualifier_score_impact'),
    salesObjections: text('sales_objections', { mode: 'json' }),
    confidence: real('confidence'),
    rationale: text('rationale'),

    advocateApproved: integer('advocate_approved', { mode: 'boolean' }),
    advocateRevisedFinal: integer('advocate_revised_final'),
    advocateConcerns: text('advocate_concerns', { mode: 'json' }),

    creatorFirstName: text('creator_first_name'),

    rawResponsePath: text('raw_response_path').notNull(),
    rawPromptPath: text('raw_prompt_path').notNull(),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxChannel: index('idx_qual_channel').on(t.channelId),
    idxScore: index('idx_qual_score').on(t.automationPotentialScore),
  }),
);

export const outreachDrafts = sqliteTable(
  'outreach_drafts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    qualificationId: integer('qualification_id').references(() => qualifications.id),

    language: text('language', { enum: ['it', 'en'] }).notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),

    modelUsed: text('model_used').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: real('cost_usd'),
    rawResponsePath: text('raw_response_path').notNull(),

    isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxChannel: index('idx_draft_channel').on(t.channelId),
  }),
);

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['running', 'completed', 'failed', 'cancelled'] })
    .notNull()
    .default('running'),
  triggeredBy: text('triggered_by', { enum: ['cron', 'manual'] }).notNull(),

  searchesPerformed: integer('searches_performed').notNull().default(0),
  candidatesFound: integer('candidates_found').notNull().default(0),
  channelsEnriched: integer('channels_enriched').notNull().default(0),
  channelsPreRejected: integer('channels_pre_rejected').notNull().default(0),
  channelsQualified: integer('channels_qualified').notNull().default(0),
  channelsPostRejected: integer('channels_post_rejected').notNull().default(0),

  youtubeQuotaUsed: integer('youtube_quota_used').notNull().default(0),
  llmCallsCount: integer('llm_calls_count').notNull().default(0),
  llmTokensInput: integer('llm_tokens_input').notNull().default(0),
  llmTokensOutput: integer('llm_tokens_output').notNull().default(0),
  llmCostUsd: real('llm_cost_usd'),

  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
});

export const pipelineEvents = sqliteTable(
  'pipeline_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id').references(() => pipelineRuns.id, { onDelete: 'cascade' }),
    channelId: text('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    stage: text('stage', {
      enum: ['discovery', 'enrichment', 'filter', 'qualification', 'meta'],
    }).notNull(),
    level: text('level', { enum: ['info', 'warn', 'error'] })
      .notNull()
      .default('info'),
    event: text('event').notNull(),
    message: text('message'),
    details: text('details', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxRun: index('idx_events_run').on(t.runId),
    idxChannel: index('idx_events_channel').on(t.channelId),
  }),
);

export const quotaLedger = sqliteTable(
  'quota_ledger',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    operation: text('operation').notNull(),
    units: integer('units').notNull(),
    runId: integer('run_id').references(() => pipelineRuns.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxDate: index('idx_quota_date').on(t.date),
  }),
);

export const seedKeywords = sqliteTable('seed_keywords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  keyword: text('keyword').notNull().unique(),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  totalUses: integer('total_uses').notNull().default(0),
  totalCandidatesProduced: integer('total_candidates_produced').notNull().default(0),
  addedAt: integer('added_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// One row per .command file the admin downloads. The token is embedded in
// the script; when the script finishes creating drafts in Mail.app it POSTs
// back with the token so we can flip every channel's outreachStatus to
// 'sent' in a single transaction. Idempotent: re-consuming a token is a
// no-op (consumedAt is set on first consume).
export const outreachBatches = sqliteTable(
  'outreach_batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token: text('token').notNull().unique(),
    channelIds: text('channel_ids', { mode: 'json' }).notNull().$type<string[]>(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  },
  (t) => ({
    idxToken: uniqueIndex('idx_outreach_batches_token').on(t.token),
  }),
);
