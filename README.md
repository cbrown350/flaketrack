# FlakeTrack

**Detect, trend, and quarantine flaky tests using GitHub resources you control.**

No additional account. No server. No FlakeTrack-hosted database. GitHub stores the
history in your repository; its visibility follows your repository, Issue, and
Pages settings.

FlakeTrack is a GitHub Action that runs after your test step, ingests JUnit XML,
detects flaky tests, and stores the full history in your own repo — on a branch,
in Issues, and on a static dashboard published to GitHub Pages. It's the
[Upptime](https://github.com/upptime/upptime) pattern applied to flaky tests.

## Why

Flaky tests erode CI trust, waste compute on reruns, and mask real bugs. Teams
either ignore them (trust erodes further) or bolt on an expensive third-party
product that needs its own account, webhook, and access to your data. FlakeTrack
does the detection without any of that: it runs inside your CI job, on your
runner, writing to your repo.

## Quick start

```yaml
# .github/workflows/flaketrack.yml
# Run this only on trusted branches. Keep PR validation read-only.
name: FlakeTrack
on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - name: Run tests and write a JUnit report
        run: npm test -- --reporter=junit --outputFile=reports/junit.xml
      - uses: cbrown350/flaketrack@3cad8bbe5618f68a24fb3804b49155ee15b12b2e # v0.1.1
        with:
          junit-paths: 'reports/**/*.xml'
```

See [`docs/usage.md`](docs/usage.md) for the JUnit XML format, configuration
options, and the quarantine skip-list artifact.

## What FlakeTrack does

- Ingests JUnit XML from your test run (pytest, Jest, surefire, .NET, plain).
- Records per-test pass/fail history on a `flaketrack-data` branch.
- Flags tests whose fail rate crosses your threshold (default 5%) over the
  rolling window (default 90 days), **with a confidence floor** — low-traffic
  repos won't get false positives from small samples.
- Opens one tracking Issue per flaky test, updated at most once/day (digest, not
  spam).
- Emits a machine-readable quarantine skip-list artifact your CI can consume.
- Rebuilds a static flakiness dashboard on a nightly schedule, deployed to your
  GitHub Pages.

## Permissions FlakeTrack needs

FlakeTrack is **not** read-only. It writes to your repo. Full details in
[`SECURITY.md`](SECURITY.md), but in short: `contents: write` (to the
`flaketrack-data` branch) and `issues: write` (to manage tracking issues). GitHub
stores that data under your repository's own visibility settings; public Issues
or Pages can expose test identifiers. Pin FlakeTrack to a commit SHA in your
workflow. Do not grant this write token to jobs that execute untrusted fork code.

## What FlakeTrack does *not* do (v0)

- No org-wide fleet dashboard (single repo only).
- No real-time alerts (Slack/Discord/webhooks).
- No auto-patching of your test source. The quarantine list is an artifact your
  CI consumes — FlakeTrack never mutates your test files.
- No non-JUnit ingestion at v0.

## License

MIT. Sponsored development welcome via the **Sponsor** button (GitHub Sponsors).
