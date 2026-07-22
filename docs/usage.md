# FlakeTrack usage guide

## JUnit XML format

FlakeTrack ingests JUnit XML — the de-facto standard test report format. Any
runner that emits `<testsuite>` / `<testcase>` elements works:

| Runner | How to emit JUnit XML |
|---|---|
| **Jest** | `jest --ci --reporters=default --reporters=jest-junit` (or `jest-junit` reporter with `JEST_JUNIT_OUTPUT_DIR=reports`) |
| **pytest** | `pytest --junitxml=reports/junit.xml` |
| **Maven surefire** | `mvn test -Dmaven-surefire-plugin.version=3.5 -DreportFormat=xml` (surefire writes to `target/surefire-reports/`) |
| **Gradle** | `test { useJUnitPlatform(); reports.junitXml.outputLocation.set(file('reports')) }` |
| **.NET** | `dotnet test --logger "junit;LogFilePath=reports/junit.xml"` (via the `JunitXml.TestLogger` package) |
| **Go** | `go test -v 2>&1 | go-junit-report > reports/junit.xml` |

A single report or many reports both work — FlakeTrack globs `junit-paths` and
ingests every match.

## Inputs

| Input | Default | Purpose |
|---|---|---|
| `junit-paths` | `**/junit*.xml` | Comma-separated glob(s) for JUnit XML files. |
| `data-branch` | `flaketrack-data` | Orphan branch where run history is stored. |
| `flake-threshold` | `0.05` | Fail rate above which a test is flagged flaky (0–1). |
| `min-runs` | `20` | Minimum runs in the window before a test is evaluated (confidence floor). |
| `window-days` | `90` | Rolling window for flake-rate computation and history retention. |

## Outputs

| Output | Type | Purpose |
|---|---|---|
| `quarantine-list` | JSON (action output) | Array of `{ key, flakeRate, sampleSize }` for tests at or above the threshold. Feed this to your test runner's skip/filter so flaky tests don't block PRs. |

The Action also writes a Markdown summary to the run's job summary, and opens
one tracking Issue per flaky test (updated at most once per day).

## The quarantine skip-list

FlakeTrack never mutates your test source. Instead it emits a machine-readable
list of flaky tests as an action output. A typical consumer step:

```yaml
- uses: cbrown350/flaketrack@<pinned-sha>
  id: flake
  with:
    junit-paths: 'reports/**/*.xml'
- name: Skip flaky tests in the next run
  run: |
    # Convert the quarantine list to a pytest deselect flag
    Q=$(echo '${{ steps.flake.outputs.quarantine-list }}' | jq -r '.[].key' | paste -sd, -)
    [ -n "$Q" ] && pytest --deselect "$Q" || pytest
```

## Branch model

FlakeTrack writes to an **orphan branch** (`flaketrack-data` by default) that
shares no history with your main branch. It never touches your source tree, your
main branch, or your tags. History is append-only JSONL, and concurrent
matrix/sharded-CI writes are safe — the writer fetches, appends, and retries on
non-fast-forward; it **never force-pushes**. If retries exhaust, the run is
dropped (logged), never clobbered.

## History retention

History is bounded to the rolling window (default 90 days). The nightly
dashboard job prunes records older than the window on every run, so the
`flaketrack-data` branch does not grow without limit on any tier.

## Pinning

Always pin FlakeTrack to a commit SHA in your workflow:

```yaml
- uses: cbrown350/flaketrack@<full-40-char-sha>
```

Releases are also attested with build provenance via GitHub Artifact Attestations.