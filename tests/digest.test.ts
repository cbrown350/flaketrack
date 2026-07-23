import { describe, expect, it } from 'vitest';
import {
  syncIssues,
  issueTitle,
  titleToKey,
  issueBody,
  type OctokitLike,
  type IssueTracker,
} from '../src/issues/digest';
import type { FlakeAssessment } from '../src/types';

function flaky(key: string, rate = 0.2, sampleSize = 30): FlakeAssessment {
  const [className, name] = key.includes('#') ? key.split('#') : [key, key];
  return {
    key,
    className,
    name,
    flakeRate: rate,
    sampleSize,
    isFlaky: true,
    lowConfidence: false,
    recentFailures: ['2026-07-20T00:00:00.000Z'],
  };
}

function recovered(key: string, lastFailIso: string | null): FlakeAssessment {
  const [className, name] = key.includes('#') ? key.split('#') : [key, key];
  return {
    key,
    className,
    name,
    flakeRate: 0,
    sampleSize: 30,
    isFlaky: false,
    lowConfidence: false,
    recentFailures: lastFailIso ? [lastFailIso] : [],
  };
}

/** In-memory Octokit stub that records all calls and serves listed issues. */
function makeOctokit(existingIssues: { number: number; title: string; updated_at: string }[]) {
  const calls: { op: string; payload: Record<string, unknown> }[] = [];
  const issues = new Map(
    existingIssues.map((i) => [
      i.number,
      { number: i.number, title: i.title, body: 'old', state: 'open' as const, updated_at: i.updated_at, labels: [{ name: 'flaketrack' }] },
    ]),
  );
  let nextNumber = existingIssues.length + 1;
  const octokit: OctokitLike = {
    rest: {
      issues: {
        async listForRepo() {
          return { data: [...issues.values()].filter((i) => i.state === 'open') };
        },
        async create(params) {
          calls.push({ op: 'create', payload: params });
          const num = nextNumber++;
          issues.set(num, { number: num, title: params.title, body: params.body, state: 'open', updated_at: new Date().toISOString(), labels: [{ name: 'flaketrack' }] });
          return {};
        },
        async update(params) {
          calls.push({ op: 'update', payload: params });
          const i = issues.get(params.issue_number);
          if (i) {
            if (params.body !== undefined) i.body = params.body;
            if (params.state !== undefined) i.state = params.state as 'open' | 'closed';
            i.updated_at = new Date().toISOString();
          }
          return {};
        },
        async createComment(params) {
          calls.push({ op: 'comment', payload: params });
          return {};
        },
      },
    },
  };
  return { octokit, calls };
}

const tracker = (octokit: OctokitLike): IssueTracker => ({ octokit, owner: 'o', repo: 'r' });

describe('issueTitle / titleToKey round-trip', () => {
  it('round-trips a test key', () => {
    const a = flaky('com.foo#bar');
    expect(issueTitle(a)).toBe('Flaky: com.foo#bar');
    expect(titleToKey('Flaky: com.foo#bar')).toBe('com.foo#bar');
  });
  it('rejects non-flaky titles', () => {
    expect(titleToKey('Bug: something')).toBeNull();
  });
});

describe('issueBody', () => {
  it('includes rate, samples, and the machine-readable key marker', () => {
    const a = flaky('com.foo#bar', 0.25, 40);
    const body = issueBody(a, new Date('2026-07-22T00:00:00.000Z'));
    expect(body).toContain('25.0%');
    expect(body).toContain('40');
    expect(body).toContain('flaketrack-key: com.foo#bar');
    expect(body).toContain('com.foo#bar');
  });
  it('flags low confidence', () => {
    const a = flaky('k#n');
    a.lowConfidence = true;
    expect(issueBody(a, new Date())).toContain('low confidence');
  });
});

describe('syncIssues', () => {
  it('opens one issue per flaky test that has no tracking issue', async () => {
    const { octokit, calls } = makeOctokit([]);
    const res = await syncIssues(tracker(octokit), [flaky('a#1'), flaky('b#2')], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.opened).toBe(2);
    expect(res.updated).toBe(0);
    expect(res.closed).toBe(0);
    expect(calls.filter((c) => c.op === 'create')).toHaveLength(2);
  });

  it('does NOT update an issue updated less than 24h ago', async () => {
    const recent = '2026-07-21T20:00:00.000Z'; // 4h ago
    const { octokit, calls } = makeOctokit([{ number: 1, title: 'Flaky: a#1', updated_at: recent }]);
    const res = await syncIssues(tracker(octokit), [flaky('a#1')], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.opened).toBe(0);
    expect(res.updated).toBe(0);
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('updates an issue last touched more than 24h ago', async () => {
    const stale = '2026-07-20T00:00:00.000Z'; // 2 days ago
    const { octokit, calls } = makeOctokit([{ number: 1, title: 'Flaky: a#1', updated_at: stale }]);
    const res = await syncIssues(tracker(octokit), [flaky('a#1')], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.updated).toBe(1);
    expect(calls.filter((c) => c.op === 'update' && c.payload.state === undefined)).toHaveLength(1);
  });

  it('closes an issue for a test recovered >14 days with no recent failures', async () => {
    const lastFail = '2026-07-01T00:00:00.000Z'; // 21 days before now
    const { octokit, calls } = makeOctokit([{ number: 5, title: 'Flaky: a#1', updated_at: '2026-07-05T00:00:00.000Z' }]);
    const res = await syncIssues(tracker(octokit), [recovered('a#1', lastFail)], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.closed).toBe(1);
    expect(calls.some((c) => c.op === 'comment')).toBe(true);
    const closeUpdate = calls.find((c) => c.op === 'update' && c.payload.state === 'closed');
    expect(closeUpdate).toBeTruthy();
  });

  it('does not close an issue for a test whose last failure is within 14 days', async () => {
    const lastFail = '2026-07-15T00:00:00.000Z'; // 7 days before now
    const { octokit, calls } = makeOctokit([{ number: 5, title: 'Flaky: a#1', updated_at: '2026-07-05T00:00:00.000Z' }]);
    const res = await syncIssues(tracker(octokit), [recovered('a#1', lastFail)], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.closed).toBe(0);
    expect(calls.some((c) => c.op === 'comment')).toBe(false);
  });

  it('opens + updates in the same pass (mixed state)', async () => {
    const stale = '2026-07-01T00:00:00.000Z';
    const { octokit } = makeOctokit([{ number: 1, title: 'Flaky: old#1', updated_at: stale }]);
    const res = await syncIssues(tracker(octokit), [flaky('old#1'), flaky('new#2')], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.opened).toBe(1);
    expect(res.updated).toBe(1);
  });

  it('updates an issue updated exactly 24h ago (>= boundary)', async () => {
    const exactly24h = '2026-07-21T00:00:00.000Z'; // exactly 24h before now
    const { octokit, calls } = makeOctokit([{ number: 1, title: 'Flaky: a#1', updated_at: exactly24h }]);
    const res = await syncIssues(tracker(octokit), [flaky('a#1')], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.updated).toBe(1);
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });

  it('aborts the sync (creates no duplicate issues) when listForRepo fails', async () => {
    const calls: { op: string; payload: Record<string, unknown> }[] = [];
    const failingOctokit: OctokitLike = {
      rest: {
        issues: {
          async listForRepo() {
            throw new Error('GitHub API secondary rate limit');
          },
          async create(params) {
            calls.push({ op: 'create', payload: params });
            return {};
          },
          async update() {
            return {};
          },
          async createComment() {
            return {};
          },
        },
      },
    };
    const res = await syncIssues(
      { octokit: failingOctokit, owner: 'o', repo: 'r' },
      [flaky('a#1')],
      { now: new Date('2026-07-22T00:00:00.000Z') },
    );
    // Must NOT create anything — treating an unknown issue set as empty would
    // spawn a duplicate tracking issue on every burst-limited run.
    expect(res).toEqual({ opened: 0, updated: 0, closed: 0 });
    expect(calls).toHaveLength(0);
  });

  it('closes an issue for a test that has vanished from history entirely', async () => {
    const { octokit, calls } = makeOctokit([{ number: 9, title: 'Flaky: gone#1', updated_at: '2026-07-01T00:00:00.000Z' }]);
    // No assessment for 'gone#1' at all — it disappeared from history.
    const res = await syncIssues(tracker(octokit), [flaky('other#1')], {
      now: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(res.closed).toBe(1);
    expect(calls.some((c) => c.op === 'comment')).toBe(true);
  });
});