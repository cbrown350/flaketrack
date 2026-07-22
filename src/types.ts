export interface TestCase {
  className: string;
  name: string;
  /** Wall-clock duration in milliseconds. */
  time: number;
  /** 'passed' | 'failed' | 'errored' | 'skipped'. */
  status: TestStatus;
}

export type TestStatus = 'passed' | 'failed' | 'errored' | 'skipped';

export interface TestRun {
  /** Stable identity for the test: `${className}#${name}`. */
  key: string;
  className: string;
  name: string;
  status: TestStatus;
  time: number;
  /** ISO 8601 timestamp of the CI run. */
  timestamp: string;
  /** Commit SHA the run executed against. */
  sha: string;
  /** Workflow run id. */
  runId: string;
}

export interface RunRecord {
  timestamp: string;
  sha: string;
  runId: string;
  results: { key: string; status: TestStatus; time: number }[];
}

export interface FlakeAssessment {
  key: string;
  className: string;
  name: string;
  /** Fail rate over the window (failed+errored) / (total non-skipped). */
  flakeRate: number;
  /** Number of non-skipped runs in the window. */
  sampleSize: number;
  /** True if sampleSize >= minRuns AND flakeRate >= threshold. */
  isFlaky: boolean;
  /** True if sampleSize < minRuns — too little data to trust the rate. */
  lowConfidence: boolean;
  recentFailures: string[];
}
