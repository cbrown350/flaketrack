import { describe, it, expect } from 'vitest';
import { detectFlakes, topFlakiest } from '../src/detect/flake';
import type { RunRecord } from '../src/types';

const now = new Date('2026-07-22T00:00:00Z');

function run(
  daysAgo: number,
  results: { key: string; status: 'passed' | 'failed' | 'errored' | 'skipped' }[],
): RunRecord {
  const ts = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  return {
    timestamp: ts,
    sha: 'abc',
    runId: String(daysAgo),
    results,
  };
}

describe('detectFlakes', () => {
  it('flags a test with failure rate above threshold', () => {
    const history: RunRecord[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(run(i, [{ key: 'A#t', status: i % 4 === 0 ? 'failed' : 'passed' }]));
    }
    const [a] = detectFlakes(history, { threshold: 0.05, minRuns: 20, windowDays: 90, now });
    expect(a.isFlaky).toBe(true);
    expect(a.lowConfidence).toBe(false);
    expect(a.flakeRate).toBeCloseTo(0.25, 2);
  });

  it('marks low-traffic tests as lowConfidence, not flaky', () => {
    const history = [run(1, [{ key: 'A#t', status: 'failed' }])];
    const [a] = detectFlakes(history, { threshold: 0.05, minRuns: 20, windowDays: 90, now });
    expect(a.isFlaky).toBe(false);
    expect(a.lowConfidence).toBe(true);
    expect(a.sampleSize).toBe(1);
  });

  it('excludes skipped runs from numerator and denominator', () => {
    const history: RunRecord[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(
        run(i, [{ key: 'A#t', status: i % 2 === 0 ? 'skipped' : 'passed' }]),
      );
    }
    const [a] = detectFlakes(history, { threshold: 0.05, minRuns: 5, windowDays: 90, now });
    expect(a.sampleSize).toBe(10);
    expect(a.flakeRate).toBe(0);
    expect(a.isFlaky).toBe(false);
  });

  it('respects the rolling window (drops old runs)', () => {
    const history = [
      run(200, [{ key: 'A#t', status: 'failed' }]),
      ...Array.from({ length: 20 }, (_, i) => run(i, [{ key: 'A#t', status: 'passed' }])),
    ];
    const [a] = detectFlakes(history, { threshold: 0.05, minRuns: 20, windowDays: 90, now });
    expect(a.flakeRate).toBe(0);
    expect(a.isFlaky).toBe(false);
  });

  it('counts errored as failure-equivalent', () => {
    const history: RunRecord[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(run(i, [{ key: 'A#t', status: i % 3 === 0 ? 'errored' : 'passed' }]));
    }
    const [a] = detectFlakes(history, { threshold: 0.05, minRuns: 20, windowDays: 90, now });
    expect(a.isFlaky).toBe(true);
  });
});

describe('topFlakiest', () => {
  it('sorts by flake rate descending and limits results', () => {
    const history: RunRecord[] = [];
    for (let i = 0; i < 20; i++) {
      history.push(run(i, [
        { key: 'A#t', status: i % 2 === 0 ? 'failed' : 'passed' }, // 50%
        { key: 'B#t', status: i % 4 === 0 ? 'failed' : 'passed' }, // 25%
        { key: 'C#t', status: 'passed' },
      ]));
    }
    const assessments = detectFlakes(history, {
      threshold: 0.05,
      minRuns: 20,
      windowDays: 90,
      now,
    });
    const top = topFlakiest(assessments, 2);
    expect(top.map((a) => a.key)).toEqual(['A#t', 'B#t']);
  });
});
