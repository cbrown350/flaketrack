# FlakeTrack v0.1.1 launch copy

## Show HN

Hacker News prohibits AI-generated or AI-edited submissions and comments. The
person who made FlakeTrack must write the submission and replies unaided; this
is a factual outline, not text to submit.

- Explain the problem: reruns can hide intermittent JUnit failures and erase
  the history needed to triage them.
- Describe the mechanism: FlakeTrack runs after a test step, stores per-test
  pass/fail history in an orphan branch in the same repository, applies a
  configurable failure-rate threshold after a minimum sample count, maintains
  one tracking Issue per flaky test, and emits a JSON quarantine list.
- State the tradeoff plainly: there is no FlakeTrack vendor account, server, or
  external database, but the Action needs `contents: write` to maintain its
  data branch and `issues: write` to maintain tracking Issues. It does not edit
  test source.
- Link the public project dashboard, labelled accurately: https://cbrown350.github.io/flaketrack/
  shows FlakeTrack's own dogfood history, not adopter data.
- Ask maintainers with recurring JUnit reports for concrete feedback on runner
  compatibility, permissions, and quarantine-list consumption.
- Link https://github.com/cbrown350/flaketrack and the v0.1.1 full commit SHA
  from its release notes. Do not ask for votes, stars, shares, or comments.

---

## dev.to draft

**Title**

Introducing FlakeTrack: repo-native flaky-test history for GitHub Actions

**Tags**

`githubactions`, `testing`, `ci`, `opensource`

**Canonical / primary link**

https://github.com/cbrown350/flaketrack

**Body**

Flaky tests damage the most useful property of CI: trust.

A red build that becomes green on retry is still a signal. The problem is that the signal is easy to lose when test results live only inside individual workflow runs.

Today I’m releasing **FlakeTrack v0.1.1**: a GitHub Action that turns JUnit XML into per-test history stored inside the repository that produced it.

## What it does

Run FlakeTrack after the job that produces JUnit XML. It:

- ingests one or more JUnit XML reports;
- writes per-test pass/fail history to an orphan branch in your repository (`flaketrack-data` by default);
- identifies tests whose failure rate exceeds your configured threshold, after a configurable minimum number of runs;
- can create and maintain one GitHub Issue per flaky test;
- emits a JSON quarantine list that a later CI step can use to filter or skip tests.

The repository also includes a separate workflow that can build a static dashboard on GitHub Pages from the history branch.

The Action does not modify test source. Quarantine is a machine-readable output, so the repository decides how to consume it.

```yaml
- uses: cbrown350/flaketrack@<full-40-char-sha> # v0.1.1
  with:
    junit-paths: 'reports/**/*.xml'
```

For production workflows, pin the Action to a full commit SHA. The repository includes the configuration and permissions details.

## The important boundary: public dashboard vs. your history

The FlakeTrack project has a public, static dashboard at:

https://cbrown350.github.io/flaketrack/

It shows FlakeTrack’s own test-history data. It is not a multi-tenant dashboard and does not expose adopter data.

When you use FlakeTrack, your project’s historical records are written to an orphan branch in **your own repository**. You may publish your own static dashboard from that repository, but it is separate from the public FlakeTrack dashboard.

## Why repo-native

FlakeTrack is for maintainers who want flaky-test tracking without creating a vendor account or operating another service.

There is no FlakeTrack server and no external database. The Action runs in GitHub Actions and writes to your repository. This does mean it is not read-only: it requires `contents: write` for its data branch, plus `issues: write` if you enable per-test issue tracking. Review those permissions, and pin third-party Actions to a commit SHA.

## v0 scope

v0.1.1 is deliberately narrow:

- JUnit XML input only;
- one repository at a time, not an organization-wide fleet view;
- no real-time Slack, Discord, or webhook alerts; and
- no automatic edits to test files.

It is dogfooded on FlakeTrack’s own CI. That is a starting point, not a claim of broad adoption.

## Try it or contribute

- Repository and setup guide: https://github.com/cbrown350/flaketrack
- Release reference: `cbrown350/flaketrack@<full-40-char-sha>` (v0.1.1)
- Public project dashboard: https://cbrown350.github.io/flaketrack/

FlakeTrack is MIT licensed. If it is useful, optional support is available through GitHub Sponsors; there are no paid tiers or support promises.

The most useful feedback now is concrete: JUnit formats that do not parse as expected, CI patterns that make history collection difficult, and how you would consume a quarantine list without hiding a real regression.
