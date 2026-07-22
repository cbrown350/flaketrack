import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectFlakes } from '../detect/flake';
import type { FlakeAssessment, RunRecord } from '../types';

/**
 * Static dashboard builder for GitHub Pages (gate condition: Pages artifact).
 *
 * Reads the committed run history, runs the same detection as the Action, and
 * emits a single self-contained index.html plus a machine-readable data.json.
 * Zero runtime dependencies, zero external requests — consistent with the
 * "no data leaves your repo" positioning. CSS is inline so Pages serves one
 * file with no asset fetches.
 *
 * Design direction (frontend-design): a calm incident-control room. Technical-
 * paper palette, ink-blue history bands, and a "signal strip" per test — a
 * horizontal bar whose fill ratio encodes the fail rate. That strip is the
 * one memorable element; everything else stays disciplined.
 */

export interface DashboardOptions {
  threshold: number;
  minRuns: number;
  windowDays: number;
  now?: Date;
  repoName?: string;
}

export interface DashboardSummary {
  totalTests: number;
  flakyTests: number;
  totalRuns: number;
  windowDays: number;
  generatedAt: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  flaky: FlakeAssessment[];
  lowConfidence: FlakeAssessment[];
}

export function dashboardData(history: RunRecord[], opts: DashboardOptions): DashboardData {
  const now = opts.now ?? new Date();
  const assessments = detectFlakes(history, {
    threshold: opts.threshold,
    minRuns: opts.minRuns,
    windowDays: opts.windowDays,
    now,
  });
  const flaky = assessments
    .filter((a) => a.isFlaky)
    .sort((a, b) => b.flakeRate - a.flakeRate || b.sampleSize - a.sampleSize);
  const lowConfidence = assessments
    .filter((a) => !a.isFlaky && a.lowConfidence)
    .sort((a, b) => b.flakeRate - a.flakeRate);
  return {
    summary: {
      totalTests: assessments.length,
      flakyTests: flaky.length,
      totalRuns: history.length,
      windowDays: opts.windowDays,
      generatedAt: now.toISOString(),
    },
    flaky,
    lowConfidence,
  };
}

export function buildDashboard(history: RunRecord[], opts: DashboardOptions): string {
  const data = dashboardData(history, opts);
  return renderHtml(data, opts.repoName ?? 'this repo');
}

export function writeDashboard(
  outDir: string,
  history: RunRecord[],
  opts: DashboardOptions,
): void {
  mkdirSync(outDir, { recursive: true });
  const html = buildDashboard(history, opts);
  writeFileSync(resolve(outDir, 'index.html'), html);
  writeFileSync(
    resolve(outDir, 'data.json'),
    JSON.stringify(dashboardData(history, opts), null, 2),
  );
}

function renderHtml(data: DashboardData, repoName: string): string {
  const s = data.summary;
  const repo = esc(repoName);
  const generated = esc(s.generatedAt);

  const flakyNumClass = s.flakyTests > 0 ? 'stat-num signal' : 'stat-num';
  const stats = `
    <section class="stats" aria-label="Summary">
      <div class="stat"><span class="${flakyNumClass}">${s.flakyTests}</span><span class="stat-label">flaky tests</span></div>
      <div class="stat"><span class="stat-num">${s.totalTests}</span><span class="stat-label">tests tracked</span></div>
      <div class="stat"><span class="stat-num">${s.totalRuns}</span><span class="stat-label">runs in window</span></div>
      <div class="stat"><span class="stat-num">${s.windowDays}d</span><span class="stat-label">rolling window</span></div>
    </section>`;

  const flakyRows = data.flaky
    .map((a) => testRow(a, true))
    .join('\n');

  const lowConfRows = data.lowConfidence.length
    ? `
      <section class="panel" aria-label="Low confidence tests">
        <h2 class="panel-title">Low confidence <span class="panel-count">${data.lowConfidence.length}</span></h2>
        <p class="panel-note">Too few samples to trust the rate yet. Listed for visibility, not flagged flaky.</p>
        <ul class="test-list">
          ${data.lowConfidence.map((a) => testRow(a, false)).join('\n')}
        </ul>
      </section>`
    : '';

  const flakyPanel = data.flaky.length
    ? `
      <section class="panel" aria-label="Flaky tests">
        <h2 class="panel-title">Flaky tests <span class="panel-count">${data.flaky.length}</span></h2>
        <ul class="test-list">
          ${flakyRows}
        </ul>
      </section>`
    : `
      <section class="panel empty" aria-label="No flaky tests">
        <h2 class="panel-title">No flaky tests detected</h2>
        <p class="panel-note">Every tracked test is passing consistently within the ${s.windowDays}-day window. Keep it up.</p>
      </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlakeTrack — ${repo}</title>
<style>
  :root {
    --paper: #f4f1ea;
    --paper-2: #ece7dc;
    --ink: #1a2230;
    --ink-soft: #4a5466;
    --rule: #c9c2b3;
    --ink-blue: #2b3a55;
    --signal: #b4341f;
    --signal-soft: #d9533a;
    --ok: #3f6b4a;
    --amber: #9a6a1a;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: 'Iowan Old Style', 'Palatino Linotype', 'Source Serif Pro', Georgia, serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 920px; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  header { border-bottom: 1px solid var(--rule); padding-bottom: 1.5rem; margin-bottom: 2rem; }
  .eyebrow {
    font-family: 'SF Mono', 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ink-soft); margin: 0 0 0.5rem;
  }
  h1 { font-size: 2.1rem; margin: 0 0 0.35rem; font-weight: 600; letter-spacing: -0.01em; }
  h1 .repo { color: var(--ink-blue); }
  .subtitle { color: var(--ink-soft); margin: 0; font-size: 0.95rem; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin: 2rem 0; }
  .stat { background: var(--paper); padding: 1rem 1.1rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .stat-num { font-size: 1.7rem; font-weight: 600; color: var(--ink-blue); line-height: 1; }
  .stat-num.signal { color: var(--signal); }
  .stat-label { font-family: ui-monospace, monospace; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); }
  .panel { margin: 2.5rem 0; }
  .panel-title { font-size: 1.15rem; margin: 0 0 0.75rem; font-weight: 600; display: flex; align-items: baseline; gap: 0.6rem; }
  .panel-count { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--ink-soft); background: var(--paper-2); padding: 0.1rem 0.5rem; border-radius: 2px; }
  .panel-note { color: var(--ink-soft); font-size: 0.9rem; margin: 0 0 1rem; }
  .test-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
  .test-row { padding: 1rem 0; border-bottom: 1px solid var(--rule); display: grid; grid-template-columns: 1fr auto; gap: 0.5rem 1.5rem; align-items: baseline; }
  .test-key { font-family: ui-monospace, 'SF Mono', monospace; font-size: 0.92rem; word-break: break-all; }
  .test-meta { font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--ink-soft); white-space: nowrap; }
  .signal-strip { grid-column: 1 / -1; height: 6px; background: var(--paper-2); border-radius: 1px; overflow: hidden; margin-top: 0.4rem; position: relative; }
  .signal-fill { height: 100%; background: var(--signal); }
  .signal-fill.low { background: var(--amber); }
  .rate-badge { font-family: ui-monospace, monospace; font-size: 0.8rem; padding: 0.12rem 0.5rem; border-radius: 2px; }
  .rate-badge.flaky { color: var(--signal); background: rgba(180,52,31,0.08); }
  .rate-badge.low { color: var(--amber); background: rgba(154,106,26,0.1); }
  .empty .panel-note { font-size: 1rem; }
  footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--rule); font-family: ui-monospace, monospace; font-size: 0.72rem; color: var(--ink-soft); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
  footer a { color: var(--ink-blue); }
  @media (max-width: 600px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .test-row { grid-template-columns: 1fr; }
    .test-meta { white-space: normal; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  a:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--ink-blue); outline-offset: 2px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <p class="eyebrow">FlakeTrack · flakiness report</p>
      <h1><span class="repo">${repo}</span></h1>
      <p class="subtitle">Zero-backend flaky-test detection. Data stays in your repo.</p>
    </header>
    ${stats}
    ${flakyPanel}
    ${lowConfRows}
    <footer>
      <span>Generated ${generated} · window ${s.windowDays}d</span>
      <span><a href="https://github.com/cbrown350/flaketrack">FlakeTrack</a> · MIT</span>
    </footer>
  </div>
</body>
</html>`;
}

function testRow(a: FlakeAssessment, isFlaky: boolean): string {
  const ratePct = (a.flakeRate * 100).toFixed(1);
  const fillPct = Math.min(100, Math.max(0, a.flakeRate * 100)).toFixed(1);
  const badgeClass = isFlaky ? 'flaky' : 'low';
  const fillClass = isFlaky ? '' : 'low';
  const conf = a.lowConfidence ? 'low confidence' : `${a.sampleSize} samples`;
  return `      <li class="test-row">
        <span class="test-key">${esc(a.key)}</span>
        <span class="test-meta">${conf} · <span class="rate-badge ${badgeClass}">${ratePct}%</span></span>
        <div class="signal-strip" aria-label="Fail rate ${ratePct} percent"><div class="signal-fill ${fillClass}" style="width:${fillPct}%"></div></div>
      </li>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}