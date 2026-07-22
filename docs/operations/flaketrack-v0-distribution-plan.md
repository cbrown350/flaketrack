# FlakeTrack v0.1.1: no-budget distribution plan

**Window:** seven days beginning when `v0.1.1` is released, Marketplace-published, and the Pages dashboard is live.

**Stage:** pre-PMF. A repository visit, GitHub star, article view, or HN upvote is only attention. The meaningful event is a maintainer enabling FlakeTrack in a real CI workflow and allowing it to collect enough history to be useful.

## Decision

**Primary channel: GitHub repository discoverability, led by GitHub Marketplace.**

This is the only channel where a developer who already intends to improve CI reliability can discover, inspect, and install FlakeTrack in the same session. GitHub Marketplace publication requires a public repository, a root metadata file, and a tagged release; v0.1.1 satisfies the release prerequisite only once the release is actually published. Choose relevant Marketplace categories during publication.

Show HN and dev.to are supporting, time-boxed feedback channels, not the acquisition target. They can create a transient audience; GitHub is the durable installation surface. Do not create a chat community in week one. An empty community is worse than no community; use GitHub Issues and Discussions only if real users begin asking questions there.

## One weekly goal and decision thresholds

### North-star weekly goal

By the end of day 7, get **five distinct, non-FlakeTrack repositories** to add a workflow that invokes the published v0.1.1 SHA, and obtain **two evidence-backed return signals**: either the same external repository runs FlakeTrack on two different days, or its maintainer replies that it will keep the Action enabled after seeing its output.

The team may dogfood FlakeTrack on its own CI to verify the install path and dashboard, but it does **not** count toward these thresholds.

### Instrumentation ledger

No external analytics or account is required. Create a private, manually updated launch ledger (for example, a local issue or a maintainer-only spreadsheet) with one row per repository/contact. Record only public/reported data:

| Field | Definition |
| --- | --- |
| Date and source | `github-search`, `marketplace`, `show-hn`, `devto`, or `direct` |
| Repository URL | Destination repo; `self` for dogfood |
| Stage | `visit`, `question`, `workflow PR`, `installed`, `second-day run`, `retained`, `declined` |
| Evidence | Public workflow/PR link, maintainer confirmation, or incoming issue |
| Friction | Missing JUnit, permissions concern, setup confusion, false positive, feature request, praise |
| Follow-up owner/date | The individual responsible; target reply time under 24 hours |

Use GitHub **Insights → Traffic** once daily for unique visitors, clones, referrers, and popular content (the data window is limited to 14 days). Use it for source diagnosis only. Record GitHub Marketplace listing visibility and any inbound install evidence, but do not infer installations from stars, forks, dashboard views, or traffic. The Action has no installation telemetry by design.

### Day-7 outcome gates

| Outcome | Threshold | What it means | Next action |
| --- | ---: | --- | --- |
| **Promising** | ≥5 external repos installed **and** ≥2 return signals; at least 3 maintainers receive a response in <24h | A concrete CI-maintenance problem is pulling users through setup. | Keep GitHub as primary; publish a focused runner-specific install example that addresses the most repeated friction. Personally recruit 10 more adjacent maintainers in week 2. |
| **Learning, not PMF** | 1–4 external installs, or ≥5 serious conversations/PR attempts but <2 return signals | Interest exists, but setup, time-to-value, or positioning blocks retention. | Do 10 one-to-one follow-ups. Fix only the highest-frequency, observed obstacle; do not add channels or build a community. Run a small repeat experiment the following week. |
| **Failure signal** | 0 external installs **and** <3 substantive maintainer conversations after all launch actions, or installers abandon before a second run because of the same unresolved blocker | Current message or product path does not earn adoption. | Pause broad promotion. Interview every responder, reproduce the blocker in a public example repo, and re-launch only after a measurable change. Do not declare failure from low HN votes or low dev.to reads alone. |

**Guardrail:** A workflow must use the released full commit SHA to count as installed. A star, fork, npm install, copied YAML with no execution, or one-time experiment does not count as retention.

## Release-day prerequisites: do before any public distribution

1. **Release surface (owner: release operator)**
   - Publish annotated `v0.1.1`, verify the GitHub Release exists, and confirm the generated release notes accurately state v0 limits: JUnit only, per-repository history, write permissions, optional Issues/quarantine, no external service.
   - Publish the root `action.yml` Action to GitHub Marketplace from the v0.1.1 release. Select categories that match its job; confirm the Marketplace page renders the description, branding, inputs, and action usage correctly.
   - Make the short install path work with the **full v0.1.1 commit SHA**, not only a mutable tag. The README already leads with this security expectation; every launch asset must do the same.
   - Run the workflow in FlakeTrack itself. Verify: JUnit is ingested, `flaketrack-data` is created/updated without a force push, job summary is understandable, and GitHub Pages dashboard is reachable. Label all of this `dogfood`, never customer traction.

2. **GitHub discovery checklist (owner: repository maintainer)**
   - Update repository About with the plain-language description and homepage URL pointing to the live Pages dashboard or documentation landing page. Add up to 20 precise topics, beginning with: `github-actions`, `junit`, `flaky-tests`, `test-automation`, `continuous-integration`, `ci-cd`, `testing`, `github-pages`, `pytest`, `jest`, and `java`. Add only terms the Action genuinely supports.
   - Add a repository social-preview image that shows the product name, `JUnit flaky-test detection`, and `no external service`; inspect it on a test share.
   - Pin the Quick Start at the README top (already present), then add/review anchors for: JUnit report examples, exact permissions and why they are required, what writes occur, dashboard URL, limitations, security policy, and the full SHA usage example.
   - Add one GitHub Discussion category or a clearly labelled issue template only if a maintainer commits to reply within one business day. Otherwise use existing Issues with labels `question`, `setup`, `junit-runner`, `permissions`, `false-positive`, and `feedback`.
   - Verify README links, action metadata, Pages URL, Marketplace page, and release download from a logged-out browser session. A user who cannot complete a first run is not a lead.

3. **Prepare response material, not marketing automation (owner: launch operator)**
   - Keep a one-page answer bank grounded in observed behavior: why write permissions are needed, how the orphan data branch behaves, why `min-runs` prevents small-sample false positives, JUnit support, and why quarantine is an output rather than source mutation.
   - Prepare three runner-specific copy/paste examples: pytest, Jest, and Maven/Gradle. Each must show where JUnit XML is produced, then the pinned Action invocation. Test every snippet in an example repository before publishing.
   - Set a launch-response rota: check GitHub/HN/dev.to twice daily for days 0–2, daily for days 3–7; reply personally, substantively, and within 24 hours. Classify each incoming item in the ledger. Do not use canned promotional replies.

## Seven-day sequence

### Day 0 — ship an installable artifact; establish the baseline

1. Complete every release-day prerequisite above. Do not distribute an unreleased Action or a dashboard with demo-only claims presented as production data.
2. Capture baseline GitHub Traffic (visitors, clones, referrers, popular content), star count, fork count, open issues, Marketplace listing URL, and dashboard URL in the ledger. These are diagnostics, not success metrics.
3. Create a factual launch FAQ in the GitHub repository (Discussion if staffed; otherwise an issue) covering permissions, JUnit report locations, retention window, privacy/no-backend design, and v0 exclusions. Link it from the README.
4. Identify 10–15 public repositories maintained by people the team can contact honestly where all are true: they run GitHub Actions, produce or can easily produce JUnit XML, have a recent CI failure/retry discussion or visible test maintenance, and are not security-sensitive. This is manual research, not bulk scraping.
5. Write a one-sentence individualized reason FlakeTrack may fit each repository. Do not send generic cold messages or open unsolicited promotional Issues/PRs in strangers’ repositories.

**Day-0 exit criterion:** an unaffiliated developer can see the listing, follow a runner-specific example, and reproduce a dogfooded first run in a clean public sample repository.

### Day 1 — direct GitHub validation first

1. Send at most five individualized, permission-respecting outreach messages through an appropriate existing public contact route (for example, a maintainer email listed in the repository or a reply to a thread where they invited contact). State why their CI is a fit, disclose that FlakeTrack is new, offer help with JUnit setup, and ask for criticism rather than a star.
2. Offer to validate their configuration in a throwaway/example repository or review a workflow snippet they voluntarily share. Do **not** request repository write access, secrets, test artifacts, or private CI logs.
3. For any willing maintainer, stay with the install until the first output is understood. Record the exact first blocker and time from first reply to first run.
4. Close the loop on every response, including “not now.” A decline with a clear reason is useful evidence.

**Target:** two substantive maintainer conversations, one workflow PR or completed installation attempt. If neither occurs, rewrite the first-sentence value proposition and identify whether the list lacked actual JUnit users before expanding outreach.

### Day 2 — publish Show HN only if the project is ready to be tried

**Preflight:** The maintainer posting must have personally built the project, be able to answer technical questions all day, and write the title/body/replies in their own words. HN rules prohibit vote/comment solicitation and AI-generated or AI-edited HN text. If the account is new or restricted, do not circumvent it; delay Show HN and continue GitHub/direct validation.

1. Submit one factual post: `Show HN: FlakeTrack – JUnit flaky-test detection that keeps its history in your GitHub repo` (adjust only for accuracy and the author’s own phrasing).
2. Link directly to the working GitHub repository/Marketplace installation path, not a signup page. In the body, explain the technical tradeoff: FlakeTrack writes an orphan history branch and optionally issues, needs `contents: write`/`issues: write`, and intentionally avoids an external service. Include the live dashboard link with clear labelling of whose data it shows.
3. Frame the ask as a request for specific technical criticism: runner compatibility, permission model, confidence threshold, and whether the output changes flaky-test triage. Do not ask for votes, stars, shares, or comments; do not coordinate engagement.
4. Respond in the poster’s own words to every substantive question before the thread cools. Log links and classify objections. If a question reveals a mistake, acknowledge it publicly and create the GitHub issue with a link.

**HN success diagnostic:** ≥3 substantive technical exchanges and ≥1 external maintainer who enters the ledger as a conversation, workflow PR, or installed. **HN non-signal:** page rank/upvotes alone. If attention produces zero install attempts, narrow the message or installation path rather than reposting.

### Day 3 — dev.to as a searchable implementation guide

1. Publish a practical article, not a release announcement: **“Make flaky JUnit tests visible in GitHub Actions without another service.”** The article should begin with an actual failure mode, then show a complete tested setup for one runner, explain permissions/data branch/quarantine tradeoffs, provide the dashboard screenshot/link, and name v0 limits.
2. Include a source attribution parameter on the GitHub/Marketplace link (for example `?utm_source=devto&utm_medium=article&utm_campaign=v0-launch`) and mark the article/repository relationship transparently. Use no more than four relevant tags such as `githubactions`, `testing`, `devops`, and `opensource`.
3. End with a narrow feedback request: “Which JUnit-producing runner or permission restriction stops you from trying this?” Reply personally within 24 hours and move reproducible problems to GitHub Issues.
4. Do not cross-post identical text to multiple communities, pay for boosts, or manufacture comments. The article exists to let a searcher self-qualify and to surface setup friction.

**dev.to success diagnostic:** ≥1 documented inbound maintainer conversation or install attempt attributable to the article. **Failure diagnostic:** views without a single setup question/click/attempt; revise the problem framing and example rather than publishing more generic articles.

### Day 4 — convert feedback into a single friction report

1. Review the ledger with the product/release owner. Group every interaction into `bug`, `confusion`, `permission objection`, `missing runner/example`, `false-positive concern`, `feature request`, or `praise`.
2. Call or write one-to-one follow-ups to every installer/near-installer: “What happened after the first result? What would make this stay in CI for 30 days?” Ask permission before quoting them publicly.
3. Identify the most frequent blocker, quantify it (for example, 4 of 6 attempts lacked an obvious artifact/JUnit handoff), and give it one owner and an expected fix date. Do not build features requested by one person unless it blocks a target cohort.
4. Update the launch FAQ or runner example only after it has been verified. Note the update in the original HN/dev.to thread when relevant; do not create a new promotional post.

**Target:** 100% of substantive inbound messages have a human response and classification; at least one evidence-backed improvement decision.

### Day 5 — second direct cohort; test retention rather than reach

1. Contact the remaining five to ten carefully selected maintainers individually, incorporating day-1–4 learning. Keep the cap at 10 new messages; relevance and response quality matter more than volume.
2. Re-contact only people who already opted in or responded. Offer hands-on configuration help and a short check-in after their next scheduled CI run.
3. Ask each installer to leave FlakeTrack enabled through at least one subsequent test run. A first run is onboarding; a second-day run is the first retention proxy.
4. Monitor all public surfaces. Answer questions, file actionable bugs, and thank contributors without pressuring them to endorse or promote the project.

**Target:** three external workflow PRs/installs cumulatively and one second-day run or explicit keep-enabled confirmation.

### Day 6 — make GitHub discovery durable

1. Inspect the previous days’ GitHub traffic referrers and popular content. If `README` gets attention but `docs/usage.md` does not, promote the one missing setup answer into the README. If a runner-specific page gets attention, improve that example. Do not optimize for raw visits.
2. Search GitHub manually for current, public, relevant repositories using combinations of JUnit test-report artifacts and GitHub Actions. Add at most five high-fit maintainers to the next week’s contact list, with the same evidence standard as day 0.
3. Verify Marketplace category/metadata/search presentation and test a fresh install from the listing. Address factual mismatch immediately, especially permissions or current version references.
4. Publish a small, factual GitHub Release/README update only if an observed user blocker was resolved. State what changed and who it helps; no “major momentum” language.

**Target:** every discovery surface has a clear route to a pinned, tested setup; no unresolved high-severity install blocker older than 48 hours.

### Day 7 — review, decide, and set week 2

1. Calculate the gate metrics: external installed repositories, external second-day runs/keep-enabled confirmations, substantive conversations, median first-response time, workflow PR-to-install conversion, and top friction category. Separate self-dogfood from external evidence.
2. Review the two cohort questions:
   - Did a maintainer get enough value from the report to keep it on?
   - Would they be materially disappointed if FlakeTrack stopped working after their next run?
3. Apply the day-7 outcome gate. Write one short decision record: continue the current GitHub-led loop, run a focused setup-friction experiment, or pause distribution to repair the core path.
4. Set the next weekly goal from observed conversion, not a vanity target. If promising, a defensible next goal is 10 external installs with four return signals. If not, the goal is to resolve and retest the top blocker with five specific maintainers—not “get more stars.”

## Draft assets and response rules

### Message scaffold for opt-in, high-fit maintainer outreach

Use only after adding a repository-specific observation, and do not automate it:

> I noticed `<repository>` runs `<runner>` in GitHub Actions and publishes/uses JUnit-style results. I built FlakeTrack, a new MIT Action that trends flaky tests in a repository-owned branch instead of sending results to a service. It needs write permissions, so I am looking for critical feedback rather than promotion. Would a tested `<runner>` example or a review of a workflow snippet be useful? If not, no follow-up needed.

Never claim the recipient has flaky tests, that other teams use the Action, that it is secure beyond documented facts, or that it will reduce CI cost. Never send the message as a GitHub Issue or pull request unless a maintainer explicitly asks for it.

### Show HN fact checklist

- `Show HN:` title; product is live and directly usable.
- Author personally made it and remains available for the discussion.
- Link to GitHub/Marketplace and the exact testable configuration; no waitlist or email gate.
- State the write permissions, data-branch behavior, no-backend model, and v0 constraints plainly.
- No fabricated adoption, testimonials, screenshots presented as customer data, coordinated voting, or requests for engagement.
- HN author writes the submission and replies personally; do not use AI-generated or AI-edited text there.

### dev.to article outline

1. The concrete CI failure mode: reruns hide intermittent failures and erode trust.
2. The constraint: retain test history without a new account/service or sending test data away.
3. A complete, tested JUnit + GitHub Actions walkthrough for one runner.
4. What gets written, why permissions are required, and how to pin by full SHA.
5. Threshold/minimum-runs tradeoff and optional issue/quarantine behavior.
6. Live dashboard link and v0 limitations.
7. One precise question asking readers about runner/setup friction.

## Operating risks and constraints

| Risk | Prevention |
| --- | --- |
| **Premature Show HN** | Post only after release, Marketplace, dashboard, SHA-pinned quick start, and dogfood are live. HN is unforgiving of a marketing page or an author who cannot answer implementation questions. One weak post is not evidence of demand. |
| **False traction from attention** | Stars, clones, upvotes, article views, and dashboard visits remain secondary diagnostics. Count only external workflow usage and a repeat/keep-enabled signal. |
| **Permission trust barrier** | Lead with the fact that the Action writes a dedicated data branch and optionally Issues. Link SECURITY.md; never minimize the permissions or ask for repo access. |
| **No telemetry by design** | Do not invent install numbers. Measure only public/inbound evidence and voluntary maintainer confirmations. Treat unknown installations as unknown. |
| **Wrong user cohort** | Prioritize maintainers with GitHub Actions plus JUnit output and a visible reliability/CI-maintenance need. Do not spray generic developer communities. |
| **Support collapse** | Limit direct outreach and distribution channels so every response receives a meaningful reply in under 24 hours. Pause promotion when this cannot be met. |
| **Empty community theater** | Do not launch Discord/Slack/Telegram in week one. GitHub Issues/Discussions are sufficient until recurring users prove a need for peer discussion. |
| **Feature thrash** | Use repeated observed friction to prioritize. A star or a single loud feature request is not roadmap evidence. |

## Sources used to shape channel constraints

- GitHub Marketplace publication requires a public repository, root action metadata, and a release; category selection supports discovery: [GitHub Actions documentation](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace).
- GitHub repository topics (up to 20), social preview, and 14-day Traffic insights support repository discovery and source diagnosis: [topics](https://docs.github.com/enterprise-cloud%40latest/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics), [social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview), [traffic](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository).
- Show HN must be something personally made and available to try; HN prohibits vote solicitation and prohibits generated/AI-edited submissions or comments: [Show HN guidelines](https://news.ycombinator.com/showhn.html), [HN guidelines](https://news.ycombinator.com/newsguidelines.html), [moderator guidance](https://news.ycombinator.com/item?id=22336638).
- dev.to/Forem supports canonical URLs, publication status, and up to four tags, useful for transparent, focused technical content: [Forem API documentation](https://developers.forem.com/api/v1).
