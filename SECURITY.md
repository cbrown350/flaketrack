# FlakeTrack Security & Permissions

## Permissions FlakeTrack needs, and why

FlakeTrack is not a read-only tool. It writes to your repository. Stating that
plainly is the only credibility lever a new publisher has, so here is exactly
what it does.

| Permission | Scope | Why |
|---|---|---|
| `contents: write` | the `flaketrack-data` orphan branch only | Append per-test pass/fail history records. |
| `issues: write` | Issues labeled `flaketrack` | Open, update (at most once/day per test), and close tracking issues for flaky tests. |
| `actions: read` | workflow metadata | Read the workflow run context (commit SHA, branch, actor). |

FlakeTrack does **not** request, and will never request: `pull-requests: write`,
`packages`, `deployments`, `checks: write` beyond the run itself, or access to
any secret beyond the ambient `GITHUB_TOKEN` the Action run already has.

## Data

- All test history is committed to a branch **in your own repository**.
- There is no FlakeTrack server, account, or external database. GitHub stores
  the history, Issues, and any Pages dashboard under your repository's own
  visibility settings; public repositories, Issues, or Pages can expose test
  identifiers and results.

## Supply-chain hygiene

In the interest of full disclosure post-[CVE-2025-30066](https://github.com/tj-actions/changed-files/security/advisories/GHSA-mw4p-6x4p-x5m5)
(the `tj-actions/changed-files` supply-chain attack), every third-party Action
referenced inside FlakeTrack's own workflows is pinned to a **commit SHA**, not
a floating tag. Release builds publish [build provenance](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds)
via `actions/attest-build-provenance`. The runtime dependency tree is kept
deliberately small and is audited on every release.

## Reporting a vulnerability

Please open a private security advisory: GitHub tab → **Security** →
**Report a vulnerability**. Do not open a public issue for security reports.
