# FlakeTrack v0.1.0 launch-readiness review

**Reviewed:** 2026-07-22 UTC  
**Scope:** public GitHub release, Action delivery and reference behavior, CI dogfood, supply-chain controls, Dependabot, Pages dashboard, and operational caveats.  
**Verdict:** **Conditional GO.** The v0.1.0 release is public, executable, and provenance-attested; CI dogfooding and the public dashboard are working. Before recommending it as a hardened default, publish an immutable Action SHA reference, correct the default JUnit-path documentation, and enable branch/pinning policies.

This is an evidence review, not a release deployment. No source or workflow was changed.

## v0.1.1 resolution update

The findings below describe the v0.1.0 state at review time. v0.1.1 resolves
both P0 issues identified in this review: the dogfood workflow now uses the
immutable v0.1.0 commit SHA, and the Action fallback now discovers both
`**/junit*.xml` and `**/TEST-*.xml`. Its quick start also uses a complete,
trusted-branch workflow rather than `workflow_run`. The remaining policy,
data-integrity, and provenance-verification follow-ups remain open.

## Confirmed release facts

| Check | Status | Evidence |
|---|---|---|
| Public repository and release | Pass | `cbrown350/flaketrack` is public. GitHub Release [`v0.1.0`](https://github.com/cbrown350/flaketrack/releases/tag/v0.1.0) is published (not draft/prerelease) at 2026-07-22 22:41:07 UTC. |
| Release tag | Pass, with caveat | Annotated tag `v0.1.0` object `7817d945fb1432a57c7ff5031007465857a5210f` resolves to commit `5575f6a1fe9d25f5cf2796897a1113ab99743e91`. The tag is unsigned. |
| Release asset | Pass | Release contains `index.js` (1,502,226 bytes) with SHA-256 `ca15ec3bba2c94364b431a5b9d68159a27b871a5e7f4e068a86f84a277afad34`. That digest matches `dist/index.js` in the tagged source. |
| Release build | Pass | Release workflow run [29963660357](https://github.com/cbrown350/flaketrack/actions/runs/29963660357) completed successfully. It ran `npm ci` and `npm run all` before releasing. |
| Build provenance | Present, partially independently verified | GitHub's attestation API returned one SLSA v1 provenance attestation for the exact asset digest. Its signed certificate identity names `cbrown350/flaketrack/.github/workflows/release.yml` at `refs/tags/v0.1.0`; provenance records source commit `5575f6a1fe9d25f5cf2796897a1113ab99743e91` and the successful release run. See [GitHub's verification guidance](https://docs.github.com/en/actions/how-tos/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds). |
| CI baseline | Pass | Main CI run [29963827947](https://github.com/cbrown350/flaketrack/actions/runs/29963827947) passed typecheck, lint, tests, both builds, and artifact uploads. |

### Provenance verification limitation

The release asset digest and the attestation subject match. However, a local `gh attestation verify` attempt against this asset failed with `Error: verifying with issuer "sigstore.dev"`. Therefore this review does **not** claim an independently successful end-to-end CLI cryptographic verification. The recorded GitHub attestation metadata is strong evidence; resolve the CLI/Sigstore issuer compatibility issue and retain a successful verification transcript before making a stronger provenance claim.

The standard verification shape is:

```sh
gh attestation verify ./index.js \
  --repo cbrown350/flaketrack \
  --signer-workflow .github/workflows/release.yml
```

## Action reference behavior

- `action.yml` at `v0.1.0` is a Node 24 composite-free JavaScript Action whose entry point is `dist/index.js`.
- `uses: cbrown350/flaketrack@v0.1.0` resolves the repository tag at job start and executes the `dist/index.js` committed at that tag. GitHub Actions does **not** execute the separate release-asset download.
- The tag currently resolves to the v0.1.0 commit above, and the tagged Action bundle hash matches the release asset. This makes the release asset useful for audit/download, while the Action itself is delivered from the tag's repository tree.
- The current dogfood workflow references `cbrown350/flaketrack@v0.1.0`, and its successful run confirms that reference was usable by GitHub Actions.

**Security caveat:** a version tag is not immutable. The repository permits all Actions and does not require SHA pinning. GitHub recommends a full 40-character commit SHA because a compromised publisher can move or delete a tag. Prospective users should use:

```yaml
- uses: cbrown350/flaketrack@5575f6a1fe9d25f5cf2796897a1113ab99743e91 # v0.1.0
```

The README and usage guide already recommend SHA pinning but do not publish this release's ready-to-copy SHA. Add it to the release notes and quick-start example.

## CI dogfood and release-gate assessment

| Check | Status | Evidence / implication |
|---|---|---|
| Released Action dogfood | Pass | The `dogfood` job in successful CI run [29963827947](https://github.com/cbrown350/flaketrack/actions/runs/29963827947) ran `cbrown350/flaketrack@v0.1.0` on FlakeTrack's own JUnit reports. |
| History persistence | Pass | The public `flaketrack-data` branch exists and its latest record is for that dogfood run. It contained 10 nonempty history records at review time. |
| Required permissions | Deliberate, broad | The dogfood job grants `contents: write` and `issues: write`, which is required to append history and manage issue tracking. The normal CI job remains `contents: read`. |
| Release-time gate | Gap | The v0.1.0 tag's own `ci.yml` used `uses: ./`. The remote `@v0.1.0` dogfood pin was committed only after the tag, on main commit `d3734442f8595497f34cabd672c2ff836bb1b2e3`. It validates the published release after publication, not as a prerequisite gate for that release. |
| Failure behavior | Caution | History appends retry non-fast-forward failures and then drop a run rather than force-push. This protects history from clobbering, but it can silently make trend data incomplete because the Action warns and succeeds. |

## Workflow and dependency controls

### Pinned Actions

All third-party `uses:` references in CI, release, and dashboard workflows are full commit SHAs: checkout, setup-node, artifact upload/download, Pages configuration/upload/deploy, and build-provenance attestation. This is good supply-chain practice.

**Policy gap:** repository Actions policy reports `allowed_actions: all` and `sha_pinning_required: false`. The current workflow source is safely pinned by convention, but a future unpinned Action is not prevented by repository policy.

### Dependabot

`.github/dependabot.yml` is validly configured for weekly npm and GitHub Actions version updates, with a five-PR limit and production/development dependency grouping. Dependabot is active in practice: version-update runs and related pull requests were created during this review, and their CI runs passed.

Repository security metadata reports `dependabot_security_updates: disabled`. Version updates are therefore present, but GitHub will not automatically open security-update PRs from Dependabot alerts. This review did not establish whether the dependency graph has current alerts.

### Release workflow

The tag-triggered release workflow uses least practical permissions for its task: `contents: write`, `attestations: write`, and `id-token: write`. It performs a clean install and full quality/build command before attesting and attaching `dist/index.js`.

It has no automatic rollback workflow. If a release must be withdrawn, publish a corrected version, update security guidance to a known-good SHA, and do not move `v0.1.0`. Existing users pinned to a SHA will remain on that SHA until they deliberately upgrade.

## Dashboard availability and operational condition

| Check | Status | Evidence |
|---|---|---|
| Public Pages | Pass | [https://cbrown350.github.io/flaketrack/](https://cbrown350.github.io/flaketrack/) returned HTTP 200 over HTTPS. GitHub Pages is configured as public, workflow-built, and HTTPS-enforced. |
| Rendered content | Pass | Page title: `FlakeTrack — cbrown350/flaketrack`; the fetched page showed 0 flaky tests, 37 tracked tests, 7 runs, and a 90-day window. |
| Deployment workflow | Pass | Dashboard workflow uses pinned Actions, supports manual dispatch, and has a daily 03:00 UTC schedule. Its latest successful dispatch was [29962713893](https://github.com/cbrown350/flaketrack/actions/runs/29962713893). |
| Freshness | Expected delay, visible now | The rendered dashboard was last modified at 22:24 UTC and shows 7 runs, while the data branch had 10 records after the 22:43 UTC dogfood run. The dashboard is nightly/static, not live; it will remain stale until the next scheduled or manually dispatched rebuild. |
| Retention | Designed, not yet time-proven | The dashboard CLI is designed to prune records outside the configured 90-day window on rebuild. The project is new, so retention behavior over an actual expiry boundary has not been observed. |

No external uptime monitor, deployment smoke test, alert, or explicit dashboard freshness SLO is configured. Pages remains available through GitHub, but failures between daily runs could remain unnoticed.

## User-facing security and reliability caveats

1. **This Action is privileged.** It needs `contents: write` and `issues: write`; it creates/updates a `flaketrack-data` branch and Issues. Pin the exact Action SHA and grant no additional permissions.
2. **Do not give a write token to untrusted code.** The quick start uses `workflow_run`, a pattern that can receive a write-capable token. Keep test execution and report artifacts from forks/untrusted pull requests separate from the privileged tracking workflow, and validate the GitHub event model before enabling it for public contributions.
3. **History is public when the repository is public.** Test class names, test names, results, tracking Issues, and the Pages dashboard can expose internal identifiers. “No FlakeTrack server” does not make that data private. Disable/protect Pages or use a private repository when that metadata is sensitive.
4. **Data can be incomplete by design under contention.** After bounded retries, a history write is dropped with a warning. The Action does not fail the job, so teams that need complete compliance/audit data need to alert on this warning or use serialization.
5. **The data branch is unprotected and its commits are unsigned.** Anyone with repository write access can alter trend history; no branch rulesets are configured for `main` or `flaketrack-data` either. Treat metrics as operational signals, not tamper-evident audit evidence.
6. **Issue handling does not scale indefinitely.** Issue listing requests only the first 100 open `flaketrack`-labeled issues. Repositories with more than 100 simultaneously tracked flaky tests may get incomplete lifecycle handling.
7. **Default report-path documentation is inconsistent.** `action.yml` says a blank `junit-paths` also finds `TEST-*.xml`, while the runtime fallback and usage guide use only `**/junit*.xml`. A repository relying on default `TEST-*.xml` discovery can get a successful no-op with only a warning. Supply `junit-paths` explicitly until corrected.
8. **Input values are not validated by the Action.** Threshold, minimum-run, and window-day inputs are converted with `Number()` but have no enforced range/finite checks. Invalid configuration can produce unreliable assessment behavior.

## Required launch follow-ups

| Priority | Action | Why |
|---|---|---|
| P0 | Publish the exact v0.1.0 SHA in README/release notes; change dogfood and examples to full SHA pins. | Prevent a movable tag from becoming the effective trust boundary. |
| P0 | Correct the `TEST-*.xml` default mismatch or change metadata/docs to state the actual default. | Avoid successful runs that record no reports. |
| P1 | Require SHA-pinned Actions and protect `main`; decide whether `flaketrack-data` should also be protected with a narrowly scoped bot exception. | Make current secure convention enforceable and reduce history tampering. |
| P1 | Enable Dependabot security updates and review alerts. | Turn version-update hygiene into vulnerability-response hygiene. |
| P1 | Add post-deploy dashboard HTTP/smoke verification and a freshness check against the newest history record. | Detect an unavailable or stale public dashboard without manual inspection. |
| P2 | Make dropped history writes observable (annotation/metric or optional fail-on-drop) and document expected data-loss behavior. | Preserve safe no-force-push behavior while making data quality visible. |
| P2 | Resolve the `gh attestation verify` issuer failure and record a clean verification command in release evidence. | Upgrade provenance from metadata-confirmed to independently cryptographically verified. |

## What remains unverified

- Future daily scheduled Dashboard executions, retention pruning across a real 90-day cutoff, and GitHub Pages availability beyond this point-in-time HTTPS fetch.
- Cross-repository installation by an unaffiliated user, organization-specific token restrictions, and any consumer workflow's permissions/event safety.
- Dependabot alert state and package-vulnerability absence; only the configuration and the repository's disabled security-update setting were checked.
- A successful local GitHub CLI cryptographic attestation verification, as described above.
- Reproducibility of the release bundle from an independently controlled build environment; the release workflow passed and attestation links it to source, but no independent rebuild-and-byte-compare was performed.

## Operational posture

There is no server, database, or Cloudflare resource to operate. The production footprint is GitHub Actions, repository branches/Issues, release assets and GitHub Pages. A normal CI run completed in about 39 seconds, the post-release dogfood job in about 7 seconds, the release job in about 46 seconds, and the last dashboard deployment in about 24 seconds. The cost and operational burden are therefore low; the remaining launch risk is supply-chain policy, data correctness/freshness, and safe use of the write-capable GitHub token rather than infrastructure capacity.
