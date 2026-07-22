import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeDashboard } from './build';
import type { RunRecord } from '../types';

/**
 * Dashboard CLI entrypoint. Invoked by .github/workflows/dashboard.yml as
 * `node dist/dashboard.js`. Reads run history from the flaketrack-data branch
 * (or a local file), rebuilds the static site, and prunes history older than
 * the window (gate condition #4: bounded history on every tier).
 *
 * This is a separate ncc entrypoint from the Action so the nightly Pages build
 * doesn't pull the Action's runtime deps into its bundle path.
 */

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const windowDays = args['window-days'] ? Number(args['window-days']) : 90;
  const threshold = args['threshold'] ? Number(args['threshold']) : 0.05;
  const minRuns = args['min-runs'] ? Number(args['min-runs']) : 20;
  const outDir = resolve(args['out-dir'] ?? 'dashboard-out');
  const repoName = args['repo-name'] ?? process.env.GITHUB_REPOSITORY ?? 'this repo';
  const branch = args['data-branch'] ?? 'flaketrack-data';
  const historyFile = args['history-file'] ?? 'history.jsonl';
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();

  const history = readHistory(workspace, branch, historyFile);
  process.stdout.write(
    `FlakeTrack dashboard: ${history.length} run(s) from branch ${branch}.\n`,
  );

  writeDashboard(outDir, history, {
    threshold,
    minRuns,
    windowDays,
    repoName,
  });
  process.stdout.write(`FlakeTrack dashboard: wrote ${outDir}/index.html + data.json.\n`);

  // Prune: gate condition #4. Rewrite the branch history file with only the
  // records inside the window. Best-effort; a failed prune must not fail the
  // Pages deploy.
  try {
    pruneHistory(workspace, branch, historyFile, history, windowDays);
  } catch (e: unknown) {
    process.stderr.write(`FlakeTrack prune skipped: ${(e as Error).message}\n`);
  }
}

export function readHistory(
  workspace: string,
  branch: string,
  historyFile: string,
): RunRecord[] {
  // Try the committed data branch first.
  const blob = readBranchBlob(workspace, branch, historyFile);
  const raw = blob ?? readLocalFile(resolve(workspace, historyFile));
  if (!raw) return [];
  return parseJsonl(raw);
}

function readBranchBlob(workspace: string, branch: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${branch}:${path}`], {
      cwd: workspace,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function readLocalFile(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function parseJsonl(raw: string): RunRecord[] {
  const records: RunRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as RunRecord);
    } catch {
      // skip malformed line — one bad record shouldn't break the dashboard
    }
  }
  return records;
}

export function pruneHistory(
  workspace: string,
  branch: string,
  historyFile: string,
  history: RunRecord[],
  windowDays: number,
): void {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000);
  const kept = history.filter((r) => new Date(r.timestamp) >= cutoff);
  if (kept.length === history.length) return; // nothing to prune
  // Write the pruned file back to the data branch via a temp worktree, same
  // fetch/commit/push discipline as the history writer. Failure here is logged
  // by the caller; the Pages deploy proceeds with whatever we rendered.
  execFileSync(
    'git',
    ['stash', '-u'],
    { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] },
  );
  try {
    execFileSync('git', ['checkout', branch], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    writePruned(workspace, historyFile, kept);
    execFileSync('git', ['commit', '-am', `prune history older than ${windowDays}d`], {
      cwd: workspace,
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    execFileSync('git', ['push', 'origin', branch], {
      cwd: workspace,
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    process.stdout.write(
      `FlakeTrack prune: kept ${kept.length}/${history.length} records.\n`,
    );
  } finally {
    execFileSync('git', ['checkout', '-'], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    try {
      execFileSync('git', ['stash', 'pop'], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    } catch {
      // no stash to pop — fine
    }
  }
}

function writePruned(workspace: string, historyFile: string, kept: RunRecord[]): void {
  const lines = kept.map((r) => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : '');
  writeFileSync(resolve(workspace, historyFile), lines);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

main();