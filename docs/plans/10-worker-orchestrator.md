# Plan: Worker Orchestrator, Scheduling & Manual Trigger

**Branch:** `feat/10-worker-orchestrator`
**Wave:** 3
**Depends on:** 07, 08, 09
**Estimated effort:** 2 days

## Overview

Stand up the standalone batch worker (`npx tsx src/worker/run.ts`) that chains plan 07's discovery and plan 08's qualification into one nightly run, and the macOS `launchd` plist that schedules it at the configured hour. Also expose a `POST /api/pipeline/run` endpoint so the operator can trigger an ad-hoc run from the dashboard UI (plan 11). The worker is the only place where the full pipeline runs from end to end; the UI never calls the YouTube or LLM APIs directly.

## Context

Per spec §12, the worker is a separate Node process from the Next.js server, but both share `data/pipeline.db` in WAL mode (plan 02) so the UI can read pipeline state while the worker writes. The orchestrator wraps the whole run in a `pipeline_runs` row whose `status` transitions `running` → (`completed` | `failed` | `cancelled`). Quota-headroom checks block a run from starting if today's spend is already too high. Only one run can be active at a time. Manual trigger from the UI uses a fire-and-forget pattern: the API route inserts the run row and spawns the worker via `child_process.spawn`, returning the runId immediately.

## Validation Commands

- `pnpm typecheck`
- `pnpm test src/worker src/lib/pipeline/run`
- `pnpm worker:run` — manual run, ~10–20 minutes, consumes real quota
- `bash scripts/install-launchd.sh` then `launchctl list | grep creator-pipeline` → confirms scheduled

### Task 1: Pipeline run lifecycle

- [x] Create `src/lib/pipeline/lifecycle.ts`:

```typescript
export async function openRun(triggeredBy: 'cron' | 'manual'): Promise<number>;
// Inserts pipeline_runs row with status='running'. Throws if another run is
// already 'running' (concurrent-run guard).

export async function closeRun(
  runId: number,
  status: 'completed' | 'failed' | 'cancelled',
  errorMessage?: string,
  errorStack?: string,
): Promise<void>;
// Sets finishedAt, status, error fields if provided. Idempotent on a row
// already in a terminal status.

export async function isRunActive(): Promise<{ active: boolean; runId?: number }>;
```

- [x] Concurrent-run guard uses a unique partial index on `pipelineRuns(status) WHERE status='running'` if SQLite supports it; if not, a SELECT-then-INSERT inside a transaction
- [x] Mark completed

### Task 2: Quota pre-flight check

- [x] Create `src/lib/pipeline/preflight.ts`:

```typescript
export class InsufficientQuotaHeadroom extends Error {
  constructor(
    public readonly spent: number,
    public readonly required: number,
  ) {
    super(`Need ~${required} units, only ${10000 - spent} headroom remaining today`);
  }
}

export async function preflightChecks(): Promise<void>;
// Asserts at least 4500 units of headroom (rough budget for a full run, spec §8.7).
// Throws InsufficientQuotaHeadroom on failure.
```

- [x] Mark completed

### Task 3: Top-level orchestrator

- [x] Create `src/lib/pipeline/run.ts`:

```typescript
export type RunPipelineOptions = {
  triggeredBy: 'cron' | 'manual';
  // For testing / partial runs
  stages?: Array<'discovery' | 'qualification'>;
};

export async function runPipeline(opts: RunPipelineOptions): Promise<{
  runId: number;
  status: 'completed' | 'failed' | 'cancelled';
  summary: {
    discovery?: DiscoverySummary;
    qualification?: QualificationSummary;
  };
}>;
```

Behaviour:

1. `preflightChecks()` — `InsufficientQuotaHeadroom` → return `cancelled`
2. `openRun(triggeredBy)` → `runId`
3. Try:
   - `discovery = await runDiscovery(runId)` (plan 07)
   - `qualification = await runQualification({ runId })` (plan 08)
   - `closeRun(runId, 'completed')`
4. Catch `QuotaExhausted` → `closeRun(runId, 'cancelled', err.message)` (partial work preserved)
5. Catch any other error → `closeRun(runId, 'failed', err.message, err.stack)`; re-throw
6. Log a final summary line to pino at `info`

- [x] Mark completed

### Task 4: Worker entry point

- [x] Create `src/worker/run.ts`:

```typescript
#!/usr/bin/env tsx
import { env } from '@/lib/env';
import { runPipeline } from '@/lib/pipeline/run';
import { logger } from '@/lib/logger';

async function main() {
  const triggeredBy = process.argv.includes('--manual') ? 'manual' : 'cron';
  logger.info({ triggeredBy }, 'worker starting');
  try {
    const result = await runPipeline({ triggeredBy });
    logger.info({ result }, 'worker finished');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'worker failed');
    process.exit(1);
  }
}
main();
```

- [x] Add npm script `worker:run` → `tsx src/worker/run.ts`
- [x] Add `worker:manual` → `tsx src/worker/run.ts --manual`
- [x] Mark completed

### Task 5: Manual-trigger API route

- [x] Create `src/app/api/pipeline/run/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { isRunActive } from '@/lib/pipeline/lifecycle';

export async function POST() {
  // auth: presence of valid session cookie (middleware-level)
  const active = await isRunActive();
  if (active.active) {
    return NextResponse.json(
      { ok: false, error: 'run_already_active', runId: active.runId },
      { status: 409 },
    );
  }
  // Spawn the worker as a detached child process so we return immediately.
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker/run.ts', '--manual'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  return NextResponse.json({ ok: true }, { status: 202 });
}
```

- [x] The API does NOT wait for the worker; the UI polls `/api/pipeline/status` to watch progress (next task)
- [x] Mark completed

### Task 6: Pipeline status endpoint

- [x] Create `src/app/api/pipeline/status/route.ts`:

```typescript
export async function GET() {
  return NextResponse.json({
    active: await isRunActive(),
    latestRun: await getLatestRun(), // typed query from plan 02
    quota: await quotaSummary(), // from plan 04
    queues: await countChannelsByStatus(), // from plan 02
  });
}
```

- [x] Used by the dashboard (plan 11) for the "Avvia pipeline" affordance and live progress
- [x] Mark completed

### Task 7: launchd plist + install script

- [x] Create `scripts/com.you.creator-pipeline.plist.template`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.you.creator-pipeline</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>-lc</string>
        <string>cd __PROJECT_DIR__ && /opt/homebrew/bin/pnpm worker:run >> data/logs/launchd.log 2>&1</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>__HOUR__</integer>
        <key>Minute</key>
        <integer>__MINUTE__</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>__PROJECT_DIR__/data/logs/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>__PROJECT_DIR__/data/logs/launchd.err.log</string>
</dict>
</plist>
```

- [x] Create `scripts/install-launchd.sh`:
  - reads `PIPELINE_TRIGGER_HOUR` and `PIPELINE_TRIGGER_MINUTE` from `.env`
  - substitutes `__PROJECT_DIR__`, `__HOUR__`, `__MINUTE__` into the template
  - writes the result to `~/Library/LaunchAgents/com.you.creator-pipeline.plist`
  - runs `launchctl bootout gui/$(id -u) ...` and `launchctl bootstrap gui/$(id -u) ...` to (re)install
  - optionally calls `sudo pmset repeat wakeorpoweron MTWRFSU $(printf '%02d:%02d:00' $((HOUR-1==-1?23:HOUR-1)) 58)` to wake the Mac just before the run (warn the user about sudo, allow `--no-wake` flag)
  - prints next firing time
- [x] Create `scripts/uninstall-launchd.sh` mirror that unloads + removes the plist
- [x] Mark completed

### Task 8: Worker shutdown handling

- [x] In `src/worker/run.ts`, handle `SIGTERM` and `SIGINT`:
  - if a run is in progress, attempt `closeRun(runId, 'cancelled', 'received SIGTERM/SIGINT')`
  - then exit non-zero
- [x] Operator can `kill <pid>` cleanly without leaving a `running` row
- [x] Mark completed

### Task 9: Tests

- [x] Create `src/lib/pipeline/__tests__/run.test.ts` (vitest):
  - mock `runDiscovery` and `runQualification` (returning summaries)
  - assert run row lifecycle: opens, summaries persisted in counters, closes as `completed`
  - assert second concurrent call throws (concurrent-run guard)
  - assert `QuotaExhausted` mid-run → run closed as `cancelled`
  - assert generic error → run closed as `failed`, error message persisted
- [x] Create `src/app/api/pipeline/__tests__/run.test.ts`:
  - test "409 when a run is already active"
  - test "202 when no run is active" (mocks spawn to a no-op)
- [x] Mark completed

### Task 10: Documentation

- [ ] Update README "Scheduling" section:
  - explain `pnpm worker:manual` for ad-hoc runs from the terminal
  - explain the dashboard "Avvia pipeline" button (calls the same code)
  - explain `bash scripts/install-launchd.sh` to enable nightly scheduling
  - call out the Mac-sleep caveat and the `pmset` mitigation
- [ ] Mark completed

### Task 11: Definition of Done

- [ ] `pnpm typecheck` passes
- [ ] All tests pass
- [ ] `pnpm worker:run` against a fresh DB completes a full discovery + qualification cycle and writes a closed `pipeline_runs` row
- [ ] `POST /api/pipeline/run` returns 202 when no run is active, 409 when one is
- [ ] `GET /api/pipeline/status` returns the latest run + queue counts + quota summary
- [ ] `scripts/install-launchd.sh` installs the plist; `launchctl list | grep creator-pipeline` shows it loaded
- [ ] SIGTERM during a run closes the run as `cancelled` cleanly
- [ ] Mark completed
