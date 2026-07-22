import * as core from '@actions/core';
import { globSync } from 'glob';
import { readFileSync } from 'node:fs';
import { parseJUnitXml } from './ingest/junit';
import { detectFlakes, topFlakiest } from './detect/flake';
import { emitQuarantineList, quarantineToMarkdown } from './quarantine/emit';
import { syncIssues, trackerFromEnv } from './issues/digest';
import { GitWriter } from './history/git-writer';
import type { RunRecord, TestStatus } from './types';

/**
 * FlakeTrack Action entry point. Runs inside the customer's CI job:
 *   1. ingest JUnit XML reports (from configured glob)
 *   2. read committed history from the flaketrack-data branch
 *   3. compute flake assessments with a confidence floor
 *   4. append this run's results to history (concurrent-write-safe)
 *   5. emit a quarantine-list artifact for the user's CI to consume
 *   6. surface a summary of the top-N flakiest tests
 *
 * This Action is deliberately read-only with respect to test SOURCE: it never
 * mutates the customer's test files. It writes only to the flaketrack-data
 * branch and emits artifacts. (Gate condition #6 + cycle-2 CTO scoping.)
 */
export async function run(): Promise<void> {
  const junitGlob = core.getInput('junit-paths') || '**/junit*.xml,**/TEST-*.xml';
  const threshold = Number(core.getInput('flake-threshold') || 0.05);
  const minRuns = Number(core.getInput('min-runs') || 20);
  const windowDays = Number(core.getInput('window-days') || 90);
  const branch = core.getInput('data-branch') || 'flaketrack-data';

  const files = resolveGlob(junitGlob);
  core.info(`FlakeTrack: found ${files.length} JUnit report file(s) for ${junitGlob}`);
  if (files.length === 0) {
    core.warning('No JUnit XML files matched junit-paths; nothing to record.');
    return;
  }

  const cases = files.flatMap((f) => {
    try {
      return parseJUnitXml(readFileSync(f, 'utf8'));
    } catch (e) {
      core.warning(`Failed to parse ${f}: ${(e as Error).message}`);
      return [];
    }
  });

  const sha = process.env.GITHUB_SHA ?? 'unknown';
  const runId = process.env.GITHUB_RUN_ID ?? '0';
  const timestamp = new Date().toISOString();

  const record: RunRecord = {
    timestamp,
    sha,
    runId,
    results: cases.map((c) => ({
      key: `${c.className}#${c.name}`,
      status: c.status as TestStatus,
      time: c.time,
    })),
  };

  // Append this run to history (concurrent-write-safe). Failures here are
  // logged but non-fatal: detection still works against whatever history we
  // have, and a dropped run is preferable to a hung or force-pushing CI job.
  const writer = new GitWriter({
    repoDir: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    branch,
  });
  const wrote = await writer.appendRun(record).catch((e: unknown) => {
    core.warning(`History append failed: ${(e as Error).message}`);
    return false;
  });
  if (!wrote) {
    core.warning('This run was not written to history (dropped after retries).');
  }

  // Detection over the history we have. In a fresh install this is just the
  // current run; flakiness surfaces as history accumulates.
  const history = writer.readHistory();
  const assessments = detectFlakes(history, { threshold, minRuns, windowDays });
  const top = topFlakiest(assessments, 10);

  // Sync tracking issues (daily-digest, gate condition #5). No-op when running
  // outside a GitHub Actions context (no token/repo), so local smoke tests and
  // the dogfood dashboard build don't spam the Issue tracker.
  const tracker = trackerFromEnv();
  if (tracker) {
    const digest = await syncIssues(tracker, assessments).catch((e: unknown) => {
      core.warning(`Issue digest sync failed: ${(e as Error).message}`);
      return { opened: 0, updated: 0, closed: 0 };
    });
    core.info(
      `FlakeTrack issues: ${digest.opened} opened, ${digest.updated} updated, ${digest.closed} closed.`,
    );
  }

  // Emit the quarantine artifact (read-only output — no source mutation).
  const quarantine = emitQuarantineList(assessments);
  core.setOutput('quarantine-list', JSON.stringify(quarantine));
  core.summary.addRaw(quarantineToMarkdown(quarantine));
  if (top.length > 0) {
    core.summary
      .addHeading('Top flakiest tests', 2)
      .addTable([
        [{ data: 'Test', header: true }, { data: 'Fail rate', header: true }, { data: 'Samples', header: true }],
        ...top.map((a) => [
          `\`${a.key}\``,
          `${(a.flakeRate * 100).toFixed(1)}%${a.lowConfidence ? ' (low confidence)' : ''}`,
          String(a.sampleSize),
        ]),
      ]);
  }
  await core.summary.write();
}

function resolveGlob(pattern: string): string[] {
  try {
    const patterns = pattern.split(',').map((p) => p.trim()).filter(Boolean);
    return globSync(patterns);
  } catch {
    return [];
  }
}

run().catch((e: unknown) => {
  core.setFailed(`FlakeTrack failed: ${(e as Error).message}`);
});
