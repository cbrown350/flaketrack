import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunRecord } from '../types';

/**
 * Concurrent-write-safe writer for the flaketrack-data orphan branch.
 *
 * Implements the protocol required by the cycle-3 pre-mortem (condition #3):
 * the customers with the most flakiness pain run matrix/sharded CI, so
 * multiple jobs append to the same branch within seconds of each other.
 * Naive `git push` races; naive `git push --force` under retry clobbers
 * another job's history. This writer does neither.
 *
 * Protocol:
 *   1. fetch the data branch (or init orphan if missing)
 *   2. append the new run record to the history file in a temp worktree
 *   3. commit + push the commit SHA to the branch ref
 *   4. on non-fast-forward: fetch, retry onto latest tip — max maxRetries
 *   5. hard cap: if retries exhausted, DROP the write (log + return false).
 *      Never force-push. A dropped record is acceptable; lost history is not.
 */

export type PushResult =
  | { ok: true }
  | { ok: false; reason: 'non-ff' | 'error'; message?: string };

export interface GitWriterOptions {
  repoDir: string;
  branch?: string;
  remote?: string;
  historyFile?: string;
  maxRetries?: number;
  /** Override the push step (for tests / dry-run). Default: git push. */
  push?: (branch: string, fromSha: string) => PushResult;
  /** Override the fetch step (for tests). Default: git fetch. */
  fetch?: (branch: string) => void;
  /** Override backoff sleep (for tests). Default: exponential 1/2/4s. */
  sleep?: (attempt: number) => Promise<void>;
}

export class GitWriter {
  private readonly repoDir: string;
  private readonly branch: string;
  private readonly remote: string;
  private readonly historyFile: string;
  private readonly maxRetries: number;
  private readonly pushFn: (branch: string, fromSha: string) => PushResult;
  private readonly fetchFn: (branch: string) => void;
  private readonly sleepFn: (attempt: number) => Promise<void>;
  private readonly logs: string[] = [];

  constructor(opts: GitWriterOptions) {
    this.repoDir = opts.repoDir;
    this.branch = opts.branch ?? 'flaketrack-data';
    this.remote = opts.remote ?? 'origin';
    this.historyFile = opts.historyFile ?? 'history.jsonl';
    this.maxRetries = opts.maxRetries ?? 3;
    this.pushFn = opts.push ?? ((b, sha) => this.defaultPush(b, sha));
    this.fetchFn = opts.fetch ?? ((b) => this.defaultFetch(b));
    this.sleepFn = opts.sleep ?? ((n) => defaultSleep(n));
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Read the full committed run history from the data branch tip. Returns []
   * if the branch or history file doesn't exist yet. Malformed lines are
   * skipped (one bad line shouldn't poison detection for every other test).
   */
  readHistory(): RunRecord[] {
    const refs = this.git(['branch', '--list', this.branch], this.repoDir);
    if (!refs.includes(this.branch)) return [];
    const tip = this.revParse(this.branch);
    if (!tip) return [];
    const blob = this.tryReadBlob(tip, this.historyFile);
    if (!blob) return [];
    const records: RunRecord[] = [];
    for (const line of blob.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed) as RunRecord);
      } catch {
        // skip malformed line
      }
    }
    return records;
  }

  private tryReadBlob(tipSha: string, path: string): string | null {
    try {
      const blob = this.git(['show', `${tipSha}:${path}`], this.repoDir);
      return blob;
    } catch {
      return null;
    }
  }

  async appendRun(record: RunRecord): Promise<boolean> {
    this.ensureDataBranch();
    const line = JSON.stringify(record) + '\n';
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.fetchFn(this.branch);
      const baseSha = this.revParse(this.branch);
      const wt = this.checkoutTemp(baseSha);
      try {
        this.appendLine(wt, line);
        const commitSha = this.commit(wt, `run ${record.runId} @ ${record.sha}`);
        const result = this.pushFn(this.branch, commitSha);
        if (result.ok) {
          // Advance the local branch ref so the next append builds on this tip.
          // (For remote-backed setups, fetchFn will also surface other writers'
          // advances on the next iteration; locally we are our own source of
          // truth between fetches.)
          this.advanceBranchRef(commitSha);
          return true;
        }
        this.logs.push(`attempt ${attempt + 1}: ${result.reason} — ${result.message ?? ''}`);
        if (attempt < this.maxRetries) await this.sleepFn(attempt + 1);
      } finally {
        this.cleanupWorktree(wt);
      }
    }
    this.logs.push(`DROPPED run ${record.runId} after ${this.maxRetries} retries (never force-push)`);
    return false;
  }

  private advanceBranchRef(commitSha: string): void {
    // git branch -f would refuse if checked out; use update-ref to move the
    // ref without touching any worktree. Fast-forward only by construction,
    // since commitSha is built on top of the prior tip.
    this.git(['update-ref', `refs/heads/${this.branch}`, commitSha], this.repoDir);
  }

  private git(args: string[], cwd: string): string {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }

  private revParse(ref: string): string {
    try {
      return this.git(['rev-parse', ref], this.repoDir);
    } catch {
      return '';
    }
  }

  private ensureDataBranch(): void {
    const localRefs = this.git(['branch', '--list', this.branch], this.repoDir);
    if (localRefs.includes(this.branch)) return;
    // Branch exists on the remote but not locally (common after a fresh
    // actions/checkout of main). Fetch it into a local ref instead of
    // initing a new orphan — re-initing would collide on push.
    if (this.remoteHasBranch()) {
      this.git(['fetch', this.remote, `${this.branch}:${this.branch}`], this.repoDir);
      return;
    }
    this.initOrphan();
  }

  private remoteHasBranch(): boolean {
    try {
      const out = this.git(['ls-remote', this.remote, this.branch], this.repoDir);
      return out.trim().length > 0;
    } catch {
      return false;
    }
  }

  private initOrphan(): void {
    const wt = mkdtempSync(join(tmpdir(), 'flaketrack-init-'));
    this.git(['worktree', 'add', '--orphan', '-b', this.branch, wt], this.repoDir);
    writeFileSync(join(wt, 'README.md'), '# FlakeTrack data branch\n');
    this.git(['add', '-A'], wt);
    this.git(['commit', '-m', 'init flaketrack-data'], wt);
    this.git(['worktree', 'remove', wt], this.repoDir);
  }

  private checkoutTemp(atSha: string): string {
    const wt = mkdtempSync(join(tmpdir(), 'flaketrack-wt-'));
    const ref = atSha || this.branch;
    this.git(['worktree', 'add', '--detach', wt, ref], this.repoDir);
    return wt;
  }

  private appendLine(wt: string, line: string): void {
    const file = join(wt, this.historyFile);
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
    writeFileSync(file, existing + line);
    this.git(['add', this.historyFile], wt);
  }

  private commit(wt: string, message: string): string {
    this.git(['commit', '-m', message], wt);
    return this.git(['rev-parse', 'HEAD'], wt);
  }

  private cleanupWorktree(wt: string): void {
    try {
      this.git(['worktree', 'remove', '--force', wt], this.repoDir);
    } catch {
      // best-effort
    }
  }

  private defaultPush(_branch: string, fromSha: string): PushResult {
    try {
      this.git(['push', this.remote, `${fromSha}:refs/heads/${this.branch}`], this.repoDir);
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('non-fast-forward') || msg.includes('fetch first')) {
        return { ok: false, reason: 'non-ff', message: msg };
      }
      return { ok: false, reason: 'error', message: msg };
    }
  }

  private defaultFetch(branch: string): void {
    try {
      this.git(['fetch', this.remote, branch], this.repoDir);
    } catch {
      // may not exist on remote yet (fresh orphan) — safe to ignore
    }
  }
}

export function defaultSleep(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 4000);
  return new Promise((r) => setTimeout(r, ms));
}
