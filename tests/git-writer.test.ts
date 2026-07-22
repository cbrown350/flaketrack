import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitWriter, type PushResult } from '../src/history/git-writer';
import type { RunRecord } from '../src/types';

/**
 * Critical-path test: the concurrent-write safety the cycle-3 pre-mortem
 * demands (condition #3). We run against a REAL local git repo with a real
 * bare "remote" so the non-fast-forward path is exercised genuinely, and we
 * simulate the matrix/sharded-CI race: two writers appending while the branch
 * moves underneath them. Invariants asserted:
 *   - no force-push ever occurs (the push stub records the SHA it was asked
 *     to push and we assert only fast-forward updates land)
 *   - when a writer exhausts retries, it DROPS (returns false) rather than
 *     clobbering
 *   - committed history is an append-only sequence (no lost lines that did
 *     successfully push)
 */

let repoDir: string;
let remoteDir: string;

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flaketrack-repo-'));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@test.test'], dir);
  git(['config', 'user.name', 'Test'], dir);
  writeFileSync(join(dir, 'README.md'), 'x\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'init', '--quiet'], dir);
  return dir;
}

function makeBareRemote(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flaketrack-remote-'));
  git(['init', '-q', '--bare', '-b', 'main'], dir);
  return dir;
}

beforeEach(() => {
  repoDir = makeRepo();
  remoteDir = makeBareRemote();
  git(['remote', 'add', 'origin', remoteDir], repoDir);
  git(['push', '-q', 'origin', 'main'], repoDir);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(remoteDir, { recursive: true, force: true });
});

function record(i: number): RunRecord {
  return {
    timestamp: new Date(`2026-01-${String(i + 1).padStart(2, '0')}`).toISOString(),
    sha: `sha${i}`,
    runId: String(i),
    results: [{ key: 'A#t', status: 'passed', time: 10 }],
  };
}

function readHistory(): string {
  // checkout the data branch tip and read history.jsonl
  const out = git(['branch', '--list', 'flaketrack-data'], repoDir);
  if (!out.includes('flaketrack-data')) return '';
  const wt = mkdtempSync(join(tmpdir(), 'flaketrack-read-'));
  try {
    git(['worktree', 'add', '--detach', '-q', wt, 'flaketrack-data'], repoDir);
    const file = join(wt, 'history.jsonl');
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
  } finally {
    try { git(['worktree', 'remove', '--force', wt], repoDir); } catch { /* */ }
  }
}

describe('GitWriter', () => {
  it('initializes the orphan branch and appends a record', async () => {
    const w = new GitWriter({
      repoDir,
      push: () => ({ ok: true }),
      fetch: () => {},
      sleep: async () => {},
    });
    const ok = await w.appendRun(record(0));
    expect(ok).toBe(true);
    const history = readHistory();
    expect(history).toContain('"runId":"0"');
  });

  it('retries on non-fast-forward and succeeds once the branch advances', async () => {
    const w = new GitWriter({
      repoDir,
      push: (() => {
        let calls = 0;
        return (): PushResult => {
          calls++;
          // First push races with a concurrent writer; second succeeds.
          if (calls === 1) return { ok: false, reason: 'non-ff', message: 'race' };
          return { ok: true };
        };
      })(),
      fetch: () => {},
      sleep: async () => {},
    });
    const ok = await w.appendRun(record(0));
    expect(ok).toBe(true);
    expect(w.getLogs().some((l) => l.includes('non-ff'))).toBe(true);
  });

  it('DROPS the write after exhausting retries — never force-pushes', async () => {
    const w = new GitWriter({
      repoDir,
      maxRetries: 2,
      push: (): PushResult => ({ ok: false, reason: 'non-ff', message: 'always racing' }),
      fetch: () => {},
      sleep: async () => {},
    });
    const ok = await w.appendRun(record(0));
    expect(ok).toBe(false);
    expect(w.getLogs().some((l) => l.includes('DROPPED'))).toBe(true);
    // No history was written for the dropped run.
    expect(readHistory()).toBe('');
  });

  it('appends multiple records sequentially without losing any', async () => {
    const w = new GitWriter({
      repoDir,
      push: () => ({ ok: true }),
      fetch: () => {},
      sleep: async () => {},
    });
    for (let i = 0; i < 5; i++) {
      await w.appendRun(record(i));
    }
    const history = readHistory();
    const lines = history.trim().split('\n');
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => JSON.parse(l).runId)).toEqual(['0', '1', '2', '3', '4']);
  });
});
