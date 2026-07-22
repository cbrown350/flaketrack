import type { FlakeAssessment, RunRecord, TestStatus } from '../types';

export interface DetectOptions {
  /** Fail rate above which a test is flagged flaky. */
  threshold: number;
  /** Minimum non-skipped runs before a test is evaluated. */
  minRuns: number;
  /** Rolling window length in days. */
  windowDays: number;
  /** Reference time for the window cutoff. Defaults to now. */
  now?: Date;
}

/**
 * Assess flakiness for every test seen in the history within the window.
 *
 * Flake rate = (failed + errored) / (total non-skipped). Skipped runs are
 * excluded from both numerator and denominator: a test that's often skipped
 * isn't flaky, it's disabled. We only flag a test as flaky when we have enough
 * data to trust the rate (sampleSize >= minRuns) — low-traffic repos that run
 * CI rarely will surface as `lowConfidence` instead of false-positive flaky.
 */
export function detectFlakes(
  history: RunRecord[],
  opts: DetectOptions,
): FlakeAssessment[] {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.windowDays * 86_400_000);
  const inWindow = history.filter((r) => new Date(r.timestamp) >= cutoff);

  const byKey = new Map<string, { status: TestStatus; ts: string }[]>();
  for (const run of inWindow) {
    for (const result of run.results) {
      let bucket = byKey.get(result.key);
      if (!bucket) {
        bucket = [];
        byKey.set(result.key, bucket);
      }
      bucket.push({ status: result.status, ts: run.timestamp });
    }
  }

  const assessments: FlakeAssessment[] = [];
  for (const [key, runs] of byKey) {
    const nonSkipped = runs.filter((r) => r.status !== 'skipped');
    const sampleSize = nonSkipped.length;
    const failures = nonSkipped.filter(
      (r) => r.status === 'failed' || r.status === 'errored',
    );
    const flakeRate = sampleSize === 0 ? 0 : failures.length / sampleSize;
    const lowConfidence = sampleSize < opts.minRuns;
    const isFlaky = !lowConfidence && flakeRate >= opts.threshold;
    assessments.push({
      key,
      className: key.includes('#') ? key.split('#')[0] : key,
      name: key.includes('#') ? key.slice(key.indexOf('#') + 1) : key,
      flakeRate,
      sampleSize,
      isFlaky,
      lowConfidence,
      recentFailures: failures
        .slice(-5)
        .map((f) => f.ts),
    });
  }
  return assessments;
}

export function topFlakiest(
  assessments: FlakeAssessment[],
  limit: number,
): FlakeAssessment[] {
  return [...assessments]
    .sort((a, b) => b.flakeRate - a.flakeRate || b.sampleSize - a.sampleSize)
    .slice(0, limit);
}
