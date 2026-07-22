import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import type { FlakeAssessment } from '../types';

/**
 * Daily-digest Issue management for flaky tests (gate condition #5).
 *
 * One Issue per flaky test, updated at most once per day. Never per-run.
 * This keeps Issue API writes at roughly (number of flaky tests) per day,
 * clear of GitHub's secondary rate limits even for repos that run CI many
 * times a day with dozens of flaky tests.
 *
 * Lifecycle:
 *   - flaky + no open Issue  -> open one, labeled `flaketrack`
 *   - flaky + open Issue     -> update body only if last update >24h ago
 *   - not flaky for 14 days  -> close with a summary comment
 */

const LABEL = 'flaketrack';
const LABEL_COLOR = 'B60D0D';
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day
const RECOVERY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface DigestResult {
  opened: number;
  updated: number;
  closed: number;
}

export interface DigestOptions {
  /** Mark a test as recovered if it has had zero failures for this many ms. */
  recoveryWindowMs?: number;
  /** Minimum interval between Issue body updates, in ms. Default 24h. */
  updateIntervalMs?: number;
  /** Reference time (for tests). Defaults to now. */
  now?: Date;
}

export interface IssueTracker {
  /** Octokit instance from @actions/github, or a stub in tests. */
  octokit: OctokitLike;
  owner: string;
  repo: string;
}

/** Minimal slice of the Octokit issues API surface we depend on. */
export interface OctokitLike {
  rest: {
    issues: {
      listForRepo(params: {
        owner: string;
        repo: string;
        labels?: string;
        state: 'open' | 'closed' | 'all';
        per_page: number;
      }): Promise<{ data: IssueRow[] }>;
      create(params: {
        owner: string;
        repo: string;
        title: string;
        body: string;
        labels: string[];
      }): Promise<unknown>;
      update(params: {
        owner: string;
        repo: string;
        issue_number: number;
        body?: string;
        state?: string;
      }): Promise<unknown>;
      createComment(params: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }): Promise<unknown>;
    };
    labels?: {
      getOrCreate(params: {
        owner: string;
        repo: string;
        name: string;
        color?: string;
        description?: string;
      }): Promise<unknown>;
    };
  };
}

export interface IssueRow {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  updated_at: string;
  labels: { name: string }[];
}

/**
 * Sync the set of open tracking Issues with the current flake assessment.
 * Pure orchestration over the Octokit slice above — no GitHub-specific logic
 * hidden inside. Testable with a stub.
 */
export async function syncIssues(
  tracker: IssueTracker,
  assessments: FlakeAssessment[],
  opts: DigestOptions = {},
): Promise<DigestResult> {
  const now = opts.now ?? new Date();
  const recoveryWindowMs = opts.recoveryWindowMs ?? RECOVERY_WINDOW_MS;
  const updateIntervalMs = opts.updateIntervalMs ?? UPDATE_INTERVAL_MS;

  await ensureLabel(tracker);

  const existing = await tracker.octokit.rest.issues
    .listForRepo({
      owner: tracker.owner,
      repo: tracker.repo,
      labels: LABEL,
      state: 'open',
      per_page: 100,
    })
    .then((r) => r.data)
    .catch((e: unknown) => {
      core.warning(`Failed to list tracking issues: ${(e as Error).message}`);
      return [] as IssueRow[];
    });

  const byTitle = new Map(existing.map((i) => [i.title, i]));
  const result: DigestResult = { opened: 0, updated: 0, closed: 0 };

  const flaky = assessments.filter((a) => a.isFlaky);
  const flakyKeys = new Set(flaky.map((a) => a.key));

  for (const a of flaky) {
    const title = issueTitle(a);
    const current = byTitle.get(title);
    if (!current) {
      await safeCreate(tracker, title, issueBody(a, now));
      result.opened++;
      continue;
    }
    const updatedMs = now.getTime() - new Date(current.updated_at).getTime();
    if (updatedMs >= updateIntervalMs) {
      await safeUpdate(tracker, current.number, issueBody(a, now));
      result.updated++;
    }
  }

  // Close issues for tests that have recovered (no recent failures).
  for (const issue of existing) {
    const key = titleToKey(issue.title);
    if (!key || flakyKeys.has(key)) continue;
    const assessment = assessments.find((a) => a.key === key);
    if (hasRecovered(assessment, now, recoveryWindowMs)) {
      await safeClose(tracker, issue.number, key, now);
      result.closed++;
    }
  }

  return result;
}

function hasRecovered(a: FlakeAssessment | undefined, now: Date, windowMs: number): boolean {
  if (!a) return true; // test vanished from history entirely -> recovered
  if (a.isFlaky) return false;
  if (a.recentFailures.length === 0) return true;
  const last = new Date(a.recentFailures[a.recentFailures.length - 1]).getTime();
  return now.getTime() - last >= windowMs;
}

export function issueTitle(a: FlakeAssessment): string {
  return `Flaky: ${a.key}`;
}

export function titleToKey(title: string): string | null {
  if (!title.startsWith('Flaky: ')) return null;
  return title.slice('Flaky: '.length);
}

export function issueBody(a: FlakeAssessment, now: Date): string {
  const rate = (a.flakeRate * 100).toFixed(1);
  const confidence = a.lowConfidence ? '_low confidence — few samples_' : 'adequate';
  const failures = a.recentFailures.length
    ? a.recentFailures.map((ts) => `  - ${ts}`).join('\n')
    : '  _none in window_';
  return `## Flaky test: \`${a.key}\`

| metric | value |
|---|---|
| fail rate (window) | **${rate}%** |
| samples | ${a.sampleSize} |
| confidence | ${confidence} |
| class | \`${a.className}\` |
| test | \`${a.name}\` |

### Recent failures
${failures}

<!--
flaketrack-key: ${a.key}
flaketrack-rate: ${a.flakeRate}
flaketrack-samples: ${a.sampleSize}
-->

_Last checked: ${now.toISOString()} by FlakeTrack._`;
}

async function safeCreate(t: IssueTracker, title: string, body: string): Promise<void> {
  try {
    await t.octokit.rest.issues.create({
      owner: t.owner,
      repo: t.repo,
      title,
      body,
      labels: [LABEL],
    });
  } catch (e: unknown) {
    core.warning(`Failed to open issue "${title}": ${(e as Error).message}`);
  }
}

/**
 * Ensure the `flaketrack` label exists before we list/create issues by label.
 * GitHub returns 404 (not an empty list) when filtering listForRepo by a label
 * that doesn't exist, which the catch in syncIssues turns into a silent no-op —
 * so on a fresh install no issues are ever opened. getOrCreate is idempotent.
 */
async function ensureLabel(t: IssueTracker): Promise<void> {
  if (!t.octokit.rest.labels) return;
  try {
    await t.octokit.rest.labels.getOrCreate({
      owner: t.owner,
      repo: t.repo,
      name: LABEL,
      color: LABEL_COLOR,
      description: 'Tracked by FlakeTrack — flaky test under observation.',
    });
  } catch (e: unknown) {
    core.warning(`Failed to ensure label "${LABEL}": ${(e as Error).message}`);
  }
}

async function safeUpdate(t: IssueTracker, number: number, body: string): Promise<void> {
  try {
    await t.octokit.rest.issues.update({
      owner: t.owner,
      repo: t.repo,
      issue_number: number,
      body,
    });
  } catch (e: unknown) {
    core.warning(`Failed to update issue #${number}: ${(e as Error).message}`);
  }
}

async function safeClose(t: IssueTracker, number: number, key: string, now: Date): Promise<void> {
  try {
    await t.octokit.rest.issues.createComment({
      owner: t.owner,
      repo: t.repo,
      issue_number: number,
      body: `**Recovered.** \`${key}\` has not failed in the last 14 days. Closing this tracking issue.\n\n_Closed by FlakeTrack at ${now.toISOString()}._`,
    });
    await t.octokit.rest.issues.update({
      owner: t.owner,
      repo: t.repo,
      issue_number: number,
      state: 'closed',
    });
  } catch (e: unknown) {
    core.warning(`Failed to close issue #${number}: ${(e as Error).message}`);
  }
}

/**
 * Build a tracker from the Action runtime. Returns null when running outside
 * GitHub Actions (no token / repo context) so callers can no-op gracefully.
 */
export function trackerFromEnv(): IssueTracker | null {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
  if (!token || !repo) return null;
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;
  // The real Octokit's responses are wider than our IssueRow slice (body is
  // string|null|undefined on the wire). Runtime behavior is identical; we cast
  // at this boundary so the rest of the module stays decoupled and testable
  // with a narrow stub.
  return { octokit: getOctokit(token) as unknown as OctokitLike, owner, repo: name };
}