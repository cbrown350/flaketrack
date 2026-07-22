require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __nccwpck_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__nccwpck_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nccwpck_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// ESM COMPAT FLAG
__nccwpck_require__.r(__webpack_exports__);

// EXPORTS
__nccwpck_require__.d(__webpack_exports__, {
  parseJsonl: () => (/* binding */ parseJsonl),
  pruneHistory: () => (/* binding */ pruneHistory),
  readHistory: () => (/* binding */ readHistory)
});

;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = require("node:child_process");
;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = require("node:fs");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = require("node:path");
;// CONCATENATED MODULE: ./src/detect/flake.ts
/**
 * Assess flakiness for every test seen in the history within the window.
 *
 * Flake rate = (failed + errored) / (total non-skipped). Skipped runs are
 * excluded from both numerator and denominator: a test that's often skipped
 * isn't flaky, it's disabled. We only flag a test as flaky when we have enough
 * data to trust the rate (sampleSize >= minRuns) — low-traffic repos that run
 * CI rarely will surface as `lowConfidence` instead of false-positive flaky.
 */
function detectFlakes(history, opts) {
    const now = opts.now ?? new Date();
    const cutoff = new Date(now.getTime() - opts.windowDays * 86_400_000);
    const inWindow = history.filter((r) => new Date(r.timestamp) >= cutoff);
    const byKey = new Map();
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
    const assessments = [];
    for (const [key, runs] of byKey) {
        const nonSkipped = runs.filter((r) => r.status !== 'skipped');
        const sampleSize = nonSkipped.length;
        const failures = nonSkipped.filter((r) => r.status === 'failed' || r.status === 'errored');
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
function topFlakiest(assessments, limit) {
    return [...assessments]
        .sort((a, b) => b.flakeRate - a.flakeRate || b.sampleSize - a.sampleSize)
        .slice(0, limit);
}

;// CONCATENATED MODULE: ./src/dashboard/build.ts



function dashboardData(history, opts) {
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
function buildDashboard(history, opts) {
    const data = dashboardData(history, opts);
    return renderHtml(data, opts.repoName ?? 'this repo');
}
function writeDashboard(outDir, history, opts) {
    (0,external_node_fs_namespaceObject.mkdirSync)(outDir, { recursive: true });
    const html = buildDashboard(history, opts);
    (0,external_node_fs_namespaceObject.writeFileSync)((0,external_node_path_namespaceObject.resolve)(outDir, 'index.html'), html);
    (0,external_node_fs_namespaceObject.writeFileSync)((0,external_node_path_namespaceObject.resolve)(outDir, 'data.json'), JSON.stringify(dashboardData(history, opts), null, 2));
}
function renderHtml(data, repoName) {
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
function testRow(a, isFlaky) {
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
function esc(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

;// CONCATENATED MODULE: ./src/dashboard/cli.ts




/**
 * Dashboard CLI entrypoint. Invoked by .github/workflows/dashboard.yml as
 * `node dist/dashboard.js`. Reads run history from the flaketrack-data branch
 * (or a local file), rebuilds the static site, and prunes history older than
 * the window (gate condition #4: bounded history on every tier).
 *
 * This is a separate ncc entrypoint from the Action so the nightly Pages build
 * doesn't pull the Action's runtime deps into its bundle path.
 */
function main() {
    const args = parseArgs(process.argv.slice(2));
    const windowDays = args['window-days'] ? Number(args['window-days']) : 90;
    const threshold = args['threshold'] ? Number(args['threshold']) : 0.05;
    const minRuns = args['min-runs'] ? Number(args['min-runs']) : 20;
    const outDir = (0,external_node_path_namespaceObject.resolve)(args['out-dir'] ?? 'dashboard-out');
    const repoName = args['repo-name'] ?? process.env.GITHUB_REPOSITORY ?? 'this repo';
    const branch = args['data-branch'] ?? 'flaketrack-data';
    const historyFile = args['history-file'] ?? 'history.jsonl';
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const history = readHistory(workspace, branch, historyFile);
    process.stdout.write(`FlakeTrack dashboard: ${history.length} run(s) from branch ${branch}.\n`);
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
    }
    catch (e) {
        process.stderr.write(`FlakeTrack prune skipped: ${e.message}\n`);
    }
}
function readHistory(workspace, branch, historyFile) {
    // Try the committed data branch first.
    const blob = readBranchBlob(workspace, branch, historyFile);
    const raw = blob ?? readLocalFile((0,external_node_path_namespaceObject.resolve)(workspace, historyFile));
    if (!raw)
        return [];
    return parseJsonl(raw);
}
function readBranchBlob(workspace, branch, path) {
    // actions/checkout fetches all branches under refs/remotes/origin/* but only
    // checks out HEAD, so a local `flaketrack-data` ref may not exist even though
    // origin/flaketrack-data does. Try local first, then the remote-tracking ref.
    for (const ref of [branch, `${'origin'}/${branch}`]) {
        try {
            return (0,external_node_child_process_namespaceObject.execFileSync)('git', ['show', `${ref}:${path}`], {
                cwd: workspace,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            });
        }
        catch {
            // try next ref
        }
    }
    return null;
}
function readLocalFile(path) {
    return (0,external_node_fs_namespaceObject.existsSync)(path) ? (0,external_node_fs_namespaceObject.readFileSync)(path, 'utf8') : null;
}
function parseJsonl(raw) {
    const records = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            records.push(JSON.parse(trimmed));
        }
        catch {
            // skip malformed line — one bad record shouldn't break the dashboard
        }
    }
    return records;
}
function pruneHistory(workspace, branch, historyFile, history, windowDays) {
    const cutoff = new Date(Date.now() - windowDays * 86_400_000);
    const kept = history.filter((r) => new Date(r.timestamp) >= cutoff);
    if (kept.length === history.length)
        return; // nothing to prune
    // Write the pruned file back to the data branch via a temp worktree, same
    // fetch/commit/push discipline as the history writer. Failure here is logged
    // by the caller; the Pages deploy proceeds with whatever we rendered.
    (0,external_node_child_process_namespaceObject.execFileSync)('git', ['stash', '-u'], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    try {
        (0,external_node_child_process_namespaceObject.execFileSync)('git', ['checkout', branch], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
        writePruned(workspace, historyFile, kept);
        (0,external_node_child_process_namespaceObject.execFileSync)('git', ['commit', '-am', `prune history older than ${windowDays}d`], {
            cwd: workspace,
            encoding: 'utf8',
            stdio: ['ignore', 'ignore', 'ignore'],
        });
        (0,external_node_child_process_namespaceObject.execFileSync)('git', ['push', 'origin', branch], {
            cwd: workspace,
            encoding: 'utf8',
            stdio: ['ignore', 'ignore', 'ignore'],
        });
        process.stdout.write(`FlakeTrack prune: kept ${kept.length}/${history.length} records.\n`);
    }
    finally {
        (0,external_node_child_process_namespaceObject.execFileSync)('git', ['checkout', '-'], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
        try {
            (0,external_node_child_process_namespaceObject.execFileSync)('git', ['stash', 'pop'], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
        }
        catch {
            // no stash to pop — fine
        }
    }
}
function writePruned(workspace, historyFile, kept) {
    const lines = kept.map((r) => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : '');
    (0,external_node_fs_namespaceObject.writeFileSync)((0,external_node_path_namespaceObject.resolve)(workspace, historyFile), lines);
}
function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const eq = arg.match(/^--([^=]+)=(.*)$/);
        if (eq) {
            out[eq[1]] = eq[2];
            continue;
        }
        const space = arg.match(/^--(.+)$/);
        if (space && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
            out[space[1]] = argv[++i];
        }
    }
    return out;
}
main();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=index.js.map