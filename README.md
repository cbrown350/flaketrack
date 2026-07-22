# FlakeTrack

**Detect, trend, and quarantine flaky tests — entirely inside your GitHub repo.**

No account. No server. No external service. No data leaves your repository.

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
name: FlakeTrack
on:
  workflow_run:
    workflows: ["Test"]
    types: [completed]

permissions:
  contents: write
  issues: write

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned-sha>
      - name: Download test reports
        uses: actions/download-artifact@<pinned-sha>
        with:
          name: junit-reports
          path: reports
      - uses: cbrown350/flaketrack@<pinned-sha>
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
`flaketrack-data` branch) and `issues: write` (to manage tracking issues). No
data leaves your org. Pin FlakeTrack to a commit SHA in your workflow.

## What FlakeTrack does *not* do (v0)

- No org-wide fleet dashboard (single repo only).
- No real-time alerts (Slack/Discord/webhooks).
- No auto-patching of your test source. The quarantine list is an artifact your
  CI consumes — FlakeTrack never mutates your test files.
- No non-JUnit ingestion at v0.

## License

MIT. Sponsored development welcome via the **Sponsor** button (GitHub Sponsors).
