# Implementation Plans — Index

Implementation plans for the YouTube Creator Discovery, Qualification & Outreach Pipeline.
The full specification is `creator_pipeline_design.md` (referenced as **spec §X.Y** in each plan).

Each plan corresponds to a branch and is intended to be implemented and merged independently within its wave.
Plans within a wave can in principle be worked on in parallel; plans in a later wave assume earlier waves are merged.

| #  | Title                                              | Wave | Depends on    | Branch                                | Effort   | Status     |
|----|----------------------------------------------------|------|---------------|---------------------------------------|----------|------------|
| 01 | Project Bootstrap                                  | 1    | —             | `feat/01-project-bootstrap`           | 1–2 days | Not started |
| 02 | Database Schema & Migrations                       | 1    | 01            | `feat/02-database-schema`             | 1–2 days | Not started |
| 03 | Configuration, Env Validation & Raw Storage        | 1    | 01, 02        | `feat/03-config-storage`              | 1 day    | Not started |
| 04 | YouTube Data API Client & Quota Tracker            | 2    | 01, 02, 03    | `feat/04-youtube-client`              | 2 days   | Not started |
| 05 | LLM Client & Prompt Infrastructure                 | 2    | 01, 02, 03    | `feat/05-llm-client`                  | 2 days   | Not started |
| 06 | Transcript Fetcher                                 | 2    | 01, 02, 03    | `feat/06-transcript-fetcher`          | 1 day    | Not started |
| 07 | Discovery, Enrichment & Pre-qualification Filter   | 3    | 04            | `feat/07-discovery-pipeline`          | 2–3 days | Not started |
| 08 | Agentic Qualification (two-step + transcripts)     | 3    | 05, 06, 07    | `feat/08-agentic-qualification`       | 3–4 days | Not started |
| 09 | Outreach Draft Generation                          | 3    | 05, 08        | `feat/09-outreach-draft`              | 1 day    | Not started |
| 10 | Worker Orchestrator, Scheduling & Manual Trigger   | 3    | 07, 08, 09    | `feat/10-worker-orchestrator`         | 2 days   | Not started |
| 11 | UI — Dashboard & Channels List                     | 4    | 02, 10        | `feat/11-ui-dashboard-list`           | 2 days   | Not started |
| 12 | UI — Channel Detail (assessment + agent + outreach)| 4    | 08, 09, 11    | `feat/12-ui-channel-detail`           | 3 days   | Not started |
| 13 | UI — Runs History, Settings & CSV Export           | 4    | 10, 11        | `feat/13-ui-runs-settings`            | 1–2 days | Not started |

**Total estimated effort: ~22–28 days.**

## Wave structure

```
Wave 1 (Foundations):           01 → 02 → 03
Wave 2 (External clients):      04, 05, 06    (parallel after Wave 1)
Wave 3 (Pipeline logic):        07 → 08 → 09 → 10
Wave 4 (UI):                    11 → 12, and 13 in parallel with 12
```

## Conventions

- **Language:** all source code, identifiers, comments, log messages, prompt strings, and plan files in English. **All user-facing UI strings in Italian.**
- **Spec references:** `spec §X.Y` refers to a section of `creator_pipeline_design.md`.
- **Plan references:** `plan NN` refers to a numbered plan in this directory.
- **Branch naming:** `feat/NN-short-name` (kebab-case).
- **Validation commands** are listed at the top of each plan and must pass before marking Definition of Done.
- **Checkbox state:** `[ ]` = not done, `[x]` = done. The implementer flips them as they go.
