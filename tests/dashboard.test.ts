import { describe, expect, it } from 'vitest';
import { buildDashboard, dashboardData } from '../src/dashboard/build';
import type { RunRecord } from '../src/types';

const T = '2026-07-22T00:00:00.000Z';

function history(): RunRecord[] {
  // 30 runs: test 'a#1' fails 6/30 (20%, flaky at 5%), test 'b#2' passes all 30.
  const out: RunRecord[] = [];
  for (let i = 0; i < 30; i++) {
    out.push({
      timestamp: T,
      sha: `sha${i}`,
      runId: String(i),
      results: [
        { key: 'a#1', status: i < 6 ? 'failed' : 'passed', time: 10 },
        { key: 'b#2', status: 'passed', time: 5 },
      ],
    });
  }
  return out;
}

describe('dashboardData', () => {
  it('ranks flaky tests by fail rate', () => {
    const d = dashboardData(history(), { threshold: 0.05, minRuns: 20, windowDays: 90, now: new Date(T) });
    expect(d.flaky).toHaveLength(1);
    expect(d.flaky[0].key).toBe('a#1');
    expect(d.flaky[0].flakeRate).toBeCloseTo(0.2, 5);
  });

  it('computes summary stats (total tests, flaky count, total runs)', () => {
    const d = dashboardData(history(), { threshold: 0.05, minRuns: 20, windowDays: 90, now: new Date(T) });
    expect(d.summary.totalTests).toBe(2);
    expect(d.summary.flakyTests).toBe(1);
    expect(d.summary.totalRuns).toBe(30);
  });

  it('surfaces low-confidence tests separately from flaky', () => {
    const few: RunRecord[] = [
      { timestamp: T, sha: 's', runId: '1', results: [{ key: 'z#1', status: 'failed', time: 1 }] },
    ];
    const d = dashboardData(few, { threshold: 0.05, minRuns: 20, windowDays: 90, now: new Date(T) });
    expect(d.flaky).toHaveLength(0);
    expect(d.lowConfidence).toHaveLength(1);
    expect(d.lowConfidence[0].key).toBe('z#1');
  });

  it('honors the window cutoff', () => {
    const old: RunRecord[] = [
      {
        timestamp: '2026-01-01T00:00:00.000Z', // outside 90-day window
        sha: 's',
        runId: '1',
        results: [{ key: 'z#1', status: 'failed', time: 1 }],
      },
    ];
    const d = dashboardData(old, { threshold: 0.05, minRuns: 1, windowDays: 90, now: new Date(T) });
    expect(d.summary.totalTests).toBe(0);
  });
});

describe('buildDashboard', () => {
  it('renders a complete HTML document with the flaky test in it', () => {
    const html = buildDashboard(history(), {
      threshold: 0.05,
      minRuns: 20,
      windowDays: 90,
      now: new Date(T),
      repoName: 'octo/test',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('octo/test');
    expect(html).toContain('a#1');
    expect(html).toContain('20.0%');
  });

  it('renders a graceful empty state when there is no flakiness', () => {
    const clean: RunRecord[] = [
      { timestamp: T, sha: 's', runId: '1', results: [{ key: 'ok#1', status: 'passed', time: 1 }] },
    ];
    const html = buildDashboard(clean, {
      threshold: 0.05,
      minRuns: 1,
      windowDays: 90,
      now: new Date(T),
      repoName: 'octo/test',
    });
    expect(html).toContain('No flaky');
  });

  it('escapes a malicious test name to prevent XSS', () => {
    const evil: RunRecord[] = [
      { timestamp: T, sha: 's', runId: '1', results: [{ key: '<script>alert(1)</script>', status: 'failed', time: 1 }] },
    ];
    const html = buildDashboard(evil, {
      threshold: 0.05,
      minRuns: 1,
      windowDays: 90,
      now: new Date(T),
      repoName: 'octo/test',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});